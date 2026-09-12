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

## Integration evidence

- [x] User activated R2 and authorized staging; bucket listing/creation now succeeds.
- [x] Dedicated D1 created and migrated; private Standard R2 bucket and Worker secrets created.
- [x] Publish Worker and verify HTTPS/D1/private R2. Retry succeeded; remote concurrency, encrypted-object recovery and AEAD tamper rejection verified.
- [x] Two CRE simulations against HTTPS staging returned decisions 2 and 1 with Arc reads, without broadcast.
- [x] User authorized a dedicated local wallet and receiver deployment capped at 0.02 test USDC. Deployment confirmed; fee 0.007855452 test USDC.
- [x] User separately authorized both report broadcasts; both submitted and confirmed.
- [x] Verify deployed receiver `0x98b1a734b54a9a02C2EB68062061e273b3D264D0`, mock forwarder and simulation-only flag.
- [x] Run both report-writing CRE simulations without broadcast (decisions 2 and 1); verify neither probe is stored onchain.
- [x] Broadcast both reports; verify successful receipts, decisions and artifact hashes against A2A.
- [x] Run log-trigger simulation against the real rejection ProbeRecorded event; no additional report or transaction.

Access to CRE beta is confirmed. No escrow/payments or deployed confidential workflow in this stage. Local simulations now set `writeReport:true` against the deployed receiver. Dry runs and authorized broadcasts both passed. Evidence now includes real Arc report receipts and a log-trigger simulation, using the local HTTP agent. HTTPS staging now works; its two complete report simulations now use `writeReport:true` without broadcast. Arc broadcast evidence was obtained separately through the local HTTP agent. No live TEE execution is claimed.

## Commits

- `a7f10a5`: monorepo foundation, deterministic domain and probe receiver.
- `a4d248c`: A2A service, encrypted Cloudflare storage and integration scripts.
- Subsequent commits record CRE workflow, evidence, deployment preparation and validation fixes. See Git history for their hashes.

The unified HTTPS-to-report dry run passed for both decisions. New broadcasts using those HTTPS fixtures remain pending explicit authorization. See `docs/evidence/cre-staging-report-dry-run.json`.
