export {};

declare global {
  interface Window {
    __AGENT_TOKEN__: string | null;
    __API_BASE_URL__: string;
    __SCOPES_DATA__: {
      ancestorScope: any[];
      descendantScope: any[];
      user: string;
      query: string;
      username?: string;
      nickname?: string;
      userId?: string;
      nickName?: string;
      mainUserInfo?: any;
      [key: string]: any;
    };
  }
}
