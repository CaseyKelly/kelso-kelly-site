import { neonConfig } from '@neondatabase/serverless';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { NEON_BRIDGE_PORT } = require('./scripts/neon-bridge-port.js');

// Redirect every neon() query in this worker to the local HTTP bridge
// (started once in vitest.integration.globalSetup.ts) instead of a real
// Neon endpoint. Read fresh per-query by the driver, so setting it here
// before any test body runs is sufficient - no import-order dependency on
// when src/lib/db.ts itself was imported.
neonConfig.fetchEndpoint = `http://127.0.0.1:${NEON_BRIDGE_PORT}/sql`;
