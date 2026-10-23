/**
 * 流式数据块处理组合函数。
 *
 * 负责 SSE 流式数据块的解析、think 标签过滤、文本追加、
 * 流完成/错误处理和用户主动停止逻辑。
 * 最终正文以服务端快照为准，增量按任务事件游标去重。
 */
import { nextTick, type Ref } from 'vue';
import { stripReviewProgressText } from '@/services/reviewProgress';
import {
  containsUpstreamErrorText,
  getFrontendFallbackErrorMessage,
  sanitizeAgentText,
  toUserSafeAgentErrorMessage,
} from '@/services/errorSanitizer';
import { getApiMessage, isApiSuccessCode } from '@/services/response';
import type { ResumableStreamTask } from './useStreamTask';

/** useStreamChunk 的依赖注入参数。 */
interface UseStreamChunkDeps {
  /** Chat store */
  chatStore: any;
  /** 当前激活会话 ID */
  activeChatId: Ref<string>;
  /** 当前激活 Tab 名称 */
  activeTab: Ref<string>;
  /** 当前会话 UUID */
  currentConversationUuid: Ref<string>;
  /** 是否正在流式输出 */
  isStreaming: Ref<boolean>;
  /** 当前流式回答内容 */
  currentAnswer: Ref<string>;
  /** 当前推理内容 */
  currentReasoning: Ref<string>;
  /** 当前流式消息 ID */
  currentStreamingMessageId: Ref<string | null>;
  /** 滚动到底部方法 */
  scrollToBottom: () => void;
  /** useStreamTask 的返回值，提供任务管理方法 */
  streamTask: any;
}

/** 可能的 think 标签前缀 */
const POSSIBLE_THINK_PREFIX = '<think';

/** 判断字符串是否可能是 think 标签前缀（用于缓冲等待完整标签）。 */
const isPossibleThinkTagPrefix = (value: string) => {
  const normalized = value.trimStart().toLowerCase();
  if (!normalized) return true;
  return POSSIBLE_THINK_PREFIX.startsWith(normalized) || normalized.startsWith(POSSIBLE_THINK_PREFIX);
};

/**
 * 解析初始流式文本缓冲区，过滤 think 标签内容。
 * 如果检测到 <think> 标签且未闭合，返回 ready=false 等待更多数据。
 * 如果没有 think 标签或已闭合，返回 ready=true 和过滤后的文本。
 */
const resolveInitialStreamDisplayText = (buffer: string) => {
  const openMatch = /<think\b[^>]*>/i.exec(buffer);
  if (openMatch) {
    const closeMatch = /<\/think>/i.exec(buffer.slice(openMatch.index + openMatch[0].length));
    if (!closeMatch) {
      return { ready: false, displayText: '' };
    }
    const closeEnd = openMatch.index + openMatch[0].length + closeMatch.index + closeMatch[0].length;
    return { ready: true, displayText: buffer.slice(closeEnd) };
  }

  if (isPossibleThinkTagPrefix(buffer)) {
    return { ready: false, displayText: '' };
  }

  return { ready: true, displayText: buffer };
};

/** 获取统一的智能体错误兜底文案。 */
const getSafeAgentErrorMessage = () => getFrontendFallbackErrorMessage();

/** 将错误信息转换为用户安全的展示文案。 */
const toUserSafeErrorMessage = (errorOrMessage: any, fallback = getSafeAgentErrorMessage()) =>
  toUserSafeAgentErrorMessage(errorOrMessage, fallback);

/** 区分“没有正文快照”和“正文为空”；空检索结果也可以是合法最终结果。 */
const readAnswerSnapshot = (chunk: any, payload: any, data: any): string | undefined => {
  const candidates = [
    chunk.answerContent, payload.answerContent, data.answerContent,
    data.outputs?.responseContent, data.outputs?.answer,
    payload.outputs?.responseContent, payload.outputs?.answer,
    data.responseContent, data.answer, payload.responseContent, payload.answer,
  ];
  return candidates.find((value) => typeof value === 'string');
};

