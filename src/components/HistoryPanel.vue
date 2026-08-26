<!--
  左侧历史会话面板，支持搜索、切换、新建、收藏、置顶和标题编辑。
  本文件属于规章制度智能体前端最新版交付代码，整理时仅补充说明与注释，不改变业务逻辑。
-->
<template>
  <div class="history-panel" :class="{ 'is-collapsed': collapsed }">
    <button
      class="sidebar-collapse-btn"
      :aria-label="collapsed ? '展开侧边栏' : '折叠侧边栏'"
      @click="$emit('toggle-collapse')"
    >
      <el-icon v-if="collapsed">
        <Expand />
      </el-icon>
      <el-icon v-else>
        <Fold />
      </el-icon>
    </button>
    <!-- 顶部区域 -->
    <div class="logo" v-show="!collapsed">
      <!-- 左上角小 logo 暂时不展示，保留代码便于后续恢复。 -->
      <!-- <img src="/images/logos.png" alt="Logo" /> -->
      <span>AI+规章制度智能体</span>
    </div>

    <div class="panel-header">
      <button class="new-chat-btn" v-show="!collapsed" @click="handleNewChat">
        <img src="/images/chats.png" alt="" />
        <span class="btn-text">新聊天</span>
      </button>
      <div class="history-search" v-show="!collapsed">
        <el-icon><Search /></el-icon>
        <input
          v-model="localSearchKeyword"
          class="history-search-input"
          type="text"
          placeholder="搜索历史对话"
          @input="handleSearchInput"
        />
        <button
          v-if="localSearchKeyword"
          class="search-clear-btn"
          type="button"
          aria-label="清除搜索"
          @click="clearSearch"
        >
          ×
        </button>
      </div>
    </div>

    <!-- 历史列表 -->
    <div class="history-list" v-show="!collapsed">
      <div class="list-header">
        <h3>历史对话</h3>
        <button
          v-if="filteredHistory.length > 0"
          class="clear-btn"
          @click="handleClearAllHistory"
        >
          清空
        </button>
      </div>

      <div v-if="loading" class="history-skeleton" aria-hidden="true">
        <el-skeleton animated>
          <template #template>
            <div
              v-for="index in historySkeletonCount"
              :key="index"
              class="history-skeleton-item"
            >
              <el-skeleton-item variant="text" class="history-skeleton-title" />
              <el-skeleton-item variant="text" class="history-skeleton-time" />
            </div>
          </template>
        </el-skeleton>
      </div>

      <template v-else-if="isSearchMode">
        <div v-if="searchLoading" class="empty-state search-state">
          <div class="empty-icon"><el-icon><Search /></el-icon></div>
          <p>正在搜索历史对话...</p>
        </div>

        <div v-else-if="searchResults.length === 0" class="empty-state search-state">
          <div class="empty-icon"><el-icon><Search /></el-icon></div>
          <p>未找到相关历史对话</p>
          <p class="empty-tip">可尝试输入问题关键词或答案中的句子</p>
        </div>

        <div v-else class="history-items search-result-list">
          <div
            v-for="result in normalizedSearchResults"
            :key="`${result.sessionId}-${result.qaId || result.id}`"
            class="history-item search-result-item"
            @click="handleSelectSearchResult(result)"
          >
            <div class="item-content">
              <div class="item-title">
                {{ result.sessionTitle || result.title || '历史会话' }}
              </div>
              <div class="search-snippet" v-html="result.highlightText"></div>
              <div class="item-meta">
                <span class="item-time">{{
                  formatRelativeTime(
                    result.createTime || result.answerTime || result.time || Date.now(),
                  )
                }}</span>
              </div>
            </div>
          </div>
        </div>
      </template>

      <template v-else>
        <div v-if="filteredHistory.length === 0" class="empty-state">
          <div class="empty-icon">📁</div>
          <p>暂无历史对话</p>
          <p class="empty-tip">点击新聊天创建对话</p>
        </div>

        <div v-else class="history-items">
          <!-- ✅ 修改：将置顶的会话放在最前面 -->
          <div v-for="item in sortedHistory" :key="item.date" class="history-group">
            <div class="group-date" v-if="item.isTopGroup">{{ item.date }}</div>
            <div
              v-for="history in item.items"
              :key="history.id"
              :class="[
                'history-item',
                {
                  active: activeChatId === history.id,
                  collected: history.isCollected,
                  pinned: history.topStatus === 1,
                },
              ]"
              @mouseenter="handleMouseEnter(history.id)"
              @mouseleave="handleMouseLeave(history.id)"
              @click="handleSelectChat(history.id)"
            >
              <div class="item-content">
                <div class="item-title">
                  <span
                    v-if="history.isCollected && hoveredItemId === history.id"
                    class="favorite-icon"
                  >
                    ★
                  </span>

                  <!-- ✅ 编辑模式：显示输入框 -->
                  <el-input
                    v-if="editingId === history.id"
                    v-model="editingTitle"
                    size="small"
                    class="title-input"
                    @blur="saveTitle(history.id)"
                    @keyup="handleTitleInputKeyup($event, history.id)"
                    ref="titleInputRef"
                  />

                  <!-- ✅ 查看模式：显示文本 -->
                  <span v-else @dblclick="startEdit(history.id, history.title)">
                    <span v-if="history.topStatus === 1" class="pin-icon"
                      ><img
                        style="width: 16px; height: 16px"
                        src="/images/top.svg"
                        alt=""
                    /></span>
                    {{ history.title }}
                  </span>
                </div>

                <div class="item-meta">
                  <span class="item-time">{{ history.formattedTime }}</span>
                </div>
              </div>

              <div
                v-if="hoveredItemId === history.id"
                class="item-menu-container"
                @click.stop
              >
                <button class="menu-toggle-btn" @click="toggleMenu(history.id, $event)">⋮</button>

                <Teleport to="body">
                  <div
                    v-if="visibleMenuId === history.id"
                    class="history-dropdown-menu"
                    :class="{ 'opens-up': menuOpensUp }"
                    :style="menuPositionStyle"
                    @click.stop
                  >
                    <button
                      class="menu-item"
                      :class="{ favorited: history.isCollected }"
                      @click="handleToggleFavorite(history.id)"
                    >
                      <span class="menu-icon">★</span>
                      <span class="menu-text">
                        {{ history.isCollected ? '取消收藏' : '收藏' }}
                      </span>
                    </button>

                    <button
                      class="menu-item pin"
                      @click="handleTogglePin(history.id, history.topStatus === 1)"
                    >
                      <div class="menu-icon">
                        <template v-if="history.topStatus === 1">
                          <img
                            src="/images/bottom.svg"
                            style="width: 13px; height: 13px"
                            alt=""
                          />
                        </template>
                        <template v-else>
                          <img
                            src="/images/top.svg"
                            style="width: 16px; height: 16px"
                            alt=""
                          />
                        </template>
                      </div>
                      <span class="menu-text">
                        {{ history.topStatus === 1 ? '取消置顶' : '置顶' }}
                      </span>
                    </button>

                    <button
                      class="menu-item edit"
                      @click="startEdit(history.id, history.title)"
                    >
                      <el-icon class="menu-icon"><Edit /></el-icon>
                      <span class="menu-text">修改</span>
                    </button>

                    <button class="menu-item delete" @click="handleDeleteChat(history.id)">
                      <el-icon class="menu-icon"><Delete /></el-icon>
                      <span class="menu-text">删除</span>
                    </button>
                  </div>
                </Teleport>
              </div>
            </div>
          </div>
        </div>
      </template>
    </div>

    <!-- 右下角个人中心 -->
    <div class="user-center-bottom" v-show="!collapsed">
      <div
        class="user-info-container"
        @click="toggleUserMenu"
        :class="{ active: showUserMenu }"
      >
        <el-avatar
          :size="40"
          :src="user.avatar || '/images/avatar.png'"
          class="user-avatar"
        />
        <div class="user-details">
          <span class="user-name">{{ displayUserName }}</span>
          <!-- 左侧外部授权/账号登录状态暂不展示，保留代码便于后续恢复。 -->
          <!-- <span class="auth-mode">{{ authMode === 'agent' ? '外部授权' : '账号登录' }}</span> -->
        </div>
        <i class="arrow-icon" :class="{ rotated: showUserMenu }">▼</i>
      </div>

      <div v-if="showUserMenu" class="user-menu">
        <!-- <div class="menu-item" @click="handleOpenFeedback">
          <el-icon><ChatDotRound /></el-icon>
          <span>问题反馈</span>
        </div> -->
        <div class="menu-item" @click="goToMyCollections">
          <el-icon><StarFilled /></el-icon>
          <span>我的收藏</span>
        </div>
        <div class="menu-divider"></div>
        <div class="menu-item logout" @click="handleLogout">
          <span class="logout-icon">↩</span>
          <span>退出登录</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessageBox, ElMessage } from 'element-plus';
