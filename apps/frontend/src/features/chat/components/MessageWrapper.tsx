import type { Message } from "../types";
import  { AssistantMessageItem, UserMessageItem } from "./MessageItem";


interface MessageWrapperProps {
  message: Message;
  index: number;
  displayMessages: Message[];
  isStreaming: boolean;
  lastUserIndex: number;      
  lastResponseIndex: number;  
  onUserMessageRef?: (el: HTMLDivElement | null) => void;
  onResponseRef?: (el: HTMLDivElement | null) => void;
}

export default function MessageWrapper({
    message,
  index,
  displayMessages,
  isStreaming,
  lastUserIndex,
  lastResponseIndex,
  onUserMessageRef,
  onResponseRef,
}: Readonly<MessageWrapperProps>) {

    const isUser = message.role === "user";
  const isLast = index === displayMessages.length - 1;
  const isStreamingMessage = isStreaming && isLast;

   // Simple index comparison
  const isLastUserMessage = index === lastUserIndex;
  const isResponseAfterLastUser = index === lastResponseIndex;

  const attachRef = (el: HTMLDivElement | null) => {
    if (isLastUserMessage && onUserMessageRef) {
      onUserMessageRef(el);
    }
    if (isResponseAfterLastUser && onResponseRef) {
      onResponseRef(el);
    }
  };


  return (
    <>
    {isUser ? (
        <UserMessageItem
          message={message}
          messageIndex={index}
          shouldClampUser={isLastUserMessage}
          isStreamingMessage={false}
           ref={attachRef}
        />
      ) : (
        <AssistantMessageItem
          message={message}
          messageIndex={index}
             isActiveResponse={isResponseAfterLastUser}
      isStreamingMessage={isStreamingMessage}
           ref={attachRef}
        />
      )}
    </>)
};
