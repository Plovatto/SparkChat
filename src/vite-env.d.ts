/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  readonly VITE_SOCKET_URL: string;
  readonly VITE_TRANSLATION_MODELS_URL?: string;
  readonly VITE_MEDIA_ORIGIN?: string;
  readonly VITE_KT_LOG_PUBLIC_KEY?: string;
  readonly VITE_KT_WITNESS_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