import type { InputInstance } from 'element-plus';
import { ChatDotRound, Expand, Fold, StarFilled } from '@element-plus/icons-vue';
import { sanitizeHtml } from '@/utils/markdown';

interface Props {
  historyList: any[];
  activeChatId: string | null;
  user: any;
  collapsed?: boolean;
  activeTab: string; //
  loading?: boolean;
  authMode?: string; // 新增：local/agent，用于在左下角用户区域展示登录方式
  searchKeyword?: string;
  searchResults?: any[];
  searchLoading?: boolean;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  'select-chat': [chatId: string];
  'new-chat': [];
  'delete-chat': [chatId: string];
  'clear-history': [];
  'toggle-favorite': [chatId: string];
  'switch-tab': [tabName: string];
  'toggle-collapse': [];
  'update-title': [chatId: string, newTitle: string];
  'toggle-pin': [chatId: string, topStatus: number]; //
  'search-history': [keyword: string];
  'clear-search': [];
  'select-search-result': [result: any];
  'open-feedback': [];
  logout: []; // 新增：退出登录放到左侧历史面板底部
}>();

const router = useRouter();

const showUserMenu = ref(false);
const hoveredItemId = ref<string | null>(null);
const visibleMenuId = ref<string | null>(null);
const menuOpensUp = ref(false);
const menuPositionStyle = ref<Record<string, string>>({});
const editingId = ref<string | null>(null);
const editingTitle = ref('');
const titleInputRef = ref<InputInstance>();
const localSearchKeyword = ref(props.searchKeyword || '');
let searchTimer: number | null = null;

