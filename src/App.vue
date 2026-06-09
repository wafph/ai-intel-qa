<!--
  根组件，承载路由页面并提供全局页面容器。
  本文件属于规章制度智能体前端最新版交付代码，整理时仅补充说明与注释，不改变业务逻辑。
-->
﻿<template>
  <template v-if="showFullLayout">
    <div class="app-container">
      <!-- 左侧侧边栏 -->
      <HistoryPanel
        :history-list="filteredHistory"
        :active-chat-id="activeChatId"
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
            <transition name="compliance-processing-fade">
              <div
                v-if="activeTab === '合规审核' && isComplianceFileProcessing"
                class="compliance-processing-indicator"
              >
                <span class="compliance-processing-spinner" aria-hidden="true"></span>
                <span>{{ complianceFileProcessingText || '文件正在解析中，请稍候...' }}</span>
              </div>
            </transition>
            <ChatInput
              ref="chatInputRef"
              :placeholder="inputPlaceholder"
              :disabled="isSendDisabled"
              :is-compliance-mode="activeTab === '合规审核'"
              :streaming="isStreaming"
              :custom-upload="customUpload"
              :uploaded-file-name="uploadedFileName"
              :uploaded-file-meta="uploadedFileMeta"
              :is-compliance-file-processing="isComplianceFileProcessing"
              :compliance-file-processing-text="complianceFileProcessingText"
              @send="handleSendMessage"
              @stop="stopStream"
              @remove-upload="handleRemoveUploadedFile"
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
    </div>
  </template>
  <template v-else>
    <router-view></router-view>
  </template>
</template>

<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';
import HeaderMenu from './components/HeaderMenu.vue';
import HistoryPanel from './components/HistoryPanel.vue';
import ChatInput from './components/ChatInput.vue';
import ComplianceReviewExtras from './components/ComplianceReviewExtras.vue';
import { useAppShell } from './composables/useAppShell';

const chatInputRef = ref<InstanceType<typeof ChatInput> | null>(null);

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
  isSendDisabled,
  isSelectingHistoryChat,
  isSourcesPanelVisible,
  isStreaming,
  selectedDimensions,
  showFullLayout,
  sidebarCollapsed,
  stopStream,
  toggleSidebar,
  uploadedFileMeta,
  uploadedFileName,
  isComplianceFileProcessing,
  complianceFileProcessingText,
  userStore,
} = useAppShell();

/** 判断是否应执行指定逻辑：shouldRenderContentView。 */
const shouldRenderContentView = computed(() => {
  const hasCurrentMessages = (currentChatData.value?.messages?.length || 0) > 0;

  return Boolean(
    activeTab.value &&
      !isSelectingHistoryChat.value &&
      (!isHistoryChatActive.value || hasCurrentMessages),
  );
});

/** 处理用户交互或组件事件：handleHeaderTabChange。 */
const handleHeaderTabChange = async (tabName: string) => {
  const changed = await handleTabChange(tabName);
  if (changed === false) return;
  await nextTick();
  chatInputRef.value?.clearInput();
};
</script>

<style src="./styles/app-shell.less" lang="less" scoped></style>



