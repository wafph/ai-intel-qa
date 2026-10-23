/** 独立授权、会话/问答 ID、SSE 终稿、DOCX 与第三方回执契约。无真实内网请求。 */
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import {before,after,beforeEach,test} from 'node:test';
import {createServer} from 'vite';
import {createMockDraftStore} from '../examples/mock-draft-store.mjs';
import {nextTick} from 'vue';
import {mountExternalComponent} from './helpers/external-component-renderer.mjs';

const listeners=new Set(), storage=new Map();
let server,access,streamModule,docxModule,bridge,http,requests,responses,outbox,onPost;
const docx=fs.readFileSync(new URL('./fixtures/external-draft.docx',import.meta.url));
globalThis.localStorage={getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)};
globalThis.sessionStorage={getItem:()=>{throw new Error('iframe storage disabled');},setItem:()=>{throw new Error('iframe storage disabled');},removeItem:()=>{}};
globalThis.window={location:new URL('http://localhost:5100/external-draft'),setTimeout,clearTimeout,
  addEventListener:(type,fn)=>{if(type==='message')listeners.add(fn);},removeEventListener:(type,fn)=>{if(type==='message')listeners.delete(fn);}};
window.parent={postMessage:(value,origin)=>{outbox.push({value,origin});onPost?.(value,origin);}};
const emit=(value,{origin='https://host.test',source=window.parent}={})=>{for(const fn of [...listeners])fn({data:value,origin,source});};
const settle=async()=>{for(let i=0;i<8;i++)await new Promise(r=>setImmediate(r));};
const json=data=>({status:200,data:{code:0,data},headers:{}});
const sse=events=>({status:200,headers:{},data:new ReadableStream({start(controller){
  const text=events.map(event=>`data:${JSON.stringify(event)}\r\n\r\n`).join('');const bytes=new TextEncoder().encode(text);
  // 任意分包，含中文跨 UTF-8 边界。
  for(let i=0;i<bytes.length;i+=13)controller.enqueue(bytes.slice(i,i+13));controller.close();
}})});
const delta=(id,text)=>({eventId:id,eventType:'message',content:text});
const finished=(id,text)=>({eventId:id,eventType:'message',payload:{event:'workflow_finished',data:{outputs:{answer:text,responseContent:text}}}});
const completed={eventType:'completed',payload:{status:'completed',recoverable:false}};
const done=(answer,id=10)=>({eventType:'done',status:'completed',answerContent:answer,answerEventId:id});

before(async()=>{
  server=await createServer({configFile:false,root:process.cwd(),resolve:{alias:{'@':path.join(process.cwd(),'src')}},server:{middlewareMode:true,watch:null,hmr:false},appType:'custom',ssr:{noExternal:['element-plus']},plugins:[{
    name:'offline-external-ui',enforce:'pre',resolveId(id){if(id==='element-plus')return '\0offline-external-ui';},load(id){if(id==='\0offline-external-ui')return 'const show=()=>{};export const ElMessage=Object.assign(show,{warning:show,error:show,success:show});';},
  }]});
  access=await server.ssrLoadModule('/src/services/externalDraftAccess.ts');
  streamModule=await server.ssrLoadModule('/src/composables/useExternalDraftStream.ts');
  docxModule=await server.ssrLoadModule('/src/composables/useExternalDraftDocx.ts');
  bridge=await server.ssrLoadModule('/src/services/externalDraftBridge.ts');
  ({http}=await server.ssrLoadModule('/src/services/http.ts'));
  http.interceptors.request.use(config=>{config.adapter=async c=>{
    requests.push(c);const next=responses.shift();if(next instanceof Error)throw next;
    const r=typeof next==='function'?await next(c):next;
    assert.ok(r,`Unexpected request: ${c.url}`);return {...r,config:c};
  };return config;});
  globalThis.document={referrer:'https://host.test/app'};
  globalThis.FileReader=class {readAsDataURL(blob){blob.arrayBuffer().then(buffer=>{this.result=`data:${blob.type||bridge.DOCX_MIME};base64,${Buffer.from(buffer).toString('base64')}`;this.onload?.();});}};
});
after(async()=>{access?.disposeExternalDraftAccess();await server?.close();});
beforeEach(()=>{
  access.disposeExternalDraftAccess();listeners.clear();storage.clear();requests=[];responses=[];outbox=[];onPost=null;
  window.location=new URL('http://localhost:5100/external-draft');document.referrer='https://host.test/app';
});
const authorize=async token=>{
  window.location=new URL(`http://localhost:5100/external-draft?token=${encodeURIComponent(token||'external+token')}`);
  responses.push(json({allowed:true,userId:'external-user',ancestorScope:['A'],descendantScope:['B']}));
  await access.initializeExternalDraftAccess();
  assert.equal(access.externalDraftAccess.status,'ready');
};
const enqueueRun=(events=[delta(1,'临时正文'),completed,done('最终正文')])=>{
  responses.push(c=>{const body=JSON.parse(c.data);return json({taskId:`task-${body.biz_params.inputs.qaId}`,qaId:body.biz_params.inputs.qaId,sessionId:body.session_id});},sse(events));
};

