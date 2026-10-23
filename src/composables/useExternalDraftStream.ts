/** 外部起草任务：一个会话 sessionId，多轮 qaId；不读写内部登录或前端 chatStore。 */
import { ref } from 'vue';
import { API } from '@/api/api';
import { isSuccessStatus } from '@/services/http';
import { getApiData, getApiMessage, isApiSuccessCode } from '@/services/response';
import { createExternalId, externalDraftRequest, getExternalCredential, type ExternalCredential } from '@/services/externalDraftAccess';
import { containsUpstreamErrorText, getFrontendFallbackErrorMessage, sanitizeAgentText } from '@/services/errorSanitizer';

export interface ExternalDraftResult {
  sessionId: string;
  qaId: string;
  taskId: string;
  content: string;
  status: 'completed' | 'stopped';
}
interface DraftRun { controller: AbortController; access: ExternalCredential; taskId: string; stopped: boolean; detached: boolean; stopSent: boolean }
const abortError = () => new DOMException('本轮输出已中断', 'AbortError');
const filterThink = (value: string) => value.replace(/<think\b[^>]*>[\s\S]*?<\/think>/gi, '').replace(/<think\b[^>]*>[\s\S]*$/i, '');
const readSnapshot = (chunk: any): string | undefined => {
  const p = chunk.payload || {}, d = p.data || {};
  return [chunk.answerContent, p.answerContent, d.answerContent, d.outputs?.responseContent, d.outputs?.answer,
    p.outputs?.responseContent, p.outputs?.answer].find(value => typeof value === 'string');
};
const successful = (response: any, fallback: string) => {
  if (!isSuccessStatus(response.status) || !isApiSuccessCode(response.data?.code)) throw new Error(String(getApiMessage(response.data, `${fallback}（HTTP ${response.status}）`)));
  return getApiData(response.data) || {};
};

/** 读取完整 SSE 帧；兼容 CRLF、分包、多行 data，并等待异步处理完成。 */
export const consumeExternalEvents = async (stream: ReadableStream<Uint8Array>, onData: (value: any) => void | boolean, signal: AbortSignal) => {
  const reader = stream.getReader(), decoder = new TextDecoder();
  let buffer = '', lines: string[] = [], ended = false;
  const frame = () => { if (!lines.length || ended) return; const data = lines.join('\n'); lines = []; if (data !== '[DONE]' && onData(JSON.parse(data)) === false) ended = true; };
  const line = (raw: string) => { if (ended) return; const value = raw.replace(/\r$/, ''); if (!value) frame(); else if (value.startsWith('data:')) lines.push(value.slice(5).trimStart()); };
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener('abort', cancel, { once: true });
  try {
    while (!signal.aborted && !ended) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split('\n'); buffer = parts.pop() || ''; parts.forEach(line);
    }
    if (signal.aborted) throw abortError();
    if (!ended) { buffer += decoder.decode(); if (buffer) line(buffer); frame(); }
  } finally { signal.removeEventListener('abort', cancel); await reader.cancel().catch(() => {}); reader.releaseLock(); }
};

