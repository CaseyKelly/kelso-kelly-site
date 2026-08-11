// Single source of truth for the port the local Neon HTTP bridge (see
// neon-http-bridge.js) listens on during integration tests, shared between
// the Vitest globalSetup (which starts the bridge) and the per-worker
// setupFile (which points neonConfig.fetchEndpoint at it).
module.exports = { NEON_BRIDGE_PORT: Number(process.env.NEON_BRIDGE_PORT) || 51213 };
