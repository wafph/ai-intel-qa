/** 离线上传契约测试：使用真实前端模块与 Axios 替身，不连接内网。 */
import assert from 'node:assert/strict';
import path from 'node:path';
import { after, before, beforeEach, test } from 'node:test';
import { createServer } from 'vite';
import { ref, computed } from 'vue';
import { createPinia, setActivePinia } from 'pinia';

const values = new Map();
globalThis.localStorage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) };
globalThis.__uploadTestMessages = [];
let server, service, http, senderModule, complianceModule, appModule, chatModule;
let requests, responses;
const refA = 'qau_' + 'a'.repeat(32);
const refB = 'qau_' + 'b'.repeat(32);
const signed = 'https://files.test/a.txt?Signature=a%2Bb%3D&Expires=1999999999';
const attachment = (upload_ref = refA) => ({ uid: upload_ref, name: 'document.txt', size: 4, fileType: 'txt', fileUrl: 'https://old.test/a', upload_ref, expires_at: 1 });

before(async () => {
  server = await createServer({
    configFile: false,
    resolve: { alias: { '@': path.join(process.cwd(), 'src') } },
    server: { middlewareMode: true, watch: null, hmr: false }, appType: 'custom',
    ssr: { noExternal: ['element-plus'] },
    plugins: [{ name: 'offline-element-plus', enforce: 'pre',
      resolveId(id) { if (id === 'element-plus') return '\0offline-element-plus'; },
      load(id) { if (id === '\0offline-element-plus') return `
        const show = (message) => globalThis.__uploadTestMessages.push(message);
        export const ElMessage = Object.assign(show, {warning:show,error:show,success:show});
        export const ElLoading = {service:()=>({close(){}})};
        export const ElMessageBox = {confirm:async()=>true};`;
      },
    }],
  });
  service = await server.ssrLoadModule('/src/services/agentUpload.ts');
  ({ http } = await server.ssrLoadModule('/src/services/http.ts'));
  senderModule = await server.ssrLoadModule('/src/composables/useMessageSender.ts');
  complianceModule = await server.ssrLoadModule('/src/composables/useComplianceReview.ts');
  appModule = await server.ssrLoadModule('/src/stores/app.ts');
  chatModule = await server.ssrLoadModule('/src/stores/chat.ts');
  http.defaults.adapter = async (config) => {
    requests.push(config);
    const next = responses.shift();
    if (next instanceof Error) throw next;
    if (typeof next === 'function') return next(config);
    return { status: next?.status ?? 200, data: next?.data ?? { url: signed, upload_ref: refA, expires_at: 1999999999 }, headers: {}, statusText: 'test', config };
  };
});
after(async () => { await server?.close(); });
beforeEach(() => {
  requests = []; responses = []; values.clear(); globalThis.__uploadTestMessages.length = 0;
  values.set('ai_intel_auth_session', JSON.stringify({ mode: 'agent', agentToken: 'user-token', expiresAt: Date.now() + 3600000 }));
  setActivePinia(createPinia());
});

function depsFor(files = [], messages = []) {
  const session = { id: 'session', title: 'title', messages: [...messages] };
  const calls = [];
  let id = 0;
  const deps = {
    chatStore: {
      getChatSession: () => session, updateHistoryItem() {},
      async saveConversationToServer(...args) { calls.push(['save', ...args]); return { success: true }; },
    },
    activeChatId: ref('session'), activeTab: ref('智能问答'), currentConversationUuid: ref('session'),
    isStreaming: ref(false), currentReasoning: ref(''), currentAnswer: ref(''), currentStreamingMessageId: ref(null),
    inputText: ref('问题'), scopesData: computed(() => ({ ancestorScope: [], descendantScope: [], user: '1' })),
    generateUUID: () => `qa-${++id}`, buildUnifiedAgentPayload: (code, input) => ({ code, input }), scrollToBottom() {},
    compliance: { lastComplianceParams: ref(null), isComplianceSubmitting: ref(false), isComplianceRegenerating: ref(false) },
    streamTask: {
      clearLocalActiveTasksForSession() {}, resetStreamState() {}, getPendingStopSyncPromise: () => null,
      async createWorkflowTask(code, inputs, messageId) { calls.push(['create', code, inputs, messageId]); return { taskId: 'task', qaId: messageId }; },
      async subscribeStreamTask() { calls.push(['subscribe']); }, getRecoverableFlag: () => true,
      isRecoverableTaskStatus: () => true, isMessageLocallyStopped: () => false,
      upsertStreamTask(task) { calls.push(['snapshot', task]); }, updateTaskMessage() {},
    },
    streamChunk: { stopStream: async () => {}, handleStreamError(id, message) { calls.push(['error', id, message]); } },
    sessionManager: { async createChatForMessage() {}, applySessionTitle() {} },
    qaUploadedFileList: ref(files.map((file) => ({ ...file, status: 'success' }))),
    isQAFileProcessing: ref(false), qaFileProcessingText: ref(''),
  };
  deps.clearQAUploadeFileList = () => { deps.qaUploadedFileList.value = []; };
  return { deps, session, calls, sender: senderModule.useMessageSender(deps) };
}

