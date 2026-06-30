/**
 * 可恢复流式任务管理组合函数。
 *
 * 集中管理 V12 流式任务的状态持久化、生命周期（创建/订阅/恢复/停止）、
 * 任务详情查询、来源合并、本地停止标记和会话消息同步。
 * 从 useAppShell 中拆分而来，保持业务逻辑完全不变。
 */
import { ref, type Ref } from 'vue';
import type { ChatMessage, ChatSession } from '@/types/chat';
import { ElMessage, ElMessageBox } from 'element-plus';
import { authRequest, getEventStream, isSuccessStatus } from '@/services/http';
import { API } from '@/api/api';
import { getApiData, getApiMessage, isApiSuccessCode } from '@/services/response';
import { extractSourcesFromAny } from '@/services/sourceUtils';
import { stripReviewProgressText } from '@/services/reviewProgress';
import { sanitizeAgentText } from '@/services/errorSanitizer';

// ---- 常量 ----
/** localStorage 键：可恢复流式任务列表 */
const STREAM_TASK_STORAGE_KEY = 'ai_intel_v12_2_resumable_stream_tasks';
/** localStorage 键：已停止任务列表 */
const STOPPED_TASK_STORAGE_KEY = 'ai_intel_v12_2_stopped_stream_tasks';
/** localStorage 键：按功能分区的最后活跃会话 */
const LAST_ACTIVE_SESSION_STORAGE_KEY = 'ai_intel_v12_2_last_active_session_by_func';
/** 停止任务 TTL：7 天 */
const STOPPED_TASK_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** 允许恢复订阅的任务状态 */
const ACTIVE_TASK_STATUSES = ['pending', 'running'];
/** 后端终态任务状态 */
const TERMINAL_TASK_STATUSES = ['completed', 'error', 'stopped', 'cancelled', 'canceled', 'superseded'];

/** 可恢复流式任务快照。 */
export type ResumableStreamTask = {
  taskId: string;
  sessionId: string;
  qaId: string;
  messageId: string;
  functionId: string;
  tabName: string;
  status: string;
  recoverable?: boolean;
  lastEventId: number;
  /** 当前 answerContent 已覆盖到的后端事件游标；用于刷新/切换恢复时避免旧快照配新游标导致中间内容被跳过。 */
  answerEventId?: number;
  updatedAt: number;
  createdAt?: number;
  title?: string;
  userContent?: string;
  answerContent?: string;
  reasoningContent?: string;
  sources?: any[];
  metadata?: Record<string, any>;
};

/** useStreamTask 的依赖注入参数。 */
interface UseStreamTaskDeps {
  /** Chat store */
  chatStore: any;
  /** 当前激活会话 ID */
  activeChatId: Ref<string>;
  /** 当前激活 Tab 名称 */
  activeTab: Ref<string>;
  /** 是否正在流式输出 */
  isStreaming: Ref<boolean>;
  /** 当前流式回答内容 */
  currentAnswer: Ref<string>;
  /** 当前推理内容 */
  currentReasoning: Ref<string>;
  /** 当前流式消息 ID */
  currentStreamingMessageId: Ref<string | null>;
  /** 获取当前 agentToken */
  getCurrentAgentToken: () => string;
  /** 根据 functionId 获取 Tab 名称 */
  getTabByFunctionId: (functionId?: string) => string;
}

/**
 * 创建流式任务管理组合函数。
 *
 * @param deps - 依赖注入参数
 * @returns 流式任务相关的响应式状态和方法
 */
