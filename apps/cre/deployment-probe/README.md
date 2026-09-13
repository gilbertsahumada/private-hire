# Confidential deployment probe

A minimal, separate deployed workflow. A one-minute cron invokes a Nitro TEE handler, reads the isolated `PRIVATEHIRE_DEPLOY_PROBE_V1` Vault secret, and fetches the public staging Agent Card. Only `PRIVATEHIRE_DEPLOY_PROBE_OK` is returned. No secret, private application data or secret hash is logged or sent to HTTP. There is no EVM client, report generation, wallet key or payment operation.

The target uses the Chainlink private registry (account authorization, not an Ethereum registry transaction). Private registry management is separate from confidential TEE execution.

Run commands from apps/cre:

```sh
cre secrets create deployment-probe/secrets.yaml --secrets-auth browser --env ../../.local/cre-deployment-probe.env --timeout 5m --yes
cre workflow deploy deployment-probe --target deployed-probe --non-interactive --yes
cre workflow get deployment-probe --target deployed-probe --output json
cre execution list private-hire-confidential-deployment-probe --limit 3 --output json
cre workflow pause deployment-probe --target deployed-probe --non-interactive --yes
```

The ignored environment file contains a random test value, not any app credential. Complete Vault browser authorization when required. Pause the workflow after the bounded verification run; it is not a permanent scheduled service.

Success of this probe does not demonstrate A2A task delivery, Arc report transmission, escrow resolution or provider autonomy. Those require subsequent integration tests and a receiver that authenticates the real forwarder and workflow identity.
