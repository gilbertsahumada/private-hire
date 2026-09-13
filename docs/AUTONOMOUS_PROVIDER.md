# Autonomous provider: prepared, broadcast not activated

The provider is an isolated Node service, launched by the operator, not a seller using the browser. It shares the existing deterministic A2A calculator and encrypted delivery persistence. The service does not require CRE to dispatch a calculation; CRE still evaluates the committed delivery separately.

## Access and signing boundaries

- PROVIDER_SERVICE_TOKEN authorizes only listing correlated requests, reading the explicit provider projection, preparing budget/submit, and confirming provider receipts.
- The projection includes holdings and agreed terms, not the private evaluation policy or manifest nonce.
- PROVIDER_A2A_TOKEN authorizes SendMessage and GetTask through the existing A2A endpoint.
- PROVIDER_PRIVATE_KEY stays in the isolated service environment. It is never a Worker secret or browser variable. Only load it after authorizing the bounded signing run.
- No key is needed for the default read-only mode. No A2A work or transaction preparation occurs in that mode.
- Transactions are limited to setBudget and submit on the configured Arc escrow with value zero. The signer reconstructs calldata, compares the server proposal, rereads the onchain participants/hash/state/expiry and checks the maximum budget.
- Server preparation independently checks current identity, evaluator, implementation and fee configuration. Shared escrow check-to-transaction races remain possible.

## Running

From repository root, configure .local/provider.env using .env.example, then run pnpm provider:check or pnpm provider:watch.

Both are read-only by default. Following explicit authorization of the allowed gas budget and requests, run ALLOW_PROVIDER_BROADCAST=yes pnpm provider:watch --broadcast.

Default ceilings: 0.01 test USDC per job budget, 0.02 native test USDC maximum gas reservation per transaction and 0.05 total gas reservation across the journal lifetime. These are conservative maxima, not estimated fees or spending authorization. Total reservations are not refunded automatically. Increasing or resetting the allowance requires operator review.

Only one service instance may operate this wallet. Keep the fixed state directory .local/provider-state durable. Do not run CRE broadcasts or browser signing with this same provider wallet concurrently. A dedicated remote host/supervisor is still needed for 24/7 operation independent of this development machine; no remote daemon has been activated.

## Recovery

The service scans already-correlated onchain jobs. Use the existing operator reconciler to recover creations that were not confirmed by the buyer UI. Unfunded drafts and earlier probes never become work.

A single pending transaction blocks further signing. Before broadcast, exact signed bytes, hash, expiry and reserved gas are atomically persisted and fsynced. After a timeout, the same signed bytes are resent; the service does not allocate a new nonce. The backend verifies the receipt and block hash before the journal is cleared.

After a revert, expiry of an unresolved transaction, corrupt journal, or stale process lock, stop and review rather than deleting state or issuing a replacement blindly. A crashed process leaves its lock deliberately; only remove it after proving no process still owns the wallet and reviewing the pending transaction. SIGINT/SIGTERM finish the current operation and release the lock.

Funded work is sent through A2A, then recovered via GetTask. Both envelopes must have the same commitment, including the same nonce, and match the job reference before submit preparation. Existing task reservation, conditional R2 write, D1 recovery and AEAD tests continue to apply.

No completion/rejection transaction is signed by this service. It stops at delivery. CRE deployment remains paused due to the documented enclave configuration issue. Provider UI signing controls are removed. The workspace reports that automatic signing is not activated until PROVIDER_AUTOMATION_ENABLED is explicitly enabled after verifying the service. Existing participant APIs remain available for operator diagnostics.
