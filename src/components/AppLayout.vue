<!--
  应用主布局组件，承载侧边栏、顶部菜单、路由视图和输入框。
  从 App.vue 中抽离，使根组件保持简洁。
-->
<template>
  <el-config-provider :locale="locale" :message="{ grouping: true }">
    <div
      class="app-container"
      :class="{ 'sidebar-collapsed': sidebarCollapsed }"
    >
    <!-- 左侧侧边栏 -->
    <HistoryPanel
      :history-list="filteredHistory"
      :active-chat-id="activeChatId"
      :loading="isHistoryListLoading"
      :user="userStore.user"
      :collapsed="sidebarCollapsed"
      :active-tab="activeTab"
      :auth-mode="userStore.authMode"
      :search-keyword="historySearchKeyword"
      :search-results="historySearchResults"
      :search-loading="historySearchLoading"
      @select-chat="handleSelectChat"
      @new-chat="handleNewChat"
      @delete-chat="handleDeleteChat"
      @clear-history="handleClearHistory"
      @update-title="handleUpdateTitle"
      @toggle-favorite="handleToggleFavorite"
      @toggle-pin="handleTogglePin"
      @search-history="handleSearchHistory"
      @clear-search="handleClearHistorySearch"
      @select-search-result="handleSelectSearchResult"
      @toggle-collapse="toggleSidebar"
      @open-feedback="feedbackDialogVisible = true"
      @logout="handleLogout"
    />

    <!-- 右侧主内容区 -->
    <div class="main-content">
      <!-- 顶部菜单 -->
      <HeaderMenu
        :active-tab="activeTab"
        @tab-change="handleHeaderTabChange"
      />

      <!-- 内容区域 -->
      <div class="content-area">
        <!-- 路由视图区域 -->
        <div class="dynamic-content">
          <transition name="content-loading-fade">
            <div v-if="isContentAreaLoading" class="content-loading-state">
              <span class="content-loading-icon" aria-label="加载中"></span>
            </div>
          </transition>
          <router-view
            v-if="shouldRenderContentView"
            :key="activeChatId"
            :chat-data="currentChatData"
            :streaming="isStreaming"
            :current-reasoning="currentReasoning"
            :current-answer="currentAnswer"
            :current-streaming-message-id="currentStreamingMessageId"
            @stop-stream="stopStream"
            @regenerate="handleRegenerate"
            @sources-panel-toggle="handleSourcesPanelToggle"
          />
        </div>

        <!-- 底部固定输入框 -->
        <div
          class="input-container"
          :class="{ 'sources-panel-visible': isSourcesPanelVisible }"
          :style="inputContainerStyle"
        >
          <!-- 合规审核：文件处理中顶部指示器（spinner + 文案） -->
          <transition name="compliance-processing-fade">
            <div
              v-if="activeTab === '合规审核' && isComplianceFileProcessing"
              class="compliance-processing-indicator"
            >
              <span class="compliance-processing-spinner" aria-hidden="true"></span>
              <span>{{ complianceFileProcessingText || '文件正在解析中，请稍候...' }}</span>
            </div>
          </transition>
          <!-- 智能问答：文件处理中顶部指示器（与合规审核样式一致，spinner + 阶段文案） -->
          <transition name="compliance-processing-fade">
            <div
              v-if="activeTab === '智能问答' && isQAFileProcessing"
              class="compliance-processing-indicator"
            >
              <span class="compliance-processing-spinner" aria-hidden="true"></span>
              <span>{{ qaFileProcessingText || '文件正在解析中，请稍候...' }}</span>
            </div>
          </transition>
          <!-- ChatInput：输入框 + 发送按钮；合规审核为单文件上传，智能问答 Tab 支持多文件依次追加 -->
          <ChatInput
            ref="chatInputRef"
            :placeholder="inputPlaceholder"
            :active-tab="activeTab"
            :disabled="isSendDisabled"
            :is-compliance-mode="activeTab === '合规审核'"
            :streaming="isStreaming"
            :custom-upload="customUpload"
            :uploaded-file-name="uploadedFileName"
            :uploaded-file-meta="uploadedFileMeta"
            :is-compliance-file-processing="isComplianceFileProcessing"
            :compliance-file-processing-text="complianceFileProcessingText"
            :custom-upload-q-a="customUploadQA"
            :uploaded-file-list="qaUploadedFileList"
            :is-q-a-file-processing="isQAFileProcessing"
            @send="handleSendMessage"
            @stop="stopStream"
            @remove-upload="handleRemoveUploadedFile"
            @remove-qa-file="handleRemoveQAFile"
          >
            <ComplianceReviewExtras
              v-if="activeTab === '合规审核'"
              v-model:selected-dimensions="selectedDimensions"
              @select-all="handleSelectAll"
            />
          </ChatInput>
        </div>
      </div>
    </div>
    <FeedbackDialog
      v-model="feedbackDialogVisible"
      :active-tab="activeTab"
      :session-id="activeChatId"
    />

    <!-- 页面右侧固定的问题反馈入口：高层级悬浮按钮，点击打开反馈弹框（与侧边栏文字入口共用同一弹框）。
         首次进入时挂载 is-animated 播放引导动画（波纹扩散 + 轻微摇晃）吸引注意，用户点击过一次后动画永久停止 -->
    <el-tooltip content="问题反馈" placement="top" :show-after="200">
      <button
        type="button"
        class="global-feedback-entry"
        :class="{ 'is-animated': feedbackEntryAnimated }"
        aria-label="问题反馈"
        @click="handleFeedbackEntryClick"
      >
        <el-icon><ChatDotSquare /></el-icon>
      </button>
    </el-tooltip>
  </div>
  </el-config-provider>
