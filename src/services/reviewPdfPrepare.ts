import { API } from '@/api/api';
import { request, isSuccessStatus } from '@/services/http';


export interface ReviewPdfDetectResult {
  code: number;
  message: string;
  status?: string;
  file_info?: {
    file_name?: string;
    file_type?: string;
    file_size?: number;
  };
  detect?: {
    is_pdf?: boolean;
    is_standard_pdf?: boolean;
    locator_available?: boolean;
    locator_mode?: string;
    pdf_type?: string;
    reason?: string;
    weak_original_view_available?: boolean;
    weak_original_view_tip?: string;
    frontend_next_step?: string;
  };
  pdf_detect?: {
    pdf_type?: string;
    can_use_pdf_locator?: boolean;
    locator_mode?: string;
    locator_unavailable_reason?: string;
  };
}

export interface ReviewPdfPrepareResult {
  code: number;
  message: string;
  status: string;
  context_id: string;
  file_info?: {
    file_name?: string;
    file_type?: string;
    file_size?: number;
    source_file_url?: string;
  };
  pdf_detect?: {
    pdf_type?: string;
    can_use_pdf_locator?: boolean;
    need_ocr?: boolean;
    locator_mode?: string;
    locator_unavailable_reason?: string;
  };
  review_input?: {
    review_input_mode?: string;
    review_file_type?: string;
    text_source?: string;
    parsed_txt_url?: string;
    parsed_markdown_url?: string;
    parsed_text?: string;
    parsed_markdown?: string;
    review_file_url?: string;
    review_file_id?: string;
  };
  original_dispatch?: {
    source_file_url?: string;
    locator_mode?: string;
    locator_available?: boolean;
    locator_unavailable_reason?: string;
  };
  stats?: Record<string, any>;
  errors?: any[];
}

export const isPdfFile = (file: File) => {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
};


export const detectReviewPdf = async (
  file: File,
  options: { sessionId?: string; userId?: string } = {},
): Promise<ReviewPdfDetectResult> => {
  const formData = new FormData();
  formData.append('file', file);
  if (options.sessionId) formData.append('session_id', options.sessionId);
  if (options.userId) formData.append('user_id', options.userId);

  const response = await request<ReviewPdfDetectResult>({
    url: API.reviewPdf.detect,
    method: 'POST',
    data: formData,
  });

  if (!isSuccessStatus(response.status)) {
    throw new Error(`PDF 前置检测失败: ${response.status}`);
  }

  return response.data;
};

export const prepareReviewPdf = async (
  file: File,
  options: { sessionId?: string; userId?: string; includeContent?: boolean; workers?: number; batchSize?: number } = {},
): Promise<ReviewPdfPrepareResult> => {
  const formData = new FormData();
  formData.append('file', file);
  if (options.sessionId) formData.append('session_id', options.sessionId);
  if (options.userId) formData.append('user_id', options.userId);
  formData.append('include_content', String(options.includeContent ?? true));
  if (options.workers) formData.append('workers', String(options.workers));
  if (options.batchSize) formData.append('batch_size', String(options.batchSize));

  const response = await request<ReviewPdfPrepareResult>({
    url: API.reviewPdf.prepare,
    method: 'POST',
    data: formData,
  });

  if (!isSuccessStatus(response.status)) {
    throw new Error(`PDF 预处理失败: ${response.status}`);
  }

  return response.data;
};

export const bindReviewPdfFile = async (
  contextId: string,
  data: {
    review_file_url: string;
    review_file_id?: string;
    review_file_type?: string;
    session_id?: string;
    message_id?: string;
    user_id?: string;
    agent_upload_response?: Record<string, any>;
  },
) => {
  if (!contextId) return null;
  const response = await request({
    url: API.reviewPdf.bindReviewFile(contextId),
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    data,
  });
  if (!isSuccessStatus(response.status)) {
    throw new Error(`绑定 PDF 审核文件失败: ${response.status}`);
  }
  return response.data;
};

export const fetchReviewPdfContext = async (contextId: string, includeContent = true) => {
  const response = await request<ReviewPdfPrepareResult>({
    url: API.reviewPdf.context(contextId, includeContent),
    method: 'GET',
  });
  if (!isSuccessStatus(response.status)) {
    throw new Error(`获取 PDF 上下文失败: ${response.status}`);
  }
  return response.data;
};

export const buildTxtFileFromPdfParsedText = (parsedText: string, originalPdfName: string) => {
  const baseName = originalPdfName.replace(/\.pdf$/i, '') || 'pdf';
  const content = [
    `【原始文件】${originalPdfName}`,
    '【解析方式】mineru25-pro',
    '【说明】以下内容为 PDF 解析后的文本，用于智能审核。',
    '',
    parsedText || '',
  ].join('\n');

  return new File([content], `${baseName}_mineru_parsed.txt`, {
    type: 'text/plain;charset=utf-8',
  });
};
