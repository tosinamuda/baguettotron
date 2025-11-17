'use client'

import { useQuery } from '@tanstack/react-query'

interface Message {
  role: 'user' | 'assistant'
  content: string
  thinking?: string
}

interface ConversationWithMessages {
  id: string  // UUID
  title: string
  created_at: string
  updated_at: string
  last_accessed_at: string
  messages: Message[]
}

export function useConversation(
  conversationId: string | null, 
  clientId: string | null,
  shouldFetch: boolean = true
) {
  return useQuery({
    queryKey: ['conversation', conversationId, clientId],
    queryFn: async () => {
      if (!conversationId || !clientId) {
        throw new Error('Conversation ID and Client ID are required')
      }

      const res = await fetch(`http://localhost:8000/api/conversations/${conversationId}?client_id=${clientId}`)
      
      if (!res.ok) {
        throw new Error(`Failed to fetch conversation: ${res.statusText}`)
      }
      
      const data: ConversationWithMessages = await res.json()
      return data
    },
    enabled: !!conversationId && !!clientId && shouldFetch,
    staleTime: Infinity, // Conversation history doesn't change - always use cache
    gcTime: 30 * 60 * 1000, // 30 minutes - keep in cache
    refetchOnMount: false, // Use cache if available
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  })
}
