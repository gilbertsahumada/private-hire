# Stage-one demo

1. Run the local quickstart and start the Worker preview.
2. Run `pnpm exec tsx scripts/probe-integration.ts`. It stores two synthetic probes, tests concurrency and credential boundaries, and saves their public trigger payloads under `.local/`.
3. Run `python3 scripts/simulate.py reject` and `python3 scripts/simulate.py accept`. Both are CRE CLI runs, without broadcast. Expected outputs are `CRE_SIMULATION decision=2 txHash=not-broadcast` and `CRE_SIMULATION decision=1 txHash=not-broadcast`. Local config sets `writeReport:true` with the verified deployed receiver. CRE also validates the Arc USDC decimals read internally.
4. After authorized staging deployment, set `PROBE_ORIGIN` to its HTTPS origin and run the integration script again with the corresponding staging credentials file. Set the staging workflow config to that origin and the real receiver address.
5. The receiver is deployed and both local report simulations passed without broadcast. For user-authorized broadcasts only, configure the user's signing method and execute the documented commands.
6. Verify each transaction's successful receipt and ProbeRecorded event. Use an actual confirmed tx hash with `python3 scripts/simulate.py log --target staging --tx-hash 0x... --log-index 0`; use the verifier's `receiptEventIndex`, not the block-wide `logIndex`. Both current report receipts use receiptEventIndex 0.

Use a new integration run's probeIds for another broadcast pair: the receiver refuses replay by probeId. Do not reuse a resolved probe with a changed policy or result.

Evidence levels: (a) CRE simulation without broadcast, (b) CRE simulation plus confirmed Arc testnet transaction, (c) deployed confidential workflow. Stage one targets (b). Neither (a) nor (b) proves (c). A transaction through the mock forwarder is not a live TEE attestation. No stage-one result should be called a payment.
