#!/usr/bin/env node
/**
 * Playwright's webServer command (see playwright.config.ts). Fully
 * self-contained on purpose: Playwright starts webServer and waits for it to
 * become reachable BEFORE running globalSetup, so anything the app's build
 * needs (a seeded database + the neon() HTTP bridge in front of it) has to
 * be ready before we even start `next build` - it can't live in
 * playwright's globalSetup hook, or webServer would deadlock waiting for
 * something globalSetup hasn't been given a chance to create yet.
 *
 * Steps: seed the test Postgres -> start the local neon-http-bridge in this
 * same process -> spawn `next build` then `next start`, both with the
 * neon-e2e-preload.js hook so the app talks to the bridge (and therefore the
 * real seeded Postgres) during build-time prerendering and at runtime.
 */
const { readFileSync } = require('fs');
const { resolve } = require('path');
const { spawn } = require('child_process');
const { Pool } = require('pg');
const { createNeonHttpBridge } = require('./neon-http-bridge.js');
const { NEON_BRIDGE_PORT } = require('./neon-bridge-port.js');

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/postgres';
const APP_TABLES = ['events', 'photos', 'videos', 'sync_log', 'webhook_channels', 'youtube_uploads'];

const children = [];

function run(command, args) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      env: {
        // `next build` evaluates API route modules while collecting page
        // data, which includes src/app/api/contact/route.ts's module-load-time
        // check for these env vars - provide harmless defaults so the build
        // doesn't fail for an E2E run that never exercises the contact route.
        RESEND_API_KEY: 'e2e-test-resend-api-key',
        RESEND_FROM_EMAIL: 'e2e-test@example.com',
        CONTACT_EMAIL: 'e2e-bookings@example.com',
        ...process.env,
        NODE_OPTIONS: `${process.env.NODE_OPTIONS || ''} --require ${require.resolve('./neon-e2e-preload.js')}`.trim(),
      },
    });
    children.push(child);
    child.on('exit', (code) =>
      code === 0 ? resolvePromise() : reject(new Error(`${command} exited with code ${code}`))
    );
    child.on('error', reject);
  });
}

async function seedDatabase() {
  const pool = new Pool({ connectionString: TEST_DATABASE_URL });
  try {
    const schema = readFileSync(resolve(__dirname, '../db/schema.sql'), 'utf8');
    const seed = readFileSync(resolve(__dirname, '../db/test-seed.sql'), 'utf8');
    await pool.query(schema);
    await pool.query(`TRUNCATE ${APP_TABLES.join(', ')} RESTART IDENTITY CASCADE`);
    await pool.query(seed);
  } finally {
    await pool.end();
  }
}

async function main() {
  try {
    await seedDatabase();
  } catch (err) {
    throw new Error(
      `Failed to prepare E2E test database at ${TEST_DATABASE_URL}. Is Postgres running? ` +
        `(docker run --rm -e POSTGRES_PASSWORD=postgres -e POSTGRES_USER=postgres -p 5432:5432 postgres:16)\n${err}`
    );
  }

  const bridge = createNeonHttpBridge(TEST_DATABASE_URL);
  await new Promise((res, rej) => {
    bridge.once('error', rej);
    bridge.listen(NEON_BRIDGE_PORT, '127.0.0.1', () => res());
  });

  await run('npx', ['next', 'build']);
  await run('npx', ['next', 'start']);
}

function shutdown() {
  for (const child of children) child.kill();
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
