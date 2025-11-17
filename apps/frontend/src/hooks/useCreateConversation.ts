'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { generateConversationId } from '../utils/uuid'

interface Conversation {
  id: string  // UUID
  title: string
  created_at: string
  updated_at: string
  last_accessed_at: string
  message_count?: number
}

interface CreateConversationParams {
  clientId: string
  title?: string
  id?: string  // Optional UUID, will be generated if not provided
}

export function useCreateConversation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ clientId, title = 'New Conversation', id }: CreateConversationParams) => {
      const conversationId = id || generateConversationId()
      
      const res = await fetch('http://localhost:8000/api/conversations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ id: conversationId, client_id: clientId, title }),
      })

      if (!res.ok) {
        if (res.status >= 500) {
          throw new Error('Server error. Unable to create conversation.')
        } else if (res.status === 400) {
          throw new Error('Invalid request. Please try again.')
        } else {
          throw new Error('Unable to create conversation. Please check your connection.')
        }
      }

      const data: Conversation = await res.json()
      return data
    },
    onMutate: async ({ clientId, title = 'New Conversation', id }) => {
      const conversationId = id || generateConversationId()
      const queryKey = ['conversations', clientId]
      
      // Cancel any outgoing refetches to avoid overwriting our optimistic update
      await queryClient.cancelQueries({ queryKey })
      
      // Snapshot the previous value for rollback
      const previousConversations = queryClient.getQueryData<Conversation[]>(queryKey)
      
      // Optimistically update the cache with the new conversation
      const optimisticConversation: Conversation = {
        id: conversationId,
        title,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        last_accessed_at: new Date().toISOString(),
        message_count: 0,
      }
      
      queryClient.setQueryData<Conversation[]>(queryKey, (old = []) => {
        // Add new conversation at the beginning of the list
        return [optimisticConversation, ...old]
      })
      
      // Return context with snapshot for rollback
      return { previousConversations, conversationId }
    },
    onError: (_err, variables, context) => {
      // Rollback to previous state on error
      if (context?.previousConversations) {
        queryClient.setQueryData(
          ['conversations', variables.clientId],
          context.previousConversations
        )
      }
    },
    onSuccess: (_newConversation, variables) => {
      // Invalidate conversations list to refetch and ensure server state is synced
      queryClient.invalidateQueries({ queryKey: ['conversations', variables.clientId] })
      
      // NOTE: We don't set the conversation as active here
      // The "New Chat" button should just clear to empty state
      // Conversation will be set active when user sends first message
    },
  })
}
