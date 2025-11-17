'use client'

import { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { useChatStore } from '../../state/store/chatStore'
import { useBackendConnection } from '../../hooks/useBackendConnection'
import { generateClientFingerprint } from '../../utils/fingerprint'
import ConversationList from '../../features/chat/components/ConversationList'
import SettingsModal from '../../features/settings/SettingsModal'
import type { ModelConfig, SystemPromptTemplate } from '../../types/models'

interface AppShellProps {
  children: React.ReactNode
  models: ModelConfig[]
  systemPromptTemplates: SystemPromptTemplate[]
}

export function AppShell({ children, models, systemPromptTemplates }: AppShellProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true)
  const pathname = usePathname()

  // Initialize backend connection check
  useBackendConnection()

  // Zustand store - client state only
  const thinkingMode = useChatStore((state) => state.thinkingMode)
  const selectedModel = useChatStore((state) => state.selectedModel)
  const clientId = useChatStore((state) => state.clientId)
  const setThinkingMode = useChatStore((state) => state.setThinkingMode)
  const setSelectedModel = useChatStore((state) => state.setSelectedModel)
  const setClientId = useChatStore((state) => state.setClientId)
  const isSettingsOpen = useChatStore((state) => state.isSettingsOpen)
  const openSettings = useChatStore((state) => state.openSettings)
  const closeSettings = useChatStore((state) => state.closeSettings)
  const setActiveConversation = useChatStore((state) => state.setActiveConversation)
  const backendReady = useChatStore((state) => state.backendReady)
  const isConnected = useChatStore((state) => state.isConnected)

  // Find current model config
  const currentModelConfig = models.find(m => m.model_name === selectedModel) || models[0]
  
  // Show thinking toggle for all models except 'none'
  const showThinkingToggle = currentModelConfig?.thinking_behavior !== 'none'
  const isFixedThinking = currentModelConfig?.thinking_behavior === 'fixed'

  // Initialize client fingerprint
  useEffect(() => {
    let cancelled = false
    if (!clientId) {
      generateClientFingerprint().then((id) => {
        if (!cancelled && id) {
          setClientId(id)
        }
      })
    }
    return () => {
      cancelled = true
    }
  }, [clientId, setClientId])

  // Sync active conversation with URL pathname
  useEffect(() => {
    // Extract conversation ID from pathname like /chat/[id]
    const match = pathname.match(/^\/chat\/([^/]+)$/)
    if (match) {
      const conversationId = match[1]
      setActiveConversation(conversationId)
    } else if (pathname === '/') {
      // Home page - no active conversation
      setActiveConversation(null)
    }
  }, [pathname, setActiveConversation])

  // Determine connection status
  const connectionStatus = !backendReady ? 'connecting' : isConnected ? 'connected' : 'disconnected'
  const statusColors = {
    connecting: 'bg-amber-500',
    connected: 'bg-green-500',
    disconnected: 'bg-red-500'
  }
  const statusText = {
    connecting: 'Connecting...',
    connected: 'Connected',
    disconnected: 'Disconnected'
  }

  return (
    <div className="flex h-screen w-screen flex-col bg-slate-50 text-slate-900 dark:bg-slate-900 dark:text-slate-100">
      {/* Header stays fixed at top */}
      <header className="sticky h-16 top-0 z-10 border-b border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto flex w-full items-center gap-4">
          {/* Mobile sidebar toggle */}
          <button
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="rounded p-2 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 md:hidden"
            title={isSidebarOpen ? 'Close sidebar' : 'Open sidebar'}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 6h16M4 12h16M4 18h16"
              />
            </svg>
          </button>

          <div className="flex items-center gap-3">
            <h1 className="text-xl text-[#03f3ef] font-semibold">Chateau</h1>
            {/* Connection Status Indicator */}
            <div className="flex items-center gap-2" title={statusText[connectionStatus]}>
              <div className={`h-2 w-2 rounded-full ${statusColors[connectionStatus]} ${connectionStatus === 'connecting' ? 'animate-pulse' : ''}`} />
              <span className="text-xs text-slate-500 dark:text-slate-400 hidden sm:inline">
                {statusText[connectionStatus]}
              </span>
            </div>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-3">
            {/* Model Selection */}
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm shadow-sm outline-none transition focus:border-[#03f3ef] focus:ring-2 focus:ring-[#03f3ef33] dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            >
              {models.map((model) => (
                <option key={model.id} value={model.model_name}>
                  {model.display_name}
                </option>
              ))}
            </select>

            {/* Thinking Mode Toggle - only show if model supports thinking */}
            {showThinkingToggle && (
              <label 
                className="flex cursor-pointer items-center gap-2 text-sm"
                title={
                  isFixedThinking
                    ? `${currentModelConfig.display_name} always generates thinking content. Toggle to show/hide it.`
                    : 'Toggle thinking mode'
                }
              >
                <span className="text-slate-600 dark:text-slate-300">Thinking</span>
                <div className="relative">
                  <input
                    type="checkbox"
                    checked={thinkingMode}
                    onChange={(e) => setThinkingMode(e.target.checked)}
                    className="peer sr-only"
                  />
                  <div className="peer h-6 w-11 rounded-full bg-slate-300 dark:bg-slate-700 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-white after:bg-white after:transition-all after:content-[''] peer-checked:bg-[#03f3ef] peer-checked:after:translate-x-full peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-[#03f3ef33]"></div>
                </div>
              </label>
            )}

            {/* Settings Button */}
            <button
              onClick={openSettings}
              className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 transition"
              title="Settings"
              aria-label="Open settings"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
            </button>
          </div>
        </div>
      </header>

      {/* Main content area with sidebar */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar - hidden on mobile when closed, 18rem (288px) on desktop */}
        <div
          className={`${
            isSidebarOpen ? 'block' : 'hidden'
          } md:block w-full md:w-[18rem] shrink-0 absolute md:relative inset-0 z-20 md:z-0 bg-white dark:bg-slate-900`}
        >
          <ConversationList isOpen={isSidebarOpen} onToggle={() => setIsSidebarOpen(false)} />
        </div>

        {/* Main content area - flex-1 to take remaining space */}
        <main className="flex-1 h-full">
          {children}
        </main>
      </div>

      {/* Settings Modal */}
      {clientId && (
        <SettingsModal
          isOpen={isSettingsOpen}
          onClose={closeSettings}
          clientId={clientId}
          systemPromptTemplates={systemPromptTemplates}
        />
      )}
    </div>
  )
}
