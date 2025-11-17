import { useQuery } from '@tanstack/react-query'
import type { ModelConfig } from '../types/models'

export function useModels() {
  return useQuery({
    queryKey: ['models'],
    queryFn: async (): Promise<ModelConfig[]> => {
      const res = await fetch('http://localhost:8000/api/models')
      if (!res.ok) throw new Error('Failed to fetch models')
      return res.json()
    },
    staleTime: 1000 * 60 * 60, // 1 hour
  })
}
