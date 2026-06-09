/**
 * 历史问题折叠工具。
 * 只影响前端展示，不改变发送内容、历史保存和后端请求。
 */
export const USER_QUESTION_COLLAPSE_LINES = 5;

/**
 * 前端无法在渲染前精确知道文本实际行数，这里用换行数 + 字符长度做轻量预判。
 * 命中后使用 CSS line-clamp 按 5 行真实折叠展示。
 */
export const shouldCollapseUserQuestion = (content?: string | null) => {
  const text = String(content || '');
  if (!text.trim()) return false;

  const explicitLines = text.split(/\r\n|\r|\n/).length;
  if (explicitLines > USER_QUESTION_COLLAPSE_LINES) return true;

  const compactLength = text.replace(/\s+/g, '').length;
  return compactLength > 180;
};

/**
 * 复制文本到剪贴板。
 * 仅用于前端交互，不改变消息内容和后端保存。
 */
export const copyTextToClipboard = async (content?: string | null) => {
  const text = String(content || '');
  if (!text) return false;

  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }

    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', 'readonly');
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    textarea.style.top = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand('copy');
    document.body.removeChild(textarea);
    return copied;
  } catch (err) {
    console.warn('[messageCollapse] copy failed', err);
    return false;
  }
};
