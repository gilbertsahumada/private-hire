from pathlib import Path
from urllib.parse import urlparse
import json, argparse, re

p = argparse.ArgumentParser()
p.add_argument("--origin", required=True)
p.add_argument("--database-id", required=True)
p.add_argument("--receiver")
a = p.parse_args()
u = urlparse(a.origin)
if (
    u.scheme != "https"
    or not u.hostname
    or u.username
    or u.password
    or u.query
    or u.fragment
    or u.path not in ("", "/")
):
    raise SystemExit("Provide an HTTPS origin only.")
if not re.fullmatch(r"[0-9a-fA-F-]{36}", a.database_id) or a.database_id.startswith(
    "00000000"
):
    raise SystemExit("Actual D1 UUID required.")
if a.receiver and (
    not re.fullmatch(r"0x[0-9a-fA-F]{40}", a.receiver) or int(a.receiver, 16) == 0
):
    raise SystemExit("Actual receiver address required.")
root = Path(__file__).resolve().parents[1]
w = root / "apps/web/wrangler.jsonc"
d = json.loads(w.read_text())
d["vars"]["PUBLIC_ORIGIN"] = a.origin.rstrip("/")
d["d1_databases"][0]["database_id"] = a.database_id
w.write_text(json.dumps(d, indent=2) + "\n")
f = root / "apps/cre/probe/config.staging.json"
c = json.loads(f.read_text())
c["origin"] = a.origin.rstrip("/")
if a.receiver:
    c["receiver"] = a.receiver
    c["writeReport"] = True
f.write_text(json.dumps(c, indent=2) + "\n")
print("Staging configuration updated. No deployment or broadcast performed.")
