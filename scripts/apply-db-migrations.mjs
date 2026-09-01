import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import pg from 'pg';

const { Client } = pg;
const root = process.cwd();
const migrationsDir = path.join(root, 'supabase', 'migrations');
const connectionString =
  process.env.SUPABASE_DB_URL ?? process.env.DATABASE_URL ?? process.env.LOCAL_DATABASE_URL;

if (!connectionString) {
  console.error(
    'Missing database connection string. Set SUPABASE_DB_URL, DATABASE_URL or LOCAL_DATABASE_URL.',
  );
  process.exit(1);
}

const client = new Client({
  connectionString,
  ssl: /supabase\.(co|com)|pooler\.supabase\.(co|com)/i.test(connectionString)
    ? { rejectUnauthorized: false }
    : undefined,
});

async function main() {
  await client.connect();
  try {
    await client.query('begin');
    await client.query('create schema if not exists bubu_private');
    await client.query(`
      create table if not exists bubu_private.schema_migrations (
        version text primary key,
        name text not null,
        checksum text not null,
        executed_at timestamptz not null default clock_timestamp()
      )
    `);
    await client.query('commit');

    const files = (await fs.readdir(migrationsDir))
      .filter((file) => /^\d+.*\.sql$/.test(file))
      .sort((a, b) => a.localeCompare(b));

    if (!files.length) throw new Error(`No migrations found in ${migrationsDir}`);

    for (const file of files) {
      const fullPath = path.join(migrationsDir, file);
      const sql = await fs.readFile(fullPath, 'utf8');
      const version = file.replace(/\.sql$/, '');
      const checksum = Buffer.from(
        await crypto.subtle.digest('SHA-256', new TextEncoder().encode(sql)),
      ).toString('hex');
      const existing = await client.query(
        'select checksum from bubu_private.schema_migrations where version=$1',
        [version],
      );
      if (existing.rowCount) {
        if (existing.rows[0].checksum !== checksum) {
          throw new Error(`Migration ${file} was already executed with a different checksum.`);
        }
        console.log(`skip ${file}`);
        continue;
      }

      console.log(`apply ${file}`);
      await client.query('begin');
      try {
        await client.query(sql);
        await client.query(
          'insert into bubu_private.schema_migrations(version,name,checksum) values($1,$2,$3)',
          [version, file, checksum],
        );
        await client.query('commit');
      } catch (error) {
        await client.query('rollback');
        throw error;
      }
    }

    console.log('Database migrations are up to date.');
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
