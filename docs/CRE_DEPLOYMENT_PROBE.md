# PrivateHire confidential deployment probe — 2026-09-13

Deployment succeeded in the private registry on zone-a. Workflow ID:
0009208cf3b07ce8e8f98ef8b12392e0519bbd6838b158ce872be3b7aa984a02

The isolated Vault secret was created through browser authorization. There are no app credentials, wallet keys, EVM report writes or paid jobs in this probe.

Two executions are labeled SUCCESS in CRE summaries:
- aacd735a-96a5-421e-9191-fb7beac069b3, 12:08:03–12:08:13 UTC
- 5f81ffc5-7262-4694-b1cb-8e2e4b8eb147, 12:09:01–12:09:10 UTC

However, both detailed statuses contain:

> confidential-workflows capability execution failed: failed to get enclave params: enclave config validation failed: cannot validate enclave config: DON members not set

The capability timeline contains a successful http-actions event but provides no proof that the handler returned PRIVATEHIRE_DEPLOY_PROBE_OK. User logs are empty. Therefore neither the secret retrieval nor successful confidential execution is accepted as verified from the summary alone.

The workflow was paused. A health read briefly reported FAILED with “drain in progress: 1 active executions still running”; the registry subsequently confirmed PAUSED. The scheduled probe is not left active.

Ask Chainlink beta support to inspect the enclave/DON configuration for this workflow and these execution IDs, and clarify why the summary says SUCCESS despite confidential capability errors. This is a diagnostic inference, not proof of a specific infrastructure root cause. No network, registry, TEE type or confidentiality downgrade was substituted.

The Vault CLI also reported gateway validation skipped. Only an isolated random test secret was used; retain that trust limitation in evaluating this test.

After the configuration is resolved, reactivate this same workflow for a bounded test, inspect detailed execution errors and capabilities, then pause it. Arc receiver integration and autonomous provider operations remain separate, pending work.

Official references:
- https://docs.chain.link/cre/guides/operations/deploying-to-private-registry
- https://docs.chain.link/cre/guides/workflow/secrets/using-secrets-deployed

The exact workflow passed local simulation and returned PRIVATEHIRE_DEPLOY_PROBE_OK. This checks the code and endpoint path but does not resolve the deployed enclave configuration errors.