test('无 token 不借用内部登录缓存，不创建任务，不触碰 iframe 存储',async()=>{
  storage.set('ai_intel_auth_session','internal-session');window.__AGENT_TOKEN__='internal-token';
  await access.initializeExternalDraftAccess();
  await assert.rejects(streamModule.useExternalDraftStream().startDraft('q'),/授权/);
  assert.equal(requests.length,0);assert.equal(storage.get('ai_intel_auth_session'),'internal-session');
});
test('URL token 正确解码，经 validate 后才可用，不覆盖内部登录',async()=>{
  storage.set('ai_intel_auth_session','internal');await authorize('a+b/c==');
  assert.deepEqual(JSON.parse(requests[0].data),{agent_token:'a+b/c=='});
  assert.equal(requests[0].headers.get('Authorization'),undefined);
  assert.equal(access.getExternalCredential().token,'a+b/c==');assert.equal(storage.get('ai_intel_auth_session'),'internal');
});
test('toekn 拼写不被误认，hash 路由不被识别为当前独立入口',async()=>{
  window.location=new URL('http://localhost:5100/external-draft?toekn=x');await access.initializeExternalDraftAccess();assert.equal(requests.length,0);
  window.location=new URL('http://localhost:5100/#/external-draft?token=x');assert.equal(access.isExternalDraftLocation(),false);
});
test('父页面延迟传 token 仍可授权；其他窗口和其他父源消息被丢弃',async()=>{
  await access.initializeExternalDraftAccess();
  responses.push(json({allowed:true}));
  emit({data:{type:'SET_AGENTTOKEN',value:'wrong'}},{source:{}});
  emit({data:{type:'SET_AGENTTOKEN',value:'wrong'}},{origin:'https://other.test'});
  assert.equal(requests.length,0);
  emit({data:{type:'SET_AGENTTOKEN',value:'late'}});await settle();assert.equal(access.externalDraftAccess.status,'ready');
});
test('URL 和 READY 消息传相同 token，校验中去重',async()=>{
  window.location=new URL('http://localhost:5100/external-draft?token=x');
  let release;responses.push(()=>new Promise(resolve=>{release=()=>resolve(json({allowed:true}));}));
  const pending=access.initializeExternalDraftAccess();await settle();emit({data:{type:'SET_AGENTTOKEN',value:'x'}});await settle();
  assert.equal(requests.length,1);release();await pending;
});
test('401/403 和业务拒绝均不保留可用外部凭证',async()=>{
  for(const r of [{status:401,data:{detail:'授权过期'}},{status:403,data:{detail:'无权限'}},json({allowed:false})]){
    window.location=new URL('http://localhost:5100/external-draft?token=bad');responses.push(r);await access.initializeExternalDraftAccess();
    assert.equal(access.externalDraftAccess.status,'error');assert.throws(()=>access.getExternalCredential());
  }
});
test('授权服务连接错误与 token 缺失区分，不使用原缓存回退',async()=>{
  const error=new Error('network');error.code='ERR_NETWORK';responses.push(error);
  window.location=new URL('http://localhost:5100/external-draft?token=x');await access.initializeExternalDraftAccess();
  assert.match(access.externalDraftAccess.message,/连接失败/);assert.throws(()=>access.getExternalCredential());
});
test('晚返回的旧授权不能覆盖新 token',async()=>{
  await access.initializeExternalDraftAccess();let release;
  responses.push(()=>new Promise(resolve=>{release=()=>resolve(json({allowed:true,userId:'old'}));}));
  emit({data:{type:'SET_AGENTTOKEN',value:'old'}});await settle();
  responses.push(json({allowed:true,userId:'new'}));emit({data:{type:'SET_AGENTTOKEN',value:'new'}});await settle();
  release();await settle();assert.equal(access.getExternalCredential().token,'new');
});
test('同一会话两轮 session_id 不变，qaId/request_id 各自唯一，头与正文使用同一外部 token',async()=>{
  await authorize();const stream=streamModule.useExternalDraftStream();enqueueRun();const a=await stream.startDraft('第一轮');enqueueRun();const b=await stream.startDraft('第二轮');
  assert.equal(a.sessionId,b.sessionId);assert.notEqual(a.qaId,b.qaId);assert.notEqual(a.taskId,b.taskId);
  const creates=requests.filter(c=>c.url.endsWith('/draft/tasks')),bodies=creates.map(c=>JSON.parse(c.data));
  assert.notEqual(bodies[0].request_id,bodies[1].request_id);assert.notEqual(bodies[0].request_id,a.qaId);
  for(const c of creates){assert.equal(c.headers.get('Authorization'),'Bearer external+token');assert.equal(JSON.parse(c.data).agent_token,'external+token');}
  assert.ok(requests.filter(c=>c.method==='get').every(c=>!c.url.includes('agentToken=')));
});
test('新建会话才更换 session_id，各会话 qaId 仍独立',async()=>{
  await authorize();const s=streamModule.useExternalDraftStream();enqueueRun();const a=await s.startDraft('q');s.newSession();enqueueRun();const b=await s.startDraft('q');
  assert.notEqual(a.sessionId,b.sessionId);assert.notEqual(a.qaId,b.qaId);
});
test('completed 不结束，较短 workflow/done 终稿覆盖累积内容，重复 eventId 不叠加',async()=>{
  await authorize();const s=streamModule.useExternalDraftStream();enqueueRun([delta(1,'旧内容和新内容'),delta(1,'旧内容和新内容'),finished(2,'新内容'),completed,done('最终',3)]);
  const r=await s.startDraft('q');assert.equal(r.content,'最终');assert.equal(r.status,'completed');assert.equal(s.isDone.value,true);
});
test('只有 completed 无终稿时补查详情，不将临时正文当最终文件内容',async()=>{
  await authorize();enqueueRun([delta(1,'临时'),completed]);responses.push(json({status:'completed',answerContent:'终稿',answerEventId:2}));
  const r=await streamModule.useExternalDraftStream().startDraft('q');assert.equal(r.content,'终稿');
});
test('流中断且任务未完成时返回错误，不伪装完成',async()=>{
  await authorize();enqueueRun([delta(1,'部分')]);responses.push(json({status:'running',answerContent:'部分'}));
  const s=streamModule.useExternalDraftStream();await assert.rejects(s.startDraft('q'),/最终结果/);assert.equal(s.isDone.value,false);
});
test('创建任务网络异常后释放状态，可再次提交',async()=>{
  await authorize();responses.push(new Error('offline'));const s=streamModule.useExternalDraftStream();await assert.rejects(s.startDraft('q'));assert.equal(s.isDrafting.value,false);
  enqueueRun();assert.equal((await s.startDraft('again')).status,'completed');
});
test('创建期间点击停止，收到 taskId 后调用 stop，结果不标记完成',async()=>{
  await authorize();let release;responses.push(c=>new Promise(resolve=>{release=()=>{const b=JSON.parse(c.data);resolve(json({taskId:'stopped-task',qaId:b.biz_params.inputs.qaId,sessionId:b.session_id}));};}));
  const s=streamModule.useExternalDraftStream(), pending=s.startDraft('q');await settle();await s.stop();responses.push(json({status:'stopped'}));release();
  const r=await pending;assert.equal(r.status,'stopped');assert.ok(requests.some(c=>c.url.endsWith('/stopped-task/stop')));assert.equal(s.isDone.value,false);
});
test('生成 DOCX 使用 qaId 缓存键，不将 sessionId 混作 qa_id',async()=>{
  const d=docxModule.useExternalDraftDocx();responses.push(json({download_url:'http://10.210.101.117:8000/download/a.docx',file_name:'a.docx'}),{status:200,data:new Blob([docx])});
  await d.saveDraftDocx('qa-A','# 内容',{sessionId:'session-A',qaId:'qa-A',taskId:'task-A'});
  assert.equal(JSON.parse(requests[0].data).qa_id,'qa-A');assert.equal(d.getRecord('qa-A').sessionId,'session-A');
  assert.equal(d.getRecord('qa-A').attachment.fetchUrl,'/external-file-download/download/a.docx');
  assert.equal(requests[1].url,'/external-file-download/download/a.docx');assert.equal(d.getRecord('qa-A').status,'done');
});
test('下载拒绝 HTTP 错误、空文件和 HTML，接受实际 DOCX 文件',async()=>{
  for(const response of [{status:404,data:new Blob(['no'])},{status:200,data:new Blob([])},{status:200,data:new Blob(['<html>error</html>'])}]){
    responses.push(response);await assert.rejects(docxModule.fetchExternalDocx('/file'));
  }
  responses.push({status:200,data:new Blob([docx])});assert.equal((await docxModule.fetchExternalDocx('/file')).size,docx.length);
});
const identity={sessionId:'session-A',qaId:'qa-A',taskId:'task-A'};
const payload={...identity,fileName:'a.docx',downloadUrl:'https://files.test/download/a.docx',content:'# 内容',fileBase64:`data:${'application/vnd.openxmlformats-officedocument.wordprocessingml.document'};base64,${docx.toString('base64')}`};
const acknowledge=(sent,overrides={})=>emit({data:{type:'SAVE_DRAFT_RESULT',value:{...identity,requestId:sent.data.value.requestId,success:true,draftId:'draft-1',...overrides}}});
test('发送草稿后等待匹配回执，按会话/问答/任务/请求识别，不误收其他保存结果',async()=>{
  await authorize();const pending=bridge.sendDraftToParent(payload,{timeoutMs:1000});const sent=outbox.at(-1).value;
  acknowledge(sent,{qaId:'other'});acknowledge(sent,{sessionId:'other'});acknowledge(sent,{taskId:'other'});acknowledge(sent,{requestId:'other'});
  let resolved=false;pending.then(()=>{resolved=true;});await settle();assert.equal(resolved,false);
  acknowledge(sent);assert.equal((await pending).draftId,'draft-1');assert.equal(outbox.at(-1).origin,'https://host.test');
  assert.equal(JSON.stringify(sent).includes('external+token'),false);
});
test('保存失败、超时、缺草稿编号均不产生成功回执',async()=>{
  await authorize();let pending=bridge.sendDraftToParent(payload,{timeoutMs:1000});acknowledge(outbox.at(-1).value,{success:false,message:'入库失败'});await assert.rejects(pending,/入库失败/);
  pending=bridge.sendDraftToParent(payload,{timeoutMs:10});await assert.rejects(pending,/尚未确认/);
  pending=bridge.sendDraftToParent(payload,{timeoutMs:1000});acknowledge(outbox.at(-1).value,{draftId:''});await assert.rejects(pending,/草稿编号/);
});
test('第三方模拟保存实际文件并回执，同一 qaId 重试幂等，独立 qaId 可各自保存',async()=>{
  const store=createMockDraftStore();const a=await store.save({...payload,requestId:'request-1'}),retry=await store.save({...payload,requestId:'request-2'});
  assert.equal(a.draftId,retry.draftId);assert.equal(a.blob.size,docx.length);
  const b=await store.save({...payload,qaId:'qa-B',requestId:'request-3'});assert.notEqual(a.draftId,b.draftId);assert.equal(store.records.size,2);
});
test('DOCX 与父系统模拟入库端到端，成功回执后才标记保存，重复点击不发第二份',async()=>{
  await authorize();const d=docxModule.useExternalDraftDocx(),store=createMockDraftStore();
  responses.push(json({download_url:'https://files.test/download/a.docx'}),{status:200,data:new Blob([docx],{type:bridge.DOCX_MIME})});await d.saveDraftDocx('qa-A','# 内容',identity);
  onPost=sent=>{if(sent.data.type==='SAVE_DRAFT_TO_BOX')void store.save(sent.data.value).then(record=>acknowledge(sent,{draftId:record.draftId,simulated:true}));};
  await d.saveToDraftBox('qa-A','# 内容');assert.equal(d.getRecord('qa-A').sentToBox,true);assert.equal(d.getRecord('qa-A').simulated,true);
  const count=outbox.length;await d.saveToDraftBox('qa-A','# 内容');assert.equal(outbox.length,count);
});
test('新建会话/页面离开取消旧草稿等待，不污染新会话',async()=>{
  await authorize();const controller=new AbortController();const pending=bridge.sendDraftToParent(payload,{signal:controller.signal});controller.abort();await assert.rejects(pending,e=>e.name==='AbortError');
});

