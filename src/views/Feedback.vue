<template>
  <div class="customer-feedback-page">
    <!-- 页面标题 -->
    <div class="page-header">
      <h1 class="page-title">客户问题</h1>
    </div>

    <!-- 搜索区域 -->
    <div class="search-section">
      <el-form :inline="true" :model="searchForm" class="search-form">
        <el-form-item label="反馈对象：">
          <el-input
            v-model="searchForm.feedbackObject"
            placeholder="请输入问题关键字搜索"
            clearable
            class="search-input"
          />
        </el-form-item>
        <el-form-item>
          <el-button
            style="padding: 10px 20px"
            type="primary"
            :icon="Search"
            @click="handleSearch"
            :loading="loading"
          >
            查询
          </el-button>
        </el-form-item>
      </el-form>
    </div>

    <!-- 表格区域 -->
    <div class="table-section">
      <el-table
        :data="tableData"
        style="width: 100%"
        :loading="loading"
        border
        stripe
        class="feedback-table"
      >
        <el-table-column prop="index" label="序号" width="80" align="center" />
        <el-table-column prop="feedbackObject" label="反馈对象" min-width="200">
          <template #default="{ row }">
            <el-link type="primary" :underline="false" @click="handleViewDetail(row)">
              {{ row.feedbackObject }}
            </el-link>
          </template>
        </el-table-column>
        <el-table-column prop="feedbackProblem" label="反馈问题" min-width="250" />
        <el-table-column
          prop="feedbackTime"
          label="反馈时间"
          width="180"
          align="center"
        />
      </el-table>
    </div>

    <!-- 分页区域 -->
    <div class="pagination-section">
      <el-pagination
        v-model:current-page="pagination.currentPage"
        v-model:page-size="pagination.pageSize"
        :page-sizes="[10, 20, 50, 100]"
        :total="pagination.total"
        layout="total, sizes,ev, pager, ne prxt, jumper"
        :disabled="loading"
        @size-change="handleSizeChange"
        @current-change="handleCurrentChange"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import { Search } from '@element-plus/icons-vue';

// 搜索表单接口
interface SearchForm {
  feedbackObject: string;
}

// 表格数据接口
interface FeedbackItem {
  id: number;
  index: number;
  feedbackObject: string;
  feedbackProblem: string;
  feedbackTime: string;
}

// 响应式数据
const loading = ref<boolean>(false);
const searchForm = reactive<SearchForm>({
  feedbackObject: '',
});

const tableData = ref<FeedbackItem[]>([]);

// 分页数据
const pagination = reactive({
  currentPage: 1,
  pageSize: 10,
  total: 0,
});

// 模拟数据生成
const generateMockData = (): FeedbackItem[] => {
  const mockData: FeedbackItem[] = [];
  const questions = [
    '湖北交投集团的三大主业与全产业链布局是什么？',
    '投标全流程及关键规则概览？',
    '湖北交投集团在智慧交通领域有哪些代表性布局？',
    '湖北交投集团在数据资产化方面有何突破？',
    '湖北交投集团的资产规模与行业地位如何？',
    '湖北交投集团在高速公路建设方面的成就？',
    '湖北交投集团的科技创新成果有哪些？',
    '湖北交投集团的绿色交通发展策略？',
  ];

  const problems = [
    '答案有偏差，和XXXXXXX有歧义',
    '答案不够详细，需要补充说明',
    '答案与实际业务不符',
    '缺少最新政策信息',
    '需要更多案例支撑',
    '术语解释不够清晰',
    '逻辑结构需要优化',
    '缺少数据支撑',
  ];

  for (let i = 0; i < 20; i++) {
    const randomQuestionIndex = Math.floor(Math.random() * questions.length);
    const randomProblemIndex = Math.floor(Math.random() * problems.length);

    mockData.push({
      id: i + 1,
      index: i + 1,
      feedbackObject: questions[randomQuestionIndex],
      feedbackProblem: problems[randomProblemIndex],
      feedbackTime: '2026-01-29 17:43:30',
    });
  }

  return mockData;
};

// 获取表格数据
const fetchTableData = async () => {
  try {
    loading.value = true;
    // 模拟API调用
    await new Promise((resolve) => setTimeout(resolve, 800));

    const allData = generateMockData();
    const startIndex = (pagination.currentPage - 1) * pagination.pageSize;
    const endIndex = startIndex + pagination.pageSize;
    tableData.value = allData.slice(startIndex, endIndex);

    pagination.total = 200; // 固定总条数，实际应用中应该从API获取
  } catch (error) {
    ElMessage.error('获取客户问题数据失败');
  } finally {
    loading.value = false;
  }
};

// 搜索处理
const handleSearch = () => {
  pagination.currentPage = 1; // 重置到第一页
  fetchTableData();
};

// 分页大小变化
const handleSizeChange = (val: number) => {
  pagination.pageSize = val;
  pagination.currentPage = 1; // 重置到第一页
  fetchTableData();
};

// 当前页变化
const handleCurrentChange = (val: number) => {
  pagination.currentPage = val;
  fetchTableData();
};

// 查看详情
const handleViewDetail = (row: FeedbackItem) => {
  ElMessage.info(`查看 ${row.feedbackObject} 的详细信息`);
  // 这里可以跳转到详情页面或打开弹窗
  // router.push({ path: '/feedback-detail', query: { id: row.id } })
};

// 组件挂载时获取数据
onMounted(() => {
  fetchTableData();
});
</script>

<style lang="less" scoped>
.customer-feedback-page {
  padding: 20px;
  background-color: #f5f7fa;
  min-height: 100vh;

  .page-header {
    margin-bottom: 24px;

    .page-title {
      font-size: 24px;
      font-weight: 600;
      color: #303133;
      margin: 0;
    }
  }

  .search-section {
    background: #fff;
    padding: 20px;
    border-radius: 8px;
    margin-bottom: 20px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);

    .search-form {
      display: flex;
      align-items: center;
      justify-content: flex-start;
      gap: 16px;
    }

    .search-input {
      width: 240px;
    }
  }

  .table-section {
    background: #fff;
    padding: 20px;
    border-radius: 8px;
    margin-bottom: 20px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);

    .feedback-table {
      :deep(.el-table__header) {
        th {
          background-color: #fafafa;
          font-weight: 600;
          color: #606266;
        }
      }

      :deep(.el-table__row) {
        &:hover {
          background-color: #f5f7fa;
        }
      }
    }
  }

  .pagination-section {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 16px;

    :deep(.el-pagination) {
      .el-pagination__total {
        color: #606266;
        font-size: 14px;
      }

      .el-pagination__sizes {
        .el-select {
          .el-input {
            width: 90px;
          }
        }
      }

      .el-pagination__jump {
        .el-input {
          width: 50px;
        }
      }
    }
  }
}

// 响应式设计
@media (max-width: 768px) {
  .customer-feedback-page {
    padding: 12px;

    .search-section {
      padding: 16px;

      .search-form {
        flex-direction: column;
        align-items: stretch;
        gap: 12px;
      }

      .search-input {
        width: 100%;
      }
    }

    .table-section {
      padding: 16px;

      .feedback-table {
        font-size: 12px;

        :deep(.el-table__cell) {
          padding: 8px 4px;
        }
      }
    }
  }
}
</style>
