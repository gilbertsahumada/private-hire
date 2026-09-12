# Stage one — implementation status

## Completed

- [x] Scope and Arc tenant configuration confirmed; read-only RPC evidence recorded.
- [x] Local Git initialized; linked to existing `gilbertsahumada/private-hire` and periodic commits pushed.
- [x] pnpm/Turborepo workspace, pinned dependencies and single lockfile.
- [x] Domain schemas, canonical commitments and exact arithmetic.
- [x] A2A 1.0 codecs verified against the official SDK.
- [x] Scoped routes and AES-GCM D1/R2 persistence with immutable result recovery.
- [x] ProbeReceiver compiled; 12 Foundry tests pass.
- [x] Next.js/OpenNext build and local workerd integration, including concurrent requests and credential scopes.
- [x] Confidential HTTP handler, public report path and auxiliary EVM log handler implemented.
- [x] WASM compilation and two actual CRE CLI simulations: acceptance/rejection plus Arc USDC reads.
- [x] 17 unit tests cover domain, protocol, persistence and workflow failure handling.
- [x] Deployment review, unsigned receiver transaction, receipt-verification and simulation scripts.

## Waiting on external actions — stage NOT complete

- [x] User activated R2 and authorized staging; bucket listing/creation now succeeds.
- [x] Dedicated D1 created and migrated; private Standard R2 bucket and Worker secrets created.
- [ ] Publish Worker and verify HTTPS/D1/private R2. Two deployment attempts failed with Cloudflare 10136 when attaching the existing R2 bucket; activation/entitlement inconsistency remains unresolved.
- [ ] User chooses signing method and authorizes receiver deployment/report broadcasts.
- [ ] Verify receiver deployment, run report-writing simulations and record two Arc report receipts.
- [ ] Run log-trigger simulation against a real confirmed ProbeRecorded event.

Access to CRE beta is confirmed. No escrow/payments or deployed confidential workflow in this stage. Local simulations currently set `writeReport:false`; they establish transport/evaluation and reads, not report submission.

## Commits

- `a7f10a5`: monorepo foundation, deterministic domain and probe receiver.
- `a4d248c`: A2A service, encrypted Cloudflare storage and integration scripts.
- Subsequent commits record CRE workflow, evidence, deployment preparation and validation fixes. See Git history for their hashes.
