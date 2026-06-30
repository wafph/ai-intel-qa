/**
 * 消息发送组合函数。
 *
 * 负责消息发送、流式任务创建与订阅、重新生成、合规审核提交流程。
 * 从 useAppShell 中拆分而来，保持业务逻辑完全不变。
 */
import { type Ref, type ComputedRef } from 'vue';
import { ElLoading, ElMessage } from 'element-plus';
import { getWorkflowCodeByTab } from '@/api/api';
import type { ChatMessage } from '@/types/chat';
import { getFrontendFallbackErrorMessage, toUserSafeAgentErrorMessage } from '@/services/errorSanitizer';
import type { ResumableStreamTask } from './useStreamTask';
import type { ComplianceReviewParams } from './useComplianceReview';

/** 重新生成消息时携带的载荷类型。 */
export type RegeneratePayload =
  | string
  | { content: string; complianceParams?: ComplianceReviewParams | null };

/** useMessageSender 的依赖注入参数。 */
interface UseMessageSenderDeps {
  chatStore: any;
  activeChatId: Ref<string>;
  activeTab: Ref<string>;
  currentConversationUuid: Ref<string>;
  isStreaming: Ref<boolean>;
  currentReasoning: Ref<string>;
  currentAnswer: Ref<string>;
  currentStreamingMessageId: Ref<string | null>;
  inputText: Ref<string>;
  scopesData: ComputedRef<any>;
  generateUUID: () => string;
  buildUnifiedAgentPayload: (workflowCode: string, bizParams: Record<string, any>) => any;
  scrollToBottom: () => void;
  compliance: any;
  streamTask: any;
  streamChunk: any;
  sessionManager: any;
}

