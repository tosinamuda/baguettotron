"use client";

import {
  useRef,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import { useChatStore } from "../../../state/store/chatStore";
import MessageWrapper from "./MessageWrapper";

import {EMPTY_MESSAGES, MAX_USER_MESSAGE_HEIGHT} from "../constants"
import { findActiveMessagePair  } from "../helper";



interface ChatMessagesProps {
  readonly conversationId: string;
  readonly isFetching?: boolean;
  readonly onScrollToBottomReady?: (scrollFn: () => void) => void;
}



export default function ChatMessages({
  conversationId,
  isFetching,
  onScrollToBottomReady,
}: Readonly<ChatMessagesProps>) {


    const messagesContainerRef = useRef<HTMLDivElement>(null);
  const spacerRef = useRef<HTMLDivElement>(null);
  const lastUserMessageRef = useRef<HTMLDivElement>(null);
  const lastResponseRef = useRef<HTMLDivElement>(null);
  const prevMessageCountRef = useRef(0);
  const hasScrolledToBottomRef = useRef(false); // Track if we've scrolled for this conversation
  const currentConversationRef = useRef<string | null>(null); // Track which conversation we're viewing


    // Get persisted messages for this conversation - use stable empty array reference
  const messages = useChatStore(
    (state) => state.messagesByConversation[conversationId] ?? EMPTY_MESSAGES
  );



  // Get streaming message for this conversation - null is already stable
  const streamingMessage = useChatStore(
    (state) => state.streamingByConversation[conversationId] ?? null
  );

    // Check if this conversation is streaming
  const isStreaming = useChatStore(
    (state) => conversationId in state.streamingByConversation
  );



  // Combine persisted messages with streaming message for display - memoized to prevent unnecessary re-renders
  const displayMessages = useMemo(() => {
    return streamingMessage ? [...messages, streamingMessage] : messages;
  }, [messages, streamingMessage]);

    const [lastUserIndex, lastResponseIndex] = useMemo( () => findActiveMessagePair(displayMessages),
    [displayMessages])


    // Update spacer height based on container, user message, and response heights
  const updateSpacerHeight = useCallback(() => {
    const container = messagesContainerRef.current;
    const spacer = spacerRef.current;
    const userMsg = lastUserMessageRef.current;

    if (!container || !spacer || !userMsg) return;

    const containerHeight = container.clientHeight;
    const userHeight = Math.min(MAX_USER_MESSAGE_HEIGHT, userMsg.offsetHeight);
    const responseHeight = lastResponseRef.current?.offsetHeight || 0;

    const spacerHeight = Math.max(0, containerHeight - userHeight - responseHeight);
    spacer.style.height = `${spacerHeight}px`;
  }, []);


    // Effect 1: Reset tracking when conversationId changes
  useEffect(() => {
    if (currentConversationRef.current !== conversationId) {
      hasScrolledToBottomRef.current = false;
      currentConversationRef.current = conversationId;
      prevMessageCountRef.current = 0;
    }
  }, [conversationId]);


  // Effect 2: Wait for messages to load, then scroll to bottom (only once per conversation)
  useEffect(() => {
    const container = messagesContainerRef.current;
    
    // Only scroll if:
    // 1. We haven't scrolled for this conversation yet
    // 2. Messages have loaded
    // 3. Container exists
    if (!hasScrolledToBottomRef.current && container && displayMessages.length > 0) {
      requestAnimationFrame(() => {
        container.scrollTo({ top: container.scrollHeight, behavior: "instant" });
      });
      
      hasScrolledToBottomRef.current = true;
      prevMessageCountRef.current = displayMessages.length;
    }
  }, [displayMessages.length]); // Runs when messages load, but guard prevents re-running
  


  // Effect 3: New message in EXISTING conversation → pin to top
  useEffect(() => {
    // Skip if we haven't done initial scroll yet (still loading)
    if (!hasScrolledToBottomRef.current) return;
    
    // Check if new message was added
    if (displayMessages.length > prevMessageCountRef.current) {
      requestAnimationFrame(() => {
        updateSpacerHeight();
        lastUserMessageRef.current?.scrollIntoView({
          block: "start",
          behavior: "instant",
        });
      });
    }
    
    prevMessageCountRef.current = displayMessages.length;
  }, [displayMessages.length, updateSpacerHeight]);


  // Effect 4: Streaming update → update spacer only
  useEffect(() => {

    if (isStreaming && (streamingMessage?.thinking || streamingMessage?.content)) {
      requestAnimationFrame(() => {
        updateSpacerHeight();
      });
    }
  }, [streamingMessage?.content, streamingMessage?.thinking, isStreaming, updateSpacerHeight]);

  // Effect 5: Window resize → update spacer
  useEffect(() => {
    window.addEventListener("resize", updateSpacerHeight);
    return () => window.removeEventListener("resize", updateSpacerHeight);
  }, [updateSpacerHeight]);

  // Effect 6: Provide scroll function to parent
  useEffect(() => {
    if (onScrollToBottomReady) {
      onScrollToBottomReady(() => {
        requestAnimationFrame(() => {
          updateSpacerHeight();
          lastUserMessageRef.current?.scrollIntoView({
            block: "start",
            behavior: "instant",
          });
        });
      });
    }
  }, [onScrollToBottomReady, updateSpacerHeight]);


  const handleUserMessageRef = useCallback((el: HTMLDivElement | null) => {
    lastUserMessageRef.current = el;
  }, []);

  const handleResponseRef = useCallback((el: HTMLDivElement | null) => {
    lastResponseRef.current = el;
  }, []);
  

  return (
    <div
      ref={messagesContainerRef}
      className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden bg-slate-50 dark:bg-slate-900"
      data-chat-messages="true"
    >
      <div className="mx-auto max-w-5xl px-4 sm:px-6 py-6">
        {/* Skeleton UI when fetching and no messages exist */}
        {displayMessages.length === 0 && isFetching && (
          <div className="space-y-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex justify-start">
                <div className="w-full max-w-3xl rounded-lg bg-white shadow-sm dark:bg-slate-800 px-4 py-3 sm:px-6 sm:py-4">
                  <div className="space-y-3">
                    <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded animate-pulse w-3/4"></div>
                    <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded animate-pulse w-full"></div>
                    <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded animate-pulse w-5/6"></div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Empty conversation state */}
        {displayMessages.length === 0 && !isFetching && (
          <div className="flex h-full flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white/70 px-6 py-12 sm:px-8 sm:py-16 text-center dark:border-slate-700 dark:bg-slate-800">
            <div className="text-4xl sm:text-5xl text-[#03f3ef]">🤖</div>
            <h2 className="mt-4 text-xl sm:text-2xl font-semibold text-slate-900 dark:text-white">
              Ready to chat
            </h2>
            <p className="mt-2 text-sm sm:text-base text-slate-500 dark:text-slate-300">
              Type a message below to begin
            </p>
          </div>
        )}

        {/* Messages */}
        {displayMessages.length > 0 && (
          <div className="space-y-6">
            {displayMessages.map((message, index) => (
              <MessageWrapper
                key={`${conversationId}-${index}`}
                message={message}
                index={index}
                displayMessages={displayMessages} // ← Pass full array
                isStreaming={isStreaming}
                lastUserIndex={lastUserIndex}        
                lastResponseIndex={lastResponseIndex} 
                onUserMessageRef={handleUserMessageRef}
                onResponseRef={handleResponseRef}
              />
            ))}

            {/* Dynamic spacer to allow last message to scroll to top - creates room for response below */}
            {/* Height is calculated based on viewport and reduces to 0 as response streams in */}
            <div
              aria-hidden="true"
              ref={spacerRef}
              data-scroll-spacer="true"
              style={{
                height: "0px",
                transition: "height 0.2s ease-out",
              }}
            ></div>
          </div>
        )}

        {/* Subtle loading indicator at bottom when fetching and messages exist */}
        {displayMessages.length > 0 && isFetching && (
          <div className="flex items-center justify-center gap-2 py-3 text-xs text-slate-400 dark:text-slate-500">
            <div className="h-1 w-1 animate-pulse rounded-full bg-slate-400 dark:bg-slate-500"></div>
            <span>Syncing messages...</span>
          </div>
        )}
      </div>
    </div>
  );
}
