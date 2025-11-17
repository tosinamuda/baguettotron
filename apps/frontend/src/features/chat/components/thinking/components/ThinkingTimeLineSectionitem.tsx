import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import { TimelineSection } from "../types";

// Animated thinking indicator
function ThinkingIndicator() {
  return (
    <span className="text-xs text-slate-500 dark:text-slate-400 inline-flex">
      {['t', 'h', 'i', 'n', 'k', 'i', 'n', 'g'].map((char, idx) => (
        <span
          key={idx}
          className="animate-pulse"
          style={{
            animationDelay: `${idx * 0.1}s`,
            animationDuration: '1.4s'
          }}
        >
          {char}
        </span>
      ))}
      <span className="animate-pulse ml-0.5" style={{ animationDuration: '1.4s' }}>...</span>
    </span>
  );
}

export default function TimelineSectionItem({ section, isLast }: { section: TimelineSection; isLast: boolean }) {
  return (
    <details className="group relative" open={section.isStreaming}>
      <summary className="flex gap-3 pb-1 cursor-pointer list-none [&::-webkit-details-marker]:hidden hover:bg-slate-100/50 dark:hover:bg-slate-800/50 -mx-2 px-2 py-1 rounded transition-colors">
        {/* Timeline dot and connector */}
        <div className="flex flex-col items-center shrink-0">
          {/* Dot aligned with text baseline */}
          <div className={`h-2 w-2 rounded-full ring-4 ring-blue-50 dark:ring-blue-950 mt-1.5 ${
            section.isStreaming 
              ? 'bg-blue-400 animate-pulse' 
              : 'bg-blue-500 group-open:bg-blue-600'
          }`} />
          {/* Connector line extending down */}
          {!isLast && (
            <div className="w-px flex-1 bg-slate-200 dark:bg-slate-700" />
          )}
        </div>

        {/* Title and chevron aligned with dot */}
        <div className="flex-1 min-w-0 flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
              {section.title}
            </span>
            {section.isStreaming && <ThinkingIndicator />}
          </div>
          
          <svg 
            className="h-4 w-4 text-slate-400 transition-transform group-open:rotate-180 shrink-0 mt-0.5" 
            fill="none" 
            viewBox="0 0 24 24" 
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </summary>
      
      {/* Expanded content with border - aligned with dot column */}
      <div className="flex gap-3 pb-2">
        {/* Empty space for timeline column */}
        <div className="flex flex-col items-center shrink-0 w-2">
          {!isLast && (
            <div className="w-px flex-1 bg-slate-200 dark:bg-slate-700" />
          )}
        </div>
        
        {/* Content */}
        <div className="flex-1 pb-1">
          <div className={`border-2 rounded-lg p-3 bg-white dark:bg-slate-900 ${
            section.isStreaming ? 'border-blue-400' : 'border-blue-500'
          }`}>
            <div className="prose prose-sm prose-slate dark:prose-invert max-w-none text-slate-600 dark:text-slate-300 wrap-break-word **:wrap-break-word [&_code]:break-all [&_pre]:overflow-x-auto [&_pre]:whitespace-pre-wrap">
              <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>
                {section.content}
              </ReactMarkdown>
            </div>
          </div>
        </div>
      </div>
    </details>
  );
}