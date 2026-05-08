<template>
  <div class="not-found-container">
    <!-- 动画背景 -->
    <div class="background-animation"></div>

    <div class="content-wrapper">
      <!-- 左侧错误信息 -->
      <div class="error-content">
        <div class="error-code">
          <span class="digit">4</span>
          <div class="zero">
            <div class="inner-circle"></div>
          </div>
          <span class="digit">4</span>
        </div>

        <h1 class="title">页面走丢了</h1>
        <p class="description">您访问的页面不存在</p>

        <div class="action-buttons">
          <el-button type="primary" size="large" @click="goHome" class="home-btn">
            <el-icon><HomeFilled /></el-icon>
            返回首页
          </el-button>
          <el-button type="success" size="large" @click="goBack" class="back-btn">
            <el-icon><ArrowLeft /></el-icon>
            返回上一页
          </el-button>
        </div>

        <!-- 快速链接 -->
        <!-- <div class="quick-links">
          <h3>快速导航</h3>
          <div class="links">
            <el-link
              v-for="link in quickLinks"
              :key="link.path"
              :underline="false"
              @click="navigateTo(link.path)"
              class="link-item"
            >
              <el-icon :size="20" class="link-icon">
                <component :is="link.icon" />
              </el-icon>
              {{ link.label }}
            </el-link>
          </div>
        </div> -->
      </div>

      <!-- 右侧插图 -->
      <div class="illustration">
        <div class="astronaut-container">
          <div class="astronaut">
            <div class="helmet"></div>
            <div class="body"></div>
            <div class="arm left"></div>
            <div class="arm right"></div>
            <div class="leg left"></div>
            <div class="leg right"></div>
            <div class="oxygen-tank"></div>
          </div>
          <div class="floating-elements">
            <div class="planet"></div>
            <div class="star" v-for="n in 8" :key="`star-${n}`"></div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import {
  HomeFilled,
  ArrowLeft,
  // Search,
  // ChatDotRound,
  // Document,
  // View,
} from '@element-plus/icons-vue';

const router = useRouter();

// // 快速链接
// const quickLinks = ref([
//   { label: '智能问答', path: '/intelligent-qa', icon: ChatDotRound },
//   { label: '辅助起草', path: '/auxiliary-draft', icon: Document },
//   { label: '合规审核', path: '/compliance-review', icon: View },
//   { label: '智能检索', path: '/intelligent-retrieval', icon: Search },
// ]);

// 返回首页
const goHome = () => {
  router.push('/');
};

// 返回上一页
const goBack = () => {
  if (window.history.length > 1) {
    router.back();
  } else {
    router.push('/');
  }
};

// // 导航到指定页面
// const navigateTo = (path: string) => {
//   router.push(path);
// };

// 粒子动画样式

// 鼠标移动效果
let mouseX = 0;
let mouseY = 0;

const handleMouseMove = (e: MouseEvent) => {
  mouseX = e.clientX;
  mouseY = e.clientY;
  updateParallax();
};

const updateParallax = () => {
  const parallaxElements = document.querySelectorAll('.parallax');
  parallaxElements.forEach((el) => {
    const speed = parseFloat(el.getAttribute('data-speed') || '0');
    const x = (window.innerWidth - mouseX * speed) / 100;
    const y = (window.innerHeight - mouseY * speed) / 100;
    (el as HTMLElement).style.transform = `translateX(${x}px) translateY(${y}px)`;
  });
};

onMounted(() => {
  window.addEventListener('mousemove', handleMouseMove);
});

onUnmounted(() => {
  window.removeEventListener('mousemove', handleMouseMove);
});
</script>

<style lang="less" scoped>
.not-found-container {
  min-height: 100vh;
  background: #097bed;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  overflow: hidden;
  font-family: 'PingFang SC', 'Microsoft YaHei', sans-serif;
  color: white;
  padding: 20px;
}

.background-animation {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  overflow: hidden;
  z-index: 1;
}

.content-wrapper {
  display: flex;
  align-items: center;
  justify-content: space-between;
  max-width: 1200px;
  width: 100%;
  z-index: 2;
  position: relative;
  gap: 60px;

  @media (max-width: 768px) {
    flex-direction: column;
    text-align: center;
    gap: 40px;
  }
}

.error-content {
  flex: 1;
  max-width: 600px;
}