/** 封装当前模块内的业务逻辑：displayUserName。 */
const displayUserName = computed(
  () => props.user?.nickname || props.user?.name || props.user?.username || '用户',
);

// 计算属性
const filteredHistory = computed(() => {
  return props.historyList || [];
});

const historySkeletonCount = computed(() => {
  const historyCount = filteredHistory.value.length;
  return historyCount > 0 ? Math.min(historyCount, 7) : 7;
});

/** 封装当前模块内的业务逻辑：searchResults。 */
const searchResults = computed(() => props.searchResults || []);
/** 封装当前模块内的业务逻辑：searchLoading。 */
const searchLoading = computed(() => Boolean(props.searchLoading));
/** 判断条件是否成立：isSearchMode。 */
const isSearchMode = computed(() => Boolean(localSearchKeyword.value.trim()));

/** 获取并归一化业务数据：getHighlightText。 */
const getHighlightText = (result: any) => {
  const highlight = result.highlight || {};
  const question = Array.isArray(highlight.questionContent)
    ? highlight.questionContent[0]
    : highlight.questionContent;
  const answer = Array.isArray(highlight.answerContent)
    ? highlight.answerContent[0]
    : highlight.answerContent;
  return (
    question ||
    answer ||
    result.questionContent ||
    result.answerPreview ||
    result.answerContent ||
    result.matchedText ||
    '点击查看命中的历史会话'
  );
};

/** 标准化后端/历史数据结构：normalizedSearchResults。 */
const normalizedSearchResults = computed(() =>
  searchResults.value.map((item) => ({
    ...item,
    highlightText: sanitizeHtml(getHighlightText(item)),
  })),
);

