"""Run CRE CLI and save only checked output; no broadcast unless explicitly requested."""
from pathlib import Path
import argparse, os, subprocess, hashlib, json
root=Path(__file__).resolve().parents[1]
p=argparse.ArgumentParser();p.add_argument('scenario',choices=['reject','accept','log']);p.add_argument('--target',choices=['local','staging'],default='local');p.add_argument('--broadcast',action='store_true');p.add_argument('--tx-hash');p.add_argument('--log-index',type=int,default=0);a=p.parse_args()
if a.broadcast and os.environ.get('ALLOW_ARC_BROADCAST')!='yes': raise SystemExit('Set ALLOW_ARC_BROADCAST=yes only after explicit user authorization.')
cli=os.environ.get('CRE_BIN',str(Path.home()/'.cre/bin/cre'))
cmd=[cli,'workflow','simulate','probe','--target',a.target,'--non-interactive','--trigger-index','1' if a.scenario=='log' else '0']
secret_env=root/'.local/staging-cre.env' if a.target=='staging' else root/'apps/cre/.env'
if not secret_env.exists(): raise SystemExit('Generate credentials for the selected environment first.')
cmd += ['--env',str(secret_env)]
if a.scenario=='log':
 if not a.tx_hash: raise SystemExit('--tx-hash is required for log simulation.')
 cmd += ['--evm-tx-hash',a.tx_hash,'--evm-event-index',str(a.log_index)]
else: cmd += ['--http-payload',str(root/f'.local/{a.scenario}.json')]
if a.broadcast: cmd.append('--broadcast')
result=subprocess.run(cmd,cwd=root/'apps/cre',stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True)
output=result.stdout
for file in [secret_env,root/'apps/cre/.env',root/'apps/web/.dev.vars',root/'.local/staging-service.env']:
 if file.exists():
  for line in file.read_text().splitlines():
   if '=' in line:
    value=line.split('=',1)[1].strip().strip('"')
    if len(value)>=16 and value in output: raise SystemExit('Secret canary detected; refusing to publish output.')
for marker in ['unitPriceMicrousd','valueToleranceMicrousd','SECRET_CONTEXT_TOKEN=','Authorization: Bearer']:
 if marker in output: raise SystemExit('Private-data marker detected; refusing to publish output.')
directory=root/'docs/evidence';directory.mkdir(exist_ok=True)
name=f'cre-{a.target}-{a.scenario}'+('-broadcast' if a.broadcast else '-no-broadcast')
(directory/f'{name}.log').write_text(output)
print(output)
raise SystemExit(result.returncode)