test('已过期的独立授权不能继续创建任务',async()=>{
  await authorize();access.getExternalCredential().expiresAt=Date.now()-1;
  const count=requests.length;await assert.rejects(streamModule.useExternalDraftStream().startDraft('q'),/过期/);assert.equal(requests.length,count);
});
test('空最终快照可以清空临时正文，不把临时文本送文件转换',async()=>{
  await authorize();enqueueRun([delta(1,'临时正文'),completed,done('')]);
  const result=await streamModule.useExternalDraftStream().startDraft('q');assert.equal(result.content,'');
});
test('已停止旧创建请求晚返回，不影响正在生成的新一轮',async()=>{
  await authorize();let release;
  responses.push(c=>new Promise(resolve=>{release=()=>{const body=JSON.parse(c.data);resolve(json({taskId:'old-task',qaId:body.biz_params.inputs.qaId,sessionId:body.session_id}));};}));
  const s=streamModule.useExternalDraftStream(), old=s.startDraft('old');await settle();await s.stop();
  enqueueRun();const current=await s.startDraft('new');responses.push(json({status:'stopped'}));release();const previous=await old;
  assert.equal(previous.status,'stopped');assert.equal(current.status,'completed');assert.notEqual(current.qaId,previous.qaId);assert.equal(s.isDone.value,true);
});
test('第三方保存失败保留本轮文件，可独立重试，不重复执行起草或转换',async()=>{
  await authorize();const d=docxModule.useExternalDraftDocx();responses.push(json({download_url:'https://files.test/download/a.docx'}),{status:200,data:new Blob([docx])});await d.saveDraftDocx('qa-A','# 内容',identity);
  onPost=sent=>{if(sent.data.type==='SAVE_DRAFT_TO_BOX')acknowledge(sent,{success:false,message:'模拟失败'});};
  await d.saveToDraftBox('qa-A','# 内容');assert.equal(d.getRecord('qa-A').sentToBox,false);assert.ok(d.getRecord('qa-A').attachment);assert.match(d.getRecord('qa-A').boxError,/失败/);
  onPost=sent=>{if(sent.data.type==='SAVE_DRAFT_TO_BOX')acknowledge(sent,{simulated:true});};
  await d.saveToDraftBox('qa-A','# 内容');assert.equal(d.getRecord('qa-A').sentToBox,true);assert.equal(requests.filter(c=>c.method==='post').length,2); // validate + convert
});