/** 封装当前模块内的业务逻辑：sortedHistory。 */
const sortedHistory = computed(() => {
  const groups: Record<string, any[]> = {};

  // 分离置顶和非置顶的会话
  const pinnedItems: any[] = [];
  const unpinnedItems: any[] = [];

  filteredHistory.value.forEach((item) => {
    if (item.topStatus === 1) {
      pinnedItems.push(item);
    } else {
      unpinnedItems.push(item);
    }
  });

  // 置顶的分组
  if (pinnedItems.length > 0) {
    groups['置顶'] = pinnedItems.map((item) => ({
      ...item,
      formattedTime: formatRelativeTime(item.time),
    }));
  }

  // 非置顶的按日期分组
  unpinnedItems.forEach((item) => {
    const relativeTime = formatRelativeTime(item.time);
    let groupKey = '';

    if (relativeTime.includes('今天')) {
      groupKey = '今天';
    } else if (relativeTime.includes('昨天')) {
      groupKey = '昨天';
    } else if (relativeTime.includes('前天')) {
      groupKey = '前天';
    } else {
      const date = new Date(item.time);
      if (!isNaN(date.getTime())) {
        groupKey = `${date.getFullYear()}-${(date.getMonth() + 1)
          .toString()
          .padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`;
      } else {
        groupKey = '未知日期';
      }
    }

    if (!groups[groupKey]) {
      groups[groupKey] = [];
    }
    groups[groupKey].push({
      ...item,
      formattedTime: relativeTime,
    });
  });

  // 转换为数组格式，置顶分组在最前面
  const result = [];
  if (groups['置顶']) {
    result.push({
      date: '置顶',
      items: groups['置顶'],
      isTopGroup: true,
    });
    delete groups['置顶'];
  }

  // 其他分组按时间倒序排列
  Object.entries(groups).forEach(([date, items]) => {
    result.push({
      date,
      items,
      isTopGroup: false,
    });
  });

  return result;
});

/** 格式化展示内容：formatRelativeTime。 */
const formatRelativeTime = (timestamp: number | string) => {
  let date: Date;

  if (typeof timestamp === 'string') {
    date = new Date(timestamp);
  } else {
    date = new Date(timestamp);
  }

  if (isNaN(date.getTime())) {
    return '未知时间';
  }

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const thatDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  const diffDays = Math.round(
    (today.getTime() - thatDay.getTime()) / (1000 * 60 * 60 * 24),
  );

  if (diffDays === 0) {
    return `今天 ${date.getHours().toString().padStart(2, '0')}:${date
      .getMinutes()
      .toString()
      .padStart(2, '0')}`;
  }

  if (diffDays === 1) {
    return `昨天 ${date.getHours().toString().padStart(2, '0')}:${date
      .getMinutes()
      .toString()
      .padStart(2, '0')}`;
  }

  if (diffDays === 2) {
    return `前天 ${date.getHours().toString().padStart(2, '0')}:${date
      .getMinutes()
      .toString()
      .padStart(2, '0')}`;
  }

  return `${date.getFullYear()}-${(date.getMonth() + 1)
    .toString()
    .padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`;
};

/** 处理用户交互或组件事件：handleSelectChat。 */
const handleSelectChat = (chatId: string) => {
  emit('select-chat', chatId);
  closeMenu();
};

/** 处理用户交互或组件事件：handleNewChat。 */
const handleNewChat = () => {
  emit('new-chat');
  closeMenu();
};

/** 处理用户交互或组件事件：handleSearchInput。 */
const handleSearchInput = () => {
  if (searchTimer) window.clearTimeout(searchTimer);
  const keyword = localSearchKeyword.value.trim();
  searchTimer = window.setTimeout(() => {
    emit('search-history', keyword);
  }, 300);
};

/** 清理输入、搜索或缓存状态：clearSearch。 */
const clearSearch = () => {
  localSearchKeyword.value = '';
  emit('clear-search');
};

/** 处理用户交互或组件事件：handleSelectSearchResult。 */
const handleSelectSearchResult = (result: any) => {
  emit('select-search-result', result);
  closeMenu();
};

/** 处理用户交互或组件事件：handleDeleteChat。 */
const handleDeleteChat = (chatId: string) => {
  ElMessageBox.confirm('确定要删除这条对话记录吗？', '提示', {
    confirmButtonText: '确定',
    cancelButtonText: '取消',
    type: 'warning',
  })
    .then(() => {
      emit('delete-chat', chatId);
      closeMenu();
      ElMessage.success('删除成功');
    })
    .catch(() => {});
};

/** 处理用户交互或组件事件：handleClearAllHistory。 */
const handleClearAllHistory = () => {
  ElMessageBox.confirm('确定删除对话？删除后，聊天记录将不可恢复。', '提示', {
    confirmButtonText: '确定',
    cancelButtonText: '取消',
    type: 'warning',
    customClass: 'clear-history-dialog',
  })
    .then(() => {
      emit('clear-history');
      closeMenu();
      ElMessage.success({ message: '已清空历史记录', offset: 72 });
    })
    .catch(() => {});
};

