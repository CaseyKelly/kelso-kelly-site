// eslint-disable-next-line @typescript-eslint/no-require-imports
const { NEON_BRIDGE_PORT } = require('./scripts/neon-bridge-port.js');

// Redirect every neon() query in this worker to the local HTTP bridge
// (started once in vitest.integration.globalSetup.ts) instead of a real
// Neon endpoint. src/lib/db.ts reads this env var at its own module-load
// time, so it must be set before any test file imports it - setupFiles run
// before test bodies, so this is early enough.
process.env.NEON_HTTP_BRIDGE_URL = `http://127.0.0.1:${NEON_BRIDGE_PORT}/sql`;
