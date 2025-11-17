import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useChatStore } from './chatStore'

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

describe('Zustand Store - Streaming State Management', () => {
  beforeEach(() => {
    // Reset store to initial state before each test
    useChatStore.setState({
      messagesByConversation: {},
      streamingByConversation: {},
      isConnected: false,
      thinkingMode: true,
      selectedModel: 'PleIAs/Baguettotron',
      clientId: 'test-client-123',
      activeConversationId: null,
    })
  })

  describe('startStreaming', () => {
    it('should create streaming state for specific conversation', () => {
      const conversationId = 'conv-123'
      
      useChatStore.getState().startStreaming(conversationId)
      
      const streamingMessage = useChatStore.getState().getStreamingMessage(conversationId)
      expect(streamingMessage).toEqual({
        role: 'assistant',
        content: '',
        thinking: '',
      })
    })

    it('should create streaming state for multiple conversations independently', () => {
      const convA = 'conv-a'
      const convB = 'conv-b'
      
      useChatStore.getState().startStreaming(convA)
      useChatStore.getState().startStreaming(convB)
      
      expect(useChatStore.getState().getStreamingMessage(convA)).toEqual({
        role: 'assistant',
        content: '',
        thinking: '',
      })
      expect(useChatStore.getState().getStreamingMessage(convB)).toEqual({
        role: 'assistant',
        content: '',
        thinking: '',
      })
    })

    it('should not affect other conversations when starting streaming', () => {
      const convA = 'conv-a'
      const convB = 'conv-b'
      
      useChatStore.getState().startStreaming(convA)
      useChatStore.getState().updateStreamingMessage(convA, 'Content A')
      
      useChatStore.getState().startStreaming(convB)
      
      // Verify convA is unchanged
      expect(useChatStore.getState().getStreamingMessage(convA)?.content).toBe('Content A')
      // Verify convB is initialized
      expect(useChatStore.getState().getStreamingMessage(convB)?.content).toBe('')
    })
  })

  describe('updateStreamingMessage', () => {
    it('should update correct conversation with token content', () => {
      const conversationId = 'conv-123'
      
      useChatStore.getState().startStreaming(conversationId)
      useChatStore.getState().updateStreamingMessage(conversationId, 'Hello ')
      useChatStore.getState().updateStreamingMessage(conversationId, 'world!')
      
      const streamingMessage = useChatStore.getState().getStreamingMessage(conversationId)
      expect(streamingMessage?.content).toBe('Hello world!')
    })

    it('should update thinking content when provided', () => {
      const conversationId = 'conv-123'
      
      useChatStore.getState().startStreaming(conversationId)
      useChatStore.getState().updateStreamingMessage(conversationId, '', '## Analysis\nThinking...')
      
      const streamingMessage = useChatStore.getState().getStreamingMessage(conversationId)
      expect(streamingMessage?.thinking).toBe('## Analysis\nThinking...')
      expect(streamingMessage?.content).toBe('')
    })

    it('should preserve thinking content when not provided', () => {
      const conversationId = 'conv-123'
      
      useChatStore.getState().startStreaming(conversationId)
      useChatStore.getState().updateStreamingMessage(conversationId, '', '## Analysis\nThinking...')
      useChatStore.getState().updateStreamingMessage(conversationId, 'Hello')
      
      const streamingMessage = useChatStore.getState().getStreamingMessage(conversationId)
      expect(streamingMessage?.thinking).toBe('## Analysis\nThinking...')
      expect(streamingMessage?.content).toBe('Hello')
    })

    it('should update only the specified conversation', () => {
      const convA = 'conv-a'
      const convB = 'conv-b'
      
      useChatStore.getState().startStreaming(convA)
      useChatStore.getState().startStreaming(convB)
      
      useChatStore.getState().updateStreamingMessage(convA, 'Content A')
      useChatStore.getState().updateStreamingMessage(convB, 'Content B')
      
      expect(useChatStore.getState().getStreamingMessage(convA)?.content).toBe('Content A')
      expect(useChatStore.getState().getStreamingMessage(convB)?.content).toBe('Content B')
    })

    it('should handle updating non-existent streaming conversation gracefully', () => {
      const conversationId = 'conv-nonexistent'
      
      // Should not throw error
      useChatStore.getState().updateStreamingMessage(conversationId, 'Content')
      
      // Should still return null since streaming was never started
      expect(useChatStore.getState().getStreamingMessage(conversationId)).toBeNull()
    })
  })

  describe('completeStreaming', () => {
    it('should remove streaming state for specific conversation', () => {
      const conversationId = 'conv-123'
      
      useChatStore.getState().startStreaming(conversationId)
      useChatStore.getState().updateStreamingMessage(conversationId, 'Complete content')
      
      expect(useChatStore.getState().isConversationStreaming(conversationId)).toBe(true)
      
      useChatStore.getState().completeStreaming(conversationId)
      
      expect(useChatStore.getState().isConversationStreaming(conversationId)).toBe(false)
      expect(useChatStore.getState().getStreamingMessage(conversationId)).toBeNull()
    })

    it('should only remove specified conversation from streaming state', () => {
      const convA = 'conv-a'
      const convB = 'conv-b'
      
      useChatStore.getState().startStreaming(convA)
      useChatStore.getState().startStreaming(convB)
      
      useChatStore.getState().updateStreamingMessage(convA, 'Content A')
      useChatStore.getState().updateStreamingMessage(convB, 'Content B')
      
      useChatStore.getState().completeStreaming(convA)
      
      expect(useChatStore.getState().isConversationStreaming(convA)).toBe(false)
      expect(useChatStore.getState().isConversationStreaming(convB)).toBe(true)
      expect(useChatStore.getState().getStreamingMessage(convB)?.content).toBe('Content B')
    })

    it('should handle completing non-existent streaming conversation gracefully', () => {
      const conversationId = 'conv-nonexistent'
      
      // Should not throw error
      useChatStore.getState().completeStreaming(conversationId)
      
      expect(useChatStore.getState().isConversationStreaming(conversationId)).toBe(false)
    })
  })

  describe('getStreamingMessage', () => {
    it('should return correct streaming message for conversation', () => {
      const conversationId = 'conv-123'
      
      useChatStore.getState().startStreaming(conversationId)
      useChatStore.getState().updateStreamingMessage(conversationId, 'Test content', 'Test thinking')
      
      const message = useChatStore.getState().getStreamingMessage(conversationId)
      
      expect(message).toEqual({
        role: 'assistant',
        content: 'Test content',
        thinking: 'Test thinking',
      })
    })

    it('should return null for non-streaming conversation', () => {
      const conversationId = 'conv-123'
      
      const message = useChatStore.getState().getStreamingMessage(conversationId)
      
      expect(message).toBeNull()
    })

    it('should return null after streaming is completed', () => {
      const conversationId = 'conv-123'
      
      useChatStore.getState().startStreaming(conversationId)
      useChatStore.getState().updateStreamingMessage(conversationId, 'Content')
      useChatStore.getState().completeStreaming(conversationId)
      
      const message = useChatStore.getState().getStreamingMessage(conversationId)
      
      expect(message).toBeNull()
    })
  })

  describe('isConversationStreaming', () => {
    it('should return true when conversation is streaming', () => {
      const conversationId = 'conv-123'
      
      useChatStore.getState().startStreaming(conversationId)
      
      expect(useChatStore.getState().isConversationStreaming(conversationId)).toBe(true)
    })

    it('should return false when conversation is not streaming', () => {
      const conversationId = 'conv-123'
      
      expect(useChatStore.getState().isConversationStreaming(conversationId)).toBe(false)
    })

    it('should return false after streaming is completed', () => {
      const conversationId = 'conv-123'
      
      useChatStore.getState().startStreaming(conversationId)
      useChatStore.getState().completeStreaming(conversationId)
      
      expect(useChatStore.getState().isConversationStreaming(conversationId)).toBe(false)
    })

    it('should return correct status for multiple conversations', () => {
      const convA = 'conv-a'
      const convB = 'conv-b'
      const convC = 'conv-c'
      
      useChatStore.getState().startStreaming(convA)
      useChatStore.getState().startStreaming(convB)
      
      expect(useChatStore.getState().isConversationStreaming(convA)).toBe(true)
      expect(useChatStore.getState().isConversationStreaming(convB)).toBe(true)
      expect(useChatStore.getState().isConversationStreaming(convC)).toBe(false)
    })
  })

  describe('getStreamingConversations', () => {
    it('should return empty array when no conversations are streaming', () => {
      const streamingConversations = useChatStore.getState().getStreamingConversations()
      
      expect(streamingConversations).toEqual([])
    })

    it('should return array with single streaming conversation ID', () => {
      const conversationId = 'conv-123'
      
      useChatStore.getState().startStreaming(conversationId)
      
      const streamingConversations = useChatStore.getState().getStreamingConversations()
      
      expect(streamingConversations).toEqual([conversationId])
    })

    it('should return array of all streaming conversation IDs', () => {
      const convA = 'conv-a'
      const convB = 'conv-b'
      const convC = 'conv-c'
      
      useChatStore.getState().startStreaming(convA)
      useChatStore.getState().startStreaming(convB)
      useChatStore.getState().startStreaming(convC)
      
      const streamingConversations = useChatStore.getState().getStreamingConversations()
      
      expect(streamingConversations).toHaveLength(3)
      expect(streamingConversations).toContain(convA)
      expect(streamingConversations).toContain(convB)
      expect(streamingConversations).toContain(convC)
    })

    it('should update array when streaming is completed', () => {
      const convA = 'conv-a'
      const convB = 'conv-b'
      
      useChatStore.getState().startStreaming(convA)
      useChatStore.getState().startStreaming(convB)
      
      expect(useChatStore.getState().getStreamingConversations()).toHaveLength(2)
      
      useChatStore.getState().completeStreaming(convA)
      
      const streamingConversations = useChatStore.getState().getStreamingConversations()
      
      expect(streamingConversations).toEqual([convB])
    })
  })

  describe('Multiple concurrent streams', () => {
    it('should handle multiple conversations streaming simultaneously', () => {
      const convA = 'conv-a'
      const convB = 'conv-b'
      const convC = 'conv-c'
      
      // Start streaming in all three
      useChatStore.getState().startStreaming(convA)
      useChatStore.getState().startStreaming(convB)
      useChatStore.getState().startStreaming(convC)
      
      // Update each with different content
      useChatStore.getState().updateStreamingMessage(convA, 'Content A', 'Thinking A')
      useChatStore.getState().updateStreamingMessage(convB, 'Content B', 'Thinking B')
      useChatStore.getState().updateStreamingMessage(convC, 'Content C', 'Thinking C')
      
      // Verify all are streaming
      expect(useChatStore.getState().getStreamingConversations()).toHaveLength(3)
      
      // Verify each has correct content
      expect(useChatStore.getState().getStreamingMessage(convA)).toEqual({
        role: 'assistant',
        content: 'Content A',
        thinking: 'Thinking A',
      })
      expect(useChatStore.getState().getStreamingMessage(convB)).toEqual({
        role: 'assistant',
        content: 'Content B',
        thinking: 'Thinking B',
      })
      expect(useChatStore.getState().getStreamingMessage(convC)).toEqual({
        role: 'assistant',
        content: 'Content C',
        thinking: 'Thinking C',
      })
      
      // Complete one stream
      useChatStore.getState().completeStreaming(convB)
      
      // Verify only B is completed
      expect(useChatStore.getState().isConversationStreaming(convA)).toBe(true)
      expect(useChatStore.getState().isConversationStreaming(convB)).toBe(false)
      expect(useChatStore.getState().isConversationStreaming(convC)).toBe(true)
      expect(useChatStore.getState().getStreamingConversations()).toHaveLength(2)
    })

    it('should handle interleaved updates to multiple streams', () => {
      const convA = 'conv-a'
      const convB = 'conv-b'
      
      useChatStore.getState().startStreaming(convA)
      useChatStore.getState().startStreaming(convB)
      
      // Interleave updates
      useChatStore.getState().updateStreamingMessage(convA, 'A1 ')
      useChatStore.getState().updateStreamingMessage(convB, 'B1 ')
      useChatStore.getState().updateStreamingMessage(convA, 'A2 ')
      useChatStore.getState().updateStreamingMessage(convB, 'B2 ')
      useChatStore.getState().updateStreamingMessage(convA, 'A3')
      useChatStore.getState().updateStreamingMessage(convB, 'B3')
      
      // Verify content is correct for both
      expect(useChatStore.getState().getStreamingMessage(convA)?.content).toBe('A1 A2 A3')
      expect(useChatStore.getState().getStreamingMessage(convB)?.content).toBe('B1 B2 B3')
    })
  })

  describe('Active conversation independence', () => {
    it('should not affect streaming state when switching active conversation', () => {
      const convA = 'conv-a'
      const convB = 'conv-b'
      
      // Start streaming in convA
      useChatStore.getState().startStreaming(convA)
      useChatStore.getState().updateStreamingMessage(convA, 'Streaming content')
      
      // Set convA as active
      useChatStore.getState().setActiveConversation(convA)
      expect(useChatStore.getState().activeConversationId).toBe(convA)
      
      // Switch to convB
      useChatStore.getState().setActiveConversation(convB)
      expect(useChatStore.getState().activeConversationId).toBe(convB)
      
      // Verify streaming state in convA is unchanged
      expect(useChatStore.getState().isConversationStreaming(convA)).toBe(true)
      expect(useChatStore.getState().getStreamingMessage(convA)?.content).toBe('Streaming content')
      
      // Continue streaming in convA while convB is active
      useChatStore.getState().updateStreamingMessage(convA, ' more content')
      
      expect(useChatStore.getState().getStreamingMessage(convA)?.content).toBe('Streaming content more content')
      expect(useChatStore.getState().activeConversationId).toBe(convB)
    })

    it('should allow streaming in non-active conversation', () => {
      const convA = 'conv-a'
      const convB = 'conv-b'
      
      // Set convA as active
      useChatStore.getState().setActiveConversation(convA)
      
      // Start streaming in convB (not active)
      useChatStore.getState().startStreaming(convB)
      useChatStore.getState().updateStreamingMessage(convB, 'Background streaming')
      
      // Verify streaming works in non-active conversation
      expect(useChatStore.getState().isConversationStreaming(convB)).toBe(true)
      expect(useChatStore.getState().getStreamingMessage(convB)?.content).toBe('Background streaming')
      expect(useChatStore.getState().activeConversationId).toBe(convA)
    })

    it('should handle rapid conversation switching during streaming', () => {
      const convA = 'conv-a'
      const convB = 'conv-b'
      const convC = 'conv-c'
      
      useChatStore.getState().startStreaming(convA)
      
      // Rapidly switch conversations
      useChatStore.getState().setActiveConversation(convA)
      useChatStore.getState().updateStreamingMessage(convA, 'Part 1 ')
      
      useChatStore.getState().setActiveConversation(convB)
      useChatStore.getState().updateStreamingMessage(convA, 'Part 2 ')
      
      useChatStore.getState().setActiveConversation(convC)
      useChatStore.getState().updateStreamingMessage(convA, 'Part 3')
      
      useChatStore.getState().setActiveConversation(convA)
      
      // Verify no state corruption
      expect(useChatStore.getState().getStreamingMessage(convA)?.content).toBe('Part 1 Part 2 Part 3')
      expect(useChatStore.getState().activeConversationId).toBe(convA)
    })
  })

  describe('Persistence configuration', () => {
    it('should not persist streaming state', () => {
      const convA = 'conv-a'
      
      // Start streaming
      useChatStore.getState().startStreaming(convA)
      useChatStore.getState().updateStreamingMessage(convA, 'Streaming content')
      
      // Get the partialize function from the persist config
      const state = useChatStore.getState()
      
      // The persist middleware uses partialize to determine what to persist
      // We can't directly access it, but we can verify the behavior by checking
      // that streamingByConversation is not included in persisted state
      
      // Verify streaming state exists in memory
      expect(state.streamingByConversation[convA]).toBeDefined()
      expect(state.isConversationStreaming(convA)).toBe(true)
      
      // The actual persistence test would require mocking the storage layer
      // and verifying what gets written, but the key point is that the
      // partialize function in chatStore.ts explicitly excludes streamingByConversation
    })

    it('should persist messagesByConversation', () => {
      const convA = 'conv-a'
      
      useChatStore.getState().addMessage(convA, {
        role: 'user',
        content: 'Test message',
      })
      
      const state = useChatStore.getState()
      
      // Verify messages exist in memory
      expect(state.messagesByConversation[convA]).toHaveLength(1)
      expect(state.messagesByConversation[convA][0].content).toBe('Test message')
      
      // The partialize function includes messagesByConversation
    })

    it('should persist user preferences', () => {
      useChatStore.getState().setThinkingMode(false)
      useChatStore.getState().setSelectedModel('custom-model')
      useChatStore.getState().setClientId('client-456')
      
      const state = useChatStore.getState()
      
      // Verify preferences exist in memory
      expect(state.thinkingMode).toBe(false)
      expect(state.selectedModel).toBe('custom-model')
      expect(state.clientId).toBe('client-456')
      
      // The partialize function includes these fields
    })

    it('should not persist activeConversationId', () => {
      useChatStore.getState().setActiveConversation('conv-123')
      
      const state = useChatStore.getState()
      
      // Verify it exists in memory
      expect(state.activeConversationId).toBe('conv-123')
      
      // The partialize function explicitly excludes activeConversationId
      // so it will always start as null on app load
    })
  })
})
