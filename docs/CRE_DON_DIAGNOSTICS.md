# Deployed confidential capability diagnostics

These are isolated private-registry tests authorized by the user, with no blockchain transactions or application credentials. Run CRE using the explicit path /Users/gilbertsahumada/.cre/bin/cre (v1.33.0); an elevated-shell PATH selected an older CLI and rejected --non-interactive before any activation. The explicit binary resolved that local invocation problem.

## Test matrix

- Original probe, explicit CRE_CLI_DON_FAMILY=zone-a: deployed execution baa56e22-938c-4c4f-8397-6183ed314d54 repeats DON members not set.
- deployment-probe-any-tee: same logic with handlerInTee constraints {}, no pinned TEE or region. Execution e1fa9988-64c2-49a4-bb33-d9f97e710d48 repeats the error.
- deployment-probe-zone-b: minimal TEE callback returning a public constant, no secrets or HTTP. Attempted zone-b first. Server rejected registration with organization workflow limit exceeded for don_family="zone-b" (limit=0). Artifacts uploaded, but no zone-b workflow execution occurred.
- The exact minimal artifact was subsequently deployed to zone-a. Its historical name still contains zone-b; deployment metadata, not the name, identifies the actual family. Execution 8be8623a-f167-46d5-97f0-23e7318daabf repeats DON members not set. The initial workflow get health view omitted errors; execution status JSON subsequently included the error. Do not treat an initially clean health summary as success.

The tenant context defaults to zone-a. Read-only Ethereum calls to the capabilities registry 0x76c9cf548b4179F8901cda1f8623568b58215E62 returned zone-a DON IDs [9,1,3,8,11] and zone-b [3,10,5,9]. Registry membership alone is not account deployment permission or proof of healthy enclave initialization.

## Reproduction

From apps/cre, use the absolute CLI path above with:

    CRE_CLI_DON_FAMILY=zone-a cre workflow activate ./deployment-probe -R . -T deployed-probe --yes --non-interactive
    CRE_CLI_DON_FAMILY=zone-a cre workflow deploy ./deployment-probe-any-tee -R . -T deployed-probe --yes --non-interactive
    CRE_CLI_DON_FAMILY=zone-b cre workflow deploy ./deployment-probe-zone-b -R . -T deployed-probe --yes --non-interactive
    CRE_CLI_DON_FAMILY=zone-a cre workflow deploy ./deployment-probe-zone-b -R . -T deployed-probe --yes --non-interactive

Inspect execution list/status JSON after a scheduled trigger, then pause each successfully registered workflow. Do not accept the SUCCESS summary in place of detailed error inspection. These commands change private-registry state and are for a bounded diagnostic run, not routine tests.

## Source review

CLI selection prefers CRE_CLI_DON_FAMILY over the tenant default: https://github.com/smartcontractkit/cre-cli/blob/44c499db6a267fe0588ecb70486336c3f6f120ff/internal/settings/registry_resolution.go#L73

The confidential executor emits the exact error when its internal DON membership is empty: https://github.com/smartcontractkit/chainlink-confidential-compute/blob/bf25004c4184929220689096dd65dfb4b7cb598a/capabilities/framework/executor.go#L1590

That source obtains membership from LocalNode().WorkflowDON.Members and reconciles enclave configuration. Public source is not proof of the hosted binary version or exact root cause. The tested user-side choices can be excluded individually; backend initialization/synchronization remains an inference.

A further HTTP-only control (deployment-probe-http-only) uses the same public Agent Card GET and no getSecret call. Its detailed outcome is recorded in evidence.
