import { FRONTEND_FALLBACK_ERROR_MESSAGE } from '@/services/config';

/**
 * 上游 AgentArts / ModelArts / Redis 错误脱敏。
 *
 * 后端 v12.2.20 已做统一兜底；前端保留同样规则作为保险，覆盖：
 * - 上游把错误当普通 message 文本流式返回；
 * - 刷新/切换后历史中仍存在旧版本原始错误；
 * - 旧后端或浏览器本地任务缓存里的错误快照。
 */
const UPSTREAM_ERROR_PATTERNS: RegExp[] = [
  /Failed\s+to\s+get\s+the\s+element\s+from\s+redis/i,
  /Get\s+model\s+streaming\s+output\s+error/i,
  /Model\s+request\s+error/i,
  /ModelArts\.\d+/i,
  /error_code["'\s:：]+ModelArts\./i,
  /dial\s+tcp\s+[\d.:]+/i,
  /connect:\s*connection\s+refused/i,
  /connection\s+refused/i,
  /Request\s+failed/i,
  /执行报错[，,]?\s*错误码[：:]/,
  /错误信息[：:].*Model request error/i,
  /AgentArts\s*上游响应异常/i,
  /upstream\s+(response|error|failed)/i,
  /Redis.*(not\s+found|failed|error)/i,
];

const LOCAL_VALIDATION_PATTERNS: RegExp[] = [
  /未找到/,
  /请选择/,
  /请上传/,
  /不存在/,
  /链接已过期/,
  /无法重新上传/,
  /没有找到/,
  /为空/,
  /认证\s*token/,
  /审核参数缺失/,
];

export const getFrontendFallbackErrorMessage = () =>
  FRONTEND_FALLBACK_ERROR_MESSAGE || '抱歉，当前智能体服务繁忙或请求处理失败，请稍后重试。';

export const containsUpstreamErrorText = (value: unknown) => {
  const text = typeof value === 'string' ? value : String((value as any)?.message || value || '');
  if (!text) return false;
  return UPSTREAM_ERROR_PATTERNS.some((pattern) => pattern.test(text));
};

export const isLocalValidationErrorText = (value: unknown) => {
  const text = typeof value === 'string' ? value : String((value as any)?.message || value || '');
  if (!text) return false;
  return LOCAL_VALIDATION_PATTERNS.some((pattern) => pattern.test(text));
};

export const sanitizeAgentText = (value: unknown, fallback = getFrontendFallbackErrorMessage()) => {
  const text = typeof value === 'string' ? value : String((value as any)?.message || value || '');
  if (!text) return text;
  return containsUpstreamErrorText(text) ? fallback : text;
};

export const toUserSafeAgentErrorMessage = (
  errorOrMessage: unknown,
  fallback = getFrontendFallbackErrorMessage(),
) => {
  const message =
    typeof errorOrMessage === 'string'
      ? errorOrMessage
      : String((errorOrMessage as any)?.message || errorOrMessage || '');

  if (message && isLocalValidationErrorText(message) && !containsUpstreamErrorText(message)) {
    return message;
  }
  return fallback;
};
