declare module '@jitsi/rnnoise-wasm/dist/rnnoise.js' {
  const createRNNWasmModule: (options?: { wasmBinary?: ArrayBuffer }) => Promise<unknown>;
  export default createRNNWasmModule;
}
