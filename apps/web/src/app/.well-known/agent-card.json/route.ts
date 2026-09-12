import { AgentCard } from '@a2a-js/sdk';
import { bindings } from '../../../lib/http';

export function GET() {
  const origin = bindings().PUBLIC_ORIGIN;
  const card = AgentCard.fromJSON({
    name: 'Portfolio Calculator',
    description:
      'Exact portfolio values, weights and concentration for up to ten synthetic positions. Authenticated, operator-provisioned staging probes; registration pending and paid jobs not enabled.',
    version: '0.1.0',
    supportedInterfaces: [
      {
        url: `${origin}/api/agent/a2a`,
        protocolBinding: 'JSONRPC',
        protocolVersion: '1.0',
      },
    ],
    capabilities: {},
    defaultInputModes: ['application/json'],
    defaultOutputModes: ['application/json'],
    securitySchemes: {
      bearer: { httpAuthSecurityScheme: { scheme: 'Bearer' } },
    },
    securityRequirements: [{ schemes: { bearer: { list: [] } } }],
    skills: [
      {
        id: 'portfolio-probe',
        name: 'Portfolio Calculator',
        description:
          'Calculate position values and total micro-USD value using integer truncation, weights in basis points, and concentration as the maximum weight. Returns portfolio-result/v1 JSON.',
        tags: ['portfolio', 'deterministic', 'valuation', 'concentration'],
      },
    ],
  });

  return Response.json(AgentCard.toJSON(card), {
    headers: { 'Cache-Control': 'no-store' },
  });
}
