from pathlib import Path
import os, subprocess

root = Path(__file__).resolve().parents[1]
cli = os.environ.get("CRE_BIN", str(Path.home() / ".cre/bin/cre"))
raise SystemExit(
    subprocess.call(
        [cli, "workflow", "build", "probe", "--target", "local", "--non-interactive"],
        cwd=root / "apps/cre",
    )
)
