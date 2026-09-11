# Especificación de implementación: contratación de agentes con evaluación confidencial

Este documento es el encargo de implementación para una sesión de Codex. Construye un MVP funcional desde cero, avanzando todo lo posible de manera autónoma. El producto permite contratar un agente remoto, depositar USDC, recibir un trabajo y resolver su pago mediante una evaluación ejecutada en Chainlink CRE Confidential Workflows.

El objetivo inmediato es una entrega de hackathon en menos de 48 horas. La arquitectura está investigada, pero todavía no existe evidencia de una simulación CRE o despliegue de este nuevo proyecto. No confundas viabilidad documental con ejecución verificada. Primero valida la integración más incierta y después completa el producto.

El usuario ha confirmado acceso a la beta de CRE. No volver a solicitar confirmación de ese acceso; pedir solo credenciales concretas cuando una operación las necesite. El acceso no demuestra todavía compatibilidad CRE–Arc, simulación exitosa ni ejecución desplegada.

Esta revisión define un MVP exclusivamente determinista: un proveedor habilitado, cartera sintética, catálogo mínimo y reconciliación por comando. Autenticación, cifrado, autorización y evidencia auténtica son obligatorios. La edición de esta especificación no constituye implementación ni despliegue del producto; las instrucciones siguientes corresponden a una futura sesión autorizada de implementación.

## 1. Instrucciones para Codex

1. Lee este documento completo y las instrucciones del repositorio. Inspecciona el estado existente antes de crear o modificar archivos.
2. Si el repositorio está vacío, crea el monorepo descrito. Si ya hay implementación, conserva el trabajo útil y adapta el plan sin sobrescribir cambios ajenos.
3. Crea `IMPLEMENTATION_PLAN.md` con tareas y estados. Empieza a implementar; no te detengas a pedir aprobación del plan.
4. Resuelve decisiones rutinarias de implementación y documenta las que afecten arquitectura, seguridad o compatibilidad.
5. Prueba pronto CRE y el despliegue real de la app en un entorno de preview cuando haya acceso autorizado. No dejes esos riesgos para el final.
6. Cuando falten credenciales, continúa con contratos, servidor local, UI, pruebas y scripts. Identifica exactamente qué secreto o acceso falta; no solicites repetidamente lo mismo.
7. Mantén separadas evidencia real, simulación y fixtures. No inventes transacciones, agentes registrados, attestation, pagos, direcciones o logs de éxito.
8. No envíes mensajes a terceros. No publiques una submission ni abras una PR externa sin autorización explícita.
9. Prepara scripts de despliegue y transacciones, pero conserva las firmas y broadcasts de wallets bajo control explícito del usuario. Una clave encontrada en el entorno no es permiso para gastar ni transmitir.
10. Si hay autorización previa de despliegue Cloudflare en esa sesión, úsala dentro del alcance concedido. De lo contrario termina código, build y configuración antes de pedir el permiso final de publicación.
11. Termina con qué está implementado, qué se probó, qué sigue bloqueado y los comandos exactos para continuar. No concluyas solo con un plan.

## 2. Producto y alcance aprobado

**Propuesta:** contratar agentes interoperables y condicionar su pago a una evaluación confidencial.

El comprador selecciona un agente identificado mediante trust8004, define un encargo privado, financia un escrow y sigue el trabajo. CRE contacta directamente al agente mediante A2A sobre HTTPS. El proveedor realiza la entrega onchain. Un segundo handler CRE obtiene el resultado del agente, evalúa criterios privados y emite una decisión mínima que el contrato evaluador utiliza para completar o rechazar el pago.

El producto es extensible a diferentes agentes y evaluadores, pero el MVP soporta un único agente y un único tipo de trabajo totalmente implementado. No anuncies compatibilidad universal con agentes ERC-8004, A2A o MCP.

El nombre definitivo está pendiente. Usa una constante `PROJECT_NAME` y el identificador técnico provisional `confidential-agent-jobs`. No impongas un nombre definitivo ni disperses nombres de marca por el código. La interfaz y el README público estarán en inglés; la documentación de coordinación puede estar en español.

### Dentro del MVP

- Turborepo y pnpm workspaces.
- Una app Next.js con UI y Route Handlers del agente en el mismo proyecto.
- Despliegue objetivo de la app en Cloudflare Workers.
- Agente remoto A2A con una capacidad de análisis de cartera, ejecutable localmente y mediante HTTPS.
- Adaptador A2A específico para CRE, sin depender de Fetch global dentro del workflow.
- Un workflow CRE con dos handlers confidenciales, despacho y evaluación.
- Escrow compatible con la superficie ERC-8183 fijada en este documento y receiver/evaluador CRE.
- Liquidación USDC en Arc Testnet.
- trust8004 como proveedor externo de identidad/discovery; reutilización explícita de su API pública.
- D1 para estado operativo y R2 privado para contenidos sensibles, con cifrado de aplicación.
- Recorrido de aceptación, rechazo y devolución por expiración.
- Pruebas negativas, logs sanitizados, guía de demo y evidencia auténtica.

### Fuera del camino crítico

- Circle Agent Stack, Circle CLI o Agent Wallets.
- The Graph, indexación completa de nuevas chains o cambios obligatorios al marketplace existente.
- MCP completo, gRPC, streaming indefinido o SDK universal de agentes.
- Token propio, puentes, x402, swaps, staking o mainnet.
- Custodia automática de claves del proveedor.
- Marketplace abierto sin allowlist, negociación de precios, reputación automática y disputas generales.
- Fork del runtime CRE, plugins Rust y espera de una PR upstream.
- Promesas de privacidad total o calidad universal garantizada por IA.
- Narrativa e integración LLM, excluidas del MVP.

## 3. Arquitectura del monorepo

| Ruta | Responsabilidad |
|---|---|
| `apps/web` | Next.js App Router, UI, autenticación, endpoints privados y endpoint A2A del agente |
| `apps/cre` | Proyecto CRE, configuraciones por entorno y dos handlers confidenciales |
| `packages/contracts` | Foundry, escrow, evaluator, interfaces, pruebas y scripts |
| `packages/agent-transport` | Construcción y validación de mensajes A2A y transporte HTTP para TeeRuntime |
| `packages/domain` | Tipos y esquemas puros, serialización canónica, compromisos y evaluación determinista |
| `packages/chain` | ABI generado, configuración de Arc y utilidades de lectura |
| `packages/config` | Configuración compartida TypeScript y lint si resulta útil |
| `docs` | Arquitectura, privacidad, compatibilidad, runbooks, decisiones y evidencia |

No crees otra app para el agente: vive en los Route Handlers de `apps/web`. Su lógica de negocio debe poder extraerse posteriormente sin cambiar el contrato de protocolo.

La app se despliega en Cloudflare; el workflow se simula con CRE CLI o se despliega en CRE; los contratos se despliegan en Arc. Turborepo coordina las tareas, no convierte esos destinos en un único despliegue.

