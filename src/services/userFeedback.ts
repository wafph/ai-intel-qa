/**
 * 用户问题反馈提交服务。
 *
 * 普通用户沿用当前智能体登录凭证提交，不使用独立反馈管理账号。
 * 截图与表单字段通过 multipart/form-data 一次性提交到统一后台。
 */
import { API } from '@/api/api';
import { parseAxiosResponseError } from './error';
import { authRequest, isSuccessStatus } from './http';
import { getApiData, getApiMessage, isApiSuccessCode } from './response';

export interface UserFeedbackSubmission {
  feedbackType: 'problem';
  description: string;
  functionId: 'qa' | 'search' | 'draft' | 'review' | 'other';
  contactPhone?: string;
  contactEmail?: string;
  clientRequestId: string;
  sessionId?: string;
  pagePath?: string;
  clientContext?: Record<string, unknown>;
  attachments: File[];
}

/** 提交用户问题反馈并返回后台反馈编号等公开结果。 */
export const submitUserFeedback = async (submission: UserFeedbackSubmission) => {
  const formData = new FormData();
  formData.append('feedbackType', submission.feedbackType);
  formData.append('description', submission.description.trim());
  formData.append('functionId', submission.functionId);
  formData.append('clientRequestId', submission.clientRequestId);

  if (submission.contactPhone?.trim()) {
    formData.append('contactPhone', submission.contactPhone.trim());
  }
  if (submission.contactEmail?.trim()) {
    formData.append('contactEmail', submission.contactEmail.trim());
  }
  if (submission.sessionId?.trim()) {
    formData.append('sessionId', submission.sessionId.trim());
  }
  if (submission.pagePath?.trim()) {
    formData.append('pagePath', submission.pagePath.trim());
  }
  if (submission.clientContext) {
    formData.append('clientContext', JSON.stringify(submission.clientContext));
  }
  submission.attachments.forEach((file) => formData.append('attachments', file));

  const response = await authRequest({
    url: API.feedback.submit,
    method: 'POST',
    data: formData,
  });

  if (!isSuccessStatus(response.status)) {
    const error = await parseAxiosResponseError(response, '反馈提交失败，请稍后重试');
    throw new Error(error.message);
  }

  const result = response.data;
  if (!isApiSuccessCode(result?.code)) {
    throw new Error(getApiMessage(result, '反馈提交失败，请稍后重试'));
  }
  return getApiData(result);
};
