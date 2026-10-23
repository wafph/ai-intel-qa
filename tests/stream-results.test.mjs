/** 加载真实任务/流式组合函数，离线回放 SSE；HTTP 和界面提示使用替身。 */
import assert from 'node:assert/strict';
import path from 'node:path';
import { after, before, beforeEach, test } from 'node:test';
import { createServer } from 'vite';
import { ref, computed } from 'vue';

const values = new Map();
globalThis.localStorage = { getItem:k=>values.get(k)??null, setItem:(k,v)=>values.set(k,v), removeItem:k=>values.delete(k) };
globalThis.window = { setTimeout, clearTimeout };
let server, taskModule, chunkModule, senderModule, reviewModule, http;
let requests, responses;
before(async () => {
  server = await createServer({
    configFile:false, root:process.cwd(),
    resolve:{alias:{'@':path.join(process.cwd(),'src')}},
    server:{middlewareMode:true,watch:null,hmr:false}, appType:'custom',
    ssr:{noExternal:['element-plus']},
    plugins:[{name:'offline-stream-ui',enforce:'pre',
      resolveId(id){if(id==='element-plus')return '\0offline-stream-ui';},
      load(id){if(id==='\0offline-stream-ui')return `
        const show=()=>{};
        export const ElMessage=Object.assign(show,{warning:show,error:show,success:show});
        export const ElLoading={service:()=>({close(){}})};
        export const ElMessageBox={confirm:async()=>true};`;},
    }],
  });
  taskModule=await server.ssrLoadModule('/src/composables/useStreamTask.ts');
  chunkModule=await server.ssrLoadModule('/src/composables/useStreamChunk.ts');
  senderModule=await server.ssrLoadModule('/src/composables/useMessageSender.ts');
  reviewModule=await server.ssrLoadModule('/src/composables/useComplianceReview.ts');
  ({http}=await server.ssrLoadModule('/src/services/http.ts'));
  const mockAdapter=async config=>{
    requests.push(config);
    const next=responses.shift();
    if(typeof next==='function')return next(config);
    if(next instanceof Error)throw next;
    return {status:200,data:{code:0,data:next||{}},headers:{},config};
  };
  http.interceptors.request.use(config=>{config.adapter=mockAdapter;return config;});
});
after(async()=>{await server?.close();});
beforeEach(()=>{
  values.clear();requests=[];responses=[];
  values.set('ai_intel_auth_session',JSON.stringify({mode:'agent',agentToken:'offline-token',expiresAt:Date.now()+3600000}));
});

function setup(tab='合规审核', messages=[]) {
  const session={id:'session',title:'test',messages};
  const saved=[];
  const chatStore={
    getChatSession:id=>id==='session'?session:undefined,
    historyList:[],updateHistoryItem(){},getFuncIdByTab:()=>tab==='合规审核'?'review':'qa',
    async saveConversationToServer(...args){saved.push(JSON.parse(JSON.stringify(args)));return {success:true};},
  };
  let index=0;
  const deps={chatStore,activeChatId:ref('session'),activeTab:ref(tab),currentConversationUuid:ref('session'),
    isStreaming:ref(true),currentAnswer:ref(''),currentReasoning:ref(''),currentStreamingMessageId:ref(null),
    inputText:ref(''),scopesData:computed(()=>({ancestorScope:[],descendantScope:[],user:'1'})),
    generateUUID:()=>`qa-${++index}`,buildUnifiedAgentPayload:(code,input)=>({code,input}),
    scrollToBottom(){},getCurrentAgentToken:()=>'',getTabByFunctionId:()=>tab};
  const task=taskModule.useStreamTask(deps);
  const chunk=chunkModule.useStreamChunk({...deps,streamTask:task});
  task.setProcessStreamChunk(chunk.processStreamChunk);
  return {deps,task,chunk,session,saved};
}
function start(state,{taskId='task',messageId='answer',functionId='review',...extra}={}) {
  if(!state.session.messages.some(m=>m.id===messageId))state.session.messages.push(
    {id:`user_${messageId}`,role:'user',content:'question',timestamp:Date.now()},
    {id:messageId,role:'assistant',content:'',streaming:true,timestamp:Date.now()});
  const task={taskId,messageId,qaId:messageId,sessionId:'session',functionId,tabName:state.deps.activeTab.value,
    status:'running',recoverable:true,lastEventId:0,answerEventId:0,answerContent:'',updatedAt:Date.now(),...extra};
  state.task.upsertStreamTask(task,true);
  state.task.updateTaskMessage(task,{content:task.answerContent});
  state.deps.currentStreamingMessageId.value=messageId;
  state.deps.isStreaming.value=true;
  state.task.setStreamDisplayState(Boolean(task.answerContent),'');
  return task;
}
const delta=(eventId,content)=>({eventId,eventType:'message',content,payload:{event:'message',data:{text:content}}});
const workflow=(eventId,answer,outputs={})=>({eventId,eventType:'message',payload:{event:'workflow_finished',data:{outputs:{...outputs,...(answer===undefined?{}:{answer,responseContent:answer})}}}});
const completed=(eventId)=>({eventId,eventType:'completed',payload:{status:'completed',recoverable:false}});
const done=(answer,answerEventId=10)=>({eventType:'done',status:'completed',recoverable:false,answerContent:answer,answerEventId});
const feed=(state,event,taskId='task',messageId='answer')=>state.chunk.processStreamChunk(event,messageId,taskId);
const body=(state,id='answer')=>state.session.messages.find(m=>m.id===id).content;

