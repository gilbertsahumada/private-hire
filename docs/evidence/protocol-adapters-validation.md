# Protocol adapters validation — 2026-09-13

Scope: isolated `codex/cre-protocol-adapters` worktree; no deployment, broadcast, database migration or marketplace change.

| Check | Result |
| --- | --- |
| `pnpm exec turbo run typecheck --cache-dir=.local/turbo` | 8 tasks passed, with no cached results |
| `pnpm test` | 53 tests passed across 9 files; includes 16 new adapter tests |
| `node scripts/check-protocol-imports.mjs` | Browser bundles for `.`, `./a2a`, `./mcp` exclude CRE; new protocol exports also exclude portfolio domain |
| CRE `probe` / target `local` build | Passed |
| CRE `jobs` / target `staging` build | Passed |
| CRE `deployment-probe` / target `deployed-probe` build | Passed |
| `python3 scripts/protocol-demo.py` | Five successful protocol simulations plus expected rejection of a 307 redirect; destination not contacted |
| Evidence integrity | SHA-256 hashes checked against every referenced CLI log; ephemeral test credential removed |
| Formatting | New TypeScript files pass repository spacing and Prettier checks; Python files formatted with Black 26.1.0 |

The full repository spacing check reports pre-existing violations in `apps/cre/deployment-probe/main.ts`, `apps/web/src/app/jobs/[id]/page.tsx`, `apps/web/src/components/wallet.tsx`, and `tests/browser/market.spec.ts`. Those files were not reformatted in this change.

See [simulation evidence](protocol-adapters-simulation.json), [initial MCP spike](protocol-adapters-mcp-spike.json), and the [package guide](../../packages/agent-transport/README.md).

Unit tests inject transport faults for authentication errors, timeouts, oversized bodies, malformed JSON, mismatched request/task IDs, invalid protocol results, version/capability errors, SSE and required MCP headers. These are unit-level fault tests, not claims that all faults were exercised against a live provider. A2A serialization is checked against official SDK 1.1.0. MCP request metadata, result shapes and error codes follow the official 2026-07-28 references linked in the package guide.

All network examples are our own synthetic local provider. Evidence establishes CRE CLI simulation and configurable endpoints; it does not establish live enclave execution, universal protocol conformance, third-party interoperability certification, or arbitrary-agent hiring through ERC-8183.
