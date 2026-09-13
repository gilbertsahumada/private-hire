import { Runner, cre, type TeeRuntime } from '@chainlink/cre-sdk';
import { z } from 'zod';

const configSchema = z.object({
  endpoint: z.literal(
    'https://confidential-agent-jobs-staging.gilbertsahumada.workers.dev/.well-known/agent-card.json',
  ),
});

function checkDeployment(
  runtime: TeeRuntime<z.infer<typeof configSchema>>,
) {
  const secret = runtime
    .getSecret({ id: 'PRIVATEHIRE_DEPLOY_PROBE_V1' })
    .result().value;
  if (!/^[a-f0-9]{64}$/.test(secret)) throw new Error('PROBE_SECRET_INVALID');

  const response = new cre.capabilities.HTTPClient()
    .sendRequest(runtime, {
      url: runtime.config.endpoint,
      method: 'GET',
      timeout: '10s',
      cacheSettings: { store: false, maxAge: '0s' },
      multiHeaders: {
        Accept: { values: ['application/json'] },
        'User-Agent': { values: ['private-hire-cre-probe/1'] },
      },
    })
    .result();
  if (response.statusCode !== 200 || response.body.length > 20000)
    throw new Error('PROBE_HTTP_FAILED');
  const card = JSON.parse(new TextDecoder().decode(response.body));
  if (card.name !== 'Portfolio Calculator' || card.version !== '0.2.0')
    throw new Error('PROBE_CARD_INVALID');
  // Only a public success marker crosses the enclave boundary.
  return 'PRIVATEHIRE_DEPLOY_PROBE_OK';
}

export async function main() {
  const runner = await Runner.newRunner({ configSchema });
  await runner.run(() => [
    cre.handlerInTee(
      new cre.capabilities.CronCapability().trigger({
        schedule: '0 * * * * *',
      }),
      checkDeployment,
      {},
    ),
  ]);
}

main();
