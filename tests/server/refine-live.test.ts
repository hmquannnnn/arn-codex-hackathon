import { expect,it } from 'vitest';
import { randomUUID } from 'node:crypto';
import {runKit} from '@/server/pipeline';
import {createRefineHandler} from '@/server/sse';
import {SupabaseAdapter} from '@/server/commerce';
import {SupabaseKitStore} from '@/server/kits';
import {FakeLLM} from '@/server/llm';
import {createDb} from '@/server/db';
import {kitPlanSchema,kitEventSchema} from '@/contract/schemas';
import fixture from '@/contract/fixtures/kit.sample.json';
it.skipIf(process.env.KITLY_TEST_REFINE!=='1')('S6 live refine appends version2 across instances without changing demand or version1',async()=>{
  const owner='test-refine-'+randomUUID();const sessions:string[]=[];let threadId:string|undefined;
  const adapter=new SupabaseAdapter(),store=new SupabaseKitStore();
  const plan=kitPlanSchema.parse(fixture.find(e=>e.event==='plan')!.data.plan);
  try{
    for await(const e of runKit({query:'Grade1 budget1.5M backpackanti-hunchbackunder400k',owner,persona:'lan'},{adapter,store,llm:new FakeLLM([plan],['Original explanation.'])}))if(e.event==='plan'){threadId=e.data.threadId;sessions.push(e.data.sessionId);}
    const previous=await store.getThread(threadId!,owner);
    const before=await adapter.demandItemsSince('2026-08-27');
    const next={...plan,budget:1000000,items:plan.items.filter(i=>i.category!=='uniform-shirt'),intent:'change_kit'};
    const handler=createRefineHandler({adapter,store,llm:new FakeLLM([next],['Removed uniform. Your new total fits1M.'])});
    const request=(who:string)=>new Request('http://localhost/api/kit/refine',{method:'POST',headers:{'Content-Type':'application/json',Cookie:'kitly_uid='+who+'; kitly_persona=guest'},body:JSON.stringify({threadId,message:'School gives the uniform, cut the budget to1M.'})});
    expect((await handler(request('stranger'))).status).toBe(404);
    const response=await handler(request(owner));expect(response.status).toBe(200);
    const events=(await response.text()).trim().split('\n\n').map(frame=>kitEventSchema.parse({event:frame.match(/^event: (.+)$/m)![1],data:JSON.parse(frame.match(/^data: (.+)$/m)![1])}));
    const revised=events.find(e=>e.event==='plan');expect(revised?.event).toBe('plan');if(revised?.event==='plan'){sessions.push(revised.data.sessionId);expect(revised.data.diff?.removed).toEqual(['uniform-shirt']);}
    expect(events.at(-1)?.event).toBe('done');
    const after=await new SupabaseKitStore().getThread(threadId!,owner);
    expect(after?.versions).toHaveLength(2);expect(after?.versions[0]).toEqual(previous?.versions[0]);
    expect(after?.versions[1]).toMatchObject({kind:'refine',plan:{budget:1000000}});
    expect(after!.versions[1].options.every(o=>o.status==='ok'&&o.grandTotal<=1000000)).toBe(true);
    expect(after!.versions[1].options.some(o=>o.savings.some(s=>s.wallet))).toBe(true);
    expect(after!.thread.persona).toBe('lan');
    expect(await adapter.demandItemsSince('2026-08-27')).toEqual(before);
    expect(sessions[1]).not.toBe(sessions[0]);
  }finally{const db=createDb();if(threadId)await db.from('kit_threads').delete().eq('id',threadId).eq('owner',owner);if(sessions.length)await db.from('intent_sessions').delete().in('id',sessions);}
},30000);
