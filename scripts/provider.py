"""Launch the isolated provider. Default mode only inspects confirmed requests."""
from pathlib import Path
import os
import subprocess
import sys

root = Path(__file__).resolve().parents[1]
env_file = root / ".local/provider.env"
if not env_file.exists():
    raise SystemExit("Configure .local/provider.env using the documented provider variables.")
env = os.environ.copy()
for line in env_file.read_text().splitlines():
    if line and not line.startswith("#") and "=" in line:
        name, value = line.split("=", 1)
        if name.startswith("PROVIDER_"):
            env[name] = value
# ALLOW_PROVIDER_BROADCAST must come from the invoking operator, never this file.
raise SystemExit(subprocess.call(
    ["pnpm", "exec", "tsx", "scripts/provider/run.ts", *sys.argv[1:]],
    cwd=root / "apps/cre", env=env,
))
