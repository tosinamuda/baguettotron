'use client'

import { useState, useEffect, useRef } from 'react'
import { useClientSettings } from '@/hooks/useClientSettings'
import { useUpdateClientSettings } from '@/hooks/useUpdateClientSettings'
import Toast from '../../components/ui/Toast'
import { Slider } from '../../components/ui/Slider'
import type { SystemPromptTemplate } from '@/types/models'
import type { Client } from '@/types/client'

interface SettingsPanelProps {
  isOpen: boolean
  onClose: () => void
  clientId: string
  systemPromptTemplates: SystemPromptTemplate[]
}

interface GenerationParams {
  do_sample: boolean
  temperature: number
  top_p: number
  top_k: number
  repetition_penalty: number
  max_tokens: number
}

const DEFAULT_PARAMS: GenerationParams = {
  do_sample: false,
  temperature: 0.7,
  top_p: 0.9,
  top_k: 50,
  repetition_penalty: 1.1,
  max_tokens: 2048,
}

// Internal component that resets state when clientData changes
function SettingsPanelContent({
  isOpen,
  onClose,
  clientId,
  clientData,
  isLoading,
  fetchError
}: Readonly<{
  isOpen: boolean
  onClose: () => void
  clientId: string
  clientData: Client | undefined
  isLoading: boolean
  fetchError: Error | null
}>) {
  const [showToast, setShowToast] = useState(false)
  const [toastMessage, setToastMessage] = useState('')
  const [toastType, setToastType] = useState<'success' | 'error'>('success')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Update mutation
  const updateMutation = useUpdateClientSettings()

  // Local draft state for editing - initialize from clientData prop
  const [draftSystemPrompt, setDraftSystemPrompt] = useState(clientData?.system_prompt || '')
  const [params, setParams] = useState<GenerationParams>({
    do_sample: clientData?.do_sample ?? DEFAULT_PARAMS.do_sample,
    temperature: clientData?.temperature ?? DEFAULT_PARAMS.temperature,
    top_p: clientData?.top_p ?? DEFAULT_PARAMS.top_p,
    top_k: clientData?.top_k ?? DEFAULT_PARAMS.top_k,
    repetition_penalty: clientData?.repetition_penalty ?? DEFAULT_PARAMS.repetition_penalty,
    max_tokens: clientData?.max_tokens ?? DEFAULT_PARAMS.max_tokens,
  })

  // Handle Escape key to close panel
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose()
      }
    }

    if (isOpen) {
      document.addEventListener('keydown', handleEscape)
      // Focus the textarea when panel opens
      setTimeout(() => textareaRef.current?.focus(), 100)
    }

    return () => {
      document.removeEventListener('keydown', handleEscape)
    }
  }, [isOpen, onClose])

  const handleSave = async () => {
    try {
      await updateMutation.mutateAsync({
        clientId,
        systemPrompt: draftSystemPrompt,
        ...params,
      })
      setToastMessage('Settings saved successfully!')
      setToastType('success')
      setShowToast(true)
      // Close panel after short delay
      setTimeout(() => {
        onClose()
      }, 1000)
    } catch {
      setToastMessage('Failed to save settings. Please try again.')
      setToastType('error')
      setShowToast(true)
    }
  }

  const handleCancel = () => {
    // Reset draft to server value
    if (clientData) {
      setDraftSystemPrompt(clientData.system_prompt || '')
      setParams({
        do_sample: clientData.do_sample ?? DEFAULT_PARAMS.do_sample,
        temperature: clientData.temperature ?? DEFAULT_PARAMS.temperature,
        top_p: clientData.top_p ?? DEFAULT_PARAMS.top_p,
        top_k: clientData.top_k ?? DEFAULT_PARAMS.top_k,
        repetition_penalty: clientData.repetition_penalty ?? DEFAULT_PARAMS.repetition_penalty,
        max_tokens: clientData.max_tokens ?? DEFAULT_PARAMS.max_tokens,
      })
    }
    onClose()
  }

  const characterCount = draftSystemPrompt.length
  const maxLength = 4000
  const isOverLimit = characterCount > maxLength

  return (
    <>
      {/* Backdrop - only on mobile */}
      <div
        className={`fixed inset-0 z-40 bg-black/50 backdrop-blur-sm transition-opacity md:hidden ${
          isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
      />

      {/* Settings Panel - slides in from right */}
      <div
        className={`fixed top-0 right-0 h-full z-50 bg-white dark:bg-slate-800 shadow-2xl transition-transform duration-300 ease-in-out ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        } w-full md:w-[28rem] flex flex-col`}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-slate-700 shrink-0">
          <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
            Settings
          </h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700 dark:hover:text-slate-300"
            aria-label="Close settings"
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
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto px-6 py-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-300 border-t-[#03f3ef]" />
            </div>
          ) : fetchError ? (
            <div className="rounded-lg bg-rose-50 p-4 text-rose-800 dark:bg-rose-900/20 dark:text-rose-200">
              <p className="font-medium">Failed to load settings</p>
              <p className="mt-1 text-sm">Please try closing and reopening the settings.</p>
            </div>
          ) : (
            <div className="space-y-8">
              {/* System Prompt Section */}
              <div className="space-y-4">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                    System Prompt
                  </h3>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                    Set instructions for the AI&apos;s behavior and personality.
                  </p>
                </div>

                <div className="relative">
                  <textarea
                    ref={textareaRef}
                    id="system-prompt"
                    value={draftSystemPrompt}
                    onChange={(e) => setDraftSystemPrompt(e.target.value)}
                    placeholder="You are a helpful assistant that provides clear and concise answers. You are friendly, professional, and always aim to be accurate."
                    className={`w-full rounded-lg border ${
                      isOverLimit
                        ? 'border-rose-500 focus:border-rose-500 focus:ring-rose-500'
                        : 'border-slate-300 focus:border-[#03f3ef] focus:ring-[#03f3ef]'
                    } bg-white px-4 py-3 text-sm shadow-sm outline-none transition focus:ring-2 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100`}
                    rows={6}
                  />
                  <div className="mt-2 flex items-center justify-between text-xs">
                    <span className="text-slate-500 dark:text-slate-400">
                      Leave empty to use default behavior
                    </span>
                    <span
                      className={`font-medium ${
                        isOverLimit ? 'text-rose-600 dark:text-rose-400' : 'text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      {characterCount} / {maxLength}
                    </span>
                  </div>
                </div>
              </div>

              {/* Divider */}
              <div className="border-t border-slate-200 dark:border-slate-700" />

              {/* Generation Parameters Section */}
              <div className="space-y-4">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                    Generation Parameters
                  </h3>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                    Control how the AI generates responses.
                  </p>
                </div>

                <div className="space-y-6">
                  {/* Sampling Strategy Toggle */}
                  <div>
                    <div className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                      Sampling Strategy
                    </div>
                    <button
                      onClick={() => setParams(prev => ({ ...prev, do_sample: !prev.do_sample }))}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        params.do_sample ? 'bg-[#03f3ef]' : 'bg-slate-300 dark:bg-slate-600'
                      }`}
                      role="switch"
                      aria-checked={params.do_sample}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          params.do_sample ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                    <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                      {params.do_sample
                        ? 'Sampling (creative, varied responses)'
                        : 'Greedy (deterministic, consistent responses)'}
                    </p>
                  </div>

                  {/* Temperature Slider */}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                      Temperature: {params.temperature.toFixed(1)}
                    </label>
                    <Slider
                      value={params.temperature}
                      onChange={(value) => setParams(prev => ({ ...prev, temperature: value }))}
                      min={0}
                      max={2}
                      step={0.1}
                      disabled={!params.do_sample}
                    />
                    <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                      Lower = more focused, Higher = more creative
                    </p>
                  </div>

                  {/* Top-p Slider */}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                      Top-p (Nucleus): {params.top_p.toFixed(2)}
                    </label>
                    <Slider
                      value={params.top_p}
                      onChange={(value) => setParams(prev => ({ ...prev, top_p: value }))}
                      min={0}
                      max={1}
                      step={0.05}
                      disabled={!params.do_sample}
                    />
                    <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                      Samples from smallest set of tokens with cumulative probability p
                    </p>
                  </div>

                  {/* Top-k Slider */}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                      Top-k: {params.top_k}
                    </label>
                    <Slider
                      value={params.top_k}
                      onChange={(value) => setParams(prev => ({ ...prev, top_k: Math.round(value) }))}
                      min={1}
                      max={100}
                      step={1}
                      disabled={!params.do_sample}
                    />
                    <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                      Samples from top k most likely tokens
                    </p>
                  </div>

                  {/* Repetition Penalty Slider */}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                      Repetition Penalty: {params.repetition_penalty.toFixed(2)}
                    </label>
                    <Slider
                      value={params.repetition_penalty}
                      onChange={(value) => setParams(prev => ({ ...prev, repetition_penalty: value }))}
                      min={1}
                      max={2}
                      step={0.05}
                    />
                    <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                      Reduces repetition by penalizing tokens that already appeared (1.0 = no penalty, 1.2 = recommended)
                    </p>
                  </div>

                  {/* Max Tokens Slider */}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                      Max Tokens: {params.max_tokens}
                    </label>
                    <Slider
                      value={params.max_tokens}
                      onChange={(value) => setParams(prev => ({ ...prev, max_tokens: Math.round(value) }))}
                      min={100}
                      max={4096}
                      step={100}
                    />
                    <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                      Maximum length of generated response (100-4096 tokens)
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-slate-200 px-6 py-4 dark:border-slate-700 shrink-0">
          <button
            onClick={handleCancel}
            disabled={updateMutation.isPending}
            className="rounded-lg px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50 dark:text-slate-300 dark:hover:bg-slate-700"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={updateMutation.isPending || isLoading || !!fetchError || isOverLimit}
            className="rounded-lg bg-[#03f3ef] px-4 py-2 text-sm font-medium text-white hover:bg-[#19b5b0] disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {updateMutation.isPending ? (
              <span className="flex items-center gap-2">
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24">
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                    fill="none"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                Saving...
              </span>
            ) : (
              'Save'
            )}
          </button>
        </div>
      </div>

      {/* Toast notification */}
      {showToast && (
        <Toast
          message={toastMessage}
          type={toastType}
          onClose={() => setShowToast(false)}
          onRetry={toastType === 'error' ? handleSave : undefined}
        />
      )}
    </>
  )
}

// Main component wrapper
export default function SettingsPanel({ isOpen, onClose, clientId }: Readonly<SettingsPanelProps>) {
  // Fetch current client settings
  const { data: clientData, isLoading, error: fetchError } = useClientSettings(clientId)

  // Use key to reset component state when panel is opened
  // This ensures draft state is synced with server state when opening
  const resetKey = isOpen ? clientData?.updated_at || 'open' : 'closed'

  return (
    <SettingsPanelContent
      key={resetKey}
      isOpen={isOpen}
      onClose={onClose}
      clientId={clientId}
      clientData={clientData}
      isLoading={isLoading}
      fetchError={fetchError}
    />
  )
}
