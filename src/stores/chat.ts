/**
 * Pinia 会话仓库，维护会话列表、消息、收藏、置顶和历史状态。
 *
 * 本文件属于规章制度智能体前端最新版交付代码，整理时仅补充说明与注释，不改变业务逻辑。
 */
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { API } from '@/api/api';
import type { ChatSession, HistoryItem, ChatMessage } from '../types/chat';
import { authRequest, isSuccessStatus } from '@/services/http';
import { getApiData, getApiMessage, isApiSuccessCode } from '@/services/response';
import { extractSourcesFromAny, safeJsonParse } from '@/services/sourceUtils';
import { stripReviewProgressText } from '@/services/reviewProgress';
import { sanitizeAgentText } from '@/services/errorSanitizer';

// API基础配置 - 使用新接口地址

export const useChatStore = defineStore('chat', () => {
  const chatSessions = ref<Record<string, ChatSession>>({});
  const historyList = ref<HistoryItem[]>([]);
  const currentActiveTab = ref<string>('智能问答');
  const currentConversationUuid = ref<string>('');
  const loadingSessionIds = ref<Set<string>>(new Set());

  // 获取功能ID映射
  const getFuncIdByTab = (tab: string): string => {
    const funcIdMap: Record<string, string> = {
      智能问答: 'qa',
      智能检索: 'search',
      辅助起草: 'draft',
      合规审核: 'review',
    };
    return funcIdMap[tab] || 'qa';
  };

  // 格式化时间为标准格式
  const formatDateTime = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  };

  /** 判断条件是否成立：isRunningMessageStatus。 */
  const isRunningMessageStatus = (status: any) => {
    const normalized = String(status || '').toLowerCase();
    return normalized === 'pending' || normalized === 'running';
  };


  /** 标准化后端/历史数据结构：normalizeSources。 */
  const normalizeSources = (...values: any[]): any[] => extractSourcesFromAny(...values);

  /** 标准化后端/历史数据结构：normalizeAnswerPayload。 */
  const normalizeAnswerPayload = (qa: any) => {
    const rawAnswer = qa.answer || qa.answerJson || qa.answer_json || qa.answerContent || qa.answer_content || {};
    const parsed = safeJsonParse(rawAnswer);
    if (typeof parsed === 'string') {
      return { responseContent: parsed, data_json: [] };
    }
    if (parsed && typeof parsed === 'object') return parsed;
    return {};
  };


  const asPlainObject = (value: any): Record<string, any> => {
    const parsed = safeJsonParse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  };

  const firstDefined = (...values: any[]) => {
    for (const value of values) {
      if (value !== undefined && value !== null && value !== '') return value;
    }
    return undefined;
  };

  /**
   * 从后端 answer_json 中恢复引用、检索结果或起草推荐范文。
   *
   * v12.2.7 后端会在前端刷新/切换后仍把 workflow_finished 的结构化结果
   * 持久化到 data_json / sources / recommendations / templates / workflowOutputs / userFields。
   * 这里按多字段统一解析，避免实时订阅断开后历史回显丢失来源、详情或范文。
   */
  const getAnswerSources = (answerPayload: any) =>
    normalizeSources(
      answerPayload.data_json,
      answerPayload.dataJson,
      answerPayload.sources,
      answerPayload.references,
      answerPayload.citations,
      answerPayload.recommendations,
      answerPayload.templates,
      answerPayload.examples,
      answerPayload.workflowOutputs,
      answerPayload.workflow_outputs,
      answerPayload.userFields,
      answerPayload.user_fields,
      answerPayload,
    );

  /** 获取并归一化业务数据：getAnswerContent。 */
  const getAnswerContent = (qa: any, answerPayload: any) =>
    String(
      answerPayload.responseContent ||
        answerPayload.answerContent ||
        answerPayload.answer_content ||
        answerPayload.content ||
        answerPayload.text ||
        qa.answerContent ||
        qa.answer_content ||
        '',
    );

  const normalizeRecoverableFlag = (value: any): boolean | undefined => {
    if (value === undefined || value === null || value === '') return undefined;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (['false', '0', 'no', 'n'].includes(normalized)) return false;
      if (['true', '1', 'yes', 'y'].includes(normalized)) return true;
    }
    return undefined;
  };

  const getAnswerStopRequested = (qa: any, answerPayload: any) => {
    const raw =
      answerPayload.stopRequested ??
      answerPayload.stop_requested ??
      qa.stopRequested ??
      qa.stop_requested;
    if (raw === undefined || raw === null || raw === '') return false;
    if (typeof raw === 'boolean') return raw;
    if (typeof raw === 'number') return raw !== 0;
    if (typeof raw === 'string') return ['true', '1', 'yes', 'y'].includes(raw.trim().toLowerCase());
    return false;
  };

  const getAnswerRecoverable = (qa: any, answerPayload: any, messageStatus: string) => {
    if (getAnswerStopRequested(qa, answerPayload)) return false;
    const explicit = normalizeRecoverableFlag(
      answerPayload.recoverable ??
        answerPayload.taskRecoverable ??
        answerPayload.task_recoverable ??
        qa.recoverable ??
        qa.taskRecoverable ??
        qa.task_recoverable,
    );
    if (explicit !== undefined) return explicit;
    return isRunningMessageStatus(messageStatus);
  };

  const getAnswerEventId = (qa: any, answerPayload: any) =>
    Number(
      answerPayload.answerEventId ||
        answerPayload.answer_event_id ||
        answerPayload.answerContentEventId ||
        answerPayload.answer_content_event_id ||
        qa.answerEventId ||
        qa.answer_event_id ||
        qa.answerContentEventId ||
        qa.answer_content_event_id ||
        0,
    );

  /** 获取并归一化业务数据：getAnswerMetadata。 */
  const getAnswerMetadata = (qa: any, answerPayload: any) => {
    const baseMetadata = asPlainObject(
      answerPayload.metadata ||
        answerPayload.meta ||
        qa.metadata ||
        qa.answerMetadata ||
        qa.answer_metadata ||
        {},
    );

    const reviewContext = asPlainObject(
      answerPayload.reviewContext ||
        answerPayload.review_context ||
        qa.reviewContext ||
        qa.review_context ||
        baseMetadata.reviewContext ||
        baseMetadata.review_context ||
        {},
    );
    const complianceParams = asPlainObject(
      baseMetadata.complianceParams ||
        baseMetadata.compliance_params ||
        reviewContext.reviewParams ||
        reviewContext.review_params ||
        {},
    );

    if (!Object.keys(baseMetadata).length && !Object.keys(reviewContext).length && !Object.keys(complianceParams).length) {
      return undefined;
    }

    const mergedReviewContext = {
      ...complianceParams,
      ...reviewContext,
      reviewParams: Object.keys(complianceParams).length ? complianceParams : reviewContext.reviewParams,
    };

    return {
      ...baseMetadata,
      reviewContext: Object.keys(mergedReviewContext).length ? mergedReviewContext : baseMetadata.reviewContext,
      complianceOriginalText: firstDefined(
        baseMetadata.complianceOriginalText,
        baseMetadata.compliance_original_text,
        reviewContext.originalText,
        reviewContext.original_text,
        complianceParams.originalText,
        complianceParams.original_text,
      ) || '',
      complianceFileName: firstDefined(
        baseMetadata.complianceFileName,
        baseMetadata.compliance_file_name,
        reviewContext.fileName,
        reviewContext.file_name,
        complianceParams.fileName,
        complianceParams.file_name,
      ) || '',
      complianceParams: Object.keys(complianceParams).length
        ? complianceParams
        : baseMetadata.complianceParams || baseMetadata.compliance_params,
      pdfContextId: firstDefined(
        baseMetadata.pdfContextId,
        baseMetadata.pdf_context_id,
        reviewContext.pdfContextId,
        reviewContext.pdf_context_id,
        complianceParams.pdfContextId,
        complianceParams.pdf_context_id,
      ),
      pdfType: firstDefined(baseMetadata.pdfType, baseMetadata.pdf_type, reviewContext.pdfType, reviewContext.pdf_type),
      sourceFileUrl: firstDefined(
        baseMetadata.sourceFileUrl,
        baseMetadata.source_file_url,
        reviewContext.sourceFileUrl,
        reviewContext.source_file_url,
        complianceParams.sourceFileUrl,
        complianceParams.source_file_url,
      ),
      parsedTxtUrl: firstDefined(baseMetadata.parsedTxtUrl, baseMetadata.parsed_txt_url, reviewContext.parsedTxtUrl, reviewContext.parsed_txt_url),
      parsedMarkdownUrl: firstDefined(baseMetadata.parsedMarkdownUrl, baseMetadata.parsed_markdown_url, reviewContext.parsedMarkdownUrl, reviewContext.parsed_markdown_url),
      locatorMode: firstDefined(baseMetadata.locatorMode, baseMetadata.locator_mode, reviewContext.locatorMode, reviewContext.locator_mode),
      locatorAvailable: firstDefined(
        typeof baseMetadata.locatorAvailable === 'boolean' ? baseMetadata.locatorAvailable : undefined,
        baseMetadata.locator_available,
        reviewContext.locatorAvailable,
        reviewContext.locator_available,
      ),
      locatorUnavailableReason: firstDefined(
        baseMetadata.locatorUnavailableReason,
        baseMetadata.locator_unavailable_reason,
        reviewContext.locatorUnavailableReason,
        reviewContext.locator_unavailable_reason,
      ),
      reviewFileUrl: firstDefined(baseMetadata.reviewFileUrl, baseMetadata.review_file_url, reviewContext.reviewFileUrl, reviewContext.review_file_url),
      textSource: firstDefined(baseMetadata.textSource, baseMetadata.text_source, reviewContext.textSource, reviewContext.text_source),
    };
  };

  // 过滤后的历史记录（基于当前菜单）
  const filteredHistory = computed(() => {
    return historyList.value.filter(
      (item: any) => item.menuType === currentActiveTab.value,
    );
  });

  // 收藏的历史记录
  const collectedHistory = computed(() => {
    return historyList.value.filter((item: any) => item.isCollected);
  });

  // 切换当前菜单
  const setCurrentActiveTab = (tab: string) => {
    currentActiveTab.value = tab;
  };

  // 设置当前会话UUID
  const setCurrentConversationUuid = (uuid: string) => {
    currentConversationUuid.value = uuid;
  };

  /** 封装当前模块内的业务逻辑：addHistoryItem。 */
  const addHistoryItem = (item: HistoryItem) => {
    /** 封装当前模块内的业务逻辑：exists。 */
    const exists = historyList.value.some((h) => h.id === item.id);
    if (exists) return;

    historyList.value.unshift({
      ...item,
      topStatus: item.topStatus || 0,
    });
  };

  // 更新历史记录
  const updateHistoryItem = (id: string, updates: Partial<HistoryItem>) => {
    /** 封装当前模块内的业务逻辑：index。 */
    const index = historyList.value.findIndex((item) => item.id === id);
    if (index !== -1) {
      historyList.value[index] = { ...historyList.value[index], ...updates };
    }
  };

  // 删除历史记录（只更新内存状态）
  const deleteHistoryItem = (id: string) => {
    /** 封装当前模块内的业务逻辑：index。 */
    const index = historyList.value.findIndex((item) => item.id === id);
    if (index !== -1) {
      historyList.value.splice(index, 1);
    }
  };

  // 切换收藏状态
  const toggleCollect = (id: string) => {
    /** 封装当前模块内的业务逻辑：index。 */
    const index = historyList.value.findIndex((item: any) => item.id === id);
    if (index !== -1) {
      const newCollectStatus = !historyList.value[index].isCollected;
      historyList.value[index].isCollected = newCollectStatus;

      // 同步收藏状态到服务器（接口7）
      syncCollectStatus(id, newCollectStatus);
    }
  };

  // 获取聊天会话
  const getChatSession = (id: string) => {
    return chatSessions.value[id];
  };

  // 添加聊天会话（只更新内存状态）
  const addChatSession = (session: ChatSession) => {
    chatSessions.value[session.id] = session;
  };

  // 接口1：保存/追加单条问答
  const saveConversationToServer = async (
    sessionUuid: string,
    qaId: string,
    userMessage: ChatMessage,
    assistantMessage: ChatMessage,
    likeStatus: number,
    dislikeStatus: number,
    functionIdOverride?: string,
  ): Promise<{ success: boolean; insertId?: string }> => {
    try {
      const funcId = functionIdOverride || getFuncIdByTab(currentActiveTab.value);
      const inputTime = formatDateTime(new Date(userMessage.timestamp));
      const outputTime = formatDateTime(new Date(assistantMessage.timestamp));

      if (assistantMessage.vote === 'like') likeStatus = 1;
      if (assistantMessage.vote === 'dislike') dislikeStatus = 1;

      // 确定收藏状态
      const collectStatus = historyList.value.find((item: any) => item.id === sessionUuid)
        ?.isCollected
        ? 1
        : 0;

      // 准备 answer 对象。
      // 合规审核的原文缓存最早挂在用户消息 metadata 上；任务化流式切换/恢复后，
      // 如果 assistantMessage.metadata 为空，必须用 userMessage.metadata 兜底，否则原文标记和导出会丢字段。
      const mergedMetadata = {
        ...(userMessage as any).metadata,
        ...(assistantMessage as any).metadata,
      };
      const answer = {
        responseContent: sanitizeAgentText(assistantMessage.content || ''),
        data_json: assistantMessage.sources || [],
        sources: assistantMessage.sources || [],
        metadata: mergedMetadata,
        taskId: assistantMessage.taskId || undefined,
        taskStatus: assistantMessage.taskStatus || undefined,
        recoverable: (assistantMessage as any).taskRecoverable ?? assistantMessage.streaming ?? undefined,
        taskRecoverable: (assistantMessage as any).taskRecoverable ?? assistantMessage.streaming ?? undefined,
        streamEventCount: assistantMessage.streamEventId || undefined,
      };

      const payload = {
        sessionId: sessionUuid,
        functionId: funcId,
        questionContent: userMessage.content,
        answer: answer,
        qaId: qaId,
        questionTime: inputTime,
        answerTime: outputTime,
        likeStatus: likeStatus,
        dislikeStatus: dislikeStatus,
        favoriteStatus: collectStatus,
      };
      const response = await authRequest({
        url: API.chat.history,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        data: payload,
      });

      if (!isSuccessStatus(response.status)) {
        throw new Error(`HTTP错误! 状态: ${response.status}`);
      }

      const result = response.data;
      return { success: true, insertId: result.insert_id };
    } catch (error) {
      return { success: false };
    }
  };

  // 接口2：批量保存问答历史（如果需要）
  const saveBatchConversationToServer = async (
    sessionUuid: string,
    historyJson: any[],
  ): Promise<boolean> => {
    try {
      const funcId = getFuncIdByTab(currentActiveTab.value);

      const payload = {
        sessionId: sessionUuid,
        functionId: funcId,
        sessionTitle: '会话标题',
        historyJson: historyJson,
      };

      const response = await authRequest({
        url: API.chat.historyBatch,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        data: payload,
      });

      if (!isSuccessStatus(response.status)) {
        throw new Error(`HTTP错误! 状态: ${response.status}`);
      }
      return true;
    } catch (error) {
      return false;
    }
  };

  // 接口3：查询左侧最近会话列表
  const queryConversationsByFunc = async (): Promise<any> => {
    try {
      const funcId = getFuncIdByTab(currentActiveTab.value);
      const limit = 100;
      const url = API.chat.sessions(funcId, limit, 0);

      const response = await authRequest({
        url,
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!isSuccessStatus(response.status)) throw new Error(`HTTP错误! 状态: ${response.status}`);

      const result = response.data;
      const data = getApiData(result);
      const sessionItems = Array.isArray(data) ? data : data?.items || data?.sessions || [];
      if (result && isApiSuccessCode(result.code) && Array.isArray(sessionItems)) {
        const currentTab = currentActiveTab.value;
        const nextHistoryItems: HistoryItem[] = [];
        const nextChatSessions: Record<string, ChatSession> = {};

        for (const sessionData of sessionItems) {
          const sessionUuid = sessionData.sessionId;
          const sessionTitle = sessionData.sessionTitle || '新会话';
          const historyCount = sessionData.historyCount || sessionData.messageCount || sessionData.message_count || 0;
          const lastMessageTime = sessionData.lastMessageTime || sessionData.last_message_time || sessionData.updateTime || sessionData.update_time;
          const createTime = sessionData.createTime || sessionData.create_time || lastMessageTime;

          const createTimestamp = new Date(createTime).getTime();
          if (isNaN(createTimestamp)) continue;

          // ✅ 创建历史记录项，包含 topStatus
          const historyItem: HistoryItem = {
            id: sessionUuid,
            title: sessionTitle,
            preview: `共 ${historyCount} 条对话`,
            time: createTimestamp,
            type: currentActiveTab.value as any,
            menuType: currentActiveTab.value,
            isCollected: sessionData.favoriteStatus === 1,
            topStatus: sessionData.topStatus || 0, // ✅ 从服务器获取置顶状态
            sessionTitle: sessionTitle,
            historyCount: historyCount,
            lastMessageTime: lastMessageTime,
          };

          // 创建会话对象
          const session: ChatSession = {
            id: sessionUuid,
            title: sessionTitle,
            time: createTimestamp,
            type: currentActiveTab.value as any,
            messages: [],
            menuType: currentActiveTab.value,
            conversationUuid: sessionUuid,
            historyCount: historyCount,
            lastMessageTime: lastMessageTime,
            topStatus: sessionData.topStatus || 0, // ✅ 从服务器获取置顶状态
          };

          nextChatSessions[sessionUuid] = session;
          nextHistoryItems.push(historyItem);
        }

        /** 封装当前模块内的业务逻辑：serverSessionIds。 */
        const serverSessionIds = new Set(nextHistoryItems.map((item) => item.id));
        /** 封装当前模块内的业务逻辑：preservedCurrentTabHistory。 */
        const preservedCurrentTabHistory = historyList.value.filter((item: any) => {
          if (item.menuType !== currentTab || serverSessionIds.has(item.id)) return false;
          const localSession = chatSessions.value[item.id];
          return Boolean(
            localSession?.messages?.some(
              (message: any) => message.streaming || ['pending', 'running'].includes(String(message.taskStatus || '').toLowerCase()),
            ),
          );
        });
        /** 封装当前模块内的业务逻辑：otherTabHistory。 */
        const otherTabHistory = historyList.value.filter((item: any) => item.menuType !== currentTab);

        const mergedSessions: Record<string, ChatSession> = {};
        [...otherTabHistory, ...preservedCurrentTabHistory].forEach((item: any) => {
          const session = chatSessions.value[item.id];
          if (session) mergedSessions[item.id] = session;
        });

        chatSessions.value = {
          ...mergedSessions,
          ...nextChatSessions,
        };
        historyList.value = [
          ...otherTabHistory,
          ...preservedCurrentTabHistory,
          ...nextHistoryItems,
        ].sort((a, b) => b.time - a.time);
      }

      return result;
    } catch (error) {
      return null;
    }
  };

  // 接口4：修改会话标题
  const updateSessionTitle = async (
    sessionUuid: string,
    newTitle: string,
  ): Promise<boolean> => {
    try {
      const funcId = getFuncIdByTab(currentActiveTab.value);

      const payload = {
        sessionId: sessionUuid,
        functionId: funcId,
        sessionTitle: newTitle,
      };
      const response = await authRequest({
        url: API.chat.title,
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        data: payload,
      });

      if (!isSuccessStatus(response.status)) {
        throw new Error(`HTTP错误! 状态: ${response.status}`);
      }

      // 更新本地数据
      const session = chatSessions.value[sessionUuid];
      if (session) {
        session.title = newTitle;
        session.sessionTitle = newTitle;
      }

      /** 封装当前模块内的业务逻辑：historyItem。 */
      const historyItem = historyList.value.find((item: any) => item.id === sessionUuid);
      if (historyItem) {
        historyItem.title = newTitle;
      }

      return true;
    } catch (error) {
      return false;
    }
  };

  // 接口7：更新点赞/点踩/收藏状态
  const syncCollectStatus = async (
    sessionUuid: string,
    isCollected: boolean,
  ): Promise<boolean> => {
    try {
      const funcId = getFuncIdByTab(currentActiveTab.value);
      const qaId = '';

      const payload = {
        sessionId: sessionUuid,
        functionId: funcId,
        qaId: qaId,
        favoriteStatus: isCollected ? 1 : 0,
      };

      const response = await authRequest({
        url: API.chat.favorite,
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        data: payload,
      });

      if (!isSuccessStatus(response.status)) {
        throw new Error(`HTTP错误! 状态: ${response.status}`);
      }
      return true;
    } catch (error) {
      return false;
    }
  };

  // 接口7：更新点赞/点踩状态
  const syncLikeStatus = async (
    qaId: string,
    likeStatus: number,
    dislikeStatus: number,
    sessionUuid: string,
    dislikeReason?: string,
  ): Promise<boolean> => {
    try {
      const funcId = getFuncIdByTab(currentActiveTab.value);

      const payload: Record<string, any> = {
        sessionId: sessionUuid,
        functionId: funcId,
        qaId: qaId,
        likeStatus: likeStatus,
        dislikeStatus: dislikeStatus,
      };

      // 取消点踩或切换为点赞时，前端显式传空点踩理由，避免后端保留旧原因。
      if (typeof dislikeReason === 'string') {
        payload.dislikeReason = dislikeReason;
      }
      const url = API.chat.status;
      const response = await authRequest({
        url,
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        data: payload,
      });

      if (!isSuccessStatus(response.status)) {
        throw new Error(`HTTP错误! 状态: ${response.status}, URL: ${url}`);
      }
      return true;
    } catch {
      return false;
    }
  };

  // 更新消息的点赞状态
  const updateMessageVote = (
    sessionId: string,
    messageId: string,
    vote: 'like' | 'dislike' | null,
  ) => {
    const session = chatSessions.value[sessionId];
    if (!session) return;

    /** 封装当前模块内的业务逻辑：message。 */
    const message = session.messages.find((msg: any) => msg.id === messageId);
    if (!message) return;

    message.vote = vote;

    // 更新点赞/点踩计数
    if (vote === 'like') {
      message.likeCount = (message.likeCount || 0) + 1;
      message.dislikeCount = 0;
    } else if (vote === 'dislike') {
      message.dislikeCount = (message.dislikeCount || 0) + 1;
      message.likeCount = 0;
    } else {
      message.likeCount = 0;
      message.dislikeCount = 0;
    }

    // 同步到服务器
    const likeStatus = vote === 'like' ? 1 : 0;
    const dislikeStatus = vote === 'dislike' ? 1 : 0;
    const dislikeReason = dislikeStatus === 0 ? '' : undefined;
    syncLikeStatus(messageId, likeStatus, dislikeStatus, sessionId, dislikeReason);
  };

  // 删除会话（调用后端接口）
  const deleteConversationBySession = async (sessionUuid: string): Promise<boolean> => {
    try {
      const funcId = getFuncIdByTab(currentActiveTab.value);
      const url = API.chat.historyDetail(funcId, sessionUuid);
      const response = await authRequest({
        url,
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!isSuccessStatus(response.status)) {
        throw new Error(`HTTP错误! 状态: ${response.status}`);
      }

      const result = response.data;
      // 假设后端返回格式：{ code: 0, msg: 'success' }
      if (result && isApiSuccessCode(result.code)) {
        // 从本地删除
        deleteHistoryItem(sessionUuid);
        delete chatSessions.value[sessionUuid];
        return true;
      } else {
        return false;
      }
    } catch (error) {
      return false;
    }
  };

  // 在现有的 useChatStore 中添加以下函数：

  // 接口9：查询收藏会话列表
  const queryFavoriteSessions = async (
    functionId?: string, // 可选，不传则查询全部收藏
    limit: number = 30,
  ): Promise<{ success: boolean; data?: any[] }> => {
    try {
      const url = API.chat.favorites(limit, functionId?.trim() || undefined);
      const response = await authRequest({
        url,
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!isSuccessStatus(response.status)) {
        throw new Error(`HTTP错误! 状态: ${response.status}`);
      }

      const result = response.data;
      if (result && isApiSuccessCode(result.code) && Array.isArray(getApiData(result))) {
        return { success: true, data: getApiData(result) };
      } else {
        return { success: false };
      }
    } catch (error) {
      return { success: false };
    }
  };

  // 接口10：查询收藏会话详情
  const queryFavoriteSessionDetail = async (
    sessionUuid: string,
    functionId: string,
  ): Promise<{ success: boolean; data?: any }> => {
    try {
      const url = API.chat.favoriteDetail(functionId, sessionUuid);
      const response = await authRequest({
        url,
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!isSuccessStatus(response.status)) {
        throw new Error(`HTTP错误! 状态: ${response.status}`);
      }

      const result = response.data;
      if (result && isApiSuccessCode(result.code) && getApiData(result)) {
        return { success: true, data: getApiData(result) };
      } else {
        return { success: false };
      }
    } catch (error) {
      return { success: false };
    }
  };

  // 加载会话列表
  const loadConversations = async () => {
    await queryConversationsByFunc();
  };

  // 清空所有会话
  const clearAllConversations = async () => {
    const sessionUuids = Object.keys(chatSessions.value);
    await Promise.allSettled(
      sessionUuids.map((uuid) => deleteConversationBySession(uuid)),
    );
  };

  // 加载会话历史
  const loadSessionHistory = async (sessionUuid: string): Promise<boolean> => {
    try {
      if (loadingSessionIds.value.has(sessionUuid)) {
        return false;
      }

      loadingSessionIds.value.add(sessionUuid);

      const funcId = getFuncIdByTab(currentActiveTab.value);
      const session = chatSessions.value[sessionUuid];

      if (!session) {
        loadingSessionIds.value.delete(sessionUuid);
        return false;
      }

      // 如果已经有消息，则不需要重新加载
      if (session.messages && session.messages.length > 0) {
        loadingSessionIds.value.delete(sessionUuid);
        return true;
      }

      const messages = await querySessionHistory(sessionUuid, funcId);
      if (messages && messages.length > 0) {
        // 创建新的会话对象，确保响应式更新
        const updatedSession = {
          ...session,
          messages: [...messages],
        };

        // 直接替换整个会话对象
        chatSessions.value = {
          ...chatSessions.value,
          [sessionUuid]: updatedSession,
        };

        loadingSessionIds.value.delete(sessionUuid);
        return true;
      } else {
        console.warn('No messages found for session:', sessionUuid);
      }

      loadingSessionIds.value.delete(sessionUuid);
      return false;
    } catch {
      loadingSessionIds.value.delete(sessionUuid);
      return false;
    }
  };

  /** 将单条 qa 记录转为 user + assistant 两条 ChatMessage。三个分支共享此逻辑。 */
  const buildMessagesFromQa = (
    qa: any,
    funcId: string,
    messages: ChatMessage[],
    options: { timeKey?: string; altTimeKey?: string } = {},
  ) => {
    const { timeKey = 'questionTime', altTimeKey = 'question_time' } = options;

    // 用户消息
    messages.push({
      id: `user_${qa.qaId || qa.qa_id}`,
      role: 'user',
      content: qa.questionContent || qa.question_content || '',
      timestamp: new Date(qa[timeKey] || qa[altTimeKey] || qa.createTime || qa.create_time).getTime(),
      vote: null,
    });

    // AI消息
    const answerPayload = normalizeAnswerPayload(qa);
    const sources = getAnswerSources(answerPayload);
    const matchScore =
      sources.length > 0
        ? Math.max(...sources.map((s: any) => parseFloat(s.score || '0')))
        : 0;
    const messageStatus = qa.messageStatus || qa.message_status || answerPayload.messageStatus || answerPayload.message_status || answerPayload.taskStatus || answerPayload.task_status || '';
    const taskId = qa.taskId || qa.task_id || answerPayload.taskId || answerPayload.task_id || '';
    const metadata = getAnswerMetadata(qa, answerPayload);
    // 将 metadata 回填到上一条用户消息（智能问答需恢复 uploadedFiles，合规审核需恢复 reviewContext 等）
    if (metadata && messages.length > 0) {
      (messages[messages.length - 1] as any).metadata = {
        ...(messages[messages.length - 1] as any).metadata,
        ...metadata,
      };
    }

    const likeStatus = qa.likeStatus ?? qa.like_status ?? 0;
    const dislikeStatus = qa.dislikeStatus ?? qa.dislike_status ?? 0;

    messages.push({
      id: qa.qaId || qa.qa_id,
      role: 'assistant',
      content: sanitizeAgentText(stripReviewProgressText(getAnswerContent(qa, answerPayload), { functionId: funcId })),
      timestamp: new Date(qa.answerTime || qa.answer_time || qa.updateTime || qa.update_time).getTime(),
      streaming: getAnswerRecoverable(qa, answerPayload, messageStatus) === true,
      taskId,
      taskStatus: messageStatus,
      taskRecoverable: getAnswerRecoverable(qa, answerPayload, messageStatus),
      stopRequested: getAnswerStopRequested(qa, answerPayload),
      streamEventId: Number(answerPayload.streamEventCount || answerPayload.lastEventId || answerPayload.last_event_id || qa.lastEventId || qa.last_event_id || 0),
      answerEventId: getAnswerEventId(qa, answerPayload),
      vote:
        likeStatus === 1 ? 'like' : dislikeStatus === 1 ? 'dislike' : null,
      likeCount: likeStatus || 0,
      dislikeCount: dislikeStatus || 0,
      sources,
      match_score: matchScore,
      metadata,
    });
  };

  // 查询会话历史
  const querySessionHistory = async (
    sessionUuid: string,
    funcId: string,
  ): Promise<ChatMessage[]> => {
    try {
      const url = API.chat.historyDetail(funcId, sessionUuid);
      const response = await authRequest({
        url,
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!isSuccessStatus(response.status)) {
        throw new Error(`HTTP错误! 状态: ${response.status}`);
      }

      const result = response.data;
      const messages: ChatMessage[] = [];
      const apiData = getApiData(result);

      if (result && isApiSuccessCode(result.code) && apiData) {
        // 优先使用 historyJson，其次 messages，最后兼容数组
        const qaList: any[] =
          Array.isArray(apiData.historyJson) ? apiData.historyJson :
          Array.isArray(apiData.messages) ? apiData.messages :
          Array.isArray(apiData) ? apiData : [];

        qaList.forEach((qa: any) => buildMessagesFromQa(qa, funcId, messages));
      } else {
        console.error('返回的数据格式不正确:', result);
      }

      return messages;
    } catch (error) {
      console.error('查询会话历史失败:', error);
      return [];
    }
  };


  // 接口：搜索当前用户的历史问答，后端 V12 使用 OpenSearch 返回 sessionId + qaId + 高亮片段。
  const searchHistoryMessages = async (
    keyword: string,
    functionId?: string,
    page = 1,
    pageSize = 20,
  ): Promise<{ success: boolean; data: any[]; total?: number; message?: string }> => {
    const query = keyword.trim();
    if (!query) return { success: true, data: [], total: 0 };

    try {
      const targetFunctionId = functionId || getFuncIdByTab(currentActiveTab.value);
      const response = await authRequest({
        url: API.chat.search(query, targetFunctionId, page, pageSize),
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!isSuccessStatus(response.status)) {
        throw new Error(`HTTP错误! 状态: ${response.status}`);
      }

      const result = response.data;
      if (!isApiSuccessCode(result?.code)) {
        return { success: false, data: [], message: getApiMessage(result, '搜索失败') };
      }

      const data = getApiData(result) || {};
      const items = Array.isArray(data) ? data : data.items || [];
      return { success: true, data: items, total: data.total || items.length };
    } catch (error: any) {
      return { success: false, data: [], message: error?.message || '搜索失败' };
    }
  };

  return {
    chatSessions,
    historyList,
    filteredHistory,
    collectedHistory,
    currentActiveTab,
    currentConversationUuid,
    setCurrentActiveTab,
    setCurrentConversationUuid,
    addHistoryItem,
    updateHistoryItem,
    deleteHistoryItem,
    toggleCollect,
    getChatSession,
    addChatSession,
    saveConversationToServer,
    saveBatchConversationToServer,
    queryConversationsByFunc,
    querySessionHistory,
    updateSessionTitle,
    syncCollectStatus,
    syncLikeStatus,
    updateMessageVote,
    deleteConversationBySession,
    loadConversations,
    clearAllConversations,
    loadSessionHistory,
    getFuncIdByTab,
    queryFavoriteSessions,
    queryFavoriteSessionDetail,
    searchHistoryMessages,
  };
});
