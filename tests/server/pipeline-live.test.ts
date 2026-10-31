import { expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { runKit } from '@/server/pipeline';
import { SupabaseAdapter } from '@/server/commerce';
import { SupabaseKitStore } from '@/server/kits';
import { FakeLLM } from '@/server/llm';
import { createDb } from '@/server/db';
import { kitEventSchema,kitPlanSchema } from '@/contract/schemas';
import fixture from '@/contract/fixtures/kit.sample.json';
it.skipIf(process.env.KITLY_TEST_PIPELINE!=='1')('S2 stores a live hero exactly once across real serverless adapter/store instances',async()=>{
  const adapter=new SupabaseAdapter(),store=new SupabaseKitStore();
  const owner='test-pipeline-'+randomUUID();
  const plan=kitPlanSchema.parse(fixture.find(e=>e.event==='plan')!.data.plan);
  let threadId:string|undefined,sessionId:string|undefined;
  try {
    const events=[];
    for await(const event of runKit({query:'My kid starts Grade1. Budget1.5M. Anti-hunchback backpack under400k.',owner,persona:'lan',profiles:['balanced']},{adapter,store,llm:new FakeLLM([plan],['Your kit is ready.'])})) {
      events.push(kitEventSchema.parse(event));
      if(event.event==='plan'){threadId=event.data.threadId;sessionId=event.data.sessionId;}
    }
    expect(events.at(-1)?.event).toBe('done');
    expect(threadId).toBeDefined();
    const found=await new SupabaseKitStore().getThread(threadId!,owner);
    expect(found?.versions).toHaveLength(1);
    expect(found?.versions[0].options).toHaveLength(1);
    expect(found?.versions[0].explanation).toBe('Your kit is ready.');
    expect(await new SupabaseKitStore().getThread(threadId!,'other')).toBeNull();
    const demand=await new SupabaseAdapter().demandItemsSince('2026-09-02');
    expect(demand.filter(d=>d.sessionId===sessionId)).toHaveLength(plan.items.length);
    expect(demand.find(d=>d.sessionId===sessionId&&d.tags.includes('anti-hunchback'))?.matchedCount).toBe(0);
    const week=await adapter.demandItemsSince('2026-08-27');
    expect(new Set(week.filter(d=>d.category==='school-backpack'&&d.tags.includes('anti-hunchback')&&d.matchedCount===0).map(d=>d.sessionId)).size).toBe(38);
    const balanced=found!.versions[0].options[0];
    expect(balanced.status).toBe('ok');
    expect(balanced.grandTotal).toBeLessThanOrEqual(1500000);
    expect(balanced.noMatch.find(n=>n.closest)?.closest?.candidate.product.id).toBe('prod-minhan-backpack');
  } finally {
    const db=createDb();
    if(threadId){const{error}=await db.from('kit_threads').delete().eq('id',threadId).eq('owner',owner);if(error)throw error;}
    if(sessionId){const{error}=await db.from('intent_sessions').delete().eq('id',sessionId);if(error)throw error;}
  }
},30000);
