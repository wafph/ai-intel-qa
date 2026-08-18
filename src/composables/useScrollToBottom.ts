/**
 * 滚动到底部 Composable
 * 提供"回到底部"按钮的状态管理和滚动控制能力。
 * 支持流式输出时自动跟随滚动、用户手动上滑后暂停自动跟随、点击按钮恢复自动跟随。
 * 支持动态切换滚动容器（通过 getContainer 函数返回的元素）。
 */
import { ref, computed, nextTick, onMounted, onUnmounted, watchEffect, type Ref, type ComputedRef } from 'vue';

export interface UseScrollToBottomOptions {
  // 滚动容器获取函数，可动态返回不同元素
  getContainer: () => HTMLElement | null;
  // 判断是否接近底部的阈值（像素），默认 50px
  threshold?: number;
  // 动态开关：当此返回值变化时强制重新绑定滚动事件（用于 with-original-panel 这类布局切换）
  getLayoutKey?: () => unknown;
}

export interface UseScrollToBottomReturn {
  // 是否自动跟随滚动（用户手动上滑时为 false）
  isAutoFollow: Ref<boolean>;
  // 是否显示回到底部按钮
  showScrollButton: ComputedRef<boolean>;
  // 滚动到底部（仅在 auto-follow 开启时生效）
  scrollToBottom: () => void;
  // 点击按钮滚到底部（恢复 auto-follow 并平滑滚动）
  goToBottom: () => void;
  // 重置自动跟随为 true（新消息添加时调用）
  resetAutoFollow: () => void;
}

export const useScrollToBottom = (
  options: UseScrollToBottomOptions,
): UseScrollToBottomReturn => {
  const { getContainer, threshold = 50, getLayoutKey } = options;

  // 是否自动跟随滚动
  const isAutoFollow = ref(true);

  // 当前绑定的滚动容器元素（用于跟踪变化）
  let currentContainer: HTMLElement | null = null;

  // 是否正处于"回到底部"按钮触发的平滑滚动中：
  // 平滑滚动途经的中间位置会触发 scroll 事件且不在底部，若被误判为"用户上滑"，
  // 已隐藏的按钮会在滚动途中闪显（豆包/元宝无此闪烁），用该标记跳过误判。
  let isGoingToBottom = false;
  // 平滑滚动异常中断（如容器被销毁）时的兜底定时器，超时后恢复对用户上滑的响应
  let goToBottomTimer: ReturnType<typeof setTimeout> | null = null;

  // 是否显示回到底部按钮
  const showScrollButton = computed(() => {
    // 关键修复：必须先读取 isAutoFollow，再做任何提前 return。
    // 新会话首条流式输出前内容未溢出（canScroll=false），若在此之前 return，
    // isAutoFollow 不会被收集为依赖，computed 仅剩容器引用这一个依赖（挂载后不变），
    // 后续用户上滑改变 isAutoFollow 时不会触发重新求值，按钮永远不显示，
    // 只有切换会话/历史记录重建视图（挂载即高内容）后才恢复正常。
    const autoFollow = isAutoFollow.value;
    const el = getContainer();
    if (!el) return false;
    const canScroll = el.scrollHeight > el.clientHeight + 1;
    if (!canScroll) return false;
    return !autoFollow;
  });

  // 判断滚动容器是否接近底部
  const isNearBottom = () => {
    const el = getContainer();
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight <= threshold;
  };

  // 滚动事件处理：用户手动上滑时暂停自动跟随，滑回底部时恢复
  const handleScroll = () => {
    if (isNearBottom()) {
      isAutoFollow.value = true;
      // 到达底部说明"回到底部"的平滑滚动已结束，清除标记
      isGoingToBottom = false;
    } else if (!isGoingToBottom) {
      // "回到底部"平滑滚动途中不暂停自动跟随，避免按钮闪烁；
      // 只有用户主动上滑离开底部时才暂停自动跟随并显示按钮
      isAutoFollow.value = false;
    }
  };

  // 绑定滚动事件到指定容器（仅当发生变化时才解绑/绑定）
  const bindContainer = (el: HTMLElement | null) => {
    if (currentContainer === el) return;
    if (currentContainer) {
      currentContainer.removeEventListener('scroll', handleScroll);
    }
    if (el) {
      el.addEventListener('scroll', handleScroll, { passive: true });
    }
    currentContainer = el;
  };

  // 滚动到底部（仅在 auto-follow 开启时生效）
  const scrollToBottom = () => {
    if (!isAutoFollow.value) return;
    nextTick(() => {
      // 二次检查：防止 nextTick 排队期间用户已上滑，避免把用户拉回底部
      if (!isAutoFollow.value) return;
      const el = getContainer();
      if (el) {
        el.scrollTop = el.scrollHeight;
      }
    });
  };

  // 点击按钮滚到底部
  const goToBottom = () => {
    isAutoFollow.value = true;
    nextTick(() => {
      const el = getContainer();
      if (!el) return;
      // 标记进入平滑滚动，途中触发的 scroll 事件不再误判为用户上滑
      isGoingToBottom = true;
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
      // 兜底：平滑滚动被异常中断时，超时后恢复对用户上滑的正常响应
      if (goToBottomTimer) clearTimeout(goToBottomTimer);
      goToBottomTimer = setTimeout(() => {
        isGoingToBottom = false;
      }, 800);
    });
  };

  // 重置自动跟随为 true
  const resetAutoFollow = () => {
    isAutoFollow.value = true;
  };

  // 生命周期：绑定/解绑滚动事件
  onMounted(() => {
    bindContainer(getContainer());
  });

  onUnmounted(() => {
    if (currentContainer) {
      currentContainer.removeEventListener('scroll', handleScroll);
      currentContainer = null;
    }
    // 组件卸载时清理兜底定时器，避免内存泄漏
    if (goToBottomTimer) {
      clearTimeout(goToBottomTimer);
      goToBottomTimer = null;
    }
  });

  // 用 watchEffect 监听 getContainer + getLayoutKey 变化，强制重新绑定
  // 避免仅靠引用比较时 activeOriginalMessage 切换不触发重绑
  watchEffect(() => {
    // 读取这些响应式依赖，让 watchEffect 能自动追踪变化
    getLayoutKey && getLayoutKey();
    bindContainer(getContainer());
  });

  return {
    isAutoFollow,
    showScrollButton,
    scrollToBottom,
    goToBottom,
    resetAutoFollow,
  };
};
