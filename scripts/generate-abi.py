from pathlib import Path
import json
root=Path(__file__).resolve().parents[1]
data=json.loads((root/'packages/contracts/out/ProbeReceiver.sol/ProbeReceiver.json').read_text())
(root/'packages/chain/src/probe-abi.ts').write_text('// Generated from Foundry output. Regenerate with scripts/generate-abi.py.\nexport const probeReceiverAbi = '+json.dumps(data['abi'],indent=2)+' as const;\n')
