"""Prepare an unsigned deployment; does not sign or send a transaction."""
from pathlib import Path
from urllib.request import Request,urlopen
import json
from decimal import Decimal
root=Path(__file__).resolve().parents[1]
artifact=json.loads((root/'packages/contracts/out/ProbeReceiver.sol/ProbeReceiver.json').read_text())
forwarder='0x6E9EE680ef59ef64Aa8C7371279c27E496b5eDc1'
bytecode=artifact['bytecode']['object']
if not bytecode.startswith('0x'):bytecode='0x'+bytecode
tx={'data':bytecode+forwarder[2:].lower().rjust(64,'0'),'value':'0x0'}
def rpc(method,params):
 with urlopen(Request('https://rpc.testnet.arc.io',json.dumps({'jsonrpc':'2.0','id':1,'method':method,'params':params}).encode(),{'Content-Type':'application/json','User-Agent':'private-hire-probe/0.1'}),timeout=30) as r:data=json.load(r)
 if 'error' in data:raise RuntimeError(data['error'])
 return data['result']
assert int(rpc('eth_chainId',[]),16)==5042002
# Chain ID is encoded from the verified value, avoiding hand-maintained hex.
tx['chainId']=hex(5042002)
gas=int(rpc('eth_estimateGas',[{'data':tx['data'],'value':'0x0'}]),16)
price=int(rpc('eth_gasPrice',[]),16)
(root/'.local').mkdir(exist_ok=True)
(root/'.local/receiver-deployment.json').write_text(json.dumps(tx,indent=2)+'\n')
summary={'chainId':5042002,'contract':'ProbeReceiver','simulationOnly':True,'constructorMockForwarder':forwarder,'value':'0','estimatedGas':gas,'gasPriceWei':str(price),'estimatedNativeUSDC':str(Decimal(gas*price)/Decimal(10**18)),'unsignedTransaction':'.local/receiver-deployment.json','broadcast':False}
(root/'docs/evidence/receiver-deployment-review.json').write_text(json.dumps(summary,indent=2)+'\n')
print(json.dumps(summary,indent=2))
