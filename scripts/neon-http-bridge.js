/**
 * Minimal local implementation of the HTTP protocol used by
 * `neon()` from @neondatabase/serverless (the "/sql" endpoint), backed by a
 * real Postgres connection via `pg`.
 *
 * `neon()` always sends queries over HTTP fetch to a Neon-hosted proxy - it
 * has no TCP/wire-protocol fallback, so it can't be pointed directly at a
 * vanilla Postgres instance. This bridge exists so integration tests can run
 * src/lib/db.ts's actual `neon()`-based `sql` tagged template, completely
 * unmodified, against a real Postgres container in CI - the ON CONFLICT /
 * IS DISTINCT FROM / (xmax = 0) upsert logic gets exercised for real instead
 * of mocked.
 *
 * Protocol (reverse-engineered from node_modules/@neondatabase/serverless):
 *   Request:  POST <fetchEndpoint>, JSON body { query: string, params: any[] }
 *   Response: 200 JSON { fields: [{ name, dataTypeID }], rows: [[...]] }
 *             (rows raw-text, matching the client's "Neon-Raw-Text-Output"
 *             expectation - the client applies its own type parsing based on
 *             dataTypeID, so we must NOT let `pg` pre-parse values)
 *             400 JSON { message } on query error
 */

const http = require('http');
const { Pool } = require('pg');

// Disables pg's automatic type coercion so every column comes back as the
// raw text Postgres sent over the wire, exactly like Neon's real HTTP proxy.
const RAW_TEXT_TYPES = { getTypeParser: () => (value) => value };

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

/**
 * @param {string} connectionString Real Postgres connection string to proxy queries to.
 * @returns {import('http').Server} An unstarted HTTP server; call .listen(port).
 */
function createNeonHttpBridge(connectionString) {
  const pool = new Pool({ connectionString });

  const server = http.createServer(async (req, res) => {
    if (req.method !== 'POST') {
      res.writeHead(405).end();
      return;
    }

    try {
      const { query, params } = await readJsonBody(req);
      const result = await pool.query({
        text: query,
        values: params || [],
        rowMode: 'array',
        types: RAW_TEXT_TYPES,
      });

      const body = JSON.stringify({
        fields: result.fields.map((f) => ({ name: f.name, dataTypeID: f.dataTypeID })),
        rows: result.rows,
      });
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(body);
    } catch (err) {
      const body = JSON.stringify({ message: err instanceof Error ? err.message : String(err) });
      res.writeHead(400, { 'Content-Type': 'application/json' }).end(body);
    }
  });

  server.on('close', () => {
    pool.end().catch(() => {});
  });

  return server;
}

module.exports = { createNeonHttpBridge };
