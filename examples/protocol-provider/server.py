"""Synthetic authenticated provider. No imports from the adapter under test."""

from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json, secrets, threading


def create_server(token):
    tasks = {}
    lock = threading.Lock()

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_args):
            pass

        def reply(self, status, value, protocol=None):
            body = json.dumps(value).encode()
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            if protocol == "a2a":
                self.send_header("A2A-Version", "1.0")
            if protocol == "mcp":
                self.send_header("MCP-Protocol-Version", "2026-07-28")
            self.end_headers()
            self.wfile.write(body)

        def do_GET(self):
            if self.path != "/.well-known/agent-card.json":
                return self.reply(404, {})
            self.reply(
                200,
                {
                    "name": "Example Integer Adder",
                    "description": "Synthetic adapter demonstration",
                    "version": "0.1.0",
                    "supportedInterfaces": [
                        {
                            "url": f"http://127.0.0.1:{self.server.server_port}/a2a",
                            "protocolBinding": "JSONRPC",
                            "protocolVersion": "1.0",
                        }
                    ],
                    "capabilities": {},
                    "defaultInputModes": ["application/json"],
                    "defaultOutputModes": ["application/json"],
                    "skills": [
                        {
                            "id": "sum",
                            "name": "Sum",
                            "description": "Add two integers",
                            "tags": ["example"],
                        }
                    ],
                    "securitySchemes": {
                        "bearer": {"httpAuthSecurityScheme": {"scheme": "bearer"}}
                    },
                    "security": [{"schemes": {"bearer": {"list": []}}}],
                },
            )

        def do_POST(self):
            protocol = "mcp" if self.path.startswith("/mcp") else "a2a"
            self.server.requests.append(self.path)
            if self.path == "/mcp-redirect":
                self.send_response(307)
                self.send_header(
                    "Location", f"http://127.0.0.1:{self.server.server_port}/mcp-alt"
                )
                self.send_header("Content-Length", "0")
                self.end_headers()
                return
            if self.path not in ["/mcp", "/mcp-alt", "/a2a"]:
                return self.reply(404, {})
            if self.headers.get("Authorization") != "Bearer " + token:
                return self.reply(401, {}, protocol)
            length = int(self.headers.get("Content-Length", "0"))
            if not 0 < length <= 10000:
                return self.reply(413, {}, protocol)
            try:
                req = json.loads(self.rfile.read(length))
            except ValueError:
                return self.reply(400, {}, protocol)
            ident = req.get("id")

            def error(code):
                return self.reply(
                    200,
                    {
                        "jsonrpc": "2.0",
                        "id": ident,
                        "error": {"code": code, "message": "Example request failed"},
                    },
                    protocol,
                )

            method, params = req.get("method"), req.get("params", {})
            if protocol == "mcp":
                meta = params.get("_meta", {})
                if (
                    self.headers.get("MCP-Protocol-Version") != "2026-07-28"
                    or meta.get("io.modelcontextprotocol/protocolVersion")
                    != "2026-07-28"
                ):
                    return error(-32602)
                if (
                    self.headers.get("Mcp-Method") != method
                    or "io.modelcontextprotocol/clientInfo" not in meta
                    or "io.modelcontextprotocol/clientCapabilities" not in meta
                ):
                    return error(-32602)
                if method == "tools/list":
                    result = {
                        "resultType": "complete",
                        "tools": [
                            {
                                "name": "sum",
                                "description": "Add two safe integers",
                                "inputSchema": {
                                    "type": "object",
                                    "properties": {
                                        "a": {"type": "integer"},
                                        "b": {"type": "integer"},
                                    },
                                    "required": ["a", "b"],
                                },
                            }
                        ],
                    }
                elif method == "tools/call":
                    if (
                        params.get("name") != "sum"
                        or self.headers.get("Mcp-Name") != "sum"
                    ):
                        return error(-32602)
                    args = params.get("arguments", {})
                    if not valid(args):
                        return error(-32602)
                    result = {
                        "resultType": "complete",
                        "content": [
                            {"type": "text", "text": str(args["a"] + args["b"])}
                        ],
                        "structuredContent": {"sum": args["a"] + args["b"]},
                        "isError": False,
                    }
                else:
                    return error(-32601)
            else:
                if self.headers.get("A2A-Version") != "1.0":
                    return error(-32602)
                if method == "SendMessage":
                    try:
                        args = params["message"]["parts"][0]["data"]
                    except (KeyError, IndexError, TypeError):
                        return error(-32602)
                    if not valid(args):
                        return error(-32602)
                    task_id = "server-" + secrets.token_hex(8)
                    task = {
                        "id": task_id,
                        "contextId": "context-" + task_id,
                        "status": {"state": "TASK_STATE_WORKING"},
                    }
                    with lock:
                        tasks[task_id] = (task, args["a"] + args["b"])
                    result = {"task": task}
                elif method == "GetTask":
                    with lock:
                        saved = tasks.get(params.get("id"))
                    if not saved:
                        return error(-32001)
                    task, total = saved
                    result = {
                        **task,
                        "status": {"state": "TASK_STATE_COMPLETED"},
                        "artifacts": [
                            {
                                "artifactId": "sum",
                                "parts": [
                                    {
                                        "data": {"sum": total},
                                        "mediaType": "application/json",
                                    }
                                ],
                            }
                        ],
                    }
                else:
                    return error(-32601)
            self.reply(200, {"jsonrpc": "2.0", "id": ident, "result": result}, protocol)

    def valid(args):
        return (
            isinstance(args, dict)
            and all(
                type(args.get(k)) is int and abs(args[k]) <= 2**53 - 1
                for k in ["a", "b"]
            )
            and abs(args["a"] + args["b"]) <= 2**53 - 1
        )

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    server.requests = []
    return server
