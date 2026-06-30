/**
 * 合规审核组合函数。
 *
 * 集中管理合规审核相关的状态、文件上传、参数归一化、维度选择和审核上下文构建。
 * 从 useAppShell 中拆分而来，保持业务逻辑完全不变。
 */
import { ref, computed, type Ref } from 'vue';
import type { ChatSession } from '@/types/chat';
import { ElMessage, ElMessageBox } from 'element-plus';
import { authRequest, request, isSuccessStatus } from '@/services/http';
import { API } from '@/api/api';
import {
  bindReviewPdfFile,
  buildTxtFileFromPdfParsedText,
  isPdfFile,
  prepareReviewPdf,
  detectReviewPdf,
} from '@/services/reviewPdfPrepare';
import { getTextFromUploadResult, extractReadableFileText } from '@/composables/useFileParsing';

/** 合规审核请求参数。 */
export type ComplianceReviewParams = {
  file_url: string;
  query: string;
  dimensions: string[];
  fileName: string;
  originalText: string;
  fileType?: string;
  fileSize?: number;
  fileUrl?: string;
  uploadFileId?: string;
  originalHtml?: string;
  pdfContextId?: string;
  pdfType?: string;
  sourceFileUrl?: string;
  parsedTxtUrl?: string;
  parsedMarkdownUrl?: string;
  locatorMode?: string;
  locatorAvailable?: boolean;
  locatorUnavailableReason?: string;
  reviewFileUrl?: string;
  textSource?: string;
};

/** AgentArts 文件上传结果。 */
export type ComplianceUploadResult = {
  rawResult?: any;
  fileName: string;
  fileUrl: string;
  originalText: string;
  fileType: string;
  fileSize: number;
  uploadFileId?: string;
  pdfContextId?: string;
  pdfType?: string;
  sourceFileUrl?: string;
  parsedTxtUrl?: string;
  parsedMarkdownUrl?: string;
  locatorMode?: string;
  locatorAvailable?: boolean;
  locatorUnavailableReason?: string;
  reviewFileUrl?: string;
  textSource?: string;
};

/** 审核维度常量。 */
const REVIEW_DIMENSIONS = ['合规性', '冲突性', '文本规范性'];
/** "全选"虚拟维度。 */
const SELECT_ALL_DIMENSION = '全选';
/** 文件解析中展示文案。 */
const COMPLIANCE_PROCESSING_DISPLAY_TEXT = '文件正在解析中，请稍候...';

/** useComplianceReview 的依赖注入参数。 */
interface UseComplianceReviewDeps {
  /** App store，用于获取 sharedDataToken */
  appStore: any;
  /** User store，用于获取 user_id */
  userStore: any;
  /** Chat store，用于 getChatSession / updateHistoryItem */
  chatStore: any;
  /** 当前激活会话 ID */
  activeChatId: Ref<string>;
  /** 当前会话 UUID */
  currentConversationUuid: Ref<string>;
  /** 是否正在流式输出 */
  isStreaming: Ref<boolean>;
}

/**
 * 创建合规审核组合函数。
 *
 * @param deps - 依赖注入参数
 * @returns 合规审核相关的响应式状态和方法
 */
