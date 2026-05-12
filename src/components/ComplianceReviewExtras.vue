<template>
  <div class="compliance-extras">
    <el-upload
      class="upload-demo"
      :http-request="customUpload"
      :show-file-list="false"
    >
      <el-tooltip effect="dark" content="上传文件" placement="top">
        <el-icon class="icon"><Plus /></el-icon>
      </el-tooltip>
    </el-upload>

    <div v-if="uploadedFileName" class="uploaded-file-name">
      {{ uploadedFileName }}
    </div>

    <div class="review-dimensions">
      <span>选择审核维度</span>
      <el-checkbox-group v-model="localDimensions">
        <el-checkbox value="全选" @change="handleSelectAll">全选</el-checkbox>
        <el-checkbox value="合规性">合规性</el-checkbox>
        <el-checkbox value="冲突性">冲突性</el-checkbox>
        <el-checkbox value="文本规范性">文本规范性</el-checkbox>
      </el-checkbox-group>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { Plus } from '@element-plus/icons-vue';

const props = defineProps<{
  uploadedFileName: string;
  selectedDimensions: string[];
  customUpload: (options: any) => Promise<void> | void;
}>();

const emit = defineEmits<{
  (event: 'update:selectedDimensions', value: string[]): void;
  (event: 'select-all', value: boolean): void;
}>();

const localDimensions = computed({
  get: () => props.selectedDimensions,
  set: (value) => emit('update:selectedDimensions', value),
});

const handleSelectAll = (value: unknown) => {
  emit('select-all', Boolean(value));
};
</script>

<style lang="less" scoped>
.compliance-extras {
  margin-top: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.upload-demo {
  width: 100%;

  .icon {
    position: absolute;
    top: 60px;
    left: 30px;
    font-size: 25px;
    font-weight: 1000;
  }

  .icon:hover {
    background: #c9c7c4;
    border-radius: 50%;
    width: 28px;
    height: 28px;
    font-size: 22px;
  }
}

.uploaded-file-name {
  font-size: 14px;
  color: #666;
  position: absolute;
  top: 30px;
  left: 30px;
}

.review-dimensions {
  font-size: 14px;
  color: #333;

  .el-checkbox-group {
    margin-top: 8px;
  }

  .el-checkbox {
    margin-right: 12px;
  }
}
</style>
