import { defineConfig } from 'vitest/config';
import path from 'path';

// Separate config for DB-integration tests (*.integration.test.ts).
// These run real SQL against a Postgres instance via DATABASE_URL and are
// intentionally excluded from the default `npm test` run so unit tests never
// require a database. Run explicitly with `npm run test:integration` against
// a disposable Postgres (see .github/workflows/ci.yml's db-integration-tests
// job for the CI setup, or start one locally with `docker run -e
// POSTGRES_PASSWORD=postgres -p 5432:5432 postgres:16`).
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    globals: true,
    globalSetup: ['./vitest.integration.globalSetup.ts'],
    setupFiles: ['./vitest.integration.setup.ts'],
    environment: 'node',
    include: ['**/*.integration.test.ts'],
    exclude: ['**/node_modules/**', '**/.next/**', '**/e2e/**'],
    // DB integration tests share state in the same schema; run them serially
    // to avoid cross-test interference.
    fileParallelism: false,
    testTimeout: 15000,
  },
});
