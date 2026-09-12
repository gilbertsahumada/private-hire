# Deployment review — stage one

## Current blockers and destinations

- Connected Cloudflare account: `bc8d4adf4860284fda426b24e7377bc2`.
- Worker: `confidential-agent-jobs-staging`, on that account's workers.dev subdomain.
- D1: `confidential-agent-jobs-staging`, UUID `52155584-f6b0-448c-b3f4-1c86c3e80381` (created and migrated).
- Private R2: `confidential-agent-jobs-private-staging` (created, Standard class, EEUR).
- User confirmed R2 activation and authorized staging. Listing and creating buckets succeeds. The subsequent retry succeeded: Worker version `67b21fe9-db2a-4fe1-987b-ada1c585c3ce` is live at `https://confidential-agent-jobs-staging.gilbertsahumada.workers.dev`. Remote D1/R2 integration, encrypted-object recovery and both CRE HTTPS simulations passed. The exact cause of the earlier 10136 error was not established.
- Arc: chainId 5042002. The unsigned ProbeReceiver deployment is prepared under ignored `.local/receiver-deployment.json`; its review is in `docs/evidence/receiver-deployment-review.json`.
- Dedicated wallet `0x0C68C8D018ba72C33e966498B2148dC2af454645` is configured in the ignored root `.env`. The user authorized the receiver deployment with a 0.02 test USDC gas cap.
- Receiver `0x98b1a734b54a9a02C2EB68062061e273b3D264D0` was deployed in transaction `0x320891028abbf3a149f3a700f697c838743a2a348ffa9f7cd1203f609ad67e26`. Receipt verified: fee 0.007855452 test USDC. The user subsequently authorized both report broadcasts; acceptance and rejection are confirmed in `docs/evidence/arc-report-summary.json`.

Wrangler and CRE staging configs now contain the actual D1 UUID and planned origin `https://confidential-agent-jobs-staging.gilbertsahumada.workers.dev`. The staging config contains the verified receiver address; `writeReport` is now true; both HTTPS report dry runs passed. Broadcasting these new staging fixtures remains pending authorization. Resource creation commands below are the runbook; check existing resources before re-running them.

## Cloudflare (staging authorization already granted)

From `apps/web`, create the named D1 and R2 resources using Wrangler. Check existing names first; never replace an unrelated resource. Keep R2 private (no r2.dev or custom domain).

```sh
pnpm exec wrangler d1 create confidential-agent-jobs-staging
pnpm exec wrangler r2 bucket create confidential-agent-jobs-private-staging
```

Use the returned D1 UUID and the account's real workers.dev origin, then run from the repository root:

```sh
python3 scripts/configure-staging.py --origin https://ACTUAL-WORKER-ORIGIN --database-id ACTUAL-D1-UUID
pnpm --filter @private-hire/web exec wrangler d1 migrations apply DB --remote
```

Generate dedicated staging service credentials and a fresh 32-byte hex storage key in a local ignored file, protected with mode 0600. Set `STORAGE_KEY`, `A2A_TOKEN`, `CONTEXT_TOKEN` and `SETUP_TOKEN` using `wrangler secret put` or its bulk-JSON stdin interface; do not place secret values in command arguments, terminal transcripts or Git. Copy only the A2A/context credentials into the ignored CRE environment when testing staging. Preserve local credentials separately.

```sh
pnpm web:build
ALLOW_STAGING_DEPLOY=yes pnpm web:deploy
PROBE_ORIGIN=https://ACTUAL-WORKER-ORIGIN PROBE_CREDENTIALS_FILE=.local/staging-service.env pnpm exec tsx scripts/probe-integration.ts
```

Only synthetic inputs are authorized for this staging. Record the actual URL, resource identifiers and encrypted-object verification after successful provisioning, not before.

## Arc receiver (user-controlled signatures)

```sh
pnpm contracts:build
python3 scripts/generate-abi.py
python3 scripts/prepare-receiver.py
```

The unsigned transaction contains deployment bytecode and the verified mock forwarder constructor argument; value is zero. The recorded estimate was 361067 gas at 22 gwei, approximately 0.007943474 native USDC. Estimates may change. No USDC allowance or transfer is needed.

The user may sign the prepared transaction through their wallet, or deploy using Foundry with a locally managed keystore:

```sh
cd packages/contracts
forge create src/ProbeReceiver.sol:ProbeReceiver --rpc-url https://rpc.testnet.arc.io --constructor-args 0x6E9EE680ef59ef64Aa8C7371279c27E496b5eDc1 --account USER_KEYSTORE_NAME --broadcast
```

The command above broadcasts and must only be run after explicit authorization. Never use the default CRE simulator key as the deployer. Verify the receipt before adding the receiver address:

```sh
pnpm --filter @private-hire/cre verify:receipt deployment ACTUAL_TX_HASH
python3 scripts/configure-staging.py --origin https://ACTUAL-WORKER-ORIGIN --database-id ACTUAL-D1-UUID --receiver ACTUAL_RECEIVER_ADDRESS
```

## Reports and log verification

First run the staging simulations **without** broadcast. Then, only after explicit authorization, configure the dedicated signer in the ignored root `.env` (the wrapper reads it only with `--broadcast`) and run:

```sh
ALLOW_ARC_BROADCAST=yes python3 scripts/simulate.py reject --target staging --broadcast
ALLOW_ARC_BROADCAST=yes python3 scripts/simulate.py accept --target staging --broadcast
pnpm --filter @private-hire/cre verify:receipt report ACTUAL_TX_HASH ACTUAL_PROBE_ID
python3 scripts/simulate.py log --target staging --tx-hash ACTUAL_TX_HASH --log-index ACTUAL_LOG_INDEX
```

CRE CLI's default simulator key is suitable only for dry runs. If the user chooses browser signatures and cannot provide a CLI signer, stop before broadcast and adapt the submission path with the user; do not export or collect their wallet key through chat.

A successful transaction through MockKeystoneForwarder demonstrates only the simulation/testnet path. The deployed Confidential Workflows mode, its real identity checks and escrow settlement are later stages.

## Completed receiver deployment

The authorized deployment was submitted from `apps/cre` with `ALLOW_ARC_DEPLOY=yes pnpm exec tsx scripts/deploy-receiver.ts`. The script checks chain, wallet, bytecode, constructor and a maximum 0.02 test USDC fee; it records the signed transaction hash before broadcasting and refuses duplicate submissions. It reads only the local root `.env`; wallet credentials are not Worker secrets.

The receipt is in `docs/evidence/deployment-320891028abb.json`. Solidity formatting afterward changes source metadata for future builds, so the newly compiled bytecode need not be byte-for-byte identical to the deployment artifact even though formatting preserves behavior.

For EVM log replay, `--log-index` maps to CRE `--evm-event-index`: use `receiptEventIndex` from receipt verification (zero-based within the transaction). `logIndex` is the global block log index and is not interchangeable. The verified rejection event has receiptEventIndex 0 and global logIndex 131.
