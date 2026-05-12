/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_SCOPES_API_BASE_URL?: string;
  readonly VITE_AGENT_SESSION_EXPIRE_MINUTES?: string;
  readonly VITE_WATERMARK_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
