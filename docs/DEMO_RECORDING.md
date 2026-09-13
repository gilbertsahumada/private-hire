# PrivateHire — demo desde cero / English narration

Este recorrido crea y completa **una solicitud nueva**, con firmas reales en Arc Testnet. La narración está en inglés; las instrucciones son para quien graba. Puedes cortar las esperas en edición. No presentes un log guardado como una ejecución en vivo.

**Si ya creaste una solicitud y ves “The provider needs to confirm your price before you can pay”, continúa desde el paso 6 con ESA solicitud. No crees otra.**

## 0. Preparación antes de grabar

- Brave con MetaMask, comprador conectado a Arc Testnet. Wallet compradora: `0x5ee75a1B1648C023e885E58bD3735Ae273f2cc52`.
- VS Code abierto en `/Users/gilbertsahumada/projects/private-hire`, con una terminal en esa carpeta.
- Precio del servicio: **0,01 USDC de prueba**, más gas. Los **25 USD** del ejemplo son un cálculo sobre datos ficticios: no necesitas tener ni pagar 25 USD.
- El operador debe tener los archivos locales existentes `.local/provider.env`, `.local/staging-jobs.env` y `.env` configurados. No los muestres en la grabación, ni pegues claves en la terminal.
- La autorización anterior del proveedor y del evaluador era exclusivamente para #186296. Para una solicitud nueva, preparar y autorizar sus operaciones antes de ejecutarlas. El operador debe comprobar fondos, límite acumulado de gas y que no hay una transacción anterior pendiente.
- No ejecutar dos procesos del proveedor a la vez. No ejecutar CRE broadcast mientras el proveedor esté firmando con la misma wallet.
- Staging: https://confidential-agent-jobs-staging.gilbertsahumada.workers.dev/

En la terminal:

```bash
cd /Users/gilbertsahumada/projects/private-hire
```

## 1. Home — presentación

**UI:** abre la landing. No abras aún ninguna solicitud.

**Di:**

> “PrivateHire lets you hire agents for private work, using Chainlink CRE to evaluate results and Arc to settle payments. We use ERC-8004 for agent identity and ERC-8183 for job coordination and settlement. Your task inputs, evaluation rules and full report stay offchain; the blockchain records commitments and payment outcomes.”

## 2. Agents — identidad y servicio

**UI:** pulsa **Agents**, abre **Portfolio Calculator** y muestra identidad, descripción y precio. Pulsa **Analyze a portfolio**.

**Di:**

> “Our first agent is Portfolio Calculator. It analyzes synthetic portfolios for 0.01 test USDC, with gas charged separately. The agent receives the inputs it needs to do the work, but not the buyer’s private evaluation rules. Those rules are used by the evaluator, not published onchain.”

## 3. Conectar la wallet

**UI:** si no estás conectado, pulsa **Connect wallet**, elige MetaMask, acepta la conexión y pulsa **Sign message** para iniciar sesión. Firma el mensaje en MetaMask. Si ya estás conectado con el comprador correcto, sigue.

**Di, si muestras este paso:**

> “I connect my wallet and sign in to access my private requests.”

Esta firma de inicio de sesión no es una transacción de pago.

## 4. Entrada y borrador

**UI:** en `/jobs/new`, pulsa **Use example holdings**. Deja una posición con:

- Asset: `sample-usdc`.
- Quantity: `2.5`.
- Price in USD: `10`.
- Deadline: 24 horas.
- Tolerancias privadas: ambas en cero.

Pulsa **Review my analysis**. Esto guarda un borrador; todavía no paga ni ejecuta el agente.

**Di:**

> “I enter synthetic holdings and choose private validation tolerances. Here, 2.5 units at ten dollars each represent a fictional portfolio worth 25 dollars. That is the value being calculated, not the service price.”

## 5. Crear la solicitud onchain — comprador

**UI:** revisa la cartera y el precio **0.01 USDC**. Pulsa **Confirm analysis request**, después **Confirm in wallet**. Firma en MetaMask y espera la confirmación de red.

**Di:**

> “I review the request and confirm its creation on Arc. This records the commitment to the agreed work; it does not pay for the analysis yet.”

Al confirmar, aparecerá **Analysis #N**. Copia el identificador `job-...` del final de la URL. No confundas ese identificador con el número onchain.

En la terminal, sustituye el texto entre comillas por el identificador REAL de esta solicitud:

```bash
export DEMO_REQUEST_ID='PEGA-AQUI-EL-job-ID-DE-LA-URL'
```

**No uses `job-cfee1d05-d90d-46a7-b858-50206699f8d2`: ya está completada.**

## 6. Confirmar precio — servicio del proveedor

**Si la UI dice “The provider needs to confirm your price before you can pay”, este es el paso que falta. No hay un botón de comprador que sustituya esta acción.**

