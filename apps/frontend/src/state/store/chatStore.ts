'use client'

import { create } from 'zustand'
import { persist, createJSONStorage, StateStorage, devtools } from 'zustand/middleware'
import { get, set, del } from 'idb-keyval'

interface Message {
  role: 'user' | 'assistant'
  content: string
  thinking?: string
}

interface StreamingMessage {
  role: 'assistant'
  content: string
  thinking: string
}

interface ChatState {
  // Messages stored per conversation
  messagesByConversation: Record<string, Message[]>
  streamingByConversation: Record<string, StreamingMessage>
  isConnected: boolean
  backendReady: boolean
  thinkingMode: boolean
  selectedModel: string
  clientId: string | null
  activeConversationId: string | null  // UUID
  isSettingsOpen: boolean

  // Actions
  addMessage: (conversationId: string, message: Message) => void
  setMessages: (conversationId: string, messages: Message[]) => void
  getMessages: (conversationId: string) => Message[]
  startStreaming: (conversationId: string) => void
  updateStreamingMessage: (conversationId: string, tokenContent: string, thinking?: string) => void
  reclassifyThinkingAsResponse: (conversationId: string) => void
  completeStreaming: (conversationId: string) => void
  getStreamingMessage: (conversationId: string) => StreamingMessage | null
  isConversationStreaming: (conversationId: string) => boolean
  getStreamingConversations: () => string[]
  setConnected: (connected: boolean) => void
  setBackendReady: (ready: boolean) => void
  setThinkingMode: (enabled: boolean) => void
  setSelectedModel: (model: string) => void
  setClientId: (clientId: string) => void
  clearMessages: (conversationId: string) => void
  setActiveConversation: (conversationId: string | null) => void
  openSettings: () => void
  closeSettings: () => void
}

const indexedDbStorage: StateStorage = {
  getItem: async (name) => {
    const value = await get<string | null>(name)
    return value ?? null
  },
  setItem: async (name, value) => {
    await set(name, value)
  },
  removeItem: async (name) => {
    await del(name)
  },
}

export const useChatStore = create<ChatState>()(devtools(
  persist(
    (set, get) => ({
      messagesByConversation: {},
      streamingByConversation: {},
      isConnected: false,
      backendReady: false,
      thinkingMode: true,
      selectedModel: 'PleIAs/Baguettotron',
      clientId: null,
      activeConversationId: null,
      isSettingsOpen: false,

      addMessage: (conversationId, message) =>
        set((state) => {
          const messages = state.messagesByConversation[conversationId] || []
          return {
            messagesByConversation: {
              ...state.messagesByConversation,
              [conversationId]: [...messages, message],
            },
          }
        }),

      setMessages: (conversationId, messages) =>
        set((state) => ({
          messagesByConversation: {
            ...state.messagesByConversation,
            [conversationId]: messages,
          },
        })),

      getMessages: (conversationId) => {
        const state = get()
        return state.messagesByConversation[conversationId] || []
      },

      startStreaming: (conversationId) =>
        set((state) => {
          const newStreamingMessage: StreamingMessage = {
            role: 'assistant',
            content: '',
            thinking: '',
          }
          
          return {
            streamingByConversation: {
              ...state.streamingByConversation,
              [conversationId]: newStreamingMessage,
            },
          }
        }),

      updateStreamingMessage: (conversationId, tokenContent, thinking) =>
        set((state) => {
          const currentStreaming = state.streamingByConversation[conversationId]
          if (!currentStreaming) {
            console.warn(`No streaming message for conversation ${conversationId}`)
            return state
          }

          const updatedMessage: StreamingMessage = {
            role: 'assistant',
            content: currentStreaming.content + tokenContent,
            thinking: thinking ?? currentStreaming.thinking,
          }

          return {
            streamingByConversation: {
              ...state.streamingByConversation,
              [conversationId]: updatedMessage,
            },
          }
        }),

      reclassifyThinkingAsResponse: (conversationId) =>
        set((state) => {
          const currentStreaming = state.streamingByConversation[conversationId]
          if (!currentStreaming) {
            console.warn(`No streaming message for conversation ${conversationId}`)
            return state
          }

          // Move thinking content to response content
          const updatedMessage: StreamingMessage = {
            role: 'assistant',
            content: currentStreaming.thinking + currentStreaming.content,
            thinking: '', // Clear thinking
          }

          return {
            streamingByConversation: {
              ...state.streamingByConversation,
              [conversationId]: updatedMessage,
            },
          }
        }),

      completeStreaming: (conversationId) =>
        set((state) => {
          // Remove the conversation from streaming state
          const remaining = { ...state.streamingByConversation }
          delete remaining[conversationId]
          
          return {
            streamingByConversation: remaining,
          }
        }),

      getStreamingMessage: (conversationId) => {
        const state = get()
        return state.streamingByConversation[conversationId] || null
      },

      isConversationStreaming: (conversationId) => {
        const state = get()
        return conversationId in state.streamingByConversation
      },

      getStreamingConversations: () => {
        const state = get()
        return Object.keys(state.streamingByConversation)
      },

      setConnected: (connected) =>
        set({
          isConnected: connected,
        }),

      setBackendReady: (ready) =>
        set({
          backendReady: ready,
        }),

      setThinkingMode: (enabled) =>
        set({
          thinkingMode: enabled,
        }),

      setSelectedModel: (model) =>
        set({
          selectedModel: model,
        }),

      setClientId: (clientId) =>
        set({
          clientId,
        }),

      clearMessages: (conversationId) =>
        set((state) => {
          const newMessagesByConversation = { ...state.messagesByConversation }
          delete newMessagesByConversation[conversationId]
          
          const remainingStreaming = { ...state.streamingByConversation }
          delete remainingStreaming[conversationId]
          
          return {
            messagesByConversation: newMessagesByConversation,
            streamingByConversation: remainingStreaming,
          }
        }),

      setActiveConversation: (conversationId: string | null) => {
        set({ activeConversationId: conversationId })
      },

      openSettings: () =>
        set({
          isSettingsOpen: true,
        }),

      closeSettings: () =>
        set({
          isSettingsOpen: false,
        }),
    }),
    {
      name: 'baguettotron-chat-store',
      storage: createJSONStorage(() => indexedDbStorage),
      partialize: (state) => ({
        messagesByConversation: state.messagesByConversation,
        thinkingMode: state.thinkingMode,
        selectedModel: state.selectedModel,
        clientId: state.clientId,
        // activeConversationId is NOT persisted - always starts as null (empty state)
        // streamingByConversation is NOT persisted - transient streaming state
        // isSettingsOpen is NOT persisted - transient UI state
      }),
    }
  ))
)
