import type { Language } from '@lib/i18n/language';

export interface DetectedLanguage {
  language: Language;
  confidence: number;
}

const PT_WORDS = new Set(
  (
    'de que não o a os as um uma é eu você vc pra para com por mas está tá tudo bem obrigado valeu sim também isso aqui hoje amanhã ' +
    'achei acho bom boa legal muito mesmo gostei demais beleza então oi olá nossa tbm sei agora ainda vamos'
  ).split(' '),
);
const EN_WORDS = new Set(
  (
    'the and is are you i to of it that this what with for not have be was will can just yeah thanks ok hello hi ' +
    'we my at if how they in on good morning still ' +
    'nice one love great sounds see soon cool awesome yes'
  ).split(' '),
);

const PT_SLANG = new Set(['vc', 'pra', 'tá', 'tô']);
const PT_SLANG_WEIGHT = 2;
const PT_ACCENT = /[ãõçáéíóúâêô]/g;
const MIN_SIGNAL = 2;
const WORD = /\p{L}+/gu;

export function detectPtEn(text: string): DetectedLanguage | null {
  let pt = 0;
  let en = 0;
  for (const word of text.toLowerCase().match(WORD) ?? []) {
    if (PT_SLANG.has(word)) pt += PT_SLANG_WEIGHT;
    else if (PT_WORDS.has(word)) pt += 1;
    if (EN_WORDS.has(word)) en += 1;
    pt += word.match(PT_ACCENT)?.length ?? 0;
  }
  const total = pt + en;
  if (total < MIN_SIGNAL) return null;
  return { language: pt >= en ? 'pt' : 'en', confidence: Math.abs(pt - en) / total };
}
