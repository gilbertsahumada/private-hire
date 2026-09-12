"""Read Wrangler JSONC using the installed TypeScript parser."""

import json
import subprocess
from pathlib import Path


def read_jsonc(path: Path):
    root = Path(__file__).resolve().parents[1]
    parser = """
        import ts from 'typescript';
        import { readFileSync } from 'node:fs';
        const path = process.argv[1];
        const parsed = ts.parseConfigFileTextToJson(path, readFileSync(path, 'utf8'));
        if (parsed.error) {
            console.error('Invalid JSONC configuration.');
            process.exit(1);
        }
        process.stdout.write(JSON.stringify(parsed.config));
    """
    result = subprocess.check_output(
        ["node", "--input-type=module", "-e", parser, str(path.resolve())],
        cwd=root,
        text=True,
    )

    return json.loads(result)
