'use client'

import { useState, useRef, useEffect, type FormEvent, type KeyboardEvent, type ChangeEvent } from 'react'
import { shallow } from 'zustand/shallow'
import { useRouter } from 'next/navigation'
import { useWebSocket } from '../../../state/contexts/WebSocketContext'
import { useChatStore, type Document } from '../../../state/store/chatStore'
import { useCreateConversation } from '../../../hooks/useCreateConversation'
import { useUpdateConversation } from '../../../hooks/useUpdateConversation'
import { useConversations } from '../../../hooks/useConversations'
import { generateConversationId } from '../../../utils/uuid'
import { DocumentList } from './DocumentList'

interface MessageInputProps {
  readonly conversationId: string | null
  readonly onMessageSent?: () => void
}

const EMPTY_DOCS: Document[] = []

export function MessageInput({ conversationId, onMessageSent }: MessageInputProps) {
  const [input, setInput] = useState('')
  const [isCreatingConversation, setIsCreatingConversation] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [pendingDocuments, setPendingDocuments] = useState<Document[]>([])
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  const { sendMessage, stopStreaming, isConnected } = useWebSocket()
  const clientId = useChatStore((state) => state.clientId)
  const thinkingMode = useChatStore((state) => state.thinkingMode)
  const selectedModel = useChatStore((state) => state.selectedModel)
  const setActiveConversation = useChatStore((state) => state.setActiveConversation)
  const addMessage = useChatStore((state) => state.addMessage)
  const getMessages = useChatStore((state) => state.getMessages)
  const addDocument = useChatStore((state) => state.addDocument)
  const updateDocument = useChatStore((state) => state.updateDocument)
  const documents = useChatStore(
    (state) =>
      conversationId
        ? state.documentsByConversation[conversationId] || EMPTY_DOCS
        : EMPTY_DOCS,
    shallow
  )
  const documentStreamsRef = useRef<Map<string, EventSource>>(new Map())
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

  // Close all SSE streams when conversation changes or unmounts
  useEffect(() => {
    return () => {
      documentStreamsRef.current.forEach((es) => es.close())
      // eslint-disable-next-line react-hooks/exhaustive-deps
      documentStreamsRef.current.clear()
    }
  }, [conversationId])

  // Listen for document status via SSE (no polling)
  useEffect(() => {
    const updatePending = (docId: string, updates: Partial<Document>) => {
      setPendingDocuments((prev) =>
        prev.map((d) => (d.id === docId ? { ...d, ...updates } : d))
      )
    }

    const ensureStream = (doc: Document) => {
      if (!doc.sse_url) return
      if (doc.status !== 'processing') return
      if (documentStreamsRef.current.has(doc.id)) return

      const url =
        doc.sse_url.startsWith('http')
          ? doc.sse_url
          : `http://localhost:8000${doc.sse_url}`
      const es = new EventSource(url)
      documentStreamsRef.current.set(doc.id, es)

      es.onmessage = (event) => {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const payload = JSON.parse(event.data) as any
          const { type } = payload
          if (!type) return

          const targetConversationId = conversationId || doc.conversationId || ''
          const chunkCount = payload.chunk_count ?? payload.chunkCount

          if (type === 'status') {
            // Initial snapshot
            updateDocument(targetConversationId, doc.id, {
              status: payload.status,
              chunkCount: chunkCount ?? doc.chunkCount,
            })
            updatePending(doc.id, {
              status: payload.status,
              chunkCount: chunkCount ?? doc.chunkCount,
            })
            if (payload.status === 'ready' || payload.status === 'failed') {
              es.close()
              documentStreamsRef.current.delete(doc.id)
            }
          } else if (type === 'persisted') {
            updateDocument(targetConversationId, doc.id, {
              status: 'ready',
              chunkCount: chunkCount ?? doc.chunkCount,
            })
            updatePending(doc.id, { status: 'ready', chunkCount: chunkCount ?? doc.chunkCount })
          } else if (type === 'failed') {
            updateDocument(targetConversationId, doc.id, {
              status: 'failed',
              errorMessage: payload.error,
            })
            updatePending(doc.id, { status: 'failed', errorMessage: payload.error })
          } else if (type === 'chunking_done') {
            if (chunkCount !== undefined) {
              updateDocument(targetConversationId, doc.id, { chunkCount })
              updatePending(doc.id, { chunkCount })
            }
          } else if (type === 'embedding_done') {
            updatePending(doc.id, { status: 'processing' })
          }

          if (type === 'persisted' || type === 'failed') {
            es.close()
            documentStreamsRef.current.delete(doc.id)
          }
        } catch (err) {
          console.error('Failed to parse SSE message', err)
        }
      }

      es.onerror = () => {
        es.close()
        documentStreamsRef.current.delete(doc.id)
      }
    }

    documents.forEach(ensureStream)
  }, [documents, conversationId, updateDocument])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()

    if ((!input.trim() && pendingDocuments.length === 0) || !clientId || !isConnected) {
      return
    }

    const userMessage = input.trim()
    const attachedDocuments = [...pendingDocuments]

    setInput('')
    setPendingDocuments([])

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
    addMessage(targetConversationId, {
      role: 'user',
      content: userMessage,
      documents: attachedDocuments
    })

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
    // Note: Currently the WebSocket message structure might not support documents directly
    // The documents are already uploaded and associated with the conversation via the upload API
    // We might need to send document IDs in the message if the backend expects it
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

  const handleFileUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !conversationId || !clientId) {
      return
    }

    // Validate file
    const MAX_FILE_SIZE_MB = 50
    const fileSizeMB = file.size / (1024 * 1024)
    if (fileSizeMB > MAX_FILE_SIZE_MB) {
      setUploadError(`File size exceeds ${MAX_FILE_SIZE_MB}MB limit`)
      return
    }

    const ALLOWED_FILE_TYPES = new Set([
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
      'text/markdown',
    ])

    if (!ALLOWED_FILE_TYPES.has(file.type)) {
      setUploadError('Unsupported file type. Please upload PDF, DOCX, TXT, or MD files')
      return
    }

    setUploading(true)
    setUploadError(null)

    try {
      const formData = new FormData()
      formData.append('file', file)

      const response = await fetch(
        `http://localhost:8000/api/conversations/${conversationId}/documents?client_id=${clientId}`,
        {
          method: 'POST',
          body: formData,
        }
      )

      if (!response.ok) {
        const errorData = (await response.json()) as { message?: string }
        throw new Error(errorData.message || 'Upload failed')
      }

      const document = (await response.json()) as Document
      const normalizedDoc: Document = {
        ...document,
        conversationId:
          document.conversationId ||
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (document as any).conversation_id ||
          conversationId ||
          '',
        chunkCount:
          document.chunkCount ??
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (document as any).chunk_count ??
          document.chunkCount ??
          0,
        status: document.status,
      }

      addDocument(conversationId, normalizedDoc)
      setPendingDocuments(prev => [...prev, normalizedDoc])
      // SSE listener is managed in the documents effect; no manual start here
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to upload document'
      setUploadError(errorMessage)
    } finally {
      setUploading(false)
      // Reset input so the same file can be selected again
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const handleUploadClick = () => {
    const inputEl = fileInputRef.current
    if (!inputEl) {
      console.warn('Upload input not ready')
      return
    }

    // Clear previous selection so the same file can be re-picked
    inputEl.value = ''

    // Trigger picker synchronously from the user click
    inputEl.click()
  }

  const removePendingDocument = (docId: string) => {
    setPendingDocuments(prev => prev.filter(doc => doc.id !== docId))
  }

  const uploadDisabled = uploading

  return (
    <div className="w-full max-w-3xl mx-auto">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        id="chat-file-input"
        type="file"
        accept=".pdf,.docx,.txt,.md"
        onChange={handleFileUpload}
        className="absolute h-px w-px -m-px overflow-hidden whitespace-nowrap border-0 p-0"
        disabled={uploadDisabled}
        data-upload-input
      />

      {/* Upload error message */}
      {uploadError && (
        <div className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
          <span className="font-medium">Error:</span> {uploadError}
        </div>
      )}

      <form onSubmit={handleSubmit} className="relative flex w-full flex-col rounded-2xl border border-slate-200 bg-white dark:bg-slate-800 shadow-xl dark:border-slate-800 focus-within:ring-2 focus-within:ring-[#03f3ef33] focus-within:border-[#03f3ef]">

        {/* Pending Documents */}
        {pendingDocuments.length > 0 && (
          <div className="px-4 pt-4">
            <DocumentList documents={pendingDocuments} onDelete={removePendingDocument} />
          </div>
        )}

        <div className="flex items-end gap-2 p-2">
          {/* Upload button - Left side */}
          {conversationId && (
            <button
              type="button"
              onClick={handleUploadClick}
              disabled={uploadDisabled}
              className="shrink-0 rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 focus:outline-none focus:ring-2 focus:ring-[#03f3ef55] disabled:cursor-not-allowed disabled:opacity-60 dark:text-slate-500 dark:hover:bg-slate-700 dark:hover:text-slate-300 transition-colors"
              title={uploading ? 'Uploading...' : 'Attach file'}
            >
              {uploading ? (
                <svg className="h-5 w-5 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              ) : (
                <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                </svg>
              )}
            </button>
          )}

          <textarea
            ref={textareaRef}
            name="chat-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={!isConnected}
            placeholder={isConnected ? "Ask anything..." : "Connecting..."}
            rows={1}
            className="flex-1 resize-none border-0 bg-transparent px-2 py-2.5 text-base text-slate-900 placeholder-slate-400 focus:ring-0 disabled:opacity-60 dark:text-white min-h-11 max-h-96"
            style={{ height: 'auto' }}
          />

          {/* Send/Stop button - Right side */}
          {isStreaming ? (
            <button
              type="button"
              onClick={handleStop}
              className="shrink-0 rounded-xl bg-slate-900 p-2 text-white transition hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-500 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
              title="Stop generating"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="6" width="12" height="12" rx="2" />
              </svg>
            </button>
          ) : (
            <button
              type="submit"
              disabled={!isConnected || (!input.trim() && pendingDocuments.length === 0) || isCreatingConversation || pendingDocuments.some(d => d.status === 'processing')}
              className="shrink-0 rounded-xl bg-[#03f3ef] p-2 text-slate-900 transition hover:bg-[#03d5d2] focus:outline-none focus:ring-2 focus:ring-[#03f3ef55] disabled:cursor-not-allowed disabled:opacity-30 disabled:bg-slate-100 dark:disabled:bg-slate-700 dark:disabled:text-slate-500"
              title={pendingDocuments.some(d => d.status === 'processing') ? "Waiting for documents to process..." : "Send message"}
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="19" x2="12" y2="5" />
                <polyline points="5 12 12 5 19 12" />
              </svg>
            </button>
          )}
        </div>
      </form>
    </div>
  )
}