Usa pnpm como gestor del monorepo. Si el toolchain CRE exige Bun para compilar, documenta esa dependencia e instala Bun en el job de CI correspondiente. Evita múltiples lockfiles contradictorios: determina en el spike cómo consume CRE las dependencias del workspace, genera dist de los paquetes si es necesario y conserva una estrategia reproducible.

`packages/domain` y `packages/agent-transport` deben evitar Node built-ins, acceso a D1/R2, Next.js y dependencias de servidor. No importes accidentalmente el SDK A2A de servidor dentro de CRE mediante un barrel export compartido.

Tareas sugeridas: `dev`, `build`, `typecheck`, `lint`, `test`, `contracts:test`, `cre:compile`, `cre:simulate`, `web:preview`, `web:deploy`, `jobs:reconcile`. Las tareas de despliegue, simulación con efectos, reconciliación y operación de secretos no deben usar cache de Turbo.

## 4. Primer gate: CRE → A2A → reporte → receiver en Arc

Antes de invertir en UI, valida las dos dependencias críticas con datos sintéticos. El acceso a la beta está confirmado, pero las capacidades concretas y su compatibilidad deben verificarse.

### Transporte confidencial

1. Un endpoint A2A de prueba real, con datos sintéticos y una versión fijada.
2. Un handler registrado mediante `handlerInTee`, no `handler`.
3. Una credencial recuperada mediante `runtime.getSecret` dentro del callback.
4. Un POST construido por el adaptador y enviado mediante `HTTPClient.sendRequest(teeRuntime, ...)`.
5. Validación de JSON-RPC, versión, identificador y resultado recibido.
6. Una comparación con una tolerancia privada que cambie el resultado, sin modificar la entrada pública del trigger.
7. Salida pública mínima, sin cuerpo de respuesta ni secretos.
8. Ejecución mediante CRE CLI y conservación de output sanitizado y versiones.

### Reporte y destino onchain

1. Verificar soporte efectivo de Arc para lecturas, triggers y escritura de reportes necesarios en la modalidad utilizada; distinguir soporte de simulación y de workflow desplegado.
2. Documentar versiones de CLI/SDK, chainId, selector CRE, forwarder y configuración de identidad del workflow. Obtener direcciones de fuentes oficiales y comprobar el entorno; no inferir soporte por la mera existencia de un RPC EVM.
3. Generar un reporte mínimo desde el handler confidencial, cruzando al DON únicamente con datos públicos. Preparar un receiver mínimo con validación de caller e identidad apropiada para su entorno.
4. Probar la entrega mediante `writeReport` al receiver en Arc cuando el broadcast esté autorizado, conservando receipt y evidencia de recepción. Una simulación local o un mock no completa esta comprobación de Arc.
5. En la integración posterior, extender la misma ruta hasta la resolución del escrow y comprobar pago, rechazo y devolución por expiración.

Registrar por separado tres clases de evidencia: simulación CRE sin broadcast; simulación CRE con broadcast y transacción confirmada en testnet; ejecución de un workflow desplegado y su transacción confirmada. Ninguna acredita automáticamente las otras. Un pago originado desde simulación no prueba ejecución confidencial desplegada. Si faltan firmas autorizadas, dejar la prueba correspondiente pendiente y las transacciones preparadas; no declarar superado el gate completo.

Un mock unitario no satisface este gate. Si falta login o una credencial concreta, identificarla y continuar con los componentes independientes. No inventar rutas de autenticación ni sustituir la simulación por Node afirmando que es CRE. Si la integración CRE–Arc resulta incompatible, registrar el bloqueo y consultar al usuario antes de cambiar red o arquitectura; continuar con el trabajo independiente.

Si CRE no puede alcanzar localhost durante la simulación, usar un endpoint HTTPS autorizado o un túnel de desarrollo autorizado. No asumir que `localhost` señala al mismo proceso en todas las modalidades CRE.

### Prueba temprana de Cloudflare

Durante esta misma fase, construir una app mínima Next.js adaptada a Workers y probar un Route Handler, lectura/escritura D1 y escritura/recuperación cifrada de un objeto R2 sintético. Verificarla en el runtime de preview de Cloudflare, no solo en `next dev`. Registrar si los bindings son locales o remotos; el preview local no acredita recursos desplegados. Publicar y probar recursos remotos únicamente con autorización, conservando esta verificación pendiente si falta.

## 5. Versiones y compatibilidad

La investigación inspeccionó:

| Componente | Referencia inspeccionada |
|---|---|
| CRE TypeScript | `smartcontractkit/cre-sdk-typescript`, commit `d366a0f69cb32f99ad1ed2cddc26165de693e044`; manifiesto SDK 1.19.1 |
| Templates CRE | `smartcontractkit/cre-templates`, commit `d0223f31182c76bc36b1cc9d47b13b18efcf2bf6` |
| A2A JS | `a2aproject/a2a-js`, commit `ce10234b3a68e34c5b605eb95aaaf1474b9397fe`; manifiesto SDK 1.1.0, protocolo 1.0 |
| MCP TypeScript | `modelcontextprotocol/typescript-sdk`, commit `b65426158ed9f29aea8ef3dc09ca22d7d9d6f970`; rama principal v2 |

Estas referencias no prueban que todos los packages estén publicados o disponibles para la cuenta. Comprueba las versiones instalables, fija las utilizadas en el lockfile y escribe `docs/COMPATIBILITY.md`. Si el toolchain autorizado soporta otra versión, adapta ambos extremos y documenta la decisión.

Para el protocolo A2A propuesto, fija 1.0 y sus métodos `SendMessage`/`GetTask`, cabecera `A2A-Version: 1.0` y serialización definida por su esquema. No combines ese protocolo con mensajes 0.3 `message/send` o estructuras antiguas. Usa tipos/schemas del SDK fijado como referencia y valida el wire format, no solo los nombres de métodos.

No asumas compatibilidad Node de CRE. Usa la API `.result()` de las capacidades, no un cliente de red que dependa de `fetch` o temporizadores globales.

## 6. Caso de uso del agente

El agente recibe una cartera sintética privada y produce un informe estructurado. El encargo exige calcular valores, pesos y concentración de las posiciones. El comprador paga por exactitud y cobertura del trabajo, independientemente de que la concentración calculada sea alta o baja.

### Entrada de negocio propuesta

```ts
type PortfolioJobInput = {
  schemaVersion: 'portfolio-input/v1';
  requestId: string;
  positions: Array<{
    assetId: string;
    quantityAtomic: string;
    quantityDecimals: number;
    unitPriceMicrousd: string;
  }>;
};
```

Los importes y cantidades son strings enteros para evitar errores de precisión. `quantityAtomic` y `unitPriceMicrousd` deben cumplir `^(0|[1-9][0-9]{0,77})$`: de uno a 78 dígitos, sin signo, ceros iniciales, exponentes ni espacios. `quantityDecimals` es un entero entre 0 y 18. Admitir de una a diez posiciones, con `assetId` no vacío y de hasta 128 caracteres; la comparación de identificadores es exacta y sensible a mayúsculas. Prohibir duplicados, valores negativos, cartera vacía y total calculado cero. Validar límites antes de calcular.

