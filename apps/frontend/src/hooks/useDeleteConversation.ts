'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { useChatStore } from '../state/store/chatStore'

interface Conversation {
  id: string  // UUID
  title: string
  created_at: string
  updated_at: string
  last_accessed_at: string
  message_count?: number
}

interface DeleteConversationParams {
  conversationId: string  // UUID
  clientId: string
}

export function useDeleteConversation() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const activeConversationId = useChatStore((state) => state.activeConversationId)
  const clearMessages = useChatStore((state) => state.clearMessages)

  return useMutation({
    mutationFn: async ({ conversationId, clientId }: DeleteConversationParams) => {
      const res = await fetch(`http://localhost:8000/api/conversations/${conversationId}?client_id=${clientId}`, {
        method: 'DELETE',
      })

      if (!res.ok) {
        if (res.status >= 500) {
          throw new Error('Server error. Unable to delete conversation.')
        } else if (res.status === 404) {
          throw new Error('Conversation not found.')
        } else if (res.status === 403) {
          throw new Error('You do not have permission to delete this conversation.')
        } else {
          throw new Error('Unable to delete conversation. Please check your connection.')
        }
      }

      return { conversationId }
    },
    onMutate: async ({ conversationId, clientId }) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['conversations', clientId] })

      // Snapshot the previous value
      const previousConversations = queryClient.getQueryData<Conversation[]>(['conversations', clientId])

      // Optimistically update to remove the conversation
      queryClient.setQueryData<Conversation[]>(
        ['conversations', clientId],
        (old) => {
          if (!old) return old
          return old.filter((conv) => conv.id !== conversationId)
        }
      )

      return { previousConversations }
    },
    onError: (_err, variables, context) => {
      // Rollback on error
      if (context?.previousConversations) {
        queryClient.setQueryData(['conversations', variables.clientId], context.previousConversations)
      }
    },
    onSuccess: (_data, variables) => {
      const { conversationId, clientId } = variables

      // Invalidate conversations list
      queryClient.invalidateQueries({ queryKey: ['conversations', clientId] })

      // Clear messages for deleted conversation
      clearMessages(conversationId)

      // If we deleted the active conversation, navigate to home (empty state)
      if (activeConversationId === conversationId) {
        router.push('/')
      }
    },
  })
}
