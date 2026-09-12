# Deployment review — stage one

## Current blockers and destinations

- Connected Cloudflare account: `bc8d4adf4860284fda426b24e7377bc2`.
- Worker: `confidential-agent-jobs-staging`, on that account's workers.dev subdomain.
- D1: `confidential-agent-jobs-staging`, UUID `52155584-f6b0-448c-b3f4-1c86c3e80381` (created and migrated).
- Private R2: `confidential-agent-jobs-private-staging` (created, Standard class, EEUR).
- User confirmed R2 activation and authorized staging. Listing and creating buckets succeeds. Worker secrets are installed, but publishing the application failed twice with API error 10136: R2 binding requires activation. The cause is not confirmed; no successful HTTPS application deployment is claimed.
- Arc: chainId 5042002. The unsigned ProbeReceiver deployment is prepared under ignored `.local/receiver-deployment.json`; its review is in `docs/evidence/receiver-deployment-review.json`.
- No wallet address/key has been selected. No transaction was signed or broadcast by the implementation.

Wrangler and CRE staging configs now contain the actual D1 UUID and planned origin `https://confidential-agent-jobs-staging.gilbertsahumada.workers.dev`. The receiver remains unconfigured. Resource creation commands below are the runbook; check existing resources before re-running them.

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

First run the staging simulations **without** broadcast. Then, only after explicit authorization, provide the user's CRE signing credential through their local secret environment and run:

```sh
ALLOW_ARC_BROADCAST=yes python3 scripts/simulate.py reject --target staging --broadcast
ALLOW_ARC_BROADCAST=yes python3 scripts/simulate.py accept --target staging --broadcast
pnpm --filter @private-hire/cre verify:receipt report ACTUAL_TX_HASH ACTUAL_PROBE_ID
python3 scripts/simulate.py log --target staging --tx-hash ACTUAL_TX_HASH --log-index ACTUAL_LOG_INDEX
```

CRE CLI's default simulator key is suitable only for dry runs. If the user chooses browser signatures and cannot provide a CLI signer, stop before broadcast and adapt the submission path with the user; do not export or collect their wallet key through chat.

A successful transaction through MockKeystoneForwarder demonstrates only the simulation/testnet path. The deployed Confidential Workflows mode, its real identity checks and escrow settlement are later stages.