.error-code {
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 30px;
  gap: 20px;

  .digit {
    font-size: 120px;
    font-weight: 900;
    text-shadow: 5px 5px 0 rgba(0, 0, 0, 0.2);
    color: white;

    @media (max-width: 768px) {
      font-size: 80px;
    }
  }

  .zero {
    position: relative;
    width: 100px;
    height: 100px;
    background: white;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
    animation: pulse 2s infinite;

    @media (max-width: 768px) {
      width: 70px;
      height: 70px;
    }

    .inner-circle {
      width: 40px;
      height: 40px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      border-radius: 50%;

      @media (max-width: 768px) {
        width: 30px;
        height: 30px;
      }
    }

    @keyframes pulse {
      0%,
      100% {
        transform: scale(1);
      }
      50% {
        transform: scale(1.05);
      }
    }
  }
}

.title {
  font-size: 36px;
  font-weight: 700;
  margin-bottom: 20px;
  text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.3);
  text-align: center;
  @media (max-width: 768px) {
    font-size: 28px;
  }
}

.description {
  font-size: 18px;
  line-height: 1.6;
  margin-bottom: 40px;
  text-align: center;
  opacity: 0.9;

  @media (max-width: 768px) {
    font-size: 16px;
  }
}

.action-buttons {
  display: flex;
  gap: 20px;
  margin-bottom: 40px;
  justify-content: center;
  flex-wrap: wrap;

  .el-button {
    padding: 12px 32px;
    border-radius: 25px;
    font-weight: 500;
    transition: all 0.3s ease;

    &:hover {
      transform: translateY(-2px);
      box-shadow: 0 8px 20px rgba(0, 0, 0, 0.2);
    }

    .el-icon {
      margin-right: 8px;
    }
  }
}

.quick-links {
  h3 {
    font-size: 20px;
    margin-bottom: 20px;
    font-weight: 600;
  }

  .links {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 15px;

    @media (max-width: 480px) {
      grid-template-columns: 1fr;
    }

    .link-item {
      display: flex;
      align-items: center;
      padding: 12px 20px;
      background: rgba(255, 255, 255, 0.1);
      border-radius: 12px;
      cursor: pointer;
      transition: all 0.3s ease;
      color: white;
      text-decoration: none;
      border: 1px solid transparent;

      &:hover {
        background: rgba(255, 255, 255, 0.2);
        border-color: rgba(255, 255, 255, 0.3);
        transform: translateX(5px);
      }

      .link-icon {
        margin-right: 10px;
        color: #667eea;
      }
    }
  }
}

.illustration {
  flex: 0 0 400px;

  @media (max-width: 768px) {
    flex: 0 0 auto;
    width: 300px;
  }

  .astronaut-container {
    position: relative;
    width: 400px;
    height: 400px;

    @media (max-width: 768px) {
      width: 300px;
      height: 300px;
    }
  }

  .astronaut {
    position: absolute;
    width: 120px;
    height: 180px;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    animation: floatAstronaut 6s ease-in-out infinite;

    .helmet {
      position: absolute;
      width: 80px;
      height: 80px;
      background: white;
      border-radius: 50%;
      top: 0;
      left: 20px;

      &:before {
        content: '';
        position: absolute;
        width: 60px;
        height: 30px;
        background: rgba(102, 126, 234, 0.8);
        border-radius: 15px;
        top: 25px;
        left: 10px;
      }
    }

    .body {
      position: absolute;
      width: 60px;
      height: 80px;
      background: white;
      border-radius: 30px;
      top: 70px;
      left: 30px;
    }

    .arm,
    .leg {
      position: absolute;
      background: white;
      border-radius: 10px;
    }

    .arm {
      width: 40px;
      height: 20px;
      top: 80px;

      &.left {
        left: -10px;
        transform: rotate(45deg);
      }

      &.right {
        right: -10px;
        transform: rotate(-45deg);
      }
    }

    .leg {
      width: 20px;
      height: 60px;
      top: 150px;

      &.left {
        left: 40px;
        transform: rotate(15deg);
      }

      &.right {
        right: 40px;
        transform: rotate(-15deg);
      }
    }

    .oxygen-tank {
      position: absolute;
      width: 20px;
      height: 40px;
      background: #764ba2;
      border-radius: 10px;
      top: 90px;
      right: 20px;
    }

    @keyframes floatAstronaut {
      0%,
      100% {
        transform: translate(-50%, -50%);
      }
      50% {
        transform: translate(-50%, -55%);
      }
    }
  }

  .floating-elements {
    .planet {
      position: absolute;
      width: 100px;
      height: 100px;
      background: linear-gradient(135deg, #ff9a9e 0%, #fad0c4 100%);
      border-radius: 50%;
      top: 20px;
      right: 20px;
      animation: rotate 20s linear infinite;

      @keyframes rotate {
        from {
          transform: rotate(0deg);
        }
        to {
          transform: rotate(360deg);
        }
      }
    }

    .star {
      position: absolute;
      background: white;
      border-radius: 50%;
      animation: twinkle 3s infinite;
    }
  }
}
</style>
