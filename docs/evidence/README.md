# Evidence index — stage one

Evidence is recorded from this repository's actual commands. The Arc simulation-only receiver deployment is confirmed. Both report transactions are confirmed. No escrow payment is claimed.

| Artifact | What it proves | What it does not prove |
|---|---|---|
| `arc-read.json` | Arc chainId, code at both forwarders and USDC, decimals=6 | Deployment or a transaction |
| `cre-local-reject-no-broadcast.log` | CRE CLI executes handlerInTee path, A2A, private evaluation=2, Arc read and simulated writeReport | HTTPS staging, report delivery, a live TEE |
| `cre-local-accept-no-broadcast.log` | CRE CLI executes handlerInTee path, A2A, private evaluation=1, Arc read and simulated writeReport | HTTPS staging, report delivery, a live TEE |
| `receiver-deployment-review.json` | Unsigned receiver deployment prepared and gas estimated | Signature, broadcast or receipt |

CRE logs include binary/config hashes and the simulator's explicit TEE disclaimer. Secret values and private bodies are screened before logs are written. Different binary hashes reflect iterations of the workflow; the newest validation snapshot records current source hashes.

## Integration follow-up

- R2 binding now succeeds; successful deployment and remote validation are recorded in `cloudflare-staging-validation.json`.
- HTTPS Worker, D1 and encrypted private R2 verified. Both `cre-staging-*-no-broadcast.log` runs now verify HTTPS transport/evaluation, Arc reads and simulated writeReport. They do not broadcast transactions.
- Receiver deployment completed: `deployment-320891028abb.json` records its verified receipt and fee.
- Report-writing dry runs and both report transactions completed; see `report-45203c0381dd.json` and `report-4b8ebf26e177.json`.
- Log-trigger simulation completed against the actual rejection transaction: `cre-local-log-no-broadcast.log`.

Do not replace these with local mock results. Once available, receipt verification writes separate `deployment-*.json` and `report-*.json` records. The target label is **CRE simulation + Arc testnet transaction**, not live TEE execution.

`cre-local-report-dry-run.json` records the probe identifiers and RPC checks showing zero stored decisions/report hashes after both simulations. The logs show `not-broadcast`; no onchain report delivery is claimed.

`arc-report-summary.json` compares onchain result hashes with A2A artifacts and records both fees and the post-report wallet balance. Scope: **CRE simulation + Arc testnet transaction**, with a local HTTP agent; no live TEE or remote Cloudflare proof.

`cre-staging-report-dry-run.json` records the unified HTTPS report simulation, binary/config hashes and RPC checks that both new probe decisions were zero onchain at the time of the dry run. Later authorized broadcasts are recorded separately.

## Complete HTTPS report execution

`https-arc-report-summary.json` records the two authorized transactions from the HTTPS staging workflow. Their receipts are `report-67397c6db229.json` (rejection) and `report-cd1ee7bcc7fc.json` (acceptance). Recalculated commitments of artifacts recovered through HTTPS match both event hashes. `cre-staging-log-no-broadcast.log` verifies the EVM trigger against the new rejection event without producing another report. Scope remains **CRE simulation + Arc testnet transaction**, not a live TEE.

## Market application (pending onchain activation)

`market-validation.json` records the application build, automated tests, published Worker and live authentication checks. `market-deployment-prepared.json` is an unsigned evaluator proposal, not a receipt. The three paid/reject/refund job journeys remain pending. Earlier probes are not market jobs.

`job-evaluator-deployment.json` confirms the separately authorized JobEvaluator deployment and its runtime bytecode, immutable configuration, canonical receipt and actual gas fee. This is a deployment transaction only; no job funding or CRE job report broadcast is claimed.
