/**
 * 共享 Markdown 渲染器，集成 DOMPurify 防 XSS。
 * 所有视图统一引用，禁止在视图内直接 new MarkdownIt。
 */
import MarkdownIt from 'markdown-it';
import DOMPurify from 'dompurify';

const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
});

/** 使用 DOMPurify 净化 HTML，防止 XSS 注入。 */
const sanitize = (html: string) =>
  DOMPurify.sanitize(html, {
    ADD_ATTR: ['target', 'rel'],
    ALLOWED_TAGS: [
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'br', 'hr',
      'ul', 'ol', 'li', 'blockquote', 'pre', 'code',
      'a', 'strong', 'em', 'del', 's', 'u', 'sub', 'sup',
      'table', 'thead', 'tbody', 'tr', 'th', 'td',
      'img', 'div', 'span', 'mark',
    ],
  });

/** 通用 Markdown 渲染（带 XSS 净化）。 */
export const renderMarkdown = (content: string): string => {
  if (!content) return '';
  return sanitize(md.render(content));
};

/** 智能问答专用：将 $$$ 转为分隔线后再渲染。 */
export const renderQAMarkdown = (content: string): string => {
  if (!content) return '';
  const processed = content.replace(/\$\$\$/g, '\n\n---\n\n');
  return sanitize(md.render(processed));
};

/** 直接净化已有 HTML 字符串（用于非 Markdown 场景）。 */
export const sanitizeHtml = (html: string): string => DOMPurify.sanitize(html);
