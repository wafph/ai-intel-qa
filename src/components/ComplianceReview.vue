<template>
  <!-- 模板部分保持不变 -->
  <div class="audit-container">
    <div class="review-header" v-show="!showAuditResult">
      <h1>智能合规审核，守护业务合规底线</h1>
      <p>以科技赋能合规管理，自动校验，高效守护业务规范</p>
    </div>
    <!-- 上传和配置区域 -->
    <div v-show="!showAuditResult" class="upload-section">
      <el-card class="upload-card">
        <!-- 拖拽上传区域 -->
        <el-upload
          class="upload-demo"
          drag
          action="#"
          :auto-upload="false"
          :on-change="handleFileChange"
          :show-file-list="false"
          accept=".doc,.docx,.pdf,.txt"
        >
          <el-icon class="el-icon--upload"><upload-filled /></el-icon>
          <div class="el-upload__text">拖拽文件到此处或 <em>点击上传</em></div>
          <template #tip>
            <div class="el-upload__tip">
              支持 .doc, .docx, .pdf, .txt 格式，大小不超过10MB
            </div>
          </template>
        </el-upload>

        <!-- 审核维度选择 -->
        <div class="audit-dimensions">
          <h3>选择审核维度</h3>
          <el-checkbox-group v-model="selectedDimensions">
            <el-checkbox label="合规性审核">合规性审查</el-checkbox>
            <el-checkbox label="冲突性审查">冲突性审查</el-checkbox>
            <el-checkbox label="数据安全">规范性审查</el-checkbox>
          </el-checkbox-group>
        </div>

        <!-- 发送按钮 -->
        <div class="action-buttons">
          <el-button
            type="primary"
            :disabled="!uploadedFile || selectedDimensions.length === 0"
            @click="startAudit"
          >
            发送
          </el-button>
        </div>
      </el-card>
    </div>

    <!-- 审核结果展示区域 -->
    <div v-show="showAuditResult" class="audit-result-section">
      <!-- <div class="header">
        <el-button type="text" @click="backToUpload">
          <el-icon><ArrowLeft /></el-icon> 返回上传
        </el-button>
        <h2>科技公司财务管理制度 - 审核结果</h2>
      </div> -->

      <div class="audit-content">
        <!-- 左侧：审核进度 -->
        <div class="audit-progress">
          <el-card class="res-container">
            <div class="anser-input">
              <div class="right-input">{{ selectedDimensions }}</div>
              <img src="../../public/user.svg" alt="" />
            </div>
          </el-card>
          <div class="progress-header">
            <h3>审核进度</h3>
          </div>

          <el-timeline>
            <el-timeline-item
              v-for="(item, index) in auditProgress"
              :key="index"
              :icon="item.icon"
              :type="item.type"
              :timestamp="item.time"
            >
              <div class="timeline-item-content">
                <div style="display: flex; justify-content: space-between">
                  <div class="item-title">{{ item.title }}</div>
                  <div class="item-status" :class="item.statusClass">
                    {{ item.statusText }}
                  </div>
                </div>
                <div v-if="item.comment" class="item-comment">
                  {{ item.comment }}
                </div>
              </div>
            </el-timeline-item>
          </el-timeline>
        </div>

        <!-- 右侧：原文标记 -->
        <div class="document-content">
          <div class="document-header">
            <h3>原文标记</h3>
          </div>

          <div class="document-list">
            <div
              v-for="(item, index) in documentStructure"
              :key="index"
              class="document-item"
              :class="{ 'is-highlighted': item.highlighted }"
            >
              <div class="item-number">{{ item.number }}</div>
              <div class="item-content">{{ item.content }}</div>
            </div>
          </div>

          <!-- 详细内容区域 -->
          <div class="detailed-content">
            <h4>3.4.IT安全管理办法</h4>
            <p><strong>目的:</strong> 保障公司网络安全，数据安全，保护公司核心竞争力。</p>
            <p><strong>范围:</strong> 公司所有计算机，服务器，网络和所有软件。</p>
            <p><strong>细则:</strong></p>
            <ul class="detail-list">
              <li>
                3.4.1.未经允许，员工严禁将不属于公司的电脑或配件(U盘，移动硬盘)带入公司使用，也不允许接入公司网络。
              </li>
              <li>3.4.2.公司的电脑必须开启自动更新，保证电脑更新到最新的补丁。</li>
              <li>
                3.4.3.公司的电脑和便携设备必须安装杀毒软件，一旦其报警，应立即保存相关文件，并与IT部联系。
              </li>
              <li>3.4.4.普通办公电脑每周至少要进行一次完整的查毒操作。</li>
              <li>3.4.5.各种文档等重要数据不存放在启动盘(一般为C盘)。</li>
              <li>3.4.6.员工重要文件必须定时存储到公司文件服务器。</li>
              <li>3.4.7.员工出差时携带笔记本必须把重要数据加密。</li>
              <li>
                3.4.8.电脑必须设置密码，不得将用户名、密码告诉公司其他人(密码必须有一定复杂度)。
              </li>
              <li>
                3.4.9.员工必须加强保密意识，严禁将公司机密资料以任何形式发布到Internet网上。
              </li>
              <li>3.4.10.硬盘出现问题，为避免数据泄露禁止送出去维修。应交由IT部处理。</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
