import {expect,it} from 'vitest';
import {optimizeProfiles} from '@/server/optimizer';
import type {Candidate,PlanItem} from '@/contract/types';
import type {OptimizerInput} from '@/server/optimizer/types';
import {productSchema,shopSchema} from '@/contract/schemas';
import products from '@/contract/fixtures/products.json';
import shops from '@/contract/fixtures/shops.json';
it('large baskets consider the paired moves needed to unlock a voucher at a less common shop',()=>{
  const candidate=(key:string,shopId:string,price:number,score:number):Candidate=>({product:productSchema.parse({...products[0],id:key+'-'+shopId,shopId,price}),shop:shopSchema.parse({...shops[0],id:shopId,shipFee:0}),score,matchedTags:[],arrivesBy:'2026-09-04'});
  const items:PlanItem[]=Array.from({length:12},(_,i)=>({key:'i'+i,needLabel:'i'+i,category:'notebooks',required:true,quantity:1,mustHaveTags:[],niceToHaveTags:[],maxUnitPrice:null}));
  const input:OptimizerInput={plan:{event:'other',language:'en',budget:110000,deadline:null,assumptions:[],items},candidates:Object.fromEntries(items.map((item,i)=>[item.key,i<2?[candidate(item.key,'a',70000,.2),candidate(item.key,'b',90000,1),candidate(item.key,'c',80000,.1)]:[candidate(item.key,'a',1000,.2),candidate(item.key,'b',1000,1),candidate(item.key,'d',1000,.1)]])),vouchers:[{id:'c-save',code:'C100',scope:'shop',shopId:'c',kind:'fixed',value:100000,maxDiscount:null,minSpend:160000,validUntil:'2099-01-01',ownerPersona:null,label:'Shop C discount'}]};
  for(const option of optimizeProfiles(input)){
    expect(option.status).toBe('ok');
    expect(option.grandTotal).toBe(70000);
    expect(option.lines).toHaveLength(12);
  }
});

import { fitToBudget, priceBasket } from '@/server/optimizer';
it('fit compares landed cost before removing a required product at an expensive shipping shop',()=>{
  const make=(id:string,fee:number):Candidate=>({product:productSchema.parse({...products[0],id,shopId:id,price:100000}),shop:shopSchema.parse({...shops[0],id,shipFee:fee}),score:.8,matchedTags:[],arrivesBy:'2026-09-04'});
  const current=make('costly-shipping',100000),alternative=make('free-shipping',0);
  const input:OptimizerInput={plan:{event:'other',language:'en',budget:150000,deadline:null,assumptions:[],items:[{key:'needed',needLabel:'Needed',category:'notebooks',required:true,quantity:1,mustHaveTags:[],niceToHaveTags:[],maxUnitPrice:null}]},candidates:{needed:[current,alternative]},vouchers:[]};
  const option=priceBasket(input,{needed:current},'balanced');
  expect(fitToBudget(input,option)[0]).toMatchObject({removeItemKeys:[],swaps:[{itemKey:'needed',productId:'free-shipping'}],grandTotal:100000,dropsMustHave:false});
});
it('handles12x8 offers with shop thresholds and public shipping within200ms',()=>{
  const items:PlanItem[]=Array.from({length:12},(_,i)=>({key:'k'+i,needLabel:'Kit item',category:'notebooks',required:true,quantity:1,mustHaveTags:[],niceToHaveTags:[],maxUnitPrice:null}));
  const input:OptimizerInput={plan:{event:'other',language:'en',budget:5000000,deadline:null,items,assumptions:[]},candidates:Object.fromEntries(items.map(item=>[item.key,Array.from({length:8},(_,j)=>({product:productSchema.parse({...products[0],id:item.key+'-'+j,shopId:'s'+j,price:30000+j*20000}),shop:shopSchema.parse({...shops[0],id:'s'+j,shipFee:20000}),score:.3+j*.09,matchedTags:[],arrivesBy:'2026-09-04'}))])),vouchers:Array.from({length:5},(_,j)=>({id:'v'+j,code:'SHOP'+j,scope:'shop' as const,shopId:'s'+j,kind:'fixed' as const,value:30000,maxDiscount:null,minSpend:200000,validUntil:'2099-01-01',ownerPersona:null,label:'Shop saving'}))};
  input.vouchers.push({id:'free',code:'FREESHIP',scope:'platform',shopId:null,kind:'freeship',value:30000,maxDiscount:null,minSpend:200000,validUntil:'2099-01-01',ownerPersona:null,label:'Free ship'});
  const started=performance.now();const options=optimizeProfiles(input);expect(performance.now()-started).toBeLessThan(200);
  expect(options.every(o=>o.status==='ok'&&o.grandTotal<=5000000)).toBe(true);
});
