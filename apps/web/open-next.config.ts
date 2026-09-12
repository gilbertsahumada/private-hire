import { defineCloudflareConfig } from '@opennextjs/cloudflare';

const config = defineCloudflareConfig();

config.buildCommand = 'pnpm exec next build --webpack';

export default config;
