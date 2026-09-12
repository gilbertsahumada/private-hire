# Agents, hiring, Jobs and Provider

## Delivery status

The application and simulation evaluator are implemented. The evaluator is deployed and its runtime code hash is configured. The user authorized starting the first browser-wallet job journey; staging contracting is enabled only when the live checks succeed. No paid job or income is fabricated from the earlier probes. The three real acceptance/rejection/expiry journeys remain pending; this stage is not complete.

The English interface provides Agents, private Jobs and Provider workspaces, browser wallet discovery, SIWE login, immutable quotes, reviewed transactions, private results and receipt recovery. Browser wallets sign buyer/provider transactions; no provider key is stored in Workers. The operator runs CRE explicitly.

## Configuration and authorization

Use the existing Arc ERC-8183 proxy `0x0747EEf0706327138c69792bF28Cd525089e4583`, Portfolio Calculator identity 894552 and provider `0x0C68C8D018ba72C33e966498B2148dC2af454645`. Price defaults to 10000 atomic USDC (0.01). New quotes freeze price, duration, participants, endpoint, input and policy; retries recover the original encrypted manifest and nonce. Modified conditions require a new request ID.

`JOBS_ENABLED=true` additionally requires `JOB_EVALUATOR`, `JOB_EVALUATOR_CODE_HASH`, `ESCROW_CODE_HASH`, and `ESCROW_IMPLEMENTATION_HASH`. Readiness checks the evaluator's forwarder, escrow and simulation flag and the escrow's implementation, payment token and zero fees. Obtain the runtime hash only from a confirmed deployment. Do not enable hiring before that gate.

`JOB_CONTEXT_TOKEN` and `JOB_OPERATOR_TOKEN` are distinct service credentials, separate from `A2A_TOKEN`. Keep them in Worker secrets and an ignored operator environment file. Never put private keys in public environment variables. A provider must import its wallet into its own browser extension outside this application.

The unsigned deployment proposal is `docs/evidence/market-deployment-prepared.json`. It targets Arc chain 5042002, constructor mock forwarder `0x6E9EE680ef59ef64Aa8C7371279c27E496b5eDc1` and the existing escrow. The user authorized only evaluator deployment with a 0.02 test-USDC gas ceiling. It is confirmed at `0x391579ce844b95fc871fa9ce0af1ac8208418962`, transaction `0x554943e013274a96dd66d45e33b2febb5cad1dc8805c17f3ed205735c2de6178`, fee 0.015319722 test USDC. Runtime bytecode (including verified immutable getters), destination and canonical receipt were checked; see `docs/evidence/job-evaluator-deployment.json`. Subsequent job spending and report broadcasts require separate approval.

## Trust and persistence boundaries

SIWE checks the exact server-generated message, domain, URI, chain, expiry and single-use nonce. Nonce consumption uses atomic DELETE RETURNING. Sessions last eight hours and store only a token hash in D1. Cookies are HttpOnly, Secure and SameSite=Strict; writes check Origin. Account changes clear the browser session.

D1 migrations 0002 and 0003 are additive; probe tables are unchanged. R2 objects use AES-GCM and type/request-bound AAD. Conditional writes recover a prior object rather than overwrite it. Job tasks reserve provider + chain + escrow + job ID. Submit requires recovering and checking the persisted envelope and commitment. Only buyers see the policy through participant routes. The application operator remains trusted and can access all backend secrets and policies; separate route credentials do not isolate data from that operator.

trust8004 is queried server-side with a timeout. A previously verified public snapshot is bundled for fallback and displayed as stale. Registry owner, agent wallet and metadata endpoint are verified independently. Registration does not certify quality or a live enclave. Static metadata is read through the Workers assets binding to avoid a Worker self-fetch failure.

## Commands and operator workflow

```sh
pnpm typecheck
pnpm test
ARC_FORK_RPC=https://rpc.testnet.arc.io pnpm contracts:test
pnpm web:build
pnpm jobs:compile
pnpm market:prepare
python3 scripts/jobs.py --help
```