**Di:**

> “The provider confirms the fixed price before the buyer can fund the request. This is handled by the provider service, using the agent’s wallet.”

**Operador, antes de grabar la terminal:** vincula `.local/provider.env` a `DEMO_REQUEST_ID`, con autorización para confirmar precio y entregar esta solicitud concreta. Mantén el journal y su gasto acumulado: no los borres para reiniciar límites. La variable del shell no sustituye por sí sola el valor guardado en ese archivo.

Este comando prepara únicamente el alcance local, sin firmar ni mostrar secretos:

```bash
python3 - <<'PY'
import json, os, re
from pathlib import Path
request_id = os.environ.get('DEMO_REQUEST_ID', '')
assert re.fullmatch(r'job-[a-z0-9-]+', request_id), 'Set the actual request ID first'
assert request_id != 'job-cfee1d05-d90d-46a7-b858-50206699f8d2', 'This request is already completed'
journal = Path('.local/provider-state/journal.json')
assert not journal.exists() or not json.loads(journal.read_text()).get('pending'), 'Recover the previous transaction first'
p = Path('.local/provider.env')
lines = [line for line in p.read_text().splitlines() if not line.startswith('PROVIDER_REQUEST_ID=')]
p.write_text('\n'.join(lines + ['PROVIDER_REQUEST_ID=' + request_id]) + '\n')
p.chmod(0o600)
print('Provider scope prepared for', request_id)
PY
pnpm provider:check
```

La comprobación debe mostrar el identificador correcto y `action: "budget"`. Si ya dice `wait`, verifica en la UI si el precio está confirmado. Si hay un error, no continúes firmando.

**Tras la autorización concreta del proveedor**, ejecutar:

```bash
ALLOW_PROVIDER_BROADCAST=yes pnpm provider:check --broadcast
```

Espera el hash y vuelve a ejecutar el mismo comando para recuperar su receipt. El journal evita duplicar la transacción:

```bash
ALLOW_PROVIDER_BROADCAST=yes pnpm provider:check --broadcast
```

**UI:** espera a ver **Price confirmed by provider: 0.01 USDC**. Si hace falta, pulsa **Refresh status**. Hasta entonces no puedes financiar.

## 7. Autorizar USDC — comprador

**UI:** pulsa **Allow this payment amount**, revisa el importe, pulsa **Confirm in wallet** y confirma en MetaMask. Espera la confirmación de red.

**Di:**

> “I authorize the contract to use exactly the agreed amount of test USDC.”

La aprobación no deposita todavía el pago. Si ya existe allowance suficiente, el contrato puede no necesitar otra aprobación, pero esta UI actualmente ofrece el paso por separado.

## 8. Depositar el pago — comprador

**UI:** pulsa **Review payment**, revisa el precio y gas, pulsa **Confirm in wallet** y confirma en MetaMask. Espera **Payment confirmed** / **Payment held**. No repitas el pago mientras esté pendiente.

**Di:**

> “I now deposit 0.01 test USDC. The contract holds the payment while the agent completes the work and the result is checked.”

## 9. Ejecutar y entregar — servicio del proveedor

**Operador:** después de comprobar que está financiada, ejecutar bajo la autorización de esta solicitud:

```bash
pnpm provider:check
ALLOW_PROVIDER_BROADCAST=yes pnpm provider:check --broadcast
```

La comprobación debe mostrar `action: "submit"`. El servicio recupera la entrada, llama al agente por A2A, verifica la misma entrega persistida y firma `submit`.

Copia el hash que imprime **`action: "submit"`**, no el hash del presupuesto ni el del pago:

```bash
export DEMO_SUBMIT_TX='PEGA-AQUI-EL-HASH-0x-DE-SUBMIT'
```

Recupera y confirma su receipt:

```bash
ALLOW_PROVIDER_BROADCAST=yes pnpm provider:check --broadcast
```

**UI:** debe mostrar que el informe espera evaluación. Pulsa **View portfolio report** para mostrar **$25** y **100%**. **Evaluation pending** está deshabilitado porque no es una acción del comprador.

**Di:**

> “The provider service runs the agent through A2A and commits the delivery onchain. The report shows a total value of 25 dollars and 100 percent concentration in this single position. No further buyer signature is needed.”

## 10. Ejecutar CRE EN VIVO — sin transmitir aún

**Terminal de VS Code:** estos valores deben ser los de la NUEVA solicitud:

```bash
pnpm jobs:evaluate --request-id "$DEMO_REQUEST_ID" --submit-tx "$DEMO_SUBMIT_TX"
```

**Di mientras corre:**

> “Chainlink CRE is our evaluator. It retrieves the private evaluation rules, gets the agent’s report through A2A, and verifies that the report matches the commitment submitted onchain. It then checks the result against the buyer’s rules. Only a report containing commitments and the decision is sent to the settlement contract—not the full task, result or private rules.”