Los cálculos intermedios usan BigInt: multiplicar dos entradas de hasta 78 dígitos puede superar uint256. Los valores calculados individuales se acotan a 156 dígitos y el total a 157; no convertirlos a Number ni confundirlos con el presupuesto USDC onchain, que sí debe caber en uint256.

El valor de una posición es `quantityAtomic * unitPriceMicrousd / 10^quantityDecimals`, usando BigInt y redondeo hacia abajo. `totalValueMicrousd` es la suma de esos valores individuales ya truncados. El peso en basis points es `positionValue * 10000 / totalValue`, también truncado. `concentrationBps` es el máximo de los pesos calculados. No ajustar pesos para forzar suma exactamente 10000; los redondeos deben ser reproducibles.

### Salida propuesta

```ts
type PortfolioJobResult = {
  schemaVersion: 'portfolio-result/v1';
  requestId: string;
  totalValueMicrousd: string;
  positions: Array<{
    assetId: string;
    valueMicrousd: string;
    weightBps: number;
  }>;
  concentrationBps: number;
  executionMode: 'deterministic';
};
```

El proveedor calcula únicamente valores deterministas. El resultado es estructurado, con `executionMode` fijo en `deterministic`; no hay generación de texto ni dependencia de un servicio de modelos.

### Política privada propuesta

```ts
type PrivateEvaluationPolicy = {
  schemaVersion: 'portfolio-policy/v1';
  valueToleranceMicrousd: string;
  weightToleranceBps: number;
};
```

La evaluación recalcula desde la entrada comprometida y exige coincidencia de requestId, versiones y modo de ejecución. La cobertura obligatoria es exactamente el conjunto de `assetId` de la entrada: sin omisiones, extras ni duplicados. Comparar posiciones por identificador; no exigir un orden de presentación para aceptar el trabajo. La serialización canónica conserva el orden de arrays del sobre persistido al comprobar su hash, sin reordenarlo durante la verificación.

Para total y cada valor individual, exigir `abs(recibido - recalculado) <= valueToleranceMicrousd`. Para cada peso y para concentración, exigir `abs(recibido - recalculado) <= weightToleranceBps`. Calcular siempre las referencias desde la entrada, no desde cifras declaradas por el proveedor. Pesos y concentración recibidos deben ser enteros entre 0 y 10000, incluso con tolerancia. Los valores monetarios recibidos son strings decimales canónicos no negativos con los límites anteriores.

Las tolerancias predeterminadas son `valueToleranceMicrousd = "0"` y `weightToleranceBps = 0`. La tolerancia monetaria cumple el mismo formato canónico de uno a 78 dígitos que las entradas; la de pesos es un entero entre 0 y 10000. Validar la política antes de congelar el manifiesto; los límites de aceptación son inclusivos. La política no puede añadir entregables desconocidos: la cobertura se deriva de la entrada. El proveedor conoce los requisitos generales del servicio, pero no recibe las tolerancias privadas del comprador.

Una evaluación con resultado negativo es diferente de un fallo técnico. Comprobar primero la integridad del sobre contra `deliverableHash` y después evaluar su contenido de negocio. Un contenido con esquema incorrecto o cifras inválidas solo puede producir rechazo si pertenece al sobre final cuyo compromiso fue verificado. Si JSON inválido, sobre mal formado o discrepancia de hash impiden verificar integridad, dejar la evaluación pendiente con error sanitizado; no emitir rechazo. Un timeout, 401, artefacto ausente o estado de tarea no final también deja la evaluación pendiente, con reintentos acotados y recuperación por expiración.

Para mostrar el caso negativo, crea un proveedor de prueba o modo de fixture explícito que altere una cifra en el resultado antes de comprometerlo. Solo disponible en desarrollo/testnet, no como parámetro abierto de una ruta pública. Usa dos jobs distintos para aceptación y rechazo.

## 7. Identidad y discovery

trust8004 es un proyecto preexistente del usuario. Consume su API pública real; no reimplementes su indexador ni cambies ese repositorio como dependencia obligatoria.

Descubre el contrato real de su API a partir de documentación o código accesible. No inventes URLs, campos, rate limits o respuestas. Implementa un adaptador server-side con timeout y validación. Conserva el identificador global de agente como red del registry + dirección de registry + agentId; no uses solamente tokenId.

El catálogo mínimo del MVP muestra únicamente al proveedor habilitado y probado, con sus datos públicos consultados. Para este proveedor fija endpoint A2A, versión, wallet Arc de proveedor y esquema soportado. Un registro ERC-8004 no garantiza que su endpoint funcione o que acepte el sistema de escrow.

La relación entre identidad y wallet de cobro debe verificarse y documentarse. No asumas que una smart wallet de otra chain existe en Arc con el mismo comportamiento. Si falta registro del agente, prepara metadata y una guía/script para que el usuario lo registre; mientras tanto muestra claramente `unregistered demo provider`, nunca un registro ficticio.

La identidad se fija para el encargo. Un cambio posterior de metadata no puede redirigir credenciales, llamadas o pagos de un job ya financiado.

## 8. Manifiesto, compromisos y secretos

Cada encargo tiene un manifiesto inmutable antes de financiar. Debe vincular al menos:

- Versión, requestId y chainId de liquidación.
- Dirección de escrow, cliente, proveedor y evaluador.
- Identidad global del agente y endpoint A2A autorizado.
- Versión del protocolo y esquema de entrada/salida.
- Entrada privada y política privada.
- Presupuesto esperado, token y vencimiento.
- Nonce aleatorio de 32 bytes generado fuera del workflow con CSPRNG.

El jobId todavía no existe al construir el manifiesto. Vincúlalo después de crear el job mediante el compromiso que figura en su descripción pública y la correlación persistida; no introduzcas una dependencia circular que requiera saber jobId para calcular el hash previo.

Usa un formato canónico único, cubierto por tests, y separación de dominio. Los valores numéricos de dinero se serializan como strings decimales. Rechaza campos desconocidos relevantes, `undefined`, NaN y representaciones ambiguas. No dependas del orden casual de propiedades de objetos.

Diseño sugerido de compromiso:

```text
manifestHash = keccak256(utf8("confidential-agent-jobs:manifest:v1\n" + canonicalManifest))
deliverableHash = keccak256(utf8("confidential-agent-jobs:result:v1\n" + canonicalDeliveryEnvelope))
```

El sobre de entrega contiene chainId, escrow, jobId, requestId, resultado y nonce privado del proveedor. Los nonces forman parte del material privado; no se incluyen en `submit` ni en el reporte público.

Guarda contenidos en R2 privado con AEAD AES-GCM aplicado por el servidor. Clave de cifrado en secreto del despliegue, IV nuevo por objeto y AAD vinculada a tipo, tenant y requestId. D1 guarda referencias y compromisos, no contenido privado duplicado. Si la key de cifrado falta en un entorno desplegado, no recurras silenciosamente a plaintext.

