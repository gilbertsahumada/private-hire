import json
from urllib.request import Request, urlopen
from pathlib import Path
from datetime import datetime, timezone
RPC='https://rpc.testnet.arc.io'
def rpc(method,params):
 with urlopen(Request(RPC,json.dumps({'jsonrpc':'2.0','id':1,'method':method,'params':params}).encode(),{'Content-Type':'application/json','User-Agent':'private-hire-probe/0.1'}),timeout=25) as response:
  data=json.load(response)
 if 'error' in data: raise RuntimeError(data['error'])
 return data['result']
chain=int(rpc('eth_chainId',[]),16)
assert chain==5042002
addresses={'forwarder':'0x76c9cf548b4179F8901cda1f8623568b58215E62','mockForwarder':'0x6E9EE680ef59ef64Aa8C7371279c27E496b5eDc1','usdc':'0x3600000000000000000000000000000000000000'}
code={k:(len(rpc('eth_getCode',[v,'latest']))-2)//2 for k,v in addresses.items()}
assert code['forwarder']>0 and code['mockForwarder']>0
value=int(rpc('eth_call',[{'to':addresses['usdc'],'data':'0x313ce567'},'latest']),16)
assert value==6
result={'checkedAt':datetime.now(timezone.utc).isoformat(),'chainId':chain,'selector':'3034092155422581607','addresses':addresses,'codeBytes':code,'usdcDecimals':value,'mode':'read-only RPC; no deployment or transaction'}
Path('docs/evidence/arc-read.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(result,indent=2))
