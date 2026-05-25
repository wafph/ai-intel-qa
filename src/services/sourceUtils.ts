/**
 * 引用来源、检索详情、范文来源的字段兼容与解析工具。
 *
 * 本文件属于规章制度智能体前端最新版交付代码，整理时仅补充说明与注释，不改变业务逻辑。
 */
const SOURCE_ARRAY_KEYS = [
  'data_json',
  'dataJson',
  'sources',
  'source_list',
  'sourceList',
  'references',
  'reference',
  'citations',
  'citation',
  'docs',
  'documents',
  'docList',
  'chunks',
  'chunkList',
  'items',
  'records',
  'list',
  'results',
  'result',
  'search_results',
  'searchResults',
  'retrieval_results',
  'retrievalResults',
  // v12.2.7 后端会把 workflow_finished 的起草推荐范文保存到以下字段；
  // 这里纳入统一来源解析，保证刷新/切换后能从历史 answer_json 中恢复。
  'recommendations',
  'recommendation',
  'templates',
  'template',
  'examples',
  'example',
  'sample_docs',
  'sampleDocs',
  'reference_docs',
  'referenceDocs',
];

const SOURCE_OBJECT_KEYS = [
  'data',
  'payload',
  'outputs',
  'output',
  'user_fields',
  'userFields',
  // v12.2.7 后端持久化的完整 workflow_finished outputs。
  'workflowOutputs',
  'workflow_outputs',
  'answer',
  'answer_json',
  'answerJson',
  'metadata',
  'extra',
  'result',
];

/** 封装当前模块内的业务逻辑：pickFirst。 */
const pickFirst = (...values: any[]) => {
  for (const value of values) {
    if (value !== undefined && value !== null && String(value).trim() !== '') return value;
  }
  return '';
};

/** 封装当前模块内的业务逻辑：safeJsonParse。 */
export const safeJsonParse = (value: any): any => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed) return value;
  if (!['{', '['].includes(trimmed[0])) return value;
  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
};

/** 封装当前模块内的业务逻辑：looksLikeSourceItem。 */
const looksLikeSourceItem = (value: any) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return Boolean(
    pickFirst(
      value.file_id,
      value.fileId,
      value.document_id,
      value.documentId,
      value.doc_id,
      value.docId,
      value.chunk_id,
      value.chunkId,
      value.title,
      value.file_name,
      value.fileName,
      value.content,
      value.text,
      value.chunk_content,
      value.chunkContent,
      value.page_content,
      value.pageContent,
    ),
  );
};

/** 判断条件是否成立：isSourceArray。 */
const isSourceArray = (value: any[]) => {
  if (!Array.isArray(value) || value.length === 0) return false;
  return value.some((item) => looksLikeSourceItem(safeJsonParse(item)));
};

/** 封装当前模块内的业务逻辑：collectSourceArrays。 */
export const collectSourceArrays = (value: any, depth = 0, visited = new WeakSet<object>()): any[] => {
  if (value === undefined || value === null || depth > 8) return [];

  const parsed = safeJsonParse(value);
  if (Array.isArray(parsed)) {
    if (isSourceArray(parsed)) return parsed;
    for (const item of parsed) {
      const nested = collectSourceArrays(item, depth + 1, visited);
      if (nested.length > 0) return nested;
    }
    return [];
  }

  if (typeof parsed !== 'object') return [];
  if (visited.has(parsed)) return [];
  visited.add(parsed);

  for (const key of SOURCE_ARRAY_KEYS) {
    const nested = collectSourceArrays((parsed as any)[key], depth + 1, visited);
    if (nested.length > 0) return nested;
  }

  for (const key of SOURCE_OBJECT_KEYS) {
    const nested = collectSourceArrays((parsed as any)[key], depth + 1, visited);
    if (nested.length > 0) return nested;
  }

  for (const key of Object.keys(parsed)) {
    if (SOURCE_ARRAY_KEYS.includes(key) || SOURCE_OBJECT_KEYS.includes(key)) continue;
    const nested = collectSourceArrays((parsed as any)[key], depth + 1, visited);
    if (nested.length > 0) return nested;
  }

  return [];
};

