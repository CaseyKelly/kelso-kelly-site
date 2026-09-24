import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    // Plain CommonJS Node scripts (run directly via `node`, not bundled by
    // Next.js) - require() is the correct import style here, not an issue
    // the TS-oriented no-require-imports rule should flag.
    files: ["scripts/**/*.js"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  {
    // Allow an intentionally-unused function argument (e.g. a route
    // handler's `request` param required by Next.js's signature but not
    // read by the handler body) when explicitly marked with a `_` prefix.
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_" },
      ],
    },
  },
]);

export default eslintConfig;
