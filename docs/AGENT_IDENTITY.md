# Portfolio Calculator identity

Public registration metadata: `/agent/registration.json`.
Public avatar: `/agent/portfolio-calculator.svg` (original, self-contained SVG; no scripts, fonts or external resources).
A2A discovery: `/.well-known/agent-card.json`; JSON-RPC requests go to `/api/agent/a2a` with a scoped Bearer token.

The metadata follows [ERC-8004 registration-v1](https://eips.ethereum.org/EIPS/eip-8004#agent-uri-and-agent-registration-file). Additional execution, access, privacy and identity fields describe this application's behavior; they are not standard registry fields. The A2A service advertises its card, not the RPC endpoint. `active` refers to the running staging service, not to registration or open commercial availability.

`registrations` now contains confirmed Arc agent `894552`. `supportedTrust` is empty because discovery metadata must not imply a deployed TEE attestation or established reputation. The wallet service advertises the intended provider address; verify it against registry `ownerOf` and `getAgentWallet` after registration. No nonce, credential, private key, policy or portfolio data belongs in this file.

For any future registration, populate `registrations` with the confirmed agentId and `eip155:5042002:0x8004A818BFB912233c491871b3d84c89A494BD9e`, update the pending identity status and A2A description, and publish the updated metadata. Keep the URI stable. Never substitute a guessed ID. Registration transactions require explicit authorization once the URI, registry, signer and estimated cost are prepared.

## trust8004 integration source

The user's [documentation entrypoint](https://trust8004.xyz/docs) links its API documentation. The live [OpenAPI contract](https://trust8004.xyz/openapi.json) documents:

- `GET /api/v1/catalog/agents?owner={address}&chainIds=5042002&limit=10` for owner discovery.
- `GET /api/v1/catalog/agents/{chainId}:{agentId}` for one indexed agent.
- `GET /api/v1/chains/{chainId}` for network information.

The owner query for `0x0C68C8D018ba72C33e966498B2148dC2af454645` returned `items: []`, `total: 0` during preparation. This means no indexed result; it does not prove absence onchain or Arc indexing coverage. Onchain verification remains authoritative. Preserve registry address alongside the API's chainId:agentId lookup key.

Some nested links under the docs entrypoint returned 404 during inspection; use the live OpenAPI instead of inferring endpoints from those links. No changes were made to the trust8004 project.

## Registration preparation

Run `pnpm --filter @private-hire/cre identity:prepare` to verify published metadata bytes, Arc chain ID, registry code, ERC-721 interfaces and the owner's current identity balance. The command records proxy implementation/code hashes where present, simulates `register(string)` without signing, and estimates gas with a 20% gas-limit margin. It refuses a new registration if the wallet already owns identities so an existing registration can be inspected first.

The public review artifact is `docs/evidence/identity-registration-prepared.json`. This is an unsigned transaction proposal, not a receipt. Simulated return values are deliberately not recorded as an agent ID. Recheck registry implementation, metadata hash, balance and fees immediately before any authorized broadcast; the registry is upgradeable and the estimate can change. Gas amounts use Arc's 18-decimal native USDC representation, not the six-decimal ERC-20 interface.

## Confirmed Arc identity

Agent `894552` was registered in transaction `0x9aa39d713841788f9e1db90fc98783462f1359617461fb2303c94310b2a0664c`. Registry `ownerOf`, `getAgentWallet` and `tokenURI` match the dedicated wallet and published URI. Actual fee: `0.004420944` test USDC, below the authorized `0.006` cap. Evidence: `docs/evidence/identity-registration-confirmed.json`. Metadata and A2A card now advertise the confirmed registration. This identity does not change staging service availability or imply live TEE attestation.