/** 标准化后端/历史数据结构：normalizeSourceItem。 */
export const normalizeSourceItem = (raw: any) => {
  const item = safeJsonParse(raw) || {};
  const metadata = safeJsonParse(item.metadata) || {};
  const file = item.file || item.document || item.doc || metadata.file || metadata.document || {};
  const chunk = item.chunk || metadata.chunk || {};
  const directUrl = pickFirst(
    item.download_url,
    item.downloadUrl,
    item.file_url,
    item.fileUrl,
    item.url,
    item.preview_url,
    item.previewUrl,
    file.download_url,
    file.downloadUrl,
    file.file_url,
    file.fileUrl,
    file.url,
  );

  const fileId = String(
    pickFirst(
      item.file_id,
      item.fileId,
      item.fileID,
      item.file_uuid,
      item.fileUuid,
      item.origin_file_id,
      item.originFileId,
      item.source_file_id,
      item.sourceFileId,
      item.knowledge_file_id,
      item.knowledgeFileId,
      item.document_file_id,
      item.documentFileId,
      // 按早期可用版本恢复兜底：部分 AgentArts 来源只返回 id/document_id/doc_id，
      // 历史前端使用 source.file_id || source.id 能正常预览，因此这里继续兼容。
      item.document_id,
      item.documentId,
      item.doc_id,
      item.docId,
      item.id,
      file.file_id,
      file.fileId,
      file.id,
      metadata.file_id,
      metadata.fileId,
      metadata.document_id,
      metadata.documentId,
      metadata.doc_id,
      metadata.docId,
      metadata.id,
    ),
  );

  const chunkId = String(
    pickFirst(
      item.chunk_id,
      item.chunkId,
      item.chunk_uuid,
      item.chunkUuid,
      item.segment_id,
      item.segmentId,
      item.paragraph_id,
      item.paragraphId,
      chunk.chunk_id,
      chunk.chunkId,
      chunk.id,
      metadata.chunk_id,
      metadata.chunkId,
      item.id,
    ),
  );

  const title = String(
    pickFirst(
      item.title,
      item.file_name,
      item.fileName,
      item.name,
      item.doc_name,
      item.docName,
      item.document_name,
      item.documentName,
      item.source_name,
      item.sourceName,
      file.title,
      file.file_name,
      file.fileName,
      file.name,
      metadata.title,
      metadata.file_name,
      metadata.fileName,
      '引用文档',
    ),
  );

  const content = String(
    pickFirst(
      item.content,
      item.text,
      item.chunk_content,
      item.chunkContent,
      item.page_content,
      item.pageContent,
      item.document_content,
      item.documentContent,
      item.source_content,
      item.sourceContent,
      item.answer,
      item.summary,
      item.abstract,
      chunk.content,
      chunk.text,
      metadata.content,
      '',
    ),
  );

  const subtitle = String(
    pickFirst(
      item.subtitle,
      item.section_title,
      item.sectionTitle,
      item.chapter,
      item.heading,
      item.catalog,
      item.path,
      item.title === title ? '' : item.title,
      metadata.subtitle,
      metadata.section_title,
      metadata.sectionTitle,
      '',
    ),
  );

  const score = Number.parseFloat(
    String(pickFirst(item.score, item.match_score, item.matchScore, item.similarity, item.distance_score, item.distanceScore, 0)),
  );
  const matchScore = Number.parseFloat(
    String(pickFirst(item.match_score, item.matchScore, item.score, item.similarity, 0)),
  );

  return {
    ...item,
    file_id: fileId,
    fileId,
    chunk_id: chunkId,
    chunkId,
    title,
    content,
    subtitle,
    update_date_time: pickFirst(
      item.update_date_time,
      item.updateDateTime,
      item.update_time,
      item.updateTime,
      item.updated_at,
      item.updatedAt,
      metadata.update_date_time,
      metadata.updateDateTime,
      '',
    ),
    tags: item.tags || metadata.tags || '',
    repo_id: pickFirst(item.repo_id, item.repoId, metadata.repo_id, metadata.repoId, ''),
    score: Number.isFinite(score) ? score : 0,
    match_score: Number.isFinite(matchScore) ? matchScore : Number.isFinite(score) ? score : 0,
    download_url: directUrl || item.download_url,
    downloadUrl: directUrl || item.downloadUrl,
  };
};

/** 抽取文件、来源或响应字段：extractSourcesFromAny。 */
export const extractSourcesFromAny = (...values: any[]) => {
  for (const value of values) {
    const list = collectSourceArrays(value);
    if (list.length > 0) return list.map(normalizeSourceItem);
  }
  return [];
};

/** 获取并归一化业务数据：getSourceFileId。 */
export const getSourceFileId = (source: any) => {
  const normalized = normalizeSourceItem(source);
  return String(
    pickFirst(
      normalized.file_id,
      normalized.fileId,
      source?.file_id,
      source?.fileId,
      source?.document_file_id,
      source?.documentFileId,
      source?.document_id,
      source?.documentId,
      source?.doc_id,
      source?.docId,
      source?.id,
      '',
    ),
  );
};

/** 获取并归一化业务数据：getSourceTitle。 */
export const getSourceTitle = (source: any, fallback = 'document') => {
  const normalized = normalizeSourceItem(source);
  return String(pickFirst(normalized.title, source?.title, source?.file_name, source?.fileName, fallback));
};

/** 获取并归一化业务数据：getSourceDirectUrl。 */
export const getSourceDirectUrl = (source: any) => {
  const normalized = normalizeSourceItem(source);
  return String(
    pickFirst(
      normalized.downloadUrl,
      normalized.download_url,
      source?.downloadUrl,
      source?.download_url,
      source?.fileUrl,
      source?.file_url,
      source?.previewUrl,
      source?.preview_url,
      source?.url,
      '',
    ),
  );
};
