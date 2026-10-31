import type {
  AdjustChange,
  AdjustResponse,
  KitEvent,
  KitPlan,
  KitSelection,
  KitVersion,
  PriceResponse,
  PersonaId,
  PersonaResponse,
  ThreadResponse,
  ThreadsResponse,
} from '@/contract/types';
import { kitEventSchema, threadResponseSchema } from '@/contract/schemas';
import sample from '@/contract/fixtures/kit.sample.json';
import clarify from '@/contract/fixtures/kit.clarify.sample.json';
import threads from '@/contract/fixtures/threads.sample.json';
import answer from '@/contract/fixtures/kit.answer.sample.json';
import personas from '@/contract/fixtures/personas.json';
import vouchers from '@/contract/fixtures/vouchers.json';
import { personaSchema, voucherSchema } from '@/contract/schemas';
import { getJSON } from './store';
import { parseSSE } from './sse';
export interface KitApi {
  getPersona(): Promise<PersonaResponse>;
  setPersona(id: PersonaId): Promise<PersonaResponse>;
  listThreads(): Promise<ThreadsResponse>;
  getThread(id: string): Promise<ThreadResponse>;
  run(
    text: string,
    id?: string,
    signal?: AbortSignal,
    shopping?: KitPlan['shopping'],
  ): AsyncGenerator<KitEvent>;
  adjust(id: string, change: AdjustChange): Promise<AdjustResponse>;
  price(id: string, selection: KitSelection): Promise<PriceResponse>;
}
const post = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});
export class HttpKitApi implements KitApi {
  getPersona() {
    return getJSON<PersonaResponse>('/api/persona');
  }
  setPersona(id: PersonaId) {
    return getJSON<PersonaResponse>('/api/persona', post({ id }));
  }
  listThreads() {
    return getJSON<ThreadsResponse>('/api/threads');
  }
  getThread(id: string) {
    return getJSON<ThreadResponse>(`/api/threads/${encodeURIComponent(id)}`);
  }
  adjust(id: string, change: AdjustChange) {
    return getJSON<AdjustResponse>(
      '/api/kit/adjust',
      post({ threadId: id, change }),
    );
  }
  price(id: string, selection: KitSelection) {
    return getJSON<PriceResponse>(
      '/api/kit/price',
      post({ threadId: id, selection }),
    );
  }
  async *run(
    text: string,
    id?: string,
    signal?: AbortSignal,
    shopping?: KitPlan['shopping'],
  ) {
    const response = await fetch(id ? '/api/kit/refine' : '/api/kit', {
      ...post(id ? { threadId: id, message: text } : { query: text, shopping }),
      signal,
    });
    if (!response.ok || !response.body)
      throw new Error('Kitly could not start. Please try again.');
    let complete = false;
    for await (const event of parseSSE(response.body)) {
      if (event.event === 'done' || event.event === 'error') complete = true;
      yield event;
    }
    if (!complete)
      throw new Error(
        'Connection ended before the kit finished. Please retry.',
      );
  }
}
/** Explicit fixture replay for T11 while the pipeline is being built. No server state. */
export class MockKitApi implements KitApi {
  constructor(private delay = 25) {}
  async getPersona(): Promise<PersonaResponse> {
    const id =
      localStorage.getItem('kitly-mock-persona') === 'guest' ? 'guest' : 'lan';
    return {
      persona: personaSchema.parse(personas.find((p) => p.id === id)),
      walletVouchers: voucherSchema
        .array()
        .parse(vouchers.filter((v) => v.ownerPersona === id)),
    };
  }
  async setPersona(id: PersonaId) {
    localStorage.setItem('kitly-mock-persona', id);
    return this.getPersona();
  }
  private read(): ThreadResponse[] {
    try {
      return JSON.parse(localStorage.getItem('kitly-mock-threads') || '[]').map(
        (t: unknown) => threadResponseSchema.parse(t),
      );
    } catch {
      return [];
    }
  }
  private save(thread: ThreadResponse) {
    const all = this.read().filter((t) => t.thread.id !== thread.thread.id);
    localStorage.setItem(
      'kitly-mock-threads',
      JSON.stringify([thread, ...all]),
    );
  }
  async listThreads() {
    return { threads: this.read().map((t) => t.thread) };
  }
  async getThread(id: string) {
    const thread = this.read().find((t) => t.thread.id === id);
    if (!thread) throw new Error('Kit not found');
    return thread;
  }
  async *run(
    text: string,
    id?: string,
    signal?: AbortSignal,
  ): AsyncGenerator<KitEvent> {
    const existing = id ? await this.getThread(id) : null;
    const threadId = id || crypto.randomUUID();
    const persona =
      existing?.thread.persona || (await this.getPersona()).persona.id;
    if (existing && /[?？]/.test(text)) {
      const events = answer.map((e) => kitEventSchema.parse(e));
      const message = {
        threadId,
        afterVersion: existing.versions.at(-1)!.version,
        createdAt: new Date().toISOString(),
        userText: text,
        answer: events
          .filter((e) => e.event === 'explanation')
          .map((e) => (e.event === 'explanation' ? e.data.delta : ''))
          .join(''),
        followUp: events.find((e) => e.event === 'followup')?.data,
      };
      const follow = events.find((e) => e.event === 'followup');
      for (const original of events) {
        if (signal?.aborted) return;
        const event = structuredClone(original);
        if (event.event === 'done') {
          event.data.threadId = threadId;
          event.data.version = message.afterVersion;
          event.data.answered = true;
          existing.messages.push({
            ...message,
            followUp:
              follow?.event === 'followup' ? follow.data.followUp : null,
          });
          this.save(existing);
        }
        yield event;
      }
      return;
    }
    const needsBudget = !id && !/\d|budget|ngân sách/i.test(text);
    const events = (needsBudget ? clarify : sample).map((e) =>
      kitEventSchema.parse(e),
    );
    const base = threadResponseSchema.parse(threads[0]);
    const version: KitVersion = structuredClone(base.versions[id ? 1 : 0]);
    version.threadId = threadId;
    version.createdAt = new Date().toISOString();
    if (persona === 'guest') {
      version.options.forEach((o) => {
        o.interests = [];
        o.savings = o.savings.filter((s) => !s.wallet);
      });
    }
    version.version = (existing?.versions.length || 0) + 1;
    version.userText = text;
    if (needsBudget) {
      const event = events.find((e) => e.event === 'plan');
      if (event?.event === 'plan') version.plan = event.data.plan;
      version.options = [];
      version.status = 'awaiting_budget';
      version.explanation = '';
    }
    for (const original of events) {
      if (signal?.aborted) return;
      if (this.delay)
        await new Promise((resolve) => setTimeout(resolve, this.delay));
      const event = structuredClone(original);
      if (event.event === 'plan') {
        event.data.threadId = threadId;
        event.data.version = version.version;
        event.data.plan = version.plan;
      }
      if (event.event === 'options') event.data.options = version.options;
      if (event.event === 'clarify') {
        event.data.threadId = threadId;
        event.data.version = version.version;
      }
      if (event.event === 'done') {
        event.data.threadId = threadId;
        event.data.version = version.version;
        this.save({
          thread: {
            ...base.thread,
            persona,
            updatedAt: version.createdAt,
            id: threadId,
            title: existing?.thread.title || text.slice(0, 60),
            versionCount: version.version,
          },
          versions: [...(existing?.versions || []), version],
          messages: [],
        });
      }
      yield event;
    }
  }
  async adjust(id: string, change: AdjustChange) {
    if (change.type !== 'set_budget' && change.type !== 'restore_version') {
      throw new Error(
        'Fixture replay has no recorded response for this edit. Try live editing when it is available.',
      );
    }
    const thread = await this.getThread(id);
    const previous = thread.versions.at(-1)!;
    const source =
      change.type === 'restore_version'
        ? thread.versions.find((v) => v.version === change.version)!
        : previous;
    const version = structuredClone(source);
    version.version = previous.version + 1;
    version.kind = change.type === 'restore_version' ? 'restore' : 'adjust';
    version.userText =
      change.type === 'restore_version'
        ? `Restored version ${change.version}`
        : 'Budget updated';
    if (change.type === 'set_budget') {
      // Replay recorded options; mock mode deliberately does not simulate the optimizer.
      const ready = threadResponseSchema.parse(threads[0]).versions[0];
      version.plan.budget = change.budget;
      version.options = ready.options;
      version.status = 'ready';
      version.explanation = ready.explanation;
    }
    thread.versions.push(version);
    thread.thread.versionCount = version.version;
    this.save(thread);
    return { version };
  }
  async price(id: string, selection: KitSelection): Promise<PriceResponse> {
    const thread = await this.getThread(id);
    const option = thread.versions
      .at(-1)!
      .options.find((o) => o.profile === selection.profile);
    if (!option) throw new Error('No recorded option for this profile.');
    const unchanged =
      selection.dropped.length === 0 &&
      Object.entries(selection.picks).every(([key, productId]) =>
        option.lines.some(
          (line) => line.itemKey === key && line.product.id === productId,
        ),
      );
    if (!unchanged)
      throw new Error(
        'Fixture replay has no recorded price for that selection. Switch to live mode to compare alternatives.',
      );
    return { option: structuredClone(option) };
  }
}
