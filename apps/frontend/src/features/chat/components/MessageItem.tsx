"use client";
import { useRef, useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import { useChatStore } from "../../../state/store/chatStore";
import { MAX_HEIGHT_REM } from "../constants";
import type { Message } from "../types";
import { twJoin } from "tailwind-merge";
import { ThinkingTrace } from "./thinking/components/ThinkingTrace";


export interface MessageItemProps {
  readonly message: Message;
  readonly messageIndex: number;
  readonly isStreamingMessage: boolean;
}

export function UserMessageItem({
  message,
  messageIndex,
  shouldClampUser = false,
  ref,
}: MessageItemProps & {
    shouldClampUser?: boolean;
    ref?: React.Ref<HTMLDivElement>;
  }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isOverflowing, setIsOverflowing] = useState(false);

  const contentRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setIsExpanded(false);

    const content = contentRef.current;
    if (!content) return;

    // convert rem to px based on root font size
    const rootFontSizeStr = getComputedStyle(document.documentElement).fontSize;
    const rootFontSize = parseFloat(rootFontSizeStr) || 16;
    const maxHeightPx = MAX_HEIGHT_REM * rootFontSize;

    const overflowing = content.scrollHeight > maxHeightPx;
    setIsOverflowing(overflowing);
  }, [message.content]);

  const shouldClamp = isOverflowing && !isExpanded;

  return (
    <div
     ref={ref}
      className={"flex justify-end"}
      data-message-index={messageIndex}
      data-message-role={message.role}
      data-streaming-message={"false"}
      data-response-message={undefined}
      data-user-expanded={shouldClampUser && isExpanded ? "true" : undefined}
    >
      <div className="relative w-full max-w-3xl rounded-lg px-4 py-3 sm:px-6 sm:py-4 bg-[#03f3ef] text-slate-900">
        {message.content && (
          <div
            ref={contentRef}
            className={twJoin(
              "leading-relaxed text-sm text-slate-900 py-0.5",
              shouldClamp && "max-h-[12.5rem] overflow-hidden "
            )}
          >
            <div className="prose prose-base prose-slate dark:prose-invert max-w-none">
              <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>
                {message.content}
              </ReactMarkdown>
            </div>
          </div>
        )}

        {
          shouldClamp && (
              <div
            className={twJoin(
              "pointer-events-none absolute bottom-0 left-0 right-0 h-12 ",
              "bg-gradient-to-t from-[#03f3ef] to-transparent",
              "flex items-end justify-center pb-2"
            )}
          >
          </div>
          )
        }

        {isOverflowing && (
          
            <button
              type="button"
              className="pointer-events-auto rounded-full bg-white/90 px-4 py-1.5 text-xs font-semibold text-slate-900 shadow-sm transition hover:bg-white"
              onClick={() => setIsExpanded((isExpanded) => !isExpanded)}
            >
              {isExpanded ? "Show less": "Show more" }             
            </button>
        )}
      </div>
    </div>
  );
}

export function AssistantMessageItem({
  message,
  isStreamingMessage,
  messageIndex,
  isActiveResponse = false,
  ref,
}: MessageItemProps & {
    isActiveResponse?: boolean;
    ref?: React.Ref<HTMLDivElement>;
  }) {
  // Get current thinking mode setting from store
  const thinkingMode = useChatStore((state) => state.thinkingMode);

  // Show thinking if:
  // 1. Thinking mode is enabled, OR
  // 2. Message is currently streaming (so user sees progress even if thinking mode is off)
  const shouldShowThinking =
    message.thinking && (thinkingMode || isStreamingMessage);

  return (
    <div
    ref={ref}
      className={"flex justify-start"}
      data-message-index={messageIndex}
      data-message-role={message.role}
      data-streaming-message={isStreamingMessage ? "true" : "false"}
      data-response-message={isActiveResponse ? "true" : undefined}
      data-user-clamped={undefined}
      data-user-expanded={undefined}
    >
      <div
        className={
          "w-full max-w-3xl rounded-lg px-4 py-3 sm:px-6 sm:py-4 bg-white text-slate-900 shadow-sm dark:bg-slate-800 dark:text-white"
        }
      >
        {/* Show thinking during streaming OR when thinking mode is enabled */}
        {shouldShowThinking && (
          <>
           <ThinkingTrace streamingTrace={message.thinking || ""} isStreaming={isStreamingMessage} />
         {/*  <details
            className="mb-3 rounded-lg border border-slate-200 bg-slate-50 p-3 sm:p-4 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-300 thinking-details"
            open={false}
          >
            <summary className="flex cursor-pointer items-center gap-2 font-medium text-slate-700 dark:text-slate-200">
              <span className="text-sm sm:text-base">Thought Process</span>
              {message.thinking && (
                <span className="max-w-[16rem] sm:max-w-md truncate text-xs font-normal text-slate-400 dark:text-slate-400">
                  {extractThinkingPreview(message.thinking)}
                </span>
              )}
            </summary>
            <div className="mt-2 w-full min-w-0 font-jetbrains prose prose-sm prose-slate dark:prose-invert max-w-none text-slate-600 dark:text-slate-300 wrap-break-word">
              <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>
                {message.thinking}
              </ReactMarkdown>
             
            </div>
          </details> */}
           </>
        )}

        {(message.content || isStreamingMessage) && (
          <div
            className={twJoin(
              "leading-relaxed text-base text-slate-800 dark:text-slate-100",
              message.thinking &&
                message.content &&
                !isStreamingMessage &&
                "response-fade-in"
            )}
          >
            {message.content ? (
              <div className="prose prose-base prose-slate dark:prose-invert max-w-none wrap-break-word **:wrap-break-word [&_code]:break-all [&_pre]:overflow-x-auto [&_pre]:whitespace-pre-wrap">
                <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>
                  {message.content}
                </ReactMarkdown>
              </div>
            ) : (
              <div className="flex items-center gap-1 text-slate-400">
                <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-slate-400"></span>
                <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-slate-400 delay-75"></span>
                <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-slate-400 delay-150"></span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}