/** 处理用户交互或组件事件：handleToggleFavorite。 */
const handleToggleFavorite = (chatId: string) => {
  emit('toggle-favorite', chatId);
  closeMenu();
};

/** 处理用户交互或组件事件：handleTogglePin。 */
const handleTogglePin = (chatId: string, isPinned: boolean) => {
  const topStatus = isPinned ? 0 : 1; // 如果已经置顶，则取消置顶；否则置顶
  emit('toggle-pin', chatId, topStatus);
  closeMenu();
};

/** 开始编辑、订阅或交互：startEdit。 */
const startEdit = (chatId: string, currentTitle: string) => {
  editingId.value = chatId;
  editingTitle.value = currentTitle;
  closeMenu();

  // 自动聚焦输入框
  nextTick(() => {
    const input = titleInputRef.value?.input;
    if (input) {
      input.focus();
      input.select();
    }
  });
};

/** 保存会话、标题或业务上下文：saveTitle。 */
const saveTitle = (chatId: string) => {
  if (!editingTitle.value.trim()) {
    ElMessage.warning('标题不能为空');
    return;
  }

  if (editingId.value === chatId) {
    emit('update-title', chatId, editingTitle.value.trim());
    cancelEdit();
  }
};

/** 处理标题输入框键盘事件，避免同一组件重复声明 keyup 导致 vue-tsc TS1117。 */
const handleTitleInputKeyup = (event: KeyboardEvent | Event, chatId: string) => {
  const keyboardEvent = event as KeyboardEvent;
  if (keyboardEvent.key === 'Enter') {
    saveTitle(chatId);
    return;
  }
  if (keyboardEvent.key === 'Escape' || keyboardEvent.key === 'Esc') {
    cancelEdit();
  }
};

/** 封装当前模块内的业务逻辑：cancelEdit。 */
const cancelEdit = () => {
  editingId.value = null;
  editingTitle.value = '';
};

/** 处理用户交互或组件事件：handleMouseEnter。 */
const handleMouseEnter = (itemId: string) => {
  hoveredItemId.value = itemId;
};

/** 处理用户交互或组件事件：handleMouseLeave。 */
const handleMouseLeave = (itemId: string) => {
  if (hoveredItemId.value === itemId && visibleMenuId.value !== itemId) {
    hoveredItemId.value = null;
  }
};

/** 切换面板、菜单或状态：toggleMenu。 */
const updateMenuPosition = (triggerRect: DOMRect, menuHeight: number, menuWidth: number) => {
  const viewportPadding = 8;
  const userCenter = document.querySelector('.user-center-bottom') as HTMLElement | null;
  const bottomBoundary = userCenter?.getBoundingClientRect().top || window.innerHeight;
  const spaceBelow = bottomBoundary - triggerRect.bottom;
  const spaceAbove = triggerRect.top - viewportPadding;

  menuOpensUp.value = spaceBelow < menuHeight + 4 && spaceAbove > spaceBelow;
  const left = Math.min(
    Math.max(viewportPadding, triggerRect.right - menuWidth),
    window.innerWidth - menuWidth - viewportPadding,
  );
  const top = menuOpensUp.value
    ? Math.max(viewportPadding, triggerRect.top - menuHeight - 4)
    : Math.min(bottomBoundary - menuHeight - 4, triggerRect.bottom + 4);

  menuPositionStyle.value = {
    left: `${left}px`,
    top: `${Math.max(viewportPadding, top)}px`,
  };
};

const toggleMenu = (itemId: string, event: MouseEvent) => {
  if (visibleMenuId.value === itemId) {
    closeMenu();
    return;
  }

  const trigger = event.currentTarget as HTMLElement | null;
  const triggerRect = trigger?.getBoundingClientRect();
  const menuHeight = 184;
  const menuWidth = 120;
  if (triggerRect) {
    updateMenuPosition(triggerRect, menuHeight, menuWidth);
  }
  visibleMenuId.value = itemId;
  nextTick(() => {
    const menu = document.querySelector('.history-dropdown-menu') as HTMLElement | null;
    if (triggerRect && menu) {
      const menuRect = menu.getBoundingClientRect();
      updateMenuPosition(triggerRect, menuRect.height, menuRect.width);
    }
  });
};

