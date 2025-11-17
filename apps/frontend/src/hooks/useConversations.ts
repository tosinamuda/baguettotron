'use client'

import { useQuery } from '@tanstack/react-query'

interface Conversation {
  id: string  // UUID
  title: string
  created_at: string
  updated_at: string
  last_accessed_at: string
  message_count?: number
}

export function useConversations(clientId: string | null) {
  return useQuery({
    queryKey: ['conversations', clientId],
    queryFn: async () => {
      if (!clientId) {
        throw new Error('Client ID is required')
      }

      const res = await fetch(`http://localhost:8000/api/conversations?client_id=${clientId}`)
      
      if (!res.ok) {
        if (res.status >= 500) {
          throw new Error('Server error. Please try again later.')
        } else if (res.status === 404) {
          throw new Error('Conversations endpoint not found.')
        } else {
          throw new Error('Unable to load conversations. Please check your connection.')
        }
      }
      
      const data: Conversation[] = await res.json()
      return data
    },
    enabled: !!clientId,
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  })
}