// 脚本部分保持不变
import { ref, reactive } from 'vue';
import { UploadFilled, ArrowLeft } from '@element-plus/icons-vue';

// 文件上传状态
const uploadedFile = ref(null);
const selectedDimensions = ref([]);
const showAuditResult = ref(false);

// 审核进度数据
const auditProgress = reactive([
  {
    title: '开始审核流程',
    time: '审核时间：2020-01-26 23:52:41',
    statusText: '审核通过',
    statusClass: 'status-pass',
    icon: 'el-icon-success',
    type: 'primary',
  },
  {
    title: '合规性审核',
    time: '审核时间：2020-01-26 23:52:41',
    statusText: '审核通过',
    statusClass: 'status-pass',
    comment:
      '制度与集团日常管理逻辑一致，无与公司章程、核心管理制度冲突的条款;明确了制度起草部门(IT部门)，基本符合内部制度起草规范。',
    icon: 'el-icon-success',
    type: 'success',
  },
  {
    title: '内容准确性与完整性',
    time: '审核时间：2020-01-26 23:52:43',
    statusText: '审核通过',
    statusClass: 'status-pass',
    comment:
      '已包含IT硬件、软件、网络安全、机房、数据备份6个核心管理模块，无完全缺失的核心基础模块。明确了IT部的核心职责(实施、督查、维护、处置)，行政人事部的硬件编号分配职责，员工的使用职责，基础权责无混淆。',
    icon: 'el-icon-success',
    type: 'success',
  },
  {
    title: '数据安全',
    time: '审核时间：2020-01-26 23:52:45',
    statusText: '审核不通过',
    statusClass: 'status-fail',
    comment:
      '不符合"数据全流程(分类分级、采集、存储等)有规范;个人信息保护合规"的要求:①未明确数据分类分级的具体规范;②个人信息保护缺失;③数据跨境传输未提及。',
    icon: 'el-icon-error',
    type: 'danger',
  },
  {
    title: '风险与应急',
    time: '审核时间：2020-01-26 23:52:41',
    statusText: '审核不通过',
    statusClass: 'status-fail',
    comment:
      '完全不符合要求，缺失核心内容:①无常态化风险识别、评估、处置机制;②无完整应急预案;③无应急演练和灾备方案的具体要求。',
    icon: 'el-icon-error',
    type: 'danger',
  },
  {
    title: '流程可执行性与落地性',
    time: '审核时间：2020-01-26 23:52:43',
    statusText: '审核通过',
    statusClass: 'status-pass',
    comment:
      '基础流程明确:电脑申请、硬件升级、数据恢复、新人入职电脑配置等基础流程清晰。配套表单初步完善。',
    icon: 'el-icon-success',
    type: 'success',
  },
  {
    title: '报告生成',
    time: '审核时间：2020-01-26 23:52:43',
    statusText: '审核完成，生成审核报告',
    statusClass: 'status-complete',
    icon: 'el-icon-finished',
    type: 'info',
  },
]);

