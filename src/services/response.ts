/**
 * 判断后端统一响应码是否表示成功。
 * 兼容历史 code=0/200 与 V11/V12 code=0000。
 */
export const isApiSuccessCode = (code: unknown) => {
  if (code === undefined || code === null || code === '') return true;
  const normalized = String(code);
  return normalized === '0' || normalized === '0000' || normalized === '200';
};

/** 获取并归一化业务数据：getApiMessage。 */
export const getApiMessage = (payload: any, fallback = '请求处理失败') =>
  payload?.msg || payload?.message || payload?.detail || payload?.error || fallback;

/**
 * 从统一响应或历史响应中取业务 data。
 */
export const getApiData = (payload: any) => payload?.data ?? payload;