test('问答统一上传使用用户 Bearer 和 file，不发送 IAM 或 is_image', async () => {
  const result = await service.uploadWorkflowFile(new File(['data'], 'document.txt'), 'qa');
  const req = requests[0];
  assert.equal(req.url, '/api/v1/agentarts/workflows/qa/upload-file');
  assert.equal(req.headers.get('Authorization'), 'Bearer user-token');
  assert.equal(req.headers.get('X-Auth-Token'), undefined);
  assert.equal(req.data.get('file').name, 'document.txt');
  assert.equal(req.data.has('is_image'), false);
  assert.equal(result.url, signed);
});

test('审核上传走 review，保留业务文本和平台文件 ID', async () => {
  responses.push({data:{url:signed, text:'正文', file_id:'file-id'}});
  const c = complianceModule.useComplianceReview({appStore:{},userStore:{user:{}},chatStore:{},activeChatId:ref('s'),currentConversationUuid:ref('s'),isStreaming:ref(false)});
  const result = await c.uploadFileToAgentArts(new File(['local'], 'a.txt'), {originalText:'local'});
  assert.equal(requests[0].url, '/api/v1/agentarts/workflows/review/upload-file');
  assert.equal(result.originalText, '正文'); assert.equal(result.uploadFileId, 'file-id');
});

test('共用上传函数显式 qa 时返回可重传引用，包括 PDF 解析后的 TXT', async () => {
  const c = complianceModule.useComplianceReview({appStore:{},userStore:{user:{}},chatStore:{},activeChatId:ref('s'),currentConversationUuid:ref('s'),isStreaming:ref(false)});
  const result = await c.uploadFileToAgentArts(new File(['parsed'], 'document.txt'), {originalText:'parsed',workflowCode:'qa'});
  assert.equal(result.upload_ref, refA); assert.equal(requests[0].url, '/api/v1/agentarts/workflows/qa/upload-file');
});

test('上传接受本地 JWT，保持完整签名 URL', async () => {
  values.set('ai_intel_auth_session', JSON.stringify({ mode:'local', accessToken:'local-jwt', tokenType:'Bearer', expiresAt:Date.now()+100000 }));
  await service.uploadWorkflowFile(new File(['x'], 'x.txt'), 'qa');
  assert.equal(requests[0].headers.get('Authorization'), 'Bearer local-jwt');
});

test('刷新发送 upload_ref/force，不发送旧 URL、本地路径或用户 ID', async () => {
  const result = await service.refreshQAUploadedFiles([attachment()], true);
  assert.deepEqual(JSON.parse(requests[0].data), {upload_ref:refA,force:true});
  assert.equal(requests[0].url, '/api/v1/agentarts/workflows/qa/refresh-file-url');
  assert.equal(result[0].fileUrl, signed);
});

test('无到期时间仍询问后端，前端不假定永久有效', async () => {
  await service.refreshQAUploadedFiles([{...attachment(),expires_at:null}]);
  assert.equal(requests.length, 1);
});

test('同一引用去重，多文件逐个刷新并保留顺序', async () => {
  responses.push({data:{url:signed,upload_ref:refA,expires_at:null}}, {data:{url:'https://files.test/b',upload_ref:refB,expires_at:3}});
  const result = await service.refreshQAUploadedFiles([attachment(),attachment(refB),{...attachment(),uid:'copy'}]);
  assert.equal(requests.length, 2); assert.deepEqual(result.map((f)=>f.upload_ref),[refA,refB,refA]);
  assert.equal(result[2].uid, 'copy');
});

test('旧外部 URL 没有引用时要求重新选择原件，不尝试下载旧 URL', async () => {
  await assert.rejects(service.refreshQAUploadedFiles([{...attachment(),upload_ref:undefined}]), /重新选择原文件/);
  assert.equal(requests.length, 0);
});

for (const status of [401,403,404,409,410,413,422,502,504]) {
  test(`HTTP ${status} 使用安全文案，不显示上游正文或自动重试业务`, async () => {
    responses.push({status,data:{msg:'Authorization=secret; internal failure'}});
    await assert.rejects(service.refreshQAUploadedFiles([attachment()]), (error)=>error.status===status && !error.message.includes('secret'));
    assert.equal(requests.length, 1);
  });
}

