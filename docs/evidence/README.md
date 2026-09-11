# Evidence index — stage one

Evidence is recorded from this repository's actual commands. No remote deployment or payment is claimed.

| Artifact | What it proves | What it does not prove |
|---|---|---|
| `arc-read.json` | Arc chainId, code at both forwarders and USDC, decimals=6 | Deployment or a transaction |
| `cre-local-reject-no-broadcast.log` | CRE CLI executes handlerInTee path, A2A, private evaluation=2 and Arc read | HTTPS staging, report delivery, a live TEE |
| `cre-local-accept-no-broadcast.log` | CRE CLI executes handlerInTee path, A2A, private evaluation=1 and Arc read | HTTPS staging, report delivery, a live TEE |
| `receiver-deployment-review.json` | Unsigned receiver deployment prepared and gas estimated | Signature, broadcast or receipt |

CRE logs include binary/config hashes and the simulator's explicit TEE disclaimer. Secret values and private bodies are screened before logs are written. Different binary hashes reflect iterations of the workflow; the newest validation snapshot records current source hashes.

## Pending external evidence

- R2 activation and authorization to provision/publish staging.
- Actual Cloudflare Worker URL, D1 and private R2 verification.
- User-controlled receiver deployment and successful Arc receipt.
- Report-writing simulation and two confirmed report transactions.
- Log-trigger simulation using an actual ProbeRecorded transaction.

Do not replace these with local mock results. Once available, receipt verification writes separate `deployment-*.json` and `report-*.json` records. The target label is **CRE simulation + Arc testnet transaction**, not live TEE execution.
