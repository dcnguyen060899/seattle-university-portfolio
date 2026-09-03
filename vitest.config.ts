import { defineConfig } from 'vitest/config'

/**
 * Deliberately minimal: this file exists to SCOPE TEST DISCOVERY and nothing
 * else. Extend it freely — no assertion, environment or coverage decision has
 * been made here, so nothing below should be in anyone's way.
 *
 * Without it, `vitest run` walks the whole repository from the root and collects
 * `backend/tests/js/*.test.mjs`. Those are `node:test` files, not Vitest specs:
 * they are run by `node --test` in .github/workflows/backend-tests.yml, they
 * import the real challenge worker, and under Vitest they execute their module
 * bodies and report "no tests" — a suite that appears to run and asserts
 * nothing. Verified 2026-09-02: `npm run test` with no config collected 3 files
 * out of backend/ and reported zero tests.
 *
 * `second-brain/` is a whole second Vite + TypeScript application with its own
 * config, and `duy-portfolio-mcp/` ships a committed `dist/`. Neither is built
 * or deployed here (see .vercelignore), and neither should be collected.
 */
export default defineConfig({
  test: {
    include: ['tests/**/*.{test,spec}.{ts,tsx,mts}'],
    exclude: [
      '**/node_modules/**',
      '**/.next/**',
      // Playwright owns tests/e2e — it has its own runner, its own fixtures and
      // @axe-core/playwright. Vitest must not try to collect those specs.
      'tests/e2e/**',
      // Other runners, other repos, other build systems.
      'backend/**',
      'second-brain/**',
      'ml-demos/**',
      'duy-portfolio-mcp/**',
      // The frozen legacy site. 350 KB of ES5 and a vendored copy of acorn.
      'public/**',
    ],
  },
})
