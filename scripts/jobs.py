"""Operator commands for real jobs. Public triggers only; no private data in logs."""

from pathlib import Path
import argparse, json, os, re, subprocess, uuid, urllib.request

root = Path(__file__).resolve().parents[1]
p = argparse.ArgumentParser()
p.add_argument("phase", choices=["dispatch", "evaluate", "reconcile", "compile"])
p.add_argument("--request-id")
p.add_argument("--submit-tx")
p.add_argument("--from-block")
p.add_argument("--broadcast", action="store_true")
a = p.parse_args()
cli = str(Path.home() / ".cre/bin/cre")
credentials = root / ".local/staging-jobs.env"

if a.broadcast and (
    a.phase != "evaluate" or os.environ.get("ALLOW_ARC_BROADCAST") != "yes"
):
    raise SystemExit("Explicit authorization required for evaluation broadcast.")


if a.phase == "compile":
    raise SystemExit(
        subprocess.call(
            [
                cli,
                "workflow",
                "build",
                "jobs",
                "--target",
                "staging",
                "--non-interactive",
            ],
            cwd=root / "apps/cre",
        )
    )

if not credentials.exists():
    raise SystemExit(
        "Configure .local/staging-jobs.env with scoped job credentials first."
    )
secrets = dict(
    line.split("=", 1)
    for line in credentials.read_text().splitlines()
    if "=" in line and not line.startswith("#")
)
if a.phase == "reconcile":
    import urllib.request

    token = secrets.get("JOB_OPERATOR_TOKEN", "")
    if len(token) < 32:
        raise SystemExit("Missing JOB_OPERATOR_TOKEN.")
    body = json.dumps({"fromBlock": a.from_block} if a.from_block else {}).encode()
    request = urllib.request.Request(
        "https://confidential-agent-jobs-staging.gilbertsahumada.workers.dev/api/internal/jobs/reconcile",
        data=body,
        headers={
            "Authorization": "Bearer " + token,
            "Content-Type": "application/json",
            "User-Agent": "private-hire-operator/1",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=45) as response:
            print(response.read().decode())
    except Exception:
        raise SystemExit("Reconciliation pending; no private error body was logged.")
    raise SystemExit()

if not a.request_id or not re.fullmatch(r"[a-z0-9][a-z0-9-]{0,63}", a.request_id):
    raise SystemExit("A real request ID is required.")
if a.phase == "evaluate" and (
    not a.submit_tx or not re.fullmatch(r"0x[0-9a-fA-F]{64}", a.submit_tx)
):
    raise SystemExit("Evaluation requires the confirmed JobSubmitted transaction.")
payload = {"requestId": a.request_id, "phase": a.phase}
if a.submit_tx:
    payload["submitTx"] = a.submit_tx
payload_file = root / ".local/job-trigger.json"
payload_file.write_text(json.dumps(payload))
cmd = [
    cli,
    "workflow",
    "simulate",
    "jobs",
    "--target",
    "staging-broadcast" if a.broadcast else "staging",
    "--non-interactive",
    "--trigger-index",
    "0",
    "--http-payload",
    str(payload_file),
    "--env",
    str(credentials),
]
run_env = os.environ.copy()
if a.broadcast:
    key = re.search(
        r"^CRE_ETH_PRIVATE_KEY=(0x[0-9a-fA-F]{64})$", (root / ".env").read_text(), re.M
    )
    if not key:
        raise SystemExit("Dedicated signer missing.")
    run_env["CRE_ETH_PRIVATE_KEY"] = key[1]
    secrets["signer"] = key[1]
    cmd.append("--broadcast")
attempt_id = str(uuid.uuid4())


def record_attempt(state):
    token = secrets.get("JOB_OPERATOR_TOKEN", "")
    if len(token) < 32:
        raise SystemExit("Missing JOB_OPERATOR_TOKEN for workflow attempt tracking.")
    body = json.dumps(
        {"attemptId": attempt_id, "phase": a.phase, "state": state}
    ).encode()
    request = urllib.request.Request(
        "https://confidential-agent-jobs-staging.gilbertsahumada.workers.dev/api/internal/jobs/"
        + a.request_id
        + "/attempt",
        data=body,
        headers={
            "Authorization": "Bearer " + token,
            "Content-Type": "application/json",
            "User-Agent": "private-hire-operator/1",
        },
    )
    with urllib.request.urlopen(request, timeout=20) as response:
        response.read()


try:
    record_attempt("running")
except Exception:
    raise SystemExit(
        "Cannot reserve workflow attempt; check job state and operator credentials."
    )
result = subprocess.run(
    cmd,
    cwd=root / "apps/cre",
    env=run_env,
    stdout=subprocess.PIPE,
    stderr=subprocess.STDOUT,
    text=True,
)
try:
    record_attempt("finished" if result.returncode == 0 else "pending")
except Exception:
    print("Attempt update pending; reconcile chain state before retrying.")
output = result.stdout
if any(len(v.strip()) >= 16 and v.strip() in output for v in secrets.values()) or any(
    marker in output
    for marker in ["quantityAtomic", "valueToleranceMicrousd", "Authorization: Bearer"]
):
    raise SystemExit("Private output detected; log withheld.")
(
    root
    / f'docs/evidence/job-{a.request_id}-{a.phase}-{"broadcast" if a.broadcast else "simulation"}.log'
).write_text(output)
print(output)
raise SystemExit(result.returncode)
