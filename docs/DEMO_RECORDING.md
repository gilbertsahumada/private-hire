# PrivateHire — guía final para grabar de una

**Duración: 2–3 minutos. No abras la terminal, no ejecutes comandos y no firmes más transacciones.**

Vas a mostrar una solicitud nueva que espera confirmación del precio y después una solicitud real que ya completamos. Di claramente cuándo cambias de una a otra. Puedes leer la narración en inglés tal como está escrita.

## Antes de pulsar Record

Prepara estas tres pestañas en Brave, con la wallet del comprador conectada:

1. **Home:** https://confidential-agent-jobs-staging.gilbertsahumada.workers.dev/
2. **Solicitud nueva #186298:** https://confidential-agent-jobs-staging.gilbertsahumada.workers.dev/jobs/job-8a12ab89-ff5c-4101-a441-16626f8b7cb7
3. **Solicitud completada #186296:** https://confidential-agent-jobs-staging.gilbertsahumada.workers.dev/jobs/job-cfee1d05-d90d-46a7-b858-50206699f8d2

Empieza en Home. No necesitas crear otra solicitud. Los 25 dólares son el valor calculado de una cartera ficticia; el servicio cuesta 0.01 USDC de prueba, más gas.

## 1. Home — presenta el proyecto

**Haz:** muestra la landing unos segundos.

**Di:**

> “Hi, this is PrivateHire. It lets you hire agents without putting the details of your work on the blockchain.”
>
> “We use ERC-8004 for agent identity, ERC-8183 to manage requests and payments, and Chainlink CRE to check the results. Payments are settled on Arc.”

## 2. Agents — presenta Portfolio Calculator

**Haz:** pulsa **Agents**, abre el perfil de **Portfolio Calculator** y muestra el nombre, la identidad y el precio.

**Di:**

> “This is our first agent, Portfolio Calculator. It checks a sample portfolio and gives you a report. Each report costs 0.01 test USDC, plus the network fee.”
>
> “The agent sees the inputs it needs to do the work, but it does not see the buyer’s private rules for checking the result.”

## 3. Formulario — muestra qué pide el usuario

**Haz:** pulsa **Analyze a portfolio**, después **Use example holdings**. Muestra una posición con cantidad **2.5** y precio **10 USD**. Si los valores son distintos, ajústalos. Muestra las tolerancias en cero. **No pulses Review my analysis: ya tenemos la solicitud nueva creada.**

**Di:**

> “Here, I enter the holdings and choose how the result should be checked. For this example, I use two point five units at ten dollars each.”
>
> “That gives us a sample portfolio worth twenty-five dollars. That is not the price of the service. The analysis only costs one cent in test USDC.”

## 4. Solicitud nueva — explica la espera

**Haz:** cambia a la pestaña de la **solicitud #186298**. Muestra el precio y el mensaje de espera del proveedor. No pulses pagar ni crear otra solicitud.

**Di:**

> “I’ve already created this request. At this point, the provider service needs to confirm the price. Then the buyer can fund it, and the agent can do the work.”
>
> “To keep this demo short, let’s look at another request we already completed on Arc Testnet.”

**Ahora cambia a la pestaña de #186296.** No digas que la solicitud nueva acaba de completarse.

## 5. Solicitud completada — muestra el informe

**Haz:** en **#186296**, pulsa **View portfolio report**. Muestra el total de **$25** y **100%**.

**Di:**

> “For this request, the buyer paid 0.01 test USDC into the contract. The agent then did the calculation and submitted its report.”
>
> “Here is the result: twenty-five dollars in total, with one hundred percent in this single holding.”

## 6. Chainlink CRE — explica cómo se comprobó

**Haz:** baja hasta **Report verification**, donde aparece **Accepted · CRE simulation**. Quédate en la web; no necesitas abrir VS Code.

**Di:**

> “Chainlink CRE checks the result. It gets the report through A2A, checks that it matches what the agent submitted, and applies the buyer’s private rules.”
>
> “Our evaluator is built as a Confidential Workflow. We hit an enclave setup issue with the deployed version, so we used CRE simulation for this demo. This tests the workflow, but it does not give us enclave protection.”
>
> “The inputs, the full report and the checking rules stay offchain. We also saved the CRE logs in our repo so the judges can check the execution.”

No digas que estás ejecutando CRE en vivo: estás mostrando el resultado de la ejecución real que ya guardamos.

## 7. Arc — muestra la transacción y el pago

**Haz:** muestra **Confirmed activity → Report accepted · provider paid**. Después pulsa **View verification transaction** en Report verification. Se abrirá Arcscan; muestra la transacción confirmada.

**Di:**

> “CRE approved the result and sent the acceptance to Arc Testnet. This is the real transaction. It released 0.01 USDC to the provider.”
>
> “Wallet addresses, payment amounts and the final outcome are public. The content of the work stays offchain.”

## 8. Cierre

**Haz:** vuelve a la solicitud completada, dejando visible **Accepted** o el informe.

**Di:**

> “So that’s PrivateHire: private agent work, checked with Chainlink CRE, and paid through Arc. Today we have one working agent, and we want to make this flow available to more agents. Thanks!”

## Solo si te preguntan qué significa privado

> “The inputs, reports and checking rules are stored encrypted offchain. The agent gets the inputs it needs, but not the checking rules. The backend operator is trusted and can access that data.”

## Recordatorio final

- No Python, no terminal, no comandos y no firmas nuevas.
- #186298 es la solicitud nueva que espera confirmación del precio.
- #186296 es la solicitud completada anteriormente, con pago y evaluación verificados.
- No presentar la simulación como un enclave desplegado.
- La demo muestra aceptación; no afirmar que completamos también rechazo y expiración de jobs.

Transacción verificada de #186296:
https://testnet.arcscan.app/tx/0x0a4ca1b9faf2c23dd0afefad4639b2ffe71af42e49b2f1b31e464656e1d8a910

Evidencia: `docs/evidence/demo-186296-settlement.json` y los logs CRE de la solicitud en `docs/evidence/`.
