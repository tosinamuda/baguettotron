'use client'

import { useRouter } from 'next/navigation'
import { useChatStore } from '../../../state/store/chatStore'
import { useConversations } from '../../../hooks/useConversations'
import { useDeleteConversation } from '../../../hooks/useDeleteConversation'
import ConversationListItem from './ConversationListItem'

interface ConversationListProps {
  isOpen?: boolean
  onToggle?: () => void
}

export default function ConversationList({ onToggle }: ConversationListProps) {
  const router = useRouter()
  const activeConversationId = useChatStore((state) => state.activeConversationId)
  const clientId = useChatStore((state) => state.clientId)
  const isConversationStreaming = useChatStore((state) => state.isConversationStreaming)
  const getStreamingMessage = useChatStore((state) => state.getStreamingMessage)
  
  const { data: conversations = [], isLoading: isLoadingConversations, error, refetch, isFetching } = useConversations(clientId)
  const deleteMutation = useDeleteConversation()

  // Show error message for delete failures
  const deleteError = deleteMutation.error instanceof Error ? deleteMutation.error.message : null

  // Sort conversations by last_accessed_at descending (most recent first)
  const sortedConversations = [...conversations].sort(
    (a, b) => new Date(b.last_accessed_at).getTime() - new Date(a.last_accessed_at).getTime()
  )

  const handleNewChat = () => {
    // Navigate to home page (empty state) - conversation will be created when user sends first message
    router.push('/')
  }

  const handleDeleteConversation = (conversationId: string) => {
    if (!clientId) return
    deleteMutation.mutate({ conversationId, clientId })
  }

  const handleRetryLoad = () => {
    refetch()
  }

  const isRetrying = isFetching && !isLoadingConversations

  // Helper function to get streaming preview for a conversation
  const getStreamingPreview = (conversationId: string): string | null => {
    const streamingMessage = getStreamingMessage(conversationId)
    if (!streamingMessage?.content) {
      return null
    }
    
    // Truncate to 50 characters
    const content = streamingMessage.content.trim()
    if (content.length <= 50) {
      return content
    }
    return `${content.substring(0, 50)}...`
  }

  return (
    <aside
      className="flex h-full flex-col border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-800">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Conversations</h2>
        {onToggle && (
          <button
            type="button"
            onClick={onToggle}
            className="rounded p-1 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 md:hidden"
            aria-label="Close sidebar"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5"
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        )}
      </div>

      {/* New Chat Button */}
      <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-800">
        <button
         type="button"
          onClick={handleNewChat}
          disabled={isLoadingConversations}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#03f3ef] px-4 py-2.5 text-sm font-semibold text-slate-900 transition hover:bg-[#03d5d2] disabled:opacity-60"
           aria-label="New Chat"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-5 w-5"
            viewBox="0 0 20 20"
            fill="currentColor"
             aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z"
              clipRule="evenodd"
            />
          </svg>
          New Chat
        </button>
      </div>

      {/* Delete Error Message */}
      {deleteError && (
        <div className="mx-4 mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-800 dark:bg-rose-900/20 dark:text-rose-400">
          {deleteError}
        </div>
      )}

      {/* Conversation List */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {isLoadingConversations ? (
          <div className="flex flex-col gap-3">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-20 animate-pulse rounded-lg bg-slate-200 dark:bg-slate-800"
              />
            ))}
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="text-4xl text-rose-500">⚠️</div>
            <p className="mt-3 text-sm font-medium text-slate-900 dark:text-white">
              Failed to load conversations
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {error instanceof Error ? error.message : 'Unknown error'}
            </p>
            <button
              onClick={handleRetryLoad}
              disabled={isRetrying}
              className="mt-4 flex items-center gap-2 rounded-lg bg-[#03f3ef] px-4 py-2 text-sm font-semibold text-slate-900 transition hover:bg-[#03d5d2] disabled:opacity-60"
            >
              {isRetrying && (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-900 border-t-transparent" />
              )}
              {isRetrying ? 'Retrying...' : 'Retry'}
            </button>
          </div>
        ) : sortedConversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="text-4xl text-slate-300 dark:text-slate-700">💬</div>
            <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
              No conversations yet
            </p>
            <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
              Click &quot;New Chat&quot; to start
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {sortedConversations.map((conversation) => (
              <ConversationListItem
                key={conversation.id}
                conversation={conversation}
                isActive={conversation.id === activeConversationId}
                isStreaming={isConversationStreaming(conversation.id)}
                streamingPreview={getStreamingPreview(conversation.id)}
                onDelete={handleDeleteConversation}
              />
            ))}
          </div>
        )}
      </div>
    </aside>
  )
}
