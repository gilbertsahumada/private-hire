from pathlib import Path
import secrets
import json

root = Path(__file__).resolve().parents[1]
web = root / "apps/web/.dev.vars"
cre = root / "apps/cre/.env"
if web.exists() or cre.exists():
    raise SystemExit("Local credentials already exist; refusing to overwrite.")
values = {
    name: secrets.token_hex(32)
    for name in ["STORAGE_KEY", "A2A_TOKEN", "CONTEXT_TOKEN", "SETUP_TOKEN"]
}
web.write_text("".join(f"{k}={v}\n" for k, v in values.items()))
web.chmod(0o600)
cre.write_text(
    f'SECRET_A2A_TOKEN={values["A2A_TOKEN"]}\nSECRET_CONTEXT_TOKEN={values["CONTEXT_TOKEN"]}\n'
)
cre.chmod(0o600)
print("Generated ignored local credentials. No wallet keys created.")
