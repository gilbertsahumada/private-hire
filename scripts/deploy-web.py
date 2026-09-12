from pathlib import Path
import json, os, subprocess
from read_config import read_jsonc

root = Path(__file__).resolve().parents[1]
if os.environ.get("ALLOW_STAGING_DEPLOY") != "yes":
    raise SystemExit(
        "Set ALLOW_STAGING_DEPLOY=yes only after explicit staging authorization."
    )
c = read_jsonc(root / "apps/web/wrangler.jsonc")
if c["d1_databases"][0]["database_id"].startswith("00000000") or not c["vars"][
    "PUBLIC_ORIGIN"
].startswith("https://"):
    raise SystemExit("Configure the actual staging D1 and HTTPS origin first.")
raise SystemExit(
    subprocess.call(
        ["pnpm", "exec", "opennextjs-cloudflare", "deploy"], cwd=root / "apps/web"
    )
)