Este modelo confía en el operador del backend, que puede descifrar y acceder a la política. No se anuncia E2E frente a Cloudflare o al operador de la aplicación. CRE obtiene contenido privado por HTTPS autenticado y protege su procesamiento frente a operadores CRE en la modalidad confidencial desplegada; una simulación no acredita esa protección en vivo. La interfaz del agente recibe la entrada necesaria para trabajar, no la política del comprador.

El agente y la API de contexto comparten aplicación. Los tokens separados restringen las rutas y los roles, pero no aíslan secretos frente al operador del servidor compartido. El MVP no demuestra confidencialidad de la política frente a un proveedor que controle ese backend. Declarar esta frontera en la documentación de privacidad y en la explicación del producto.

Vault guarda credenciales de servicio y otros secretos del workflow; no uses un secreto global mutable para sobreescribir la política de jobs anteriores. Recupera el manifiesto específico por requestId/jobId y comprueba su hash onchain.

## 9. Contrato JobEscrow

Implementa un contrato pequeño, no upgradeable, con roles por job y un token USDC fijo. Usa OpenZeppelin con versión fijada para SafeERC20 y ReentrancyGuard. No implementes una función administrativa que pueda resolver arbitrariamente jobs o retirar su escrow.

Superficie objetivo, basada en el borrador ERC-8183 consultado:

```solidity
createJob(address provider, address evaluator, uint256 expiredAt, string description, address hook)
    external returns (uint256 jobId);
setProvider(uint256 jobId, address provider) external;
setBudget(uint256 jobId, uint256 amount, bytes optParams) external;
fund(uint256 jobId, uint256 expectedBudget, bytes optParams) external;
submit(uint256 jobId, bytes32 deliverable, bytes optParams) external;
complete(uint256 jobId, bytes32 reason, bytes optParams) external;
reject(uint256 jobId, bytes32 reason, bytes optParams) external;
claimRefund(uint256 jobId) external;
```

Fija la interfaz real en `IJobEscrow.sol`, genera ABI desde compilación y utiliza ese ABI en web y CRE. Comprueba el borrador fuente antes de afirmar conformidad; documenta especializaciones y diferencias. No mezcles el ABI anterior con repos que usan `bytes` para deliverable o reason.

Estados: Open, Funded, Submitted, Completed, Rejected y Expired.

Reglas del contrato:

- `createJob`: client=msg.sender, evaluator no cero, vencimiento futuro. Provider puede fijarse inicialmente o mediante setProvider antes de financiar.
- `setProvider`: solo cliente, solo Open, solo si aún no existe proveedor, dirección nueva no cero.
- `setBudget`: cliente o proveedor, solo Open, monto positivo. Se elige esta regla del texto normativo consultado; algunos snippets difieren.
- `fund`: solo cliente, solo Open, provider definido, `budget > 0`, presupuesto coincide con expectedBudget y `block.timestamp < expiredAt`; después transferir ERC-20 al escrow. Revertir si nunca se estableció presupuesto o si ya venció.
- `submit`: solo proveedor, solo Funded, `block.timestamp < expiredAt`, compromiso no cero. Guardar `deliverableHash` como extensión de aplicación además del evento.
- `complete`: solo evaluator del job, solo Submitted y `block.timestamp < expiredAt`; marcar Completed y transferir presupuesto al provider.
- `reject`: cliente únicamente en Open, incluso si el borrador onchain ya venció; evaluator en Funded o Submitted únicamente con `block.timestamp < expiredAt`; devolver fondos al cliente si había presupuesto financiado.
- `claimRefund`: cualquier caller cuando el job está Funded o Submitted y `block.timestamp >= expiredAt`; devolver al cliente y marcar Expired.
- Ninguna segunda resolución o nueva entrega tras un estado terminal.
- En el instante exacto del vencimiento, fund, submit y complete/reject del evaluador revierten; claimRefund queda habilitado en Funded o Submitted. Probar ambos lados de la frontera y la igualdad.
- Sin fees de plataforma para el MVP.
- Hooks fuera de alcance: aceptar únicamente hook=address(0), rechazar optParams no vacíos para evitar apariencia de extensiones no implementadas. Documentar esa especialización.

Eventos públicos con datos mínimos: JobCreated, ProviderSet, BudgetSet, JobFunded, JobSubmitted, JobCompleted, JobRejected, JobExpired y eventos de pago/devolución. No emitir ningún contenido del manifiesto.

En esta aplicación, `description` será exclusivamente la representación hexadecimal canónica de `manifestHash`, no el brief. El receiver debe comprobar esa representación contra el hash del reporte. El contrato puede conservar la descripción genérica; solo los jobs con formato de compromiso reconocido son procesables por nuestro evaluator.

Incluye getters claros para Job y deliverableHash. Los tipos del reporte deben caber en Solidity y las cantidades no deben convertirse a Number en la UI.

## 10. Contrato ConfidentialEvaluator

Implementa `IReceiver.onReport(bytes metadata, bytes report)` y ERC165 usando el patrón oficial de CRE. Se registra como evaluator del job al crearlo.

La entrega real sigue: DON firma → KeystoneForwarder verifica → receiver recibe → receiver llama al escrow. El receiver no es un oracle independiente que acepta un POST de nuestra API.

Payload ABI propuesto:

```solidity
struct EvaluationReport {
    uint256 schemaVersion;
    uint256 chainId;
    address escrow;
    address receiver;
    uint256 jobId;
    bytes32 manifestHash;
    bytes32 deliverableHash;
    uint8 decision; // 1=accept, 2=reject
    uint256 validUntil;
}
```

Verifica forwarder, workflow identity permitida según la versión desplegada, chainId, direcciones, estado Submitted, evaluator del job, compromiso del manifiesto, compromiso guardado de la entrega, decisión válida y vigencia. Rechaza datos desconocidos o payload mal formado. Evita replay mediante estado terminal y un identificador/hash de reporte procesado si corresponde; una ejecución revertida no debe consumir irrevocablemente el reporte.

`reason` puede ser hash del reporte, sin descripción privada. Define exactamente la codificación compartida para que TypeScript y Solidity calculen lo mismo.

La simulación puede requerir MockKeystoneForwarder y carecer de metadata de ejecución real. Usa instancias/configuraciones inequívocas de simulación y red real. Nunca publiques como seguro para ejecución real un receiver que acepte cualquier caller o workflow. No uses dirección de forwarder recordada de otra chain.

El template oficial advierte diferencias de longitud de metadata entre herramientas y ejecución real: no impongas 62 bytes rígidos sin comprobar la versión; las identidades y offsets deben tomarse de la implementación actual fijada.

## 11. Arc Testnet

Red objetivo: Arc Testnet, chainId `5042002`, RPC documentado `https://rpc.testnet.arc.io`.

USDC ERC-20 documentado: `0x3600000000000000000000000000000000000000`. Confirmar `eth_chainId`, código/interfaz y `decimals()` antes del despliegue. Interfaz ERC-20 de seis decimales; gas nativo de dieciocho. Son representaciones del mismo saldo: no sumar ni mostrar como dos activos.

Usa allowance y transferFrom de ERC-20 para financiar. Las wallets que envíen transacciones deben reservar saldo para gas. Comprueba receipt exitoso; un txHash por sí solo no prueba pago. No consideres un test Anvil prueba suficiente de las reglas particulares de Arc.

