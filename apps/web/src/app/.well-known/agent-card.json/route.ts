import { AgentCard } from '@a2a-js/sdk';
import { bindings } from '../../../lib/http';
export function GET() {
  const origin = bindings().PUBLIC_ORIGIN;
  const card = AgentCard.fromJSON({
    name: 'Portfolio probe',
    description:
      'Deterministic synthetic portfolio analysis. Stage-one test provider; not registered or funded.',
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
        name: 'Portfolio probe',
        description: 'Compute values, weights and concentration.',
        tags: ['portfolio', 'deterministic'],
      },
    ],
  });
  return Response.json(AgentCard.toJSON(card), {
    headers: { 'Cache-Control': 'no-store' },
  });
}
