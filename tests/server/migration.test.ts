import { expect, it } from 'vitest';
import { migrationSql } from '../../scripts/migrate';
it('renders the configured schema and limits reset to the twelve Kitly tables', async () => {
  const sql = await migrationSql('public');
  expect(sql.trimStart()).toMatch(/^create schema if not exists "public";/);
  expect(sql).not.toMatch(/drop schema|drop table[^;]*cascade/i);
  expect(sql.match(/drop table if exists/g)).toHaveLength(12);
  expect(sql).toContain('grant usage on schema "public" to service_role');
  expect(sql).not.toContain(':"KITLY_DB_SCHEMA"');
  await expect(migrationSql('bad";drop schema public')).rejects.toThrow('Invalid schema');
});