test('重新审核保留旧报告，新任务从空缓冲开始并只保存本轮最终正文',async()=>{
  const params={file_url:'https://files.test/a',fileName:'制度.txt',originalText:'正文',fileType:'txt',dimensions:['合规性'],query:'合规性'};
  const state=setup('合规审核',[
    {id:'old-user',role:'user',content:'审核',metadata:{complianceParams:params}},
    {id:'old-answer',role:'assistant',content:'前一次审核结果',streaming:false,taskStatus:'completed',metadata:{complianceParams:params}},
  ]);
  state.deps.isStreaming.value=false;state.deps.currentAnswer.value='前一次审核结果';
  const compliance=reviewModule.useComplianceReview({...state.deps,appStore:{},userStore:{user:{}}});
  let beforeFirst;
  const adapter={...state.task,
    async createWorkflowTask(code,inputs,messageId){return {taskId:'new-task',qaId:messageId,sessionId:'session',functionId:code,status:'running'};},
    async subscribeStreamTask(taskId){
      const id=state.task.activeStreamTasks.value[taskId].messageId;
      beforeFirst=state.deps.currentAnswer.value;
      await feed(state,delta(1,'前一次审核结果\n本次新结果'),taskId,id);
      await feed(state,workflow(2,'本次新结果'),taskId,id);
      await feed(state,completed(3),taskId,id);
      await feed(state,done('本次新结果',3),taskId,id);
    },
  };
  const sender=senderModule.useMessageSender({...state.deps,streamTask:adapter,streamChunk:state.chunk,compliance,
    sessionManager:{async createChatForMessage(){},applySessionTitle(){}}});
  await sender.handleRegenerate({content:'审核',complianceParams:params});
  assert.equal(beforeFirst,'');assert.equal(state.session.messages.length,4);
  assert.equal(body(state,'old-answer'),'前一次审核结果');
  assert.equal(state.session.messages[3].content,'本次新结果');
  assert.equal(state.saved.at(-1)[3].content,'本次新结果');
});

test('相同 eventId 顺序或并发重放只追加一次，不按文本去重',async()=>{
  const s=setup();start(s);
  await Promise.all([feed(s,delta(1,'重复句')),feed(s,delta(1,'重复句'))]);
  await feed(s,delta(1,'重复句'));
  assert.equal(body(s),'重复句');
  await feed(s,delta(2,'重复句'));
  assert.equal(body(s),'重复句重复句');
});

test('workflow_finished 的较短最终正文立即替换临时正文，不提前保存历史',async()=>{
  const s=setup();start(s);
  await feed(s,delta(1,'旧内容\n本次结果'));
  await feed(s,workflow(2,'本次结果'));
  assert.equal(body(s),'本次结果');assert.equal(s.saved.length,0);
  await feed(s,delta(3,'迟到增量'));
  assert.equal(body(s),'本次结果');
});