/** useStreamChunk 组合函数。 */
export const useStreamChunk = (deps: UseStreamChunkDeps) => {
  const {
    chatStore,
    activeChatId,
    activeTab,
    currentConversationUuid,
    isStreaming,
    currentAnswer,
    currentReasoning,
    currentStreamingMessageId,
    scrollToBottom,
    streamTask,
  } = deps;

  // 从 streamTask 解构所需方法
  const {
    activeStreamTasks,
    sourceOnlyReplayTaskIds,
    isTaskLocallyStopped,
    markTaskLocallyStopped,
    markMessageLocallyStopped,
    isMessageLocallyStopped,
    clearMessageLocallyStopped,
    normalizeTaskStatus,
    isTerminalTaskStatus,
    isRecoverableTaskStatus,
    getRecoverableFlag,
    isStopRequestedFlag,
    toSafeEventId,
    upsertStreamTask,
    removeStreamTask,
    getTaskByMessageId,
    updateTaskMessage,
    persistCompletedConversationForTask,
    extractSourcesFromWorkflowPayload,
    isWorkflowFinishedEvent,
    resetStreamState,
    abortStreamController,
    stopTaskOnServer,
    getStreamDisplayState,
    setStreamDisplayState,
    getPendingStopSyncPromise,
    setPendingStopSyncPromise,
  } = streamTask;

  /** 旧任务只能更新自己的消息，不能操作另一轮回答的全局缓冲区。 */
  const ownsDisplay = (messageId: string, task?: ResumableStreamTask) =>
    (!task || task.sessionId === activeChatId.value) &&
    (!currentStreamingMessageId.value || currentStreamingMessageId.value === messageId);

  // ---- Think 标签处理 ----

  /**
   * 将流式文本追加到当前回答中，处理 think 标签过滤和审查进度文本清理。
   * 首次输出前会缓冲等待 think 标签闭合，确保用户只看到正式回答内容。
   */
  const appendModelOutputText = (
    text: string,
    messageId: string,
    context?: { functionId?: string; tabName?: string },
  ) => {
    if (!text) return;
    if (isMessageLocallyStopped(messageId)) return;
    const targetChat = chatStore.getChatSession(activeChatId.value!);
    const targetMessage = targetChat?.messages.find((m: any) => m.id === messageId);
    if (normalizeTaskStatus(targetMessage?.taskStatus) === 'stopped' || targetMessage?.streaming === false && (targetMessage as any)?.taskRecoverable === false) return;
    if (containsUpstreamErrorText(text)) {
      throw new Error(getSafeAgentErrorMessage());
    }

    let displayText = sanitizeAgentText(text);

    // 首次展示前先判断是否存在 <think>...</think>，仅展示 </think> 之后的正式内容；
    // 如果没有 think 标签，则不再用首个双换行粗暴截断，避免误删正文标题。
    const { answerOutputStarted, answerPendingText: currentPendingText } = getStreamDisplayState();
    let answerPendingText = currentPendingText;
    if (!answerOutputStarted) {
      answerPendingText += text;
      const resolved = resolveInitialStreamDisplayText(answerPendingText);
      if (!resolved.ready) {
        setStreamDisplayState(answerOutputStarted, answerPendingText);
        return;
      }
      setStreamDisplayState(true, '');
      displayText = sanitizeAgentText(resolved.displayText);
    } else {
      // already started, just use displayText as-is
    }

    currentAnswer.value += displayText;
    currentAnswer.value = sanitizeAgentText(stripReviewProgressText(currentAnswer.value, context));
    const chat = chatStore.getChatSession(activeChatId.value!);
    if (chat) {
      const msg = chat.messages.find((m: any) => m.id === messageId);
      if (msg) msg.content = currentAnswer.value;
    }

    void nextTick().then(() => { if (ownsDisplay(messageId)) scrollToBottom(); });
  };

  /**
   * 刷新尚未输出的待处理文本（think 标签缓冲区）。
   * 在流式完成时调用，确保所有缓冲内容都被输出。
   */
  const flushPendingModelOutput = (
    messageId: string,
    context?: { functionId?: string; tabName?: string },
  ) => {
    const { answerOutputStarted, answerPendingText } = getStreamDisplayState();
    if (answerOutputStarted || !answerPendingText) return;

    const resolved = resolveInitialStreamDisplayText(answerPendingText);
    setStreamDisplayState(true, '');
    currentAnswer.value += resolved.ready ? resolved.displayText : '';
    currentAnswer.value = sanitizeAgentText(stripReviewProgressText(currentAnswer.value, context));

    const chat = chatStore.getChatSession(activeChatId.value!);
    if (chat) {
      const msg = chat.messages.find((m: any) => m.id === messageId);
      if (msg) msg.content = currentAnswer.value;
    }
  };

  // ---- Chunk 处理 ----

  /**
   * 处理单个 SSE 流式数据块。
   * 兼容 V12 包装格式和旧 AgentArts 原始格式，
   * 处理任务状态更新、推理内容、正式回答、来源提取和完成事件。
   */
  const processStreamChunk = async (chunk: any, messageId: string, taskId?: string) => {
    if (taskId && (!activeStreamTasks.value[taskId] || activeStreamTasks.value[taskId].messageId !== messageId)) return;
    // V12 后端会将每条 SSE data 包装为 { code,msg,request_id,trace_id,data }；
    // 这里先解包，兼容旧 AgentArts 原始 event 格式。
    if (chunk && Object.prototype.hasOwnProperty.call(chunk, 'code')) {
      if (!isApiSuccessCode(chunk.code)) {
        console.error('智能体 SSE 包装响应异常，已使用统一兜底文案展示:', getApiMessage(chunk, '智能体响应异常'), chunk);
        handleStreamError(messageId, getSafeAgentErrorMessage(), taskId);
        return;
      }
      chunk = chunk.data || {};
    }

    if (taskId) {
      if (isTaskLocallyStopped(taskId) || isMessageLocallyStopped(messageId)) return;
      const task = activeStreamTasks.value[taskId];
      if (!task || task.messageId !== messageId || (chunk.taskId && chunk.taskId !== taskId)) return;
      if (!ownsDisplay(messageId, task)) return;

      const payload = chunk.payload || {};
      const payloadData = payload.data || {};
      const eventId = toSafeEventId(chunk.eventId);
      const incomingAnswerEventId = toSafeEventId(
        chunk.answerEventId ?? chunk.answer_event_id ?? payload.answerEventId ??
          payload.answer_event_id ?? payloadData.answerEventId ?? payloadData.answer_event_id,
      );
      const payloadEvent = payload.event || payload.event_type || '';
      const eventType = chunk.eventType || payloadEvent || '';
      const workflowFinished = isWorkflowFinishedEvent(eventType, payloadEvent, payload);
      const incomingStatus = normalizeTaskStatus(chunk.status || payload.status || eventType);
      const chunkStopRequested = isStopRequestedFlag(chunk) || isStopRequestedFlag(payload) || isStopRequestedFlag(payloadData);
      if (incomingStatus === 'stopped' || chunkStopRequested) {
        markTaskLocallyStopped(taskId);
        updateTaskMessage({ ...task, status: 'stopped', recoverable: false }, { status: 'stopped', recoverable: false });
        removeStreamTask(taskId);
        isStreaming.value = false;
        currentStreamingMessageId.value = null;
        resetStreamState();
        return;
      }

      // 只按游标去重，不能按文本内容去重（正文中允许相同句子）。
      // 在任何异步操作前提交游标，重放/并发到达的相同事件不会重复追加。
      const isNewEvent = !eventId || eventId > toSafeEventId(task.lastEventId);
      const chunkRecoverableFlag = getRecoverableFlag(chunk) ?? getRecoverableFlag(payload) ?? getRecoverableFlag(payloadData);
      const status = chunk.status || payload.status || (eventType === 'completed' ? 'completed' : task.status);
      let nextTask: ResumableStreamTask = {
        ...task,
        status,
        recoverable: chunkRecoverableFlag ?? task.recoverable ?? isRecoverableTaskStatus(status),
        awaitingDone: eventType === 'completed' || Boolean(task.awaitingDone && eventType !== 'done'),
        lastEventId: Math.max(eventId, toSafeEventId(task.lastEventId)),
        updatedAt: Date.now(),
      };
      upsertStreamTask(nextTask);

      const reasoningText = payloadData.reasoning_content || payload.reasoning_content || '';
      if (reasoningText && isNewEvent && !task.finalAnswerReceived && !sourceOnlyReplayTaskIds.has(taskId)) {
        nextTask = { ...nextTask, reasoningContent: (task.reasoningContent || '') + reasoningText };
      }
      const text = typeof chunk.content === 'string'
        ? chunk.content : payloadData.text || payloadData.content || payload.text || payload.content || '';
      if (text && isNewEvent && !task.finalAnswerReceived && !sourceOnlyReplayTaskIds.has(taskId)) {
        if (containsUpstreamErrorText(text)) {
          handleStreamError(messageId, getSafeAgentErrorMessage(), taskId);
          return;
        }
        currentAnswer.value = task.answerContent || '';
        appendModelOutputText(text, messageId, { functionId: task.functionId, tabName: task.tabName });
        nextTask = { ...nextTask, answerContent: currentAnswer.value, answerEventId: eventId || task.answerEventId || 0 };
      }

      const terminal = eventType === 'done' || isTerminalTaskStatus(chunk.status || eventType);
      if (workflowFinished || terminal) {
        // 来源补放可以经过旧游标，因此不要因文本去重而丢弃 data_json 等结构化结果。
        const sources = extractSourcesFromWorkflowPayload(payload, payloadData, chunk);
        if (sources.length) nextTask = { ...nextTask, sources };
        const snapshot = readAnswerSnapshot(chunk, payload, payloadData);
        const snapshotEventId = incomingAnswerEventId || eventId;
        const snapshotIsCurrent = !snapshotEventId || snapshotEventId >= toSafeEventId(task.answerEventId);
        if (snapshot !== undefined && snapshotIsCurrent && !sourceOnlyReplayTaskIds.has(taskId)) {
          if (containsUpstreamErrorText(snapshot)) {
            handleStreamError(messageId, getSafeAgentErrorMessage(), taskId);
            return;
          }
          const content = sanitizeAgentText(stripReviewProgressText(snapshot, { functionId: task.functionId, tabName: task.tabName }));
          nextTask = { ...nextTask, answerContent: content, answerEventId: snapshotEventId || nextTask.answerEventId || 0, finalAnswerReceived: true };
          // 最终快照可比临时正文短、不同或为空，不能用长度作为覆盖条件。
          setStreamDisplayState(true, '');
        }
      }
      upsertStreamTask(nextTask, workflowFinished || terminal);
      updateTaskMessage(nextTask, {
        status: nextTask.status, recoverable: nextTask.recoverable,
        eventId: nextTask.lastEventId, answerEventId: nextTask.answerEventId,
        content: nextTask.answerContent, reasoning: nextTask.reasoningContent, sources: nextTask.sources,
      });
      if (reasoningText) void nextTick().then(() => { if (ownsDisplay(messageId, task)) scrollToBottom(); });

      if (eventType === 'error' || incomingStatus === 'error') {
        handleStreamError(messageId, getSafeAgentErrorMessage(), taskId);
        return;
      }
      // completed 是状态通知；done 才携带本轮最终快照，不能提前移除任务。
      // completed 后关闭连接的旧服务，由订阅层补查详情后合成 done。
      if (terminal && eventType !== 'completed') {
        await finishStream(messageId, taskId, eventType === 'done' ? (chunk.status || 'completed') : (chunk.status || eventType));
      }
      return;
    }

    // ---- 旧格式（非任务）流式处理 ----
    if (isMessageLocallyStopped(messageId)) return;

    if (chunk.event === 'error') {
      const rawMessage =
        chunk.data?.message ||
        chunk.data?.error_msg ||
        chunk.data?.error_reason ||
        '工作流执行失败';
      console.error('智能体原始流返回错误:', rawMessage, chunk);
      throw new Error(getSafeAgentErrorMessage());
    }

    if (chunk.event === 'message' && chunk.data?.reasoning_content) {
      currentReasoning.value += chunk.data.reasoning_content;
      const chat = chatStore.getChatSession(activeChatId.value!);
      if (chat) {
        const msg = chat.messages.find((m: any) => m.id === messageId);
        if (msg) msg.reasoning = currentReasoning.value;
      }
      await nextTick();
      scrollToBottom();
    }

    if (chunk.event === 'message' && chunk.data?.text) {
      if (containsUpstreamErrorText(chunk.data.text)) {
        console.error('智能体原始流输出命中上游错误，已使用统一兜底文案展示:', chunk.data.text, chunk);
        handleStreamError(messageId, getSafeAgentErrorMessage(), taskId);
        return;
      }
      await appendModelOutputText(chunk.data.text, messageId, { tabName: activeTab.value });
    }

    if (chunk.event === 'workflow_finished') {
      try {
        flushPendingModelOutput(messageId, { tabName: activeTab.value });
        const chat = chatStore.getChatSession(activeChatId.value!);
        if (!chat || chat.messages.length < 2) return;
        const userMessage = chat.messages[chat.messages.length - 2];
        const assistantMessage = chat.messages[chat.messages.length - 1];
        const sources = extractSourcesFromWorkflowPayload(chunk, chunk.data || {}, chunk);
        if (sources.length > 0) {
          assistantMessage.sources = sources;
        }
        if ((chunk as any).taskId && !assistantMessage.taskId) {
          assistantMessage.taskId = (chunk as any).taskId;
        }
        await chatStore.saveConversationToServer(
          currentConversationUuid.value,
          messageId,
          userMessage,
          assistantMessage,
          assistantMessage.vote === 'like' ? 1 : 0,
          assistantMessage.vote === 'dislike' ? 1 : 0,
        );
      } catch {}
    }
  };

  // ---- 流完成 / 错误 / 停止 ----

  /**
   * 标记流式输出完成，更新消息状态并清理任务。
   * 同步会话历史预览、持久化最终内容、清理本地停止标记。
   */
  const finishStream = async (messageId: string, taskId?: string, status = 'completed') => {
    if ((taskId && isTaskLocallyStopped(taskId)) || isMessageLocallyStopped(messageId)) return;
    const task = taskId ? activeStreamTasks.value[taskId] : getTaskByMessageId(messageId);
    if (ownsDisplay(messageId, task) && !task?.finalAnswerReceived) {
      flushPendingModelOutput(messageId, { functionId: task?.functionId, tabName: task?.tabName });
    }
    const sessionId = task?.sessionId || activeChatId.value;
    const chat = chatStore.getChatSession(sessionId);
    if (chat) {
      const message = chat.messages.find((m: any) => m.id === messageId || m.taskId === taskId);
      if (message) {
        if (normalizeTaskStatus(message.taskStatus) === 'stopped' && normalizeTaskStatus(status) !== 'stopped') {
          if (taskId) removeStreamTask(taskId);
          return;
        }
        message.streaming = false;
        message.taskStatus = status;
        // AI回复完成时间
        message.timestamp = Date.now();
        if (taskId) message.taskId = taskId;

        const historyItem = chatStore.historyList.find((h: any) => h.id === sessionId);
        if (historyItem && chat.messages.length === 2) {
          const firstQuestion = chat.messages[0].content;
          historyItem.preview =
            firstQuestion.length > 50 ? firstQuestion.substring(0, 50) + '...' : firstQuestion;
        }
      }
    }

    const savePromise = task ? persistCompletedConversationForTask({ ...task, status, answerContent: chat?.messages.find((m: any) => m.id === messageId || m.taskId === taskId)?.content || task.answerContent || '', reasoningContent: chat?.messages.find((m: any) => m.id === messageId || m.taskId === taskId)?.reasoning || task.reasoningContent || '', sources: (chat?.messages.find((m: any) => m.id === messageId || m.taskId === taskId) as any)?.sources || task.sources || [] }) : Promise.resolve();
    if (taskId) removeStreamTask(taskId);
    if (normalizeTaskStatus(status) !== 'stopped') clearMessageLocallyStopped(messageId);
    if (ownsDisplay(messageId, task)) {
      isStreaming.value = false;
      currentStreamingMessageId.value = null;
      resetStreamState();
      scrollToBottom();
    }
    await savePromise;
  };

  /**
   * 处理流式输出错误，设置错误消息并清理任务。
   * 将错误信息转换为用户安全文案后展示。
   */
  const handleStreamError = (messageId: string, errorMessage: string, taskId?: string) => {
    if ((taskId && isTaskLocallyStopped(taskId)) || isMessageLocallyStopped(messageId)) return;
    console.error('智能体请求失败，前端已使用统一兜底文案展示:', errorMessage);
    const safeMessage = toUserSafeErrorMessage(errorMessage, getSafeAgentErrorMessage());
    const task = taskId ? activeStreamTasks.value[taskId] : getTaskByMessageId(messageId);
    const sessionId = task?.sessionId || activeChatId.value;
    const chat = chatStore.getChatSession(sessionId);
    if (chat) {
      const message = chat.messages.find((m: any) => m.id === messageId || m.taskId === taskId);
      if (message) {
        message.content = safeMessage;
        message.streaming = false;
        message.taskStatus = 'error';
        if (taskId) message.taskId = taskId;
      }
    }
    if (task) {
      void persistCompletedConversationForTask({ ...task, status: 'error', answerContent: chat?.messages.find((m: any) => m.id === messageId || m.taskId === taskId)?.content || task.answerContent || '', reasoningContent: chat?.messages.find((m: any) => m.id === messageId || m.taskId === taskId)?.reasoning || task.reasoningContent || '', sources: (chat?.messages.find((m: any) => m.id === messageId || m.taskId === taskId) as any)?.sources || task.sources || [] });
    }
    if (taskId) removeStreamTask(taskId);
    if (ownsDisplay(messageId, task)) {
      isStreaming.value = false;
      currentStreamingMessageId.value = null;
      resetStreamState();
    }
  };

  /**
   * 用户主动停止当前流式输出。
   * 中断 SSE 连接，标记任务为已停止，同步停止状态到后端并持久化会话。
   */
  const stopStream = async () => {
    const messageId = currentStreamingMessageId.value;
    if (messageId) markMessageLocallyStopped(messageId);
    const task = getTaskByMessageId(messageId);

    abortStreamController();
    if (messageId) {
      const sessionId = task?.sessionId || activeChatId.value;
      const chat = chatStore.getChatSession(sessionId);
      if (chat) {
        const message = chat.messages.find((m: any) => m.id === messageId || m.taskId === task?.taskId);
        if (message) {
          message.streaming = false;
          message.taskStatus = 'stopped';
          (message as any).taskRecoverable = false;
          if (message.content === '') {
            message.content = '用户停止了生成';
          }
        }
      }
    }
    isStreaming.value = false;
    currentStreamingMessageId.value = null;
    resetStreamState();

    if (!task) return;

    markMessageLocallyStopped(task.messageId);
    markMessageLocallyStopped(task.qaId);
    markTaskLocallyStopped(task.taskId);
    removeStreamTask(task.taskId);
    const chat = chatStore.getChatSession(task.sessionId);
    const message = chat?.messages.find(
      (item: any) => item.id === task.messageId || item.taskId === task.taskId,
    );
    const stoppedTask: ResumableStreamTask = {
      ...task,
      status: 'stopped',
      recoverable: false,
      answerContent: message?.content || task.answerContent || '',
      reasoningContent: message?.reasoning || task.reasoningContent || '',
      sources: (message as any)?.sources || task.sources || [],
      updatedAt: Date.now(),
    };

    const syncPromise = (async () => {
      const [stopResult, historyResult] = await Promise.allSettled([
        stopTaskOnServer(task.taskId),
        persistCompletedConversationForTask(stoppedTask),
      ]);
      if (stopResult.status === 'rejected') {
        console.warn('同步后台任务停止状态失败:', stopResult.reason);
      }
      if (historyResult.status === 'rejected' || historyResult.value === false) {
        console.warn(
          '同步暂停状态到会话历史失败:',
          historyResult.status === 'rejected' ? historyResult.reason : '',
        );
      }
    })();
    setPendingStopSyncPromise(syncPromise);
    try {
      await syncPromise;
    } finally {
      if (getPendingStopSyncPromise() === syncPromise) {
        setPendingStopSyncPromise(null);
      }
    }
  };

  return {
    /** Chunk 处理 */
    processStreamChunk,
    /** 流完成/错误/停止 */
    handleStreamError,
    stopStream,
  };
};
