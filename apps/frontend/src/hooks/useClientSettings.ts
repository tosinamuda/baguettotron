import { useQuery } from '@tanstack/react-query'
import type { Client } from '@/types/client'

export function useClientSettings(clientId: string) {
  return useQuery({
    queryKey: ['client', clientId],
    queryFn: async (): Promise<Client> => {
      const res = await fetch(`http://localhost:8000/api/clients/${clientId}`)
      if (!res.ok) throw new Error('Failed to fetch client settings')
      return res.json()
    },
    enabled: !!clientId,
  })
}