test('completed 保留任务直到 done，done 较短快照覆盖并持久化',async()=>{
  const s=setup();start(s);
  await feed(s,delta(1,'前一次审核结果\n本次新结果'));
  await feed(s,completed(2));
  assert.ok(s.task.activeStreamTasks.value.task);assert.equal(s.saved.length,0);
  assert.equal(s.deps.isStreaming.value,true);
  await feed(s,done('本次新结果',2));
  assert.equal(body(s),'本次新结果');assert.equal(s.saved.at(-1)[3].content,'本次新结果');
  assert.equal(s.task.activeStreamTasks.value.task,undefined);
});

test('最终快照同长度不同内容也覆盖，旧快照游标不能覆盖新正文',async()=>{
  const s=setup();start(s);
  await feed(s,delta(5,'AAAA'));
  await feed(s,{...workflow(4,'旧结果'),answerEventId:4});
  assert.equal(body(s),'AAAA');
  await feed(s,done('BBBB',6));assert.equal(body(s),'BBBB');
});

test('空正文加 data_json 十条检索片段保持成功，done 不丢来源',async()=>{
  const s=setup('智能检索');start(s,{functionId:'search'});
  const sources=Array.from({length:10},(_,i)=>({chunk_id:`chunk-${i}`,file_id:`file-${i}`,title:`制度${i}`,content:`片段${i}`,score:0.99}));
  await feed(s,delta(1,'应被最终空正文替换的临时内容'));
  await feed(s,workflow(2,'',{user_fields:{data_json:sources}}));
  await feed(s,completed(3));await feed(s,done('',3));
  const message=s.session.messages.find(m=>m.id==='answer');
  assert.equal(message.content,'');assert.equal(message.sources.length,10);
  assert.equal(message.taskStatus,'completed');assert.equal(s.saved.at(-1)[3].sources.length,10);
});

test('只补来源的旧事件重放不覆盖已经恢复的正文',async()=>{
  const s=setup('智能检索');start(s,{functionId:'search',answerContent:'已恢复答案',lastEventId:9,answerEventId:9});
  s.task.sourceOnlyReplayTaskIds.add('task');
  await feed(s,workflow(2,'过期答案',{data_json:[{chunk_id:'c',title:'制度',content:'片段'}]}));
  assert.equal(body(s),'已恢复答案');
  assert.equal(s.session.messages.find(m=>m.id==='answer').sources.length,1);
});

test('任务 ID、消息 ID、会话不匹配的旧事件不能污染本轮',async()=>{
  const s=setup();start(s);
  await feed(s,{...delta(1,'错误任务'),taskId:'other'});
  await feed(s,delta(2,'错误消息'),'task','other-answer');
  s.deps.activeChatId.value='other-session';await feed(s,delta(3,'错误会话'));
  assert.equal(body(s),'');
});

test('另一个消息开始后，旧任务增量和终态均不覆盖新回答',async()=>{
  const s=setup();start(s);
  s.deps.currentStreamingMessageId.value='new-answer';s.deps.currentAnswer.value='新回答';
  await feed(s,delta(1,'旧增量'));await feed(s,done('旧结果'));
  assert.equal(s.deps.currentAnswer.value,'新回答');assert.equal(body(s),'');
  assert.equal(s.deps.currentStreamingMessageId.value,'new-answer');
});

test('本地停止之后缓冲区中的增量和 done 不恢复任务',async()=>{
  const s=setup();start(s);await feed(s,delta(1,'已生成'));
  s.task.markTaskLocallyStopped('task');s.task.markMessageLocallyStopped('answer');
  await feed(s,delta(2,'不应追加'));await feed(s,done('不应覆盖'));
  assert.equal(body(s),'已生成');
});

test('分段 think 缓冲不进入正式正文，最终快照清除残留缓冲',async()=>{
  const s=setup('智能问答');start(s,{functionId:'qa'});
  await feed(s,delta(1,'<thi'));await feed(s,delta(2,'nk>思考过程'));
  assert.equal(body(s),'');
  await feed(s,done('正式回答',3));assert.equal(body(s),'正式回答');
});

