export const env = {
  apiUrl: import.meta.env.VITE_API_URL,
  socketUrl: import.meta.env.VITE_SOCKET_URL,
  ktLogPublicKey: import.meta.env.VITE_KT_LOG_PUBLIC_KEY,
  ktWitnessUrl: import.meta.env.VITE_KT_WITNESS_URL,
} as const;
