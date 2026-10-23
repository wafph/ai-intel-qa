/** 使用真实 Vue 编译器和组件更新机制验证界面，无浏览器或新增测试依赖。 */
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {parse,compileScript} from 'vue/compiler-sfc';
import ts from 'typescript';
import {createRenderer,h,nextTick} from 'vue';

const require=createRequire(import.meta.url), components=new Map();
const node=(tag,text='')=>({tag,tagName:tag.toUpperCase(),text,children:[],props:{},parent:null,
  addEventListener(){},removeEventListener(){},focus(){globalThis.document.activeElement=this;}});
const remove=child=>{if(child.parent){const siblings=child.parent.children,index=siblings.indexOf(child);if(index>=0)siblings.splice(index,1);child.parent=null;}};
const renderer=createRenderer({
  createElement:tag=>node(tag),createText:text=>node('#text',text),createComment:()=>node('#comment'),
  setText:(element,text)=>{element.text=text;},setElementText:(element,text)=>{element.children=[];element.text=text;},
  insert:(child,parent,anchor=null)=>{remove(child);const index=anchor?parent.children.indexOf(anchor):-1;if(index<0)parent.children.push(child);else parent.children.splice(index,0,child);child.parent=parent;},
  remove,parentNode:child=>child.parent,nextSibling:child=>child.parent?.children[child.parent.children.indexOf(child)+1]||null,
  patchProp:(element,key,prior,value)=>{element.props[key]=value;},
});
const walk=root=>[root,...root.children.flatMap(walk)];
const textOf=root=>root.tag==='#comment'?'':root.text+root.children.map(textOf).join('');

export const mountExternalComponent=async(file,props)=>{
  let component=components.get(file);
  if(!component){
    const {descriptor}=parse(fs.readFileSync(file,'utf8'),{filename:file});
    const compiled=compileScript(descriptor,{id:'external-regression',inlineTemplate:true});
    const code=ts.transpileModule(compiled.content,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
    const module={exports:{}};new Function('require','module','exports',code)(require,module,module.exports);
    component=module.exports.default;components.set(file,component);
  }
  const root=node('root'),app=renderer.createApp({setup:()=>()=>h(component,props())});
  app.mount(root);await nextTick();
  return {text:()=>textOf(root),elements:tag=>walk(root).filter(element=>element.tag===tag),unmount:()=>app.unmount()};
};
