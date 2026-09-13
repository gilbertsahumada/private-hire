# CRE protocol adapters

Reusable A2A and MCP clients inside the Private Hire monorepo. The new clients accept application-independent messages and tool arguments. They use CRE's existing HTTP capability; they are an application library, not an official Chainlink plugin or a new DON capability.

## Supported profiles

| Export                              | Capability                               | Scope                                                         |
| ----------------------------------- | ---------------------------------------- | ------------------------------------------------------------- |
| `@private-hire/agent-transport/a2a` | `sendMessage`, `getTask`, `taskPhase`    | A2A 1.0 JSON-RPC; text/data/raw/url parts, messages and tasks |
| `@private-hire/agent-transport/mcp` | `listTools`, `callTool`                  | MCP 2026-07-28, remote JSON responses only                    |
| `@private-hire/agent-transport/cre` | `createCreTransport`, `validateEndpoint` | Synchronous requests inside a CRE `TeeRuntime` handler        |
| Existing `.` and `./tee`            | Private Hire portfolio helpers           | Existing signatures and behavior retained                     |

The new protocol exports do not import CRE or the portfolio domain. Only `./cre` loads the CRE runtime. Existing portfolio wrappers remain intact to protect the marketplace; this release adds generic operations rather than migrating the production workflow.

MCP is a **limited JSON-only profile**, not full Streamable HTTP conformance. It intentionally sends `Accept: application/json`; full clients must support and advertise SSE too. No SSE, stdio, subscriptions, resources/prompts operations, legacy initialize/sessions, OAuth negotiation, or multi-round-trip interaction is implemented. Protocol revisions are pinned, with no automatic downgrade. `x-mcp-header` definitions reject the whole requested list page or invocation. Tool names are limited to 1–128 ASCII letters, digits, `_`, `-` and `.`. Additional content fields are preserved; consumers remain responsible for validating domain payloads.

A2A supports `SendMessage` with `returnImmediately: true` and explicit `GetTask`. It does not implement discovery, streaming, push updates or interactive continuation. Task IDs come from the server and are independent of request/message/context IDs. `taskPhase` returns `pending`, `completed`, `failed` or `input-required`; no background polling occurs. Endpoints must use the pinned JSON-RPC binding and return the `A2A-Version: 1.0` header.

## Use from a CRE handler

Build workspace dependencies first; no npm publication is required:

```sh
pnpm install --frozen-lockfile
pnpm --filter @private-hire/domain build
pnpm --filter @private-hire/agent-transport build
```

```ts
import { createCreTransport } from '@private-hire/agent-transport/cre';
import { listTools, callTool } from '@private-hire/agent-transport/mcp';

// Inside a handler receiving TeeRuntime. Endpoint and tool selection are trusted
// workflow configuration, never URLs or instructions returned by the provider.
const transport = createCreTransport(runtime, {
  endpoint: 'https://provider.example/mcp',
  secretName: 'PROVIDER_TOKEN',
});
const page = listTools(transport, 'request-list');
const selected = page.tools.find((tool) => tool.name === 'sum');
if (!selected) throw new Error('EXPECTED_TOOL_MISSING');
const result = callTool(transport, 'request-call', selected, { a: 19, b: 23 });
if (result.isError) throw new Error('PROVIDER_OPERATION_FAILED');
// Validate result.structuredContent against the application's expected schema.
```

`listTools(transport, requestId, cursor?)` returns a single page and its optional `nextCursor`; the caller bounds further requests. `callTool(transport, requestId, toolDefinition, arguments)` requires a discovered or explicitly configured descriptor, so unsupported header requirements can be checked before calling. Arguments and result schemas are application responsibilities.

```ts
import {
  sendMessage,
  getTask,
  taskPhase,
} from '@private-hire/agent-transport/a2a';

const sent = sendMessage(transport, 'send-1', {
  messageId: 'message-1',
  role: 'ROLE_USER',
  parts: [{ data: { a: 19, b: 23 } }],
});
if ('task' in sent) {
  // Persist sent.task.id in caller-owned state. In a later workflow invocation:
  const task = getTask(transport, 'query-1', sent.task.id);
  const phase = taskPhase(task);
}
```

For A2A, construct `transport` with the provider's A2A endpoint. Do not reuse an MCP endpoint. Configure secret names through CRE's workflow secrets mapping. Omit `secretName` only for an intentionally public endpoint.

