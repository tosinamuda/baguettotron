import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useBufferedLineAnimation } from './useBufferedLineAnimation'

describe('useBufferedLineAnimation', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  describe('basic line buffering with newlines', () => {
    it('should buffer text until newline is encountered', () => {
      const { result, rerender } = renderHook(
        ({ content, isStreaming }) => useBufferedLineAnimation({ content, isStreaming }),
        { initialProps: { content: '', isStreaming: true } }
      )

      expect(result.current.lines).toHaveLength(0)
      expect(result.current.isBuffering).toBe(false)

      // Add text without newline
      rerender({ content: 'Hello', isStreaming: true })
      expect(result.current.lines).toHaveLength(0)
      expect(result.current.isBuffering).toBe(true)

      // Add newline
      rerender({ content: 'Hello\n', isStreaming: true })
      expect(result.current.lines).toHaveLength(1)
      expect(result.current.lines[0].content).toBe('Hello\n')
      expect(result.current.isBuffering).toBe(false)
    })

    it('should extract multiple complete lines', () => {
      const { result, rerender } = renderHook(
        ({ content, isStreaming }) => useBufferedLineAnimation({ content, isStreaming }),
        { initialProps: { content: '', isStreaming: true } }
      )

      rerender({ content: 'Line 1\nLine 2\nLine 3\n', isStreaming: true })

      expect(result.current.lines).toHaveLength(3)
      expect(result.current.lines[0].content).toBe('Line 1\n')
      expect(result.current.lines[1].content).toBe('Line 2\n')
      expect(result.current.lines[2].content).toBe('Line 3\n')
    })

    it('should keep incomplete line in buffer', () => {
      const { result, rerender } = renderHook(
        ({ content, isStreaming }) => useBufferedLineAnimation({ content, isStreaming }),
        { initialProps: { content: '', isStreaming: true } }
      )

      rerender({ content: 'Line 1\nIncomplete', isStreaming: true })

      expect(result.current.lines).toHaveLength(1)
      expect(result.current.lines[0].content).toBe('Line 1\n')
      expect(result.current.isBuffering).toBe(true)
    })
  })

  describe('markdown completion detection', () => {
    it('should hold buffer when code block is unclosed', () => {
      const { result, rerender } = renderHook(
        ({ content, isStreaming }) => useBufferedLineAnimation({ content, isStreaming }),
        { initialProps: { content: '', isStreaming: true } }
      )

      rerender({ content: '```javascript\n', isStreaming: true })

      expect(result.current.lines).toHaveLength(0)
      expect(result.current.isBuffering).toBe(true)

      rerender({ content: '```javascript\nconst x = 1\n```\n', isStreaming: true })

      expect(result.current.lines).toHaveLength(1)
      expect(result.current.isBuffering).toBe(false)
    })

    it('should hold buffer when inline code is unclosed', () => {
      const { result, rerender } = renderHook(
        ({ content, isStreaming }) => useBufferedLineAnimation({ content, isStreaming }),
        { initialProps: { content: '', isStreaming: true } }
      )

      rerender({ content: 'This is `code\n', isStreaming: true })

      expect(result.current.lines).toHaveLength(0)
      expect(result.current.isBuffering).toBe(true)

      rerender({ content: 'This is `code` here\n', isStreaming: true })

      expect(result.current.lines).toHaveLength(1)
    })

    it('should hold buffer when bold marker is unclosed', () => {
      const { result, rerender } = renderHook(
        ({ content, isStreaming }) => useBufferedLineAnimation({ content, isStreaming }),
        { initialProps: { content: '', isStreaming: true } }
      )

      rerender({ content: 'This is **bold\n', isStreaming: true })

      expect(result.current.lines).toHaveLength(0)
      expect(result.current.isBuffering).toBe(true)

      rerender({ content: 'This is **bold** text\n', isStreaming: true })

      expect(result.current.lines).toHaveLength(1)
    })

    it('should hold buffer when underscore bold is unclosed', () => {
      const { result, rerender } = renderHook(
        ({ content, isStreaming }) => useBufferedLineAnimation({ content, isStreaming }),
        { initialProps: { content: '', isStreaming: true } }
      )

      rerender({ content: 'This is __bold\n', isStreaming: true })

      expect(result.current.lines).toHaveLength(0)
      expect(result.current.isBuffering).toBe(true)

      rerender({ content: 'This is __bold__ text\n', isStreaming: true })

      expect(result.current.lines).toHaveLength(1)
    })

    it('should hold buffer when strikethrough is unclosed', () => {
      const { result, rerender } = renderHook(
        ({ content, isStreaming }) => useBufferedLineAnimation({ content, isStreaming }),
        { initialProps: { content: '', isStreaming: true } }
      )

      rerender({ content: 'This is ~~strike\n', isStreaming: true })

      expect(result.current.lines).toHaveLength(0)
      expect(result.current.isBuffering).toBe(true)

      rerender({ content: 'This is ~~strike~~ text\n', isStreaming: true })

      expect(result.current.lines).toHaveLength(1)
    })
  })

  describe('force flush on streaming completion', () => {
    it('should flush buffer when streaming completes', () => {
      const { result, rerender } = renderHook(
        ({ content, isStreaming }) => useBufferedLineAnimation({ content, isStreaming }),
        { initialProps: { content: '', isStreaming: true } }
      )

      rerender({ content: 'Incomplete line', isStreaming: true })

      expect(result.current.lines).toHaveLength(0)
      expect(result.current.isBuffering).toBe(true)

      rerender({ content: 'Incomplete line', isStreaming: false })

      expect(result.current.lines).toHaveLength(1)
      expect(result.current.lines[0].content).toBe('Incomplete line')
      expect(result.current.isBuffering).toBe(false)
    })

    it('should flush buffer with incomplete markdown on completion', () => {
      const { result, rerender } = renderHook(
        ({ content, isStreaming }) => useBufferedLineAnimation({ content, isStreaming }),
        { initialProps: { content: '', isStreaming: true } }
      )

      rerender({ content: '```javascript\nconst x = 1', isStreaming: true })

      expect(result.current.lines).toHaveLength(0)
      expect(result.current.isBuffering).toBe(true)

      rerender({ content: '```javascript\nconst x = 1', isStreaming: false })

      expect(result.current.lines).toHaveLength(1)
      expect(result.current.lines[0].content).toBe('```javascript\nconst x = 1')
    })
  })

  describe('animation scheduling and timing', () => {
    it('should mark lines as animating initially', () => {
      const { result, rerender } = renderHook(
        ({ content, isStreaming }) => useBufferedLineAnimation({ content, isStreaming }),
        { initialProps: { content: '', isStreaming: true } }
      )

      rerender({ content: 'Line 1\n', isStreaming: true })

      expect(result.current.lines[0].isAnimating).toBe(true)
    })

    it('should mark lines as not animating after fadeInDuration', () => {
      const { result, rerender } = renderHook(
        ({ content, isStreaming }) =>
          useBufferedLineAnimation({ content, isStreaming, fadeInDuration: 200 }),
        { initialProps: { content: '', isStreaming: true } }
      )

      rerender({ content: 'Line 1\n', isStreaming: true })

      expect(result.current.lines[0].isAnimating).toBe(true)

      act(() => {
        vi.advanceTimersByTime(200)
      })

      expect(result.current.lines[0].isAnimating).toBe(false)
    })

    it('should stagger animation completion for multiple lines', () => {
      const { result, rerender } = renderHook(
        ({ content, isStreaming }) =>
          useBufferedLineAnimation({
            content,
            isStreaming,
            fadeInDuration: 200,
            animationDelay: 100,
          }),
        { initialProps: { content: '', isStreaming: true } }
      )

      rerender({ content: 'Line 1\nLine 2\n', isStreaming: true })

      expect(result.current.lines[0].isAnimating).toBe(true)
      expect(result.current.lines[1].isAnimating).toBe(true)

      // First line completes at 200ms
      act(() => {
        vi.advanceTimersByTime(200)
      })

      expect(result.current.lines[0].isAnimating).toBe(false)
      expect(result.current.lines[1].isAnimating).toBe(true)

      // Second line completes at 300ms (200 + 100)
      act(() => {
        vi.advanceTimersByTime(100)
      })

      expect(result.current.lines[1].isAnimating).toBe(false)
    })
  })

  describe('state reset when content is cleared', () => {
    it('should reset all state when content becomes empty', () => {
      const { result, rerender } = renderHook(
        ({ content, isStreaming }) => useBufferedLineAnimation({ content, isStreaming }),
        { initialProps: { content: '', isStreaming: true } }
      )

      rerender({ content: 'Line 1\nLine 2\n', isStreaming: true })

      expect(result.current.lines).toHaveLength(2)

      rerender({ content: '', isStreaming: false })

      expect(result.current.lines).toHaveLength(0)
      expect(result.current.isBuffering).toBe(false)
    })

    it('should allow new content after reset', () => {
      const { result, rerender } = renderHook(
        ({ content, isStreaming }) => useBufferedLineAnimation({ content, isStreaming }),
        { initialProps: { content: '', isStreaming: true } }
      )

      rerender({ content: 'First message\n', isStreaming: true })
      expect(result.current.lines).toHaveLength(1)

      rerender({ content: '', isStreaming: false })
      expect(result.current.lines).toHaveLength(0)

      rerender({ content: 'Second message\n', isStreaming: true })
      expect(result.current.lines).toHaveLength(1)
      expect(result.current.lines[0].content).toBe('Second message\n')
    })
  })

  describe('processedLength tracking', () => {
    it('should not reprocess already processed content', () => {
      const { result, rerender } = renderHook(
        ({ content, isStreaming }) => useBufferedLineAnimation({ content, isStreaming }),
        { initialProps: { content: '', isStreaming: true } }
      )

      rerender({ content: 'Line 1\n', isStreaming: true })
      expect(result.current.lines).toHaveLength(1)

      const firstLineId = result.current.lines[0].id

      // Rerender with same content (should not create duplicate)
      rerender({ content: 'Line 1\n', isStreaming: true })
      expect(result.current.lines).toHaveLength(1)
      expect(result.current.lines[0].id).toBe(firstLineId)
    })

    it('should only process new content appended to existing content', () => {
      const { result, rerender } = renderHook(
        ({ content, isStreaming }) => useBufferedLineAnimation({ content, isStreaming }),
        { initialProps: { content: '', isStreaming: true } }
      )

      rerender({ content: 'Line 1\n', isStreaming: true })
      expect(result.current.lines).toHaveLength(1)

      rerender({ content: 'Line 1\nLine 2\n', isStreaming: true })
      expect(result.current.lines).toHaveLength(2)
      expect(result.current.lines[0].content).toBe('Line 1\n')
      expect(result.current.lines[1].content).toBe('Line 2\n')
    })

    it('should handle incremental content updates', () => {
      const { result, rerender } = renderHook(
        ({ content, isStreaming }) => useBufferedLineAnimation({ content, isStreaming }),
        { initialProps: { content: '', isStreaming: true } }
      )

      rerender({ content: 'H', isStreaming: true })
      expect(result.current.lines).toHaveLength(0)

      rerender({ content: 'He', isStreaming: true })
      expect(result.current.lines).toHaveLength(0)

      rerender({ content: 'Hel', isStreaming: true })
      expect(result.current.lines).toHaveLength(0)

      rerender({ content: 'Hell', isStreaming: true })
      expect(result.current.lines).toHaveLength(0)

      rerender({ content: 'Hello', isStreaming: true })
      expect(result.current.lines).toHaveLength(0)

      rerender({ content: 'Hello\n', isStreaming: true })
      expect(result.current.lines).toHaveLength(1)
      expect(result.current.lines[0].content).toBe('Hello\n')
    })
  })

  describe('line metadata', () => {
    it('should assign unique IDs to each line', () => {
      const { result, rerender } = renderHook(
        ({ content, isStreaming }) => useBufferedLineAnimation({ content, isStreaming }),
        { initialProps: { content: '', isStreaming: true } }
      )

      rerender({ content: 'Line 1\nLine 2\nLine 3\n', isStreaming: true })

      const ids = result.current.lines.map((line) => line.id)
      const uniqueIds = new Set(ids)

      expect(uniqueIds.size).toBe(3)
    })

    it('should include timestamp for each line', () => {
      const { result, rerender } = renderHook(
        ({ content, isStreaming }) => useBufferedLineAnimation({ content, isStreaming }),
        { initialProps: { content: '', isStreaming: true } }
      )

      const beforeTime = Date.now()
      rerender({ content: 'Line 1\n', isStreaming: true })
      const afterTime = Date.now()

      expect(result.current.lines[0].timestamp).toBeGreaterThanOrEqual(beforeTime)
      expect(result.current.lines[0].timestamp).toBeLessThanOrEqual(afterTime)
    })
  })
})
