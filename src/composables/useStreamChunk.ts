/**
 * 流式数据块处理组合函数。
 *
 * 负责 SSE 流式数据块的解析、think 标签过滤、文本追加、
 * 流完成/错误处理和用户主动停止逻辑。
 * 从 useAppShell 中拆分而来，保持业务逻辑完全不变。
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

  // ---- Think 标签处理 ----

  /**
   * 将流式文本追加到当前回答中，处理 think 标签过滤和审查进度文本清理。
   * 首次输出前会缓冲等待 think 标签闭合，确保用户只看到正式回答内容。
   */
  const appendModelOutputText = async (
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

    await nextTick();
    scrollToBottom();
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
      if (!task) return;

      const payload = chunk.payload || {};
      const payloadData = payload.data || {};
      const eventId = Number(chunk.eventId || task.lastEventId || 0);
      const incomingAnswerEventId = toSafeEventId(
        chunk.answerEventId ??
          chunk.answer_event_id ??
          payload.answerEventId ??
          payload.answer_event_id ??
          payloadData.answerEventId ??
          payloadData.answer_event_id,
      );
      const payloadEvent = payload.event || payload.event_type || '';
      const eventType = chunk.eventType || payloadEvent || '';
      const normalizedStatus = chunk.status || payload.status || task.status;
      const normalizedIncomingStatus = normalizeTaskStatus(normalizedStatus || eventType);
      const chunkStopRequested = isStopRequestedFlag(chunk) || isStopRequestedFlag(payload) || isStopRequestedFlag(payloadData);
      if (normalizedIncomingStatus === 'stopped' || normalizeTaskStatus(eventType) === 'stopped' || chunkStopRequested) {
        markTaskLocallyStopped(taskId);
        const stoppedTask: ResumableStreamTask = {
          ...task,
          status: 'stopped',
          recoverable: false,
          lastEventId: Number(chunk.eventId || task.lastEventId || 0),
          answerEventId: task.answerEventId || 0,
          updatedAt: Date.now(),
        };
        updateTaskMessage(stoppedTask, { status: 'stopped', recoverable: false, eventId: stoppedTask.lastEventId, answerEventId: stoppedTask.answerEventId });
        removeStreamTask(taskId);
        isStreaming.value = false;
        currentStreamingMessageId.value = null;
        resetStreamState();
        return;
      }
      const chunkRecoverableFlag = getRecoverableFlag(chunk) ?? getRecoverableFlag(payload) ?? getRecoverableFlag(payloadData);
      const nextTaskRecoverable = chunkRecoverableFlag ?? task.recoverable ?? isRecoverableTaskStatus(normalizedStatus);
      let nextTask: ResumableStreamTask = {
        ...task,
        status: eventType === 'done' ? normalizedStatus : normalizedStatus || task.status,
        recoverable: nextTaskRecoverable,
        lastEventId: eventId || task.lastEventId,
        answerEventId: incomingAnswerEventId || task.answerEventId || 0,
        updatedAt: Date.now(),
      };

      const reasoningText = payloadData.reasoning_content || payload.reasoning_content || '';
      if (reasoningText) {
        currentReasoning.value += reasoningText;
        nextTask = { ...nextTask, reasoningContent: currentReasoning.value };
        updateTaskMessage(nextTask, { reasoning: currentReasoning.value });
        await nextTick();
        scrollToBottom();
      }

      const text =
        typeof chunk.content === 'string'
          ? chunk.content
          : payloadData.text || payloadData.content || payload.text || payload.content || '';
      if (text && containsUpstreamErrorText(text)) {
        console.error('智能体任务输出命中上游原始错误，已使用统一兜底文案展示:', text, payload);
        handleStreamError(messageId, getSafeAgentErrorMessage(), taskId);
        return;
      }

      if (text && !sourceOnlyReplayTaskIds.has(taskId)) {
        await appendModelOutputText(text, messageId, { functionId: task.functionId, tabName: task.tabName });
        nextTask = { ...nextTask, answerContent: currentAnswer.value, answerEventId: eventId || nextTask.answerEventId || task.answerEventId || 0 };
      }

      upsertStreamTask(nextTask);
      updateTaskMessage(nextTask, {
        status: nextTask.status,
        recoverable: nextTask.recoverable,
        eventId: nextTask.lastEventId,
        answerEventId: nextTask.answerEventId,
        content: nextTask.answerContent,
        reasoning: nextTask.reasoningContent,
      });

      if (isWorkflowFinishedEvent(eventType, payloadEvent, payload)) {
        const sources = extractSourcesFromWorkflowPayload(payload, payloadData, chunk);
        if (sources.length > 0) {
          nextTask = { ...nextTask, sources };
          updateTaskMessage(nextTask, { sources });
          upsertStreamTask(nextTask, true);
        }
        void persistCompletedConversationForTask(nextTask);
      }

      if (eventType === 'error') {
        const rawMessage = payload.message || payload.error_msg || payload.error_reason || '工作流执行失败';
        console.error('智能体任务事件返回错误:', rawMessage, payload);
        handleStreamError(messageId, getSafeAgentErrorMessage(), taskId);
        return;
      }

      if (eventType === 'done' || isTerminalTaskStatus(chunk.status || eventType)) {
        const rawFinalAnswerContent = typeof chunk.answerContent === 'string' ? chunk.answerContent : '';
        if (rawFinalAnswerContent && containsUpstreamErrorText(rawFinalAnswerContent)) {
          console.error('智能体最终快照命中上游原始错误，已使用统一兜底文案展示:', rawFinalAnswerContent, chunk);
          handleStreamError(messageId, getSafeAgentErrorMessage(), taskId);
          return;
        }
        const finalAnswerContent = sanitizeAgentText(stripReviewProgressText(
          rawFinalAnswerContent,
          { functionId: task.functionId, tabName: task.tabName },
        ));
        const finalAnswerEventId = incomingAnswerEventId || nextTask.answerEventId || eventId || task.lastEventId || 0;
        const finalSources = extractSourcesFromWorkflowPayload(payload, payloadData, chunk);
        if (finalSources.length > 0) {
          nextTask = { ...nextTask, sources: finalSources };
          updateTaskMessage(nextTask, { sources: finalSources });
        }
        if (!sourceOnlyReplayTaskIds.has(taskId) && finalAnswerContent && finalAnswerContent.length >= (currentAnswer.value || '').length) {
          currentAnswer.value = finalAnswerContent;
          nextTask = { ...nextTask, answerContent: finalAnswerContent, answerEventId: finalAnswerEventId };
          upsertStreamTask(nextTask, true);
          updateTaskMessage(nextTask, { content: finalAnswerContent, eventId: nextTask.lastEventId, answerEventId: finalAnswerEventId, sources: nextTask.sources });
        } else if (finalSources.length > 0) {
          upsertStreamTask(nextTask, true);
        }
        finishStream(messageId, taskId, chunk.status || eventType);
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
  const finishStream = (messageId: string, taskId?: string, status = 'completed') => {
    if ((taskId && isTaskLocallyStopped(taskId)) || isMessageLocallyStopped(messageId)) return;
    const task = taskId ? activeStreamTasks.value[taskId] : getTaskByMessageId(messageId);
    flushPendingModelOutput(messageId, { functionId: task?.functionId, tabName: task?.tabName });
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

    if (task) {
      void persistCompletedConversationForTask({ ...task, status, answerContent: chat?.messages.find((m: any) => m.id === messageId || m.taskId === taskId)?.content || task.answerContent || '', reasoningContent: chat?.messages.find((m: any) => m.id === messageId || m.taskId === taskId)?.reasoning || task.reasoningContent || '', sources: (chat?.messages.find((m: any) => m.id === messageId || m.taskId === taskId) as any)?.sources || task.sources || [] });
    }
    if (taskId) removeStreamTask(taskId);
    if (normalizeTaskStatus(status) !== 'stopped') clearMessageLocallyStopped(messageId);
    isStreaming.value = false;
    currentStreamingMessageId.value = null;
    resetStreamState();
    scrollToBottom();
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
    isStreaming.value = false;
    currentStreamingMessageId.value = null;
    resetStreamState();
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