</template>

<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';
import zhCn from 'element-plus/es/locale/lang/zh-cn';
import { ChatDotSquare } from '@element-plus/icons-vue';
import HeaderMenu from './HeaderMenu.vue';
import HistoryPanel from './HistoryPanel.vue';
import ChatInput from './ChatInput.vue';
import ComplianceReviewExtras from './ComplianceReviewExtras.vue';
import FeedbackDialog from './FeedbackDialog.vue';
import { useAppShell } from '@/composables/useAppShell';

const locale = zhCn;
const chatInputRef = ref<InstanceType<typeof ChatInput> | null>(null);
const feedbackDialogVisible = ref(false);

// 右侧固定反馈入口的引导动画开关：首次进入时播放“波纹扩散 + 轻微摇晃”吸引注意；
// 用户点击过一次后动画永久停止（localStorage 持久化标记，避免已发现入口的用户被反复打扰）
const FEEDBACK_ENTRY_SEEN_KEY = 'global-feedback-entry-seen';
/** 读取“已点击过反馈入口”的持久化标记；存储不可用时按未点击处理（继续播放动画，不影响功能）。 */
const readFeedbackEntrySeen = () => {
  try {
    return localStorage.getItem(FEEDBACK_ENTRY_SEEN_KEY) === '1';
  } catch {
    return false;
  }
};
const feedbackEntryAnimated = ref(!readFeedbackEntrySeen());

/** 点击右侧固定反馈入口：打开反馈弹框，并永久关闭引导动画。 */
const handleFeedbackEntryClick = () => {
  feedbackDialogVisible.value = true;
  if (!feedbackEntryAnimated.value) return;
  feedbackEntryAnimated.value = false;
  try {
    localStorage.setItem(FEEDBACK_ENTRY_SEEN_KEY, '1');
  } catch {
    // 存储不可用时静默降级：仅本次会话内停止动画
  }
};

const {
  activeChatId,
  activeTab,
  currentAnswer,
  currentChatData,
  currentReasoning,
  currentStreamingMessageId,
  customUpload,
  filteredHistory,
  handleClearHistory,
  handleDeleteChat,
  handleLogout,
  handleNewChat,
  handleRegenerate,
  handleSelectAll,
  handleSelectChat,
  handleSendMessage,
  handleRemoveUploadedFile,
  handleSearchHistory,
  handleClearHistorySearch,
  handleSelectSearchResult,
  handleSourcesPanelToggle,
  handleTabChange,
  handleToggleFavorite,
  handleTogglePin,
  handleUpdateTitle,
  inputContainerStyle,
  historySearchKeyword,
  historySearchResults,
  historySearchLoading,
  inputPlaceholder,
  isHistoryChatActive,
  isHistoryListLoading,
  isSendDisabled,
  isSelectingHistoryChat,
  isSourcesPanelVisible,
  isStreaming,
  selectedDimensions,
  sidebarCollapsed,
  stopStream,
  toggleSidebar,
  uploadedFileMeta,
  uploadedFileName,
  isComplianceFileProcessing,
  complianceFileProcessingText,
  userStore,
  // ---- 智能问答多文件上传新增解构 ----
  customUploadQA,
  qaUploadedFileList,
  isQAFileProcessing,
  qaFileProcessingText,
  handleRemoveQAFile,
} = useAppShell();

/** 判断是否应渲染路由视图：shouldRenderContentView。 */
const shouldRenderContentView = computed(() => {
  const hasCurrentMessages = (currentChatData.value?.messages?.length || 0) > 0;

  return Boolean(
    activeTab.value &&
      (!isHistoryChatActive.value || hasCurrentMessages),
  );
});

const isContentAreaLoading = computed(
  () => isSelectingHistoryChat.value || isHistoryListLoading.value,
);

/** 处理顶部 Tab 切换事件。 */
const handleHeaderTabChange = async (tabName: string) => {
  const changed = await handleTabChange(tabName);
  if (changed === false) return;
  await nextTick();
  chatInputRef.value?.clearInput();
};
</script>

<style src="@/styles/app-shell.less" lang="less" scoped></style>
