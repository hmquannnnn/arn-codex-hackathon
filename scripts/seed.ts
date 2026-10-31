import { pathToFileURL } from 'node:url';
import nextEnv from '@next/env';
import pg from 'pg';
import { today } from '../src/server/today';
import { OpenAILLM } from '../src/server/llm/client';
import { buildCatalog } from './seed/catalog';
import { generateCatalog } from './seed/generate';
import { generateDemand } from './seed/demand';

const tables = ['kit_messages','kit_versions','kit_threads','demand_items','intent_sessions','product_versions','vouchers','personas','insight_advice','demand_watches','products','shops'];
function snakeRow(row: object) {
  return Object.fromEntries(Object.entries(row).map(([k,v])=>[k.replace(/[A-Z]/g, c=>'_'+c.toLowerCase()),v]));
}
export async function seedWorld(world: ReturnType<typeof buildCatalog>, demand: ReturnType<typeof generateDemand>) {
  const schema=process.env.KITLY_DB_SCHEMA || 'public';
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(schema)) throw new Error('Invalid schema');
  if (!process.env.SUPABASE_DB_URL) throw new Error('SUPABASE_DB_URL required');
  const db=new pg.Client({connectionString:process.env.SUPABASE_DB_URL,connectionTimeoutMillis:10000,statement_timeout:60000});
  async function insert(table: string, rows: object[]) {
    for (let i=0;i<rows.length;i+=300) {
      const part=rows.slice(i,i+300).map(snakeRow);
      const cols=Object.keys(part[0]).map(c=>`"${c}"`).join(',');
      await db.query(`insert into "${schema}"."${table}" (${cols}) select ${cols} from jsonb_populate_recordset(null::"${schema}"."${table}", $1::jsonb)`,[JSON.stringify(part)]);
    }
  }
  try {
    await db.connect(); await db.query('begin');
    // Explicit allowlist, no CASCADE: references from any non-Kitly table stop the transaction.
    await db.query(`truncate ${tables.map(t=>`"${schema}"."${t}"`).join(',')} restart identity`);
    await insert('shops',world.shops); await insert('products',world.products); await insert('vouchers',world.vouchers);
    await insert('personas',world.personas.filter(p=>p.id==='lan').map(({address,...p})=>({...p,district:address?.district??null,city:address?.city??null})));
    await insert('intent_sessions',demand.sessions); await insert('demand_items',demand.demandItems);
    await db.query('commit');
    for (const table of tables) {
      const result=await db.query(`select count(*)::int as count from "${schema}"."${table}"`);
      console.log(`${table}: ${result.rows[0].count}`);
    }
    for (const [label, category, tag] of [['anti-hunchback','school-backpack','anti-hunchback'],['backpack-cover','kids-raincoat','backpack-cover'],['anti-blue-light','kids-desk-lamp','anti-blue-light'],['pet',null,null]]) {
      const r=await db.query(`select count(distinct session_id) filter (where created_at >= $3::date - interval '6 days' and created_at < $3::date + interval '1 day')::int as this_week, count(distinct session_id) filter (where created_at >= $3::date - interval '13 days' and created_at < $3::date - interval '6 days')::int as last_week from "${schema}".demand_items where category is not distinct from $1 and ($2::text is null or $2=any(tags))`,[category,tag,today()]);
      console.log(`${label}: thisWeek ${r.rows[0].this_week}, lastWeek ${r.rows[0].last_week}`);
    }
  } catch(error) { await db.query('rollback').catch(()=>{}); throw error; }
  finally { await db.end(); }
}
async function main() {
  nextEnv.loadEnvConfig(process.cwd());
  console.log(`seed: schema ${process.env.KITLY_DB_SCHEMA || 'public'}, DEMO_TODAY ${today()}`);
  const generated=await generateCatalog(new OpenAILLM());
  const world=buildCatalog(generated,today());
  await seedWorld(world,generateDemand(world.products,today()));
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) main().catch(e=>{console.error('Seed failed:', e instanceof Error ? e.message : 'unknown error');process.exitCode=1;});
