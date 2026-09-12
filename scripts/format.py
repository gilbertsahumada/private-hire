"""Apply or check the repository's human-readable source formatting."""

import argparse
import subprocess
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument("--check", action="store_true")
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]

commands = [
    (
        [
            "pnpm",
            "exec",
            "prettier",
            "--check" if args.check else "--write",
            "**/*.{ts,tsx,json,jsonc,yaml,yml}",
        ],
        root,
    ),
    (
        [
            "uvx",
            "--from",
            "black==26.1.0",
            "black",
            *(["--check"] if args.check else []),
            "scripts",
        ],
        root,
    ),
    (
        ["forge", "fmt", *(["--check"] if args.check else [])],
        root / "packages/contracts",
    ),
]

for command, directory in commands:
    subprocess.run(command, cwd=directory, check=True)
