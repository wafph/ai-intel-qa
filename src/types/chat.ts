// types/chat.ts
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  reasoning?: string;
  timestamp: Date;
  streaming?: boolean;
  vote?: 'like' | 'dislike' | null;
  likeCount?: number;
  dislikeCount?: number;
  metadata?: {
    type?: string;
    wordCount?: number;
  };
}

export interface ChatSession {
  id: string;
  title: string;
  time: number;
  type: '智能问答' | '智能检索' | '辅助起草' | '合规审核';
  messages: ChatMessage[];
  isCollected?: boolean;
  menuType: string;
}


export interface HistoryItem {
  id: string;
  title: string;
  time: number;
  type: '智能问答' | '智能检索' | '辅助起草' | '合规审核';
  preview: string;
  isCollected?: boolean;
  menuType: string;
}
export interface StreamChunk {
  event: string
  data: {
    text?: string
    reasoning_content?: string
    [key: string]: any
  }
}