Resuelve forwarder y selector CRE mediante la cuenta/toolchain y directorio oficial. No confundas chainId EVM con chain selector CRE. Conserva direcciones por entorno y genera un manifest de despliegue con ABI/commit y transacciones.

No introducir LINK como dependencia de contrato o pago sin evidencia de que el acceso CRE de la cuenta lo requiere. La facturación real de CRE no quedó confirmada en la investigación y no debe afirmarse gratuita.

## 12. Servidor A2A dentro de Next.js

Implementa la Agent Card en una ruta pública estándar o en la ruta de discovery que declare la metadata ERC-8004. No supongas que la URL de la card es el endpoint de ejecución: lee la interfaz declarada.

Ruta propuesta para mensajes: `POST /api/agent/a2a`. Implementar A2A 1.0 según el SDK/esquema fijado, no una API JSON propia etiquetada como A2A.

Operaciones imprescindibles:

- SendMessage: validar autorización, payload y referencia de job; crear/devolver tarea de forma idempotente.
- GetTask: validar autorización por job/task; devolver estado y artefacto del trabajo.
- Errores JSON-RPC de método desconocido y peticiones mal formadas.
- Respuestas coherentes con media type y versión negociada/fijada.

La entrada de negocio viaja en un DataPart conforme a la versión, o formato admitido documentado. No inventes discriminadores. Cubre la serialización contra el SDK oficial en pruebas de interoperabilidad.

Para el cálculo breve del MVP, completar y persistir dentro de la petición; usar `returnImmediately: false` o su valor predeterminado según el esquema fijado. No prometer ejecución en segundo plano. Guardar la correlación antes de devolver una tarea final o de depender de que otro handler la consulte. El `messageId` determinista complementa las restricciones de persistencia de la sección 19; A2A por sí solo no garantiza idempotencia.

Reservar la tarea en D1 con clave única `(provider, chainId, escrow, jobId)`, vinculada a requestId y manifestHash. Persistir también un compromiso del contenido de la petición validada. Una repetición válida recupera la misma tarea; diferencias de contenido, requestId o manifiesto producen un error explícito de conflicto, sin sobrescribir la tarea. Las llamadas concurrentes deben converger en una única reserva.

Para el cálculo breve del MVP puede completarse en la propia petición. Para trabajo largo se requiere cola/persistencia real: no lanzar una Promise sin esperar y asumir que Next/Worker seguirá vivo. Cloudflare Queues es una extensión opcional; mantén el análisis determinista rápido como camino principal.

El proveedor guarda el resultado y su nonce, genera deliverableHash y expone una acción en la UI para que la wallet provider firme `submit`. No almacenes una private key de proveedor para automatizarlo sin autorización explícita.

GetTask devuelve al evaluator el mismo sobre comprometido, con el mismo resultado y nonce. Solo habilitar submit después de recuperar el objeto cifrado, verificar AEAD y hash y confirmar su referencia en D1. Aplicar el protocolo de persistencia y recuperación de la sección 19; nunca sustituir un sobre ya persistido por una recomputación.

## 13. Adaptador A2A para CRE

`packages/agent-transport` contiene un transporte compatible con TeeRuntime y codecs A2A. Funciones propuestas —son APIs internas nuevas, no exports existentes de Chainlink—:

```ts
sendAgentMessage(teeRuntime, endpointConfig, message): AgentTaskHandle;
getAgentTask(teeRuntime, endpointConfig, taskId): ValidatedTaskResult;
```

Incluye versión fija, request id, Content-Type, Accept y A2A-Version; autenticación desde secreto recuperado dentro del enclave. Configura timeout y cache explícitos. Respeta la codificación bytes/base64 exigida por Request versus RequestJson del SDK CRE; prueba qué representación estás usando.

Valida status HTTP, content type, límite de bytes, JSON-RPC id/version/error, resultado esperado y tamaño de artefacto. Nada de `any` sin validación al salir del borde HTTP. Desactiva cache de respuestas privadas/de trabajo.

Separar validación del transporte y del sobre de la validación del resultado de negocio: el adaptador entrega el contenido como dato no confiable al evaluador, que comprueba primero su compromiso. No descartar un sobre verificable únicamente porque el resultado incumple el esquema de cartera; ese incumplimiento debe poder evaluarse como rechazo conforme a la sección 6.

Allowlist de hosts y HTTPS en producción. No sigas URLs de resultados o redirects a dominios arbitrarios portando Authorization. La salida del agente se trata como datos no confiables, nunca como instrucciones para enviar secretos, cambiar política o elegir otro destino de pago.

No implementar SSE, gRPC, stdio ni fallback silencioso a otra versión. Devuelve un error de compatibilidad explícito. La biblioteca debe documentar su subconjunto, no presentarse como reemplazo completo del SDK A2A.

## 14. Workflow confidencial

Registra ambos handlers con `handlerInTee`. Los triggers y lecturas onchain son públicos; la información sensible se obtiene dentro del enclave. No incluir datos privados en config desplegada, source, payload público del trigger o logs.

### Handler de despacho

1. Recibir evento JobFunded o un trigger autorizado equivalente para simulación.
2. Verificar cadena, emisor de evento y datos actuales del job.
3. Obtener credenciales desde Vault dentro del enclave.
4. Recuperar el manifiesto privado del job mediante un endpoint de contexto autenticado.
5. Recalcular compromiso, comprobar description y partes/importe/vencimiento.
6. Construir exclusivamente la entrada que necesita el agente, sin policy ni nonce del manifiesto.
7. Llamar directamente al endpoint A2A del agente usando TeeRuntime.
8. Persistir correlación de tarea idempotentemente en endpoint operativo privado si hace falta.
9. Terminar sin esperar minutos ni publicar resultados privados.

### Handler de evaluación

1. Recibir JobSubmitted y verificar evento/estado Submitted.
2. Obtener manifiesto, policy y correlación autenticados dentro del enclave.
3. Llamar directamente al agente con GetTask.
4. Exigir artefacto final y correspondencia del job, requestId y taskId.
5. Calcular deliverableHash y comparar con el compromiso onchain antes de validar el esquema de negocio. Si no se puede verificar integridad, dejar pendiente sin emitir decisión.
6. Solo con integridad verificada, validar esquema y ejecutar el evaluador determinista con entrada y criterios privados; un contenido de negocio inválido comprometido puede producir rechazo.
7. Preparar únicamente EvaluationReport.
8. Cruzar mediante `usingTheDons()` para generar el reporte y entregarlo con EVM writeReport.
9. No devolver ni loguear respuesta completa, policy, encabezados, tokens, nonces o detalles de cálculo.

La API de contexto existe para obtener el encargo privado y persistencia operativa; no hace de proxy de A2A. CRE consume al agente directamente.

Límites públicos iniciales para presupuestar: cinco llamadas HTTP, request 10 KB, response 100 KB y ejecución cinco minutos. Confirmar cuotas efectivas de la beta/cuenta. No aplicar automáticamente el timeout de ConfidentialHTTPClient a HTTPClient dentro de TEE; son interfaces distintas.

