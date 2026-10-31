import { expect, it } from 'vitest';
import type { Candidate, KitPlan } from '@/contract/types';
import { kitPlanSchema } from '@/contract/schemas';
import fixture from '@/contract/fixtures/kit.sample.json';
import { SupabaseAdapter } from '@/server/commerce';
import { optimizeProfiles } from '@/server/optimizer';
import { buildCatalog } from '../../scripts/seed/catalog';

function pools(plan:KitPlan,world:ReturnType<typeof buildCatalog>) {
  return Object.fromEntries(plan.items.map(item=>[item.key,world.products.filter(p=>p.category===item.category&&p.stock>0&&p.shipDaysMax<=2&&item.mustHaveTags.every(t=>p.tags.includes(t))&&(item.maxUnitPrice===null||p.price<=item.maxUnitPrice)).map(p=>({
    product:p,shop:world.shops.find(s=>s.id===p.shopId)!,score:Math.min(1,(p.rating-3)/2*.8+Math.log10(1+p.reviewCount)/5*.2),matchedTags:[],arrivesBy:'2026-09-04',
  } satisfies Candidate))]));
}
it('express seed offers produce a Balanced hero basket under1.5M and genuine profile tradeoffs at3M',async()=>{
  const plan=kitPlanSchema.parse(fixture.find(e=>e.event==='plan')!.data.plan);
  const world=buildCatalog([],'2026-09-02');
  const options=optimizeProfiles({plan:{...plan,deadline:'2026-09-04',budget:1500000},candidates:pools(plan,world),vouchers:world.vouchers});
  expect(options.find(o=>o.profile==='balanced')?.grandTotal).toBeLessThanOrEqual(1500000);
  expect(options.every(o=>o.status==='ok')).toBe(true);
  const richer=optimizeProfiles({plan:{...plan,budget:3000000},candidates:pools(plan,world),vouchers:world.vouchers});
  expect(richer.every(o=>o.status==='ok'&&o.grandTotal<=3000000)).toBe(true);
  const candidates=pools(plan,world);
  const quality=(index:number)=>richer[index].lines.reduce((sum,l)=>sum+candidates[l.itemKey].find(c=>c.product.id===l.product.id)!.score,0);
  expect(quality(2)).toBeGreaterThan(quality(0));
  expect(optimizeProfiles({plan:{...plan,budget:1000000},candidates,vouchers:world.vouchers}).every(o=>o.status==='ok'&&o.grandTotal<=1000000)).toBe(true);
  expect(richer[0].grandTotal).toBeLessThanOrEqual(richer[1].grandTotal);
  expect(richer[1].grandTotal).toBeLessThanOrEqual(richer[2].grandTotal);
  expect(richer[2].lines.filter(l=>richer[0].lines.find(s=>s.itemKey===l.itemKey)?.product.id!==l.product.id).length).toBeGreaterThanOrEqual(2);
});

it.skipIf(!process.env.SUPABASE_URL)('the real seeded express hero has a Balanced basket under1.5M',async()=>{
  const adapter=new SupabaseAdapter();
  const plan=kitPlanSchema.parse(fixture.find(e=>e.event==='plan')!.data.plan);
  const [products,shops,vouchers]=await Promise.all([adapter.searchProducts({}),adapter.listShops(),adapter.listVouchers('lan')]);
  const world={products,shops,vouchers,personas:[]};
  const options=optimizeProfiles({plan:{...plan,deadline:'2026-09-04',budget:1500000},candidates:pools(plan,world),vouchers});
  expect(options.find(o=>o.profile==='balanced')).toMatchObject({status:'ok'});
  expect(options.find(o=>o.profile==='balanced')!.grandTotal).toBeLessThanOrEqual(1500000);
});
