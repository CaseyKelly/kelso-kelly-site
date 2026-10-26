import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    // Default environment is Node (most tests are lib/API-route logic that
    // should see Node's native fetch Request/Response, not jsdom's). Component
    // tests opt into jsdom individually via a `// @vitest-environment jsdom`
    // docblock at the top of the file.
    environment: 'node',
    exclude: ['**/node_modules/**', '**/.next/**', '**/e2e/**', '**/*.integration.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'src/**/*.integration.test.ts',
        'src/app/**/layout.tsx',
        'src/app/**/page.tsx',
        'src/types/**',
        'src/data/**',
      ],
    },
  },
});
