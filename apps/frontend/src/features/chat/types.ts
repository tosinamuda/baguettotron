import { Document } from "../../state/store/chatStore";

export interface Message {
  role: "user" | "assistant";
  content?: string;
  thinking?: string;
  documents?: Document[];
}

export interface ChatScrollManager {
  scrollContainer: HTMLElement;
  userMessageElement: HTMLElement;
  responseElement?: HTMLElement | null;
  spacerElement: HTMLElement;
}