test('收到 done 后无需等待服务关闭 TCP，立即释放流并返回终稿',async()=>{
  await authorize();let cancelled=false;
  responses.push(c=>{const b=JSON.parse(c.data);return json({taskId:'task-open',qaId:b.biz_params.inputs.qaId,sessionId:b.session_id});});
  responses.push({status:200,data:new ReadableStream({start(controller){controller.enqueue(new TextEncoder().encode(`data:${JSON.stringify(done('已完成'))}\n\n`));},cancel(){cancelled=true;}})});
  const result=await streamModule.useExternalDraftStream().startDraft('q');assert.equal(result.content,'已完成');assert.equal(cancelled,true);
});

const resultComponent=path.join(process.cwd(),'src/components/ExternalDraftResult.vue');
const validFile=()=>({status:200,data:new Blob([docx],{type:bridge.DOCX_MIME})});
test('真实结果组件从生成、获取文件更新为附件，后台文件名原样展示',async()=>{
  const d=docxModule.useExternalDraftDocx();
  const view=await mountExternalComponent(resultComponent,()=>({record:d.getRecord('qa-A'),showBack:true}));
  try{
    let finishConvert,finishDownload;
    responses.push(()=>new Promise(resolve=>{finishConvert=()=>resolve(json({file_name:'公路工程投标管理办法_20261022174940971.docx',download_url:'/download/a.docx'}));}),
      ()=>new Promise(resolve=>{finishDownload=()=>resolve(validFile());}));
    const pending=d.saveDraftDocx('qa-A','# 内容',identity);await settle();await nextTick();
    assert.match(view.text(),/正在生成起草附件/);assert.doesNotMatch(view.text(),/保存到草稿箱/);
    finishConvert();await settle();await nextTick();
    assert.match(view.text(),/正在获取起草附件/);assert.equal(d.getRecord('qa-A').status,'saving');
    assert.doesNotMatch(view.text(),/起草完成/);assert.equal(outbox.length,0);
    finishDownload();await pending;await nextTick();
    assert.match(view.text(),/起草完成/);assert.match(view.text(),/公路工程投标管理办法_20261022174940971\.docx/);
    assert.deepEqual(view.elements('button').map(button=>button.children.map(child=>child.text).join('')||button.text),[
      'W公路工程投标管理办法_20261022174940971.docx','保存到草稿箱','重新起草']);
    assert.equal(requests.length,2);assert.equal(outbox.length,0);
  }finally{view.unmount();d.reset();}
});
test('真实结果组件显示转换失败并可重试，不一直停留在等待',async()=>{
  const d=docxModule.useExternalDraftDocx();const view=await mountExternalComponent(resultComponent,()=>({record:d.getRecord('qa-A')}));
  try{
    responses.push({status:500,data:{detail:'转换服务暂不可用'}});await d.saveDraftDocx('qa-A','# 内容',identity);await nextTick();
    assert.match(view.text(),/转换服务暂不可用/);assert.match(view.text(),/重试/);assert.doesNotMatch(view.text(),/请等待/);
    responses.push(json({file_name:'a.docx',download_url:'/download/a.docx'}),validFile());
    await d.saveDraftDocx('qa-A','# 内容',identity);await nextTick();assert.match(view.text(),/起草完成/);
  }finally{view.unmount();d.reset();}
});
test('文件读取失败保留转换结果，重试只 GET 文件，不重新转换',async()=>{
  const d=docxModule.useExternalDraftDocx();responses.push(json({file_name:'原名.docx',download_url:'/download/a.docx'}),{status:200,data:new Blob(['<html>404</html>'])});
  await d.saveDraftDocx('qa-A','# 内容',identity);assert.equal(d.getRecord('qa-A').status,'error');assert.match(d.getRecord('qa-A').error,/不是有效 DOCX/);
  responses.push(validFile());await d.saveDraftDocx('qa-A','# 内容',identity);
  assert.equal(d.getRecord('qa-A').status,'done');assert.equal(d.getRecord('qa-A').attachment.fileName,'原名.docx');
  assert.deepEqual(requests.map(request=>request.method),['post','get','get']);d.reset();
});
test('转换超时、文件读取超时均结束等待并显示可重试原因',async()=>{
  for(const phase of ['convert','download']){
    const d=docxModule.useExternalDraftDocx(),error=new Error('timeout');error.code='ECONNABORTED';
    if(phase==='download')responses.push(json({download_url:'/download/a.docx'}));responses.push(error);
    await d.saveDraftDocx('qa-A','# 内容',identity);assert.equal(d.getRecord('qa-A').status,'error');
    assert.equal(d.getRecord('qa-A').error,phase==='convert'?'文件生成超时，请重试':'文件获取超时，请重试');
    assert.equal(d.getRecord('qa-A').phase,'');d.reset();
  }
});
test('文件尚未就绪时不能下载或发送草稿，重复准备不重复请求',async()=>{
  await authorize();const d=docxModule.useExternalDraftDocx();let release;
  responses.push(()=>new Promise(resolve=>{release=()=>resolve(json({download_url:'/download/a.docx'}));}),validFile());
  const pending=d.saveDraftDocx('qa-A','# 内容',identity);await settle();const count=requests.length,messages=outbox.length;
  await d.saveDraftDocx('qa-A','# 内容',identity);await d.downloadAttachment('qa-A');await d.saveToDraftBox('qa-A','# 内容');
  assert.equal(requests.length,count);assert.equal(outbox.length,messages);release();await pending;
  await d.saveDraftDocx('qa-A','# 内容',identity);assert.equal(requests.length,count+1);d.reset();
});
test('点击附件使用已取文件和后台原名，不再请求转换或下载接口',async()=>{
  const d=docxModule.useExternalDraftDocx();responses.push(json({file_name:'原始文件名_20261022174940971.docx',download_url:'/download/a.docx'}),validFile());
  await d.saveDraftDocx('qa-A','# 内容',identity);const count=requests.length,links=[];
  const priorBody=document.body,priorCreate=document.createElement;
  document.body={appendChild(){}};document.createElement=()=>{const link={click(){links.push({href:this.href,download:this.download});},remove(){}};return link;};
  try{await d.downloadAttachment('qa-A');assert.equal(requests.length,count);assert.equal(links[0].download,'原始文件名_20261022174940971.docx');assert.match(links[0].href,/^blob:/);}
  finally{document.body=priorBody;document.createElement=priorCreate;d.reset();}
});
test('多轮独立文件复用到模拟草稿箱，重复保存不重新取文件',async()=>{
  await authorize();const d=docxModule.useExternalDraftDocx(),store=createMockDraftStore(),sent=[];
  onPost=message=>{if(message.data.type==='SAVE_DRAFT_TO_BOX'){sent.push(message.data.value);void store.save(message.data.value).then(record=>emit({data:{type:'SAVE_DRAFT_RESULT',value:{...message.data.value,success:true,draftId:record.draftId,simulated:true}}}));}};
  for(const qaId of ['qa-A','qa-B']){
    responses.push(json({file_name:`${qaId}.docx`,download_url:`/download/${qaId}.docx`}),validFile());
    await d.saveDraftDocx(qaId,`# ${qaId}`,{...identity,qaId,taskId:`task-${qaId}`});
  }
  const count=requests.length;await d.saveToDraftBox('qa-A','# qa-A');await d.saveToDraftBox('qa-B','# qa-B');
  assert.equal(requests.length,count);assert.equal(store.records.size,2);assert.deepEqual(sent.map(value=>[value.sessionId,value.qaId,value.fileName]),[['session-A','qa-A','qa-A.docx'],['session-A','qa-B','qa-B.docx']]);
  assert.equal((await store.records.get('session-A:qa-A').blob.arrayBuffer()).byteLength,docx.length);d.reset();
});
test('页面重置后迟到文件不会恢复旧附件，也不会进入新一轮',async()=>{
  const d=docxModule.useExternalDraftDocx();let release;
  responses.push(json({download_url:'/download/old.docx'}),()=>new Promise(resolve=>{release=()=>resolve(validFile());}));
  const pending=d.saveDraftDocx('qa-A','# 旧轮',identity);await settle();d.reset();release();await pending;
  assert.equal(d.getRecord('qa-A'),undefined);
  responses.push(json({file_name:'新轮.docx',download_url:'/download/new.docx'}),validFile());
  await d.saveDraftDocx('qa-B','# 新轮',{...identity,qaId:'qa-B',taskId:'task-B'});assert.equal(d.getRecord('qa-B').attachment.fileName,'新轮.docx');d.reset();
});
test('真实输入组件仅展示描述框和开始按钮，保留必填校验与提交内容',async()=>{
  const submissions=[];const view=await mountExternalComponent(path.join(process.cwd(),'src/components/ExternalDraftForm.vue'),()=>({length:'detailed',strength:'strong',onStart:value=>submissions.push(value)}));
  try{
    assert.match(view.text(),/文件要求描述/);assert.doesNotMatch(view.text(),/合同长度|详细版|简洁版|强弱势|强势|中立|弱势/);
    const button=view.elements('button')[0];assert.equal(button.text,'开始起草');button.props.onClick();await nextTick();assert.match(view.text(),/请填写文件描述/);assert.equal(submissions.length,0);
    view.elements('textarea')[0].props['onUpdate:modelValue']('  起草一份制度  ');button.props.onClick();assert.deepEqual(submissions,['起草一份制度']);
  }finally{view.unmount();}
});

