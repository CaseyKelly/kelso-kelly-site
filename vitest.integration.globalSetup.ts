import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Pool } from 'pg';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createNeonHttpBridge } = require('./scripts/neon-http-bridge.js');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { NEON_BRIDGE_PORT } = require('./scripts/neon-bridge-port.js');

// Real Postgres to run the integration suite against. Defaults to the
// standard `postgres:16` service-container credentials used in CI (see
// .github/workflows/ci.yml) and in the local docker command documented in
// package.json's test:integration script / CLAUDE.md.
const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/postgres';

const APP_TABLES = ['events', 'photos', 'videos', 'sync_log', 'webhook_channels', 'youtube_uploads', 'contact_rate_limits'];

export default async function setup() {
  const pool = new Pool({ connectionString: TEST_DATABASE_URL });

  try {
    const schema = readFileSync(resolve(__dirname, 'db/schema.sql'), 'utf8');
    await pool.query(schema);
    await pool.query(`TRUNCATE ${APP_TABLES.join(', ')} RESTART IDENTITY CASCADE`);
  } catch (err) {
    await pool.end();
    throw new Error(
      `Failed to prepare test database at ${TEST_DATABASE_URL}. Is Postgres running? ` +
        `(docker run --rm -e POSTGRES_PASSWORD=postgres -e POSTGRES_USER=postgres -p 5432:5432 postgres:16)\n${err}`
    );
  }

  const bridge = createNeonHttpBridge(TEST_DATABASE_URL);
  await new Promise<void>((resolve, reject) => {
    bridge.once('error', reject);
    bridge.listen(NEON_BRIDGE_PORT, '127.0.0.1', () => resolve());
  });

  return async () => {
    await new Promise<void>((res) => bridge.close(() => res()));
    await pool.end();
  };
}
