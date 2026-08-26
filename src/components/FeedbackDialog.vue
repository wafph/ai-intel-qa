<template>
  <el-dialog
    :model-value="modelValue"
    title="问题反馈"
    width="560px"
    class="user-feedback-dialog"
    append-to-body
    align-center
    destroy-on-close
    :close-on-click-modal="false"
    :close-on-press-escape="!submitting"
    :show-close="!submitting"
    @close="closeDialog"
  >
    <el-form
      ref="formRef"
      :model="form"
      :rules="rules"
      label-position="top"
      class="feedback-form"
    >
      <el-form-item label="所属模块" prop="functionId">
        <el-select v-model="form.functionId" placeholder="请选择所属模块">
          <el-option
            v-for="option in moduleOptions"
            :key="option.value"
            :label="option.label"
            :value="option.value"
          />
        </el-select>
      </el-form-item>

      <el-form-item label="问题描述" prop="description">
        <el-input
          v-model="form.description"
          type="textarea"
          :rows="4"
          maxlength="20000"
          show-word-limit
          resize="none"
          placeholder="请详细描述遇到的问题"
        />
      </el-form-item>

      <el-form-item label="上传截图" class="feedback-upload-item">
        <el-upload
          v-model:file-list="fileList"
          class="feedback-upload"
          action=""
          accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
          list-type="picture-card"
          :auto-upload="false"
          :multiple="true"
          :limit="MAX_ATTACHMENTS"
          :disabled="submitting"
          :on-change="handleFileChange"
          :on-preview="handlePreview"
          :on-exceed="handleExceed"
        >
          <el-icon><Plus /></el-icon>
        </el-upload>
        <p class="upload-tip">支持 JPG、PNG、WebP，最多 5 张，单张不超过 10MB，总计不超过 30MB</p>
      </el-form-item>

      <div class="feedback-contact-row">
        <el-form-item label="联系电话" prop="contactPhone">
          <el-input
            v-model="form.contactPhone"
            maxlength="32"
            placeholder="请输入联系电话"
            clearable
          />
        </el-form-item>

        <el-form-item label="邮箱" prop="contactEmail">
          <el-input
            v-model="form.contactEmail"
            maxlength="254"
            placeholder="请输入联系邮箱"
            clearable
          />
        </el-form-item>
      </div>
    </el-form>

    <template #footer>
      <div class="feedback-dialog-footer">
        <el-button :disabled="submitting" @click="closeDialog">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="submitFeedback">
          提交反馈
        </el-button>
      </div>
    </template>
  </el-dialog>

  <el-dialog
    v-model="previewVisible"
    title="截图预览"
    width="70%"
    class="feedback-image-preview"
    append-to-body
  >
    <img :src="previewImageUrl" alt="反馈截图预览" />
  </el-dialog>
</template>