test('拒绝无效上传 URL、缺少引用与返回引用不一致', async () => {
  for (const data of [{url:'file:///etc/passwd',upload_ref:refA},{url:signed},{url:signed,upload_ref:refB}]) {
    responses.push({data});
    await assert.rejects(service.refreshQAUploadedFiles([attachment()]));
  }
});

test('首次发送先刷新再保存引用，最后创建一次问答任务', async () => {
  const {sender,calls,session,deps} = depsFor([attachment()]);
  await sender.handleSendMessage('question');
  assert.equal(requests.length,1);
  assert.equal(calls[0][0],'save'); assert.equal(calls[1][0],'create');
  assert.deepEqual(calls[1][2].file_url,[signed]);
  assert.equal(session.messages[0].metadata.uploadedFiles[0].upload_ref,refA);
  assert.equal(calls.find((c)=>c[0]==='snapshot')[1].metadata.uploadedFiles[0].upload_ref,refA);
  assert.equal(deps.qaUploadedFileList.value.length,0);
});

test('普通文字追问不继承历史附件，不刷新旧 URL，也不写附件 metadata', async () => {
  const old = {role:'user',metadata:{uploadedFiles:[attachment()]}};
  const {sender,calls,session} = depsFor([], [old]);
  await sender.handleSendMessage('follow-up');
  assert.equal(requests.length,0);
  assert.equal(calls.find((c)=>c[0]==='create')[2].file_url,undefined);
  assert.equal(session.messages[0].metadata.uploadedFiles[0].fileUrl,'https://old.test/a');
  assert.equal(session.messages[1].metadata,undefined);
  assert.equal(session.messages[2].metadata,undefined);
  assert.equal(Object.hasOwn(service.snapshotQAFile({...attachment(),raw:new File(['x'],'x')}),'raw'),false);
});

test('重新生成使用该轮引用并强制刷新，保留输入区新文字和附件', async () => {
  const {sender,calls,deps} = depsFor([attachment(refB)]);
  const draft=JSON.parse(JSON.stringify(deps.qaUploadedFileList.value));
  await sender.handleRegenerate({content:'again',uploadedFiles:[attachment()]});
  assert.deepEqual(JSON.parse(requests[0].data),{upload_ref:refA,force:true});
  assert.deepEqual(calls.find((c)=>c[0]==='create')[2].file_url,[signed]);
  assert.deepEqual(deps.qaUploadedFileList.value,draft);
  assert.equal(deps.inputText.value,'问题');
});

test('重新生成无附件轮次不误继承其他轮次或当前选中文件', async () => {
  const {sender,calls,deps} = depsFor([attachment()], [{role:'user',metadata:{uploadedFiles:[attachment(refB)]}}]);
  await sender.handleRegenerate({content:'no file',uploadedFiles:[]});
  assert.equal(requests.length,0); assert.equal(calls.find((c)=>c[0]==='create')[2].file_url,undefined);
  assert.equal(deps.qaUploadedFileList.value.length,1);
  assert.equal(deps.inputText.value,'问题');
});

test('旧字符串重新生成入口不取当前待发附件，也不清空草稿', async () => {
  const {sender,calls,deps}=depsFor([attachment(refB)]);
  await sender.handleRegenerate('legacy text');
  assert.equal(requests.length,0);
  assert.equal(calls.find((c)=>c[0]==='create')[2].file_url,undefined);
  assert.equal(deps.qaUploadedFileList.value[0].upload_ref,refB);
  assert.equal(deps.inputText.value,'问题');
});

test('历史旧附件已失效且无引用时，普通文字仍可发送', async () => {
  const {sender,calls}=depsFor([], [{role:'user',metadata:{uploadedFiles:[{...attachment(),upload_ref:undefined}]}}]);
  await sender.handleSendMessage('text');
  assert.equal(requests.length,0);
  assert.equal(calls.filter((c)=>c[0]==='create').length,1);
});

test('问答重新生成后再发送纯文字，不重传上一轮文档', async () => {
  const {sender,calls,deps}=depsFor();
  await sender.handleRegenerate({content:'again',uploadedFiles:[attachment()]});
  // 本测试的订阅替身不自动完成流，显式模拟完成状态。
  deps.isStreaming.value=false; deps.currentStreamingMessageId.value=null;
  await sender.handleSendMessage('new text');
  assert.equal(requests.length,1);
  const created=calls.filter((c)=>c[0]==='create');
  assert.deepEqual(created[0][2].file_url,[signed]);
  assert.equal(created[1][2].file_url,undefined);
});

