"use client"
import { useState, useEffect } from "react";
import { ThinkingTimeline } from "./ThinkingTimeline";
import { ThinkingSection } from "../types";


interface ThinkingTraceProps {
  streamingTrace: string;
  isStreaming?: boolean; // Pass this from parent to know when done
}

export function ThinkingTrace({ streamingTrace, isStreaming = true }: Readonly<ThinkingTraceProps>) {
  const [sections, setSections] = useState<ThinkingSection[]>([]);

  useEffect(() => {
    const firstMarkerIndex = streamingTrace.indexOf('###');
    const allSections: ThinkingSection[] = [];
    
    // No markers yet - show as unstructured thinking step
    if (firstMarkerIndex === -1) {
      if (streamingTrace.trim()) {
        allSections.push({
          title: streamingTrace.slice(0, 5) + '...',
          content: streamingTrace.trim(),
          isStreaming: isStreaming
        });
      }
      setSections(allSections);
      return;
    }
    
    // Parse leading content
    const leadingContent = streamingTrace.slice(0, firstMarkerIndex).trim();
    if (leadingContent) {
      allSections.push({
        title: leadingContent.slice(0, 5) + '...',
        content: leadingContent,
        isStreaming: false // Leading content is complete once we see first ###
      });
    }
    
    // Parse structured sections
    const structuredPart = streamingTrace.slice(firstMarkerIndex);
    const parts = structuredPart.split(/###\s+/).filter(p => p.trim());
    
    parts.forEach((part, index) => {
      const lines = part.split('\n');
      const title = lines[0]?.trim();
      const content = lines.slice(1).join('\n').trim();
      
      if (title) {
        // Last section is streaming if overall stream is still active
        const isLastSection = index === parts.length - 1;
        allSections.push({ 
          title, 
          content: content || '...', 
          isStreaming: isStreaming && isLastSection 
        });
      }
    });
    
    setSections(allSections);
  }, [streamingTrace, isStreaming]);

  if (sections.length === 0) return null;

  return <ThinkingTimeline sections={sections} />;
}