<script setup lang="ts">
import { nextTick, onUnmounted, reactive, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { ElMessage, type FormInstance, type FormRules, type UploadFile, type UploadFiles, type UploadUserFile } from 'element-plus';
import { Plus } from '@element-plus/icons-vue';
import { submitUserFeedback, type UserFeedbackSubmission } from '@/services/userFeedback';

type FunctionId = UserFeedbackSubmission['functionId'];

interface Props {
  modelValue: boolean;
  activeTab: string;
  sessionId?: string | null;
}

const props = withDefaults(defineProps<Props>(), {
  activeTab: '智能问答',
  sessionId: '',
});

const emit = defineEmits<{
  'update:modelValue': [visible: boolean];
}>();

const route = useRoute();
const formRef = ref<FormInstance>();
const submitting = ref(false);
const fileList = ref<UploadUserFile[]>([]);
const previewVisible = ref(false);
const previewImageUrl = ref('');
let ownedPreviewUrl = '';
let clientRequestId = '';

const MAX_ATTACHMENTS = 5;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_TOTAL_BYTES = 30 * 1024 * 1024;
const PHONE_PATTERN = /^[0-9+()\-\s]{5,32}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const moduleOptions: Array<{ label: string; value: FunctionId }> = [
  { label: '智能问答', value: 'qa' },
  { label: '智能检索', value: 'search' },
  { label: '辅助起草', value: 'draft' },
  { label: '合规审核', value: 'review' },
  { label: '其它', value: 'other' },
];

const tabToFunctionId: Record<string, FunctionId> = {
  智能问答: 'qa',
  智能检索: 'search',
  辅助起草: 'draft',
  合规审核: 'review',
};

const form = reactive({
  functionId: 'qa' as FunctionId,
  description: '',
  contactPhone: '',
  contactEmail: '',
});

const validatePhone = (_rule: unknown, value: string, callback: (error?: Error) => void) => {
  const phone = (value || '').trim();
  if (!phone || PHONE_PATTERN.test(phone)) callback();
  else callback(new Error('联系电话仅允许数字、空格、+、-和括号'));
};

const validateEmail = (_rule: unknown, value: string, callback: (error?: Error) => void) => {
  const email = (value || '').trim();
  if (!email || EMAIL_PATTERN.test(email)) callback();
  else callback(new Error('请输入正确的邮箱地址'));
};

const rules: FormRules = {
  functionId: [{ required: true, message: '请选择所属模块', trigger: 'change' }],
  description: [
    { required: true, whitespace: true, message: '请填写问题描述', trigger: 'blur' },
    { min: 1, max: 20000, message: '问题描述不能超过 20000 个字符', trigger: 'blur' },
  ],
  contactPhone: [{ validator: validatePhone, trigger: 'blur' }],
  contactEmail: [{ validator: validateEmail, trigger: 'blur' }],
};

const generateClientRequestId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `feedback_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
};

const resetForm = () => {
  form.functionId = tabToFunctionId[props.activeTab] || 'qa';
  form.description = '';
  form.contactPhone = '';
  form.contactEmail = '';
  fileList.value = [];
  clientRequestId = generateClientRequestId();
  nextTick(() => formRef.value?.clearValidate());
};

watch(
  () => props.modelValue,
  (visible) => {
    if (visible) resetForm();
  },
);

const removeUploadFile = (uid?: number) => {
  fileList.value = fileList.value.filter((item) => item.uid !== uid);
};

const handleFileChange = (uploadFile: UploadFile, uploadFiles: UploadFiles) => {
  const raw = uploadFile.raw;
  if (!raw) return;

  const extension = raw.name.split('.').pop()?.toLowerCase() || '';
  const allowedExtension = ['jpg', 'jpeg', 'png', 'webp'].includes(extension);
  const allowedMime = ['image/jpeg', 'image/png', 'image/webp'].includes(raw.type);
  if (!allowedExtension || !allowedMime) {
    removeUploadFile(uploadFile.uid);
    ElMessage.warning({ message: '仅支持 JPG、PNG、WebP 截图', offset: 72 });
    return;
  }
  if (raw.size > MAX_FILE_BYTES) {
    removeUploadFile(uploadFile.uid);
    ElMessage.warning({ message: '单张截图不能超过 10MB', offset: 72 });
    return;
  }

  const totalBytes = uploadFiles.reduce((total, item) => total + (item.raw?.size || 0), 0);
  if (totalBytes > MAX_TOTAL_BYTES) {
    removeUploadFile(uploadFile.uid);
    ElMessage.warning({ message: '全部截图总大小不能超过 30MB', offset: 72 });
  }
};

const handleExceed = () => {
  ElMessage.warning({ message: '最多上传 5 张截图', offset: 72 });
};

const revokeOwnedPreviewUrl = () => {
  if (ownedPreviewUrl) URL.revokeObjectURL(ownedPreviewUrl);
  ownedPreviewUrl = '';
};

const handlePreview = (uploadFile: UploadFile) => {
  revokeOwnedPreviewUrl();
  if (uploadFile.url) previewImageUrl.value = uploadFile.url;
  else if (uploadFile.raw) {
    ownedPreviewUrl = URL.createObjectURL(uploadFile.raw);
    previewImageUrl.value = ownedPreviewUrl;
  }
  previewVisible.value = Boolean(previewImageUrl.value);
};

const closeDialog = () => {
  if (submitting.value) return;
  previewVisible.value = false;
  emit('update:modelValue', false);
};

const submitFeedback = async () => {
  if (!formRef.value) return;
  const valid = await formRef.value.validate().catch(() => false);
  if (!valid) return;

  submitting.value = true;
  try {
    await submitUserFeedback({
      feedbackType: 'problem',
      functionId: form.functionId,
      description: form.description,
      contactPhone: form.contactPhone,
      contactEmail: form.contactEmail,
      clientRequestId,
      sessionId: props.sessionId || undefined,
      pagePath: route.fullPath,
      clientContext: {
        activeTab: props.activeTab,
        routePath: route.path,
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight,
        },
      },
      attachments: fileList.value.reduce<File[]>((files, item) => {
        if (item.raw) files.push(item.raw);
        return files;
      }, []),
    });
    ElMessage.success({ message: '反馈提交成功，感谢您的反馈', offset: 72 });
    emit('update:modelValue', false);
  } catch (error) {
    ElMessage.error({
      message: error instanceof Error ? error.message : '反馈提交失败，请稍后重试',
      offset: 72,
    });
  } finally {
    submitting.value = false;
  }
};

onUnmounted(revokeOwnedPreviewUrl);
</script>

<style lang="less" scoped>
.feedback-form {
  padding: 0;

  :deep(.el-form-item) {
    margin-bottom: 14px;
  }

  :deep(.el-form-item__label) {
    color: #303133;
    font-size: 14px;
    line-height: 22px;
    padding-bottom: 6px;
  }

  :deep(.el-select) {
    width: 100%;
  }

  :deep(.el-input__wrapper),
  :deep(.el-textarea__inner),
  :deep(.el-select__wrapper) {
    border-radius: 8px;
  }
}

.feedback-upload-item {
  margin-bottom: 14px !important;
}

.feedback-upload {
  :deep(.el-upload--picture-card),
  :deep(.el-upload-list--picture-card .el-upload-list__item) {
    width: 72px;
    height: 72px;
    border-radius: 8px;
  }

  :deep(.el-upload--picture-card) {
    background: #f8fbff;
    border-color: #cfd9e8;
  }

  :deep(.el-upload--picture-card:hover) {
    border-color: #1c73eb;
    color: #1c73eb;
  }
}

.upload-tip {
  width: 100%;
  margin-top: 6px;
  color: #909399;
  font-size: 12px;
  line-height: 18px;
}

.feedback-contact-row {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;

  :deep(.el-form-item) {
    margin-bottom: 6px;
  }
}

.feedback-dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;

  :deep(.el-button) {
    min-width: 80px;
    height: 36px;
    border-radius: 8px;
  }

  :deep(.el-button--primary) {
    background: #1c73eb;
    border-color: #1c73eb;
  }
}

:global(.user-feedback-dialog) {
  display: flex;
  flex-direction: column;
  max-width: calc(100vw - 24px);
  max-height: calc(100vh - 32px);
  margin: auto;
  border-radius: 12px;
  overflow: hidden;
}

:global(.user-feedback-dialog .el-dialog__header) {
  margin: 0;
  padding: 16px 20px 14px;
  border-bottom: 1px solid #ebeef5;
}

:global(.user-feedback-dialog .el-dialog__title) {
  color: #303133;
  font-size: 18px;
  font-weight: 600;
}

:global(.user-feedback-dialog .el-dialog__body) {
  flex: 0 1 auto;
  max-height: none;
  overflow-y: visible;
  padding: 16px 20px 4px;
}

:global(.user-feedback-dialog .el-dialog__footer) {
  padding: 12px 20px;
  border-top: 1px solid #ebeef5;
}

@media (max-width: 640px) {
  .feedback-contact-row {
    grid-template-columns: 1fr;
    gap: 0;

    :deep(.el-form-item) {
      margin-bottom: 14px;
    }
  }
}

@media (max-height: 719px) {
  :global(.user-feedback-dialog .el-dialog__body) {
    overflow-y: auto;
  }
}

:global(.feedback-image-preview) {
  max-width: calc(100vw - 32px);
  border-radius: 12px;
}

:global(.feedback-image-preview .el-dialog__body) {
  display: flex;
  justify-content: center;
  max-height: 72vh;
  overflow: auto;
  background: #f5f7fa;
}

:global(.feedback-image-preview img) {
  display: block;
  max-width: 100%;
  height: auto;
}
</style>