test('真实结果组件在点击后等待草稿回执，失败可重试且模拟成功明确标记',async()=>{
  await authorize();const d=docxModule.useExternalDraftDocx();responses.push(json({file_name:'原名.docx',download_url:'/download/a.docx'}),validFile());
  await d.saveDraftDocx('qa-A','# 内容',identity);
  const view=await mountExternalComponent(resultComponent,()=>({record:d.getRecord('qa-A')}));
  try{
    const count=requests.length,pending=d.saveToDraftBox('qa-A','# 内容');await settle();await nextTick();
    assert.match(view.text(),/正在等待保存结果/);assert.equal(d.getRecord('qa-A').sentToBox,false);
    acknowledge(outbox.at(-1).value,{success:false,message:'草稿接口尚未接入'});await pending;await nextTick();
    assert.match(view.text(),/草稿接口尚未接入/);assert.equal(d.getRecord('qa-A').sending,false);assert.match(view.text(),/原名.docx/);
    onPost=sent=>{if(sent.data.type==='SAVE_DRAFT_TO_BOX')acknowledge(sent,{simulated:true});};
    await d.saveToDraftBox('qa-A','# 内容');await nextTick();assert.match(view.text(),/已模拟保存到草稿箱/);assert.equal(requests.length,count);
  }finally{view.unmount();d.reset();}
});
