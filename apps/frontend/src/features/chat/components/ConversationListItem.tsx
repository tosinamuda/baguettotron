'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useChatStore } from '../../../state/store/chatStore'
import { useUpdateConversation } from '../../../hooks/useUpdateConversation'

interface Conversation {
  id: string  // UUID
  title: string
  created_at: string
  updated_at: string
  last_accessed_at: string
  message_count?: number
}

interface ConversationListItemProps {
  conversation: Conversation
  isActive: boolean
  isStreaming: boolean
  streamingPreview?: string | null
  onDelete: (conversationId: string) => void
}

export default function ConversationListItem({
  conversation,
  isActive,
  isStreaming,
  streamingPreview,
  onDelete,
}: ConversationListItemProps) {
  const router = useRouter()
  const [isEditing, setIsEditing] = useState(false)
  const [editedTitle, setEditedTitle] = useState(conversation.title)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  
  const clientId = useChatStore((state) => state.clientId)
  const updateMutation = useUpdateConversation()

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isEditing])

  const handleClick = async () => {
    if (isEditing || isActive) return

    if (!clientId) return

    // Navigate to conversation page - URL routing will handle state
    router.push(`/chat/${conversation.id}`)
    
    // Update last accessed timestamp
    try {
      await fetch(`http://localhost:8000/api/conversations/${conversation.id}/access?client_id=${clientId}`, {
        method: 'POST',
      })
    } catch (error) {
      console.error('Failed to update last accessed:', error)
    }
  }

  const handleDoubleClick = () => {
    if (!isActive) return
    setIsEditing(true)
  }

  const handleSaveTitle = () => {
    const trimmedTitle = editedTitle.trim()
    if (!trimmedTitle || trimmedTitle === conversation.title || !clientId) {
      setEditedTitle(conversation.title)
      setIsEditing(false)
      return
    }

    updateMutation.mutate(
      { conversationId: conversation.id, clientId, title: trimmedTitle },
      {
        onSuccess: () => {
          setIsEditing(false)
        },
        onError: () => {
          setEditedTitle(conversation.title)
          setIsEditing(false)
        },
      }
    )
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSaveTitle()
    } else if (e.key === 'Escape') {
      setEditedTitle(conversation.title)
      setIsEditing(false)
    }
  }

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    setShowDeleteConfirm(true)
  }

  const handleConfirmDelete = async (e: React.MouseEvent) => {
    e.stopPropagation()
    setShowDeleteConfirm(false)
    try {
      await onDelete(conversation.id)
    } catch (error) {
      console.error('Failed to delete conversation:', error)
    }
  }

  const handleCancelDelete = (e: React.MouseEvent) => {
    e.stopPropagation()
    setShowDeleteConfirm(false)
  }

  const formatRelativeTime = (dateString: string): string => {
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`
    return date.toLocaleDateString()
  }

  return (
    <div
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      className={`group relative flex cursor-pointer flex-col gap-1 rounded-lg border px-3 py-2.5 transition-all ${
        isActive
          ? 'border-[#03f3ef] bg-[#03f3ef]/10 shadow-sm'
          : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:hover:border-slate-600 dark:hover:bg-slate-750'
      }`}
    >
      {/* Active indicator */}
      {isActive && (
        <div className="absolute left-0 top-0 h-full w-1 rounded-l-lg bg-[#03f3ef]" />
      )}

      {/* Title */}
      <div className="flex items-center gap-2">
        {isActive && (
          <span className="text-[#03f3ef]" title="Active conversation">
            ●
          </span>
        )}
        {isEditing ? (
          <input
            ref={inputRef}
            type="text"
            value={editedTitle}
            onChange={(e) => setEditedTitle(e.target.value)}
            onBlur={handleSaveTitle}
            onKeyDown={handleKeyDown}
            onClick={(e) => e.stopPropagation()}
            className="flex-1 rounded border border-[#03f3ef] bg-white px-2 py-1 text-sm font-medium text-slate-900 outline-none dark:bg-slate-900 dark:text-white"
          />
        ) : (
          <h3
            className={`flex-1 truncate text-sm font-medium ${
              isActive ? 'text-slate-900 dark:text-white' : 'text-slate-700 dark:text-slate-200'
            }`}
            title={conversation.title}
          >
            {conversation.title}
          </h3>
        )}
        
        {/* Streaming indicator */}
        {isStreaming && (
          <div className="flex items-center gap-1.5 text-xs text-[#03f3ef]">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#03f3ef] opacity-75"></span>
              <span className="relative inline-flex h-2 w-2 rounded-full bg-[#03f3ef]"></span>
            </span>
            <span className="font-medium">Streaming...</span>
          </div>
        )}
      </div>

      {/* Streaming preview or metadata */}
      {streamingPreview ? (
        <div className="text-xs italic text-[#03f3ef] dark:text-[#03f3ef] truncate">
          {streamingPreview}
        </div>
      ) : (
        <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
          <span>{formatRelativeTime(conversation.last_accessed_at)}</span>
          {conversation.message_count !== undefined && (
            <span>{conversation.message_count} messages</span>
          )}
        </div>
      )}

      {/* Delete button */}
      {!showDeleteConfirm ? (
        <button
          onClick={handleDeleteClick}
          className="absolute right-2 top-2 rounded p-1 text-slate-400 opacity-0 transition hover:bg-slate-200 hover:text-rose-600 group-hover:opacity-100 dark:hover:bg-slate-700"
          title="Delete conversation"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-4 w-4"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z"
              clipRule="evenodd"
            />
          </svg>
        </button>
      ) : (
        <div
          className="absolute inset-0 flex items-center justify-center gap-2 rounded-lg bg-white/95 dark:bg-slate-800/95"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={handleConfirmDelete}
            className="rounded bg-rose-600 px-3 py-1 text-xs font-medium text-white hover:bg-rose-700"
          >
            Delete
          </button>
          <button
            onClick={handleCancelDelete}
            className="rounded border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            Cancel
          </button>
        </div>
      )}

    </div>
  )
}