Si una evaluación falla por infraestructura, no emitir rechazo. Guardar o permitir deducir estado pendiente, reintentar de forma acotada y conservar recuperación por expiración. El comando de reconciliación del MVP permite reactivar trabajos pendientes; un cron queda como extensión posterior autorizada. No usar timers largos del runtime JS.

## 15. Datos y rutas de aplicación

Tablas D1 sugeridas:

| Tabla | Campos y restricciones principales |
|---|---|
| `users` | wallet normalizada, timestamps |
| `auth_nonces` | nonce, wallet/domain binding, expiresAt, consumedAt |
| `job_drafts` | requestId único, buyer, provider, manifestHash, referencia cifrada, estado local |
| `chain_jobs` | clave única chainId+escrow+jobId, requestId, estado confirmado, budgets, tx hashes |
| `agent_tasks` | taskId único; clave única provider+chainId+escrow+jobId; requestId, manifestHash, compromiso de petición, estado, referencia cifrada y deliverableHash |
| `workflow_attempts` | job, fase, attempt, error sanitizado, referencias de ejecución |
| `processed_events` | clave única chainId+txHash+logIndex, blockHash y cursor |

El esquema real puede simplificarse manteniendo invariantes. No almacenar importes grandes como floats ni JSON privado en columnas genéricas.

Rutas sugeridas, ajustables si se conservan responsabilidades:

| Ruta | Responsabilidad y autorización |
|---|---|
| `/api/auth/nonce`, `/api/auth/verify`, `/api/auth/logout` | Autenticación de wallet con nonce de un solo uso |
| `/api/agents` | Catálogo público desde trust8004 y proveedor habilitado |
| `/api/jobs` | Crear borrador cifrado / listar jobs propios |
| `/api/jobs/[id]` | Estado confirmado y metadata permitida al participante |
| `/api/jobs/[id]/result` | Resultado privado para comprador o proveedor autorizado |
| `/api/jobs/[id]/confirm-tx` | Verificar receipt real; no confiar en estado enviado por navegador |
| `/api/internal/jobs/[id]/context` | Contexto privado para CRE autenticado |
| `/api/internal/jobs/[id]/task` | Correlación idempotente autenticada |
| `/api/agent/a2a` | Servicio A2A del agente con autorización |
| `/.well-known/agent-card.json` | Card pública con el endpoint real |

Usa autenticación de wallet con un estándar y librería mantenidos, verificando dominio, chainId cuando aplique, vencimiento y replay. Cookies HttpOnly/Secure/SameSite y protección CSRF para escrituras por cookie. Una wallet enviada como parámetro no autoriza lectura privada.

Los endpoints de CRE requieren credencial de servicio dedicada, comparación segura y scopes explícitos. El proveedor no puede reutilizar su credencial A2A para leer la política. No uses un token genérico que dé acceso indiferenciado a todas las funciones administrativas.

Toda respuesta privada: Cache-Control no-store, sin cache CDN/RSC compartida, sin telemetría de cuerpos. No poner URLs firmadas, claves o material privado en props públicas o variables NEXT_PUBLIC.

## 16. Interfaz

Diseña una UI compacta y coherente, no una landing page vacía. Navegación: Agents, Jobs y Provider. Estados visibles y errores accionables. Responsive para desktop y móvil.

Pantallas:

1. Catálogo mínimo con un proveedor habilitado, identidad y enlace trust8004; mostrar registro pendiente de forma explícita si corresponde.
2. Crear job con una plantilla de cartera sintética: input privado, tolerancias privadas con valores cero predeterminados, precio y vencimiento. La cobertura se deriva de la entrada y el modo es determinista. Validar límites y política antes de congelar el manifiesto. Marcar claramente qué verá el proveedor y qué será público.
3. Revisar y financiar: wallet/chain correctas, proveedor, evaluator, compromiso, presupuesto y aprobación ERC-20. Firma mediante wallet del usuario.
4. Detalle: timeline Draft → Created → Funded → Agent running → Submitted → Evaluating → Completed/Rejected/Expired. Estados operativos offchain distinguidos de estados del contrato.
5. Provider: tareas del proveedor autenticado, resultado preparado, botón Submit que pide firma a la wallet correcta.
6. Evidencia: contrato, transacciones, reporte público y modo de ejecución. Resultado privado accesible solo al participante.

Si solo hay simulación CRE, mostrar `CRE simulation`, nunca `TEE verified live`. Si no hay transacción confirmada, no mostrar Paid. Un fallo temporal debe mostrar Retry/Pending y no Rejected automáticamente.

Fixtures pueden ayudar al desarrollo visual mediante modo demo explícito. La demo final de integración no debe mezclarlos con transacciones ficticias sin etiqueta.

## 17. Cloudflare y CI

Una app Next.js en `apps/web`, incluida su API, se despliega en Workers. No crear un servicio separado para A2A. Selecciona una ruta de adaptación de Next.js documentada y compatible con las dependencias reales; la investigación encontró OpenNext documentado y una recomendación actual de vinext. Para este proyecto prioriza Next.js convencional con una combinación de OpenNext verificada; si hay bloqueo concreto, documenta y evalúa la alternativa antes de cambiarla.

Configura `wrangler.jsonc`, bindings D1/R2, migraciones y scripts de preview. Comprueba con runtime de preview Cloudflare, no solo `next dev`. Los Route Handlers deben ser compatibles con el runtime del adaptador; evita asumir que cualquier módulo Node funcionará.

Cloudflare Builds o GitHub Actions puede ejecutar Turbo filtrado a web, construyendo dependencias compartidas. Los watch paths incluyen `apps/web`, paquetes consumidos, lockfile y config raíz. CRE y contratos tienen jobs separados. No ejecutar todos los deployments por un cambio en documentación.

No intentar lanzar CRE CLI, Bun o Foundry como child process desde un Route Handler desplegado en Workers. La UI refleja estado; el CLI corre en máquina de desarrollo/CI autorizada o el workflow desplegado se ejecuta en CRE.

Secretos propuestos, con nombres ajustables y documentación:

- Clave AEAD de almacenamiento y secreto de sesión para web.
- Credencial de contexto CRE y credencial A2A, separadas por scope.
- Tokens Cloudflare de CI, si están autorizados.
- Credenciales CRE gestionadas por su CLI, nunca compartidas con navegador.

Variables públicas solo para chainId, direcciones de contratos y marca. Un RPC con API key privada no se convierte en público por prefijarlo NEXT_PUBLIC.

## 18. Pruebas y criterios de aceptación

### Contratos

- Fondos salen del comprador y quedan en escrow; allowance insuficiente revierte.
- Financiar sin haber establecido presupuesto, con presupuesto cero o al vencer/después de vencer revierte, incluso si expectedBudget coincide.
- Solo provider puede submit y solo evaluator puede completar/rechazar según estado.
- Complete requiere entrega; no se permite completar desde Funded.
- Rechazo devuelve exactamente presupuesto; completar paga una sola vez.
- En `expiredAt - 1`, `expiredAt` y `expiredAt + 1`, verificar financiación, submit, complete, rechazo del evaluador y claimRefund según estado. Verificar también cancelación por cliente en Open vencido.
- Replay y payload de otra chain/job/escrow/receiver fallan.
- Compromiso de manifiesto o entrega incorrecto falla.
- Reporte de caller o workflow no autorizado falla.
- Transferencia fallida revierte sin perder fondos ni dejar estado terminal falso.

