import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { afterAll, describe, expect, it } from 'vitest';
import { InMemoryKitStore, SupabaseKitStore } from '@/server/kits';
import { createDb } from '@/server/db';
import type { KitStore } from '@/contract/kit-store';
import threads from '@/contract/fixtures/threads.sample.json';
import { kitVersionSchema } from '@/contract/schemas';
if (existsSync('.env.local')) loadEnvFile('.env.local');
const configured = Boolean(
  process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY,
);
const owners: string[] = [];
afterAll(async () => {
  if (!configured || owners.length === 0) return;
  const { error } = await createDb()
    .from('kit_threads')
    .delete()
    .in('owner', owners);
  if (error) throw error;
});
const input = () => {
  const {
    version: _v,
    createdAt: _t,
    ...rest
  } = kitVersionSchema.parse(threads[0].versions[0]);
  return rest;
};
function contract(name: string, makeStore: () => KitStore, enabled = true) {
  describe.skipIf(!enabled)(name, () => {
    it('appends ordered versions and answer turns for the owner only', async () => {
      const owner = `test-kit-store-${randomUUID()}`;
      const stranger = `test-kit-store-${randomUUID()}`;
      if (name === 'SupabaseKitStore') owners.push(owner, stranger);
      const s = makeStore();
      const { threadId } = await s.createThread(owner, 'x'.repeat(80), 'lan');
      const v = { ...input(), threadId };
      expect((await s.appendVersion(v, owner)).version).toBe(1);
      expect(
        (await s.appendVersion({ ...v, kind: 'refine' }, owner)).version,
      ).toBe(2);
      await s.appendMessage(
        {
          threadId,
          afterVersion: 2,
          userText: 'Really?',
          answer: 'Yes',
          followUp: null,
        },
        owner,
      );
      const selection = {
        profile: 'balanced' as const,
        picks: { backpack: 'prod-minhan-backpack' },
        dropped: [],
      };
      await s.saveSelection(threadId, owner, selection);
      const found = await s.getThread(threadId, owner);
      expect(found?.versions.map((v) => v.version)).toEqual([1, 2]);
      expect(found?.versions[1].selection).toEqual(selection);
      expect(found?.messages).toMatchObject([
        { afterVersion: 2, answer: 'Yes' },
      ]);
      expect(found?.thread).toMatchObject({
        title: 'x'.repeat(60),
        persona: 'lan',
        versionCount: 2,
      });
      expect(await s.getThread(threadId, stranger)).toBeNull();
      expect(await s.listThreads(stranger)).toEqual([]);
      await expect(s.appendVersion(v, stranger)).rejects.toThrow();
      await expect(
        s.appendMessage(
          {
            threadId,
            afterVersion: 1,
            userText: 'x',
            answer: 'x',
            followUp: null,
          },
          stranger,
        ),
      ).rejects.toThrow();
      await expect(
        s.saveSelection(threadId, stranger, selection),
      ).rejects.toThrow();
      await expect(
        s.appendMessage(
          {
            threadId,
            afterVersion: 9,
            userText: 'x',
            answer: 'x',
            followUp: null,
          },
          owner,
        ),
      ).rejects.toThrow();
      found!.versions[0].plan.items.length = 0;
      expect(
        (await s.getThread(threadId, owner))?.versions[0].plan.items.length,
      ).toBe(10);
    }, 30_000);
    it('returns at most 30 threads ordered by latest write including equal timestamps', async () => {
      const owner = `test-kit-store-${randomUUID()}`;
      const stranger = `test-kit-store-${randomUUID()}`;
      if (name === 'SupabaseKitStore') owners.push(owner, stranger);
      const s = makeStore();
      const ids: string[] = [];
      for (let i = 0; i < 32; i++)
        ids.push((await s.createThread(owner, `Kit ${i}`, 'guest')).threadId);
      expect((await s.listThreads(owner))[0].id).toBe(ids[31]);
      await s.appendVersion({ ...input(), threadId: ids[0] }, owner);
      expect((await s.listThreads(owner))[0].id).toBe(ids[0]);
      expect(await s.listThreads(owner)).toHaveLength(30);
    }, 30_000);
  });
}
describe.skipIf(!configured)(
  'SupabaseKitStore persistence across instances',
  () => {
    it('reopens versions, selections and answer turns from a new instance', async () => {
      const owner = `test-kit-store-${randomUUID()}`;
      owners.push(owner);
      const first = new SupabaseKitStore();
      const { threadId } = await first.createThread(
        owner,
        'Persisted kit',
        'guest',
      );
      await expect(
        first.saveSelection(threadId, owner, {
          profile: 'balanced',
          picks: {},
          dropped: [],
        }),
      ).rejects.toThrow('Version not found');
      const saved = await first.appendVersion({ ...input(), threadId }, owner);
      const second = new SupabaseKitStore();
      const selection = {
        profile: 'premium' as const,
        picks: { backpack: 'example' },
        dropped: ['uniform'],
      };
      await second.saveSelection(threadId, owner, selection);
      await second.appendMessage(
        {
          threadId,
          afterVersion: 1,
          userText: 'Why?',
          answer: 'Because',
          followUp: null,
        },
        owner,
      );
      const reopened = await new SupabaseKitStore().getThread(threadId, owner);
      expect(reopened?.versions).toEqual([{ ...saved, selection }]);
      expect(reopened?.messages).toMatchObject([
        { userText: 'Why?', answer: 'Because', afterVersion: 1 },
      ]);
      expect(reopened?.thread).toMatchObject({
        persona: 'guest',
        versionCount: 1,
      });
    }, 30_000);

    it('assigns distinct increasing versions to concurrent independent writers', async () => {
      const owner = `test-kit-store-${randomUUID()}`;
      owners.push(owner);
      const { threadId } = await new SupabaseKitStore().createThread(
        owner,
        'Concurrent kit',
        'lan',
      );
      const versions = await Promise.all(
        Array.from({ length: 5 }, (_, i) =>
          new SupabaseKitStore().appendVersion(
            { ...input(), threadId, userText: `turn ${i}` },
            owner,
          ),
        ),
      );
      expect(versions.map((v) => v.version).sort((a, b) => a - b)).toEqual([
        1, 2, 3, 4, 5,
      ]);
      const reopened = await new SupabaseKitStore().getThread(threadId, owner);
      expect(reopened?.versions.map((v) => v.version)).toEqual([1, 2, 3, 4, 5]);
      expect(reopened?.versions.map((v) => v.userText).sort()).toEqual([
        'turn 0',
        'turn 1',
        'turn 2',
        'turn 3',
        'turn 4',
      ]);
      expect(reopened?.thread.versionCount).toBe(5);
    }, 30_000);
  },
);
contract('InMemoryKitStore', () => new InMemoryKitStore());
contract('SupabaseKitStore', () => new SupabaseKitStore(), configured);
