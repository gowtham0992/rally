import pg, { type PoolClient } from 'pg';
export const localDatabaseUrl = 'postgresql://rally:rally_local_only@127.0.0.1:55432/rally';
export function database(url = process.env.DATABASE_URL) {
  if (!url) throw new Error('DATABASE_URL is required');
  return new pg.Pool({ connectionString: url, max: 12, connectionTimeoutMillis: 5000, statement_timeout: 10000 });
}
export async function transaction<T>(pool: pg.Pool, fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const value = await fn(client);
    await client.query('COMMIT');
    return value;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}
