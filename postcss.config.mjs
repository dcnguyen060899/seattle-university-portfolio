/**
 * Tailwind v4 is configured CSS-first: the Seattle University tokens and the
 * ground-context mechanism live in app/globals.css under `@theme static`.
 * There is no tailwind.config.js and there should not be one.
 */
const config = {
  plugins: {
    '@tailwindcss/postcss': {},
  },
}

export default config