> “The evaluator is implemented as a Chainlink Confidential Workflow, designed to run these checks inside a trusted execution environment. We encountered an enclave configuration error in the deployed environment, so this demo uses CRE simulation. The inputs and rules still stay offchain, but the simulation itself does not provide enclave confidentiality.”

**Resultado exigido:** `JOB_EVALUATED jobId=N decision=1 broadcast=false` y salida exitosa. Si devuelve `JOB_PENDING`, no es aceptación ni rechazo: deja la evaluación pendiente y revisa el fallo. No pases al broadcast.

**Di al obtener éxito:**

> “The evaluation passed. CRE returned acceptance for this request.”

## 11. Transmitir la aceptación — operador

**Antes del comando:** preparar el reporte de esta solicitud, revisar destino, estado Submitted y gas, y obtener autorización concreta de transmisión. El evaluador configurado es `0x391579ce844b95fc871fa9ce0af1ac8208418962` en Arc Testnet, mediante el mock forwarder de simulación. No reutilizar la autorización de #186296.

**Tras esa autorización**, ejecutar:

```bash
ALLOW_ARC_BROADCAST=yes pnpm jobs:evaluate --request-id "$DEMO_REQUEST_ID" --submit-tx "$DEMO_SUBMIT_TX" --broadcast
```

**Di:**

> “We now submit the acceptance report to our simulation evaluator on Arc Testnet, which resolves the ERC-8183 request.”

Espera salida exitosa y `decision=1 txHash=0x...`. Si el resultado es ambiguo, verificar primero receipts y estado: no retransmitir a ciegas. No volver a transmitir una solicitud Completed.

## 12. Sincronizar y mostrar el resultado final

**Terminal:**

```bash
pnpm jobs:reconcile
```

Repite únicamente la reconciliación si devuelve `caughtUp: false`, hasta `caughtUp: true` y sin pendientes. Este comando sincroniza eventos, no firma pagos nuevos. El operador verifica receipt, estado Completed, evento de aceptación y transferencia de 10000 unidades atómicas de USDC.

**UI:** vuelve a la solicitud y pulsa **Refresh status** si aún no se actualizó. Muestra:

- **Accepted**.
- **Your report was accepted and the provider was paid.**
- **View portfolio report**.
- **Report verification → View verification transaction**, para abrir Arcscan.
- **Confirmed activity → Report accepted · provider paid**.

**Di:**

> “The confirmed transaction accepted the report and released exactly 0.01 USDC to the provider. Arc makes the settlement verifiable without publishing the task inputs, full report or evaluation rules. Participants, payment amounts and transaction activity are still public.”

**Cierre:**

> “PrivateHire combines Chainlink CRE evaluation with verifiable settlement on Arc, keeping the content of the work offchain. Today we demonstrate one agent, with reusable A2A and MCP adapters providing a foundation for broader integrations.”

## Si preguntan “what exactly stays private?”

> “The task inputs, full report and evaluation rules are stored encrypted offchain and accessed through authenticated routes. The agent receives the inputs it needs, but not the evaluation policy. Wallet addresses, payment amounts, commitments and settlement outcomes are public. The backend operator is trusted and can access the private data.”

Para una demo corta, explica la separación agente/evaluador durante el perfil y muestra la participación de Chainlink CRE en el paso 10. No llames al agente “100% private”, no afirmes que el proveedor desconoce la entrada, ni que el simulador es un enclave.

## Qué se guarda automáticamente y qué no afirmar

Cada ejecución de CRE guarda su log y un JSON con hashes, comando y resultado en `docs/evidence/`. Guardar también el receipt de liquidación, eventos y balances de la nueva solicitud. La grabación y los logs deben corresponder al mismo identificador.

El operador del backend es confiable y puede acceder a los datos privados. El mock forwarder y la simulación no prueban un enclave desplegado. Esta demo acredita aceptación; no presentar rechazo y expiración como recorridos de jobs ya completados.

## Respaldo verificado, si no alcanza el tiempo

La solicitud #186296 ya completó creación, financiación, entrega, CRE simulation y aceptación con pago real en Arc Testnet. Solo como respaldo claramente identificado, puedes mostrarla y decir “This is a request we completed earlier”. No vuelvas a emitir transacciones para ella.

- UI: https://confidential-agent-jobs-staging.gilbertsahumada.workers.dev/jobs/job-cfee1d05-d90d-46a7-b858-50206699f8d2
- Receipt: https://testnet.arcscan.app/tx/0x0a4ca1b9faf2c23dd0afefad4639b2ffe71af42e49b2f1b31e464656e1d8a910
- Evidencia: `docs/evidence/demo-186296-settlement.json`.
