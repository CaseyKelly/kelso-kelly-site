/**
 * Node --require preload for E2E: points the neon() HTTP driver at the local
 * test bridge (see neon-http-bridge.js) instead of a real Neon endpoint,
 * before any application code (src/lib/db.ts) runs. Wired up via
 * NODE_OPTIONS="--require ./scripts/neon-e2e-preload.js" on the `next
 * build`/`next start` processes Playwright spawns for E2E - see
 * playwright.config.ts's webServer config.
 */
const { neonConfig } = require('@neondatabase/serverless');
const { NEON_BRIDGE_PORT } = require('./neon-bridge-port.js');

neonConfig.fetchEndpoint = `http://127.0.0.1:${NEON_BRIDGE_PORT}/sql`;
