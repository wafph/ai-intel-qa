/**
 * 合规审核过程提示清洗工具。
 *
 * 审核 AgentArts 工作流在正式报告前会输出“分段完成”“合规性处理完成1/5”
 * 等节点进度提示。该文件仅在 review/合规审核场景中过滤独立成行的进度提示，
 * 避免它们进入页面展示、刷新恢复内容和历史回显；不处理问答、检索、起草内容。
 */
export type ReviewProgressContext = {
  functionId?: string;
  tabName?: string;
};

/** 判断当前内容是否属于合规审核场景。 */
export const isReviewProgressContext = (context?: ReviewProgressContext) => {
  const functionId = String(context?.functionId || '').toLowerCase();
  if (functionId === 'review') return true;
  return context?.tabName === '合规审核';
};

/** 判断某一行是否是审核工作流节点的进度提示。 */
export const isReviewProgressLine = (line: string) => {
  const value = String(line || '').trim();
  if (!value) return false;
  if (/^分段完成[！!。.]?$/.test(value)) return true;
  if (/^合规性处理完成\s*\d+\s*\/\s*\d+$/.test(value)) return true;
  if (/^冲突性处理完成\s*\d+\s*\/\s*\d+$/.test(value)) return true;
  return false;
};

/**
 * 仅在合规审核场景中过滤独立成行的过程提示。
 *
 * 注意：不按“首次 \n\n”截断文本，因此不会误删双换行后的正式正文。
 */
export const stripReviewProgressText = (text = '', context?: ReviewProgressContext) => {
  if (!text || !isReviewProgressContext(context)) return text || '';
  return String(text)
    .split(/\r?\n/)
    .filter((line) => !isReviewProgressLine(line))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trimStart();
};
