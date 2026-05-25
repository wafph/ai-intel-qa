<!--
  我的收藏页面，展示和跳转收藏问答。
  本文件属于规章制度智能体前端最新版交付代码，整理时仅补充说明与注释，不改变业务逻辑。
-->
<template>
  <div class="my-collections">
    <!-- 顶部标题栏 -->
    <div class="page-header">
      <h1>我的收藏</h1>
      <div class="header-actions">
        <button class="back-btn" @click="goBack">← 返回</button>
      </div>
    </div>

    <!-- 收藏列表 -->
    <div 
      class="collections-container"
      v-loading="isLoading"
      element-loading-text="加载中..."
      element-loading-background="rgba(255, 255, 255, 0.8)"
    >
      <!-- 搜索和过滤 -->
      <div class="filter-bar">
        <div class="search-box">
          <input
            v-model="searchQuery"
            type="text"
            placeholder="搜索收藏内容..."
            class="search-input"
            @input="loadCollections"
          />
        </div>

        <div class="filter-options">
          <div
            v-for="tab in filterTabs"
            :key="tab.id"
            class="filter-tab"
            :class="{ active: activeFilter === tab.id }"
            @click="setActiveFilter(tab.id)"
          >
            {{ tab.name }}
          </div>
        </div>
      </div>

      <!-- 收藏内容 -->
      <div v-if="!isLoading && filteredCollections.length === 0" class="empty-state">
        <div class="empty-icon">⭐</div>
        <p>暂无收藏内容</p>
        <p class="empty-tip">快去收藏你喜欢的历史对话吧</p>
      </div>

      <div v-else-if="!isLoading" class="collections-grid">
        <div
          v-for="item in filteredCollections"
          :key="item.id"
          class="collection-item"
          @click="viewCollection(item)"
        >
          <div class="collection-header">
            <div class="collection-title">
              {{ item.title }}
            </div>
            <button
              class="remove-favorite-btn"
              @click.stop="removeFromFavorites(item.id)"
            >
              ★
            </button>
          </div>

          <div class="collection-preview">
            {{ item.preview }}
          </div>

          <div class="collection-meta">
            <span class="collection-type">{{ item.type }}</span>
            <span class="collection-time">{{ formatTime(item.time) }}</span>
          </div>

          <div class="collection-actions">
            <button class="action-btn view-btn" @click.stop="viewCollection(item)">
              查看对话
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useChatStore } from '../stores/chat';

const router = useRouter();
const chatStore = useChatStore();

// 新增：存储从服务器获取的收藏数据
const serverCollections = ref<any[]>([]);
const isLoading = ref(false);

// 搜索和过滤
const searchQuery = ref('');
const activeFilter = ref('all');
const filterTabs = [
  { id: 'all', name: '全部' },
  { id: '智能问答', name: '智能问答' },
  { id: '辅助起草', name: '辅助起草' },
  { id: '合规审核', name: '合规审核' },
  { id: '智能检索', name: '智能检索' },
];

// 过滤后的收藏列表
const filteredCollections = computed(() => {
  let collections = serverCollections.value;

  // 按类型过滤
  if (activeFilter.value !== 'all') {
    // 将中文标签转换为functionId
    const functionIdMap: Record<string, string> = {
      '智能问答': 'qa',
      '辅助起草': 'draft',
      '合规审核': 'review',
      '智能检索': 'search',
    };
    
    const functionId = functionIdMap[activeFilter.value];
    collections = collections.filter((item) => item.functionId === functionId);
  }

  // 按搜索关键词过滤
  if (searchQuery.value.trim()) {
    const query = searchQuery.value.toLowerCase();
    collections = collections.filter(
      (item) =>
        item.title.toLowerCase().includes(query) ||
        (item.preview && item.preview.toLowerCase().includes(query))
    );
  }

  return collections;
});