/** 关闭面板、菜单或弹窗：closeMenu。 */
const closeMenu = () => {
  visibleMenuId.value = null;
  hoveredItemId.value = null;
  menuOpensUp.value = false;
  menuPositionStyle.value = {};
};

/** 处理用户交互或组件事件：handleClickOutsideMenu。 */
const handleClickOutsideMenu = (event: MouseEvent) => {
  const target = event.target as HTMLElement | null;
  if (!target?.closest('.item-menu-container, .history-dropdown-menu')) {
    closeMenu();
  }
};

/** 切换面板、菜单或状态：toggleUserMenu。 */
const toggleUserMenu = () => {
  showUserMenu.value = !showUserMenu.value;
};

/** 封装当前模块内的业务逻辑：goToMyCollections。 */
const goToMyCollections = () => {
  showUserMenu.value = false;
  router.push('/my-collections');
};

/** 处理用户交互或组件事件：handleLogout。 */
const handleLogout = () => {
  showUserMenu.value = false;
  emit('logout');
};

/** 打开全局问题反馈弹窗，入口位于“我的收藏”上方。 */
const handleOpenFeedback = () => {
  showUserMenu.value = false;
  emit('open-feedback');
};

/** 处理用户交互或组件事件：handleClickOutsideUserMenu。 */
const handleClickOutsideUserMenu = (event: MouseEvent) => {
  const userCenter = document.querySelector('.user-center-bottom');
  if (userCenter && !userCenter.contains(event.target as Node)) {
    showUserMenu.value = false;
  }
};

watch(
  () => props.searchKeyword,
  (value) => {
    if ((value || '') !== localSearchKeyword.value)
      localSearchKeyword.value = value || '';
  },
);

onMounted(() => {
  document.addEventListener('click', handleClickOutsideMenu);
  document.addEventListener('click', handleClickOutsideUserMenu);
});

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutsideMenu);
  document.removeEventListener('click', handleClickOutsideUserMenu);
});
</script>

<style lang="less" scoped>
.history-panel {
  width: 280px;
  background: #ffffff;
  border-right: 1px solid #e9ecef;
  display: flex;
  flex-direction: column;
  overflow: visible;
  position: relative;
  box-shadow: 2px 0 8px rgba(0, 0, 0, 0.05);
  transition: width 0.3s ease; /* 添加过渡动画 */

  .logo {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    color: black;
    font-size: 20px;
    font-weight: 600;
    text-decoration: none;
    height: 56px;
    box-shadow: 0 2px 8px rgba(24, 144, 255, 0.2);
    z-index: 100;

    span {
      margin-right: 20px;
    }
  }

  .logo img {
    width: 32px;
    height: 32px;
    border-radius: 6px;
    object-fit: contain;
    background: white;
    padding: 4px;
  }

  &.is-collapsed {
    width: 0; /* 折叠后的宽度 */
  }
}

.history-panel.is-collapsed {
  border-right: none;
  box-shadow: none;
}

.history-panel.is-collapsed .panel-header {
  display: none;
}

.sidebar-collapse-btn {
  position: absolute;
  top: 10px;
  left: calc(100% - 38px);
  z-index: 350;
  width: 36px;
  height: 36px;
  border: none;
  background: #fff;
  color: #606266;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  transition:
    left 0.3s ease,
    color 0.2s ease,
    box-shadow 0.2s ease;
}

.sidebar-collapse-btn:hover {
  color: #1c73eb;
  box-shadow: 0 5px 16px rgba(28, 115, 235, 0.22);
}

.history-panel.is-collapsed .sidebar-collapse-btn {
  left: 8px;
}

.panel-header {
  padding: 12px 18px 14px;
  border-bottom: 1px solid #e9ecef;
  background: #ffffff;
  z-index: 10;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
}

.history-search {
  height: 40px;
  margin-top: 10px;
  border: 1px solid #dbe6f5;
  border-radius: 20px;
  background: #f8fbff;
  display: flex;
  align-items: center;
  padding: 0 10px;
  gap: 6px;
}

.search-icon {
  font-size: 14px;
  color: #8c8c8c;
}

.history-search-input {
  flex: 1;
  min-width: 0;
  border: none;
  outline: none;
  background: transparent;
  color: #333;
  font-size: 13px;
}

.search-clear-btn {
  border: none;
  background: transparent;
  color: #8c8c8c;
  cursor: pointer;
  font-size: 18px;
  line-height: 1;
}