test('重新生成刷新失败仍保留下一条草稿和新附件', async () => {
  responses.push({status:410,data:{}});
  const {sender,calls,deps}=depsFor([attachment(refB)]);
  await sender.handleRegenerate({content:'again',uploadedFiles:[attachment()]});
  assert.equal(calls.length,0);
  assert.equal(deps.qaUploadedFileList.value[0].upload_ref,refB);
  assert.equal(deps.inputText.value,'问题');
});

test('刷新失败保留输入和待发文件，不插入空消息或创建任务', async () => {
  responses.push({status:410,data:{}});
  const {sender,calls,session,deps} = depsFor([attachment()]);
  await sender.handleSendMessage('question');
  assert.equal(session.messages.length,0); assert.equal(calls.length,0);
  assert.equal(deps.inputText.value,'问题'); assert.equal(deps.qaUploadedFileList.value.length,1);
  assert.equal(deps.isQAFileProcessing.value,false);
});

test('更新期间切换会话不误发，重复点击只刷新一次', async () => {
  let finish;
  responses.push((config)=>new Promise((resolve)=>{finish=()=>resolve({status:200,data:{url:signed,upload_ref:refA},headers:{},config});}));
  const {sender,calls,deps} = depsFor([attachment()]);
  const pending = sender.handleSendMessage('question');
  while (!finish) await new Promise((resolve)=>setImmediate(resolve));
  await sender.handleSendMessage('duplicate');
  deps.activeChatId.value='other'; finish(); await pending;
  assert.equal(requests.length,1); assert.equal(calls.length,0);
});

test('文件尚在上传时不提交问答', async () => {
  const {sender,calls,deps} = depsFor([attachment()]); deps.isQAFileProcessing.value=true;
  await sender.handleSendMessage('question'); assert.equal(requests.length,0); assert.equal(calls.length,0);
});

test('纯文字问答、检索和起草不请求文件接口', async () => {
  for (const tab of ['智能问答','智能检索','辅助起草']) {
    const {sender,calls,deps} = depsFor(); deps.activeTab.value=tab;
    await sender.handleSendMessage('text');
    assert.equal(calls.filter((c)=>c[0]==='create').length,1);
  }
  assert.equal(requests.length,0);
});

test('历史保存失败不会启动问答业务任务', async () => {
  const {sender,calls,deps} = depsFor([attachment()]);
  deps.chatStore.saveConversationToServer=async()=>({success:false});
  await sender.handleSendMessage('question');
  assert.equal(calls.filter((c)=>c[0]==='create').length,0);
});

test('App store 初始化不再请求 IAM Token，旧手动函数仍保留', async () => {
  const store = appModule.useAppStore(); await Promise.resolve();
  assert.equal(requests.length,0); assert.equal(typeof store.fetchTokenFromBackend,'function');
});

test('真实历史保存和历史恢复保留 upload_ref/expires_at', async () => {
  const store=chatModule.useChatStore();
  responses.push({data:{code:0,data:{}}});
  const metadata={uploadedFiles:[attachment()]};
  const saved=await store.saveConversationToServer('session','qa-1',{role:'user',content:'q',timestamp:Date.now(),metadata}, {role:'assistant',content:'a',timestamp:Date.now(),metadata},0,0,'qa');
  assert.equal(saved.success,true);
  const body = JSON.parse(requests[0].data);
  assert.equal(body.answer.metadata.uploadedFiles[0].upload_ref,refA);
  responses.push({data:{code:0,data:{historyJson:[{qaId:'qa-1',questionContent:'q',questionTime:'2026-10-21T00:00:00Z',answer:body.answer}]}}});
  const restored=await store.querySessionHistory('session','qa');
  assert.equal(restored.length,2);
  for (const message of restored) {
    assert.equal(message.metadata.uploadedFiles[0].upload_ref,refA);
    assert.equal(message.metadata.uploadedFiles[0].expires_at,1);
  }
});


test('历史保存期间切换页面或点击停止，不再创建业务任务', async () => {
  for (const action of ['switch','stop']) {
    const {sender,calls,deps} = depsFor([attachment()]);
    deps.chatStore.saveConversationToServer=async()=>{
      if(action==='switch') {deps.activeTab.value='智能检索'; deps.currentConversationUuid.value='other';}
      else {deps.isStreaming.value=false;deps.currentStreamingMessageId.value=null;}
      return {success:true};
    };
    await sender.handleSendMessage('question');
    assert.equal(calls.filter((call)=>call[0]==='create').length,0);
  }
});
