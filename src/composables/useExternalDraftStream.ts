/**
 * 外部嵌套起草页的流式起草任务封装（主系统 iframe 场景专用）。
 *
 * 复用 V12.2 任务化流式链路：先 POST 创建 draft 工作流任务，再 GET taskStream 订阅 SSE 事件流。
 * 业务参数与现有辅助起草保持一致（query + ancestorScope + descendantScope + qaId），
 * 立场/合同长度/强弱势等字段按产品约定仅展示、不传入起草参数。
 *
 * 与辅助起草菜单完全隔离：本封装不经过 useStreamTask、不写 localStorage 任务持久化、
 * 不触碰 chatStore 会话体系；创建请求仅在 context 携带 externalSource 标记供后端识别来源。
 */
import { ref } from 'vue';
import { API } from '@/api/api';
import { authRequest, getEventStream, isSuccessStatus } from '@/services/http';
import { getApiData, getApiMessage, isApiSuccessCode } from '@/services/response';
import { getAgentToken } from '@/services/authStorage';

/** 判定事件/状态是否进入终态的任务状态集合（对齐 useStreamTask.TERMINAL_TASK_STATUSES，并防御 failed/success/done）。 */
const TERMINAL_STATUSES = ['completed', 'failed', 'error', 'stopped', 'cancelled', 'canceled', 'superseded', 'done', 'success'];

/** 可能的 think 标签前缀。 */
const POSSIBLE_THINK_PREFIX = '<think';

/** 判断字符串是否可能是 think 标签前缀（用于缓冲等待完整标签）。 */
const isPossibleThinkTagPrefix = (value: string) => {
  const normalized = value.trimStart().toLowerCase();
  if (!normalized) return true;
  return POSSIBLE_THINK_PREFIX.startsWith(normalized) || normalized.startsWith(POSSIBLE_THINK_PREFIX);
};

/**
 * 解析流式文本缓冲区，过滤 think 标签内容（与 useStreamChunk.resolveInitialStreamDisplayText 同一逻辑）。
 * 未闭合时返回 ready=false 等待更多数据；闭合后仅返回 </think> 之后的正式内容。
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

/** 生成请求级唯一 ID（request_id / session_id / qaId 复用）。 */
const generateId = () =>
  crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

/** 提取 SSE 事件类型：外层 eventType 优先，其次 payload 内嵌事件字段。 */
const extractEventType = (chunk: any): string =>
  chunk?.eventType || chunk?.payload?.event || chunk?.payload?.event_type || '';

/** 提取模型正文文本：与 useStreamChunk 任务分支的字段优先级一致。 */
const extractChunkText = (chunk: any): string => {
  if (typeof chunk?.content === 'string') return chunk.content;
  const payload = chunk?.payload || {};
  const payloadData = payload.data || {};
  return payloadData.text || payloadData.content || payload.text || payload.content || '';
};

/** 提取思考过程文本（外部页仅作累积记录，不参与展示）。 */
const extractReasoningText = (chunk: any): string =>
  chunk?.payload?.data?.reasoning_content || chunk?.payload?.reasoning_content || chunk?.data?.reasoning_content || '';

/** 提取错误事件文案（兼容任务格式与旧格式）。 */
const extractErrorMessage = (chunk: any): string =>
  chunk?.payload?.message ||
  chunk?.payload?.error_msg ||
  chunk?.payload?.error_reason ||
  chunk?.data?.message ||
  chunk?.data?.error_msg ||
  chunk?.data?.error_reason ||
  '工作流执行失败';

/** 一次起草的终态结果。 */
export interface ExternalDraftResult {
  content: string;
  qaId: string;
}