.search-result-item {
  min-height: 76px;
}

.search-snippet {
  color: #64748b;
  font-size: 12px;
  line-height: 1.5;
  max-height: 38px;
  overflow: hidden;
}

.search-snippet :deep(em),
.search-snippet em {
  color: #1c73eb;
  font-style: normal;
  font-weight: 700;
  background: rgba(28, 115, 235, 0.1);
}

.search-state {
  justify-content: flex-start;
  padding-top: 60px;
}

.new-chat-btn {
  width: 100%;
  height: 40px;
  border: 2px solid #1c73eb;
  background: #fff;
  color: #1c73eb;
  border-radius: 20px;
  font-size: 15px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.3s;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.new-chat-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 6px 16px rgba(24, 144, 255, 0.3);
}

.btn-text {
  font-weight: 500;
  font-size: 18px;
}

.history-list {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  padding-bottom: 100px;
}

.list-header {
  padding: 16px 20px 12px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid #f0f0f0;
  background: #ffffff;
  position: sticky;
  top: 0;
  z-index: 5;
}

.list-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: #2c3e50;
}

.clear-btn {
  padding: 4px 12px;
  background: #f5f5f5;
  border: 1px solid #d9d9d9;
  border-radius: 4px;
  font-size: 12px;
  color: #666;
  cursor: pointer;
  transition: all 0.2s;
}

.clear-btn:hover {
  background: #ff4d4f;
  border-color: #ff4d4f;
  color: white;
}

.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
  color: #bfbfbf;
  text-align: center;
}

.empty-icon {
  font-size: 48px;
  margin-bottom: 16px;
  opacity: 0.4;
}

.empty-state p {
  margin: 0 0 8px 0;
  font-size: 14px;
  color: #999;
}

.empty-tip {
  font-size: 12px;
  color: #bfbfbf;
}

.history-items {
  padding: 0 0 20px 0;
}

.history-skeleton {
  padding: 8px 0 20px;

  .history-skeleton-item {
    min-height: 60px;
    padding: 12px 20px;
    box-sizing: border-box;

    .history-skeleton-title {
      width: 78%;
      height: 17px;
    }

    .history-skeleton-time {
      width: 34%;
      height: 12px;
      margin-top: 9px;
    }
  }
}

.history-group {
  margin-bottom: 16px;
}

.group-date {
  padding: 8px 20px;
  font-size: 12px;
  color: #8c8c8c;
  font-weight: 500;
  background: #fafafa;
  margin: 8px 0 4px 0;
  position: sticky;
  top: 60px;
  z-index: 4;
  backdrop-filter: blur(10px);
  background: rgba(255, 255, 255, 0.9);
}

.history-item {
  padding: 0 20px;
  display: flex;
  align-items: center;
  gap: 12px;
  cursor: pointer;
  transition: all 0.2s;
  border-left: 3px solid transparent;
  position: relative;
  min-height: 60px;
}

.history-item:hover {
  background: #e6f7ff;
  border-left-color: #91d5ff;
}

.history-item.active {
  background: #e6f7ff;
  box-shadow: inset 2px 0 0 #1890ff;

  .item-type {
    background: #f0f7ff;
    color: #1890ff;
  }
}

