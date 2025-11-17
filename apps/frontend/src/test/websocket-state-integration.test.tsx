import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useChatStore } from '../state/store/chatStore'
import { useWebSocketManager } from '../hooks/useWebSocketManager'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactNode } from 'react'

// Mock IndexedDB for Zustand persistence
const indexedDBMock = {
  open: vi.fn(),
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
global.indexedDB = indexedDBMock as any

// Mock idb-keyval to avoid IndexedDB issues in tests
vi.mock('idb-keyval', () => ({
  get: vi.fn(() => Promise.resolve(null)),
  set: vi.fn(() => Promise.resolve()),
  del: vi.fn(() => Promise.resolve()),
}))

// Mock the backend health hook
vi.mock('../hooks/useBackendHealth', () => ({
  useBackendHealth: () => ({
    data: { status: 'ok' },
    isLoading: false,
  }),
}))

// Mock WebSocket
interface MockWebSocketInstance {
  readyState: number
  send: ReturnType<typeof vi.fn>
  close: ReturnType<typeof vi.fn>
  onopen: ((event: Event) => void) | null
  onmessage: ((event: MessageEvent) => void) | null
  onclose: ((event: CloseEvent) => void) | null
  onerror: ((event: Event) => void) | null
}

class MockWebSocketServer {
  private connections: MockWebSocketInstance[] = []
  private messageHandlers: Map<MockWebSocketInstance, (data: string) => void> = new Map()

  connect(): MockWebSocketInstance {
    const ws: MockWebSocketInstance = {
      readyState: 1, // OPEN
      send: vi.fn((data: string) => {
        // Simulate server processing
        const handler = this.messageHandlers.get(ws)
        if (handler) {
          handler(data)
        }
      }),
      close: vi.fn(() => {
        ws.readyState = 3 // CLOSED
        if (ws.onclose) {
          ws.onclose({ code: 1000, reason: 'Normal closure', wasClean: true } as CloseEvent)
        }
      }),
      onopen: null,
      onmessage: null,
      onclose: null,
      onerror: null,
    }

    this.connections.push(ws)
    
    // Trigger onopen after a short delay
    setTimeout(() => {
      if (ws.onopen) {
        ws.onopen({} as Event)
      }
    }, 10)

    return ws
  }

  setMessageHandler(ws: MockWebSocketInstance, handler: (data: string) => void) {
    this.messageHandlers.set(ws, handler)
  }

  simulateMessage(ws: MockWebSocketInstance, message: object) {
    if (ws.onmessage) {
      ws.onmessage({ data: JSON.stringify(message) } as MessageEvent)
    }
  }

  simulateDisconnect(ws: MockWebSocketInstance) {
    ws.readyState = 3 // CLOSED
    if (ws.onclose) {
      ws.onclose({ code: 1006, reason: 'Connection lost', wasClean: false } as CloseEvent)
    }
  }

  cleanup() {
    this.connections.forEach(ws => {
      if (ws.readyState === 1) {
        ws.close()
      }
    })
    this.connections = []
    this.messageHandlers.clear()
  }
}

describe('WebSocket + State Integration Tests', () => {
  let mockServer: MockWebSocketServer
  let queryClient: QueryClient
  let currentWebSocket: MockWebSocketInstance | null = null

  beforeEach(() => {
    // Reset Zustand store
    useChatStore.setState({
      messagesByConversation: {},
      streamingByConversation: {},
      isConnected: false,
      thinkingMode: true,
      selectedModel: 'PleIAs/Baguettotron',
      clientId: 'test-client-123',
      activeConversationId: null,
    })

    // Create mock server
    mockServer = new MockWebSocketServer()

    // Mock global WebSocket constructor
    global.WebSocket = class MockWebSocket {
      readyState: number
      send: ReturnType<typeof vi.fn>
      close: ReturnType<typeof vi.fn>
      onopen: ((event: Event) => void) | null
      onmessage: ((event: MessageEvent) => void) | null
      onclose: ((event: CloseEvent) => void) | null
      onerror: ((event: Event) => void) | null

      constructor(_url: string) {
        currentWebSocket = mockServer.connect()
        this.readyState = currentWebSocket.readyState
        this.send = currentWebSocket.send
        this.close = currentWebSocket.close
        this.onopen = null
        this.onmessage = null
        this.onclose = null
        this.onerror = null

        // Proxy event handlers to the mock instance
        Object.defineProperty(this, 'onopen', {
          get: () => currentWebSocket!.onopen,
          set: (handler) => { currentWebSocket!.onopen = handler },
        })
        Object.defineProperty(this, 'onmessage', {
          get: () => currentWebSocket!.onmessage,
          set: (handler) => { currentWebSocket!.onmessage = handler },
        })
        Object.defineProperty(this, 'onclose', {
          get: () => currentWebSocket!.onclose,
          set: (handler) => { currentWebSocket!.onclose = handler },
        })
        Object.defineProperty(this, 'onerror', {
          get: () => currentWebSocket!.onerror,
          set: (handler) => { currentWebSocket!.onerror = handler },
        })
        Object.defineProperty(this, 'readyState', {
          get: () => currentWebSocket!.readyState,
        })

        return this
      }

      static CONNECTING = 0
      static OPEN = 1
      static CLOSING = 2
      static CLOSED = 3
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any

    // Create query client
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })
  })

  afterEach(() => {
    mockServer.cleanup()
    currentWebSocket = null
    vi.clearAllMocks()
  })

  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )

  it('should start streaming in conversation A', async () => {
    const { result } = renderHook(() => useWebSocketManager(), { wrapper })

    // Wait for WebSocket to connect
    await waitFor(() => {
      expect(useChatStore.getState().isConnected).toBe(true)
    })

    const conversationA = 'conv-a-123'

    // Send message
    act(() => {
      result.current.sendMessage({
        conversationId: conversationA,
        message: 'Hello',
        thinkingMode: true,
        model: 'PleIAs/Baguettotron',
        clientId: 'test-client-123',
      })
    })

    // Simulate server responses
    act(() => {
      mockServer.simulateMessage(currentWebSocket!, {
        type: 'start',
        conversation_id: conversationA,
      })
    })

    // Verify streaming started
    expect(useChatStore.getState().isConversationStreaming(conversationA)).toBe(true)
    expect(useChatStore.getState().getStreamingMessage(conversationA)).toEqual({
      role: 'assistant',
      content: '',
      thinking: '',
    })

    // Simulate tokens
    act(() => {
      mockServer.simulateMessage(currentWebSocket!, {
        type: 'token',
        conversation_id: conversationA,
        content: 'Hello ',
      })
    })

    act(() => {
      mockServer.simulateMessage(currentWebSocket!, {
        type: 'token',
        conversation_id: conversationA,
        content: 'there!',
      })
    })

    // Verify content accumulated
    expect(useChatStore.getState().getStreamingMessage(conversationA)?.content).toBe('Hello there!')
  })

  it('should switch to conversation B while A is streaming and verify streaming continues', async () => {
    const { result } = renderHook(() => useWebSocketManager(), { wrapper })

    await waitFor(() => {
      expect(useChatStore.getState().isConnected).toBe(true)
    })

    const conversationA = 'conv-a-123'
    const conversationB = 'conv-b-456'

    // Start streaming in conversation A
    act(() => {
      result.current.sendMessage({
        conversationId: conversationA,
        message: 'Hello A',
        thinkingMode: true,
        model: 'PleIAs/Baguettotron',
        clientId: 'test-client-123',
      })
    })

    act(() => {
      mockServer.simulateMessage(currentWebSocket!, {
        type: 'start',
        conversation_id: conversationA,
      })
    })

    act(() => {
      mockServer.simulateMessage(currentWebSocket!, {
        type: 'token',
        conversation_id: conversationA,
        content: 'Response A part 1 ',
      })
    })

    // Switch to conversation B
    act(() => {
      useChatStore.getState().setActiveConversation(conversationB)
    })

    expect(useChatStore.getState().activeConversationId).toBe(conversationB)

    // Continue streaming in A (background)
    act(() => {
      mockServer.simulateMessage(currentWebSocket!, {
        type: 'token',
        conversation_id: conversationA,
        content: 'part 2 ',
      })
    })

    act(() => {
      mockServer.simulateMessage(currentWebSocket!, {
        type: 'token',
        conversation_id: conversationA,
        content: 'part 3',
      })
    })

    // Verify streaming continues in A
    expect(useChatStore.getState().isConversationStreaming(conversationA)).toBe(true)
    expect(useChatStore.getState().getStreamingMessage(conversationA)?.content).toBe(
      'Response A part 1 part 2 part 3'
    )

    // Verify B is not streaming
    expect(useChatStore.getState().isConversationStreaming(conversationB)).toBe(false)
  })

  it('should switch back to A and verify streaming message is displayed correctly', async () => {
    const { result } = renderHook(() => useWebSocketManager(), { wrapper })

    await waitFor(() => {
      expect(useChatStore.getState().isConnected).toBe(true)
    })

    const conversationA = 'conv-a-123'
    const conversationB = 'conv-b-456'

    // Start streaming in A
    act(() => {
      result.current.sendMessage({
        conversationId: conversationA,
        message: 'Hello A',
        thinkingMode: true,
        model: 'PleIAs/Baguettotron',
        clientId: 'test-client-123',
      })
    })

    act(() => {
      mockServer.simulateMessage(currentWebSocket!, {
        type: 'start',
        conversation_id: conversationA,
      })
      mockServer.simulateMessage(currentWebSocket!, {
        type: 'token',
        conversation_id: conversationA,
        content: 'Streaming content ',
      })
    })

    // Switch to B
    act(() => {
      useChatStore.getState().setActiveConversation(conversationB)
    })

    // Continue streaming in A
    act(() => {
      mockServer.simulateMessage(currentWebSocket!, {
        type: 'token',
        conversation_id: conversationA,
        content: 'more content',
      })
    })

    // Switch back to A
    act(() => {
      useChatStore.getState().setActiveConversation(conversationA)
    })

    // Verify streaming message is up-to-date
    const streamingMsg = useChatStore.getState().getStreamingMessage(conversationA)
    expect(streamingMsg?.content).toBe('Streaming content more content')
    expect(useChatStore.getState().activeConversationId).toBe(conversationA)
  })

  it('should complete stream and verify message is persisted', async () => {
    const { result } = renderHook(() => useWebSocketManager(), { wrapper })

    await waitFor(() => {
      expect(useChatStore.getState().isConnected).toBe(true)
    })

    const conversationA = 'conv-a-123'

    // Start streaming
    act(() => {
      result.current.sendMessage({
        conversationId: conversationA,
        message: 'Hello',
        thinkingMode: true,
        model: 'PleIAs/Baguettotron',
        clientId: 'test-client-123',
      })
    })

    act(() => {
      mockServer.simulateMessage(currentWebSocket!, {
        type: 'start',
        conversation_id: conversationA,
      })
      mockServer.simulateMessage(currentWebSocket!, {
        type: 'thinking',
        conversation_id: conversationA,
        content: '## Analysis\nThinking about the question...',
      })
      mockServer.simulateMessage(currentWebSocket!, {
        type: 'token',
        conversation_id: conversationA,
        content: 'Complete response',
      })
    })

    // Complete streaming
    act(() => {
      mockServer.simulateMessage(currentWebSocket!, {
        type: 'complete',
        conversation_id: conversationA,
      })
    })

    // Verify streaming state is cleared
    expect(useChatStore.getState().isConversationStreaming(conversationA)).toBe(false)
    expect(useChatStore.getState().getStreamingMessage(conversationA)).toBeNull()

    // Verify message is persisted
    const messages = useChatStore.getState().getMessages(conversationA)
    expect(messages).toHaveLength(1)
    expect(messages[0]).toEqual({
      role: 'assistant',
      content: 'Complete response',
      thinking: '## Analysis\nThinking about the question...',
    })
  })

  it('should handle connection loss during streaming in multiple conversations', async () => {
    const { result } = renderHook(() => useWebSocketManager(), { wrapper })

    await waitFor(() => {
      expect(useChatStore.getState().isConnected).toBe(true)
    })

    const conversationA = 'conv-a-123'
    const conversationB = 'conv-b-456'

    // Start streaming in conversation A
    act(() => {
      result.current.sendMessage({
        conversationId: conversationA,
        message: 'Hello A',
        thinkingMode: true,
        model: 'PleIAs/Baguettotron',
        clientId: 'test-client-123',
      })
    })

    act(() => {
      mockServer.simulateMessage(currentWebSocket!, {
        type: 'start',
        conversation_id: conversationA,
      })
      mockServer.simulateMessage(currentWebSocket!, {
        type: 'token',
        conversation_id: conversationA,
        content: 'Partial A',
      })
    })

    // Start streaming in conversation B
    act(() => {
      result.current.sendMessage({
        conversationId: conversationB,
        message: 'Hello B',
        thinkingMode: true,
        model: 'PleIAs/Baguettotron',
        clientId: 'test-client-123',
      })
    })

    act(() => {
      mockServer.simulateMessage(currentWebSocket!, {
        type: 'start',
        conversation_id: conversationB,
      })
      mockServer.simulateMessage(currentWebSocket!, {
        type: 'token',
        conversation_id: conversationB,
        content: 'Partial B',
      })
    })

    // Verify both are streaming
    expect(useChatStore.getState().getStreamingConversations()).toHaveLength(2)

    // Simulate connection loss
    act(() => {
      mockServer.simulateDisconnect(currentWebSocket!)
    })

    // Verify connection is lost
    await waitFor(() => {
      expect(useChatStore.getState().isConnected).toBe(false)
    })

    // Verify both streaming conversations are completed
    expect(useChatStore.getState().isConversationStreaming(conversationA)).toBe(false)
    expect(useChatStore.getState().isConversationStreaming(conversationB)).toBe(false)

    // Verify both received "(Connection lost)" message
    const messagesA = useChatStore.getState().getMessages(conversationA)
    const messagesB = useChatStore.getState().getMessages(conversationB)

    expect(messagesA).toHaveLength(1)
    expect(messagesA[0].content).toContain('Partial A')
    expect(messagesA[0].content).toContain('(Connection lost)')

    expect(messagesB).toHaveLength(1)
    expect(messagesB[0].content).toContain('Partial B')
    expect(messagesB[0].content).toContain('(Connection lost)')
  })

  it('should handle rapid conversation switching during streaming', async () => {
    const { result } = renderHook(() => useWebSocketManager(), { wrapper })

    await waitFor(() => {
      expect(useChatStore.getState().isConnected).toBe(true)
    })

    const conversationA = 'conv-a-123'
    const conversationB = 'conv-b-456'
    const conversationC = 'conv-c-789'

    // Start streaming in A
    act(() => {
      result.current.sendMessage({
        conversationId: conversationA,
        message: 'Hello A',
        thinkingMode: true,
        model: 'PleIAs/Baguettotron',
        clientId: 'test-client-123',
      })
    })

    act(() => {
      mockServer.simulateMessage(currentWebSocket!, {
        type: 'start',
        conversation_id: conversationA,
      })
    })

    // Rapidly switch conversations
    act(() => {
      useChatStore.getState().setActiveConversation(conversationA)
      mockServer.simulateMessage(currentWebSocket!, {
        type: 'token',
        conversation_id: conversationA,
        content: 'A1 ',
      })
    })

    act(() => {
      useChatStore.getState().setActiveConversation(conversationB)
      mockServer.simulateMessage(currentWebSocket!, {
        type: 'token',
        conversation_id: conversationA,
        content: 'A2 ',
      })
    })

    act(() => {
      useChatStore.getState().setActiveConversation(conversationC)
      mockServer.simulateMessage(currentWebSocket!, {
        type: 'token',
        conversation_id: conversationA,
        content: 'A3',
      })
    })

    act(() => {
      useChatStore.getState().setActiveConversation(conversationA)
    })

    // Verify no state corruption
    expect(useChatStore.getState().isConversationStreaming(conversationA)).toBe(true)
    expect(useChatStore.getState().getStreamingMessage(conversationA)?.content).toBe('A1 A2 A3')
    expect(useChatStore.getState().activeConversationId).toBe(conversationA)

    // Verify other conversations are not affected
    expect(useChatStore.getState().isConversationStreaming(conversationB)).toBe(false)
    expect(useChatStore.getState().isConversationStreaming(conversationC)).toBe(false)
  })

  it('should handle starting new stream while another is in progress', async () => {
    const { result } = renderHook(() => useWebSocketManager(), { wrapper })

    await waitFor(() => {
      expect(useChatStore.getState().isConnected).toBe(true)
    })

    const conversationA = 'conv-a-123'
    const conversationB = 'conv-b-456'

    // Start streaming in A
    act(() => {
      result.current.sendMessage({
        conversationId: conversationA,
        message: 'Hello A',
        thinkingMode: true,
        model: 'PleIAs/Baguettotron',
        clientId: 'test-client-123',
      })
    })

    act(() => {
      mockServer.simulateMessage(currentWebSocket!, {
        type: 'start',
        conversation_id: conversationA,
      })
      mockServer.simulateMessage(currentWebSocket!, {
        type: 'token',
        conversation_id: conversationA,
        content: 'Response A ',
      })
    })

    // Start streaming in B while A is still streaming
    act(() => {
      result.current.sendMessage({
        conversationId: conversationB,
        message: 'Hello B',
        thinkingMode: true,
        model: 'PleIAs/Baguettotron',
        clientId: 'test-client-123',
      })
    })

    act(() => {
      mockServer.simulateMessage(currentWebSocket!, {
        type: 'start',
        conversation_id: conversationB,
      })
      mockServer.simulateMessage(currentWebSocket!, {
        type: 'token',
        conversation_id: conversationB,
        content: 'Response B ',
      })
    })

    // Verify both streams work independently
    expect(useChatStore.getState().isConversationStreaming(conversationA)).toBe(true)
    expect(useChatStore.getState().isConversationStreaming(conversationB)).toBe(true)

    // Continue both streams
    act(() => {
      mockServer.simulateMessage(currentWebSocket!, {
        type: 'token',
        conversation_id: conversationA,
        content: 'more A',
      })
      mockServer.simulateMessage(currentWebSocket!, {
        type: 'token',
        conversation_id: conversationB,
        content: 'more B',
      })
    })

    // Verify content is correct for both
    expect(useChatStore.getState().getStreamingMessage(conversationA)?.content).toBe('Response A more A')
    expect(useChatStore.getState().getStreamingMessage(conversationB)?.content).toBe('Response B more B')

    // Complete both streams
    act(() => {
      mockServer.simulateMessage(currentWebSocket!, {
        type: 'complete',
        conversation_id: conversationA,
      })
      mockServer.simulateMessage(currentWebSocket!, {
        type: 'complete',
        conversation_id: conversationB,
      })
    })

    // Verify both are completed and persisted
    expect(useChatStore.getState().isConversationStreaming(conversationA)).toBe(false)
    expect(useChatStore.getState().isConversationStreaming(conversationB)).toBe(false)

    const messagesA = useChatStore.getState().getMessages(conversationA)
    const messagesB = useChatStore.getState().getMessages(conversationB)

    expect(messagesA[0].content).toBe('Response A more A')
    expect(messagesB[0].content).toBe('Response B more B')
  })

  it('should handle error messages for specific conversations', async () => {
    const { result } = renderHook(() => useWebSocketManager(), { wrapper })

    await waitFor(() => {
      expect(useChatStore.getState().isConnected).toBe(true)
    })

    const conversationA = 'conv-a-123'

    // Start streaming
    act(() => {
      result.current.sendMessage({
        conversationId: conversationA,
        message: 'Hello',
        thinkingMode: true,
        model: 'PleIAs/Baguettotron',
        clientId: 'test-client-123',
      })
    })

    act(() => {
      mockServer.simulateMessage(currentWebSocket!, {
        type: 'start',
        conversation_id: conversationA,
      })
    })

    // Simulate error
    act(() => {
      mockServer.simulateMessage(currentWebSocket!, {
        type: 'error',
        conversation_id: conversationA,
        message: 'Model failed to load',
      })
    })

    // Verify streaming is completed
    expect(useChatStore.getState().isConversationStreaming(conversationA)).toBe(false)

    // Verify error message is added
    const messages = useChatStore.getState().getMessages(conversationA)
    expect(messages).toHaveLength(1)
    expect(messages[0].content).toBe('Error: Model failed to load')
  })

  it('should handle missing conversation_id gracefully', async () => {
    const { result } = renderHook(() => useWebSocketManager(), { wrapper })

    await waitFor(() => {
      expect(useChatStore.getState().isConnected).toBe(true)
    })

    const conversationA = 'conv-a-123'

    // Start valid streaming
    act(() => {
      result.current.sendMessage({
        conversationId: conversationA,
        message: 'Hello',
        thinkingMode: true,
        model: 'PleIAs/Baguettotron',
        clientId: 'test-client-123',
      })
    })

    act(() => {
      mockServer.simulateMessage(currentWebSocket!, {
        type: 'start',
        conversation_id: conversationA,
      })
    })

    // Send message without conversation_id (should be ignored)
    act(() => {
      mockServer.simulateMessage(currentWebSocket!, {
        type: 'token',
        content: 'This should be ignored',
      })
    })

    // Verify streaming state is unchanged
    expect(useChatStore.getState().getStreamingMessage(conversationA)?.content).toBe('')

    // Send valid message
    act(() => {
      mockServer.simulateMessage(currentWebSocket!, {
        type: 'token',
        conversation_id: conversationA,
        content: 'Valid content',
      })
    })

    // Verify valid message is processed
    expect(useChatStore.getState().getStreamingMessage(conversationA)?.content).toBe('Valid content')
  })
})
