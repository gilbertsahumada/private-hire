# Tested compatibility — stage one

| Component | Version |
|---|---|
| Node | 22.19.0 |
| pnpm | 10.12.1 (single root lockfile) |
| Bun | 1.3.1 |
| CRE CLI | 1.33.0 |
| CRE SDK | 1.20.1 |
| CRE Javy plugin | 1.7.0 |
| A2A JS SDK | 1.1.0; protocol 1.0 |
| Next.js | 16.3.5; App Router; webpack build |
| React | 19.2.4 |
| OpenNext Cloudflare | 1.20.6 |
| Wrangler | 4.131.1 |
| workerd compatibility date | 2026-09-01 |
| TypeScript | 5.9.3 |
| Foundry | 1.6.0-nightly, e805fce21952030416f683f3a8c11093910cfddd |
| Solidity / EVM | 0.8.28 / cancun |

CRE imports built ESM workspace packages; Bun compiles the pnpm-installed dependency graph. There is no Bun lockfile. A pnpm override pins TypeScript 5.9.3 across optional peer dependencies so the transport and workflow use the same CRE SDK instance. `cre workflow build` produces WASM without uploading/deploying. The SDK caches/downloads Javy on first compilation.

The installed SDK's JSON HTTP requests require base64 bodies and `multiHeaders`. EVM `callContract` protobuf byte fields use base64; `writeReport.receiver` is a hex address in its SDK wrapper. Chain selectors stay strings/BigInts.

A2A uses ProtoJSON enum names (`ROLE_USER`, `TASK_STATE_COMPLETED`) and flat `data` parts. The official SDK omits default `returnImmediately: false`; our sender does the same. Tests round-trip against the installed SDK. We implement a bounded SendMessage/GetTask subset, not streaming, continuation or universal A2A service support.

OpenNext's `buildCommand` explicitly invokes `next build --webpack`; otherwise using OpenNext as the package build script recursively invokes itself. Its development runtime may need local socket permissions even during build. The tested compatibility date precedes the runtime date (the local timezone was already September 12 while UTC was September 11).

The sandbox shell and escalated shell exposed different `cre` binaries. The simulation wrapper defaults to `$HOME/.cre/bin/cre`; override `CRE_BIN` for a different installation. Check `cre version` before using direct commands. No global tools were upgraded.

Foundry compiled inside the sandbox but its macOS system-configuration lookup crashed when running tests. The same 12 tests passed outside the sandbox; this was an execution-environment failure, not a contract failure.

Arc tenant listing and RPC reads were verified. HTTPS staging, report delivery and EVM log-trigger evidence remain pending real deployment. CLI default simulator signing keys must never be used as user-funded deployers.

References: [CRE confidential template](https://docs.chain.link/cre-templates/hello-confidential-workflows), [A2A 1.0](https://a2a-protocol.org/v1.0.0/specification/), [OpenNext](https://opennext.js.org/cloudflare).
