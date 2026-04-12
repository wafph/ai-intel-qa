// types/chat.ts
export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
  streaming?: boolean
  reasoning_content?: string
  citation?: string
  metadata?: Record<string, any>
}

export interface ChatSession {
  id: string
  title: string
  time: string
  type: string
  messages: ChatMessage[]
}

export interface HistoryItem {
  id: string
  title: string
  time: string
  type: string
  preview: string
}

export interface StreamChunk {
  event: string
  data: {
    text?: string
    reasoning_content?: string
    [key: string]: any
  }
}