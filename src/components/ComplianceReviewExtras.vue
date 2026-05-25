<!--
  合规审核额外选项组件，维护审核维度选择。
  本文件属于规章制度智能体前端最新版交付代码，整理时仅补充说明与注释，不改变业务逻辑。
-->
<template>
  <div class="compliance-extras">
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

const props = defineProps<{
  selectedDimensions: string[];
}>();

const emit = defineEmits<{
  (event: 'update:selectedDimensions', value: string[]): void;
  (event: 'select-all', value: boolean): void;
}>();

const localDimensions = computed({
  get: () => props.selectedDimensions,
  set: (value) => emit('update:selectedDimensions', value),
});

/** 处理用户交互或组件事件：handleSelectAll。 */
const handleSelectAll = (value: unknown) => {
  emit('select-all', Boolean(value));
};
</script>

<style lang="less" scoped>
.compliance-extras {
  display: flex;
  align-items: center;
  gap: 14px;
  min-width: 0;
}

.review-dimensions {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 14px;
  color: #333;
  min-width: 0;

  .el-checkbox-group {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px 12px;
  }

  .el-checkbox {
    margin-right: 0;
    height: 24px;
  }
}
</style>
