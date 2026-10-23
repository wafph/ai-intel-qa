/** 统一文件上传与问答 URL 刷新；浏览器只携带用户凭证，平台选择与凭证均由后端管理。 */
import { API } from '@/api/api';
import { authRequest, isSuccessStatus } from '@/services/http';

export type UploadWorkflowCode = 'qa' | 'review';

/** 沿用 answer.metadata.uploadedFiles；不把原始 File 对象写入历史。 */
export interface QAFileSnapshot {
  uid: string;
  name: string;
  size: number;
  fileType: string;
  fileUrl: string;
  uploadFileId?: string;
  upload_ref?: string;
  expires_at?: number | null;
}

export interface AgentUploadResult {
  url: string;
  upload_ref?: string;
  expires_at?: number | null;
  reuploaded?: boolean;
  [key: string]: any;
}

/** 仅包含前端可直接展示的错误文案，不转发上游错误正文或凭证。 */
export class AgentUploadError extends Error {
  status: number;
  constructor(message: string, status = 0) {
    super(message);
    this.name = 'AgentUploadError';
    this.status = status;
  }
}

const validReference = (value: unknown): value is string =>
  typeof value === 'string' && /^qau_[0-9a-f]{32}$/.test(value);

const errorMessage = (status: number) => {
  if (status === 401) return '登录已失效，请重新登录后上传文件';
  if (status === 403) return '当前账号无权操作此文件，请确认访问权限';
  if (status === 404 || status === 410) return '文件已无法恢复，请重新选择原文件上传';
  if (status === 409) return '文件正在更新，请稍后重试';
  if (status === 413) return '文件超过上传大小限制，请选择较小的文件';
  if (status === 422) return '文件引用无效，请重新选择原文件上传';
  return '文件上传或链接更新失败，请稍后重试';
};

const readUploadResult = (status: number, body: any, requireReference: boolean): AgentUploadResult => {
  if (!isSuccessStatus(status)) throw new AgentUploadError(errorMessage(status), status);
  try {
    // 只校验，不使用 URL.toString() 重编码签名和查询参数。
    if (typeof body?.url !== 'string' || !/^https?:\/\//.test(body.url)) throw new Error();
    const parsed = new URL(body.url);
    if (!parsed.hostname || parsed.username || parsed.password) throw new Error();
    if (requireReference && !validReference(body.upload_ref)) throw new Error();
    return body;
  } catch {
    throw new AgentUploadError('文件上传结果无效，请稍后重试');
  }
};

export const getUploadFileId = (result: any): string => String(
  result?.file_id || result?.fileId || result?.uploadFileId || result?.id ||
  result?.data?.file_id || result?.data?.fileId || result?.data?.uploadFileId || result?.data?.id || '',
);

export const uploadWorkflowFile = async (file: File, workflowCode: UploadWorkflowCode): Promise<AgentUploadResult> => {
  const form = new FormData();
  form.append('file', file);
  try {
    const response = await authRequest({ url: API.agent.uploadFile(workflowCode), method: 'POST', data: form });
    return readUploadResult(response.status, response.data, workflowCode === 'qa');
  } catch (error) {
    if (error instanceof AgentUploadError) throw error;
    throw new AgentUploadError('文件上传失败，请检查网络后重试');
  }
};

/** 普通提交由后端决定复用或重传；重新生成可 force，始终只创建一轮业务任务。 */
export const refreshQAUploadedFiles = async (files: QAFileSnapshot[], force = false): Promise<QAFileSnapshot[]> => {
  if (files.some((file) => !validReference(file.upload_ref))) {
    throw new AgentUploadError('历史附件无法自动恢复，请重新选择原文件上传');
  }
  const results = new Map<string, AgentUploadResult>();
  const updated: QAFileSnapshot[] = [];
  for (const file of files) {
    const ref = file.upload_ref!;
    let result = results.get(ref);
    if (!result) {
      try {
        const response = await authRequest({
          url: API.agent.refreshQAFileUrl, method: 'POST', data: { upload_ref: ref, force },
        });
        result = readUploadResult(response.status, response.data, true);
        if (result.upload_ref !== ref) throw new AgentUploadError('文件引用校验失败，请重新选择原文件上传');
        results.set(ref, result);
      } catch (error) {
        if (error instanceof AgentUploadError) throw error;
        throw new AgentUploadError('文件链接更新失败，请检查网络后重试');
      }
    }
    updated.push({ ...file, fileUrl: result.url, uploadFileId: getUploadFileId(result) || file.uploadFileId,
      upload_ref: ref, expires_at: result.expires_at ?? null });
  }
  return updated;
};

export const snapshotQAFile = (file: Partial<QAFileSnapshot>): QAFileSnapshot => ({
  uid: file.uid || '', name: file.name || '', size: file.size || 0, fileType: file.fileType || '',
  fileUrl: file.fileUrl || '', uploadFileId: file.uploadFileId,
  upload_ref: file.upload_ref, expires_at: file.expires_at ?? null,
});

/** 保留历史附件查询工具；普通发送不再调用，重新生成使用被点击轮次的明确快照。 */
export const latestQAUploadedFiles = (messages: Array<{ role: string; metadata?: any }>): QAFileSnapshot[] => {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    const files = message.metadata?.uploadedFiles;
    if (message.role === 'user' && Array.isArray(files) && files.length) return files.map(snapshotQAFile);
  }
  return [];
};

/** 同一引用的新 URL 回填本地历史，下一次保存沿用现有 answer.metadata 通道。 */
export const updateQAUploadedFileMetadata = (messages: Array<{ metadata?: any }>, files: QAFileSnapshot[]) => {
  const byReference = new Map(files.filter((file) => file.upload_ref).map((file) => [file.upload_ref, file]));
  for (const message of messages) {
    if (Array.isArray(message.metadata?.uploadedFiles)) {
      message.metadata.uploadedFiles = message.metadata.uploadedFiles.map((file: QAFileSnapshot) =>
        byReference.has(file.upload_ref) ? { ...file, ...byReference.get(file.upload_ref) } : file);
    }
  }
};