### Protocolo y dominio

- Serialización y hashes idénticos entre app, CRE y Solidity donde aplique.
- A2A wire format contrastado con el SDK oficial fijado.
- Idempotencia de SendMessage: llamadas repetidas y concurrentes recuperan la misma tarea; una petición distinta para la misma clave produce conflicto.
- Task desconocida, versión incorrecta, JSON-RPC error y tarea no terminada se manejan explícitamente.
- Cálculos exactos, redondeo, límites de dígitos y decimales, cobertura incompleta, activos extra/duplicados, concentración incorrecta y resultado alterado.
- Tolerancias cero, diferencia exactamente igual al límite y diferencia que lo supera por una unidad, tanto en valores como en pesos y concentración; políticas fuera de rango fallan antes del manifiesto.
- Vectores con resultados esperados calculados independientemente del código compartido entre proveedor y evaluador, incluyendo truncamiento antes de sumar, pesos que no suman 10000 y productos mayores que uint256.
- El evaluador acepta concentración alta si está bien calculada. Rechaza contenido de negocio inválido solo tras comprobar el compromiso; JSON no verificable, hash diferente, timeout y 401 dejan la evaluación pendiente sin reporte de rechazo.

### Privacidad y aplicación

- Usuario ajeno no lee jobs privados, resultados o contexto CRE.
- La sesión y credencial A2A del proveedor no acceden a policy por las rutas de aplicación; esta prueba no implica aislamiento frente al operador del backend.
- Canarios de secretos ausentes de logs, calldata, payload de reportes y respuestas públicas.
- No cache compartida de datos privados entre wallets.
- Token A2A no autoriza rutas internas y viceversa.
- Datos R2 cifrados y AEAD rechaza manipulación/cambio de contexto.
- Fallos tras reservar tarea, después de escribir R2 y antes de actualizar D1, y después de actualizar D1 pero antes de responder: el reintento recupera la misma tarea y el mismo sobre persistido, incluido nonce.
- Escrituras R2 concurrentes: solo un sobre gana la escritura condicional; todos los intentos recuperan el ganador y convergen en el mismo hash. Una escritura de resultado confirmado en D1 nunca cambia ese hash.
- Objeto ausente, corrupto o ilegible bloquea submit; el reconciliador repara referencias recuperables sin inventar ni reemplazar resultados comprometidos.
- Receipts y eventos verifican chainId, contrato, emisor, estado y job real.

### Integración real

- Simulación CRE exitosa con handlerInTee y evaluación significativa.
- Evidencia de conexión real al agente por A2A y de entrega de un reporte mínimo al receiver en Arc, indicando selector, forwarder, identidad y versiones. La prueba temprana no sustituye la integración con el escrow.
- Tres jobs distintos de testnet: aceptación con pago, rechazo con devolución y expiración con claimRefund, si las firmas están autorizadas. Si no lo están, cubrir los tres recorridos localmente y declarar pendiente la evidencia testnet.
- Si no se autoriza broadcast, pruebas locales y transacciones preparadas, con esa limitación declarada.
- Separar simulación sin broadcast, simulación con broadcast y workflow desplegado. Sin receipt no hay pago demostrado; con receipt de simulación hay transacción real, pero no prueba de ejecución confidencial desplegada.
- Build/preview temprano de Cloudflare exitoso con Route Handler y lectura/escritura D1/R2 cifrada; registrar bindings locales o remotos. Repetir la verificación con el flujo completo integrado. Publicación únicamente cuando esté autorizada.

## 19. Recuperación y operación

### Persistencia idempotente de tareas y entregables

No asumir una transacción atómica entre D1 y R2. Aplicar este protocolo:

1. Validar autorización y referencia del job; reservar en D1 la tarea y su clave única `(provider, chainId, escrow, jobId)`, con requestId, manifestHash y compromiso de petición. Ante conflicto de unicidad, recuperar la reserva y comparar el contenido antes de continuar. Persistir correlación suficiente para encontrar la tarea aunque CRE no llegue a guardar su respuesta de despacho.
2. Usar una clave R2 estable derivada de la tarea reservada. Antes de calcular, comprobar si existe un sobre persistido; si existe, recuperarlo y verificar AEAD, contexto e integridad. No sustituirlo ni regenerar su nonce. Si D1 ya registra un resultado listo o la cadena registra una entrega y el objeto falta, detener la preparación con error de integridad; no pasar al cálculo.
3. Solo si no existe objeto ni resultado previamente confirmado, calcular el resultado y generar nonce privado mediante CSPRNG; construir el sobre canónico y cifrarlo con un IV nuevo. Escribir R2 condicionalmente solo si el objeto no existe, usando la precondición soportada por la API fijada. Nunca usar sobrescritura incondicional. Si otro intento gana la escritura o la respuesta queda incierta, recuperar el objeto ganador antes de continuar. Un nonce candidato no persistido se descarta; no es el entregable definitivo.
4. Recuperar el objeto escrito, comprobar AEAD y contexto, y calcular deliverableHash. Actualizar en D1 referencia, hash y estado listo mediante transición condicional. Si ya estaba listo, exigir la misma referencia y hash; una discrepancia es un error de integridad, no una actualización permitida.
5. Devolver tarea final y habilitar submit únicamente después de verificar recuperación y persistencia. GetTask y los reintentos sirven ese mismo sobre, resultado y nonce. Si un objeto ya confirmado falta, está corrupto o no puede descifrarse, bloquear submit y registrar el fallo; no regenerar un reemplazo.

Distinguir estados operativos de tarea reservada y resultado listo de los estados onchain del escrow. Si el proceso cae después de escribir R2 y antes de actualizar D1, recuperar el objeto y completar la transición. Si cae después de actualizar D1 pero antes de responder, devolver el mismo resultado. El conflicto de contenido en una repetición nunca modifica la reserva original.

### Comando de reconciliación del MVP

No depender de que el navegador permanezca abierto. Implementar `jobs:reconcile` como comando invocable que lea logs y estado solo de los contratos configurados, actualice D1, repare correlaciones mediante la clave de tarea y permita reintentar fases pendientes. El MVP no requiere un servicio permanente; un cron es una extensión posterior autorizada. Documentar ejecución manual y credenciales necesarias.

Conservar cursor durable y deduplicar eventos. Avanzar el cursor después de persistir el lote correspondiente; una repetición del lote debe ser segura. Antes de reactivar despacho o evaluación, consultar el estado actual y vencimiento del job. Los jobs terminales solo sincronizan estado y no vuelven a despachar, evaluar ni resolver. Los vencidos se muestran recuperables por claimRefund cuando corresponda; su firma/broadcast sigue bajo control del usuario.

