import { writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import nextEnv from '@next/env';
import pg from 'pg';
import { categories } from '../src/contract/taxonomy';
import { productSchema } from '../src/contract/schemas';
import { enrichSchoolProducts } from './seed/school';

/** Patch existing school products only. No truncate, regeneration, persona or history writes. */
async function main() {
  nextEnv.loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
  const schema = process.env.KITLY_DB_SCHEMA || 'public';
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(schema))
    throw new Error('Invalid schema');
  if (!process.env.SUPABASE_DB_URL) throw new Error('SUPABASE_DB_URL required');
  const apply = process.argv.includes('--apply');
  const backupArg = process.argv.find((a) => a.startsWith('--backup='));
  if (apply && !backupArg)
    throw new Error('--apply requires --backup=/absolute/path.json');
  const db = new pg.Client({
    connectionString: process.env.SUPABASE_DB_URL,
    connectionTimeoutMillis: 10000,
    statement_timeout: 20000,
  });
  console.log(
    `school enrichment: schema ${schema}, ${apply ? 'APPLY' : 'DRY RUN'}`,
  );
  try {
    await db.connect();
    await db.query(apply ? 'BEGIN' : 'BEGIN READ ONLY');
    const school = categories
      .filter((c) => c.event === 'back_to_school')
      .map((c) => c.id);
    const { rows } = await db.query(
      `SELECT * FROM "${schema}".products WHERE category = ANY($1::text[]) ORDER BY id${apply ? ' FOR UPDATE' : ''}`,
      [school],
    );
    const products = rows.map((row) =>
      productSchema.parse(
        Object.fromEntries(
          Object.entries(row).map(([k, v]) => [
            k.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase()),
            k === 'rating'
              ? Number(v)
              : v instanceof Date
                ? v.toISOString()
                : v,
          ]),
        ),
      ),
    );
    const enriched = enrichSchoolProducts(products);
    const changes = enriched.filter((p, i) => {
      const before = products[i];
      return (
        p.description !== before.description ||
        JSON.stringify(p.tags) !== JSON.stringify(before.tags) ||
        Object.keys(p.attributes).length !==
          Object.keys(before.attributes).length ||
        Object.entries(p.attributes).some(
          ([k, v]) => before.attributes[k] !== v,
        )
      );
    });
    console.log(
      JSON.stringify(
        {
          inspected: products.length,
          changed: changes.length,
          categories: [...new Set(changes.map((p) => p.category))],
          preview: changes
            .filter((p) =>
              ['school-backpack', 'water-bottle'].includes(p.category),
            )
            .slice(0, 3)
            .map((p) => ({ id: p.id, tags: p.tags, attributes: p.attributes })),
        },
        null,
        2,
      ),
    );
    if (apply && changes.length) {
      // A private, exclusive backup is mandatory before the first mutation.
      const backup = backupArg!.slice('--backup='.length);
      if (!backup.startsWith('/'))
        throw new Error('Backup path must be absolute');
      await writeFile(
        backup,
        JSON.stringify({ schema, products: rows }, null, 2),
        { flag: 'wx', mode: 0o600 },
      );
      for (const p of changes) {
        const updated = await db.query(
          `UPDATE "${schema}".products SET tags=$2, attributes=$3::jsonb, description=$4 WHERE id=$1 RETURNING id`,
          [p.id, p.tags, JSON.stringify(p.attributes), p.description],
        );
        if (updated.rowCount !== 1)
          throw new Error(`Update verification failed: ${p.id}`);
      }
      const verified = await db.query(
        `SELECT id,tags,attributes,description FROM "${schema}".products WHERE id=ANY($1::text[])`,
        [changes.map((p) => p.id)],
      );
      for (const p of changes) {
        const actual = verified.rows.find((r) => r.id === p.id);
        if (
          !actual ||
          actual.description !== p.description ||
          JSON.stringify(actual.tags) !== JSON.stringify(p.tags) ||
          Object.keys(actual.attributes).length !==
            Object.keys(p.attributes).length ||
          Object.entries(p.attributes).some(
            ([k, v]) => actual.attributes[k] !== v,
          )
        )
          throw new Error(`Read-back verification failed: ${p.id}`);
      }
      await db.query('COMMIT');
      console.log(
        `Committed and verified ${changes.length} school products; backup: ${backup}`,
      );
    } else {
      await db.query('ROLLBACK');
      console.log(
        apply ? 'Already up to date.' : 'Read-only preview complete.',
      );
    }
  } catch (error) {
    await db.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    await db.end();
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main().catch((error) => {
    // Avoid printing connection configuration or credentials.
    console.error(
      'School enrichment failed:',
      error instanceof Error ? error.message : 'unknown error',
    );
    process.exitCode = 1;
  });
