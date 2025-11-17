import { useState, useEffect, useMemo } from "react";
import { TimelineSection } from "../types";
import TimelineSectionItem from "./ThinkingTimeLineSectionitem";



interface ThinkingTimelineProps {
  sections: Array<{ title: string | null; content: string; isStreaming?: boolean }>;
}

export function ThinkingTimeline({ sections }: Readonly<ThinkingTimelineProps>) {
  const timelineSections: TimelineSection[] = useMemo(()=>sections.map((section, index) => {
    const title = section.title || `Thinking step ${index + 1}`;
    
    return {
      title,
      content: section.content,
      index,
      isStreaming: section.isStreaming || false
    };
  }),[sections]);


  // Auto-close when no sections are streaming (thinking is complete)
  const hasStreamingSections = timelineSections.some(s => s.isStreaming);
  const [isOpen, setIsOpen] = useState(hasStreamingSections);
  
  // Update isOpen when streaming status changes
  useEffect(() => {
    setIsOpen(hasStreamingSections);
  }, [hasStreamingSections]);
  
  // Get last 2 sections for closed preview
  const lastTwoSections = timelineSections.slice(-2);
  
  // Items to show: last 2 when closed, all when open
  const visibleSections = isOpen ? timelineSections : lastTwoSections;

   if (timelineSections.length === 0) return null;

  return (
    <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900/60">
      {/* Header - clickable to toggle */}
      <div 
      role="button"
        className="flex items-start gap-3 px-3 py-3 sm:px-4 sm:py-3 cursor-pointer hover:bg-slate-100/50 dark:hover:bg-slate-800/30 rounded-lg transition-colors"
        onClick={() => setIsOpen(!isOpen)}
      >
        {/* Chevron on the LEFT */}
        <svg 
          className={`h-5 w-5 text-slate-400 transition-transform shrink-0 mt-0.5 ${isOpen ? 'rotate-180' : ''}`}
          fill="none" 
          viewBox="0 0 24 24" 
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
        
        <div className="flex-1">
          <div className="flex items-center gap-2 font-medium text-slate-700 dark:text-slate-200">
            <span className="text-sm sm:text-base">Thought Process</span>
            <span className="text-xs font-normal text-slate-400 dark:text-slate-400">
              {timelineSections.length} step{timelineSections.length !== 1 ? 's' : ''}
            </span>
          </div>
        </div>
      </div>
      
      {/* Items - show last 2 when closed, all when open */}
      <div className="px-3 pb-3 sm:px-4 sm:pb-4">
        {visibleSections.map((section, idx) => (
          <TimelineSectionItem 
            key={section.index} 
            section={section} 
            isLast={idx === visibleSections.length - 1}
          />
        ))}
      </div>
    </div>
  );
}