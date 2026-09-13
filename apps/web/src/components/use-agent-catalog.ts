'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from './wallet';

export type Agent = {
  agentId: string;
  description: string;
  image: string;
  name: string;
  wallet: string;
  walletExplorerUrl: string;
  price: string;
  stale: boolean;
  identityVerified: boolean;
  enabled: boolean;
  availabilityReason: string;
  trustUrl: string;
};

export function useAgentCatalog() {
  return useQuery({
    queryKey: ['public-agent-catalog'],
    queryFn: ({ signal }) =>
      api<{ agents: Agent[] }>(
        '/api/agents',
        undefined,
        AbortSignal.any([signal, AbortSignal.timeout(15000)]),
      ),
    staleTime: 15000,
    retry: false,
    refetchOnWindowFocus: false,
  });
}
