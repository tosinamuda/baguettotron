import { ThinkingSection } from "./types";

export class ResilientThinkingParser {
  private fullContent = '';
  private sectionsEmitted = 0;

  processChunk(cumulativeStream: string): { sections: ThinkingSection[], bufferPreview: string } {
    this.fullContent = cumulativeStream;
    const newSections = this.extractCompleteSections();
    const preview = this.getBufferPreview();
    
    return { sections: newSections, bufferPreview: preview };
  }

  private extractCompleteSections(): ThinkingSection[] {
    const newSections: ThinkingSection[] = [];
    
    // Split into leading content + structured sections
    const firstMarkerIndex = this.fullContent.indexOf('###');
    
    if (firstMarkerIndex === -1) {
      // No sections yet
      return newSections;
    }
    
    const leadingContent = this.fullContent.slice(0, firstMarkerIndex).trim();
    const structuredPart = this.fullContent.slice(firstMarkerIndex);
    
    // Parse all sections
    const allSections: ThinkingSection[] = [];
    
    // Add leading if exists
    if (leadingContent) {
      const title = leadingContent.slice(0, 5) + '...';
      allSections.push({ title, content: leadingContent });
    }
    
    // Parse structured sections
    const parts = structuredPart.split(/###\s+/).filter(p => p.trim());
    parts.forEach(part => {
      const section = this.parseStructuredSection(part);
      if (section) {
        allSections.push(section);
      }
    });
    
    // Emit sections we haven't emitted yet (except the last one which is incomplete)
    const completeSections = allSections.length - 1;
    for (let i = this.sectionsEmitted; i < completeSections; i++) {
      newSections.push(allSections[i]);
      this.sectionsEmitted++;
    }
    
    return newSections;
  }

  private parseStructuredSection(raw: string): ThinkingSection | null {
    const lines = raw.split('\n');
    if (lines.length === 0) return null;
    
    const title = lines[0].trim();
    const content = lines.slice(1).join('\n').trim();
    
    if (!title) return null;
    
    return {
      title,
      content: content || '...'
    };
  }

  finalizeBuffer(): ThinkingSection | null {
    const firstMarkerIndex = this.fullContent.indexOf('###');
    
    // Parse all sections
    const allSections: ThinkingSection[] = [];
    
    if (firstMarkerIndex > 0) {
      const leadingContent = this.fullContent.slice(0, firstMarkerIndex).trim();
      if (leadingContent) {
        const title = leadingContent.slice(0, 5) + '...';
        allSections.push({ title, content: leadingContent });
      }
    }
    
    if (firstMarkerIndex !== -1) {
      const structuredPart = this.fullContent.slice(firstMarkerIndex);
      const parts = structuredPart.split(/###\s+/).filter(p => p.trim());
      parts.forEach(part => {
        const section = this.parseStructuredSection(part);
        if (section) {
          allSections.push(section);
        }
      });
    } else if (this.fullContent.trim()) {
      // No markers at all - treat as unstructured
      const content = this.fullContent.trim();
      const title = content.slice(0, 5) + '...';
      allSections.push({ title, content });
    }
    
    // Return the last section if we haven't emitted it yet
    if (allSections.length > this.sectionsEmitted) {
      return allSections[allSections.length - 1];
    }
    
    return null;
  }

  getBufferPreview(): string {
    const firstMarkerIndex = this.fullContent.indexOf('###');
    
    if (firstMarkerIndex === -1) {
      return this.fullContent.trim();
    }
    
    // Get the last section (which is incomplete)
    const structuredPart = this.fullContent.slice(firstMarkerIndex);
    const parts = structuredPart.split(/###\s+/).filter(p => p.trim());
    
    if (parts.length > 0) {
      const lastSection = parts[parts.length - 1];
      return lastSection.trim();
    }
    
    return '';
  }
}