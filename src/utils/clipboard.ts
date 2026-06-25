/**
 * 统一复制工具。
 *
 * 兼容第三方系统 iframe 嵌入场景：
 * - 优先使用 navigator.clipboard.writeText；
 * - 如果 Clipboard API 因 iframe 权限策略、焦点、浏览器限制等原因失败，继续尝试 document.execCommand('copy')；
 * - 只影响前端复制交互，不改变消息内容、历史保存、后端请求和其它业务逻辑。
 */
export const copyPlainText = async (content?: string | null): Promise<boolean> => {
  const text = String(content || '');
  if (!text) return false;

  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (err) {
      console.warn('[clipboard] navigator.clipboard.writeText failed, fallback to execCommand', err);
    }
  }

  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', 'readonly');
    textarea.setAttribute('aria-hidden', 'true');

    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    textarea.style.top = '0';
    textarea.style.width = '1px';
    textarea.style.height = '1px';
    textarea.style.opacity = '0';
    textarea.style.pointerEvents = 'none';
    textarea.style.zIndex = '-1';

    document.body.appendChild(textarea);

    textarea.focus({ preventScroll: true });
    textarea.select();
    textarea.setSelectionRange(0, textarea.value.length);

    const copied = document.execCommand('copy');
    document.body.removeChild(textarea);
    return copied;
  } catch (err) {
    console.warn('[clipboard] execCommand copy failed', err);
    return false;
  }
};