// 加载收藏数据
const loadCollections = async () => {
  try {
    isLoading.value = true;
    
    // 如果有激活的过滤器，传递对应的functionId
    let functionId: string | undefined = undefined;
    if (activeFilter.value !== 'all') {
      const functionIdMap: Record<string, string> = {
        '智能问答': 'qa',
        '辅助起草': 'draft',
        '合规审核': 'review',
        '智能检索': 'search',
      };
      functionId = functionIdMap[activeFilter.value];
    }
    
    const result = await chatStore.queryFavoriteSessions(functionId);
    
    if (result.success && result.data) {
      serverCollections.value = result.data.map((item: any) => ({
        id: item.sessionId,
        title: item.sessionTitle,
        preview: `共 ${item.historyCount} 条对话`,
        time: new Date(item.lastMessageTime || item.createTime).getTime(),
        type: getTypeByFunctionId(item.functionId),
        menuType: getTypeByFunctionId(item.functionId),
        isCollected: item.favoriteStatus === 1,
        sessionTitle: item.sessionTitle,
        historyCount: item.historyCount,
        lastMessageTime: item.lastMessageTime,
        functionId: item.functionId,
      }));
    } else {
      serverCollections.value = [];
    }
  } catch (error) {
    serverCollections.value = [];
  } finally {
    isLoading.value = false;
  }
};

// 根据functionId获取类型名称
const getTypeByFunctionId = (functionId: string): string => {
  const typeMap: Record<string, string> = {
    'qa': '智能问答',
    'draft': '辅助起草',
    'review': '合规审核',
    'search': '智能检索',
  };
  return typeMap[functionId] || '未知类型';
};

// 设置激活的过滤器
const setActiveFilter = async (filterId: string) => {
  activeFilter.value = filterId;
  await loadCollections(); // 切换过滤器时重新加载数据
};

// 查看收藏
const viewCollection = async (item: any) => {
  try {
    // 先获取收藏详情
    const result = await chatStore.queryFavoriteSessionDetail(item.id, item.functionId);
    
    if (result.success && result.data) {
      // 这里可以将详情数据传递给对应的页面
      // 或者直接跳转到对应的功能页面
      let path = '/intelligent-qa'; // 默认跳转到智能问答
      
      if (item.functionId === 'search') {
        path = '/intelligent-retrieval';
      } else if (item.functionId === 'draft') {
        path = '/auxiliary-draft';
      } else if (item.functionId === 'review') {
        path = '/compliance-review';
      }
      
      // 可以将会话详情存储在store中，供目标页面使用
      // chatStore.setCurrentFavoriteDetail(result.data);
      
      router.push({
        path: path,
        query: { 
          id: item.id,
          from: 'collections'  // 标记来自收藏页面
        },
      });
    } else {
      alert('获取收藏详情失败');
    }
  } catch (error) {
    alert('查看收藏失败');
  }
};

// 从收藏中移除
const removeFromFavorites = async (id: string) => {
  // 这里需要调用取消收藏的接口
  // 先找到对应的functionId
  const item = serverCollections.value.find(item => item.id === id);
  if (item) {
    const success = await chatStore.syncCollectStatus(id, false);
    if (success) {
      // 重新加载收藏列表
      await loadCollections();
    }
  }
};

// 格式化时间
const formatTime = (timeStr: number) => {
  const date = new Date(timeStr);
  return date.toLocaleString();
};

// 返回上一页
const goBack = () => {
  router.back();
};

onMounted(async () => {
  // 组件挂载时加载收藏数据
  await loadCollections();
});
</script>

