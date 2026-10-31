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
    await this.requireOwned(v.threadId, owner);
    // The unique constraint arbitrates independent serverless writers. Retry only
    // collisions, never ambiguous transport failures that could duplicate a write.
    for (let attempt = 0; attempt < 20; attempt++) {
      const { data: latest, error: readError } = await this.db
        .from('kit_versions')
        .select('version')
        .eq('thread_id', v.threadId)
        .order('version', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (readError) throw readError;
      const { data, error } = await this.db
        .from('kit_versions')
        .insert({
          thread_id: v.threadId,
          version: (latest?.version ?? 0) + 1,
          kind: v.kind,
          user_text: v.userText,
          plan: v.plan,
          excluded_keys: v.excludedKeys,
          status: v.status,
          options: v.options,
          explanation: v.explanation,
          diff: v.diff,
          selection: v.selection,
          follow_up: v.followUp,
        })
        .select('*')
        .single();
      if (error?.code === '23505') continue;
      if (error) throw error;
      const version = versionFromRow(data);
      await this.touch(v.threadId, owner, data.created_at);
      return version;
    }
    throw new Error('Concurrent kit updates: please retry');
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
    await this.requireOwned(threadId, owner);
    const { data, error: readError } = await this.db
      .from('kit_versions')
      .select('id')
      .eq('thread_id', threadId)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (readError) throw readError;
    if (!data) throw new Error('Version not found');
    const { error } = await this.db
      .from('kit_versions')
      .update({ selection })
      .eq('id', data.id);
    if (error) throw error;
    await this.touch(threadId, owner, new Date().toISOString());
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
    const thread = await this.owned(threadId, owner);
    if (!thread) return null;
    const [versions, messages] = await Promise.all([
      this.db
        .from('kit_versions')
        .select('*')
        .eq('thread_id', threadId)
        .order('version'),
      this.db
        .from('kit_messages')
        .select('*')
        .eq('thread_id', threadId)
        .order('id'),
    ]);
    if (versions.error) throw versions.error;
    if (messages.error) throw messages.error;
    return {
      thread: this.summary(thread),
      versions: versions.data.map(versionFromRow),
      messages: messages.data.map((row) =>
        kitMessageSchema.parse({
          threadId: row.thread_id,
          afterVersion: row.after_version,
          createdAt: new Date(String(row.created_at)).toISOString(),
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
