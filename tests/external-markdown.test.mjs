/** 校验真实组件样式编译，防止 deep 多选择器导致列表/表头规则丢失。 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {test} from 'node:test';
import {parse,compileStyle} from 'vue/compiler-sfc';

test('新增页 Markdown 编译后同时覆盖有序/无序列表和表头/单元格',()=>{
  const filename='src/components/ExternalDraftChat.vue',source=fs.readFileSync(filename,'utf8');
  const {descriptor}=parse(source,{filename});const result=compileStyle({source:descriptor.styles[0].content,filename,id:'data-v-markdown-test',scoped:true});
  assert.deepEqual(result.errors,[]);
  for(const tag of ['ul','ol','td','th','h1','h2','h3','p','blockquote','table','pre','code'])assert.match(result.code,new RegExp(`\\[data-v-markdown-test\\] ${tag}(?:[\\s,{])`));
  assert.match(result.code,/overflow-x: auto/);assert.match(result.code,/white-space: pre/);
  assert.match(descriptor.template.content,/renderMarkdown\(turn.answer\)/);assert.match(descriptor.template.content,/renderMarkdown\(streamingContent\)/);
});
