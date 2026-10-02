import { readFile } from 'node:fs/promises';
import { database, transaction, localDatabaseUrl } from '../src/db.ts';
const pool = database(process.env.DATABASE_URL ?? localDatabaseUrl);
try {
  await transaction(pool, async client => {
    await client.query('SELECT pg_advisory_xact_lock(728119)');
    await client.query('CREATE TABLE IF NOT EXISTS schema_migrations(version text PRIMARY KEY)');
    for (const version of ['001_payments','002_qualified_payers','003_reconciliation_schedule','004_private_intake','005_collection_consent','006_merchant_offers']) {
      const exists = await client.query('SELECT 1 FROM schema_migrations WHERE version=$1',[version]);
      if (!exists.rowCount) {
        await client.query(await readFile(new URL(`../db/${version}.sql`,import.meta.url),'utf8'));
        await client.query('INSERT INTO schema_migrations VALUES ($1)',[version]);
      }
    }
  });
  console.log('Payment schema ready.');
} finally { await pool.end(); }
