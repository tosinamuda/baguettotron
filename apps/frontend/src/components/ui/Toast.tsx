'use client'

import { useEffect } from 'react'

interface ToastProps {
  message: string
  type?: 'error' | 'success' | 'info'
  onClose: () => void
  duration?: number
  onRetry?: () => void
}

export default function Toast({ message, type = 'error', onClose, duration = 5000, onRetry }: Readonly<ToastProps>) {
  useEffect(() => {
    if (duration > 0) {
      const timer = setTimeout(() => {
        onClose()
      }, duration)

      return () => clearTimeout(timer)
    }
  }, [duration, onClose])

  const bgColor = {
    error: 'bg-rose-600',
    success: 'bg-emerald-600',
    info: 'bg-blue-600',
  }[type]

  const icon = {
    error: '⚠️',
    success: '✓',
    info: 'ℹ️',
  }[type]

  return (
    <div
      className={`fixed bottom-24 right-4 z-50 flex max-w-md items-center gap-3 rounded-lg ${bgColor} px-4 py-3 text-white shadow-lg animate-slide-up`}
      role="alert"
    >
      <span className="text-xl">{icon}</span>
      <p className="flex-1 text-sm font-medium">{message}</p>
      {onRetry && type === 'error' && (
        <button
          onClick={() => {
            onRetry()
            onClose()
          }}
          className="rounded bg-white/20 px-3 py-1 text-xs font-medium hover:bg-white/30 transition"
          aria-label="Retry"
        >
          Retry
        </button>
      )}
      <button
        onClick={onClose}
        className="rounded p-1 hover:bg-white/20 transition"
        aria-label="Close"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-4 w-4"
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path
            fillRule="evenodd"
            d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
            clipRule="evenodd"
          />
        </svg>
      </button>
    </div>
  )
}