After a buyer creates a job, the provider confirms its fixed budget; the buyer approves the exact amount and funds it. Use `scripts/jobs.py dispatch --request-id REQUEST_ID` for a funded job. After the provider reviews the recovered result and signs submit, use `scripts/jobs.py evaluate --request-id REQUEST_ID --submit-tx TX_HASH`. Broadcast requires the explicit broadcast switch and authorization guard. Credentials are loaded from `.local/staging-jobs.env`; see command help for broadcast options.

Reconciliation is manual: `scripts/jobs.py reconcile --from-block BLOCK` starts a configured-escrow scan; subsequent runs use its D1 cursor. It scans bounded chunks, rechecks recent indexed block hashes, rewinds divergent events, repairs correlation and recovers reserved R2 tasks. It returns pending job references for explicit dispatch/evaluation retries. It never resolves terminal jobs. It is not a background service; repeated calls are required to catch up. Deep historical reorganizations beyond the recent check require an operator-led cursor reset and full rescan; the current command does not expose a reset switch.

The controlled plus-one rejection fixture requires both `ENABLE_JOB_TEST_FIXTURES=true` and an authenticated operator request on an unexecuted test job. It is absent from the normal hiring UI and disabled by default.

## ERC-8183 compatibility limitations

The inspected shared implementation allows zero budgets, only the provider sets budget, fund has no expected-budget argument, and submit/complete/reject do not uniformly enforce expiry. The app rejects zero/different budgets and expired actions; the simulation evaluator requires Submitted, matching manifest/destination, positive budget and an unexpired report/job. These checks do not change the shared escrow or eliminate check-to-transaction races, upgrades or fee changes.

Deliverable commitment exists in JobSubmitted logs, not a getter. CRE verifies that event from the RPC receipt against the recovered A2A artifact. The evaluator trusts the public report for this comparison. The mock forwarder is simulation infrastructure, not production DON authentication. The honest label is **CRE simulation + Arc testnet transaction**, never a deployed confidential workflow or real enclave.

## Acceptance evidence and remaining work

Local automated tests cover calculation vectors, SIWE replay/domain/session expiry/origin, buyer/provider visibility, wrong receipts, altered budgets, expiry, task concurrency, partial persistence recovery, AEAD tampering, committed rejection and pending transport/integrity failures. Receiver tests cover report/caller/replay/destination/state/deadline. Fork tests exercise the actual shared deployment's compatibility differences without broadcasting.

Browser checks run against the real HTTPS staging in desktop and mobile layouts. The test wallet signs only SIWE messages and refuses transactions. These checks do not demonstrate funding, submit or payment.

Pending after the confirmed evaluator deployment and first-job authorization: connect buyer/provider browser wallets, and create three separate real jobs. Record starting/final balances, allowance, each receipt and event, encrypted artifact commitment, operator execution and reload/browser-closed recovery. Acceptance must pay; committed rejection must refund; expiry must show Refund available until claimRefund confirms. Budget and gas must be recorded separately. Keep the stage pending until all three journeys have authentic evidence.

Workers compatibility: use fetch redirect `manual` and reject non-2xx responses. Workers rejects redirect `error`; local preview did not expose this production difference. Temporary private diagnostic logging was removed after identifying it.

The public Arc RPC returned rate-limit errors under repeated browser reads. Identity reads are sequential with bounded retries; the catalog reuses a successful D1 verification for up to 30 seconds. Draft creation and create/fund preparation bypass this display cache and verify identity again. A failed fresh check prevents hiring.

Rate limits can persist after retries. The profile then shows verification unavailable with an explicit retry action and keeps hiring disabled. Browser tests compare the visible identity state to the actual API response; they do not assert that the public RPC is always available. Reliable fresh reads remain required before the three funded journeys.

## First-job activation and RPC resilience

The buyer will perform MetaMask actions manually in Brave. No buyer private key is handled by the app or operator. The first-job setup passed the contract and identity preflight; no job transaction has been signed by these checks.

The server keeps `https://rpc.testnet.arc.io` as primary and falls back to `https://rpc.blockdaemon.testnet.arc.network`, listed in the [official Arc RPC documentation](https://docs.arc.io/arc/references/rpc-endpoints). Before adding it, the fallback was checked against chain 5042002, the evaluator runtime hash and the canonical deployment block hash. This changes neither network nor escrow. Both endpoints failing still blocks hiring. The profile now explains live-check failures instead of suggesting the deployed evaluator is missing.
