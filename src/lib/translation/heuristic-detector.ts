import type { Language } from '@lib/i18n/language';

export interface DetectedLanguage {
  language: Language;
  confidence: number;
}

const PT_WORDS = new Set(
  (
    'de que não o a os as um uma uns umas é eu você vc pra para com por mas está tá tudo bem obrigado valeu sim também isso aqui hoje amanhã ' +
    'achei acho bom boa legal muito mesmo gostei demais beleza então oi olá nossa tbm sei agora ainda vamos ' +
    'menos mais mas porque quando onde como quem qual quais ele ela eles elas nós meu minha seu sua nosso nossa dele dela ' +
    'do da dos das no na nos nas num numa pelo pela pelos pelas ao aos à às se já só ou nem até sem sobre entre depois antes ' +
    'ser ter fazer foi era são estão estou tô vou vai vem tem tinha fica ficou acabou acabava pode posso quer quero sabe ' +
    'coisa gente nada nunca sempre ontem cedo tarde noite dia semana daí aí lá cá então né tipo cara mano vlw blz obg'
  ).split(' '),
);
const EN_WORDS = new Set(
  (
    'the and is are you i to of it that this what with for not have be was will can just yeah thanks ok hello hi ' +
    'we my at if how they in on good morning still nice one love great sounds see soon cool awesome yes ' +
    'less more but because when where who which he she them our your his her their me us from by about into over after before ' +
    'do does did done doing has had would could should shall may might must am been being get got make made go going went ' +
    'really very so too also only never always today tonight tomorrow yesterday week day night thing stuff guys lol'
  ).split(' '),
);

const AMBIGUOUS_WORDS = new Set(['no', 'a', 'as', 'to', 'me', 'so', 'do', 'ok', 'yes', 'show']);
const AMBIGUOUS_WEIGHT = 0.5;
const PT_SLANG = new Set(['vc', 'pra', 'tá', 'tô']);
const PT_SLANG_WEIGHT = 2;
const PT_ACCENT = /[ãõçáéíóúâêô]/g;
const PT_LAUGHTER = /^(k{3,}|(rs){2,})$/;
const PT_SUFFIXES = ['mente', 'ções', 'ção', 'ões', 'zinho', 'zinha', 'inho', 'inha', 'ando', 'endo', 'indo', 'ado', 'ada', 'ados', 'adas', 'ido', 'ida', 'agem', 'eiro', 'eira', 'dade', 'ável', 'ível', 'oso', 'osa'];
const EN_SUFFIXES = ['ing', 'tion', 'ness', 'ful', 'less', 'ight', 'ould', 'ly'];
const PT_PATTERN = /nh|lh/;
const EN_PATTERN = /th|wh|sh|w|y|ck|ee|oo/;
const SUFFIX_WEIGHT = 1;
const PATTERN_WEIGHT = 0.5;
const MIN_STEM = 2;
const MIN_SIGNAL = 2;
const WORD = /\p{L}+/gu;

function hasSuffix(word: string, suffixes: string[]): boolean {
  return suffixes.some((suffix) => word.length >= suffix.length + MIN_STEM && word.endsWith(suffix));
}

function scoreWord(word: string): { pt: number; en: number } {
  let pt = 0;
  let en = 0;
  if (PT_LAUGHTER.test(word)) {
    return { pt: 1, en: 0 };
  }
  const wordWeight = AMBIGUOUS_WORDS.has(word) ? AMBIGUOUS_WEIGHT : 1;
  if (PT_SLANG.has(word)) pt += PT_SLANG_WEIGHT;
  else if (PT_WORDS.has(word)) pt += wordWeight;
  if (EN_WORDS.has(word)) en += wordWeight;
  pt += word.match(PT_ACCENT)?.length ?? 0;
  if (!PT_WORDS.has(word) && !EN_WORDS.has(word)) {
    if (hasSuffix(word, PT_SUFFIXES)) pt += SUFFIX_WEIGHT;
    else if (hasSuffix(word, EN_SUFFIXES)) en += SUFFIX_WEIGHT;
    if (PT_PATTERN.test(word)) pt += PATTERN_WEIGHT;
    else if (EN_PATTERN.test(word)) en += PATTERN_WEIGHT;
  }
  return { pt, en };
}

export function detectPtEn(text: string): DetectedLanguage | null {
  let pt = 0;
  let en = 0;
  for (const word of text.toLowerCase().match(WORD) ?? []) {
    const score = scoreWord(word);
    pt += score.pt;
    en += score.en;
  }
  const total = pt + en;
  if (total < MIN_SIGNAL) return null;
  return { language: pt >= en ? 'pt' : 'en', confidence: Math.abs(pt - en) / total };
}
