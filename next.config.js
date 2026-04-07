/** @type {import('next').NextConfig} */
const createNextIntlPlugin = require('next-intl/plugin');
const withNextIntl = createNextIntlPlugin();

const nextConfig = {
  reactStrictMode: true,
  eslint: {
    // Vercel/CI builds must be non-interactive; missing ESLint config can trigger setup prompts.
    // We keep linting available via `npm run lint` once configured, but don't fail production builds on it.
    ignoreDuringBuilds: true,
  },
  async redirects() {
    return [
      {
        source: '/:locale/guild/:guildId/raid/:raidId/signup',
        destination: '/:locale/guild/:guildId/raid/:raidId?mode=signup',
        permanent: false,
      },
    ];
  },
};

module.exports = withNextIntl(nextConfig);
