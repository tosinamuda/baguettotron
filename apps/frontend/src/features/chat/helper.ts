import { MAX_USER_MESSAGE_HEIGHT} from "./constants"
import type { Message } from "./types";



interface ChatScrollManager {
  scrollContainer: HTMLElement;
  userMessageElement: HTMLElement;
  responseElement?: HTMLElement | null;
  spacerElement: HTMLElement;
}

type HeightWatcher = ResizeObserver | { disconnect: () => void };

// Extract preview text from thinking content (first line or first heading)
export function extractThinkingPreview(text: string): string {
  if (!text) return "";

  // Try to find first heading using RegExp.exec()
  const headingRegex = /^#{1,6}\s+(.+?)$/m;
  const headingMatch = headingRegex.exec(text);
  if (headingMatch) {
    return headingMatch[1].trim();
  }

  // Otherwise get first non-empty line, max 50 chars
  const firstLine = text.split("\n").find((line) => line.trim());
  if (firstLine) {
    const preview = firstLine.trim();
    return preview.length > 50 ? preview.slice(0, 50) + "..." : preview;
  }

  return "";
}



/**
 * Finds the indices of the active message pair (last user message and its response).
 * 
 * @param messages - Array of messages to search
 * @returns Tuple of [lastUserIndex, lastResponseIndex]
 *          Both are -1 if no user messages exist
 *          lastResponseIndex is -1 if no response exists after last user message
 * 
 * @example
 * findActiveMessagePair([
 *   { role: 'user', content: 'Hi' },
 *   { role: 'assistant', content: 'Hello' },
 *   { role: 'user', content: 'How are you?' }
 * ])
 * // Returns [2, -1] - user at index 2, no response yet
 * 
 * @example
 * findActiveMessagePair([
 *   { role: 'user', content: 'Hi' },
 *   { role: 'assistant', content: 'Hello' },
 *   { role: 'user', content: 'How are you?' },
 *   { role: 'assistant', content: 'Fine!' }
 * ])
 * // Returns [2, 3] - user at index 2, response at index 3
 */
export function findActiveMessagePair(messages: Message[]): [number, number] {
  // Find last user message index
  let userIdx = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "user") {
      userIdx = i;
      break;
    }
  }

  // Find first assistant message after last user
  let responseIdx = -1;
  if (userIdx !== -1) {
    for (let i = userIdx + 1; i < messages.length; i++) {
      if (messages[i].role === "assistant") {
        responseIdx = i;
        break;
      }
    }
  }

  return [userIdx, responseIdx];
}



export function createHeightWatcher(
  element: HTMLElement,
  callback: () => void
): HeightWatcher | null {
  if (typeof ResizeObserver !== "undefined") {
    const observer = new ResizeObserver(() => callback());
    observer.observe(element);
    return observer;
  }

  if (typeof window !== "undefined") {
    const intervalId = window.setInterval(() => callback(), 200);
    return {
      disconnect: () => window.clearInterval(intervalId),
    };
  }

  return null;
}

function getPinnedUserHeight(element: HTMLElement): number {
  const actualHeight = getElementTotalHeight(element);
  if (element.dataset.userExpanded === "true") {
    return actualHeight;
  }
  if (element.dataset.userClamped === "true") {
    return Math.min(MAX_USER_MESSAGE_HEIGHT, actualHeight);
  }
  return actualHeight;
}

export function parseMessageIndex(element: HTMLElement | null): number | null {
  if (!element) return null;
  const value = Number(element.dataset.messageIndex);
  return Number.isFinite(value) ? value : null;
}

export function findResponseElementAfter(
  userElement: HTMLElement,
  container: HTMLElement
): HTMLElement | null {
  const messageElements = Array.from(
    container.querySelectorAll<HTMLElement>("[data-message-index]")
  );
  const position = messageElements.findIndex(
    (element) => element === userElement
  );
  if (position === -1) return null;
  const candidate = messageElements[position + 1];
  if (!candidate) return null;
  return candidate.dataset.messageRole === "assistant" ? candidate : null;
}

export const handleNewMessage = ({
  scrollContainer,
  userMessageElement,
  responseElement,
  spacerElement,
}: ChatScrollManager): void => {
  handleStreamChunk({
    scrollContainer,
    userMessageElement,
    responseElement,
    spacerElement,
  });
  userMessageElement.scrollIntoView({ block: "start", behavior: "auto" });
};

export const handleStreamChunk = ({
  scrollContainer,
  userMessageElement,
  responseElement,
  spacerElement,
}: ChatScrollManager): void => {
  const containerHeight = scrollContainer.clientHeight;
  const clampedUserHeight = getPinnedUserHeight(userMessageElement);
  const responseHeight = responseElement
    ? getElementTotalHeight(responseElement)
    : 0;
  const spacerHeight = Math.max(
    0,
    containerHeight - clampedUserHeight - responseHeight
  );
  spacerElement.style.height = `${spacerHeight}px`;
};


function getElementTotalHeight(element: HTMLElement): number {
  const rect = element.getBoundingClientRect();
  const style = window.getComputedStyle(element);
  const marginTop = parseFloat(style.marginTop) || 0;
  const marginBottom = parseFloat(style.marginBottom) || 0;
  return rect.height + marginTop + marginBottom;
}
