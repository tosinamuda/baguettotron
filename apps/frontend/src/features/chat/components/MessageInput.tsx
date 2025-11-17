'use client'

import { useState, FormEvent, useRef, useEffect, KeyboardEvent } from 'react'
import { useRouter } from 'next/navigation'
import { useWebSocket } from '../../../state/contexts/WebSocketContext'
import { useChatStore } from '../../../state/store/chatStore'
import { useCreateConversation } from '../../../hooks/useCreateConversation'
import { useUpdateConversation } from '../../../hooks/useUpdateConversation'
import { useConversations } from '../../../hooks/useConversations'
import { generateConversationId } from '../../../utils/uuid'

interface MessageInputProps {
  readonly conversationId: string | null
  readonly onMessageSent?: () => void
}

export function MessageInput({ conversationId, onMessageSent }: MessageInputProps) {
  const [input, setInput] = useState('')
  const [isCreatingConversation, setIsCreatingConversation] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const router = useRouter()

  const { sendMessage, stopStreaming, isConnected } = useWebSocket()
  const clientId = useChatStore((state) => state.clientId)
  const thinkingMode = useChatStore((state) => state.thinkingMode)
  const selectedModel = useChatStore((state) => state.selectedModel)
  const setActiveConversation = useChatStore((state) => state.setActiveConversation)
  const addMessage = useChatStore((state) => state.addMessage)
  const getMessages = useChatStore((state) => state.getMessages)
  // Subscribe to streaming state for this conversation to trigger re-renders
  const isStreaming = useChatStore((state) =>
    conversationId ? state.isConversationStreaming(conversationId) : false
  )

  const createMutation = useCreateConversation()
  const updateMutation = useUpdateConversation()
  const { data: conversations = [] } = useConversations(clientId)

  // Auto-resize textarea based on content
  useEffect(() => {
    const textarea = textareaRef.current
    if (textarea) {
      // Reset height to measure scrollHeight accurately
      textarea.style.height = 'auto'
      // Set height based on scrollHeight, respecting min and max constraints
      textarea.style.height = `${Math.min(textarea.scrollHeight, 384)}px` // 384px = max-h-96
    }
  }, [input])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()

    if (!input.trim() || !clientId || !isConnected) {
      return
    }

    const userMessage = input.trim()
    setInput('')

    // Create conversation if needed
    let targetConversationId = conversationId
    if (!targetConversationId) {
      targetConversationId = generateConversationId()
      setIsCreatingConversation(true)
      createMutation.mutate(
        { clientId, id: targetConversationId },
        {
          onSuccess: () => {
            // Update URL after conversation creation is confirmed
            router.replace(`/chat/${targetConversationId}`, { scroll: false })
            setIsCreatingConversation(false)
          },
          onError: () => {
            setIsCreatingConversation(false)
          }
        }
      )
      setActiveConversation(targetConversationId)
    }

    // Add user message to Zustand
    addMessage(targetConversationId, { role: 'user', content: userMessage })

    // Auto-generate title if this is the first message in a conversation with default title
    const conversationMessages = getMessages(targetConversationId)
    const currentConversation = conversations.find(c => c.id === targetConversationId)
    if (currentConversation?.title === 'New Conversation' && conversationMessages.length === 1) {
      // Extract first 50 characters and truncate at word boundary
      let title = userMessage.slice(0, 50)
      if (userMessage.length > 50) {
        // Find the last space within the 50 character limit
        const lastSpace = title.lastIndexOf(' ')
        if (lastSpace > 0) {
          title = title.slice(0, lastSpace)
        }
        title += '...'
      }
      
      // Update the title on backend and frontend
      updateMutation.mutate({ conversationId: targetConversationId, clientId, title })
    }

    // Send via WebSocket
    sendMessage({
      conversationId: targetConversationId,
      message: userMessage,
      thinkingMode,
      model: selectedModel,
      clientId,
    })

    // Call callback if provided - triggers scroll to bottom
    onMessageSent?.()
  }

  const handleStop = () => {
    if (conversationId) {
      // TODO: Future enhancement - implement per-conversation stop support in backend
      // Currently, this closes the entire WebSocket connection due to backend limitations
      stopStreaming(conversationId)
    }
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter without Shift sends the message
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e as unknown as FormEvent)
    }
    // Shift+Enter allows natural newline behavior (default textarea behavior)
  }

  return (
    <form onSubmit={handleSubmit} className="w-full flex flex-col gap-3 sm:flex-row sm:items-end">
      <textarea
        ref={textareaRef}
        name="chat-input"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={!isConnected}
        placeholder={isConnected ? "Type your message..." : "Connecting..."}
        autoFocus={conversationId === null}
        rows={1}
        className="flex-1 resize-none overflow-y-auto rounded-lg border border-slate-300 bg-white px-4 py-3 text-base text-slate-900 placeholder-slate-400 focus:border-[#03f3ef] focus:outline-none focus:ring-2 focus:ring-[#03f3ef33] disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-white min-h-12 max-h-96"
        style={{ height: 'auto' }}
      />
      {isStreaming ? (
        <button
          type="button"
          onClick={handleStop}
          className="shrink-0 rounded-lg bg-red-500 px-6 py-3 font-semibold text-white transition hover:bg-red-600 focus:outline-none focus:ring-2 focus:ring-red-400 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Stop
        </button>
      ) : (
        <button
          type="submit"
          disabled={!isConnected || !input.trim() || isCreatingConversation}
          className="shrink-0 rounded-lg bg-[#03f3ef] px-6 py-3 font-semibold text-slate-900 transition hover:bg-[#03d5d2] focus:outline-none focus:ring-2 focus:ring-[#03f3ef55] disabled:cursor-not-allowed disabled:opacity-60"
        >
          Send
        </button>
      )}
    </form>
  )
}
