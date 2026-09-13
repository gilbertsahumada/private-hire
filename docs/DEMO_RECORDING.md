# PrivateHire — 2–3 minute recording

Use the existing accepted request. Do not create or pay for another request just to record the demo.

## Screens

1. Landing: https://confidential-agent-jobs-staging.gilbertsahumada.workers.dev/
2. Agents: https://confidential-agent-jobs-staging.gilbertsahumada.workers.dev/agents
3. Request: https://confidential-agent-jobs-staging.gilbertsahumada.workers.dev/jobs/job-cfee1d05-d90d-46a7-b858-50206699f8d2
4. Settlement: https://testnet.arcscan.app/tx/0x0a4ca1b9faf2c23dd0afefad4639b2ffe71af42e49b2f1b31e464656e1d8a910

## Suggested narration

**0:00–0:25 — Landing**

“PrivateHire lets you hire agents for private work with verifiable onchain payments. The request inputs, evaluation policy and full report stay offchain, while the blockchain records commitments and payment outcomes.”

**0:25–0:50 — Agent**

“Our first agent is Portfolio Calculator, with a registered ERC-8004 identity. It calculates a synthetic portfolio deterministically. The analysis costs 0.01 test USDC on Arc, with network fees separate.”

**0:50–1:30 — Existing request and report**

“Here is our real request. We supplied 2.5 example units at 10 dollars each. The 25-dollar result is the calculated value of fictional holdings—not an amount we charge. The buyer funded 0.01 test USDC through ERC-8183. The agent confirmed the price and delivered the report using its own provider service.”

Click **View portfolio report**. Show the $25 total and 100% concentration, then the confirmed transaction history.

**1:30–2:00 — CRE evidence**

“Chainlink CRE retrieves the private evaluation context, obtains the agent's delivery through A2A, checks its commitment against the onchain submission, and evaluates the result. This demo runs the actual workflow in CRE simulation. It produced acceptance and transmitted the report to our simulation evaluator on Arc Testnet.”

Show the successful CLI log in `docs/evidence/` containing `JOB_EVALUATED jobId=186296 decision=1 txHash=0x0a4ca1…`. Do not rerun broadcast: the job is already completed.

**2:00–2:30 — Settlement and close**

“This confirmed transaction accepted the report and released exactly 0.01 USDC to the provider. Our prototype demonstrates private offchain work connected to verifiable payment settlement. We currently support one agent; the reusable A2A and MCP adapters are a foundation for broader integrations.”

## Evidence and scope

- Receipt, canonical block, JobCompleted, JobEvaluated and the exact USDC Transfer were verified in `evidence/demo-186296-settlement.json`.
- Provider balance before settlement: 0.959708307 native USDC; after: 0.96546053788. The difference is exactly 0.01 payment minus 0.00424776912 gas, paid by that same wallet.
- Buyer balance before and after settlement: 18.98115081 native USDC.
- CRE simulation + Arc testnet transaction. The mock forwarder does not prove a deployed enclave.
- The backend operator is trusted and can access stored private data. The agent receives the input but not the evaluation policy.
- This recording demonstrates acceptance. Do not describe rejection/refund journeys for real jobs as completed.
