# PrivateHire — qué pulsar y qué decir

**Tú grabas la UI. No ejecutes Python, comandos del proveedor ni `--broadcast`. El operador prepara el proveedor y ejecuta CRE.**

Solicitud nueva actual: https://confidential-agent-jobs-staging.gilbertsahumada.workers.dev/jobs/job-8a12ab89-ff5c-4101-a441-16626f8b7cb7

Es la solicitud **#186298**, ya creada. Si estás grabando esa solicitud, no crees otra. Actualmente espera confirmación del precio por el proveedor: no está financiada ni evaluada todavía.

## 1. Home

**Haz:** muestra la landing.

**Di:**

> “PrivateHire lets you hire agents for private work. We use ERC-8004 for agent identity, ERC-8183 for job coordination and payments, and Chainlink CRE to evaluate results before settling on Arc. Inputs, evaluation rules and full reports stay offchain.”

## 2. Agents → Portfolio Calculator

**Haz:** abre Agents y el perfil de Portfolio Calculator. Muestra identidad y precio.

**Di:**

> “Our first agent is Portfolio Calculator. It analyzes synthetic portfolios for 0.01 test USDC, plus gas. The agent receives the inputs needed for the work, but not the buyer’s private evaluation rules.”

## 3. Formulario

**Haz:** muestra Analyze a portfolio y Use example holdings. El ejemplo es 2.5 unidades a 10 USD; tolerancias cero. Si ya creaste #186298, muestra el formulario sin enviarlo de nuevo y vuelve a esa solicitud.

**Di:**

> “I provide synthetic holdings and choose private validation tolerances. These example holdings are worth 25 dollars. That is the calculated portfolio value, not the service price.”

## 4. Creación y confirmación del precio

**Haz:** para una solicitud todavía sin crear: Review my analysis → Confirm analysis request → Confirm in wallet → firma en MetaMask. Para #186298, este paso YA está hecho.

**Di:**

> “Creating the request records the commitment to the work on Arc. The provider service then confirms the fixed price before I can fund it.”

**Si aparece “The provider needs to confirm your price”: no pulses nada.** Espera al operador. Ese paso no lo ejecuta el comprador. No continúes con el pago hasta que la pantalla muestre el precio confirmado de 0.01 USDC.

## 5. Autorizar y pagar

**Haz, cuando el precio esté confirmado:**

1. Allow this payment amount → Confirm in wallet → confirma en MetaMask. Espera la confirmación.
2. Review payment → Confirm in wallet → confirma en MetaMask. Espera Payment confirmed.

**Di:**

> “I authorize the exact amount and deposit 0.01 test USDC. The contract holds the payment while the agent completes the work and the result is checked.”

No repitas una transacción mientras esté pendiente.

## 6. Informe

**Haz:** espera a que el operador ejecute el servicio del proveedor. Cuando View portfolio report esté habilitado, púlsalo.

**Di:**

> “The provider service runs the agent through A2A and commits its delivery onchain. The report shows a total value of 25 dollars and 100 percent concentration in this single position.”

## 7. Chainlink CRE

**Haz:** el operador ejecuta la simulación y deja su resultado visible en la terminal de VS Code. Tú NO pegues comandos todavía: falta la entrega de esta nueva solicitud. El comando debe corresponder a #186298 y a su hash de submit real; no uses los de #186296.

**Di mientras se muestra la ejecución:**

> “Chainlink CRE retrieves the private evaluation rules, gets the delivery through A2A, verifies its onchain commitment, and checks the result. Only commitments and the decision go to the settlement contract, not the full inputs, report or private rules.”

> “Our evaluator is implemented as a Confidential Workflow. We encountered an enclave configuration error in the deployed environment, so this demo uses CRE simulation. It validates the workflow logic without providing enclave confidentiality.”

**Solo cuando la ejecución termine con decision=1, di:**

> “CRE returned acceptance for this request.”

Si aparece JOB_PENDING, aún no hay aceptación. No lo describas como un resultado exitoso.

## 8. Pago final y cierre

**Haz:** espera a que el operador transmita el reporte autorizado y confirme la liquidación. Vuelve a la UI → Refresh status si hace falta → muestra Accepted → View verification transaction.

**Solo cuando esté confirmado, di:**

> “This confirmed transaction accepted the report and released 0.01 USDC to the provider. Wallet addresses, amounts and settlement outcomes are public, while the content of the work stays offchain.”

> “PrivateHire connects private agent work with verifiable settlement, powered by Chainlink CRE and Arc.”

## Lo que NO debes correr

- Ningún bloque de Python.
- Ningún comando `provider:check` o `provider:watch`.
- Ningún comando con `--broadcast`.
- Ningún comando de la solicitud anterior #186296 para representar esta nueva solicitud.

La operación del proveedor y la transmisión del evaluador necesitan autorización para la nueva solicitud. Las autorizaciones anteriores solo cubrían #186296; no se trasladan automáticamente.

## Si preguntan por privacidad

> “Inputs, reports and evaluation rules are encrypted offchain and accessed through authenticated routes. The agent sees the inputs it needs, but not the policy. The backend operator is trusted and can access the private data.”
