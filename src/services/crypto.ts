/**
 * SM2 密码加密工具封装。
 *
 * 本文件属于规章制度智能体前端最新版交付代码，整理时仅补充说明与注释，不改变业务逻辑。
 */
import { sm2 } from 'sm-crypto';
import { SM2_PUBLIC_KEY } from './config';

/**
 * 使用集团统一 SM2 公钥加密密码。
 *
 * 后端 V12 已按统一入口要求关闭服务端二次加密，前端必须把 password
 * 加密成 04 + cipherText 的格式后再调用 /v1/agent-permission/platform-login。
 */
export const encryptPasswordBySm2 = (password: string) => {
  if (!SM2_PUBLIC_KEY) {
    throw new Error('未配置 VITE_SM2_PUBLIC_KEY，无法完成密码加密');
  }
  const cipherText = sm2.doEncrypt(password, SM2_PUBLIC_KEY, 1);
  return `04${cipherText}`;
};
