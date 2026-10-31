import { expect, it } from 'vitest';
import { diffPlans } from '@/server/diff';
import type { KitPlan, PlanItem } from '@/contract/types';
function item(key: string): PlanItem {
  return {
    key,
    needLabel: key,
    category: 'notebooks',
    required: true,
    quantity: 1,
    mustHaveTags: [],
    niceToHaveTags: [],
    maxUnitPrice: null,
  };
}
function plan(items: PlanItem[]): KitPlan {
  return {
    event: 'back_to_school',
    language: 'en',
    budget: 1500000,
    deadline: '2026-09-05',
    items,
    assumptions: [],
  };
}
it('reports added keys in next-plan order and removed keys in previous-plan order', () => {
  const previous = plan([item('uniform'), item('notebooks'), item('bottle')]);
  const next = plan([item('lamp'), item('notebooks'), item('pens')]);
  expect(diffPlans(previous, next)).toEqual({
    added: ['lamp', 'pens'],
    removed: ['uniform', 'bottle'],
    changed: [],
  });
});

it('detects changed item values including tags, quantity and price limits in next-plan order', () => {
  const previous = plan([
    item('tags'),
    item('quantity'),
    item('price'),
    item('label'),
    item('category'),
    item('required'),
    item('nice'),
  ]);
  const next = plan([
    { ...item('nice'), niceToHaveTags: ['eco-friendly'] },
    { ...item('required'), required: false },
    { ...item('category'), category: 'pencils-pens' },
    { ...item('label'), needLabel: 'A5 notebooks' },
    { ...item('price'), maxUnitPrice: 50000 },
    { ...item('quantity'), quantity: 2 },
    { ...item('tags'), mustHaveTags: ['waterproof'] },
  ]);
  expect(diffPlans(previous, next)).toEqual({
    added: [],
    removed: [],
    changed: [
      'nice',
      'required',
      'category',
      'label',
      'price',
      'quantity',
      'tags',
    ],
  });
});

it('ignores object property insertion, item/tag order and plan metadata without mutating either plan', () => {
  const before = plan([
    {
      ...item('bottle'),
      mustHaveTags: ['insulated', 'leak-proof'],
      niceToHaveTags: ['kids', 'bpa-free'],
    },
    item('pens'),
  ]);
  const reordered: PlanItem = {
    maxUnitPrice: null,
    niceToHaveTags: ['bpa-free', 'kids'],
    mustHaveTags: ['leak-proof', 'insulated'],
    quantity: 1,
    required: true,
    category: 'notebooks',
    needLabel: 'bottle',
    key: 'bottle',
  };
  const after = {
    ...plan([item('pens'), reordered]),
    budget: 1000000,
    deadline: '2026-09-04',
    language: 'vi' as const,
    assumptions: ['Already have uniforms'],
  };
  const snapshots = [structuredClone(before), structuredClone(after)];
  expect(diffPlans(before, after)).toEqual({
    added: [],
    removed: [],
    changed: [],
  });
  expect([before, after]).toEqual(snapshots);
});
