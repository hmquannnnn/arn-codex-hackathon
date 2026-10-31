import { randomUUID } from 'node:crypto';
import type { KitStore } from '@/contract/kit-store';
import { kitSelectionSchema } from '@/contract/schemas';
import { storedSelectionSchema } from './selection-snapshot';
import type {
  KitMessage,
  KitSelection,
  KitThreadSummary,
  KitVersion,
  PersonaId,
} from '@/contract/types';
interface Entry {
  owner: string;
  thread: KitThreadSummary;
  versions: KitVersion[];
  messages: KitMessage[];
  write: number;
}
export class InMemoryKitStore implements KitStore {
  private threads = new Map<string, Entry>();
  private write = 0;
  private owned(threadId: string, owner: string) {
    const entry = this.threads.get(threadId);
    if (!entry || entry.owner !== owner) throw new Error('Thread not found');
    return entry;
  }
  private touch(entry: Entry) {
    entry.thread.updatedAt = new Date().toISOString();
    entry.write = ++this.write;
  }
  async createThread(owner: string, title: string, persona: PersonaId) {
    const threadId = randomUUID();
    this.threads.set(threadId, {
      owner,
      thread: {
        id: threadId,
        title: title.slice(0, 60),
        persona,
        updatedAt: new Date().toISOString(),
        versionCount: 0,
      },
      versions: [],
      messages: [],
      write: ++this.write,
    });
    return { threadId };
  }
  async appendVersion(
    v: Omit<KitVersion, 'version' | 'createdAt'>,
    owner: string,
  ) {
    const entry = this.owned(v.threadId, owner);
    const version: KitVersion = {
      ...structuredClone(v),
      version: entry.versions.length + 1,
      createdAt: new Date().toISOString(),
    };
    entry.versions.push(version);
    entry.thread.versionCount = entry.versions.length;
    this.touch(entry);
    return structuredClone(version);
  }
  async appendMessage(m: Omit<KitMessage, 'createdAt'>, owner: string) {
    const entry = this.owned(m.threadId, owner);
    if (!entry.versions.some((v) => v.version === m.afterVersion))
      throw new Error('Version not found');
    const message = {
      ...structuredClone(m),
      createdAt: new Date().toISOString(),
    };
    entry.messages.push(message);
    this.touch(entry);
    return structuredClone(message);
  }
  async saveSelection(
    threadId: string,
    owner: string,
    selection: KitSelection,
  ) {
    const entry = this.owned(threadId, owner);
    const latest = entry.versions.at(-1);
    if (!latest) throw new Error('Version not found');
    const stored = storedSelectionSchema.parse(selection);
    latest.selection = kitSelectionSchema.parse(stored);
    if (stored.snapshot)
      latest.options = latest.options.map((option) =>
        option.profile === stored.snapshot!.profile
          ? structuredClone(stored.snapshot!)
          : option,
      );
    this.touch(entry);
  }
  async listThreads(owner: string) {
    return structuredClone(
      [...this.threads.values()]
        .filter((e) => e.owner === owner)
        .sort(
          (a, b) =>
            b.thread.updatedAt.localeCompare(a.thread.updatedAt) ||
            b.write - a.write,
        )
        .slice(0, 30)
        .map((e) => e.thread),
    );
  }
  async getThread(threadId: string, owner: string) {
    const entry = this.threads.get(threadId);
    return !entry || entry.owner !== owner
      ? null
      : structuredClone({
          thread: entry.thread,
          versions: entry.versions,
          messages: entry.messages,
        });
  }
}