export const useExternalDraftStream = () => {
  const sessionId = ref(createExternalId()); // 仅“新建会话”时更换，不能每轮重建。
  const isDrafting = ref(false), isDone = ref(false), draftContent = ref(''), draftReasoning = ref('');
  let active: DraftRun | null = null;
  const stopOnServer = async (run: DraftRun) => {
    if (!run.taskId || run.stopSent) return;
    run.stopSent = true;
    try { successful(await externalDraftRequest({ url: API.agent.taskStop(run.taskId), method: 'POST', timeout: 15000 }, run.access), '停止任务失败'); }
    catch { /* 本地已停止，后端停止失败不把部分输出标记为成功。 */ }
  };
  const startDraft = async (query: string): Promise<ExternalDraftResult> => {
    if (isDrafting.value) throw new Error('当前起草尚未结束，请稍候');
    if (!query.trim()) throw new Error('请输入起草要求');
    const access = getExternalCredential();
    const run: DraftRun = { access, controller: new AbortController(), taskId: '', stopped: false, detached: false, stopSent: false };
    active = run;
    const currentSessionId = sessionId.value, qaId = createExternalId(); // 每轮问答唯一，重生成也使用新的 qaId。
    let body = '', pending = '', started = false, lastEventId = 0, answerEventId = 0;
    let finalReceived = false, doneReceived = false, completed = false;
    isDrafting.value = true; isDone.value = false; draftContent.value = ''; draftReasoning.value = '';
    const owns = () => active === run && !run.detached && !run.stopped;
    const applySnapshot = (snapshot: string, cursor = 0) => {
      if (cursor && cursor < answerEventId) return;
      if (containsUpstreamErrorText(snapshot)) throw new Error(getFrontendFallbackErrorMessage());
      body = sanitizeAgentText(filterThink(snapshot)); pending = ''; started = true; finalReceived = true;
      answerEventId = cursor || answerEventId; draftContent.value = body;
    };
    try {
      // 创建中点击停止时仍接收 taskId，随后调用既有 stop 接口，避免任务失去管理。
      const task = successful(await externalDraftRequest({ url: API.agent.workflowTask('draft'), method: 'POST', timeout: 30000,
        headers: { 'Content-Type': 'application/json' }, data: {
          request_id: createExternalId(), session_id: currentSessionId, timestamp: Date.now(), agent_token: access.token, intent_tag: 'draft',
          context: { activeTab: '辅助起草', routePath: '/external-draft', externalSource: 'external-draft' },
          biz_params: { inputs: { query: query.trim(), ancestorScope: access.scopes.ancestorScope || [], descendantScope: access.scopes.descendantScope || [], qaId } },
        } }, access), '创建起草任务失败');
      run.taskId = task.taskId || '';
      if (!run.taskId) throw new Error('创建起草任务失败：后端未返回 taskId');
      if (run.stopped) { await stopOnServer(run); return { sessionId: currentSessionId, qaId, taskId: run.taskId, content: body, status: 'stopped' }; }
      if (!owns()) throw abortError();
      if (task.qaId && task.qaId !== qaId || task.sessionId && task.sessionId !== currentSessionId) throw new Error('任务返回的会话或问答 ID 不一致');
      const response = await externalDraftRequest<ReadableStream<Uint8Array>>({ url: API.agent.taskStream(run.taskId, 0), method: 'GET', adapter: 'fetch', responseType: 'stream', signal: run.controller.signal }, access);
      if (!isSuccessStatus(response.status) || !response.data?.getReader) throw new Error(`起草流订阅失败（HTTP ${response.status}）`);
      await consumeExternalEvents(response.data, raw => {
        if (!owns() || doneReceived) return;
        let chunk = raw;
        if (Object.prototype.hasOwnProperty.call(chunk || {}, 'code')) {
          if (!isApiSuccessCode(chunk.code)) throw new Error(String(getApiMessage(chunk, '智能体响应异常')));
          chunk = chunk.data || {};
        }
        if (chunk.taskId && chunk.taskId !== run.taskId) return;
        const p = chunk.payload || {}, d = p.data || {};
        const type = String(chunk.eventType || chunk.event || p.event || '').toLowerCase();
        const payloadType = String(p.event || p.event_type || '').toLowerCase();
        const status = String(chunk.status || p.status || '').toLowerCase();
        if (['error', 'failed'].includes(type) || ['error', 'failed'].includes(status)) throw new Error(getFrontendFallbackErrorMessage());
        if (['stopped', 'cancelled', 'canceled', 'superseded'].includes(type) || ['stopped', 'cancelled', 'canceled', 'superseded'].includes(status)) { run.stopped = true; run.controller.abort(); return; }
        const id = Number(chunk.eventId || 0), fresh = !id || id > lastEventId;
        lastEventId = Math.max(lastEventId, id);
        if (fresh && !finalReceived) {
          const reasoning = d.reasoning_content || p.reasoning_content || '';
          if (reasoning) draftReasoning.value += reasoning;
          const text = typeof chunk.content === 'string' ? chunk.content : d.text || d.content || p.text || (chunk.event === 'message' ? chunk.data?.text : '') || '';
          if (text) {
            if (containsUpstreamErrorText(text)) throw new Error(getFrontendFallbackErrorMessage());
            if (!started) {
              pending += text;
              const normalized = pending.trimStart().toLowerCase();
              if ('<think'.startsWith(normalized) || /^<think\b/i.test(normalized) && !/<\/think>/i.test(pending)) return;
              body += filterThink(pending); pending = ''; started = true;
            } else body += text;
            body = sanitizeAgentText(body); draftContent.value = body; answerEventId = id || answerEventId;
          }
        }
        if (payloadType === 'workflow_finished' || type === 'workflow_finished' || ['done', 'completed'].includes(type)) {
          const snapshot = readSnapshot(chunk);
          if (snapshot !== undefined) applySnapshot(snapshot, Number(chunk.answerEventId || chunk.answer_event_id || id || 0));
        }
        if (type === 'completed' || status === 'completed') completed = true; // 不提前释放界面，继续等待 done。
        if (type === 'done') { doneReceived = true; return false; }
      }, run.controller.signal);
      if (!owns()) throw abortError();
      if (!doneReceived || !finalReceived) {
        if (!(completed && finalReceived)) {
          const detail = successful(await externalDraftRequest({ url: API.agent.taskDetail(run.taskId), method: 'GET', timeout: 30000 }, access), '最终结果查询失败');
          if (!owns()) throw abortError();
          if (String(detail.status).toLowerCase() !== 'completed' || typeof detail.answerContent !== 'string') throw new Error('最终结果尚未确认，请重新进入或重试');
          applySnapshot(detail.answerContent, Number(detail.answerEventId || detail.answer_event_id || 0));
        }
      }
      if (!finalReceived) throw new Error('未收到最终正文，请重试');
      isDone.value = true;
      return { sessionId: currentSessionId, qaId, taskId: run.taskId, content: body, status: 'completed' };
    } catch (error) {
      if (run.stopped) return { sessionId: currentSessionId, qaId, taskId: run.taskId, content: body, status: 'stopped' };
      throw error;
    } finally { if (active === run) { isDrafting.value = false; active = null; } }
  };
  /** 主动停止会调用既有后端 stop；离开页面仅中断订阅，后台任务仍按原规则运行。 */
  const stop = async () => { const run = active; if (!run) return; run.stopped = true; run.controller.abort(); isDrafting.value = false; await stopOnServer(run); };
  const detach = () => { if (active) { active.detached = true; active.controller.abort(); active = null; } isDrafting.value = false; };
  const reset = () => { detach(); isDone.value = false; draftContent.value = ''; draftReasoning.value = ''; };
  const newSession = () => { reset(); sessionId.value = createExternalId(); };
  return { sessionId, isDrafting, isDone, draftContent, draftReasoning, startDraft, stop, detach, reset, newSession };
};