// 文档结构数据
const documentStructure = reactive([
  { number: '一、', content: '目的', highlighted: false },
  { number: '二、', content: '适用范围', highlighted: false },
  { number: '三、', content: 'IT管理制度具体细则', highlighted: false },
  { number: '3.1.', content: 'IT硬件管理办法', highlighted: false },
  { number: '3.2.', content: 'IT软件管理办法', highlighted: false },
  { number: '3.3.', content: 'IT网络管理办法', highlighted: false },
  { number: '3.4.', content: 'IT安全管理办法', highlighted: true },
  { number: '3.5.', content: 'IT机房管理办法', highlighted: false },
  { number: '3.6.', content: 'IT数据备份管理办法', highlighted: false },
  { number: '四、', content: '处罚办法', highlighted: false },
  { number: '五、', content: '附则', highlighted: false },
]);

// 文件上传处理
const handleFileChange = (file) => {
  uploadedFile.value = file;
  console.log('已选择文件:', file.name);
};

// 开始审核
const startAudit = () => {
  if (uploadedFile.value && selectedDimensions.value.length > 0) {
    showAuditResult.value = true;
    console.log('开始审核:', {
      file: uploadedFile.value.name,
      dimensions: selectedDimensions.value,
    });
  }
};

// 返回上传界面
const backToUpload = () => {
  showAuditResult.value = false;
};
</script>

<style lang="less" scoped>
// 定义Less变量
@primary-color: #409eff;
@success-color: #67c23a;
@danger-color: #f56c6c;
@info-color: #909399;
@warning-color: #e6a23c;
@text-color-primary: #303133;
@text-color-regular: #606266;
@text-color-secondary: #909399;
@border-color-base: #dcdfe6;
@border-color-light: #e4e7ed;
@bg-color-base: #f5f7fa;
@bg-color-light: #fafafa;
@white: #ffffff;
@shadow-color: rgba(0, 0, 0, 0.08);
@transition-time: 0.3s;

// 定义混合
.box-shadow() {
  box-shadow: 0 2px 12px @shadow-color;
}

.border-radius(@radius: 8px) {
  border-radius: @radius;
}

.linear-gradient(@start-color, @end-color) {
  background: linear-gradient(135deg, @start-color 0%, @end-color 100%);
}

.status-badge(@bg-color, @text-color, @border-color) {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
  margin-bottom: 8px;
  background-color: @bg-color;
  color: @text-color;
  border: 1px solid @border-color;
}

