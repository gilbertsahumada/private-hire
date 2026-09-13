# PrivateHire

A pnpm/Turborepo monorepo testing an A2A 1.0 portfolio agent, encrypted Cloudflare persistence and a confidential CRE workflow's report path to Arc Testnet.

**Current evidence:** the Worker builds and runs in local `workerd`; D1/R2 integration and two CRE CLI simulations succeed (accept/reject with private tolerances). Arc read-only RPC confirms the forwarders and USDC decimals. The simulation-only receiver is deployed on Arc with a confirmed receipt. Both CRE report transactions and the EVM log-trigger simulation are confirmed. Cloudflare HTTPS staging is live; remote D1/R2 integration and both complete CRE HTTPS report executions pass, with confirmed Arc receipts and matching artifact commitments. The CRE simulator is **not a real TEE**.

The Agents / Jobs / Provider application now integrates browser SIWE, encrypted quotes and the existing ERC-8183 escrow. The evaluator is deployed and verified. Staging contracting is enabled for the authorized first browser-wallet test journey when live checks pass. Paid/reject/refund evidence remains pending. See [market implementation](docs/MARKET_IMPLEMENTATION.md). No deployed CRE workflow is claimed; `ProbeReceiver` remains a separate, fund-free historical probe.

## Workspace

- `apps/web`: Next.js App Router + OpenNext, A2A and scoped internal endpoints.
- `apps/cre`: confidential HTTP probe and read-only EVM log handler.
- `packages/domain`: schemas, canonical commitments and exact arithmetic.
- `packages/agent-transport`: A2A JSON codecs; separate `./tee` export for CRE.
- `packages/contracts`: Foundry receiver and tests.
- `packages/chain`: Arc configuration and generated receiver ABI.
- `packages/config`: shared configuration notes; root configs are authoritative.

## Local quickstart

Requirements: Node 22, pnpm 10.12.1, Bun >=1.2.21, CRE CLI 1.33.0, Foundry/Solc 0.8.28. See `docs/COMPATIBILITY.md` for the exact tested versions.

```sh
pnpm install --frozen-lockfile
pnpm --filter @private-hire/domain build
pnpm --filter @private-hire/agent-transport build
pnpm --filter @private-hire/chain build
python3 scripts/local-setup.py
pnpm --filter @private-hire/web db:migrate
pnpm web:build
pnpm web:preview
```

In another terminal at the repository root:

```sh
pnpm exec tsx scripts/probe-integration.ts
python3 scripts/simulate.py reject
python3 scripts/simulate.py accept
pnpm test
pnpm contracts:test
pnpm typecheck
```

Local setup refuses to overwrite credentials. Integration creates unique synthetic probes and public trigger payloads under ignored `.local/`. Repeating a completed task returns the same envelope and nonce. CRE reads scoped credentials from ignored `apps/cre/.env`.

## Deployment and evidence

See `docs/DEPLOYMENT.md` for the prepared staging and unsigned receiver transaction, and `docs/DEMO_RUNBOOK.md` for the three levels of evidence. Nothing in the quickstart publishes infrastructure or broadcasts transactions.

The source specification describes the full future MVP; `IMPLEMENTATION_PLAN.md` tracks this stage only. Evidence is indexed in `docs/evidence/README.md`.

## Source formatting

Use expanded objects, separate statements and clearly indented blocks so source files are easy to read. Keep a blank line between functions and top-level declarations, and before a final return after preceding work. The TypeScript spacing pass checks that source tokens stay unchanged. Preserve multiline object layouts rather than compressing them.

- `pnpm format`: format TypeScript/TSX/configuration with Prettier 3.9.6, Python with Black 26.1.0 and Solidity with `forge fmt`.
- `pnpm format:check`: check the same conventions without edits.

Python formatting uses the installed `uv` runner, which keeps Black isolated from global Python packages. Historical evidence, the original specification, secrets and build outputs are excluded.