test('会话恢复接受较短的终态任务详情，并保存修正结果',async()=>{
  const s=setup();start(s,{answerContent:'旧结果和新结果',lastEventId:2,answerEventId:2});
  responses.push({status:'completed',recoverable:false,qaId:'answer',answerContent:'新结果',answerEventId:3,lastEventId:3});
  await s.task.resumeTaskForSession('session');
  assert.equal(body(s),'新结果');assert.equal(s.saved.at(-1)[3].content,'新结果');
});

test('会话恢复接受空最终快照，保留检索来源',async()=>{
  const s=setup('智能检索');start(s,{functionId:'search',answerContent:'临时正文',lastEventId:2,answerEventId:2});
  responses.push({status:'completed',recoverable:false,qaId:'answer',answerContent:'',answerEventId:3,sources:[{chunk_id:'c',title:'制度',content:'片段'}]});
  await s.task.resumeTaskForSession('session');
  assert.equal(body(s),'');assert.equal(s.session.messages.find(m=>m.id==='answer').sources.length,1);
});

test('会话恢复不接受游标更旧的长快照',async()=>{
  const s=setup();start(s,{answerContent:'新结果',lastEventId:5,answerEventId:5});
  responses.push({status:'completed',recoverable:false,qaId:'answer',answerContent:'过期的更长的旧结果',answerEventId:3});
  await s.task.resumeTaskForSession('session');assert.equal(body(s),'新结果');
});

function streamResponse(config,events){
  const encoder=new TextEncoder();
  return {status:200,headers:{},config,data:new ReadableStream({start(controller){
    for(const event of events)controller.enqueue(encoder.encode(`data:${JSON.stringify(event)}\n\n`));
    controller.close();
  }})};
}
test('completed 后直接断流，补查详情并使用最终正文收尾',async()=>{
  const s=setup();start(s);
  responses.push(config=>streamResponse(config,[delta(1,'临时旧结果叠加新结果'),completed(2)]),
    {status:'completed',recoverable:false,answerContent:'新结果',answerEventId:2});
  await s.task.subscribeStreamTask('task');
  assert.equal(body(s),'新结果');assert.equal(s.saved.at(-1)[3].content,'新结果');
  assert.equal(requests.length,2);
});

test('completed 后断流但已收到 workflow 最终快照，直接收尾不额外查询',async()=>{
  const s=setup();start(s);
  responses.push(config=>streamResponse(config,[delta(1,'临时结果'),workflow(2,'最终结果'),completed(3)]));
  await s.task.subscribeStreamTask('task');
  assert.equal(body(s),'最终结果');assert.equal(s.saved.at(-1)[3].content,'最终结果');
  assert.equal(requests.length,1);
});

test('completed 断流且最终详情暂不可用，释放输入占用且不保存临时内容',async()=>{
  for(const result of [new Error('offline'),{status:'running'}]){
    const s=setup();start(s);
    responses.push(config=>streamResponse(config,[delta(1,'临时内容'),completed(2)]),result);
    await s.task.subscribeStreamTask('task');
    assert.equal(s.deps.isStreaming.value,false);
    assert.equal(s.saved.length,0);
  }
});

test('被替换订阅的缓冲事件不会进入新消息',async()=>{
  const s=setup();start(s);
  let release,ready;
  const waiting=new Promise(resolve=>{ready=resolve;});
  responses.push(config=>({status:200,headers:{},config,data:new ReadableStream({start(controller){
    release=()=>{controller.enqueue(new TextEncoder().encode(`data:${JSON.stringify(delta(1,'旧订阅内容'))}\n\n`));controller.close();};ready();
  }})}));
  const pending=s.task.subscribeStreamTask('task');await waiting;
  s.task.detachStreamSubscription(false);s.deps.currentStreamingMessageId.value='new-answer';s.deps.currentAnswer.value='新结果';
  release();await pending;
  assert.equal(s.deps.currentAnswer.value,'新结果');assert.equal(body(s),'');
});
