import { AgentCard } from '@a2a-js/sdk';
import metadata from '../../../../public/agent/registration.json';
import { bindings } from '../../../lib/http';

export function GET() {
  const origin = bindings().PUBLIC_ORIGIN;
  const card = AgentCard.fromJSON({
    name: metadata.name,
    description: metadata.description,
    version: metadata.version,
    iconUrl: metadata.image,
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
        name: metadata.name,
        description: metadata.description,
        tags: metadata.capabilities,
      },
    ],
  });

  return Response.json(AgentCard.toJSON(card), {
    headers: { 'Cache-Control': 'no-store' },
  });
}
