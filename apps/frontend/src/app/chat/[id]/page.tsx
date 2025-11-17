import { ChatPage } from '@/features/chat/chat-page'

export interface ConversationPageProps {
  params: Promise<{
    id: string
  }>
}

export default async function Page({params}: ConversationPageProps){
  const {id: conversationId} = (await params)

  return <ChatPage conversationId={conversationId} />
}

