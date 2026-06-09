/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_AUTH_MODE?: string;
  readonly VITE_SM2_PUBLIC_KEY?: string;
  readonly VITE_AGENT_SESSION_EXPIRE_MINUTES?: string;
  readonly VITE_WATERMARK_API_BASE_URL?: string;
  readonly VITE_CONVERT_API_BASE_URL?: string;
  readonly VITE_AGENT_UPLOAD_API_BASE_URL?: string;
  readonly VITE_AGENT_UPLOAD_WORKSPACE_ID?: string;
  readonly VITE_REVIEW_PDF_PREPARE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module 'sm-crypto' {
  export const sm2: {
    doEncrypt(data: string, publicKey: string, cipherMode?: number): string;
  };
}
