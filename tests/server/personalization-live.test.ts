import { expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { SupabaseAdapter } from '@/server/commerce';
import { SupabaseKitStore } from '@/server/kits';
import { createKitHandler, createRefineHandler } from '@/server/sse';
import { FakeLLM } from '@/server/llm';
import { kitEventSchema, kitPlanSchema } from '@/contract/schemas';
import { createDb } from '@/server/db';
import fixture from '@/contract/fixtures/kit.sample.json';
const plan = kitPlanSchema.parse(
  fixture.find((e) => e.event === 'plan')!.data.plan,
);
it.skipIf(process.env.KITLY_TEST_PERSONALIZATION !== '1')(
  'S10 Supabase HTTP handlers persist persona interests and answer turns across instances',
  async () => {
    const owner = 'test-personal-' + randomUUID(),
      adapter = new SupabaseAdapter(),
      store = new SupabaseKitStore();
    let threadId: string | undefined;
    const sessions: string[] = [];
    const request = (body: object, persona = 'lan') =>
      new Request('http://localhost/api/kit', {
        method: 'POST',
        headers: {
          cookie: `kitly_uid=${owner}; kitly_persona=${persona}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
      });
    const read = async (r: Response) => {
      expect(r.status).toBe(200);
      return (await r.text())
        .trim()
        .split('\n\n')
        .map((frame) =>
          kitEventSchema.parse({
            event: frame.match(/^event: (.+)$/m)![1],
            data: JSON.parse(frame.match(/^data: (.+)$/m)![1]),
          }),
        );
    };
    try {
      const events = await read(
        await createKitHandler({
          adapter,
          store,
          llm: new FakeLLM([plan], ['Your kit.']),
        })(request({ query: 'Grade1 budget1.5M' })),
      );
      for (const e of events)
        if (e.event === 'plan') {
          threadId = e.data.threadId;
          sessions.push(e.data.sessionId);
        }
      expect(events.slice(-2).map((e) => e.event)).toEqual([
        'followup',
        'done',
      ]);
      const initial = await new SupabaseKitStore().getThread(threadId!, owner);
      expect(
        initial?.versions[0].options.find((o) => o.profile === 'balanced')
          ?.interests?.[0].priceAfterVoucher,
      ).toBe(440000);
      const before = await adapter.demandItemsSince('2026-08-27');
      const answer = await read(
        await createRefineHandler({
          adapter: new SupabaseAdapter(),
          store: new SupabaseKitStore(),
          llm: new FakeLLM(
            [{ ...plan, intent: 'answer' }],
            ['The closest backpack lacks the tag.'],
          ),
        })(
          request(
            { threadId, message: 'Does the backpack support the spine?' },
            'guest',
          ),
        ),
      );
      expect(answer.at(-1)).toMatchObject({
        data: { version: 1, answered: true, sessionId: null },
      });
      const after = await new SupabaseKitStore().getThread(threadId!, owner);
      expect(after?.versions).toHaveLength(1);
      expect(after?.messages).toHaveLength(1);
      expect(after?.messages[0].followUp?.source).toBe('template');
      expect(await adapter.demandItemsSince('2026-08-27')).toEqual(before);
    } finally {
      const db = createDb();
      if (threadId)
        await db
          .from('kit_threads')
          .delete()
          .eq('id', threadId)
          .eq('owner', owner);
      if (sessions.length)
        await db.from('intent_sessions').delete().in('id', sessions);
    }
  },
  60000,
);
