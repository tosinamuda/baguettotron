import { useRef, useEffect, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useChatStore } from '../state/store/chatStore'

interface WebSocketMessage {
  type: 'start' | 'thinking' | 'token' | 'complete' | 'error' | 'reclassify_thinking_as_response'
  conversation_id?: string
  content?: string
  message?: string
}

interface SendMessageParams {
  conversationId: string
  message: string
  thinkingMode: boolean
  model: string
  clientId: string
}

export function useWebSocketManager() {
  const wsRef = useRef<WebSocket | null>(null)
  const isConnectingRef = useRef(false)
  const pendingRequestsRef = useRef<Map<string, boolean>>(new Map())
  const connectionLostHandledRef = useRef(false)
  const connectRef = useRef<(() => void) | null>(null)

  const startStreaming = useChatStore((state) => state.startStreaming)
  const updateStreamingMessage = useChatStore((state) => state.updateStreamingMessage)
  const reclassifyThinkingAsResponse = useChatStore((state) => state.reclassifyThinkingAsResponse)
  const completeStreaming = useChatStore((state) => state.completeStreaming)
  const addMessage = useChatStore((state) => state.addMessage)
  const setConnected = useChatStore((state) => state.setConnected)
  const getStreamingConversations = useChatStore((state) => state.getStreamingConversations)
  const backendReady = useChatStore((state) => state.backendReady)

  const queryClient = useQueryClient()

  // Connect WebSocket
  const connect = useCallback(() => {
    if (!backendReady) {
      console.log('[WebSocket] Backend not ready yet, skipping connection')
      return
    }


    if (isConnectingRef.current) {
      console.log('[WebSocket] Already connecting, skipping')
      return
    }
    
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      console.log('[WebSocket] Already connected')
      return
    }
    
    console.log('[WebSocket] Connecting to ws://localhost:8000/ws/chat')
    isConnectingRef.current = true
    const ws = new WebSocket('ws://localhost:8000/ws/chat')
    
    ws.onopen = () => {
      console.log('[WebSocket] Connected successfully')
      isConnectingRef.current = false
      setConnected(true)
      connectionLostHandledRef.current = false
    }
    
    ws.onmessage = (event) => {
      try {
        const data: WebSocketMessage = JSON.parse(event.data)
        console.log({webSocketEvent: data});
        const conversationId = data.conversation_id
        
        // Handle missing conversation_id
        if (!conversationId) {
          console.warn('[WebSocket] Received message without conversation_id:', {
            type: data.type,
            hasContent: !!data.content,
            hasMessage: !!data.message,
          })
          return
        }
        
        // Route message to correct conversation
        if (data.type === 'start') {
          connectionLostHandledRef.current = false
          startStreaming(conversationId)
        } else if (data.type === 'thinking') {
          console.log("thinking received")
          // Verify streaming state exists before updating
          const streamingMsg = useChatStore.getState().getStreamingMessage(conversationId)
          if (!streamingMsg) {
            console.warn(`[WebSocket] Received thinking for non-streaming conversation: ${conversationId}`)
            return
          }
          // Thinking messages contain the full thinking content, not incremental
          updateStreamingMessage(conversationId, '', data.content || '')
        } else if (data.type === 'token') {
          // Verify streaming state exists before updating
          const streamingMsg = useChatStore.getState().getStreamingMessage(conversationId)
          if (!streamingMsg) {
            console.warn(`[WebSocket] Received token for non-streaming conversation: ${conversationId}`)
            return
          }
          // Token messages contain incremental content, no thinking update
          updateStreamingMessage(conversationId, data.content || '', undefined)
        } else if (data.type === 'complete') {
          // Get the streaming message before completing
          const streamingMsg = useChatStore.getState().getStreamingMessage(conversationId)
          
          if (!streamingMsg) {
            console.warn(`[WebSocket] Received complete for non-streaming conversation: ${conversationId}`)
            pendingRequestsRef.current.delete(conversationId)
            return
          }
          
          // Add the completed streaming message to regular messages
          addMessage(conversationId, {
            role: streamingMsg.role,
            content: streamingMsg.content,
            // Only include thinking if it has content
            thinking: streamingMsg.thinking ? streamingMsg.thinking : undefined,
          })
          
          // Now remove from streaming state
          completeStreaming(conversationId)
          pendingRequestsRef.current.delete(conversationId)
          
          // Invalidate React Query cache to ensure fresh data on next fetch
          // This prevents race conditions where server data overwrites the just-completed message
          queryClient.invalidateQueries({ queryKey: ['conversation', conversationId] })
        } else if (data.type === 'reclassify_thinking_as_response') {
          // Handle reclassification: move thinking content to response content
          console.log(`[WebSocket] Reclassifying thinking as response for conversation: ${conversationId}`)
          
          // Verify streaming state exists
          const streamingMsg = useChatStore.getState().getStreamingMessage(conversationId)
          if (!streamingMsg) {
            console.warn(`[WebSocket] Received reclassify for non-streaming conversation: ${conversationId}`)
            return
          }
          
          // Perform reclassification
          reclassifyThinkingAsResponse(conversationId)
        } else if (data.type === 'error') {
          console.error('[WebSocket] Server error for conversation', conversationId, ':', data.message)
          
          // Only complete streaming if conversation is actually streaming
          const isStreaming = useChatStore.getState().isConversationStreaming(conversationId)
          if (isStreaming) {
            completeStreaming(conversationId)
          }
          
          addMessage(conversationId, {
            role: 'assistant',
            content: `Error: ${data.message}`,
          })
          pendingRequestsRef.current.delete(conversationId)
        } else {
          console.warn('[WebSocket] Unknown message type:', data.type)
        }
      } catch (error) {
        console.error('[WebSocket] Error processing message:', error)
      }
    }
    
    ws.onclose = (event) => {
      console.log('[WebSocket] Connection closed:', {
        code: event.code,
        reason: event.reason,
        wasClean: event.wasClean,
      })
      
      isConnectingRef.current = false
      setConnected(false)
      
      // Handle connection lost for all streaming conversations
      if (!connectionLostHandledRef.current) {
        connectionLostHandledRef.current = true
        const streamingConversations = getStreamingConversations()
        
        if (streamingConversations.length > 0) {
          console.log(`[WebSocket] Handling connection lost for ${streamingConversations.length} streaming conversation(s):`, streamingConversations)
        }
        
        for (const convId of streamingConversations) {
          // Get the current streaming message to preserve partial content
          const streamingMsg = useChatStore.getState().getStreamingMessage(convId)
          
          if (streamingMsg?.content) {
            // Add partial message with connection lost indicator
            addMessage(convId, {
              role: 'assistant',
              content: streamingMsg.content + '\n\n(Connection lost)',
              thinking: streamingMsg.thinking || undefined,
            })
          } else {
            // No content yet, just add connection lost message
            addMessage(convId, {
              role: 'assistant',
              content: '(Connection lost)',
            })
          }
          
          // Complete the streaming state
          completeStreaming(convId)
        }
        
        // Clear all pending requests
        pendingRequestsRef.current.clear()
      }
      
      // Reconnect after delay
      setTimeout(() => {
        if (wsRef.current === ws) {
          console.log('[WebSocket] Attempting to reconnect...')
          connectRef.current?.()
        }
      }, 3000)
    }
    
    ws.onerror = (error) => {
      console.error('[WebSocket] Connection error:', error)
      isConnectingRef.current = false
      
      // Log current streaming state for debugging
      const streamingConversations = useChatStore.getState().getStreamingConversations()
      if (streamingConversations.length > 0) {
        console.error('[WebSocket] Error occurred while streaming in conversations:', streamingConversations)
      }
    }
    
    wsRef.current = ws
  }, [backendReady, setConnected, startStreaming, updateStreamingMessage,
      reclassifyThinkingAsResponse, completeStreaming, addMessage, queryClient, getStreamingConversations])

  // Send message
  const sendMessage = useCallback((params: SendMessageParams) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      console.error('[WebSocket] Cannot send message: WebSocket not connected')
      return false
    }
    
    // Check if conversation is already streaming
    const isAlreadyStreaming = useChatStore.getState().isConversationStreaming(params.conversationId)
    if (isAlreadyStreaming) {
      console.warn(`[WebSocket] Conversation ${params.conversationId} is already streaming, ignoring new message`)
      return false
    }
    
    const payload = {
      message: params.message,
      thinking_mode: params.thinkingMode,
      model: params.model,
      client_id: params.clientId,
      conversation_id: params.conversationId,
    }
    
    try {
      wsRef.current.send(JSON.stringify(payload))
      pendingRequestsRef.current.set(params.conversationId, true)
      connectionLostHandledRef.current = false
      console.log(`[WebSocket] Sent message for conversation: ${params.conversationId}`)
      return true
    } catch (error) {
      console.error('[WebSocket] Error sending message:', error)
      return false
    }
  }, [])
  
  // Stop streaming for specific conversation
  const stopStreaming = useCallback((conversationId: string) => {
    console.log(`[WebSocket] Stopping streaming for conversation: ${conversationId}`)
    
    // Check if conversation is actually streaming
    const isStreaming = useChatStore.getState().isConversationStreaming(conversationId)
    if (!isStreaming) {
      console.warn(`[WebSocket] Cannot stop: conversation ${conversationId} is not streaming`)
      return
    }
    
    // Get the current streaming message to preserve partial content
    const streamingMsg = useChatStore.getState().getStreamingMessage(conversationId)
    
    // Note: Current backend doesn't support per-conversation stop
    // This would require backend changes to support stopping specific streams
    // For now, we close and reconnect the entire WebSocket
    if (wsRef.current) {
      // Mark that we're intentionally closing (not a connection error)
      connectionLostHandledRef.current = true
      
      // Save partial message if it has content
      if (streamingMsg?.content) {
        addMessage(conversationId, {
          role: 'assistant',
          content: streamingMsg.content,
          thinking: streamingMsg.thinking || undefined,
        })
      }
      
      // Complete the streaming state
      completeStreaming(conversationId)
      pendingRequestsRef.current.delete(conversationId)
      
      // Close and reconnect
      wsRef.current.close()
      setTimeout(() => connectRef.current?.(), 200)
    }
  }, [completeStreaming, addMessage])

  // Store connect function in ref
  useEffect(() => {
    connectRef.current = connect
  }, [connect])

  // Connect when backend becomes ready
  useEffect(() => {
    if (backendReady && !wsRef.current) {
      connect()
    }
  }, [backendReady, connect])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close()
        wsRef.current = null
      }
    }
  }, [])
  
  return {
    sendMessage,
    stopStreaming,
    isConnected: useChatStore((state) => state.isConnected),
  }
}
