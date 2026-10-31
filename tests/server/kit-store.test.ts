import { expect, it, vi, afterEach } from 'vitest';
import { InMemoryKitStore, getKitStore } from '@/server/kits';
import threads from '@/contract/fixtures/threads.sample.json';
import { kitVersionSchema } from '@/contract/schemas';
afterEach(() => vi.unstubAllEnvs());
const input = () => {
  const {
    version: _v,
    createdAt: _t,
    ...rest
  } = kitVersionSchema.parse(threads[0].versions[0]);
  return rest;
};
it('appends ordered versions and answer turns for the owner only', async () => {
  const s = new InMemoryKitStore();
  const { threadId } = await s.createThread('alice', 'x'.repeat(80), 'lan');
  const v = { ...input(), threadId };
  expect((await s.appendVersion(v, 'alice')).version).toBe(1);
  expect(
    (await s.appendVersion({ ...v, kind: 'refine' }, 'alice')).version,
  ).toBe(2);
  await s.appendMessage(
    {
      threadId,
      afterVersion: 2,
      userText: 'Really?',
      answer: 'Yes',
      followUp: null,
    },
    'alice',
  );
  const selection = {
    profile: 'balanced' as const,
    picks: { backpack: 'prod-minhan-backpack' },
    dropped: [],
  };
  await s.saveSelection(threadId, 'alice', selection);
  const found = await s.getThread(threadId, 'alice');
  expect(found?.versions.map((v) => v.version)).toEqual([1, 2]);
  expect(found?.versions[1].selection).toEqual(selection);
  expect(found?.messages).toMatchObject([{ afterVersion: 2, answer: 'Yes' }]);
  expect(found?.thread).toMatchObject({
    title: 'x'.repeat(60),
    persona: 'lan',
    versionCount: 2,
  });
  expect(await s.getThread(threadId, 'bob')).toBeNull();
  expect(await s.listThreads('bob')).toEqual([]);
  await expect(s.appendVersion(v, 'bob')).rejects.toThrow();
  await expect(
    s.appendMessage(
      { threadId, afterVersion: 1, userText: 'x', answer: 'x', followUp: null },
      'bob',
    ),
  ).rejects.toThrow();
  await expect(s.saveSelection(threadId, 'bob', selection)).rejects.toThrow();
  await expect(
    s.appendMessage(
      { threadId, afterVersion: 9, userText: 'x', answer: 'x', followUp: null },
      'alice',
    ),
  ).rejects.toThrow();
  found!.versions[0].plan.items.length = 0;
  expect(
    (await s.getThread(threadId, 'alice'))?.versions[0].plan.items.length,
  ).toBe(10);
});
it('returns at most 30 threads ordered by latest write including equal timestamps', async () => {
  const s = new InMemoryKitStore();
  const ids: string[] = [];
  for (let i = 0; i < 32; i++)
    ids.push((await s.createThread('alice', `Kit ${i}`, 'guest')).threadId);
  expect((await s.listThreads('alice'))[0].id).toBe(ids[31]);
  await s.appendVersion({ ...input(), threadId: ids[0] }, 'alice');
  expect((await s.listThreads('alice'))[0].id).toBe(ids[0]);
  expect(await s.listThreads('alice')).toHaveLength(30);
});
it('uses the same backend switch as CommerceAdapter', () => {
  vi.stubEnv('KITLY_ADAPTER', 'memory');
  expect(getKitStore()).toBeInstanceOf(InMemoryKitStore);
  vi.stubEnv('KITLY_ADAPTER', 'supabase');
  expect(() => getKitStore()).toThrow(/not implemented/i);
  vi.stubEnv('KITLY_ADAPTER', 'unknown');
  expect(() => getKitStore()).toThrow(/adapter/i);
});
