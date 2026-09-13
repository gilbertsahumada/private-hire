import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    // Keep spies on the same SDK instance across pnpm optional-peer variants.
    alias: [
      {
        find: /^@chainlink\/cre-sdk$/,
        replacement: new URL(
          './apps/cre/node_modules/@chainlink/cre-sdk/dist/index.js',
          import.meta.url,
        ).pathname,
      },
    ],
  },
  test: {
    include: ['tests/**/*.test.ts'],
    server: { deps: { inline: [/@chainlink\/cre-sdk/, /@private-hire\//] } },
  },
});
