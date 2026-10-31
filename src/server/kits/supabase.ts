import type { KitStore } from '@/contract/kit-store';
import type {
  KitMessage,
  KitSelection,
  KitVersion,
  PersonaId,
} from '@/contract/types';
import {
  kitMessageSchema,
  kitThreadSummarySchema,
  kitVersionSchema,
} from '@/contract/schemas';
import { createDb } from '@/server/db';

function versionFromRow(row: Record<string, unknown>): KitVersion {
  return kitVersionSchema.parse({
    threadId: row.thread_id,
    version: row.version,
    createdAt: new Date(String(row.created_at)).toISOString(),
    kind: row.kind,
    userText: row.user_text,
    plan: row.plan,
    excludedKeys: row.excluded_keys,
    status: row.status,
    options: row.options,
    explanation: row.explanation,
    diff: row.diff,
    selection: row.selection,
    followUp: row.follow_up,
  });
}

/** Durable history; requests never depend on another instance's process memory. */
export class SupabaseKitStore implements KitStore {
  constructor(private readonly db = createDb()) {}

  private async owned(threadId: string, owner: string) {
    const { data, error } = await this.db
      .from('kit_threads')
      .select('id, title, persona, updated_at, kit_versions(count)')
      .eq('id', threadId)
      .eq('owner', owner)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  private async requireOwned(threadId: string, owner: string) {
    if (!(await this.owned(threadId, owner)))
      throw new Error('Thread not found');
  }

  private async touch(threadId: string, owner: string, timestamp: string) {
    // A delayed older request must never move the history timestamp backwards.
    const { error } = await this.db
      .from('kit_threads')
      .update({ updated_at: timestamp })
      .eq('id', threadId)
      .eq('owner', owner)
      .lt('updated_at', timestamp);
    if (error) throw error;
  }

  async createThread(owner: string, title: string, persona: PersonaId) {
    const { data, error } = await this.db
      .from('kit_threads')
      .insert({ owner, title: title.slice(0, 60), persona })
      .select('id')
      .single();
    if (error) throw error;
    return { threadId: data.id as string };
  }

  async appendVersion(
    v: Omit<KitVersion, 'version' | 'createdAt'>,
    owner: string,
  ): Promise<KitVersion> {
    const { data, error } = await this.db.rpc('kitly_append_version', {
      p_owner: owner,
      p_version: v,
    });
    if (error) throw error;
    return kitVersionSchema.parse({
      ...v,
      version: data.version,
      createdAt: new Date(data.createdAt).toISOString(),
    });
  }

  async appendMessage(m: Omit<KitMessage, 'createdAt'>, owner: string) {
    await this.requireOwned(m.threadId, owner);
    const { data: version, error: readError } = await this.db
      .from('kit_versions')
      .select('id')
      .eq('thread_id', m.threadId)
      .eq('version', m.afterVersion)
      .maybeSingle();
    if (readError) throw readError;
    if (!version) throw new Error('Version not found');
    const { data, error } = await this.db
      .from('kit_messages')
      .insert({
        thread_id: m.threadId,
        after_version: m.afterVersion,
        user_text: m.userText,
        answer: m.answer,
        follow_up: m.followUp,
      })
      .select('created_at')
      .single();
    if (error) throw error;
    const message = kitMessageSchema.parse({
      ...m,
      createdAt: new Date(data.created_at).toISOString(),
    });
    await this.touch(m.threadId, owner, data.created_at);
    return message;
  }

  async saveSelection(
    threadId: string,
    owner: string,
    selection: KitSelection,
  ) {
    const { error } = await this.db.rpc('kitly_save_selection', {
      p_thread: threadId,
      p_owner: owner,
      p_selection: selection,
    });
    if (error) throw error;
  }

  async listThreads(owner: string) {
    const { data, error } = await this.db
      .from('kit_threads')
      .select('id, title, persona, updated_at, kit_versions(count)')
      .eq('owner', owner)
      .order('updated_at', { ascending: false })
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(30);
    if (error) throw error;
    return data.map((row) => this.summary(row));
  }

  async getThread(threadId: string, owner: string) {
    const { data: thread, error } = await this.db
      .from('kit_threads')
      .select('id,title,persona,updated_at,kit_versions(*),kit_messages(*)')
      .eq('id', threadId)
      .eq('owner', owner)
      .maybeSingle();
    if (error) throw error;
    if (!thread) return null;
    return {
      thread: this.summary({
        ...thread,
        kit_versions: [{ count: thread.kit_versions.length }],
      }),
      versions: thread.kit_versions
        .sort((a, b) => a.version - b.version)
        .map(versionFromRow),
      messages: thread.kit_messages
        .sort((a, b) => a.id - b.id)
        .map((row) =>
          kitMessageSchema.parse({
            threadId: row.thread_id,
            afterVersion: row.after_version,
            createdAt: new Date(row.created_at).toISOString(),
            userText: row.user_text,
            answer: row.answer,
            followUp: row.follow_up,
          }),
        ),
    };
  }

  private summary(row: Record<string, unknown>) {
    const counts = row.kit_versions as { count: number }[];
    return kitThreadSummarySchema.parse({
      id: row.id,
      title: row.title,
      persona: row.persona,
      updatedAt: new Date(String(row.updated_at)).toISOString(),
      versionCount: counts[0]?.count ?? 0,
    });
  }
}