## Transport boundaries and failures

Requests have a 10-second timeout, 10,000-byte encoded body cap and 100,000-byte received body cap. The latter is checked after CRE returns the body; it is not a streaming memory bound. Cache reads/writes are disabled. Each operation makes one request, with no adapter retries; consumers must define idempotency before retrying side effects.

Endpoints are explicit HTTPS URLs with a simple host/path and optional port. Query strings, fragments, embedded credentials, percent escapes and `..` are outside this profile. HTTP on `localhost` or `127.0.0.1` requires `allowLocalHttp: true` for local simulation. Production endpoint selection/allowlisting belongs to the workflow operator. Credentials are resolved by secret name, never taken from responses. The adapter does not interpret returned URLs as endpoints and rejects surfaced HTTP redirects. CRE CLI 1.33.0 rejects the tested 307 redirect inside the capability, surfaced as `HTTP_TRANSPORT_FAILED`; the demo also asserts the destination received no follow-up request.

`AdapterError.code` uses sanitized categories: `HTTP_*`, `AUTH_*`, `REQUEST_*`, `RESPONSE_TOO_LARGE`, `PROTOCOL_INVALID`, `PROTOCOL_VERSION_UNSUPPORTED`, `RPC_ERROR`, `A2A_TASK_ID_MISMATCH`, `SSE_UNSUPPORTED`, `MCP_HEADERS_UNSUPPORTED`, and `MCP_INTERACTION_UNSUPPORTED`. Remote RPC messages and bodies are not included in errors. `isError` is returned as an MCP operation result, not treated as transport success of the underlying business operation. Transport or parsing failures must never be converted into an escrow rejection or payment authorization.

## Reproduce the demonstration

Prerequisites: pinned pnpm dependencies, Python 3, Bun, CRE CLI 1.33.0 and its Javy build dependencies. The existing CRE project configuration also checks Arc RPC connectivity. Use `CRE_BIN` to choose a different CLI executable explicitly.

```sh
pnpm protocols:demo
# Only the first MCP build and invocation:
python3 scripts/protocol-demo.py --mcp-only
# Protocol, legacy regression and browser import checks:
pnpm test
node scripts/check-protocol-imports.mjs
```

The runner starts its own authenticated Python provider on an available loopback port. It writes a fresh test credential to an ignored, mode-0600 file, removes it on exit, and closes its own server. Run one instance per worktree. It does not load another task's environment files, deploy, broadcast, migrate a database or use a funded wallet.

The workflow examples live in `apps/cre/protocol-demo`. Each simulation performs one protocol operation. The synthetic service lists/calls `sum(19, 23)` and implements a working A2A task whose result is retrieved in another invocation. An alternate MCP path demonstrates configuration-only endpoint replacement. Both endpoints belong to our example provider: this is not independent third-party interoperability certification.

The runner checks results before saving timestamped evidence and token-scanned CLI logs to `docs/evidence/protocol-adapters-simulation.json` and `protocol-demo-*.log`. The summary includes SHA-256 log hashes. These are **CRE CLI simulations with a local HTTP provider**, not proof of a deployed confidential enclave. Demo output contains only synthetic data; production confidential handlers should expose an approved public result or commitment instead of private artifacts.

## Bring your own agent

A provider integrating this profile supplies a trusted endpoint, compatible protocol version/binding, optional bearer credential, supported messages/tool definitions and agreed input/output schemas. A2A tasks must persist server-issued IDs across requests. MCP tools must return finite JSON results without header annotations or interaction requirements.

Connecting that provider to Private Hire additionally requires provider identity/wallet configuration, a work-specific evaluator and linkage to ERC-8183 submission and settlement. ERC-8183 does not define the offchain input/output contract. This package proves the communication layer; it does not enable arbitrary-provider hiring in the current marketplace.

Sources used for wire-level tests: [MCP tools](https://modelcontextprotocol.io/specification/2026-07-28/server/tools), [MCP transport and metadata](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http), [MCP schema/error codes](https://modelcontextprotocol.io/specification/2026-07-28/schema), [A2A 1.0](https://a2a-protocol.org/v1.0.0/specification/). A2A serialization is also checked against the pinned official SDK 1.1.0.
