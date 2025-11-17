'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'

interface Conversation {
  id: string  // UUID
  title: string
  created_at: string
  updated_at: string
  last_accessed_at: string
  message_count?: number
}

interface UpdateConversationParams {
  conversationId: string  // UUID
  clientId: string
  title: string
}

export function useUpdateConversation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ conversationId, clientId, title }: UpdateConversationParams) => {
      const res = await fetch(`http://localhost:8000/api/conversations/${conversationId}?client_id=${clientId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ title }),
      })

      if (!res.ok) {
        throw new Error(`Failed to update conversation: ${res.statusText}`)
      }

      const data: Conversation = await res.json()
      return data
    },
    onSuccess: (updatedConversation, variables) => {
      // Invalidate conversations list to refetch
      queryClient.invalidateQueries({ queryKey: ['conversations', variables.clientId] })
      
      // Update the specific conversation in cache
      queryClient.setQueryData<Conversation[]>(
        ['conversations', variables.clientId],
        (old) => {
          if (!old) return old
          return old.map((conv) =>
            conv.id === updatedConversation.id ? updatedConversation : conv
          )
        }
      )
    },
  })
}
