import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import pg from 'pg';
import nextEnv from '@next/env';
import { today } from '../src/server/today';
export async function migrationSql(schema: string): Promise<string> {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(schema)) throw new Error('Invalid schema');
  const directory = fileURLToPath(new URL('../supabase/migrations/', import.meta.url));
  const files = (await readdir(directory)).filter(f => f.endsWith('.sql')).sort();
  return (await Promise.all(files.map(f => readFile(path.join(directory, f), 'utf8')))).join('\n').replaceAll(':"KITLY_DB_SCHEMA"', `"${schema}"`);
}
export async function migrate() {
  nextEnv.loadEnvConfig(process.cwd());
  const schema = process.env.KITLY_DB_SCHEMA || 'public';
  console.log(`db:migrate: schema ${schema}, DEMO_TODAY ${today()}`);
  if (!process.env.SUPABASE_DB_URL) throw new Error('SUPABASE_DB_URL required');
  const sql = await migrationSql(schema);
  const client = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL, connectionTimeoutMillis: 10000, statement_timeout: 60000 });
  try { await client.connect(); await client.query('begin'); await client.query(sql); await client.query('commit'); console.log('Migrated 12 Kitly tables'); }
  catch (error) { await client.query('rollback').catch(()=>{}); throw error; }
  finally { await client.end(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) migrate().catch(() => { console.error('Migration failed; inspect configured database connection/permissions.'); process.exitCode=1; });