/** 组织外部起草流式任务能力与状态。 */
export const useExternalDraftStream = () => {
  /** 是否正在流式起草中。 */
  const isDrafting = ref(false);
  /** 是否已到达终态（含流自然结束的无事件兜底）。 */
  const isDone = ref(false);
  /** 累积的正文文本（think 标签已过滤）。 */
  const draftContent = ref('');
  /** 累积的思考过程文本。 */
  const draftReasoning = ref('');

  let abortController: AbortController | null = null;

  // ---- Think 标签缓冲状态（与 useStreamChunk 行为一致）----
  /** 正文输出是否已开始（首段 think 闭合后置 true）。 */
  let answerOutputStarted = false;
  /** 首次输出前的缓冲文本。 */
  let answerPendingText = '';

  /** 追加正文文本：首次输出前缓冲等待 think 标签闭合，避免展示思考内容。 */
  const appendDraftText = (text: string) => {
    if (!text) return;
    if (!answerOutputStarted) {
      answerPendingText += text;
      const resolved = resolveInitialStreamDisplayText(answerPendingText);
      if (!resolved.ready) return;
      answerOutputStarted = true;
      answerPendingText = '';
      draftContent.value += resolved.displayText;
    } else {
      draftContent.value += text;
    }
  };

  /** 收尾时冲刷 think 缓冲区：未闭合的 think 内容直接丢弃，仅输出已解析正文。 */
  const flushPendingDraftText = () => {
    if (answerOutputStarted || !answerPendingText) return;
    const resolved = resolveInitialStreamDisplayText(answerPendingText);
    answerOutputStarted = true;
    answerPendingText = '';
    draftContent.value += resolved.ready ? resolved.displayText : '';
  };

  /** 按行解析 SSE 的 data: 前缀 JSON 并回调（与 useStreamTask.consumeEventStream 同一协议）。 */
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

  /**
   * 发起一次外部起草：创建 draft 任务并订阅事件流直至终态。
   * @param query - 文件要求描述（唯一业务入参）
   * @returns 终态后的完整正文与 qaId（qaId 供 docx 转换复用）
   */
  const startDraft = async (query: string): Promise<ExternalDraftResult> => {
    const agentToken = getAgentToken();
    if (!agentToken) throw new Error('未获取到访问授权，请从主系统进入');

    const qaId = generateId();
    isDrafting.value = true;
    isDone.value = false;
    draftContent.value = '';
    draftReasoning.value = '';
    answerOutputStarted = false;
    answerPendingText = '';

    const scopes = (window as any).__SCOPES_DATA__ || {};
    const createResponse = await authRequest({
      url: API.agent.workflowTask('draft'),
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      data: {
        request_id: generateId(),
        session_id: generateId(),
        timestamp: Date.now(),
        agent_token: agentToken,
        intent_tag: 'draft',
        // externalSource 标记：供后端识别任务来源，便于在历史/会话侧与辅助起草菜单隔离
        context: { activeTab: '辅助起草', routePath: '/external-draft', externalSource: 'external-draft' },
        biz_params: {
          inputs: {
            query,
            ancestorScope: scopes.ancestorScope || [],
            descendantScope: scopes.descendantScope || [],
            qaId,
          },
        },
      },
    });

    if (!isSuccessStatus(createResponse.status)) {
      isDrafting.value = false;
      throw new Error(`创建起草任务失败: ${createResponse.status}`);
    }
    const createResult = createResponse.data;
    if (!isApiSuccessCode(createResult?.code)) {
      isDrafting.value = false;
      throw new Error(getApiMessage(createResult, '创建起草任务失败'));
    }
    const taskData = getApiData(createResult) || {};
    if (!taskData.taskId) {
      isDrafting.value = false;
      throw new Error('创建起草任务失败：后端未返回 taskId');
    }

    const controller = new AbortController();
    abortController = controller;

    let reachedTerminal = false;
    const finish = () => {
      if (reachedTerminal) return;
      reachedTerminal = true;
      flushPendingDraftText();
      isDrafting.value = false;
      isDone.value = true;
    };

    try {
      const streamResponse = await getEventStream(API.agent.taskStream(taskData.taskId, 0, agentToken), {
        signal: controller.signal,
      });
      if (!isSuccessStatus(streamResponse.status) || !streamResponse.data?.getReader) {
        throw new Error(`起草流订阅失败: ${streamResponse.status}`);
      }

      await consumeEventStream(streamResponse.data, async (rawPayload) => {
        // V12 后端将每条 SSE data 包装为 { code, msg, request_id, trace_id, data }，先解包（与 useStreamChunk 一致）
        let chunk: any = rawPayload;
        if (chunk && Object.prototype.hasOwnProperty.call(chunk, 'code')) {
          if (!isApiSuccessCode(chunk.code)) {
            finish();
            throw new Error(getApiMessage(chunk, '智能体响应异常'));
          }
          chunk = chunk.data || {};
        }

        const eventType = extractEventType(chunk);
        const status = chunk?.status || chunk?.payload?.status || '';
        const terminalHit =
          TERMINAL_STATUSES.includes(String(eventType)) || TERMINAL_STATUSES.includes(String(status));

        const reasoning = extractReasoningText(chunk);
        if (reasoning) draftReasoning.value += reasoning;

        // 正文提取：任务格式（chunk.content / payload.data.text 等）优先，旧格式（event=message 时 chunk.data.text）兜底
        const text =
          extractChunkText(chunk) || (chunk?.event === 'message' ? chunk?.data?.text || '' : '');
        if (text) appendDraftText(text);

        if (eventType === 'error' || chunk?.event === 'error') {
          finish();
          throw new Error(extractErrorMessage(chunk));
        }

        // 终态快照优先：done 事件的 answerContent 若不短于本地累积，直接采用后端终稿
        if (eventType === 'done' || terminalHit) {
          const finalAnswer = typeof chunk?.answerContent === 'string' ? chunk.answerContent : '';
          if (finalAnswer && finalAnswer.length >= draftContent.value.length) {
            draftContent.value = finalAnswer;
          }
          finish();
        }
      });

      // 流自然结束但未收到终态事件：按当前累积内容收尾
      finish();
    } catch (error: any) {
      // 页面卸载等主动中断：静默收尾并返回已生成内容
      if (error?.name === 'AbortError') {
        finish();
        return { content: draftContent.value, qaId };
      }
      finish();
      throw error;
    } finally {
      if (abortController === controller) abortController = null;
    }

    return { content: draftContent.value, qaId };
  };

  /** 中断当前流式订阅（路由离开时调用，防止内存泄漏）。 */
  const detach = () => {
    abortController?.abort();
    abortController = null;
  };

  /** 重置输出状态（重新起草时清空已生成内容与终态标记）。 */
  const reset = () => {
    abortController?.abort();
    abortController = null;
    isDrafting.value = false;
    isDone.value = false;
    draftContent.value = '';
    draftReasoning.value = '';
    answerOutputStarted = false;
    answerPendingText = '';
  };

  return { isDrafting, isDone, draftContent, draftReasoning, startDraft, detach, reset };
};
