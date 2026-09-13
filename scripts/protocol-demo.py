"""Build and simulate against an isolated provider; never broadcasts or deploys."""

from pathlib import Path
import argparse, importlib.util, json, os, secrets, subprocess, threading, hashlib
from datetime import datetime, timezone

root = Path(__file__).resolve().parents[1]
p = argparse.ArgumentParser()
p.add_argument("--mcp-only", action="store_true")
a = p.parse_args()
cli = os.environ.get("CRE_BIN", str(Path.home() / ".cre/bin/cre"))
folder = root / ".local/protocol-demo"
folder.mkdir(parents=True, exist_ok=True)
spec = importlib.util.spec_from_file_location(
    "provider", root / "examples/protocol-provider/server.py"
)
provider = importlib.util.module_from_spec(spec)
spec.loader.exec_module(provider)
token = secrets.token_hex(32)
server = provider.create_server(token)
thread = threading.Thread(target=server.serve_forever, daemon=True)
thread.start()
env_file = folder / "secrets.env"
env_file.touch(mode=0o600)
env_file.chmod(0o600)
env_file.write_text("PROTOCOL_DEMO_TOKEN_VALUE=" + token + "\n")
(folder / "payload.json").write_text("{}")
results = []
base = f"http://127.0.0.1:{server.server_port}"


def run(cmd, expected_error=None):
    proc = subprocess.run(
        cmd,
        cwd=root / "apps/cre",
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        timeout=180,
    )
    output = proc.stdout
    if token in output:
        raise RuntimeError("Secret detected; refusing to retain output")
    if expected_error:
        if expected_error not in output or proc.returncode == 0:
            (folder / "failure.log").write_text(output)
            raise RuntimeError("Expected rejection was not observed")
        return output
    if proc.returncode:
        # Private scratch output; only synthetic data and no token.
        (folder / "failure.log").write_text(output)
        raise RuntimeError("Command failed; see .local/protocol-demo/failure.log")
    return output


def simulate(operation, endpoint, task_id=None, expected_error=None):
    config = {
        "endpoint": base + endpoint,
        "allowLocalHttp": True,
        "operation": operation,
        "a": 19,
        "b": 23,
    }
    if task_id:
        config["taskId"] = task_id
    (folder / "config.json").write_text(json.dumps(config))
    command = [
        cli,
        "workflow",
        "simulate",
        "protocol-demo",
        "--target",
        "local",
        "--non-interactive",
        "--trigger-index",
        "0",
        "--http-payload",
        str(folder / "payload.json"),
        "--env",
        str(env_file),
    ]
    output = run(command, expected_error)
    if expected_error:
        (root / "docs/evidence/protocol-demo-redirect.log").write_text(output)
        results.append(
            {
                "operation": operation,
                "endpointPath": endpoint,
                "expectedError": expected_error,
                "passed": True,
                "log": "protocol-demo-redirect.log",
                "logSha256": hashlib.sha256(output.encode()).hexdigest(),
            }
        )
        print(operation, endpoint, expected_error, "passed", flush=True)
        return None
    # Read a JSON object from the marker, allowing the CLI to wrap it in a quoted result string.
    marker = "PROTOCOL_DEMO_RESULT="
    parsed = None
    for line in output.splitlines():
        if marker not in line:
            continue
        tail = line.split(marker, 1)[1]
        for candidate in [tail, tail.replace('\\"', '"')]:
            try:
                parsed, _ = json.JSONDecoder().raw_decode(candidate)
            except ValueError:
                continue
            break
    if parsed is None:
        raise RuntimeError("Simulation did not return its success marker")
    log_name = (
        ("protocol-spike-" if a.mcp_only else "protocol-demo-")
        + operation
        + ("-alternate" if endpoint.endswith("-alt") else "")
        + ".log"
    )
    (root / "docs/evidence" / log_name).write_text(output)
    record = {
        "operation": operation,
        "endpointPath": endpoint,
        "result": parsed,
        "log": log_name,
        "logSha256": hashlib.sha256(output.encode()).hexdigest(),
    }
    results.append(record)
    print(operation, endpoint, "passed", flush=True)
    return parsed


try:
    subprocess.run(
        ["pnpm", "--filter", "@private-hire/domain", "build"], cwd=root, check=True
    )
    subprocess.run(
        ["pnpm", "--filter", "@private-hire/agent-transport", "build"],
        cwd=root,
        check=True,
    )
    subprocess.run(
        ["pnpm", "--filter", "@private-hire/chain", "build"], cwd=root, check=True
    )
    (folder / "config.json").write_text(
        json.dumps(
            {
                "endpoint": base + "/mcp",
                "allowLocalHttp": True,
                "operation": "mcp-call",
                "a": 19,
                "b": 23,
            }
        )
    )
    run(
        [
            cli,
            "workflow",
            "build",
            "protocol-demo",
            "--target",
            "local",
            "--non-interactive",
        ]
    )
    called = simulate("mcp-call", "/mcp")
    assert called["structuredContent"]["sum"] == 42 and not called.get("isError")
    if not a.mcp_only:
        listed = simulate("mcp-list", "/mcp")
        assert listed["tools"][0]["name"] == "sum"
        alternate = simulate("mcp-call", "/mcp-alt")
        assert alternate["structuredContent"]["sum"] == 42
        sent = simulate("a2a-send", "/a2a")
        assert sent["task"]["status"]["state"] == "TASK_STATE_WORKING"
        task_id = sent["task"]["id"]
        assert task_id != "demo-message"
        recovered = simulate("a2a-get", "/a2a", task_id)
        assert recovered["phase"] == "completed"
        assert recovered["task"]["artifacts"][0]["parts"][0]["data"]["sum"] == 42
        requests_before = len(server.requests)
        simulate("mcp-call", "/mcp-redirect", expected_error="HTTP_TRANSPORT_FAILED")
        assert server.requests[requests_before:] == [
            "/mcp-redirect"
        ], "Runtime followed redirect"
    evidence = {
        "recordedAt": datetime.now(timezone.utc).isoformat(),
        "command": "python3 scripts/protocol-demo.py"
        + (" --mcp-only" if a.mcp_only else ""),
        "mode": "CRE CLI simulation, local synthetic HTTP provider",
        "liveTEE": False,
        "broadcast": False,
        "cli": subprocess.check_output([cli, "version"], text=True).strip(),
        "sdk": "1.20.1",
        "mcp": "2026-07-28 JSON-only limited profile",
        "a2a": "1.0 bounded JSON-RPC",
        "results": results,
    }
    target = (
        root
        / "docs/evidence"
        / (
            "protocol-adapters-mcp-spike.json"
            if a.mcp_only
            else "protocol-adapters-simulation.json"
        )
    )
    target.write_text(json.dumps(evidence, indent=2) + "\n")
    print("Evidence:", target.relative_to(root))
finally:
    server.shutdown()
    server.server_close()
    thread.join(timeout=5)
    env_file.unlink(missing_ok=True)
