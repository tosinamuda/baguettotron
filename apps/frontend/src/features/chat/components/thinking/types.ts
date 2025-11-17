export interface ThinkingSection {
  title: string | null;
  content: string;
  isStreaming?: boolean;
}

export interface TimelineSection {
  title: string;
  content: string;
  index: number;
  isStreaming: boolean;
}