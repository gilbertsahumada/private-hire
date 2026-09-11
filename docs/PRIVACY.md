# Privacy and trust boundaries

Only synthetic test portfolios are supported in this stage. Local CRE simulation is not an enclave and must not process production-sensitive material.

- A2A receives input and probeId, never the private tolerance. Context has a dedicated credential; setup has a third credential. These are service-level credentials for one allowlisted staging provider, not end-user authentication.
- D1 contains identifiers, hashes, object references, fixture flags and operational state. Private input, policy, result and nonce live in AES-GCM encrypted R2 objects.
- The server has the encryption key and can decrypt the policy. Sharing the app between context API and agent does not isolate secrets from its operator.
- New objects get fresh 96-bit IVs. AAD binds object type, staging tenant and probeId. A 256-bit key is required; no plaintext fallback exists.
- Conditional R2 writes choose one immutable result. D1 is updated after decrypting and checking the persisted winner. Missing/corrupt confirmed results stop processing; retries do not mint replacement nonces.
- Reports contain only schema version, chainId, receiver, probe hash, result commitment, decision and expiry. Public decisions and hashes are intentionally observable.
- Private HTTP responses use `no-store`. Worker observability is disabled; source does not log bodies or tokens. The simulation wrapper scans output for known secrets and private-field markers before saving evidence.
- HTTP destinations are fixed origins from operator config; no URL from agent output is followed. Local HTTP is an explicit simulation setting. Staging requires HTTPS. The current SDK exposes no redirect policy parameter: the controlled service must not issue redirects; observed non-200 responses fail closed.
- The mock forwarder is not a production trust root. Even with its caller check, ProbeReceiver proves a test transaction path, not authenticated live DON execution. Do not use it for custody, payments or production decisions.

Unimplemented: wallet login, multi-tenant buyer authorization, key rotation, production workflow identity enforcement, escrow and retention policies. Remote publication requires the staging authorization described in the plan.