<style lang="less" scoped>
.my-collections {
  width: 100%;
  height: 100vh;
  background: #f5f7fa;
  overflow-y: auto;

  .page-header {
    background: white;
    padding: 20px 40px;
    border-bottom: 1px solid #e9ecef;
    display: flex;
    justify-content: space-between;
    align-items: center;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
    position: sticky;
    top: 0;
    z-index: 10;

    h1 {
      margin: 0;
      font-size: 24px;
      font-weight: 600;
      color: #333;
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .back-btn {
      padding: 8px 16px;
      background: #f8f9fa;
      border: 1px solid #e9ecef;
      border-radius: 6px;
      font-size: 14px;
      color: #666;
      cursor: pointer;
      transition: all 0.3s;

      &:hover {
        background: #e9ecef;
        color: #333;
      }
    }
  }

  .collections-container {
    padding: 30px 40px;
    margin: 0 auto;
    position: relative; // 为 Loading 组件提供定位上下文
    min-height: 300px; // 确保有足够的高度显示加载动画

    .filter-bar {
      background: white;
      padding: 20px;
      border-radius: 12px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
      margin-bottom: 30px;
      display: flex;
      flex-direction: column;
      gap: 20px;

      .search-box {
        position: relative;
        width: 100%;
        max-width: 400px;

        .search-input {
          width: 100%;
          padding: 12px 20px 12px 40px;
          border: 2px solid #e9ecef;
          border-radius: 8px;
          font-size: 14px;
          transition: all 0.3s;

          &:focus {
            outline: none;
            border-color: #1890ff;
            box-shadow: 0 0 0 3px rgba(24, 144, 255, 0.1);
          }
        }
      }

      .filter-options {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;

        .filter-tab {
          padding: 8px 16px;
          background: #f8f9fa;
          border: 1px solid #e9ecef;
          border-radius: 20px;
          font-size: 13px;
          color: #666;
          cursor: pointer;
          transition: all 0.3s;

          &:hover {
            background: #e9ecef;
          }

          &.active {
            background: #1890ff;
            border-color: #1890ff;
            color: white;
          }
        }
      }
    }

    .empty-state {
      background: white;
      padding: 60px 20px;
      border-radius: 12px;
      text-align: center;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);

      .empty-icon {
        font-size: 60px;
        color: #f6c542;
        margin-bottom: 20px;
        opacity: 0.6;
      }

      p {
        margin: 0 0 8px 0;
        font-size: 16px;
        color: #666;
      }

      .empty-tip {
        font-size: 14px;
        color: #999;
      }
    }

    .collections-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
      gap: 20px;

      .collection-item {
        background: white;
        border-radius: 12px;
        padding: 20px;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
        cursor: pointer;
        transition: all 0.3s;
        display: flex;
        flex-direction: column;
        gap: 12px;
        border: 2px solid transparent;

        &:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
          border-color: #1890ff;
        }

        .collection-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 10px;

          .collection-title {
            font-size: 16px;
            font-weight: 600;
            color: #333;
            line-height: 1.4;
            display: flex;
            align-items: center;
            gap: 6px;
            flex: 1;
            min-width: 0;

            span:last-child {
              overflow: hidden;
              text-overflow: ellipsis;
              display: -webkit-box;
              -webkit-line-clamp: 2;
              -webkit-box-orient: vertical;
            }
          }

          .remove-favorite-btn {
            width: 24px;
            height: 24px;
            border: none;
            background: none;
            font-size: 18px;
            color: #f6c542;
            cursor: pointer;
            transition: all 0.3s;
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;

            &:hover {
              transform: scale(1.2);
              color: #ff4d4f;
            }
          }
        }

        .collection-preview {
          font-size: 13px;
          color: #666;
          line-height: 1.5;
          overflow: hidden;
          text-overflow: ellipsis;
          display: -webkit-box;
          -webkit-line-clamp: 3;
          -webkit-box-orient: vertical;
          flex: 1;
          min-height: 60px;
        }

        .collection-meta {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 12px;
          color: #999;
          padding-top: 8px;
          border-top: 1px solid #f0f0f0;

          .collection-type {
            background: #f0f7ff;
            color: #1890ff;
            padding: 4px 8px;
            border-radius: 4px;
            font-weight: 500;
          }

          .collection-time {
            white-space: nowrap;
            margin-left: auto;
            color: #bfbfbf;
          }
        }

        .collection-actions {
          display: flex;
          gap: 8px;
          margin-top: 8px;

          .action-btn {
            flex: 1;
            padding: 8px 12px;
            border: none;
            border-radius: 6px;
            font-size: 13px;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.3s;
            text-align: center;
          }

          .view-btn {
            background: #1890ff;
            color: white;

            &:hover {
              background: #40a9ff;
              transform: translateY(-1px);
            }
          }
        }
      }
    }
  }
}
</style>