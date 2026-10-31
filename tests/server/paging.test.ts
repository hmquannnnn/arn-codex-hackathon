import { expect, it } from 'vitest';
import { readPages } from '@/server/commerce/paging';
it('S3 database pages start in parallel, preserve order, retry one timeout per page and name exhausted query', async () => {
  let active = 0,
    peak = 0;
  const attempts = new Map<number, number>();
  const rows = await readPages(
    'demandItemsSince',
    async (offset, size) => {
      const n = (attempts.get(offset) ?? 0) + 1;
      attempts.set(offset, n);
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, offset === 0 ? 20 : 5));
      active--;
      if (offset === 2 && n === 1) throw Error('statement timeout');
      return offset < 6
        ? Array.from({ length: size }, (_, i) => offset + i)
        : [];
    },
    2,
    4,
  );
  expect(rows).toEqual([0, 1, 2, 3, 4, 5]);
  expect(peak).toBe(4);
  expect(attempts.get(2)).toBe(2);
  let failed = 0;
  await expect(
    readPages(
      'window query',
      async () => {
        failed++;
        throw Error('statement timeout');
      },
      2,
      1,
    ),
  ).rejects.toThrow('window query');
  expect(failed).toBe(2);
});
it('S3 the live demand query retries one failed read while preserving its limit', async () => {
  let attempts = 0;
  const result = await readPages(
    'recentDemandItems',
    async (offset) => {
      if (offset >= 10) return [];
      if (++attempts === 1) throw Error('statement timeout');
      return ['latest-live-unmet'];
    },
    1000,
    1,
  );
  expect(attempts).toBe(2);
  expect(result).toEqual(['latest-live-unmet']);
});
