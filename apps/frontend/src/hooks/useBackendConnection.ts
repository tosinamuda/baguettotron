import { useEffect, useRef } from 'react'
import { useChatStore } from '../state/store/chatStore'

/**
 * Hook to manage initial backend connection verification.
 * Does a one-time health check on mount to verify the backend is ready,
 * then relies on WebSocket connection state.
 */
export function useBackendConnection() {
  const hasChecked = useRef(false)
  const setBackendReady = useChatStore((state) => state.setBackendReady)

  useEffect(() => {
    if (hasChecked.current) return
    hasChecked.current = true

    const checkBackend = async () => {
      let retryCount = 0
      const maxRetries = 30 // 30 attempts = ~30 seconds with exponential backoff

      while (retryCount < maxRetries) {
        try {
          const response = await fetch('http://localhost:8000/api/health', {
            signal: AbortSignal.timeout(5000), // 5 second timeout
          })

          if (response.ok) {
            setBackendReady(true)
            return
          }
        } catch  {
          console.log(`[Backend Connection] Attempt ${retryCount + 1}/${maxRetries} failed, retrying...`)
        }

        // Exponential backoff: 1s, 2s, 4s, 8s, capped at 10s
        const delay = Math.min(1000 * Math.pow(2, retryCount), 10000)
        await new Promise(resolve => setTimeout(resolve, delay))
        retryCount++
      }

      console.error('[Backend Connection] Failed to connect to backend after maximum retries')
      setBackendReady(false)
    }

    checkBackend()
  }, [setBackendReady])
}
