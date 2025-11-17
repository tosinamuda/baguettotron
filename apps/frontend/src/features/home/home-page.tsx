'use client'

import { MessageInput } from '../chat/components/MessageInput'

export function HomePage() {
  return (
    <main className="flex-1 h-full w-full flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-900 px-4">
      <div className="w-full max-w-3xl flex flex-col items-center gap-8">
        <div className="text-center">
          <div className="text-6xl text-[#03f3ef] mb-4">🥖</div>
          <h2 className="text-3xl font-semibold text-slate-900 dark:text-white mb-2">
            Ready when you are
          </h2>
          <p className="text-slate-500 dark:text-slate-400">
            Type your message below to start a conversation
          </p>
        </div>

        {/* Centered input field for empty state */}
        <MessageInput conversationId={null} />
      </div>
    </main>
  )
}