.item-content {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.item-title {
  font-size: 15px;
  font-weight: 500;
  color: #333;
  line-height: 1.3;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  display: block;
}

.favorite-icon {
  color: #f6c542;
  font-size: 12px;
  flex-shrink: 0;
  transition: opacity 0.2s;
}

.item-meta {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  margin-top: 2px;
}

.item-type {
  background: #f0f0f0;
  padding: 2px 6px;
  border-radius: 3px;
  color: #666;
  font-weight: 500;
  white-space: nowrap;
}

.item-time {
  color: #bfbfbf;
  white-space: nowrap;
}

/* 菜单相关样式 */
.item-menu-container {
  position: relative;
  opacity: 0;
  transition: opacity 0.2s ease;
  z-index: 2;
}

.history-item:hover .item-menu-container {
  opacity: 1;
}

.menu-toggle-btn {
  width: 24px;
  height: 24px;
  border: none;
  background: none;
  color: #999;
  font-size: 18px;
  cursor: pointer;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
  font-weight: bold;
  line-height: 1;
  padding: 0;
}

.menu-toggle-btn:hover {
  background: #f0f0f0;
  color: #666;
}

:global(.history-dropdown-menu) {
  position: fixed;
  background: white;
  border-radius: 6px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  min-width: 120px;
  z-index: 3000;
  overflow: hidden;
  border: 1px solid #e9ecef;
  animation: slideDown 0.2s ease;

  &.opens-up {
    animation-name: slideUp;
  }
}

@keyframes slideDown {
  from {
    opacity: 0;
    transform: translateY(-5px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(5px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.menu-item {
  width: 100%;
  padding: 8px 12px;
  border: none;
  background: none;
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  font-size: 13px;
  color: #333;
  transition: all 0.2s;
  text-align: left;
  white-space: nowrap;
}

.menu-item:hover {
  background: #f0f7ff;
  color: #1890ff;
}

.menu-item.favorited {
  color: #f6c542;
}

.menu-item.delete:hover {
  background: #fff2f0;
  color: #ff4d4f;
}

.menu-icon {
  font-size: 14px;
  width: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.menu-text {
  flex: 1;
}

/* 右下角个人中心样式 */
.user-center-bottom {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 3px 10px;
  background: linear-gradient(to top, #fff 80%, transparent);
  border-top: 1px solid #e9ecef;
  z-index: 20;
}

.user-info-container {
  display: flex;
  align-items: center;
  gap: 12px;
  background: #f8f9fa;
  cursor: pointer;
  padding: 0 10px;
  transition: all 0.3s ease;
  border: 2px solid transparent;
}

.user-info-container:hover {
  background: #e9ecef;
}

.user-info-container.active {
  background: #e7f3ff;
  box-shadow: 0 2px 8px rgba(24, 144, 255, 0.1);
}

.user-avatar {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  flex-shrink: 0;
}

.user-details {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.user-name {
  font-size: 14px;
  font-weight: 600;
  color: #333;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.user-email {
  font-size: 12px;
  color: #666;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.arrow-icon {
  font-size: 12px;
  color: #666;
  transition: transform 0.3s ease;
  margin-left: auto;
}

.arrow-icon.rotated {
  transform: rotate(180deg);
}

/* 用户菜单样式 */
.user-menu {
  position: absolute;
  bottom: 100%;
  left: 20px;
  right: 20px;
  background: white;
  border-radius: 12px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
  padding: 8px 0;
  animation: slideUp 0.2s ease;
  z-index: 100;
  border: 1px solid #e9ecef;
  overflow: hidden;
}

@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.menu-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  font-size: 14px;
  color: #333;
  cursor: pointer;
  transition: all 0.2s ease;
  border-left: 3px solid transparent;
}

.menu-item:hover {
  background: #f8f9fa;
  border-left-color: #1890ff;
  color: #1890ff;
}

.menu-item.logout {
  color: #ff4d4f;
}

.menu-item.logout:hover {
  background: #fff2f0;
  border-left-color: #ff4d4f;
  color: #ff4d4f;
}

.menu-icon {
  font-size: 16px;
  width: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.menu-divider {
  height: 1px;
  background: #e9ecef;
  margin: 8px 0;
}

/* 在 HistoryPanel.vue 的 style 部分添加 */
.title-input {
  width: 100%;
  margin: -4px 0;
}

.title-input :deep(.el-input__wrapper) {
  padding: 0 8px;
  height: 28px;
  line-height: 28px;
}

.title-input :deep(.el-input__inner) {
  height: 28px;
  line-height: 28px;
  font-size: 14px;
  font-weight: 500;
  color: #333;
}

.item-title {
  font-size: 15px;
  font-weight: 500;
  color: #333;
  line-height: 1.3;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  display: block;
  cursor: pointer;
  padding: 2px 0;
  border-radius: 4px;
  transition: background-color 0.2s;
}

.item-title:hover {
  background-color: rgba(0, 0, 0, 0.05);
}

.item-title span {
  // display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.auth-mode {
  width: fit-content;
  max-width: 90px;
  padding: 1px 6px;
  border-radius: 999px;
  color: #1c73eb;
  background: #eaf3ff;
  font-size: 11px;
  line-height: 18px;
  white-space: nowrap;
}

.user-menu .menu-item.logout {
  color: #d93026;
}

.logout-icon {
  display: inline-flex;
  width: 16px;
  height: 16px;
  align-items: center;
  justify-content: center;
  font-weight: 700;
}
</style>
