interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

export {};
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
