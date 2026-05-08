export {};
interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string;
  // 在此处添加其他环境变量定义
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
declare global {
  interface Window {
    __AGENT_TOKEN__: string | null;
    __SCOPES_DATA__: {
      ancestorScope: any[];
      descendantScope: any[];
      user: string;
      query: string;
    };
  }
}


