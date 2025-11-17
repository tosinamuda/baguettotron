import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { Client, ClientUpdateRequest } from '@/types/client'

interface UpdateClientParams {
  clientId: string
  systemPrompt?: string
  temperature?: number
  top_p?: number
  top_k?: number
  repetition_penalty?: number
  do_sample?: boolean
  max_tokens?: number
}

export function useUpdateClientSettings() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async ({ 
      clientId,
      systemPrompt,
      temperature,
      top_p,
      top_k,
      repetition_penalty,
      do_sample,
      max_tokens,
    }: UpdateClientParams): Promise<Client> => {
      const body: ClientUpdateRequest = {}
      
      if (systemPrompt !== undefined) body.system_prompt = systemPrompt
      if (temperature !== undefined) body.temperature = temperature
      if (top_p !== undefined) body.top_p = top_p
      if (top_k !== undefined) body.top_k = top_k
      if (repetition_penalty !== undefined) body.repetition_penalty = repetition_penalty
      if (do_sample !== undefined) body.do_sample = do_sample
      if (max_tokens !== undefined) body.max_tokens = max_tokens
      
      const res = await fetch(`http://localhost:8000/api/clients/${clientId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ detail: 'Failed to update client settings' }))
        throw new Error(errorData.detail || 'Failed to update client settings')
      }
      
      return res.json()
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['client', variables.clientId] })
    },
  })
}