export const useStreamTask = (deps: UseStreamTaskDeps) => {
  const {
    chatStore,
    activeChatId,
    activeTab,
    isStreaming,
    currentAnswer,
    currentReasoning,
    currentStreamingMessageId,
    getCurrentAgentToken,
    getTabByFunctionId,
  } = deps;

  // ---- 响应式状态 ----
  /** 所有活跃的可恢复流式任务 */
  const activeStreamTasks = ref<Record<string, ResumableStreamTask>>({});
  /** AbortController 用于中断 SSE 订阅 */
  let abortController: AbortController | null = null;
  /** 待处理的停止同步 Promise */
  let pendingStopSyncPromise: Promise<void> | null = null;

  // ---- Think 标签 / 流式输出状态（由 useStreamChunk 共享使用）----
  /** 大模型答案展示控制：若首段存在 <think>...</think>，只展示 </think> 之后的正式内容 */
  let answerOutputStarted = false;
  /** 首次展示前的缓冲文本 */
  let answerPendingText = '';
  /** 仅重放来源事件的任务 ID 集合 */
  const sourceOnlyReplayTaskIds = new Set<string>();
  /** 已完成任务保存签名，避免重复保存 */
  const completedTaskSaveSignatures = new Map<string, string>();

  // ---- 本地停止管理 ----
  let locallyStoppedTasksCache: Record<string, number> | null = null;
  /** 用户在 taskId 返回前点击停止时，先按 messageId 本地终止 */
  const locallyStoppedMessageIds = new Set<string>();

  /**
   * 从 localStorage 读取已停止任务列表（带 TTL 过滤）。
   * 首次访问时缓存结果。
   */
  const getLocallyStoppedTasks = (): Record<string, number> => {
    if (locallyStoppedTasksCache) return locallyStoppedTasksCache;
    try {
      const raw = localStorage.getItem(STOPPED_TASK_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      const now = Date.now();
      const activeEntries = Object.entries(parsed as Record<string, number>).filter(
        ([taskId, stoppedAt]) =>
          Boolean(taskId) && Number.isFinite(Number(stoppedAt)) && now - Number(stoppedAt) < STOPPED_TASK_TTL_MS,
      );
      const stoppedTasks = Object.fromEntries(activeEntries);
      localStorage.setItem(STOPPED_TASK_STORAGE_KEY, JSON.stringify(stoppedTasks));
      locallyStoppedTasksCache = stoppedTasks;
    } catch {
      locallyStoppedTasksCache = {};
    }
    return locallyStoppedTasksCache;
  };

  /** 判断 taskId 是否已被本地标记为停止。 */
  const isTaskLocallyStopped = (taskId?: string): boolean =>
    Boolean(taskId && getLocallyStoppedTasks()[taskId]);

  /** 将 taskId 标记为本地已停止。 */
  const markTaskLocallyStopped = (taskId: string) => {
    if (!taskId) return;
    locallyStoppedTasksCache = { ...getLocallyStoppedTasks(), [taskId]: Date.now() };
    try {
      localStorage.setItem(STOPPED_TASK_STORAGE_KEY, JSON.stringify(locallyStoppedTasksCache));
    } catch {}
  };

  /** 将 messageId 标记为本地已停止。 */
  const markMessageLocallyStopped = (messageId?: string | null) => {
    if (messageId) locallyStoppedMessageIds.add(messageId);
  };

  /** 判断 messageId 是否已被本地标记为停止。 */
  const isMessageLocallyStopped = (messageId?: string | null): boolean =>
    Boolean(messageId && locallyStoppedMessageIds.has(messageId));

  /** 清除 messageId 的本地停止标记。 */
  const clearMessageLocallyStopped = (messageId?: string | null) => {
    if (messageId) locallyStoppedMessageIds.delete(messageId);
  };

  // ---- 状态判断工具 ----

  /** 归一化任务状态字符串。 */
  const normalizeTaskStatus = (status?: any): string => String(status || '').toLowerCase();

  /** 判断任务是否为后端终态。 */
  const isTerminalTaskStatus = (status?: string): boolean =>
    TERMINAL_TASK_STATUSES.includes(normalizeTaskStatus(status));

  /** 判断任务是否允许恢复订阅。后端 v12.2.22 会返回 recoverable=false，前端必须尊重。 */
  const isRecoverableTaskStatus = (status?: string): boolean =>
    ACTIVE_TASK_STATUSES.includes(normalizeTaskStatus(status));

  /**
   * 从任意值中提取 recoverable 标志。
   * @returns boolean | undefined（undefined 表示未指定）
   */
  const getRecoverableFlag = (value: any): boolean | undefined => {
    const raw = value?.recoverable ?? value?.taskRecoverable ?? value?.task_recoverable;
    if (raw === undefined || raw === null || raw === '') return undefined;
    if (typeof raw === 'boolean') return raw;
    if (typeof raw === 'number') return raw !== 0;
    if (typeof raw === 'string') {
      const normalized = raw.trim().toLowerCase();
      if (['false', '0', 'no', 'n'].includes(normalized)) return false;
      if (['true', '1', 'yes', 'y'].includes(normalized)) return true;
    }
    return undefined;
  };

  /** 判断是否收到了 stop_requested 标志。 */
  const isStopRequestedFlag = (value: any): boolean => {
    const raw = value?.stopRequested ?? value?.stop_requested ?? value?.stopRequestedFlag ?? value?.stop_requested_flag;
    if (raw === undefined || raw === null || raw === '') return false;
    if (typeof raw === 'boolean') return raw;
    if (typeof raw === 'number') return raw !== 0;
    if (typeof raw === 'string') {
      const normalized = raw.trim().toLowerCase();
      return ['true', '1', 'yes', 'y'].includes(normalized);
    }
    return false;
  };

  /** 综合判断任务是否可恢复（状态 + recoverable 标志 + stop 标志）。 */
  const isTaskRecoverable = (value: any, fallbackStatus?: string): boolean => {
    const status = normalizeTaskStatus(value?.status ?? value?.taskStatus ?? value?.task_status ?? fallbackStatus);
    if (isStopRequestedFlag(value)) return false;
    if (!isRecoverableTaskStatus(status)) return false;
    return getRecoverableFlag(value) !== false;
  };

  // ---- 持久化 ----

  let persistStreamTasksTimer: number | null = null;

  /** 立即将可恢复任务列表写入 localStorage。 */
  const persistStreamTasksNow = () => {
    const runningTasks = Object.fromEntries(
      Object.entries(activeStreamTasks.value).filter(
        ([, task]) => isTaskRecoverable(task),
      ),
    );
    localStorage.setItem(STREAM_TASK_STORAGE_KEY, JSON.stringify(runningTasks));
  };

  /**
   * 持久化任务列表。immediate=true 时立即写入，否则延迟 800ms 合并写入。
   * @param immediate - 是否立即写入
   */
  const persistStreamTasks = (immediate = false) => {
    if (immediate) {
      if (persistStreamTasksTimer) {
        window.clearTimeout(persistStreamTasksTimer);
        persistStreamTasksTimer = null;
      }
      persistStreamTasksNow();
      return;
    }

    if (persistStreamTasksTimer) return;
    persistStreamTasksTimer = window.setTimeout(() => {
      persistStreamTasksTimer = null;
      persistStreamTasksNow();
    }, 800);
  };

  /** 将 functionId → sessionId 映射持久化到 localStorage。 */
  const persistLastActiveSession = (functionId: string, sessionId: string) => {
    if (!functionId || !sessionId) return;
    try {
      const raw = localStorage.getItem(LAST_ACTIVE_SESSION_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      localStorage.setItem(
        LAST_ACTIVE_SESSION_STORAGE_KEY,
        JSON.stringify({ ...parsed, [functionId]: sessionId }),
      );
    } catch {}
  };

  /** 从 localStorage 读取指定功能的最后活跃会话 ID。 */
  const getLastActiveSession = (functionId: string): string => {
    try {
      const raw = localStorage.getItem(LAST_ACTIVE_SESSION_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      return parsed?.[functionId] || '';
    } catch {
      return '';
    }
  };

  /** 从 localStorage 加载已持久化的可恢复任务，过滤掉已停止和不可恢复的任务。 */
  const loadPersistedStreamTasks = () => {
    try {
      const raw = localStorage.getItem(STREAM_TASK_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      if (!parsed || typeof parsed !== 'object') return;

      activeStreamTasks.value = Object.fromEntries(
        Object.entries(parsed as Record<string, ResumableStreamTask>).filter(
          ([, task]) =>
            task?.taskId &&
            task?.sessionId &&
            !isTaskLocallyStopped(task.taskId) &&
            isTaskRecoverable(task),
        ),
      );
    } catch {
      activeStreamTasks.value = {};
    }
  };

  // ---- 任务 CRUD ----

  /** 插入或更新任务，并触发持久化。 */
  const upsertStreamTask = (task: ResumableStreamTask, immediatePersist = false) => {
    activeStreamTasks.value = {
      ...activeStreamTasks.value,
      [task.taskId]: {
        ...task,
        updatedAt: Date.now(),
      },
    };
    persistStreamTasks(immediatePersist);
  };

  /** 从活跃任务列表中移除指定任务。 */
  const removeStreamTask = (taskId: string) => {
    if (!activeStreamTasks.value[taskId]) return;
    const next = { ...activeStreamTasks.value };
    delete next[taskId];
    activeStreamTasks.value = next;
    persistStreamTasks(true);
  };

  /** 获取指定会话的可恢复任务。 */
  const getTaskBySessionId = (sessionId?: string): ResumableStreamTask | null => {
    if (!sessionId) return null;
    return (
      Object.values(activeStreamTasks.value).find(
        (task) => task.sessionId === sessionId && isTaskRecoverable(task),
      ) || null
    );
  };

  /** 获取当前激活会话的运行中任务。 */
  const getCurrentActiveRunningTask = (): ResumableStreamTask | null =>
    getTaskBySessionId(activeChatId.value);

  /** 确认用户操作并返回是否继续（当前会话有运行中任务时弹出确认框）。 */
  const confirmLeaveStreamingIfNeeded = async (actionText = '离开当前会话'): Promise<boolean> => {
    const runningTask = getCurrentActiveRunningTask();
    if (!runningTask) return true;

    try {
      await ElMessageBox.confirm(
        `当前会话仍在生成中，${actionText}不会中断后台任务，但可能需要稍后再切回来恢复查看。建议等待当前回答完成后再操作。是否仍要继续？`,
        '当前会话正在输出',
        {
          confirmButtonText: '继续操作',
          cancelButtonText: '留在当前会话',
          type: 'warning',
          distinguishCancelAndClose: true,
        },
      );
      return true;
    } catch {
      return false;
    }
  };

  /** 获取指定会话的任意任务（不限于可恢复）。 */
  const getAnyTaskBySessionId = (sessionId?: string): ResumableStreamTask | null => {
    if (!sessionId) return null;
    return (
      Object.values(activeStreamTasks.value).find((task) => task.sessionId === sessionId) || null
    );
  };

  /** 获取指定 messageId 对应的任务。 */
  const getTaskByMessageId = (messageId?: string | null): ResumableStreamTask | null => {
    if (!messageId) return null;
    return (
      Object.values(activeStreamTasks.value).find(
        (task) => task.messageId === messageId || task.qaId === messageId,
      ) || null
    );
  };

  // ---- 事件游标工具 ----

  /** 将任意值转换为安全的事件 ID（正整数或 0）。 */
  const toSafeEventId = (value: any): number => {
    const num = Number(value || 0);
    return Number.isFinite(num) && num > 0 ? num : 0;
  };

  /** 从任务快照中获取 answerEventId。 */
  const getTaskAnswerEventId = (task: Partial<ResumableStreamTask> | null | undefined): number =>
    toSafeEventId(task?.answerEventId);

  /** 从 task detail 响应中获取 answerEventId。 */
  const getDetailAnswerEventId = (detail: any): number =>
    toSafeEventId(detail?.answerEventId ?? detail?.answer_event_id ?? detail?.answerContentEventId ?? detail?.answer_content_event_id);

  /** 从 task detail 响应中获取 lastEventId。 */
  const getDetailLastEventId = (detail: any): number =>
    toSafeEventId(detail?.lastEventId ?? detail?.last_event_id ?? detail?.eventCount ?? detail?.streamEventCount);

  /** 从消息对象中获取 answerEventId。 */
  const getMessageAnswerEventId = (message: any): number =>
    toSafeEventId(message?.answerEventId ?? message?.answer_event_id ?? message?.answerContentEventId ?? message?.answer_content_event_id);

  /** 判断是否应使用后端 answerContent 快照（后端内容更长或本地为空时）。 */
  const shouldUseServerAnswerSnapshot = (serverContent: string, localContent = ''): boolean => {
    if (!serverContent) return false;
    if (!localContent) return true;
    return serverContent.length >= localContent.length;
  };

  // ---- 会话消息同步 ----

  /** 确保本地有对应会话，若没有则创建空会话并填充 user + assistant 占位消息。 */
  const ensureLocalSessionForTask = (task: ResumableStreamTask): ChatSession | null => {
    let session = chatStore.getChatSession(task.sessionId);
    const tabName = task.tabName || getTabByFunctionId(task.functionId);
    const createdAt = task.createdAt || task.updatedAt || Date.now();
    const title =
      task.title ||
      (task.userContent
        ? task.userContent.length > 20
          ? `${task.userContent.substring(0, 20)}...`
          : task.userContent
        : tabName);

    if (!session) {
      const newSession: ChatSession = {
        id: task.sessionId,
        title,
        time: createdAt,
        type: tabName as any,
        messages: [],
        menuType: tabName,
        conversationUuid: task.sessionId,
        preview: task.userContent || '生成中',
      };
      chatStore.addChatSession(newSession);
      chatStore.addHistoryItem({
        id: task.sessionId,
        title,
        time: createdAt,
        type: tabName as any,
        preview: task.userContent || '生成中',
        menuType: tabName,
        isCollected: false,
      });
      session = newSession;
    }

    if (!session.messages || session.messages.length === 0) {
      session.messages = [
        {
          id: `user_${task.qaId}`,
          role: 'user',
          content: task.userContent || '正在恢复上一条提问...',
          timestamp: createdAt as any,
          vote: null,
          metadata: task.metadata,
        },
        {
          id: task.messageId,
          role: 'assistant',
          content: sanitizeAgentText(stripReviewProgressText(task.answerContent || '', { functionId: task.functionId, tabName })),
          reasoning: task.reasoningContent || '',
          timestamp: createdAt as any,
          streaming: isTaskRecoverable(task),
          taskId: task.taskId,
          taskStatus: task.status,
          taskRecoverable: isTaskRecoverable(task),
          streamEventId: task.lastEventId || 0,
          answerEventId: task.answerEventId || 0,
          sources: task.sources || [],
          metadata: task.metadata,
        },
      ];
    }

    return session;
  };

  /**
   * 更新任务对应的会话消息，并同步当前 UI 状态。
   * 当更新的是当前激活会话时，同步 isStreaming / currentAnswer / currentReasoning。
   */
  const updateTaskMessage = (
    task: ResumableStreamTask,
    updates: Partial<ChatMessage> & { status?: string; eventId?: number; answerEventId?: number; recoverable?: boolean } = {},
  ) => {
    const session = chatStore.getChatSession(task.sessionId) || ensureLocalSessionForTask(task);
    if (!session) return;

    const message = session.messages.find(
      (item: any) =>
        item.id === task.messageId || item.id === task.qaId || item.taskId === task.taskId,
    ) as ChatMessage | undefined;
    if (!message) return;

    message.id = task.messageId;
    message.taskId = task.taskId;
    message.taskStatus = updates.status || task.status;
    (message as any).taskRecoverable = updates.recoverable ?? task.recoverable ?? isTaskRecoverable(task);
    message.streamEventId = updates.eventId ?? task.lastEventId;
    (message as any).answerEventId = updates.answerEventId ?? task.answerEventId ?? (message as any).answerEventId ?? 0;
    message.streaming = isTaskRecoverable({ ...task, status: message.taskStatus, recoverable: (message as any).taskRecoverable });

    if (typeof updates.content === 'string') {
      message.content = stripReviewProgressText(updates.content, { functionId: task.functionId, tabName: task.tabName });
    }
    if (typeof updates.reasoning === 'string') message.reasoning = updates.reasoning;
    if (Object.prototype.hasOwnProperty.call(updates, 'sources')) message.sources = updates.sources as any;
    if (task.metadata && !message.metadata) message.metadata = task.metadata as any;

    if (activeChatId.value === task.sessionId) {
      currentStreamingMessageId.value = message.streaming ? task.messageId : null;
      isStreaming.value = Boolean(message.streaming);
      currentAnswer.value = message.content || '';
      currentReasoning.value = message.reasoning || '';
    }
  };

  /** 同步当前 UI 与任务状态（恢复会话时调用）。 */
  const syncCurrentStreamUi = () => {
    const task = getTaskBySessionId(activeChatId.value);
    if (!task) {
      isStreaming.value = false;
      currentStreamingMessageId.value = null;
      currentReasoning.value = '';
      currentAnswer.value = '';
      return;
    }

    const session = chatStore.getChatSession(task.sessionId);
    const message = session?.messages.find(
      (item: any) => item.id === task.messageId || item.taskId === task.taskId,
    );
    isStreaming.value = true;
    currentStreamingMessageId.value = task.messageId;
    currentAnswer.value = stripReviewProgressText(message?.content || '', { functionId: task.functionId, tabName: task.tabName });
    currentReasoning.value = message?.reasoning || '';
  };

  // ---- 重置流式状态 ----

  /** 重置当前流式输出状态（推理、答案、think 缓冲、abortController）。 */
  const resetStreamState = () => {
    currentReasoning.value = '';
    currentAnswer.value = '';
    answerOutputStarted = false;
    answerPendingText = '';
    abortController = null;
  };

  // ---- 订阅控制 ----

  /** 中断当前 SSE 订阅。resetUi=true 时同时重置 UI 状态。 */
  const detachStreamSubscription = (resetUi = true) => {
    if (abortController) {
      abortController.abort();
      abortController = null;
    }
    if (resetUi) {
      isStreaming.value = false;
      currentStreamingMessageId.value = null;
      resetStreamState();
    }
  };

  /** 清理当前会话内旧的本地 active task，避免异常任务继续把错误写入新问题。 */
  const clearLocalActiveTasksForSession = (sessionId?: string, functionId?: string) => {
    if (!sessionId) return;
    const taskIds = Object.values(activeStreamTasks.value)
      .filter((task) => task.sessionId === sessionId && (!functionId || task.functionId === functionId) && isTaskRecoverable(task))
      .map((task) => task.taskId);
    if (taskIds.length === 0) return;

    if (abortController) {
      abortController.abort();
      abortController = null;
    }

    const next = { ...activeStreamTasks.value };
    taskIds.forEach((taskId) => {
      delete next[taskId];
    });
    activeStreamTasks.value = next;
    persistStreamTasks(true);
    isStreaming.value = false;
    currentStreamingMessageId.value = null;
    resetStreamState();
  };

  // ---- 任务详情查询 ----

  /** 查询后端任务详情。 */
  const queryStreamTaskDetail = async (taskId: string): Promise<any> => {
    const response = await authRequest({
      url: API.agent.taskDetail(taskId, getCurrentAgentToken()),
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!isSuccessStatus(response.status)) {
      throw new Error(`任务状态查询失败: ${response.status}`);
    }

    const result = response.data;
    if (!isApiSuccessCode(result?.code)) {
      throw new Error(getApiMessage(result, '任务状态查询失败'));
    }
    return getApiData(result) || {};
  };

  /**
   * 创建 V12 后台工作流任务。
   * @param workflowCode - 工作流编码
   * @param bizParams - 业务参数
   * @param messageId - 消息 ID（用于 qaId）
   * @returns 后端返回的任务数据
   */
  const createWorkflowTask = async (
    workflowCode: string,
    bizParams: Record<string, any>,
    messageId: string,
    buildUnifiedAgentPayload: (workflowCode: string, bizParams: Record<string, any>) => any,
  ): Promise<any> => {
    const response = await authRequest({
      url: API.agent.workflowTask(workflowCode),
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      data: buildUnifiedAgentPayload(workflowCode, { ...bizParams, qaId: messageId }),
    });

    if (!isSuccessStatus(response.status)) {
      throw new Error(`创建流式任务失败: ${response.status}`);
    }

    const result = response.data;
    if (!isApiSuccessCode(result?.code)) {
      throw new Error(getApiMessage(result, '创建流式任务失败'));
    }

    const data = getApiData(result) || {};
    if (!data.taskId) {
      throw new Error('创建流式任务失败：后端未返回 taskId');
    }
    return data;
  };

  // ---- SSE 事件流消费 ----

  /**
   * 读取 SSE ReadableStream，按行解析 data: 前缀的 JSON 并回调。
   * @param stream - ReadableStream
   * @param onData - 每条数据的回调
   */
  const consumeEventStream = async (
    stream: ReadableStream<Uint8Array>,
    onData: (payload: any) => Promise<void>,
  ) => {
    const reader = stream.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    const handleLine = async (line: string) => {
      if (line.trim() === '' || !line.startsWith('data:')) return;
      const data = line.substring(5).trim();
      if (!data || data === '[DONE]') return;
      try {
        await onData(JSON.parse(data));
      } catch (error) {
        if (error instanceof SyntaxError) {
          console.error('解析流数据失败:', error);
        } else {
          throw error;
        }
      }
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        await handleLine(line);
      }
    }

    if (buffer.trim()) {
      await handleLine(buffer);
    }
  };

  // ---- processStreamChunk 回调注入（解决与 useStreamChunk 的循环依赖）----
  let processStreamChunkCallback: ((chunk: any, messageId: string, taskId?: string) => Promise<void>) | null = null;

  /**
   * 设置 processStreamChunk 回调。
   * 由 useAppShell 在初始化 useStreamChunk 后调用，解决循环依赖。
   */
  const setProcessStreamChunk = (fn: (chunk: any, messageId: string, taskId?: string) => Promise<void>) => {
    processStreamChunkCallback = fn;
  };

  /**
   * 订阅指定任务的 SSE 事件流。
   * 自动处理本地会话创建、持久化和 UI 同步。
   *
   * @param taskId - 任务 ID
   * @param options - allowTerminalReplay 允许终态重放；silent 静默模式不弹提示
   */
  const subscribeStreamTask = async (taskId: string, options: { allowTerminalReplay?: boolean; silent?: boolean } = {}) => {
    const task = activeStreamTasks.value[taskId];
    if (!task || activeChatId.value !== task.sessionId) return;
    if (isTaskLocallyStopped(taskId) || isMessageLocallyStopped(task.messageId)) return;
    if (!isTaskRecoverable(task) && !options.allowTerminalReplay) return;

    detachStreamSubscription(false);
    ensureLocalSessionForTask(task);
    persistLastActiveSession(task.functionId, task.sessionId);
    if (!options.silent && !isTerminalTaskStatus(task.status)) {
      resetStreamState();
      syncCurrentStreamUi();
      // 恢复订阅时页面上可能已经有后端 answerContent 或本地缓存内容。
      // 此时后续 token 都是正文续写，不能再走"首次双换行前置内容过滤"。
      if (currentAnswer.value) {
        answerOutputStarted = true;
        answerPendingText = '';
      }
    }

    const controller = new AbortController();
    abortController = controller;

    try {
      const response = await getEventStream(
        API.agent.taskStream(task.taskId, task.lastEventId || 0, getCurrentAgentToken()),
        { signal: controller.signal },
      );

      if (!isSuccessStatus(response.status) || !response.data?.getReader) {
        throw new Error(`任务流订阅失败: ${response.status}`);
      }

      await consumeEventStream(response.data, (payload) =>
        processStreamChunkCallback
          ? processStreamChunkCallback(payload, task.messageId, task.taskId)
          : Promise.resolve(),
      );
    } catch (error: any) {
      if (error?.name !== 'AbortError' && activeStreamTasks.value[taskId]) {
        syncCurrentStreamUi();
        if (!options.silent) {
          ElMessage.warning('当前流式订阅连接中断，任务仍在后台生成，可重新进入会话或刷新后继续恢复');
        }
      }
    } finally {
      if (abortController === controller) {
        abortController = null;
      }
    }
  };

  // ---- 任务恢复 ----

  /** 恢复指定会话的流式任务订阅。先查询 task detail 合并快照，再续订 SSE。 */
  const resumeTaskForSession = async (sessionId: string) => {
    const task = getAnyTaskBySessionId(sessionId);
    if (!task) {
      syncCurrentStreamUi();
      return;
    }

    try {
      const localLastEventId = toSafeEventId(task.lastEventId);
      const localAnswerEventId = getTaskAnswerEventId(task);
      const detail = await queryStreamTaskDetail(task.taskId);
      const status = detail.status || task.status;
      const recoverable = isTaskRecoverable(detail, status);
      const terminal = isTerminalTaskStatus(status) || !recoverable;
      const detailAnswerContent = sanitizeAgentText(stripReviewProgressText(
        typeof detail.answerContent === 'string' ? detail.answerContent : '',
        { functionId: task.functionId, tabName: task.tabName },
      ));
      const localAnswerContent = sanitizeAgentText(stripReviewProgressText(task.answerContent || '', {
        functionId: task.functionId,
        tabName: task.tabName,
      }));
      const detailAnswerEventId = getDetailAnswerEventId(detail);
      const detailLastEventId = getDetailLastEventId(detail);
      const useServerSnapshot = shouldUseServerAnswerSnapshot(detailAnswerContent, localAnswerContent);
      const resumeEventId = useServerSnapshot
        ? (detailAnswerEventId || detailLastEventId || localLastEventId)
        : localLastEventId;
      const mergedAnswerContent = useServerSnapshot ? detailAnswerContent : localAnswerContent;
      const mergedAnswerEventId = useServerSnapshot
        ? (detailAnswerEventId || detailLastEventId || getTaskAnswerEventId(task))
        : (localAnswerEventId || localLastEventId);

      const taskSources = Array.isArray(task.sources) ? task.sources : [];
      const detailSources = extractSourcesFromTaskDetail(detail);
      const mergedSources = mergeTaskDetailSources(taskSources, detailSources, task.functionId);
      const sourcesWereEnriched = mergedSources.length > taskSources.length;

      const mergedTask: ResumableStreamTask = {
        ...task,
        qaId: detail.qaId || task.qaId,
        messageId: detail.qaId || task.messageId,
        status,
        recoverable,
        lastEventId: resumeEventId,
        answerEventId: mergedAnswerEventId,
        updatedAt: Date.now(),
        answerContent: mergedAnswerContent,
        reasoningContent:
          typeof detail.reasoningContent === 'string' ? detail.reasoningContent : task.reasoningContent,
        userContent: detail.questionContent || detail.query || task.userContent,
        title: detail.sessionTitle || detail.title || task.title,
        sources: mergedSources,
        metadata: task.metadata || undefined,
      };

      ensureLocalSessionForTask(mergedTask);
      upsertStreamTask(mergedTask, true);
      updateTaskMessage(mergedTask, {
        content: mergedTask.answerContent,
        reasoning: mergedTask.reasoningContent,
        sources: mergedTask.sources || undefined,
        status: mergedTask.status,
        recoverable: mergedTask.recoverable,
        eventId: resumeEventId,
        answerEventId: mergedAnswerEventId,
      });

      if (terminal && sourcesWereEnriched) {
        void persistCompletedConversationForTask(mergedTask);
      }

      if (terminal) {
        removeStreamTask(mergedTask.taskId);
        syncCurrentStreamUi();
        return;
      }

      await subscribeStreamTask(mergedTask.taskId);
    } catch {
      syncCurrentStreamUi();
    }
  };

  // ---- 停止任务 ----

  /** 调用后端接口停止指定任务。 */
  const stopTaskOnServer = async (taskId: string): Promise<any> => {
    const response = await authRequest({
      url: API.agent.taskStop(taskId, getCurrentAgentToken()),
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!isSuccessStatus(response.status)) {
      throw new Error(`停止任务失败: ${response.status}`);
    }

    const result = response.data;
    if (result?.code !== undefined && !isApiSuccessCode(result.code)) {
      throw new Error(getApiMessage(result, '停止任务失败'));
    }
    return getApiData(result) || result || {};
  };

  // ---- 来源提取与合并 ----

  /**
   * 从任务详情、workflow_finished 或 done 事件中提取结构化结果。
   * 后端 v12.2.7 会把前端断开期间错过的 workflow_finished 结果持久化到
   * data_json / sources / recommendations / templates / workflowOutputs / userFields。
   */
  const extractSourcesFromWorkflowPayload = (payload: any, payloadData: any, chunk?: any): any[] => {
    return extractSourcesFromAny(
      payloadData?.outputs,
      payload?.outputs,
      chunk?.outputs,
      payloadData?.data_json,
      payloadData?.sources,
      payloadData?.recommendations,
      payloadData?.templates,
      payloadData?.workflowOutputs,
      payloadData?.workflow_outputs,
      payloadData?.userFields,
      payloadData?.user_fields,
      payload?.data_json,
      payload?.sources,
      payload?.recommendations,
      payload?.templates,
      payload?.workflowOutputs,
      payload?.workflow_outputs,
      payload?.userFields,
      payload?.user_fields,
      chunk?.data_json,
      chunk?.sources,
      chunk?.recommendations,
      chunk?.templates,
      chunk?.workflowOutputs,
      chunk?.workflow_outputs,
      chunk?.userFields,
      chunk?.user_fields,
      payloadData,
      payload,
      chunk,
    );
  };

  /** 从 task detail 响应中提取来源列表。 */
  const extractSourcesFromTaskDetail = (detail: any): any[] => {
    return extractSourcesFromWorkflowPayload(detail, detail?.payload || detail?.data || detail, detail);
  };

  /** 对任意值生成稳定的 hash 字符串，用于来源去重。 */
  const stableSourceHash = (value: any): string => {
    const text = typeof value === 'string' ? value : JSON.stringify(value ?? '');
    let hash = 0;
    for (let i = 0; i < text.length; i += 1) {
      hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
    }
    return hash.toString(36);
  };

  /**
   * 来源块前端合并键。
   * chunk/段落优先，file_id 只做兜底，避免同一文件多个检索块刷新后被压成一个。
   */
  const buildSourceMergeKey = (item: any, index = 0): string => {
    if (!item || typeof item !== 'object') return `raw:${stableSourceHash(item)}:${index}`;
    const directKey =
      item.chunk_id || item.chunkId || item.segment_id || item.segmentId ||
      item.paragraph_id || item.paragraphId || item.passage_id || item.passageId ||
      item.slice_id || item.sliceId || item.node_id || item.nodeId;
    if (directKey) return `chunk:${directKey}`;

    const fileKey = item.file_id || item.fileId || item.doc_id || item.docId || item.document_id || item.documentId || item.file_name || item.fileName || item.title || '';
    const pageKey = item.page || item.page_no || item.pageNo || item.page_num || item.pageNum || '';
    const positionKey = item.position || item.offset || item.start || item.start_index || item.startIndex || '';
    const textKey = item.content || item.text || item.snippet || item.summary || item.paragraph || item.answer || '';
    if (fileKey && textKey) return `file-text:${fileKey}:${pageKey}:${positionKey}:${stableSourceHash(String(textKey).slice(0, 800))}`;
    if (item.id || item.source_id || item.sourceId) return `id:${item.id || item.source_id || item.sourceId}`;
    if (fileKey && (pageKey || positionKey)) return `file-pos:${fileKey}:${pageKey}:${positionKey}`;
    if (fileKey) return `file:${fileKey}`;
    return `json:${stableSourceHash(item)}:${index}`;
  };

  /** 合并多个来源列表，基于合并键去重。 */
  const mergeSourceItems = (...lists: any[][]): any[] => {
    const seen = new Set<string>();
    const result: any[] = [];
    lists.forEach((list) => {
      if (!Array.isArray(list)) return;
      list.forEach((item, index) => {
        const key = buildSourceMergeKey(item, index);
        if (seen.has(key)) return;
        seen.add(key);
        result.push(item);
      });
    });
    return result;
  };

  /**
   * 合并本地来源和 task detail 来源。
   * 检索场景优先保留后端完整块顺序；其它功能保持本地展示顺序，只补缺失项。
   */
  const mergeTaskDetailSources = (localSources: any[] = [], detailSources: any[] = [], functionId?: string): any[] => {
    if (!Array.isArray(detailSources) || detailSources.length === 0) return Array.isArray(localSources) ? localSources : [];
    if (!Array.isArray(localSources) || localSources.length === 0) return detailSources;
    return functionId === 'search' && detailSources.length >= localSources.length
      ? mergeSourceItems(detailSources, localSources)
      : mergeSourceItems(localSources, detailSources);
  };

  // ---- 事件判断 ----

  /** 判断 SSE 事件是否为 workflow_finished。 */
  const isWorkflowFinishedEvent = (eventType?: string, payloadEvent?: string, payload?: any): boolean => {
    const values = [eventType, payloadEvent, payload?.event, payload?.event_type, payload?.data?.event]
      .map((item) => String(item || '').toLowerCase());
    return values.some((item) => item === 'workflow_finished' || item === 'workflow-finished');
  };

  // ---- 任务持久化（完成会话保存）----

  /** 获取任务对应的 functionId。 */
  const getFunctionIdForTask = (task: ResumableStreamTask): string => {
    if (task.functionId) return task.functionId;
    return chatStore.getFuncIdByTab(task.tabName || activeTab.value);
  };

  /**
   * 将已完成任务的会话持久化到后端。
   * 通过签名去重，避免同一任务重复保存。
   * @returns true 表示保存成功
   */
  const persistCompletedConversationForTask = async (task: ResumableStreamTask): Promise<boolean> => {
    const session = chatStore.getChatSession(task.sessionId);
    if (!session?.messages?.length) return false;

    const assistantMessage = session.messages.find(
      (message: any) => message.role === 'assistant' && (message.id === task.messageId || message.id === task.qaId || message.taskId === task.taskId),
    ) as ChatMessage | undefined;
    if (!assistantMessage) return false;

    const assistantIndex = session.messages.findIndex((message: any) => message === assistantMessage);
    const userMessage = [...session.messages.slice(0, assistantIndex)]
      .reverse()
      .find((message: any) => message.role === 'user') as ChatMessage | undefined;
    if (!userMessage) return false;

    if (task.metadata && !assistantMessage.metadata) assistantMessage.metadata = task.metadata as any;
    if (task.sources && task.sources.length > 0) assistantMessage.sources = task.sources as any;
    if (task.answerContent && !assistantMessage.content) {
      assistantMessage.content = stripReviewProgressText(task.answerContent, { functionId: task.functionId, tabName: task.tabName });
    }
    assistantMessage.content = stripReviewProgressText(assistantMessage.content || '', {
      functionId: task.functionId,
      tabName: task.tabName,
    });
    if (task.reasoningContent && !assistantMessage.reasoning) assistantMessage.reasoning = task.reasoningContent;

    const signature = JSON.stringify({
      status: assistantMessage.taskStatus || task.status,
      content: assistantMessage.content || '',
      sourcesCount: assistantMessage.sources?.length || 0,
      metadata: assistantMessage.metadata || null,
    });
    if (completedTaskSaveSignatures.get(task.taskId) === signature) return true;

    const result = await chatStore.saveConversationToServer(
      task.sessionId,
      task.qaId || assistantMessage.id,
      userMessage,
      assistantMessage,
      assistantMessage.vote === 'like' ? 1 : 0,
      assistantMessage.vote === 'dislike' ? 1 : 0,
      getFunctionIdForTask(task),
    );
    if (result.success) {
      completedTaskSaveSignatures.set(task.taskId, signature);
    }
    return result.success;
  };

  // ---- 任务注册 ----

  /**
   * 从会话消息历史中注册可恢复任务。
   * 智能检索场景允许对 completed/未知状态只查询 task detail 补全 sources。
   */
  const registerRecoverableTaskFromSession = (sessionId: string) => {
    const session = chatStore.getChatSession(sessionId);
    if (!session) return;
    const functionId = chatStore.getFuncIdByTab((session as any).menuType || activeTab.value);
    const assistantMessages = session.messages.filter((message: any) => message.role === 'assistant' && message.taskId);
    const isSearchFunction = functionId === 'search';
    const candidate = [...assistantMessages].reverse().find((message: any) => {
      if (isTaskLocallyStopped(message.taskId)) return false;
      const status = normalizeTaskStatus(message.taskStatus);
      const messageRecoverable = getRecoverableFlag(message) !== false;
      if (isRecoverableTaskStatus(status) && messageRecoverable) return true;
      return isSearchFunction && (status === 'completed' || status === '');
    }) as any;
    if (!candidate || activeStreamTasks.value[candidate.taskId]) return;
    const messageIndex = session.messages.findIndex((item: any) => item.id === candidate.id);
    const userMessage = messageIndex > 0 ? session.messages[messageIndex - 1] : null;
    upsertStreamTask(
      {
        taskId: candidate.taskId,
        sessionId,
        qaId: candidate.id,
        messageId: candidate.id,
        functionId,
        tabName: (session as any).menuType || activeTab.value,
        status: candidate.taskStatus || 'completed',
        recoverable: getRecoverableFlag(candidate),
        lastEventId: Array.isArray(candidate.sources) && candidate.sources.length > 0 ? Number(candidate.streamEventId || 0) : 0,
        answerEventId: getMessageAnswerEventId(candidate),
        updatedAt: Date.now(),
        createdAt: Number(userMessage?.timestamp || candidate.timestamp || Date.now()),
        title: session.title,
        userContent: userMessage?.content || '',
        answerContent: sanitizeAgentText(stripReviewProgressText(candidate.content || '', { functionId, tabName: (session as any).menuType || activeTab.value })),
        reasoningContent: candidate.reasoning || '',
        sources: candidate.sources || [],
        metadata: candidate.metadata || userMessage?.metadata || undefined,
      },
      true,
    );
  };

  /** 从会话消息历史中注册所有运行中任务。 */
  const registerRunningTasksFromSession = (sessionId: string) => {
    const session = chatStore.getChatSession(sessionId);
    if (!session) return;

    session.messages
      .filter(
        (message: any) =>
          message.role === 'assistant' &&
          message.taskId &&
          !isTaskLocallyStopped(message.taskId) &&
          isTaskRecoverable(message, message.taskStatus),
      )
      .forEach((message: any) => {
        const messageIndex = session.messages.findIndex((item: any) => item.id === message.id);
        const userMessage = messageIndex > 0 ? session.messages[messageIndex - 1] : null;
        const functionId = chatStore.getFuncIdByTab((session as any).menuType || activeTab.value);
        upsertStreamTask(
          {
            taskId: message.taskId,
            sessionId,
            qaId: message.id,
            messageId: message.id,
            functionId,
            tabName: (session as any).menuType || activeTab.value,
            status: message.taskStatus || 'running',
            recoverable: getRecoverableFlag(message),
            lastEventId: Number(message.streamEventId || 0),
            answerEventId: getMessageAnswerEventId(message),
            updatedAt: Date.now(),
            createdAt: Number(userMessage?.timestamp || message.timestamp || Date.now()),
            title: session.title,
            userContent: userMessage?.content || '',
            answerContent: sanitizeAgentText(stripReviewProgressText(message.content || '', { functionId, tabName: (session as any).menuType || activeTab.value })),
            reasoningContent: message.reasoning || '',
            sources: message.sources || [],
            metadata: message.metadata || userMessage?.metadata || undefined,
          },
          true,
        );
      });
  };

  // ---- 获取最新可恢复任务 ----

  /** 获取指定功能最新的非终态可恢复任务。 */
  const getLatestResumableTaskForFunction = (functionId: string): ResumableStreamTask | null =>
    Object.values(activeStreamTasks.value)
      .filter((task) => task.functionId === functionId && !isTerminalTaskStatus(task.status))
      .sort((a, b) => b.updatedAt - a.updatedAt)[0] || null;

  /** 获取待处理的停止同步 Promise。 */
  const getPendingStopSyncPromise = (): Promise<void> | null => pendingStopSyncPromise;

  /** 设置待处理的停止同步 Promise。 */
  const setPendingStopSyncPromise = (promise: Promise<void> | null) => {
    pendingStopSyncPromise = promise;
  };

  /** 获取 answerOutputStarted / answerPendingText 状态（供 useStreamChunk 使用）。 */
  const getStreamDisplayState = () => ({ answerOutputStarted, answerPendingText });
  const setStreamDisplayState = (started: boolean, pending: string) => {
    answerOutputStarted = started;
    answerPendingText = pending;
  };

  /** 仅中断当前 AbortController（不重置 UI 状态），供 stopStream 使用。 */
  const abortStreamController = () => {
    if (abortController) {
      abortController.abort();
    }
  };

  return {
    // 响应式状态
    activeStreamTasks,
    sourceOnlyReplayTaskIds,
    // 本地停止管理
    isTaskLocallyStopped,
    markTaskLocallyStopped,
    markMessageLocallyStopped,
    isMessageLocallyStopped,
    clearMessageLocallyStopped,
    // 状态判断
    normalizeTaskStatus,
    isTerminalTaskStatus,
    isRecoverableTaskStatus,
    getRecoverableFlag,
    isStopRequestedFlag,
    // 持久化
    persistStreamTasks,
    persistLastActiveSession,
    getLastActiveSession,
    loadPersistedStreamTasks,
    persistCompletedConversationForTask,
    // 任务 CRUD
    upsertStreamTask,
    removeStreamTask,
    getTaskBySessionId,
    getCurrentActiveRunningTask,
    getTaskByMessageId,
    getLatestResumableTaskForFunction,
    // 事件游标工具
    toSafeEventId,
    // 会话消息同步
    ensureLocalSessionForTask,
    updateTaskMessage,
    // 流式状态
    resetStreamState,
    detachStreamSubscription,
    clearLocalActiveTasksForSession,
    getStreamDisplayState,
    setStreamDisplayState,
    // 任务创建与订阅
    createWorkflowTask,
    subscribeStreamTask,
    setProcessStreamChunk,
    // 任务恢复
    resumeTaskForSession,
    // 停止
    stopTaskOnServer,
    confirmLeaveStreamingIfNeeded,
    // 来源处理
    extractSourcesFromWorkflowPayload,
    isWorkflowFinishedEvent,
    // 任务注册
    registerRecoverableTaskFromSession,
    registerRunningTasksFromSession,
    // pendingStopSync
    getPendingStopSyncPromise,
    setPendingStopSyncPromise,
    // 中断控制器（供 stopStream 使用）
    abortStreamController,
  };
};
