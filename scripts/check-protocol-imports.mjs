import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
// Use the already-pinned esbuild dependency of tsx; no new package or lockfile.
const { build } = createRequire(require.resolve('tsx/package.json'))('esbuild');
for (const entry of ['.', './a2a', './mcp']) {
  const result = await build({
    stdin: {
      contents: `export * from '@private-hire/agent-transport${entry === '.' ? '' : entry.slice(1)}'`,
      resolveDir: new URL('../apps/web', import.meta.url).pathname,
    },
    bundle: true,
    platform: 'browser',
    format: 'esm',
    write: false,
    metafile: true,
  });
  const imports = Object.keys(result.metafile.inputs);
  if (
    imports.some(
      (path) =>
        path.includes('@chainlink') ||
        /agent-transport\/(?:dist|src)\/(?:cre|tee)\./.test(path),
    )
  )
    throw new Error(`CRE leaked into browser import ${entry}`);
  if (entry !== '.' && imports.some((path) => path.includes('packages/domain')))
    throw new Error(`Portfolio leaked into protocol import ${entry}`);
  console.log(
    `${entry}: browser bundle passed; no CRE runtime${entry !== '.' ? ' or portfolio dependency' : ''}`,
  );
}
