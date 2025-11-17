interface ConnectionBannerProps {
  isConnecting: boolean
  isConnected: boolean
  onRetry?: () => void
}

export default function ConnectionBanner({ isConnecting, isConnected, onRetry }: ConnectionBannerProps) {
  // Only show banner when there's an issue (connecting or disconnected)
  if (isConnected && !isConnecting) {
    return null
  }

  return (
    <div className={`fixed top-16 left-0 right-0 z-30 px-4 py-3 text-center text-white shadow-lg ${
      isConnecting ? 'bg-blue-500' : 'bg-amber-500'
    }`}>
      <div className="mx-auto flex max-w-5xl items-center justify-center gap-3">
        {isConnecting && (
          <>
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            <span className="font-medium">Connecting to server...</span>
          </>
        )}
        {!isConnecting && !isConnected && (
          <>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                clipRule="evenodd"
              />
            </svg>
            <span className="font-medium">Unable to connect to server</span>
            {onRetry && (
              <button
                onClick={onRetry}
                className="ml-2 rounded bg-white px-3 py-1 text-sm font-semibold text-amber-600 transition hover:bg-amber-50"
              >
                Retry
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}