Registrar intentos y errores sanitizados por fase, aplicar reintentos acotados configurados y permitir reanudación explícita después de corregir el fallo. No usar timers largos ni bucles indefinidos. Los reintentos capaces de transmitir reportes o transacciones conservan los requisitos de autorización y modalidad de ejecución; el comando no concede permiso de firma ni broadcast por sí mismo.

No borrar un job financiado por fallar una escritura D1. La cadena es la fuente de verdad del escrow; A2A sirve el resultado persistido cuya integridad se comprueba contra el compromiso. Los objetos confirmados no se sobrescriben durante reconciliación. Una referencia reparada debe apuntar al sobre original verificado.

## 20. GitHub y documentación final

Inicializa git solo si falta. Usa commits comprensibles cuando esté autorizado por el flujo de trabajo. Si existe origin, respétalo. Si no hay repo GitHub creado o permisos de creación, deja el repositorio local completo y comandos de creación/push preparados; no inventes una URL ni publiques secretos. La visibilidad pública debe estar autorizada antes de crear/publicar el remoto.

Entregables obligatorios:

- README con propuesta, arquitectura, quickstart y estado real de implementación.
- `.env.example` sin secretos y configuración de entornos reproducible.
- `docs/ARCHITECTURE.md`, `docs/PRIVACY.md`, `docs/COMPATIBILITY.md`.
- `docs/DEMO_RUNBOOK.md`: pasos para aceptación, rechazo y expiración.
- `docs/DEPLOYMENT.md`: Cloudflare, contratos y CRE, con permisos y comandos concretos.
- `docs/PREEXISTING_WORK.md`: trust8004 y otras dependencias/copias previas declaradas.
- `docs/evidence/README.md`: índice de evidencia con commit, versiones, modo y resultado.
- Logs sanitizados auténticos; direcciones y tx hashes reales solo si hubo despliegue.
- Lista final de bloqueos y tareas pendientes, sin marcar fixtures como funcionalidades completas.

No garantices elegibilidad From Scratch ni premios por crear un repo nuevo. El enfoque de sponsor es Chainlink Confidential Workflows y Arc/USDC; los requisitos de submission deben cotejarse con la convocatoria real antes de enviar.

## 21. Orden de ejecución y recortes

1. Inspección y scaffold mínimo; gate CRE→A2A y CRE→reporte→receiver en Arc; prueba temprana Next.js/Workers con D1/R2. Documentar modalidad y verificaciones pendientes.
2. Dominio y compromisos con vectores independientes y fixtures sintéticos; contrato escrow y receiver con tests.
3. Endpoint A2A, persistencia de tareas y entrega por wallet provider.
4. Ambos handlers y reporte mínimo; integración de ciclo completo.
5. UI funcional y catálogo mínimo trust8004; integrar autenticación ya exigida por las rutas privadas.
6. Reconciliación por comando, preview Cloudflare del flujo integrado, pruebas negativas, scripts y evidencia de aceptación, rechazo y expiración.
7. Demo y pulido visual; MCP solo si todo lo anterior está suficientemente verificado.

Se pueden desarrollar contratos, UI y servidor en paralelo con worktrees si hay agentes disponibles, pero una única definición de schemas/ABI evita divergencias. Mantén dependencias compartidas pequeñas y congela interfaces temprano.

El alcance inicial ya excluye generación de texto, catálogo amplio y MCP. Si falta tiempo, recortar pulido visual y extensiones; conservar autenticación, cifrado, autorización, agente A2A habilitado, financiación, submit, evaluación, reconciliación y evidencia de los tres recorridos. Si A2A no supera el spike, documentar el bloqueo y consultar antes de cambiar el protocolo; una prueba HTTPS JSON puede servir como diagnóstico, pero no satisface A2A ni el MVP. Si CRE–Arc es incompatible, aplicar la misma regla de consulta antes de cambiar red o arquitectura.

## 22. MCP como extensión opcional

Solo después del recorrido principal, exponer el mismo agente mediante `/api/agent/mcp`, con herramientas propias `start_job` y `get_job_result`. Esos nombres son de la aplicación; MCP aporta tools/list y tools/call.

Fijar revisión y metadata correctas. La revisión 2026-07-28 difiere del handshake/sesiones de 2025. Si el adaptador CRE solo soporta respuestas JSON, documentarlo como perfil limitado: MCP completo exige manejo de SSE también. No afirmar conformidad completa ni compatibilidad con servidores stdio.

La contribución de biblioteca se publica como código original del proyecto, sin esperar aceptación upstream. El SDK CRE inspeccionado usa BUSL-1.1: preservar licencias al copiar código y no presentar el SDK como MIT actual.

## 23. Fuentes técnicas para comprobar durante implementación

- [Guía Confidential Workflows TypeScript](https://docs.chain.link/cre/guides/workflow/using-confidential-workflows/making-workflow-confidential-ts).
- [Referencia TeeRuntime y handlerInTee](https://docs.chain.link/cre/reference/sdk/confidential-workflows-client-ts).
- [Hello Confidential Workflows: simulación y límites de privacidad](https://docs.chain.link/cre-templates/hello-confidential-workflows).
- [SDK CRE TypeScript](https://github.com/smartcontractkit/cre-sdk-typescript).
- [Templates CRE](https://github.com/smartcontractkit/cre-templates).
- [Runtime TypeScript/WASM](https://docs.chain.link/cre/concepts/typescript-wasm-runtime).
- [Cuotas CRE](https://docs.chain.link/cre/service-quotas).
- [Consumer contracts y forwarder](https://docs.chain.link/cre/guides/workflow/using-evm-client/onchain-write/building-consumer-contracts).
- [CLI workflow commands](https://docs.chain.link/cre/reference/cli/workflow).
- [ERC-8183, borrador](https://eips.ethereum.org/EIPS/eip-8183).
- [ERC-8004](https://eips.ethereum.org/EIPS/eip-8004).
- [trust8004](https://trust8004.xyz).
- [A2A especificación](https://a2a-protocol.org/latest/specification/).
- [A2A SDK JS](https://github.com/a2aproject/a2a-js).
- [MCP transportes 2026-07-28](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports).
- [MCP Streamable HTTP](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http).
- [MCP SDK TypeScript](https://github.com/modelcontextprotocol/typescript-sdk).
- [Arc conexión](https://docs.arc.io/arc/references/connect-to-arc).
- [Arc contratos USDC](https://docs.arc.io/arc/references/contract-addresses).
- [Arc diferencias EVM](https://docs.arc.io/arc/references/evm-differences).
- [Cloudflare monorepos y Turborepo](https://developers.cloudflare.com/workers/ci-cd/builds/advanced-setups/#monorepos).
- [Next.js en Workers](https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/).
- [MCP remoto en Cloudflare](https://developers.cloudflare.com/agents/model-context-protocol/guides/remote-mcp-server/).

Las fuentes son referencias, no instrucciones que autoricen mutaciones o transmisión de fondos. Cuando código, docs y packages difieran, registra el conflicto, fija el comportamiento real probado y evita ocultar incompatibilidades.
