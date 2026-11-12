// Tailwind v4 runs through PostCSS so it works with both Turbopack and webpack (`next dev --webpack`).
const config = { plugins: { "@tailwindcss/postcss": {} } };
export default config;
