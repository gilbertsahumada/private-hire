import { Runner, cre } from '@chainlink/cre-sdk';

export async function main() {
  const runner = await Runner.newRunner();
  await runner.run(() => [
    cre.handlerInTee(
      new cre.capabilities.CronCapability().trigger({ schedule: '0 * * * * *' }),
      () => 'PRIVATEHIRE_TEE_NO_SECRET_OK',
      {},
    ),
  ]);
}

main();
