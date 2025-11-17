import { useState, useEffect, useRef } from 'react'

export interface AnimatedLine {
  id: string
  content: string
  isAnimating: boolean
  timestamp: number
}

export interface UseBufferedLineAnimationOptions {
  content: string
  isStreaming: boolean
  animationDelay?: number
  fadeInDuration?: number
}

export interface UseBufferedLineAnimationReturn {
  lines: AnimatedLine[]
  isBuffering: boolean
}

export function useBufferedLineAnimation({
  content,
  isStreaming,
  animationDelay = 100,
  fadeInDuration = 200,
}: UseBufferedLineAnimationOptions): UseBufferedLineAnimationReturn {
  const [lines, setLines] = useState<AnimatedLine[]>([])
  const [isBuffering, setIsBuffering] = useState<boolean>(false)
  const bufferRef = useRef<string>('')
  const previousContentRef = useRef<string>('')
  const processedLengthRef = useRef<number>(0)
  const lineIdCounterRef = useRef<number>(0)
  const animationTimersRef = useRef<number[]>([])

  // Helper: Check if markdown syntax is complete
  const isMarkdownComplete = (text: string): boolean => {
    // Check for unclosed code blocks
    const codeBlockMatches = text.match(/```/g)
    if (codeBlockMatches && codeBlockMatches.length % 2 === 1) {
      return false
    }

    // Remove code blocks before checking inline code to avoid counting their backticks
    const textWithoutCodeBlocks = text.replace(/```[\s\S]*?```/g, '')

    // Check for unclosed inline code
    const backtickMatches = textWithoutCodeBlocks.match(/`/g)
    if (backtickMatches && backtickMatches.length % 2 === 1) {
      return false
    }

    // Check for unclosed bold (**)
    const boldStarMatches = text.match(/\*\*/g)
    if (boldStarMatches && boldStarMatches.length % 2 === 1) {
      return false
    }

    // Check for unclosed bold (__)
    const boldUnderscoreMatches = text.match(/__/g)
    if (boldUnderscoreMatches && boldUnderscoreMatches.length % 2 === 1) {
      return false
    }

    // Check for unclosed strikethrough (~~)
    const strikethroughMatches = text.match(/~~/g)
    if (strikethroughMatches && strikethroughMatches.length % 2 === 1) {
      return false
    }

    return true
  }

  // Process new content
  useEffect(() => {
    // Check if content is a simple append or a replacement
    const isSimpleAppend = content.startsWith(previousContentRef.current)
    
    if (!isSimpleAppend && previousContentRef.current !== '') {
      // Content was modified (not just appended), reprocess from scratch
      bufferRef.current = content
      processedLengthRef.current = content.length
      previousContentRef.current = content
    } else {
      // Only process new content beyond what we've already processed
      const newContent = content.slice(processedLengthRef.current)
      if (!newContent) return

      // Append to buffer
      bufferRef.current += newContent
      processedLengthRef.current = content.length
      previousContentRef.current = content
    }

    // Extract complete chunks (lines with complete markdown)
    const completeChunks: string[] = []
    let bufferContent = bufferRef.current
    let accumulatedContent = ''

    while (bufferContent.includes('\n')) {
      const newlineIndex = bufferContent.indexOf('\n')
      const chunk = bufferContent.slice(0, newlineIndex + 1)
      accumulatedContent += chunk

      // Only flush if markdown is complete in the accumulated content
      if (isMarkdownComplete(accumulatedContent)) {
        // Flush the entire accumulated content as one chunk
        completeChunks.push(accumulatedContent)
        bufferContent = bufferContent.slice(accumulatedContent.length)
        accumulatedContent = '' // Reset for next chunk
      } else {
        // Keep accumulating until markdown completes
        // Continue to next newline
        bufferContent = bufferContent.slice(newlineIndex + 1)
      }
    }

    // Update buffer with remaining content (accumulated + any remaining without newline)
    const finalBuffer = accumulatedContent + bufferContent
    bufferRef.current = finalBuffer
    setIsBuffering(finalBuffer.length > 0)

    // Add complete chunks to animation queue
    if (completeChunks.length > 0) {
      const newLines = completeChunks.map((chunkContent) => ({
        id: String(lineIdCounterRef.current++),
        content: chunkContent,
        isAnimating: true,
        timestamp: Date.now(),
      }))

      setLines((prev) => [...prev, ...newLines])

      // Schedule animation completion with staggered delays
      newLines.forEach((line, index) => {
        const timerId = window.setTimeout(() => {
          setLines((prev) =>
            prev.map((l) =>
              l.id === line.id ? { ...l, isAnimating: false } : l
            )
          )
        }, fadeInDuration + index * animationDelay)

        animationTimersRef.current.push(timerId)
      })
    }
  }, [content, fadeInDuration, animationDelay])

  // Flush buffer when streaming completes
  useEffect(() => {
    if (!isStreaming && bufferRef.current) {
      const finalLine: AnimatedLine = {
        id: String(lineIdCounterRef.current++),
        content: bufferRef.current,
        isAnimating: true,
        timestamp: Date.now(),
      }

      setLines((prev) => [...prev, finalLine])
      bufferRef.current = ''
      setIsBuffering(false)

      // Schedule animation completion
      const timerId = window.setTimeout(() => {
        setLines((prev) =>
          prev.map((l) =>
            l.id === finalLine.id ? { ...l, isAnimating: false } : l
          )
        )
      }, fadeInDuration)

      animationTimersRef.current.push(timerId)
    }
  }, [isStreaming, fadeInDuration])

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      animationTimersRef.current.forEach((timerId) => {
        clearTimeout(timerId)
      })
      animationTimersRef.current = []
    }
  }, [])

  // Reset when content is cleared
  useEffect(() => {
    if (content === '') {
      setLines([])
      bufferRef.current = ''
      setIsBuffering(false)
      processedLengthRef.current = 0
      lineIdCounterRef.current = 0
    }
  }, [content])

  return {
    lines,
    isBuffering,
  }
}
