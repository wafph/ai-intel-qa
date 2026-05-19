<template>
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
        @select-chat="handleSelectChat"
        @new-chat="handleNewChat"
        @delete-chat="handleDeleteChat"
        @clear-history="handleClearHistory"
        @update-title="handleUpdateTitle"
        @toggle-favorite="handleToggleFavorite"
        @toggle-pin="handleTogglePin"
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
            <!-- 流式传输控制 -->
            <div v-if="isStreaming" class="stream-controls">
              <el-button
                style="padding: 10px 20px"
                type="warning"
                plain
                @click="stopStream"
              >
                <span class="stop-icon">■</span>
                停止生成
              </el-button>
            </div>
            <ChatInput
              ref="chatInputRef"
              :placeholder="inputPlaceholder"
              :disabled="isSendDisabled"
              :is-compliance-mode="activeTab === '合规审核'"
              @send="handleSendMessage"
            />

            <ComplianceReviewExtras
              v-if="activeTab === '合规审核'"
              v-model:selected-dimensions="selectedDimensions"
              :uploaded-file-name="uploadedFileName"
              :custom-upload="customUpload"
              @select-all="handleSelectAll"
            />
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
  handleSourcesPanelToggle,
  handleTabChange,
  handleToggleFavorite,
  handleTogglePin,
  handleUpdateTitle,
  inputContainerStyle,
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
  uploadedFileName,
  userStore,
} = useAppShell();

const shouldRenderContentView = computed(() => {
  const hasCurrentMessages = (currentChatData.value?.messages?.length || 0) > 0;

  return Boolean(
    activeTab.value &&
      !isSelectingHistoryChat.value &&
      (!isHistoryChatActive.value || hasCurrentMessages),
  );
});

const handleHeaderTabChange = async (tabName: string) => {
  handleTabChange(tabName);
  await nextTick();
  chatInputRef.value?.clearInput();
};
</script>

<style src="./styles/app-shell.less" lang="less" scoped></style>



