import { isBergamotRuntimeSupported } from './engines/bergamot-loader';

export function isTranslationSupportedOnDevice(): boolean {
  return 'Translator' in globalThis || isBergamotRuntimeSupported();
}