export const useMessageSender = (deps: UseMessageSenderDeps) => {
  const {
    chatStore, activeChatId, activeTab, currentConversationUuid,
    isStreaming, currentReasoning, currentAnswer, currentStreamingMessageId,
    inputText, scopesData, generateUUID, buildUnifiedAgentPayload, scrollToBottom,
    compliance, streamTask, streamChunk, sessionManager,
  } = deps;

  // 错误工具
  const getSafeAgentErrorMessage = () => getFrontendFallbackErrorMessage();
  const toUserSafeErrorMessage = (e: any, f = getSafeAgentErrorMessage()) => toUserSafeAgentErrorMessage(e, f);

  // 合规审核
  const {
    lastComplianceParams, uploadedFileName, uploadedFileUrl, uploadedOriginalText,
    uploadedFileRef, uploadedFileExtraMeta, selectedDimensions,
    isComplianceFileProcessing, complianceFileProcessingText, isComplianceRegenerating,
    isComplianceSubmitting, COMPLIANCE_PROCESSING_DISPLAY_TEXT,
    getActualReviewDimensions, getReviewQuery, stripFileExtension,
    buildDimensionText, buildComplianceQuestionContent, buildComplianceSessionTitle,
    normalizeComplianceParams, buildReviewContext, buildComplianceMetadata,
    saveReviewContextSnapshot, refreshComplianceParamsFileUrl, getComplianceParamsFromSession,
  } = compliance;

  // 流式任务
  const {
    clearLocalActiveTasksForSession, resetStreamState, createWorkflowTask,
    subscribeStreamTask, getRecoverableFlag, isRecoverableTaskStatus,
    isMessageLocallyStopped, markTaskLocallyStopped, stopTaskOnServer,
    persistCompletedConversationForTask, removeStreamTask, upsertStreamTask,
    updateTaskMessage, getPendingStopSyncPromise,
  } = streamTask;

  // 流式块处理
  const { handleStreamError, stopStream } = streamChunk;

  // 会话管理
  const { createChatForMessage, applySessionTitle } = sessionManager;

  /** 等待待处理的停止同步完成。 */
  const waitForPendingStopSync = async () => {
    const p = getPendingStopSyncPromise();
    if (p) await p;
  };

  /** 发送消息（智能问答 / 智能检索 / 辅助起草 / 合规审核入口）。 */
  const handleSendMessage = async (content: string) => {
    await waitForPendingStopSync();
    if (activeTab.value === '合规审核') {
      if (isComplianceSubmitting.value || isStreaming.value) { ElMessage.warning('审核任务正在处理中，请勿重复点击'); return; }
      if (!uploadedFileUrl.value || selectedDimensions.value.length === 0) return;
      isComplianceSubmitting.value = true;
    } else {
      if (!content.trim() || isStreaming.value) return;
    }

    let userMessageContent = '';
    if (activeTab.value === '合规审核') {
      const displayDimensions = getActualReviewDimensions();
      const reviewQuery = getReviewQuery();
      if (!reviewQuery) { ElMessage.warning('请选择有效的审核维度'); isComplianceSubmitting.value = false; return; }
      userMessageContent = `${uploadedFileName.value}\n审核维度：${displayDimensions.join('、')}`;
      lastComplianceParams.value = {
        file_url: uploadedFileUrl.value, query: reviewQuery, dimensions: displayDimensions,
        fileName: uploadedFileName.value, originalText: uploadedOriginalText.value,
        fileType: uploadedFileExtraMeta.value.fileType || uploadedFileRef.value?.name.split('.').pop()?.toLowerCase() || uploadedFileRef.value?.type || '',
        fileSize: uploadedFileExtraMeta.value.fileSize || uploadedFileRef.value?.size,
        fileUrl: uploadedFileUrl.value, uploadFileId: uploadedFileExtraMeta.value.uploadFileId,
        pdfContextId: uploadedFileExtraMeta.value.pdfContextId, pdfType: uploadedFileExtraMeta.value.pdfType,
        sourceFileUrl: uploadedFileExtraMeta.value.sourceFileUrl, parsedTxtUrl: uploadedFileExtraMeta.value.parsedTxtUrl,
        parsedMarkdownUrl: uploadedFileExtraMeta.value.parsedMarkdownUrl,
        locatorMode: uploadedFileExtraMeta.value.locatorMode, locatorAvailable: uploadedFileExtraMeta.value.locatorAvailable,
        locatorUnavailableReason: uploadedFileExtraMeta.value.locatorUnavailableReason,
        reviewFileUrl: uploadedFileExtraMeta.value.reviewFileUrl, textSource: uploadedFileExtraMeta.value.textSource,
      };
    } else {
      userMessageContent = content.trim();
    }

    if (!activeChatId.value) await createChatForMessage();
    const chat = chatStore.getChatSession(activeChatId.value!);
    if (!chat) { if (activeTab.value === '合规审核') isComplianceSubmitting.value = false; return; }
    if (!currentConversationUuid.value) {
      currentConversationUuid.value = generateUUID();
      (chat as any).conversationUuid = currentConversationUuid.value;
    }

    clearLocalActiveTasksForSession(currentConversationUuid.value || activeChatId.value, getWorkflowCodeByTab(activeTab.value));
    const qaId = generateUUID();
    const userMessage: ChatMessage = {
      id: `user_${qaId}`, role: 'user', content: userMessageContent,
      timestamp: new Date() as any,
      metadata: activeTab.value === '合规审核' && lastComplianceParams.value ? buildComplianceMetadata(lastComplianceParams.value) : undefined,
    };
    chat.messages.push(userMessage);

    if (chat.messages.length === 1) {
      const newTitle = activeTab.value === '合规审核' && lastComplianceParams.value
        ? buildComplianceSessionTitle(lastComplianceParams.value.fileName, lastComplianceParams.value.dimensions)
        : content.length > 20 ? content.substring(0, 20) + '...' : content;
      chat.title = newTitle;
      applySessionTitle(chat.id, newTitle, activeTab.value === '合规审核' ? userMessageContent : content);
    }

    if (activeTab.value === '合规审核') await saveReviewContextSnapshot(qaId, lastComplianceParams.value);

    // 清空输入
    if (activeTab.value === '合规审核') {
      uploadedFileName.value = ''; uploadedFileUrl.value = ''; uploadedOriginalText.value = '';
      uploadedFileExtraMeta.value = {}; selectedDimensions.value = [];
      const cb = document.querySelector('.el-checkbox-group .el-checkbox:first-child input') as HTMLInputElement;
      if (cb) cb.checked = false;
    } else {
      inputText.value = '';
    }

    const aiMessageId = qaId;
    chat.messages.push({
      id: aiMessageId, role: 'assistant', content: '', reasoning: '',
      timestamp: new Date() as any, streaming: true,
      metadata: activeTab.value === '合规审核' && lastComplianceParams.value ? buildComplianceMetadata(lastComplianceParams.value) : undefined,
    } as ChatMessage);
    chatStore.updateHistoryItem(activeChatId.value!, { preview: userMessageContent, time: Date.now() });
    resetStreamState();
    currentStreamingMessageId.value = aiMessageId;
    await startStream(userMessageContent, aiMessageId);
    if (activeTab.value === '合规审核') isComplianceSubmitting.value = false;
    scrollToBottom();
  };

  /** 创建 V12.2 后台任务并订阅 taskId 事件流。 */
  const startStream = async (queryText: string, messageId: string) => {
    isStreaming.value = true;
    currentReasoning.value = '';
    currentAnswer.value = '';
    try {
      let bizParams: Record<string, any> = {};
      if (activeTab.value === '合规审核') {
        const params = lastComplianceParams.value;
        bizParams = {
          file_url: params?.file_url || uploadedFileUrl.value,
          query: params?.query || getReviewQuery(),
          questionContent: params ? buildComplianceQuestionContent(params.fileName, params.dimensions) : queryText,
          sessionTitle: params ? buildComplianceSessionTitle(params.fileName, params.dimensions) : undefined,
          fileName: params?.fileName,
          fileNameWithoutExt: params?.fileName ? stripFileExtension(params.fileName) : undefined,
          reviewDimensions: params?.dimensions || getActualReviewDimensions(),
          dimensionText: params ? buildDimensionText(params.dimensions) : buildDimensionText(),
          ancestorScope: scopesData.value.ancestorScope || [],
          descendantScope: scopesData.value.descendantScope || [],
          complianceParams: params ? { ...params } : undefined,
          metadata: params ? buildComplianceMetadata(params) : undefined,
          reviewContext: params ? buildReviewContext(params) : undefined,
        };
      } else if (activeTab.value === '辅助起草') {
        bizParams = { query: queryText, ancestorScope: scopesData.value.ancestorScope || [], descendantScope: scopesData.value.descendantScope || [] };
      } else {
        bizParams = { query: queryText, ancestorScope: scopesData.value.ancestorScope || [], descendantScope: scopesData.value.descendantScope || [], user: scopesData.value.user || '1' };
      }

      const workflowCode = getWorkflowCodeByTab(activeTab.value);
      const taskData = await createWorkflowTask(workflowCode, bizParams, messageId, buildUnifiedAgentPayload);
      if (activeTab.value === '合规审核') {
        const serverTitle = taskData.sessionTitle || taskData.session_title || taskData.title;
        const localTitle = lastComplianceParams.value ? buildComplianceSessionTitle(lastComplianceParams.value.fileName, lastComplianceParams.value.dimensions) : '';
        applySessionTitle(currentConversationUuid.value || activeChatId.value, serverTitle || localTitle, queryText);
        void saveReviewContextSnapshot(messageId, lastComplianceParams.value, { taskId: taskData.taskId });
      }
      const chat = chatStore.getChatSession(activeChatId.value!);
      const userMessageForTask = chat?.messages.find((m: any) => m.id === `user_${messageId}`);
      const task: ResumableStreamTask = {
        taskId: taskData.taskId, sessionId: taskData.sessionId || currentConversationUuid.value,
        qaId: taskData.qaId || messageId, messageId: taskData.qaId || messageId,
        functionId: taskData.functionId || workflowCode, tabName: activeTab.value,
        status: taskData.status || 'pending',
        recoverable: getRecoverableFlag(taskData) ?? isRecoverableTaskStatus(taskData.status || 'pending'),
        lastEventId: Number(taskData.lastEventId || 0),
        answerEventId: Number(taskData.answerEventId || taskData.answer_event_id || 0),
        updatedAt: Date.now(), createdAt: Date.now(),
        title: activeTab.value === '合规审核' && lastComplianceParams.value
          ? buildComplianceSessionTitle(lastComplianceParams.value.fileName, lastComplianceParams.value.dimensions) : chat?.title,
        userContent: userMessageForTask?.content || queryText,
        answerContent: '', reasoningContent: '',
        metadata: activeTab.value === '合规审核' && lastComplianceParams.value ? buildComplianceMetadata(lastComplianceParams.value) : undefined,
      };

      if (isMessageLocallyStopped(messageId)) {
        markTaskLocallyStopped(task.taskId);
        const stoppedChat = chatStore.getChatSession(task.sessionId);
        const stoppedMessage = stoppedChat?.messages.find((m: any) => m.id === messageId || m.id === task.messageId);
        if (stoppedMessage) {
          stoppedMessage.taskId = task.taskId; stoppedMessage.streaming = false;
          stoppedMessage.taskStatus = 'stopped'; (stoppedMessage as any).taskRecoverable = false;
          stoppedMessage.streamEventId = task.lastEventId || 0;
          (stoppedMessage as any).answerEventId = task.answerEventId || 0;
          if (!stoppedMessage.content) stoppedMessage.content = '用户停止了生成';
        }
        const stoppedTask: ResumableStreamTask = { ...task, status: 'stopped', recoverable: false, answerContent: stoppedMessage?.content || '用户停止了生成', reasoningContent: stoppedMessage?.reasoning || '', updatedAt: Date.now() };
        await Promise.allSettled([stopTaskOnServer(task.taskId), persistCompletedConversationForTask(stoppedTask)]);
        removeStreamTask(task.taskId);
        isStreaming.value = false; currentStreamingMessageId.value = null; resetStreamState();
        return;
      }

      upsertStreamTask(task, true);
      updateTaskMessage(task, { status: task.status, recoverable: task.recoverable, eventId: task.lastEventId, answerEventId: task.answerEventId });
      await subscribeStreamTask(task.taskId);
    } catch (error: any) {
      console.error('创建或订阅智能体任务失败:', error);
      handleStreamError(messageId, toUserSafeErrorMessage(error, getSafeAgentErrorMessage()));
    }
  };

  /** 审核的流式请求函数。 */
  const startComplianceStream = async (messageId: string) => {
    if (!lastComplianceParams.value) {
      ElMessage.error('没有找到审核参数，无法重新审核');
      handleStreamError(messageId, '审核参数缺失');
      return;
    }
    await startStream(lastComplianceParams.value.query, messageId);
  };

  /** 处理合规审核的专用函数。 */
  const handleComplianceReview = async () => {
    if (!lastComplianceParams.value) { ElMessage.warning('没有找到上一次审核的参数'); return; }
    if (isComplianceRegenerating.value) { ElMessage.warning('正在准备重新审核，请稍候'); return; }
    isComplianceRegenerating.value = true;
    isComplianceFileProcessing.value = true;
    complianceFileProcessingText.value = COMPLIANCE_PROCESSING_DISPLAY_TEXT;
    const loadingInstance = ElLoading.service({ lock: false, text: COMPLIANCE_PROCESSING_DISPLAY_TEXT, background: 'rgba(255, 255, 255, 0.45)' });
    try {
      lastComplianceParams.value = await refreshComplianceParamsFileUrl(lastComplianceParams.value);
      const displayDimensions = getActualReviewDimensions(lastComplianceParams.value.dimensions);
      const userMessageContent = buildComplianceQuestionContent(lastComplianceParams.value.fileName, displayDimensions);
      if (!activeChatId.value) await createChatForMessage();
      const chat = chatStore.getChatSession(activeChatId.value!);
      if (!chat) return;
      if (!currentConversationUuid.value) {
        currentConversationUuid.value = generateUUID();
        (chat as any).conversationUuid = currentConversationUuid.value;
      }
      clearLocalActiveTasksForSession(currentConversationUuid.value || activeChatId.value, getWorkflowCodeByTab(activeTab.value));
      const qaId = generateUUID();
      chat.messages.push({
        id: `user_${qaId}`, role: 'user', content: userMessageContent,
        timestamp: new Date() as any, metadata: buildComplianceMetadata(lastComplianceParams.value),
      } as ChatMessage);
      if (chat.messages.length === 1) {
        const newTitle = buildComplianceSessionTitle(lastComplianceParams.value.fileName, lastComplianceParams.value.dimensions);
        chat.title = newTitle;
        applySessionTitle(chat.id, newTitle, userMessageContent);
      }
      const aiMessageId = qaId;
      chat.messages.push({
        id: aiMessageId, role: 'assistant', content: '', reasoning: '',
        timestamp: new Date() as any, streaming: true,
        metadata: buildComplianceMetadata(lastComplianceParams.value),
      } as ChatMessage);
      chatStore.updateHistoryItem(activeChatId.value!, { preview: userMessageContent, time: Date.now() });
      resetStreamState();
      currentStreamingMessageId.value = aiMessageId;
      await saveReviewContextSnapshot(qaId, lastComplianceParams.value);
      complianceFileProcessingText.value = '';
      isComplianceFileProcessing.value = false;
      loadingInstance.close();
      await startComplianceStream(aiMessageId);
      scrollToBottom();
    } catch (error) {
      console.error('重新审核失败:', error);
      ElMessage.error(toUserSafeErrorMessage(error, '重新审核失败，请稍后重试'));
    } finally {
      loadingInstance.close();
      isComplianceRegenerating.value = false;
      isComplianceFileProcessing.value = false;
      complianceFileProcessingText.value = '';
    }
  };

  /** 重新生成消息。 */
  const handleRegenerate = async (payload: RegeneratePayload) => {
    if (activeTab.value === '合规审核' && isComplianceRegenerating.value) { ElMessage.warning('正在准备重新审核，请稍候'); return; }
    if (isStreaming.value) await stopStream();
    else await waitForPendingStopSync();
    const content = typeof payload === 'string' ? payload : payload.content;
    if (activeTab.value === '合规审核') {
      const payloadParams = typeof payload === 'string' ? null : normalizeComplianceParams(payload.complianceParams);
      const sessionParams = getComplianceParamsFromSession(chatStore.getChatSession(activeChatId.value));
      const params = payloadParams || lastComplianceParams.value || sessionParams;
      if (params) { lastComplianceParams.value = params; await handleComplianceReview(); }
      else ElMessage.error('没有找到审核参数，无法重新审核');
    } else {
      await handleSendMessage(content);
    }
  };

  return {
    handleSendMessage,
    handleRegenerate,
  };
};
