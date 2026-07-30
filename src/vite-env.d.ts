/// <reference types="vite/client" />

declare const __APP_VERSION__: string;

type QdnRequestPayload = {
  action: string;
  [key: string]: unknown;
};

interface Window {
  qdnRequest?: <T = unknown>(request: QdnRequestPayload) => Promise<T>;
  _qdnAccent?: unknown;
  _qdnLang?: unknown;
  _qdnLanguage?: unknown;
  _qdnTextSize?: unknown;
  _qdnTheme?: unknown;
  _qdnUiStyle?: unknown;
  _qdnUIStyle?: unknown;
}
