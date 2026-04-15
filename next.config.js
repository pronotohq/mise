/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['web-push', '@anthropic-ai/sdk'],
};

module.exports = nextConfig;
