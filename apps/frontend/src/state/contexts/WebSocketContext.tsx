'use client'

import { createContext, useContext, ReactNode } from 'react'
import { useWebSocketManager } from '../../hooks/useWebSocketManager'

interface SendMessageParams {
  conversationId: string
  message: string
  thinkingMode: boolean
  model: string
  clientId: string
}

interface WebSocketContextValue {
  sendMessage: (params: SendMessageParams) => boolean
  stopStreaming: (conversationId: string) => void
  isConnected: boolean
}

const WebSocketContext = createContext<WebSocketContextValue | null>(null)

interface WebSocketProviderProps {
  readonly children: ReactNode
}

export function WebSocketProvider({ children }: WebSocketProviderProps) {
  const websocket = useWebSocketManager()
  
  return (
    <WebSocketContext.Provider value={websocket}>
      {children}
    </WebSocketContext.Provider>
  )
}

export function useWebSocket() {
  const context = useContext(WebSocketContext)
  if (!context) {
    throw new Error('useWebSocket must be used within WebSocketProvider')
  }
  return context
}