export const useComplianceReview = (deps: UseComplianceReviewDeps) => {
  const { appStore, userStore, activeChatId, currentConversationUuid, isStreaming } = deps;

  // ---- 响应式状态 ----
  /** 上一次审核参数（用于重新审核） */
  const lastComplianceParams = ref<ComplianceReviewParams | null>(null);
  /** 已上传文件名 */
  const uploadedFileName = ref('');
  /** 已上传文件 URL */
  const uploadedFileUrl = ref('');
  /** 已上传文件的原文文本 */
  const uploadedOriginalText = ref('');
  /** 已上传 File 引用 */
  const uploadedFileRef = ref<File | null>(null);
  /** 已上传文件附加元数据 */
  const uploadedFileExtraMeta = ref<Partial<ComplianceReviewParams>>({});
  /** 已选审核维度 */
  const selectedDimensions = ref<string[]>([]);
  /** 合规文件处理中 */
  const isComplianceFileProcessing = ref(false);
  /** 合规文件处理中展示文案 */
  const complianceFileProcessingText = ref('');
  /** 合规重新审核中 */
  const isComplianceRegenerating = ref(false);
  /** 合规提交中 */
  const isComplianceSubmitting = ref(false);

  // ---- 工具函数 ----

  /**
   * 格式化文件大小为可读文本。
   * @param size - 文件字节数
   * @returns 如 "1.23KB" 的格式化文本
   */
  const formatFileSize = (size: number): string => {
    if (!Number.isFinite(size) || size <= 0) return '';
    if (size < 1024) return `${size}B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(2)}KB`;
    return `${(size / 1024 / 1024).toFixed(2)}MB`;
  };

  /** 上传文件元信息（扩展名 | 大小），用于 ChatInput 展示。 */
  const uploadedFileMeta = computed(() => {
    const file = uploadedFileRef.value;
    if (!file) return '';
    const extension = file.name.split('.').pop()?.toUpperCase() || 'FILE';
    const sizeText = formatFileSize(file.size);
    return sizeText ? `${extension} | ${sizeText}` : extension;
  });

  /**
   * 统一获取真正要提交给后端的审核维度，避免把"全选"传给接口或生成空 query。
   * @param dimensions - 当前选择的维度列表
   * @returns 过滤后的实际维度
   */
  const getActualReviewDimensions = (dimensions: string[] = selectedDimensions.value): string[] => {
    if (dimensions.includes(SELECT_ALL_DIMENSION)) {
      return [...REVIEW_DIMENSIONS];
    }
    return dimensions.filter((item) => REVIEW_DIMENSIONS.includes(item));
  };

  /**
   * 获取审核 query 字符串（逗号分隔的维度列表）。
   * @param dimensions - 当前选择的维度列表
   * @returns 如 "合规性,冲突性" 的查询字符串
   */
  const getReviewQuery = (dimensions: string[] = selectedDimensions.value): string => {
    return getActualReviewDimensions(dimensions).join(',');
  };

  /**
   * 去掉常见文件后缀，保证刷新前后的审核历史标题格式一致。
   * @param fileName - 原始文件名
   * @returns 不含后缀的文件名
   */
  const stripFileExtension = (fileName = ''): string => {
    const normalized = String(fileName || '').trim().split('/').pop()?.split('\\').pop() || '';
    return normalized.replace(/\.[A-Za-z0-9]{1,8}$/, '').trim() || '合规审核文件';
  };

  /**
   * 构建维度展示文本。
   * @param dimensions - 当前选择的维度列表
   * @returns 如 "合规性、冲突性" 的展示文本
   */
  const buildDimensionText = (dimensions: string[] = selectedDimensions.value): string => {
    const displayDimensions = getActualReviewDimensions(dimensions);
    return displayDimensions.length ? displayDimensions.join('、') : '未选择审核维度';
  };

  /**
   * 构造用于会话标题、历史 preview 和后台 questionContent 的审核展示文本。
   * @param fileName - 文件名
   * @param dimensions - 审核维度
   * @returns "文件名\n审核维度：xxx" 格式的文本
   */
  const buildComplianceQuestionContent = (
    fileName: string,
    dimensions: string[] = selectedDimensions.value,
  ): string => {
    return `${stripFileExtension(fileName)}\n审核维度：${buildDimensionText(dimensions)}`;
  };

  /**
   * 左侧历史标题统一采用"文件名（不含后缀）+ 审核维度"，避免刷新前后显示不一致。
   * @param fileName - 文件名
   * @param dimensions - 审核维度
   * @returns "文件名｜维度" 格式的标题
   */
  const buildComplianceSessionTitle = (
    fileName: string,
    dimensions: string[] = selectedDimensions.value,
  ): string => {
    return `${stripFileExtension(fileName)}｜${buildDimensionText(dimensions)}`;
  };

  // ---- 参数归一化 ----

  /**
   * 标准化后端/历史数据中的合规审核参数。
   * 兼容多种字段命名（reviewContext / review_context / reviewParams 等）。
   *
   * @param params - 原始参数对象
   * @returns 归一化后的 ComplianceReviewParams，无法解析时返回 null
   */
  const normalizeComplianceParams = (params: any): ComplianceReviewParams | null => {
    if (!params) return null;

    const reviewContext = params.reviewContext || params.review_context || {};
    const reviewParams = params.reviewParams || params.review_params || reviewContext.reviewParams || reviewContext.review_params || {};
    const source = { ...reviewContext, ...reviewParams, ...params };
    const fileUrl =
      source.file_url ||
      source.fileUrl ||
      source.reviewFileUrl ||
      source.review_file_url ||
      source.url ||
      '';
    const rawQuery =
      source.query ||
      source.reviewDimension ||
      source.review_dimension ||
      source.auditDimension ||
      source.audit_dimension ||
      '';

    const dimensions = Array.isArray(source.dimensions)
      ? getActualReviewDimensions(source.dimensions)
      : String(rawQuery)
          .split(/[,，、]/)
          .map((item) => item.trim())
          .filter(Boolean);
    const query = dimensions.length ? dimensions.join(',') : String(rawQuery || '').trim();

    if (!fileUrl || !query) return null;

    return {
      file_url: fileUrl,
      query,
      dimensions,
      fileName: source.fileName || source.file_name || source.name || '合规审核文件',
      originalText: source.originalText || source.original_text || source.parsedText || source.parsed_text || '',
      fileType: source.fileType || source.file_type,
      fileSize: source.fileSize || source.file_size,
      fileUrl: source.fileUrl || source.file_url || source.url || fileUrl,
      uploadFileId: source.uploadFileId || source.upload_file_id || source.fileId || source.file_id,
      originalHtml: source.originalHtml || source.original_html || '',
      pdfContextId: source.pdfContextId || source.pdf_context_id || source.contextId || source.context_id,
      pdfType: source.pdfType || source.pdf_type,
      sourceFileUrl: source.sourceFileUrl || source.source_file_url || source.originalPdfUrl || source.original_pdf_url,
      parsedTxtUrl: source.parsedTxtUrl || source.parsed_txt_url,
      parsedMarkdownUrl: source.parsedMarkdownUrl || source.parsed_markdown_url,
      locatorMode: source.locatorMode || source.locator_mode,
      locatorAvailable: typeof source.locatorAvailable === 'boolean' ? source.locatorAvailable : source.locator_available,
      locatorUnavailableReason: source.locatorUnavailableReason || source.locator_unavailable_reason,
      reviewFileUrl: source.reviewFileUrl || source.review_file_url || fileUrl,
      textSource: source.textSource || source.text_source,
    };
  };

  /**
   * 构造审核请求上下文，包含文件信息、PDF 上下文和定位器配置。
   * @param params - 合规审核参数
   * @returns 审核上下文对象
   */
  const buildReviewContext = (params: ComplianceReviewParams) => ({
    fileName: params.fileName,
    fileType: params.fileType,
    fileSize: params.fileSize,
    fileUrl: params.fileUrl || params.file_url,
    uploadFileId: params.uploadFileId,
    originalText: params.originalText,
    originalHtml: params.originalHtml,
    pdfContextId: params.pdfContextId,
    pdfType: params.pdfType,
    sourceFileUrl: params.sourceFileUrl,
    parsedTxtUrl: params.parsedTxtUrl,
    parsedMarkdownUrl: params.parsedMarkdownUrl,
    locatorMode: params.locatorMode,
    locatorAvailable: params.locatorAvailable,
    locatorUnavailableReason: params.locatorUnavailableReason,
    reviewFileUrl: params.reviewFileUrl,
    textSource: params.textSource,
    reviewParams: { ...params },
  });

  /**
   * 构造合规审核元数据，用于消息 metadata 和后端保存。
   * @param params - 合规审核参数
   * @returns 元数据对象
   */
  const buildComplianceMetadata = (params: ComplianceReviewParams) => ({
    complianceOriginalText: params.originalText,
    complianceFileName: params.fileName,
    complianceFileNameWithoutExt: stripFileExtension(params.fileName),
    complianceDimensionText: buildDimensionText(params.dimensions),
    complianceParams: { ...params },
    reviewContext: buildReviewContext(params),
    pdfContextId: params.pdfContextId,
    pdfType: params.pdfType,
    sourceFileUrl: params.sourceFileUrl,
    parsedTxtUrl: params.parsedTxtUrl,
    parsedMarkdownUrl: params.parsedMarkdownUrl,
    locatorMode: params.locatorMode,
    locatorAvailable: params.locatorAvailable,
    locatorUnavailableReason: params.locatorUnavailableReason,
    reviewFileUrl: params.reviewFileUrl,
    textSource: params.textSource,
  });

  // ---- 审核上下文保存 ----

  /**
   * 将审核原文上下文保存到后端，刷新/切换后可恢复原文比对。
   * 保存失败不阻断主流程。
   *
   * @param qaId - 问答 ID
   * @param params - 合规审核参数
   * @param options - 可选参数，含 taskId
   */
  const saveReviewContextSnapshot = async (
    qaId: string,
    params: ComplianceReviewParams | null,
    options: { taskId?: string } = {},
  ) => {
    if (!qaId || !params) return;
    const sessionId = currentConversationUuid.value || activeChatId.value;
    if (!sessionId) return;

    try {
      await authRequest({
        url: API.chat.reviewContext,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        data: {
          sessionId,
          functionId: 'review',
          qaId,
          taskId: options.taskId,
          ...buildReviewContext(params),
          metadata: buildComplianceMetadata(params),
        },
      });
    } catch {
      // 审核上下文保存失败不阻断主流程；后端历史保存仍会尝试兜底合并 metadata。
    }
  };

  // ---- 文件 URL 过期检测 ----

  /**
   * 判断临时文件 URL 是否已过期（基于 URL 中的 Expires 参数）。
   * @param fileUrl - 文件 URL
   * @returns true 表示已过期
   */
  const isTemporaryFileUrlExpired = (fileUrl: string): boolean => {
    try {
      const url = new URL(fileUrl);
      const expires = Number(url.searchParams.get('Expires'));
      if (!expires) return false;
      return expires <= Math.floor(Date.now() / 1000);
    } catch {
      return false;
    }
  };

  // ---- 文件上传 ----

  /**
   * 从 AgentArts 上传接口返回结果中归一化文件 URL。
   * @param result - 上传接口返回的原始对象
   * @param fallbackName - 无法提取时的兜底值
   * @returns 文件 URL
   */
  const getFileUrlFromAgentUploadResult = (result: any, fallbackName: string): string =>
    result?.url || result?.file_url || result?.fileUrl || result?.data?.url || result?.data?.file_url || fallbackName;

  /**
   * 原始 AgentArts 上传逻辑：非 PDF 和 PDF 解析后的 txt 均复用该方法。
   * @param file - 要上传的文件
   * @param options - 可选参数，含 originalText 和 statusText
   * @returns 上传结果
   */
  const uploadFileToAgentArts = async (
    file: File,
    options: { originalText?: string; statusText?: string } = {},
  ): Promise<ComplianceUploadResult> => {
    const token = appStore.sharedDataToken;
    if (!token) {
      throw new Error('未找到认证 token');
    }

    const formData = new FormData();
    formData.append('file', file);
    formData.append('is_image', 'false');

    complianceFileProcessingText.value = COMPLIANCE_PROCESSING_DISPLAY_TEXT;
    const localOriginalText =
      options.originalText !== undefined ? options.originalText : await extractReadableFileText(file);

    complianceFileProcessingText.value = COMPLIANCE_PROCESSING_DISPLAY_TEXT;
    const response = await request({
      url: API.agent.uploadFile,
      method: 'POST',
      headers: {
        'X-Auth-Token': token,
      },
      data: formData,
    });

    if (!isSuccessStatus(response.status)) {
      throw new Error(`上传失败: ${response.status}`);
    }

    const result = response.data;
    return {
      rawResult: result,
      fileName: file.name,
      fileUrl: getFileUrlFromAgentUploadResult(result, file.name),
      originalText: getTextFromUploadResult(result) || localOriginalText,
      fileType: file.name.split('.').pop()?.toLowerCase() || file.type || '',
      fileSize: file.size,
      uploadFileId: result?.file_id || result?.fileId || result?.id || result?.data?.file_id || result?.data?.fileId || '',
    };
  };

  /**
   * PDF 文件预处理：先快速 detect，用户确认后再 mineru 解析文本 -> 前端转 txt -> 复用原 AgentArts 上传获取 file_url。
   * @param file - PDF 文件
   * @returns 上传结果
   */
  const uploadPdfForComplianceReview = async (file: File): Promise<ComplianceUploadResult> => {
    const sessionId = currentConversationUuid.value || activeChatId.value || undefined;
    const userId = String((userStore.user as any)?.user_id || (userStore.user as any)?.id || '').trim() || undefined;

    complianceFileProcessingText.value = '正在检测 PDF 是否支持原文定位...';
    const detectResult = await detectReviewPdf(file, { sessionId, userId });
    const detectInfo = detectResult?.detect || {};
    const detectPdfInfo = detectResult?.pdf_detect || {};
    const detectLocatorAvailable = Boolean(
      detectInfo.locator_available ?? detectPdfInfo.can_use_pdf_locator,
    );
    const detectReason =
      detectInfo.reason ||
      detectPdfInfo.locator_unavailable_reason ||
      '当前 PDF 为扫描件或非标准 PDF，可能影响原文标记功能。';
    const nonStandardPdfConfirmMessage =
      '当前 PDF 未检测到有效文本层，可能为扫描件或图片型 PDF，无法进行原 PDF 坐标定位，仅支持解析文本展示。';

    if (!detectLocatorAvailable) {
      // 前置检测已结束，弹窗期间不要继续显示"正在检测 PDF 是否支持原文定位"。
      isComplianceFileProcessing.value = false;
      complianceFileProcessingText.value = '';
      await ElMessageBox.confirm(
        nonStandardPdfConfirmMessage,
        'PDF 文件提示',
        {
          confirmButtonText: '继续上传',
          cancelButtonText: '取消重传',
          type: 'warning',
        },
      );
      isComplianceFileProcessing.value = true;
    }

    complianceFileProcessingText.value = COMPLIANCE_PROCESSING_DISPLAY_TEXT;
    const prepareResult = await prepareReviewPdf(file, {
      sessionId,
      userId,
      includeContent: true,
    });

    const parsedText =
      prepareResult?.review_input?.parsed_text ||
      prepareResult?.review_input?.parsed_markdown ||
      '';

    if (!parsedText.trim()) {
      throw new Error('PDF 解析结果为空，无法继续审核');
    }

    const locatorAvailable = Boolean(prepareResult?.original_dispatch?.locator_available);
    const locatorReason = prepareResult?.original_dispatch?.locator_unavailable_reason ||
      detectReason ||
      '当前 PDF 为扫描件或非标准 PDF，无法进行原 PDF 精准定位，仅支持查看原文页面。';

    complianceFileProcessingText.value = COMPLIANCE_PROCESSING_DISPLAY_TEXT;
    const parsedTxtFile = buildTxtFileFromPdfParsedText(parsedText, file.name);
    const agentUploadResult = await uploadFileToAgentArts(parsedTxtFile, {
      originalText: parsedText,
      statusText: COMPLIANCE_PROCESSING_DISPLAY_TEXT,
    });
    const contextId = prepareResult?.context_id || '';

    if (contextId && agentUploadResult.fileUrl) {
      try {
        await bindReviewPdfFile(contextId, {
          review_file_url: agentUploadResult.fileUrl,
          review_file_id: agentUploadResult.uploadFileId,
          review_file_type: 'txt',
          session_id: sessionId,
          user_id: userId,
          agent_upload_response: agentUploadResult.rawResult,
        });
      } catch (error) {
        // 绑定失败不阻断审核主流程，但刷新后的审计信息可能缺少 review_file_url。
        console.warn('绑定 PDF 审核文件 URL 失败:', error);
      }
    }

    return {
      fileName: file.name,
      fileUrl: agentUploadResult.fileUrl,
      originalText: parsedText,
      fileType: 'pdf',
      fileSize: file.size,
      uploadFileId: agentUploadResult.uploadFileId,
      pdfContextId: contextId,
      pdfType: prepareResult?.pdf_detect?.pdf_type || '',
      sourceFileUrl:
        prepareResult?.file_info?.source_file_url ||
        prepareResult?.original_dispatch?.source_file_url ||
        '',
      parsedTxtUrl: prepareResult?.review_input?.parsed_txt_url || '',
      parsedMarkdownUrl: prepareResult?.review_input?.parsed_markdown_url || '',
      locatorMode: prepareResult?.original_dispatch?.locator_mode || 'parsed_text_only',
      locatorAvailable,
      locatorUnavailableReason: locatorAvailable ? '' : locatorReason,
      reviewFileUrl: agentUploadResult.fileUrl,
      textSource: prepareResult?.review_input?.text_source || 'mineru25-pro',
    };
  };

  /**
   * 上传合规审核文件。PDF 走预处理流程，其他文件直接上传到 AgentArts。
   * @param file - 用户选择的文件
   * @returns 上传结果
   */
  const uploadComplianceFile = async (file: File): Promise<ComplianceUploadResult> => {
    if (isPdfFile(file)) {
      return uploadPdfForComplianceReview(file);
    }
    return uploadFileToAgentArts(file);
  };

  /**
   * ChatInput 自定义上传回调。处理文件上传成功/失败状态。
   * @param options - Element Plus 上传回调参数
   */
  const customUpload = async (options: any) => {
    const { file, onSuccess, onError } = options;
    if (isComplianceFileProcessing.value) {
      onError(new Error('当前已有文件正在处理，请稍候'));
      return;
    }

    isComplianceFileProcessing.value = true;
    complianceFileProcessingText.value = isPdfFile(file)
      ? '正在检测 PDF 是否支持原文定位...'
      : COMPLIANCE_PROCESSING_DISPLAY_TEXT;

    try {
      const uploadResult = await uploadComplianceFile(file);
      onSuccess(uploadResult, file);
      uploadedFileRef.value = file;
      uploadedFileName.value = uploadResult.fileName;
      uploadedFileUrl.value = uploadResult.fileUrl;
      uploadedOriginalText.value = uploadResult.originalText;
      uploadedFileExtraMeta.value = { ...uploadResult };
      ElMessage.success({ message: isPdfFile(file) ? 'PDF 解析并上传完成' : '文件上传完成', offset: 72 });
    } catch (error) {
      onError(error);
    } finally {
      isComplianceFileProcessing.value = false;
      complianceFileProcessingText.value = '';
    }
  };

  /**
   * 清理合规审核已上传文件，允许重新选择文件。
   */
  const handleRemoveUploadedFile = () => {
    if (isStreaming.value || isComplianceFileProcessing.value || isComplianceSubmitting.value) {
      ElMessage.warning('当前任务处理中，暂不能删除文件');
      return;
    }
    uploadedFileRef.value = null;
    uploadedFileName.value = '';
    uploadedFileUrl.value = '';
    uploadedOriginalText.value = '';
    uploadedFileExtraMeta.value = {};
    lastComplianceParams.value = null;
    complianceFileProcessingText.value = '';
    ElMessage.success({ message: '已删除上传文件，可重新上传', offset: 72 });
  };

  /**
   * 处理"全选"维度复选框。选中时展开为三个真实维度，取消时清空所有选择。
   * @param val - 是否选中全选
   */
  const handleSelectAll = (val: boolean) => {
    if (val) {
      selectedDimensions.value = [SELECT_ALL_DIMENSION, ...REVIEW_DIMENSIONS];
    } else {
      selectedDimensions.value = [];
    }
  };

  // ---- 参数刷新 ----

  /**
   * 重新审核时刷新已过期的文件 URL。
   * 优先复用未过期的 file_url；PDF 文件重新上传解析文本；其他文件从 uploadedFileRef 重新上传。
   *
   * @param params - 上一次审核参数
   * @returns 刷新后的参数
   */
  const refreshComplianceParamsFileUrl = async (params: ComplianceReviewParams): Promise<ComplianceReviewParams> => {
    // 重新审核优先复用上次审核已经得到的 file_url，避免 PDF 重新走 mineru 解析。
    if (params.file_url && !isTemporaryFileUrlExpired(params.file_url)) {
      lastComplianceParams.value = params;
      return params;
    }

    const isPdfPreparedText =
      params.fileType === 'pdf' ||
      Boolean(params.pdfContextId) ||
      params.textSource === 'mineru25-pro' ||
      params.locatorMode === 'pdf_text_layer' ||
      params.locatorMode === 'parsed_text_only';

    if (isPdfPreparedText) {
      if (!params.originalText?.trim()) {
        throw new Error('PDF 解析文本不存在，无法重新上传审核文件，请重新上传 PDF');
      }

      complianceFileProcessingText.value = '审核文件链接已过期，正在重新上传 PDF 解析文本...';
      const parsedTxtFile = buildTxtFileFromPdfParsedText(params.originalText, params.fileName || '审核文件.pdf');
      const agentUploadResult = await uploadFileToAgentArts(parsedTxtFile, {
        originalText: params.originalText,
        statusText: '正在重新上传 PDF 解析文本...',
      });

      const refreshedParams: ComplianceReviewParams = {
        ...params,
        file_url: agentUploadResult.fileUrl,
        fileUrl: agentUploadResult.fileUrl,
        uploadFileId: agentUploadResult.uploadFileId || params.uploadFileId,
        reviewFileUrl: agentUploadResult.fileUrl,
      };

      if (params.pdfContextId && agentUploadResult.fileUrl) {
        try {
          await bindReviewPdfFile(params.pdfContextId, {
            review_file_url: agentUploadResult.fileUrl,
            review_file_id: agentUploadResult.uploadFileId,
            review_file_type: 'txt',
            session_id: currentConversationUuid.value || activeChatId.value || undefined,
            user_id: String((userStore.user as any)?.user_id || (userStore.user as any)?.id || '').trim() || undefined,
            agent_upload_response: agentUploadResult.rawResult,
          });
        } catch (error) {
          console.warn('重新审核时绑定 PDF 审核文件 URL 失败:', error);
        }
      }

      lastComplianceParams.value = refreshedParams;
      return refreshedParams;
    }

    const file = uploadedFileRef.value;
    if (!file || file.name !== params.fileName) {
      throw new Error('上传文件链接已过期，请重新上传文件后再审核');
    }

    complianceFileProcessingText.value = '审核文件链接已过期，正在重新上传文件...';
    const uploadResult = await uploadComplianceFile(file);
    const refreshedParams: ComplianceReviewParams = {
      ...params,
      file_url: uploadResult.fileUrl,
      fileName: uploadResult.fileName,
      originalText: uploadResult.originalText || params.originalText,
      fileType: uploadResult.fileType || params.fileType,
      fileSize: uploadResult.fileSize || params.fileSize,
      fileUrl: uploadResult.fileUrl || params.fileUrl,
      uploadFileId: uploadResult.uploadFileId || params.uploadFileId,
      pdfContextId: uploadResult.pdfContextId || params.pdfContextId,
      pdfType: uploadResult.pdfType || params.pdfType,
      sourceFileUrl: uploadResult.sourceFileUrl || params.sourceFileUrl,
      parsedTxtUrl: uploadResult.parsedTxtUrl || params.parsedTxtUrl,
      parsedMarkdownUrl: uploadResult.parsedMarkdownUrl || params.parsedMarkdownUrl,
      locatorMode: uploadResult.locatorMode || params.locatorMode,
      locatorAvailable: typeof uploadResult.locatorAvailable === 'boolean' ? uploadResult.locatorAvailable : params.locatorAvailable,
      locatorUnavailableReason: uploadResult.locatorUnavailableReason || params.locatorUnavailableReason,
      reviewFileUrl: uploadResult.reviewFileUrl || params.reviewFileUrl,
      textSource: uploadResult.textSource || params.textSource,
    };
    lastComplianceParams.value = refreshedParams;
    return refreshedParams;
  };

  /**
   * 从会话消息历史中提取合规审核参数。
   * 从最后一条消息开始向前查找，取第一个包含合规参数的 metadata。
   *
   * @param session - 聊天会话
   * @returns 合规审核参数，找不到时返回 null
   */
  const getComplianceParamsFromSession = (session?: ChatSession | null): ComplianceReviewParams | null => {
    if (!session?.messages) return null;

    for (let index = session.messages.length - 1; index >= 0; index--) {
      const message = session.messages[index] as any;
      const metadata = message.metadata || {};
      const params =
        normalizeComplianceParams(metadata.complianceParams) ||
        normalizeComplianceParams(metadata.reviewContext?.reviewParams || metadata.reviewContext?.review_params) ||
        normalizeComplianceParams(metadata.reviewContext) ||
        normalizeComplianceParams(metadata);
      if (params) return params;
    }

    return null;
  };

  return {
    // 常量
    COMPLIANCE_PROCESSING_DISPLAY_TEXT,
    // 响应式状态
    lastComplianceParams,
    uploadedFileName,
    uploadedFileUrl,
    uploadedOriginalText,
    uploadedFileRef,
    uploadedFileExtraMeta,
    selectedDimensions,
    isComplianceFileProcessing,
    complianceFileProcessingText,
    isComplianceRegenerating,
    isComplianceSubmitting,
    // 计算属性
    uploadedFileMeta,
    // 工具函数
    getActualReviewDimensions,
    getReviewQuery,
    stripFileExtension,
    buildDimensionText,
    buildComplianceQuestionContent,
    buildComplianceSessionTitle,
    // 参数处理
    normalizeComplianceParams,
    buildReviewContext,
    buildComplianceMetadata,
    saveReviewContextSnapshot,
    refreshComplianceParamsFileUrl,
    getComplianceParamsFromSession,
    // 文件上传
    customUpload,
    handleRemoveUploadedFile,
    handleSelectAll,
  };
};
