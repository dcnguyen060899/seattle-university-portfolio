import js from '@eslint/js'
// eslint-config-next v16 ships a real flat-config array, so it is imported
// directly. Do NOT route it through @eslint/eslintrc's FlatCompat — the eslintrc
// validator chokes on the plugin objects and throws
// "Converting circular structure to JSON".
import nextCoreWebVitals from 'eslint-config-next/core-web-vitals'
import tseslint from 'typescript-eslint'

/**
 * Nothing outside lib/agent/env.ts reads process.env directly. That module is
 * where AGENT_DEMO_MODE gating lives (Addendum B, R-13), and a stray read
 * bypasses it — which is how a production deploy ends up serving canned briefs
 * while announcing that it is live.
 *
 * ⚠ SHARED CONST BECAUSE FLAT CONFIG REPLACES, IT DOES NOT MERGE. Any later
 * block that sets `no-restricted-syntax` REPLACES this selector for the files it
 * matches rather than adding to it. Every block that restricts syntax must carry
 * this entry too, or it silently disables the guard exactly where it matters.
 */
const NO_PROCESS_ENV = {
  selector: 'MemberExpression[object.object.name="process"][object.property.name="env"]',
  message:
    'Read configuration through lib/agent/env.ts (capabilities / agentEnv) rather than ' +
    'process.env directly — that module is where AGENT_DEMO_MODE gating happens.',
}

/**
 * ONE SOURCE OF TRUTH FOR NUMBERS — Addendum B, R-5.
 *
 * `lib/facts.ts` and `content/facts.ts` are both DELETED by R-5. The only store
 * is data/corpus/*.json, read through lib/corpus/, and `claimValue(id, surface)`
 * is the only accessor. A component that hardcodes "1,325 recording passes" is
 * how a figure that later moves (the Fischer work is ONGOING — Addendum A.5)
 * ships twice with two different values.
 *
 * These match STRING literals with their surrounding words, not bare integers,
 * so a `195` that is a pixel value or an array index is not a false positive.
 */
const NO_HARDCODED_FIGURE = {
  selector:
    'Literal[value=/\\b(1,325\\s+(recording\\s+)?passes|195\\s+neurons|30,147|1,579\\s+(curated|files)|' +
    '1\\.88M|30\\.4M|R.\\s*=\\s*0\\.959|0\\.487|0\\.585|24\\s+evaluation\\s+cells)\\b/]',
  message:
    'Hardcoded figure about Duy. Read it from the corpus: claimValue(id, surface) in lib/corpus/. ' +
    'The Fischer numbers in particular are live (Addendum A.5) and are refreshed by ' +
    '`npm run corpus:refresh:fischer`; a literal here cannot be refreshed.',
}

/**
 * THE RETRACTION LIST — Addendum B, R-19, as amended by Addendum C.
 *
 * These strings must never appear on any served surface. The authoritative gate
 * is the post-build scan over emitted HTML and over the extracted text of
 * Resume.pdf (spec-05 C9); this rule is the cheap, fast, in-editor half so a
 * developer finds out while typing rather than at the end of a build.
 *
 * NOT banned here, deliberately:
 *   - "660,000" on its own. Addendum C.1 RESOLVED it as MOSAIC's organisational
 *     reach ("recording 660,000 website visits in its 2022 annual report") and
 *     it is a `verified` corpus claim. Only the misattributions are banned.
 *   - "MySQL" and term GPAs. Too many legitimate near-misses for a literal
 *     match; C9's post-build scan owns those with context.
 */
const NO_RETRACTED_CLAIM = {
  selector:
    'Literal[value=/(660K|Analyzed\\s+660|90%\\s+accuracy|180K\\+|95\\.9%\\s+predictive|' +
    'predictive\\s+accuracy|Summer\\s+2026|Winter\\s+2025|110\\s+neurons|8\\s+owls|' +
    '14,000\\+|261\\s+experiments|228\\s+file\\s+loads|Duy\\s+Integral)/i]',
  message:
    'RETRACTED CLAIM (Addendum B R-19 / Addendum C). This string must never reach a served ' +
    'surface. See data/corpus/retractions.json for what replaced it. If you believe the ' +
    'claim is true, it needs a sourced corpus record first — not a literal here.',
}

export default tseslint.config(
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'out/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
      'next-env.d.ts',

      // public/ is served verbatim. public/docs/** in particular is the FROZEN
      // legacy site (Addendum B, R-4): 15 HTML pages, ~350 KB of ES5 and a
      // vendored copy of acorn, every one of them a live URL on a résumé.
      // Linting it would report hundreds of problems nobody may fix.
      'public/**',

      // Python, and archived subtrees that are in git for history and are
      // excluded from the build (.vercelignore).
      'api/**',
      'backend/**',
      'second-brain/**',
      'ml-demos/**',
      'notebook/**',
      'presentation/**',
      'documentation/**',
      'duy-portfolio-mcp/**',
    ],
  },

  js.configs.recommended,

  ...nextCoreWebVitals,

  ...tseslint.configs.recommended,

  {
    // eslint-config-next@16 bundles eslint-plugin-react, whose React
    // auto-detection calls context.getFilename(). Pinning the version skips
    // detection entirely. Keep in step with the `react` dependency.
    settings: { react: { version: '19.2' } },
  },

  {
    files: ['**/*.{ts,tsx,mts,cts}'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'warn',
        { prefer: 'type-imports', fixStyle: 'separate-type-imports' },
      ],
      // Squashing a type error with `any` in a codebase built on
      // noUncheckedIndexedAccess defeats the point of the strict config.
      '@typescript-eslint/no-explicit-any': 'error',
      'no-restricted-syntax': ['error', NO_PROCESS_ENV],
      eqeqeq: ['error', 'smart'],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'no-undef': 'off',
    },
  },

  {
    // Every surface a recruiter can read. Both figure guards apply here, and
    // NO_PROCESS_ENV is repeated because flat config replaces rather than merges.
    files: ['app/**/*.{ts,tsx}', 'components/**/*.{ts,tsx}', 'lib/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': ['error', NO_PROCESS_ENV, NO_HARDCODED_FIGURE, NO_RETRACTED_CLAIM],
    },
  },

  {
    // lib/agent/env.ts is the one module allowed to read process.env; the
    // corpus store is the one place figures are allowed to be literals; the
    // scripts, tests and config files legitimately poke at all of it.
    files: [
      'lib/agent/env.ts',
      'lib/corpus/**/*.ts',
      'scripts/**',
      'tests/**',
      '*.config.ts',
      '*.config.mjs',
    ],
    rules: { 'no-restricted-syntax': 'off', 'no-console': 'off' },
  },

  {
    // Spec files use patterns that are fine in a test and not in app code.
    files: ['tests/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/consistent-type-imports': 'off',
    },
  },
)
