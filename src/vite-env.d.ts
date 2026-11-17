/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  readonly VITE_SOCKET_URL: string;
  /** Optional origin for the translation models (e.g. an R2 bucket with CORS). */
  readonly VITE_TRANSLATION_MODELS_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
