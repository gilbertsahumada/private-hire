import type { NextConfig } from 'next';
import { initOpenNextCloudflareForDev } from '@opennextjs/cloudflare';
initOpenNextCloudflareForDev();
const config: NextConfig = { transpilePackages: ['@private-hire/domain', '@private-hire/agent-transport', '@private-hire/chain'] };
export default config;
