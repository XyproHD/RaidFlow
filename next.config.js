/** @type {import('next').NextConfig} */
const createNextIntlPlugin = require('next-intl/plugin');
const withNextIntl = createNextIntlPlugin();

const nextConfig = {
  reactStrictMode: true,
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
