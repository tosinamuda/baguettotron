'use client'

import { Document } from '../../../state/store/chatStore'

interface DocumentListProps {
  readonly documents: Document[]
  readonly onDelete?: (documentId: string) => void
  readonly readonly?: boolean
}

export function DocumentList({ documents, onDelete, readonly = false }: DocumentListProps) {
  if (documents.length === 0) {
    return null
  }

  return (
    <div className="flex flex-wrap gap-2">
      {documents.map((doc) => (
        <div
          key={doc.id}
          className="group relative flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm dark:border-slate-700 dark:bg-slate-800"
        >
          {/* Document icon */}
          <div className="shrink-0 rounded-lg bg-red-50 p-1.5 text-red-500 dark:bg-red-900/20">
            <svg
              className="h-4 w-4"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
          </div>

          {/* Document info */}
          <div className="flex flex-col">
            <span className="max-w-[150px] truncate text-xs font-medium text-slate-700 dark:text-slate-200">
              {doc.filename}
            </span>
            <span className="text-[10px] text-slate-400 uppercase">
              {doc.filename.split('.').pop()}
            </span>
          </div>

          {/* Status indicator (only if processing or failed) */}
          {doc.status === 'processing' && (
            <div className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-blue-500 ring-2 ring-white dark:ring-slate-900">
              <svg className="h-2.5 w-2.5 animate-spin text-white" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            </div>
          )}
          
          {doc.status === 'failed' && (
             <div className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 ring-2 ring-white dark:ring-slate-900" title={doc.errorMessage}>
              <span className="text-[10px] font-bold text-white">!</span>
            </div>
          )}

          {/* Delete button */}
          {!readonly && onDelete && (
            <button
              onClick={() => onDelete(doc.id)}
              className="ml-1 rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700 dark:hover:text-slate-200"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      ))}
    </div>
  )
}
