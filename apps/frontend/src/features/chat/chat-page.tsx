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
  const setDocuments = useChatStore((state) => state.setDocuments);

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
          // Merge documents from local messages into server messages
          const mergedMessages = serverMessages.map((serverMsg, index) => {
            const localMsg = existingMessages[index];
            // If roles match and local message has documents, preserve them
            if (localMsg && localMsg.role === serverMsg.role && localMsg.documents) {
              return { ...serverMsg, documents: localMsg.documents };
            }
            return serverMsg;
          });
          setMessages(conversationId, mergedMessages);
        }
      } else if (serverMessages.length > existingMessages.length) {
         // Also merge when server has more messages (e.g. new response)
         // We need to preserve documents for the existing user messages
         const mergedMessages = serverMessages.map((serverMsg, index) => {
            // Only check against existing messages if index is within bounds
            if (index < existingMessages.length) {
                const localMsg = existingMessages[index];
                if (localMsg && localMsg.role === serverMsg.role && localMsg.documents) {
                    return { ...serverMsg, documents: localMsg.documents };
                }
            }
            return serverMsg;
         });
         setMessages(conversationId, mergedMessages);
      }
    }
  }, [conversationData, conversationId, setMessages]);

  // Fetch documents when conversation loads
  useEffect(() => {
    if (!conversationId || !clientId) {
      return;
    }

    const fetchDocuments = async () => {
      try {
        const response = await fetch(
          `http://localhost:8000/api/conversations/${conversationId}/documents?client_id=${clientId}`
        );

        if (response.ok) {
          const documents = (await response.json()) as Array<{
            id: string;
            conversationId: string;
            filename: string;
            status: 'processing' | 'ready' | 'failed';
            chunkCount: number;
            uploadTimestamp: string;
            errorMessage?: string;
          }>;
          setDocuments(conversationId, documents);
        }
      } catch (err) {
        // Silently fail - documents are optional
        console.error('Failed to fetch documents:', err);
      }
    };

    void fetchDocuments();
  }, [conversationId, clientId, setDocuments]);

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
        className="w-full px-4 py-4 bg-transparent"
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
