/** 使用本机 HTTP 替身验证真实 Vite 开发代理；不连接部署环境。 */
import assert from 'node:assert/strict';
import {test} from 'node:test';
import http from 'node:http';
import {createServer,loadConfigFromFile} from 'vite';

test('显式 IP 开发代理及 qa/review/PDF/文件工具路径正确',async()=>{
  const upstream=http.createServer((req,res)=>{
    const chunks=[];req.on('data',chunk=>chunks.push(chunk));req.on('end',()=>{
      res.setHeader('Content-Type','application/json');res.end(JSON.stringify({path:req.url,method:req.method,authorization:req.headers.authorization,body:Buffer.concat(chunks).toString()}));
    });
  });
  await new Promise(resolve=>upstream.listen(0,'127.0.0.1',resolve));
  const target=`http://127.0.0.1:${upstream.address().port}`, names=['DEV_BACKEND_TARGET','DEV_FILE_TOOL_TARGET','DEV_REVIEW_PDF_TARGET'];
  const prior=names.map(name=>process.env[name]);names.forEach(name=>{process.env[name]=target;});
  let vite;
  try{
    const loaded=await loadConfigFromFile({command:'serve',mode:'development'});
    const config=loaded.config;
    for(const route of ['/api','/v1','/review-pdf-api','/watermark-api','/markdown-word-api','/external-file-download']){
      assert.equal(config.server.proxy[route].target,'http://10.210.101.117:8000');
    }
    // 仅测试时将已加载规则的 target 替换为本机替身，保留真实配置的 rewrite 等行为。
    const proxy=Object.fromEntries(Object.entries(config.server.proxy).map(([key,value])=>[key,{...value,target}]));
    vite=await createServer({...config,configFile:false,root:process.cwd(),optimizeDeps:{noDiscovery:true,include:[]},server:{...config.server,proxy,host:'127.0.0.1',port:0,strictPort:false,open:false,hmr:false}});await vite.listen();
    const base=`http://127.0.0.1:${vite.httpServer.address().port}`;
    for(const [input,expected] of [
      ['/api/v1/health','/v1/health'],['/v1/health','/v1/health'],
      ['/api/v1/agentarts/workflows/qa/upload-file','/v1/agentarts/workflows/qa/upload-file'],
      ['/api/v1/agentarts/workflows/review/upload-file','/v1/agentarts/workflows/review/upload-file'],
      ['/review-pdf-api/v1/review/pdf/detect','/v1/review/pdf/detect'],
      ['/markdown-word-api/convert','/v1/markdown-word/convert'],
      ['/external-file-download/download/a.docx?x=1','/download/a.docx?x=1'],
      ['/contract-draft-api/saveZDSingle','/exchangeAuthCenter/exchangeContractInfo/saveZDSingle'],
    ]){
      const response=await fetch(base+input,{headers:{Authorization:'Bearer offline-user'}});const body=await response.json();
      assert.equal(body.path,expected);assert.equal(body.authorization,'Bearer offline-user');
    }
    const form=new FormData();form.append('file',new Blob(['test upload']), 'a.txt');
    const response=await fetch(base+'/api/v1/agentarts/workflows/qa/upload-file',{method:'POST',headers:{Authorization:'Bearer offline-user'},body:form});
    const uploaded=await response.json();assert.equal(uploaded.method,'POST');assert.match(uploaded.body,/name="file"; filename="a.txt"/);
    const draftBody={appkey:'test-app',secretkey:'test-secret',data:{token:'external+token/==',wordPath:'https://files.test/download/a.docx',zdName:'测试制度'}};
    const saved=await fetch(base+'/contract-draft-api/saveZDSingle',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify(draftBody)});
    const draftEcho=await saved.json();assert.equal(draftEcho.path,'/exchangeAuthCenter/exchangeContractInfo/saveZDSingle');assert.deepEqual(JSON.parse(draftEcho.body),draftBody);
  }finally{
    await vite?.close();await new Promise(resolve=>upstream.close(resolve));names.forEach((name,i)=>{if(prior[i]===undefined)delete process.env[name];else process.env[name]=prior[i];});
  }
});
