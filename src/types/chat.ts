// types/chat.ts
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  reasoning?: string;
  timestamp: number;
  streaming?: boolean;
  vote?: 'like' | 'dislike' | null;
  likeCount?: number;
  dislikeCount?: number;
  metadata?: {
    type?: string;
    wordCount?: number;
  };
  sources?: SourceInfo[]; // ✅ 新增来源信息字段
  match_score?: number; // ✅ 新增：消息级别的
}

export interface ChatSession {
  id: string; // sessionId
  title: string; // sessionTitle
  time: number; // 时间戳
  type: '智能问答' | '智能检索' | '辅助起草' | '合规审核';
  messages: ChatMessage[];
  isCollected?: boolean;
  menuType: string; // 菜单类型
  conversationUuid: string; // sessionUuid
  sessionTitle?: string; // 会话标题
  historyCount?: number; // 历史记录数量
  lastMessageTime?: string; // 最后消息时间
}

// types/chat.ts
export interface HistoryItem {
  id: string;
  title: string;
  time: number;
  type: '智能问答' | '智能检索' | '辅助起草' | '合规审核';
  preview: string;
  isCollected: boolean;
  menuType: string;
  sessionTitle?: string;
  historyCount?: number;
  lastMessageTime?: string;
}

export interface StreamChunk {
  event: string;
  data: {
    text?: string;
    reasoning_content?: string;
    [key: string]: any;
  };
}

export interface SourceInfo {
  file_id?: string;
  chunk_id?: string;
  title?: string; // 文件标题
  content: string; // 切片内容
  subtitle?: string; // 子标题
  update_date_time?: string; // 更新时间
  tags?: string;
  repo_id?: string;
  score?: string;
  match_score?: number;
}