.audit-container {
  background-color: @bg-color-base;
  min-height: 100%;

  .review-header {
    text-align: center;
    margin-bottom: 20px;

    h1 {
      font-size: 28px;
      color: @text-color;
      margin-bottom: 12px;
    }

    p {
      font-size: 16px;
      color: text-color-regular;
    }
  }

  .upload-section {
    max-width: 850px;
    margin: 0 auto;

    .upload-card {
      padding: 20px;

      .card-header {
        text-align: center;
        font-size: 20px;
        font-weight: bold;
        color: @primary-color;
      }

      .upload-demo {
        margin: 30px 0;
      }

      .audit-dimensions {
        margin: 30px 0;

        h3 {
          margin-bottom: 15px;
          color: @text-color-regular;
        }

        :deep(.el-checkbox-group) {
          display: flex;
          gap: 50px;
        }
      }

      .action-buttons {
        text-align: center;
        margin-top: 30px;

        :deep(.el-button--primary) {
          padding: 10px 20px;
        }
      }
    }
  }

  .audit-result-section {
    max-width: 1400px;
    margin: 0 auto;

    .audit-content {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 30px;
      min-height: calc(100vh - 120px);

      .audit-progress {
        .linear-gradient(#f0f7ff, #e6f7ff);
        padding: 24px;
        .border-radius();
        .box-shadow();
        height: fit-content;

        .res-container {
          margin: 0 auto 30px auto;
          text-align: right;

          :deep(.el-card__body) {
            padding: 8px;
          }

          .anser-input {
            display: flex;
            align-items: center;
            justify-content: flex-end;

            .right-input {
              background: #f2f2f2;
              padding: 10px;
              border-radius: 12px;
              margin-right: 20px;
            }
          }
        }

        .progress-header {
          margin-bottom: 24px;

          h3 {
            margin: 0;
            color: @primary-color;
            font-size: 18px;
          }
        }

        :deep(.el-timeline) {
          padding-left: 10px;
          
          .timeline-item-content {
            padding-left: 10px;

            .item-title {
              font-weight: 600;
              color: @text-color-primary;
              margin-bottom: 4px;
            }

            .item-status {
              &.status-pass {
                .status-badge(#f0f9eb, @success-color, #e1f3d8);
              }

              &.status-fail {
                .status-badge(#fef0f0, @danger-color, #fde2e2);
              }

              &.status-complete {
                .status-badge(#f0f0f0, @info-color, @border-color-light);
              }
            }

            .item-comment {
              background-color: @white;
              padding: 12px;
              .border-radius(4px);
              border-left: 3px solid @primary-color;
              font-size: 14px;
              color: @text-color-regular;
              margin-top: 8px;
            }
          }
        }
      }

      .document-content {
        background-color: @white;
        padding: 24px;
        .border-radius();
        .box-shadow();
        height: fit-content;

        .document-header {
          margin-bottom: 24px;
          padding-bottom: 12px;
          border-bottom: 1px solid @border-color-light;

          h3 {
            margin: 0;
            color: @primary-color;
            font-size: 18px;
          }
        }

        .document-list {
          margin-bottom: 30px;

          .document-item {
            display: flex;
            align-items: center;
            padding: 12px 16px;
            margin-bottom: 8px;
            .border-radius(4px);
            background-color: @bg-color-light;
            transition: all @transition-time;
            border-left: 4px solid @border-color-light;

            &.is-highlighted {
              background-color: #f0f7ff;
              border-left-color: @primary-color;
              box-shadow: 0 2px 8px
                rgba(
                  red(@primary-color),
                  green(@primary-color),
                  blue(@primary-color),
                  0.1
                );
            }

            .item-number {
              font-weight: 600;
              color: @primary-color;
              min-width: 40px;
            }

            .item-content {
              color: @text-color-primary;
              font-size: 15px;
            }
          }
        }

        .detailed-content {
          background-color: #f9f9f9;
          padding: 20px;
          .border-radius(6px);
          border: 1px solid @border-color-light;

          h4 {
            color: @primary-color;
            margin-top: 0;
            margin-bottom: 16px;
          }

          p {
            color: @text-color-regular;
            line-height: 1.6;
            margin: 12px 0;
          }

          .detail-list {
            list-style-type: none;
            padding-left: 0;
            margin-top: 16px;

            li {
              padding: 8px 0;
              padding-left: 20px;
              position: relative;
              color: @text-color-regular;
              line-height: 1.5;
              border-bottom: 1px dashed @border-color-light;

              &:before {
                content: '•';
                color: @primary-color;
                font-weight: bold;
                position: absolute;
                left: 0;
              }
            }
          }
        }
      }
    }
  }
}

// Element Plus组件样式覆盖
:deep(.el-upload) {
  .el-upload-dragger {
    padding: 40px 20px;
    background-color: @bg-color-light;

    .el-icon--upload {
      font-size: 60px;
      color: @primary-color;
      margin-bottom: 20px;
    }

    .el-upload__text {
      font-size: 16px;
      color: @text-color-regular;
    }
  }

  .el-upload__tip {
    margin-top: 15px;
    color: @text-color-secondary;
    font-size: 14px;
  }
}

// 响应式设计
@media (max-width: 1200px) {
  .audit-container {
    .audit-result-section {
      .audit-content {
        grid-template-columns: 1fr;
        gap: 20px;
      }
    }
  }
}
</style>
