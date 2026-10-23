/** 仅供第三方联调的入库替身：不请求自建业务后端，记录只在当前父页面内存中。 */
export const createMockDraftStore = () => {
  const records = new Map();
  const save = async (value, { fail = false, fetchFile = url => fetch(url) } = {}) => {
    for (const key of ['requestId', 'sessionId', 'qaId', 'taskId', 'fileName', 'content']) {
      if (typeof value?.[key] !== 'string' || !value[key].trim()) throw new Error(`缺少 ${key}`);
    }
    if (fail) throw new Error('第三方草稿接口模拟失败，请重试');
    const key = `${value.sessionId}:${value.qaId}`;
    if (records.has(key)) return records.get(key); // 同一轮重试不重复入库。
    let blob;
    if (value.fileBase64) {
      if (!/^data:[^,]*;base64,/i.test(value.fileBase64)) throw new Error('文件内容格式无效');
      const bytes = Uint8Array.from(atob(value.fileBase64.slice(value.fileBase64.indexOf(',') + 1)), c => c.charCodeAt(0));
      blob = new Blob([bytes], { type: value.mimeType });
    } else {
      const url = new URL(value.downloadUrl);
      if (!/^https?:$/.test(url.protocol)) throw new Error('文件下载地址无效');
      const response = await fetchFile(value.downloadUrl);
      if (!response.ok) throw new Error(`模拟父系统下载文件失败（HTTP ${response.status}）`);
      blob = await response.blob();
    }
    const signature = new Uint8Array(await blob.slice(0, 4).arrayBuffer());
    if (signature[0] !== 80 || signature[1] !== 75 || signature[2] !== 3 || signature[3] !== 4) throw new Error('收到的文件不是有效 DOCX');
    const record = { ...value, fileBase64: undefined, blob, draftId: `mock-${globalThis.crypto?.randomUUID?.() || Date.now()}`, savedAt: new Date().toISOString() };
    records.set(key, record); return record;
  };
  return { records, save };
};
