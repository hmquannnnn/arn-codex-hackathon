import type {
  KitMessage,
  KitSelection,
  KitThreadSummary,
  KitVersion,
  PersonaId,
  ThreadResponse,
} from './types';
export interface KitStore {
  createThread(
    owner: string,
    title: string,
    persona: PersonaId,
  ): Promise<{ threadId: string }>;
  appendMessage(
    m: Omit<KitMessage, 'createdAt'>,
    owner: string,
  ): Promise<KitMessage>;
  appendVersion(
    v: Omit<KitVersion, 'version' | 'createdAt'>,
    owner: string,
  ): Promise<KitVersion>;
  saveSelection(
    threadId: string,
    owner: string,
    selection: KitSelection,
  ): Promise<void>;
  listThreads(owner: string): Promise<KitThreadSummary[]>;
  getThread(threadId: string, owner: string): Promise<ThreadResponse | null>;
}
