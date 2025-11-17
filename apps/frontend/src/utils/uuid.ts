import { v7 as uuidv7 } from 'uuid'

/**
 * Generate a UUID v7 (time-ordered)
 */
export function generateConversationId(): string {
  return uuidv7()
}
