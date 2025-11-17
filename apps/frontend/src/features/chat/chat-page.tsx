'use client';
import { useState, useEffect, useRef } from 'react';
import { useChatStore } from '../../state/store/chatStore';
import { useConversation } from '../../hooks/useConversation';
import Toast from '../../components/ui/Toast';
import ChatMessages from './components/ChatMessages';
import { MessageInput } from './components/MessageInput';

type Props = {
  conversationId: string;
}
export function ChatPage({  conversationId }: Readonly<Props>) {
  const [showToast, setShowToast] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollToBottomRef = useRef<(() => void) | null>(null);


  // Zustand store - client state only
  const clientId = useChatStore((state) => state.clientId);
  const setMessages = useChatStore((state) => state.setMessages);

  // Fetch active conversation data
  const { data: conversationData, isFetching: isFetchingConversation } = useConversation(
    conversationId,
    clientId
  );

  // Show toast when error occurs
  useEffect(() => {
    if (error) {
       
      setShowToast(true);
    }
  }, [error]);

  const handleCloseToast = () => {
    setShowToast(false);
    setError(null);
  };

  // Load messages when conversation data is fetched
  useEffect(() => {
    if (conversationData && conversationId) {
      // Don't overwrite messages if this conversation is currently streaming
      // to avoid losing partial streaming content
      const isStreaming = useChatStore.getState().isConversationStreaming(conversationId);
      if (isStreaming) {
        return;
      }

      const existingMessages = useChatStore.getState().messagesByConversation[conversationId] || [];
      const serverMessages = conversationData.messages;

      // If we have no local messages, use server data
      if (existingMessages.length === 0) {
        setMessages(conversationId, serverMessages);
        return;
      }

      // If server has more messages than local, update
      if (serverMessages.length > existingMessages.length) {
        setMessages(conversationId, serverMessages);
        return;
      }

      // If same length, compare content to detect differences
      if (serverMessages.length === existingMessages.length) {
        const hasChanges = serverMessages.some((serverMsg, index) => {
          const localMsg = existingMessages[index];
          return (
            serverMsg.role !== localMsg.role ||
            serverMsg.content !== localMsg.content ||
            serverMsg.thinking !== localMsg.thinking
          );
        });

        if (hasChanges) {
          setMessages(conversationId, serverMessages);
        }
      }

      // If local has more messages than server, keep local (user just sent a message)
      // The server will catch up when the message is saved
    }
  }, [conversationData, conversationId, setMessages]);

  const handleMessageSent = () => {
    // Trigger scroll to bottom when user sends a message
    if (scrollToBottomRef.current) {
      scrollToBottomRef.current();
    }
  };

  return (
    <div className="flex flex-col h-full w-full justify-center" data-chat-layout="true">
      {/* Messages area - flex-1 to take remaining space */}
      <ChatMessages
        conversationId={conversationId}
        isFetching={isFetchingConversation}
        onScrollToBottomReady={(scrollFn) => {
          scrollToBottomRef.current = scrollFn;
        }}
      />

      {/* Footer fixed at bottom */}
      <footer
        className="h-20 border-t border-slate-200 bg-white px-4 py-4 shadow-inner dark:border-slate-800 dark:bg-slate-900"
        data-chat-footer="true"
      >
        <div className="mx-auto max-w-5xl">
          <MessageInput
            conversationId={conversationId}
            onMessageSent={handleMessageSent}
          />
        </div>
      </footer>

      {/* Error Toast */}
      {showToast && error && (
        <Toast message={error} type="error" onClose={handleCloseToast} />
      )}
    </div>
  );
}
