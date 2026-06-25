# v12.2.22 前端 iframe 复制降级修复说明

## 背景
第三方系统通过 iframe 嵌入当前 Web 页面后，点击复制按钮提示“复制失败”。直接访问当前 Web 页面时复制正常。

## 根因
iframe 场景下浏览器可能因 Permissions Policy、iframe allow 属性、焦点限制等原因拒绝 navigator.clipboard.writeText。旧逻辑在 writeText 抛错后直接返回失败，未继续尝试 document.execCommand('copy') 降级方案。

## 本次最小升级
仅调整前端复制逻辑，其它业务逻辑保持不变：

1. 新增 src/utils/clipboard.ts，统一复制工具 copyPlainText。
2. 优先使用 navigator.clipboard.writeText。
3. writeText 抛错后继续尝试 document.execCommand('copy')。
4. 用户问题复制、模型回答复制、引用来源/范文片段复制统一复用该工具。
5. 不修改任务流、文档下载、导出、PDF 预览、权限、路由等逻辑。

## 修改文件
- src/utils/clipboard.ts
- src/utils/messageCollapse.ts
- src/views/IntelligentQA.vue
- src/views/AuxiliaryDraft.vue

## 构建验证
已执行：

npm install --force
npm run build

构建通过。

## 第三方 iframe 建议配置
若父系统允许调整 iframe，建议增加：

<iframe
  src="https://jcx.hbjttz.com:21136/"
  allow="clipboard-write; clipboard-read"
  style="width: 100%; height: 100%; border: 0;"
></iframe>

如果 iframe 使用 sandbox，需结合实际安全要求至少评估：

sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-downloads"

注意：前端降级方案可以提升兼容性，但如果父页面 sandbox 或 Permissions Policy 完全禁止剪贴板能力，所有自动复制方式都可能失败，此时只能提示用户手动选择文本复制。
