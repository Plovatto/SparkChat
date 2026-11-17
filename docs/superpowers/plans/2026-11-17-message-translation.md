# Tradução de Mensagens (Translator API + Bergamot) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Traduzir automaticamente, no navegador, as mensagens recebidas para o idioma da interface (pt ↔ en), com selo "Traduzida · Ver original", e opcionalmente traduzir o que o usuário escreve antes de enviar — em qualquer navegador moderno, desktop ou celular, sem custo e sem quebrar a E2E.

**Architecture:** Tudo no SPA. Um módulo `src/lib/translation/` expõe uma interface única de engine com duas implementações: **native** (Chrome Translator API + LanguageDetector, modelos geridos pelo Chrome) e **bergamot** (WASM do motor do Firefox Translations rodando num Web Worker, com os modelos pt↔en oficiais da Mozilla servidos pelo próprio GitHub Pages e guardados no Cache API). Um roteador escolhe a engine por par de idiomas (native primeiro). Hooks em `features/chat` ligam isso ao `MessageBubble` e ao `MessageInput`. Sem engine disponível → mensagens no original.

**Tech Stack:** React 19, TypeScript, react-i18next, Vitest (ambiente node, testes `*.test.ts` colocados), Chrome Translator/LanguageDetector API (Chrome 138+ desktop), `@mkljczk/bergamot-translator@0.4.16` (MPL-2.0, fork mantido do `@browsermt/bergamot-translator`, parado desde 2022), modelos Mozilla `en-pt`/`pt-en` (status Release), GitHub Pages.

**Spec (requisitos do usuário, 2026-11-17):**
1. Nas configurações do usuário, opção para ligar/desligar a tradução automática. **Ligada por padrão.**
2. Usar o idioma da interface do chat. Interface em pt + mensagem em en → traduz automaticamente (e vice-versa).
3. Mensagem traduzida mostra que foi traduzida e permite ver a original.
4. Opção de traduzir a mensagem para o idioma contrário ao enviar, traduzindo enquanto escreve.
5. Implementar Translator API **e** Bergamot (funcionar em Firefox, Safari, celular).
6. Adicionar `translate="no"` no `<html>` do app.
7. Totalmente grátis, sem quebrar a promessa de E2E.
8. **Sem pedido de permissão para baixar o tradutor:** com a tradução automática ligada (padrão), o app já tem permissão. Quem não quiser, desliga a opção.

## Ordem de execução

Task 0 é portão **só do Bergamot** e precisa de aparelhos reais (humano). Ordem: **1 → 2 → 3 → 6a → 6 → 7 → 8 → 9 → 10** (entrega completa com a engine native e mensagens no original fora do Chrome desktop) → **Task 0 (humano)** → **4 → 5** (liga o fallback Bergamot via `registerFallbackEngine`/loader, sem mexer nas tasks anteriores).
Task 11 (SparkAI) foi adicionada depois, a pedido do usuário, e roda após a Task 5.

## Fatos verificados (17/11/2026)

- Registro público da Mozilla (`.../db/models.json`) tem `en-pt` e `pt-en` com `releaseStatus: "Release"`, arquitetura `base-memory`.
- O bucket da Mozilla **não envia `Access-Control-Allow-Origin`** → o navegador não pode baixar de lá; precisamos re-hospedar.
- Tamanhos (gzip / descompactado): en→pt = 25.866.313 B / ~36,3 MB; pt→en = 25.596.942 B / ~37,0 MB. Uma direção ≈ **26 MB** de download.
- `@mkljczk/bergamot-translator@0.4.16` traz `translator.js` + `worker/translator-worker.js` + `worker/bergamot-translator-worker.js` + `.wasm` (5,2 MB). Aceita `registryUrl`, `workerUrl`, `pivotLanguage`, um `TranslatorBacking` customizável (subclasse pode sobrescrever `fetch`) e `BatchTranslator.translate({ from, to, text, html, priority })`. Registro esperado: `{ "enpt": { "model": {name,size,expectedSha256Hash}, "lex": {...}, "vocab": {...} } }`. Não descompacta gzip sozinho.
- **Task 0 executada (17/11/2026, Playwright 1.56.1, modelos locais):** fork 0.4.16 + modelos `base-memory` traduzem pt↔en corretamente em Chromium 141, Firefox 142 e WebKit 26. 1ª tradução por par (inclui carga do modelo): 2,1–2,3 s Chromium, 5,8–7,4 s Firefox, 5,4–7,2 s WebKit; seguintes: 0,15–1,2 s. Heap JS ~77 MB (Chromium). Nenhum recurso extra (SIMD etc.) precisou de checagem. Celulares reais não testados (sem aparelho); emulação não reproduz CPU/memória — iOS/Android ficam cobertos pelo WebKit/Chromium + fallback `failed` da Task 5. Portão **aprovado** → Tasks 4 e 5 liberadas.

## Global Constraints

- Idiomas: apenas `'pt'` e `'en'` (`Language` de `@lib/i18n/language`). Alvo do recebimento = `currentLanguage()`; alvo do envio = `oppositeLanguage(currentLanguage())`.
- Nenhum texto de mensagem sai do navegador. Nenhuma alteração em `API-SparkChat`.
- Única dependência nova: `"@mkljczk/bergamot-translator": "0.4.16"` (versão exata), carregada só por `import()` dinâmico — fora do bundle inicial.
- Arquivos de modelo nunca entram no git: `public/translation-models/` e `public/bergamot/` no `.gitignore`, gerados por script.
- Base dos modelos: `import.meta.env.VITE_TRANSLATION_MODELS_URL ?? \`${import.meta.env.BASE_URL}translation-models/v1/\`` (permite trocar para R2 só com env).
- Cache API: `TRANSLATION_MODELS_CACHE = 'sparkchat-translation-models-v1'`.
- Download do Bergamot **sem diálogo de permissão**: tradução automática ligada = autorizado. Mesmo assim é **sob demanda e por direção**: só baixa en→pt quando chega a primeira mensagem que precisa de en→pt (ou quando o envio traduzido é ligado, para pt→en). Tradução automática desligada = nenhum download.
- Preferência global: `sparkchat:auto-translate`, ausente = **ligado**. Envio traduzido por sala: `usePersistedIdSet(\`outgoingTranslation:${userId}\`)`, padrão **desligado**.
- Constantes: `MIN_DETECTION_CONFIDENCE = 0.7`, `MIN_TRANSLATABLE_LETTERS = 4`, `OUTGOING_TRANSLATION_DEBOUNCE_MS = 400`, `TRANSLATION_CACHE_SIZE = 500`, `BERGAMOT_IDLE_TEARDOWN_MS = 120_000`, `BERGAMOT_PAIR_DOWNLOAD_MB = 26`.
- **Bergamot só em aparelho incompatível com a Translator API:** se `'Translator' in globalThis` e o par não é `'unavailable'`, o pacote, o worker, o WASM e os modelos **nunca** são baixados (nem `import()`).
- Toda string visível em `src/locales/{pt,en}/app.json` (as duas línguas juntas).
- Commits no padrão gitmoji do repo (`:sparkles: feat: ...`).

## Regras de segurança (prioridade sobre conveniência)

1. **Nenhum texto de mensagem em disco.** Original, tradução e rascunho traduzido ficam só em memória (cache da Task 6a, estado React). Cache API e `public/` guardam apenas arquivos públicos (modelos e runtime). Nada de IndexedDB/localStorage/sessionStorage com conteúdo — localStorage só guarda preferências (`sparkchat:auto-translate`, ids de sala do envio traduzido).
2. **Nenhum texto de mensagem sai do navegador.** Sem chamadas de rede com conteúdo; o worker do Bergamot só faz `fetch` de arquivos de modelo da própria origem (ou de `VITE_TRANSLATION_MODELS_URL`). A Translator API do Chrome roda no aparelho. `translate="no"` impede o "Traduzir esta página" do Chrome de enviar a conversa para o Google.
3. **Nenhum texto de mensagem em log.** Proibido `console.*` / `logger` / mensagens de `Error` contendo conteúdo original ou traduzido; erros de tradução são registrados só com o código (`'translate-failed'`, `'model-load-failed'`).
4. **Saída do tradutor é dado não confiável.** Renderizada sempre como texto React (nunca `dangerouslySetInnerHTML`); Bergamot sempre com `html: false`; menções/links vêm do original (Task 2), não do tradutor.
5. **Integridade da cadeia de fornecimento.** Modelos verificados por sha256 no build (`npm run models:fetch`, hashes do `.gz` e do conteúdo descompactado) **e** no navegador: cada arquivo baixado é conferido por sha256 contra os hashes fixados no bundle (a partir do manifest), tanto do `.gz` publicado quanto do conteúdo bruto — sem SRI (`integrity`), que falharia em hosts que servem o `.gz` com `Content-Encoding: gzip`; a verificação independe do host. Corpo maior que o tamanho fixado é abortado. Só bytes verificados entram na Cache API. Arquivos do runtime Bergamot com sha256 fixado no manifest (Task 4) e versão npm exata com `package-lock`.
6. **Limpeza explícita.** Cache de traduções limpo no logout, quando a chave de uma sala é removida e quando uma mensagem é apagada para todos; cache em memória limitado (`TRANSLATION_CACHE_SIZE`).
7. **Criptografia do envio intocada.** O texto traduzido entra no mesmo caminho de `encryptOutgoingMessage`; o rascunho original nunca é enviado nem guardado.
8. **Notificações não são traduzidas** (menos superfícies com conteúdo).

## Review Focus

1. **Primeira mensagem estrangeira com o modelo ainda baixando:** a mensagem aparece no original com selo "Preparando tradução…", e troca para a traduzida sozinha quando o download termina, sem recarregar e sem baixar duas vezes se chegarem várias mensagens juntas. Com a opção desligada, nada é baixado. → testes em Task 5 e Task 6.
2. **Menções e URLs:** `@Ana` e `https://...` nunca passam pelo tradutor; destaque de menção continua no texto traduzido. → Task 2.
3. **Mensagem curta/ambígua** ("ok", "kkk", "👍", "lol", só link): sem tradução e sem selo, em ambas as engines. → Task 2 e Task 3.
4. **Worker do WASM falha ou é morto por falta de memória (iOS):** mensagem fica no original, engine marcada como `failed` na sessão (sem loop de tentativas), app segue funcionando. → Task 5.
6. **Texto de mensagem vazando para armazenamento ou log** (cache em disco, `console.error(err)` com o texto, mensagem apagada que continua traduzida, tradução do placeholder "mensagem indisponível"): nada disso pode acontecer. → testes em Task 6a e Task 6 + checagem manual em Task 8.
5. **Enviar com tradução do rascunho pendente/falha:** aguarda a tradução em andamento; falhou → envia o original e avisa; nunca envia tradução de um rascunho anterior. → Task 9.

---

## File Structure

```
scripts/
  translation-models.manifest.json   // caminhos Mozilla + sha256 fixados (fonte da verdade)
  fetch-translation-models.mjs       // baixa, verifica, gera public/translation-models/v1 + copia runtime p/ public/bergamot
src/lib/translation/
  index.ts                           // barrel público
  types.ts                           // TranslationEngine, TranslationSupport, PairKey
  translation-api.d.ts               // tipos globais Translator / LanguageDetector
  segments.ts (+ .test.ts)           // proteger @menções/URLs; elegibilidade
  heuristic-detector.ts (+ .test.ts) // detector pt×en por stopwords/acentos (fallback do LanguageDetector)
  detection.ts (+ .test.ts)          // usa LanguageDetector se existir, senão heurística
  engines/native-engine.ts (+ .test.ts)
  engines/bergamot-engine.ts (+ .test.ts)
  engines/model-fetch.ts (+ .test.ts)  // Cache API + SRI + gunzip + progresso
  engines/bergamot-loader.ts         // import() dinâmico do bergamot-engine (único ponto de entrada)
  router.ts (+ .test.ts)             // escolhe engine por par (native sempre que a API existir)
  translation-cache.ts (+ .test.ts)  // cache SÓ em memória + limpezas (logout, sala, apagada)
  incoming.ts (+ .test.ts)           // detectar → rotear → traduzir → cache → fila
src/lib/i18n/language.ts             // + oppositeLanguage()
src/constants/storage-keys.ts        // + AUTO_TRANSLATE_STORAGE_KEY
src/features/chat/hooks/
  useAutoTranslatePreference.ts      // + AutoTranslateContext
  useTranslationAvailability.ts      // só p/ o aviso "não disponível neste dispositivo"
  useInViewport.ts                   // IntersectionObserver p/ traduzir só o que está na tela
  useMessageTranslation.ts
  outgoing-draft.ts (+ .test.ts)
  useOutgoingTranslation.ts
src/features/chat/components/TranslationBadge.tsx
src/features/chat/components/MessageBubble.tsx, MessageInput.tsx, ChatArea.tsx
src/features/rooms/components/EditProfileModal.tsx, Sidebar.tsx
src/app/App.tsx
app/index.html                       // translate="no"
src/locales/{pt,en}/app.json, landing.json
.gitignore, package.json, .github/workflows/deploy-pages.yml
```

---

### Task 0: Portão — Bergamot fork + modelos Mozilla pt↔en funcionam no navegador?

Spike descartável, **fora do repo** (pasta temporária). Nada de código de produção antes do resultado.

- [ ] **Step 1:** Numa pasta vazia: `npm i @mkljczk/bergamot-translator@0.4.16`; baixar os 6 arquivos `.gz` listados na Task 4 do bucket da Mozilla, descompactar (`gzip -dk`), conferir `sha256sum model.*.bin` contra `uncompressedHash` (en-pt `07892fd2…a770`, pt-en `7b854f1e…9157`).
- [ ] **Step 2:** Página HTML mínima servida por `npx serve` com `BatchTranslator({ registryUrl: './registry.json', pivotLanguage: null, workerUrl: <url absoluta de node_modules/.../worker/translator-worker.js> })` e `registry.json` no formato `{ enpt: { model:{name,size:0}, lex:{...}, vocab:{...} }, pten: {...} }`. Traduzir: "Good morning everyone, are we still meeting at 3pm today?" (en→pt) e "Bom dia pessoal, a reunião ainda está de pé hoje às 15h?" (pt→en).
- [ ] **Step 3: Critério de aprovação:** traduções coerentes em Chrome desktop, Firefox desktop, Safari iOS (≥ 16.4) e Chrome Android; anotar tempo da 1ª tradução (carga do modelo) e das seguintes, e o pico de memória da aba (DevTools / Safari Web Inspector).
- [ ] **Step 4: Se falhar** (erro ao carregar modelo `base-memory`, texto lixo): parar e reportar. Alternativas a decidir com o usuário: (a) usar o build do bergamot do `mozilla/translations` (inference engine) compilado com emscripten; (b) seguir só com a engine native (Tasks 1–3, 6–10 sem Task 4–5). Registrar o resultado no topo deste plano.
- [ ] **Step 5:** Se algum navegador alvo falhar por falta de recurso WASM (ex.: SIMD), registrar qual e acrescentar a checagem correspondente em `isBergamotRuntimeSupported()` (Task 5).

---

### Task 1: Contrato de engine + engine native (Chrome)

**Files:**
- Create: `src/lib/translation/types.ts`, `src/lib/translation/translation-api.d.ts`, `src/lib/translation/engines/native-engine.ts`, `src/lib/translation/index.ts`
- Test: `src/lib/translation/engines/native-engine.test.ts`

**Interfaces:**
- Produces:
  - `type TranslationSupport = 'unavailable' | 'downloadable' | 'downloading' | 'available' | 'failed'`
  - `type EngineId = 'native' | 'bergamot'`
  - `interface TranslationEngine { id: EngineId; support(source: Language, target: Language): Promise<TranslationSupport>; prepare(source: Language, target: Language): Promise<void>; translate(text: string, source: Language, target: Language, options?: { priority?: number }): Promise<string>; onProgress(listener: (event: { engine: EngineId; pair: PairKey; loaded: number; total: number }) => void): () => void }`
  - `type PairKey = 'en-pt' | 'pt-en'`, `pairKey(source, target): PairKey`
  - `nativeEngine: TranslationEngine` — `support` mapeia `Translator.availability()` (`'unavailable'|'downloadable'|'downloading'|'available'`), API ausente → `'unavailable'`. Uma instância de `Translator` por par (`Map<PairKey, Promise<Translator>>`; `create` rejeitado é removido do mapa). Progresso via `monitor` → `downloadprogress` (`loaded` 0–1, `total = 1`).
  - `armNativeOnFirstInteraction(pairs: PairKey[]): () => void` — `pointerdown`/`keydown` em `window` (capture, once) → `prepare` dos pares `downloadable` (o Chrome exige ativação do usuário para baixar).

- [ ] **Step 1: Write the failing tests** (fakes em `globalThis.Translator` e `globalThis.window`)

```ts
it('reports unavailable when the API is absent', async () => {
  expect(await nativeEngine.support('en', 'pt')).toBe('unavailable');
});
it('creates one translator per pair and reuses it', async () => {
  installFakeTranslator({ availability: 'available', translate: (t) => `PT:${t}` });
  expect(await nativeEngine.translate('hi', 'en', 'pt')).toBe('PT:hi');
  await nativeEngine.translate('bye', 'en', 'pt');
  expect(fakeTranslator.createCalls).toBe(1);
});
it('retries create after a failed create', async () => { /* 1ª create rejeita, 2ª resolve */ });
it('prepares downloadable pairs on first interaction only', async () => {
  installFakeTranslator({ availability: 'downloadable' });
  armNativeOnFirstInteraction(['en-pt']);
  expect(fakeTranslator.createCalls).toBe(0);
  fakeWindow.dispatch('pointerdown'); await flush();
  expect(fakeTranslator.createCalls).toBe(1);
});
```

- [ ] **Step 2: Run** `npx vitest run src/lib/translation/engines/native-engine.test.ts` → FAIL
- [ ] **Step 3: Implement** os arquivos acima.
- [ ] **Step 4: Run** → PASS; `npm run typecheck` → ok
- [ ] **Step 5: Commit** `:sparkles: feat: add translation engine contract and chrome native engine`

---

### Task 2: Segmentos — proteger menções/URLs e decidir se vale traduzir

**Files:**
- Create: `src/lib/translation/segments.ts` · Test: `src/lib/translation/segments.test.ts`

**Interfaces:**
- Produces:
  - `type Segment = { kind: 'text' | 'protected'; value: string }`; `splitSegments(text: string): Segment[]` — protegidos: `/@[\p{L}\p{N}_]+/u` (mesmo padrão de `MENTION_TOKEN_PATTERN` em `MessageBubble.tsx:51`) e `https?://\S+`.
  - `translatableText(text: string): string` — concatena só os segmentos `text` (usado para detecção).
  - `hasTranslatableText(text: string): boolean` — ≥ `MIN_TRANSLATABLE_LETTERS` (4) letras `\p{L}` em `translatableText`, e não é só risada/onomatopeia (`/^(k{3,}|(ha){2,}|(he){2,}|(rs)+|lol|lmao)$/i` por palavra).
  - `translatePreservingSegments(text: string, translate: (chunk: string) => Promise<string>): Promise<string>` — traduz cada segmento `text` com letras preservando espaços das bordas.

- [ ] **Step 1: Write the failing tests**

```ts
it('keeps mentions and urls untouched', async () => {
  expect(await translatePreservingSegments('hey @Ana look https://x.dev/a now', async (c) => c.toUpperCase()))
    .toBe('HEY @Ana LOOK https://x.dev/a NOW');
});
it('preserves surrounding whitespace', async () => {
  expect(await translatePreservingSegments('@Bob  hi there', async (c) => `[${c}]`)).toBe('@Bob  [hi there]');
});
it.each(['ok', '👍👍', 'https://x.dev', '@Ana', 'kkkkk', 'hahaha', 'lol', '  '])('not translatable: %s', (t) => {
  expect(hasTranslatableText(t)).toBe(false);
});
it('translatable with enough letters outside mentions', () => {
  expect(hasTranslatableText('@Ana good morning')).toBe(true);
});
```

- [ ] **Step 2: Run** `npx vitest run src/lib/translation/segments.test.ts` → FAIL
- [ ] **Step 3: Implement**; exportar no `index.ts`.
- [ ] **Step 4: Run** → PASS
- [ ] **Step 5: Commit** `:sparkles: feat: protect mentions and links when translating`

---

### Task 3: Detecção de idioma — LanguageDetector com fallback heurístico pt×en

Firefox/Safari não têm `LanguageDetector`. Como só existem duas classes (pt, en), um classificador por stopwords e acentos é pequeno e suficiente para mensagens de chat.

**Files:**
- Create: `src/lib/translation/heuristic-detector.ts`, `src/lib/translation/detection.ts`
- Test: `src/lib/translation/heuristic-detector.test.ts`, `src/lib/translation/detection.test.ts`

**Interfaces:**
- Produces:
  - `detectPtEn(text: string): { language: Language; confidence: number } | null` — tokens minúsculos; pontua pt (stopwords: `de que não o a os as um uma é eu você vc pra para com por mas está tá tudo bem obrigado valeu sim também isso aqui hoje amanhã`, + caracteres `ãõçáéíóúâêô`) e en (`the and is are you i to of it that this what with for not have be was will can just yeah thanks ok hello hi`); `confidence = |pt − en| / (pt + en)`; `null` se `pt + en < 2`.
  - `detectLanguage(text: string): Promise<{ language: Language; confidence: number } | null>` — se `globalThis.LanguageDetector` existe: instância única (`expectedInputLanguages: ['pt','en']`), normaliza `pt-BR`→`pt`, outro idioma → `null`; senão `detectPtEn`. Recebe sempre `translatableText(text)` (Task 2).

- [ ] **Step 1: Write the failing tests**

```ts
it.each([
  ['Bom dia pessoal, a reunião ainda está de pé?', 'pt'],
  ['vc vai hoje? to indo pra lá', 'pt'],
  ['Good morning everyone, are we still meeting?', 'en'],
  ['thanks, I will check it tomorrow', 'en'],
])('detects %s as %s', (text, lang) => {
  const r = detectPtEn(text);
  expect(r?.language).toBe(lang);
  expect(r!.confidence).toBeGreaterThanOrEqual(0.7);
});
it('returns null when there is no signal', () => { expect(detectPtEn('Netflix Spotify')).toBeNull(); });
it('uses the native detector when present and ignores other languages', async () => {
  installFakeDetector([{ detectedLanguage: 'es', confidence: 0.95 }]);
  expect(await detectLanguage('hola amigos')).toBeNull();
});
it('falls back to the heuristic without LanguageDetector', async () => {
  expect((await detectLanguage('good morning everyone'))?.language).toBe('en');
});
```

- [ ] **Step 2: Run** `npx vitest run src/lib/translation/heuristic-detector.test.ts src/lib/translation/detection.test.ts` → FAIL
- [ ] **Step 3: Implement**; exportar `detectLanguage` no `index.ts`.
- [ ] **Step 4: Run** → PASS
- [ ] **Step 5: Commit** `:sparkles: feat: detect message language with a pt/en fallback`

---

### Task 4: Pipeline dos modelos e do runtime Bergamot (build e deploy)

**Files:**
- Create: `scripts/translation-models.manifest.json`, `scripts/fetch-translation-models.mjs`
- Modify: `package.json` (dependência + scripts), `.gitignore`, `.github/workflows/deploy-pages.yml`, `.env.example`, `README.md` (seção curta "Tradução de mensagens")

`translation-models.manifest.json` (valores fixos, verificados em 17/11/2026):

```json
{
  "version": "v1",
  "sourceBaseUrl": "https://storage.googleapis.com/moz-fx-translations-data--303e-prod-translations-data",
  "pairs": {
    "enpt": {
      "model": { "path": "models/en-pt/retrain_hr_fix_names_Vnb0RUXTTd67hR-oLHM3eg/exported/model.enpt.intgemm.alphas.bin.gz", "size": 23340019, "sha256": "afb5ae08a2e40b622cd191584cca1df00721fea43de85cec74191fc180370f08" },
      "lex":   { "path": "models/en-pt/retrain_hr_fix_names_Vnb0RUXTTd67hR-oLHM3eg/exported/lex.50.50.enpt.s2t.bin.gz", "size": 2117608, "sha256": "265cff4ca31d3fc95628181de98cf668868b44903d69680284dc456aa4191545" },
      "vocab": { "path": "models/en-pt/retrain_hr_fix_names_Vnb0RUXTTd67hR-oLHM3eg/exported/vocab.enpt.spm.gz", "size": 408686, "sha256": "c2fbaf26f10563c77fa95cca465ad3666f61dd08bfaef5bb170abd582901f389" }
    },
    "pten": {
      "model": { "path": "models/pt-en/retrain_hr_drxrs5bGSsOWvfK9lyZISw/exported/model.pten.intgemm.alphas.bin.gz", "size": 22700409, "sha256": "f2d2bb46d452cef561d35504bd198fa6c6ffc47187ee987406a2ac05d9c3935f" },
      "lex":   { "path": "models/pt-en/retrain_hr_drxrs5bGSsOWvfK9lyZISw/exported/lex.50.50.pten.s2t.bin.gz", "size": 2487847, "sha256": "b31185389533a97177cbf68ea756b78bfbaa24d31a865d72c6ed203fa414b2f6" },
      "vocab": { "path": "models/pt-en/retrain_hr_drxrs5bGSsOWvfK9lyZISw/exported/vocab.pten.spm.gz", "size": 408686, "sha256": "28c9eb4fb13f8eb661f6bb098560a1bf368d25ff890275028ea9d4f3f97b0416" }
    }
  }
}
```

`fetch-translation-models.mjs` (Node 20+, só `node:` built-ins):
- Para cada arquivo: se `public/translation-models/v1/<pair>/<basename>` já existe com o sha256 certo, pula; senão baixa de `sourceBaseUrl/path`, verifica sha256 (falha → `process.exit(1)`), grava.
- Gera `public/translation-models/v1/registry.json` no formato do Bergamot: `{ "enpt": { "model": { "name": "enpt/model.enpt.intgemm.alphas.bin.gz", "size": 23340019, "expectedSha256Hash": "<sha256 do .gz>" }, "lex": {...}, "vocab": {...} }, "pten": {...} }` (nomes **relativos** ao registry).
- Copia `node_modules/@mkljczk/bergamot-translator/worker/{translator-worker.js,bergamot-translator-worker.js,bergamot-translator-worker.wasm}` para `public/bergamot/`, **verificando o sha256 de cada um** contra o campo `runtime` do manifest (`{ "translator-worker.js": "<sha256>", "bergamot-translator-worker.js": "<sha256>", "bergamot-translator-worker.wasm": "<sha256>" }`, preenchido no Step 1 a partir do pacote instalado). Hash diferente → `process.exit(1)` (um update silencioso do pacote não entra em produção sem revisão).

`package.json`: `"dependencies": { "@mkljczk/bergamot-translator": "0.4.16" }`; scripts `"models:fetch": "node scripts/fetch-translation-models.mjs"`, `"predev": "npm run models:fetch"`, `"prebuild": "npm run models:fetch"`.
`.gitignore`: `public/translation-models/` e `public/bergamot/`.
`deploy-pages.yml`: nada a mudar se `prebuild` roda no `npm run build`; adicionar `actions/cache` para `public/translation-models` com chave `hashFiles('scripts/translation-models.manifest.json')` (evita baixar 52 MB da Mozilla a cada deploy).
`.env.example`: `# VITE_TRANSLATION_MODELS_URL=` (opcional; ex.: bucket R2 com CORS).

- [ ] **Step 1:** `npm i -E @mkljczk/bergamot-translator@0.4.16`; criar manifest, script, ajustes acima.
- [ ] **Step 2: Run** `npm run models:fetch` → cria `public/translation-models/v1/{enpt,pten}/*.gz`, `registry.json` e `public/bergamot/*`; rodar de novo → "up to date" sem baixar.
- [ ] **Step 3: Run** corromper um byte de um `.gz` local e rodar → script baixa de novo (sha errado) e termina ok; `git status` não mostra arquivos de modelo.
- [ ] **Step 4: Run** `npm run build` → `dist/translation-models/v1/registry.json` e `dist/bergamot/bergamot-translator-worker.wasm` existem.
- [ ] **Step 5: Commit** `:package: build: fetch pinned mozilla pt/en translation models and bergamot runtime`

---

### Task 5: Engine Bergamot (Web Worker + Cache API, download automático sob demanda)

**Files:**
- Create: `src/lib/translation/engines/model-fetch.ts`, `src/lib/translation/engines/bergamot-engine.ts`
- Test: `src/lib/translation/engines/model-fetch.test.ts`, `src/lib/translation/engines/bergamot-engine.test.ts`

**Interfaces:**
- Consumes: `TranslationEngine`, `PairKey` (Task 1); artefatos da Task 4.
- Produces:
  - `model-fetch.ts`: `fetchModelFile(url: string, sha256Hex: string, onBytes: (n: number) => void, signal?: AbortSignal): Promise<ArrayBuffer>` — 1) `caches.open(TRANSLATION_MODELS_CACHE)` → `match(url)`; 2) senão `fetch(url, { integrity: 'sha256-<base64>', credentials: 'omit', signal })`, lê o corpo em stream contando bytes (`onBytes`), grava a `Response` no cache; 3) se `url` termina em `.gz`, descompacta com `DecompressionStream('gzip')`. Também `type BergamotRegistry = Record<'enpt' | 'pten', Record<'model' | 'lex' | 'vocab', { name: string; size: number; expectedSha256Hash: string }>>` (formato gerado pela Task 4), `loadRegistry(baseUrl: string): Promise<BergamotRegistry>`, `hasCachedPair(pair: PairKey, registry: BergamotRegistry): Promise<boolean>` e `clearCachedModels(): Promise<void>`.
  - `isBergamotRuntimeSupported(): boolean` (definido em `engines/bergamot-loader.ts`, para não puxar o engine) — `isSecureContext && typeof Worker === 'function' && typeof WebAssembly === 'object' && 'DecompressionStream' in globalThis && 'caches' in globalThis` (+ checagens da Task 0 Step 5).
  - `bergamotEngine: TranslationEngine` com:
    - `support`: runtime sem suporte → `'unavailable'`; worker falhou nesta sessão → `'failed'`; par em cache → `'available'`; baixando → `'downloading'`; senão `'downloadable'`.
    - `prepare(source, target)`: baixa e carrega o par sem pedir nada ao usuário (progresso com `total` = soma dos `size` do registry). Chamadas simultâneas para o mesmo par compartilham a mesma promise (um único download). Download falhou (rede) → volta a `'downloadable'`, mas com **cooldown por par** `BERGAMOT_DOWNLOAD_RETRY_COOLDOWN_MS = 60_000`: durante o cooldown `prepare` rejeita na hora, sem `fetch` (o roteador da Task 6 não memoiza estados não-finais, então sem isso cada mensagem visível dispararia um novo download de 26 MB). Não marca `failed`. Teste: falha → nova chamada em < 60 s não faz fetch; após 60 s (fake timers) tenta de novo. Ao fim do cooldown, emitir um evento de progresso de "reset" (ou chamar a invalidação da Task 6) para que os selos "Traduzindo…" visíveis tentem de novo — hoje uma falha deixa o selo travado até a mensagem sair e voltar da tela.
    - `translate`: chama `prepare` se preciso; `import('@mkljczk/bergamot-translator/translator.js')` só na primeira chamada; um `BatchTranslator({ workers: 1, batchSize: 4, pivotLanguage: null, downloadTimeout: 0, registryUrl, workerUrl }, new SparkBacking(...))` onde `SparkBacking extends TranslatorBacking` sobrescreve `fetch(url, checksum, extra)` para resolver `url` relativo ao `registryUrl` e delegar a `fetchModelFile`. `workerUrl = new URL('bergamot/translator-worker.js', location.origin + import.meta.env.BASE_URL).href`. `priority` repassado (envio = 0, recebimento = 1).
    - A engine não decide se pode baixar: quem chama (Task 6/9) só chama `prepare`/`translate` com a tradução automática ligada.
    - Criar `engines/bergamot-loader.ts`: `loadBergamotEngine(): Promise<TranslationEngine>` = `import('./bergamot-engine').then((m) => m.bergamotEngine)`, retornando `unavailableEngine` se `!isBergamotRuntimeSupported()` (checagem barata, sem importar nada); `index.ts` chama `registerFallbackEngine(loadBergamotEngine)` (Task 6). Nenhum outro arquivo importa `bergamot-engine.ts` estaticamente.
    - Erros nunca carregam texto de mensagem (Regras de segurança 3): `new Error('translate-failed')`, `new Error('model-load-failed')`.
    - Teardown: após `BERGAMOT_IDLE_TEARDOWN_MS` sem chamadas, `translator.delete()` (libera memória do worker; recarga vem do Cache API).
    - Falha do worker (`onerror` do backing, erro ao carregar wasm/modelo): marca `failed` para a sessão, rejeita pendentes; não tenta de novo até recarregar a página.

- [ ] **Step 1: Write the failing tests** (`vi.mock('@mkljczk/bergamot-translator/translator.js')` com `BatchTranslator`/`TranslatorBacking` falsos; `caches`, `fetch`, `DecompressionStream` falsos em `globalThis`)

```ts
it('downloads nothing until asked', async () => {
  expect(await bergamotEngine.support('en', 'pt')).toBe('downloadable');
  expect(fetchSpy).not.toHaveBeenCalled();
});
it('downloads only the requested direction, automatically', async () => {
  expect(await bergamotEngine.translate('hello there', 'en', 'pt')).toBe('PT:hello there');
  expect(fetchedUrls().every((u) => u.includes('/enpt/'))).toBe(true);
});
it('shares one download between concurrent requests', async () => {
  await Promise.all([bergamotEngine.translate('good morning', 'en', 'pt'), bergamotEngine.translate('see you soon', 'en', 'pt')]);
  expect(fetchedUrls().filter((u) => u.includes('model.enpt'))).toHaveLength(1);
});
it('allows a retry after a network failure', async () => { /* 1º fetch rejeita → support volta a 'downloadable'; 2ª translate baixa e traduz */ });
it('serves model files from the Cache API on the second load', async () => { /* 2ª fetchModelFile do mesmo url → fetch chamado 0 vezes */ });
it('reports byte progress against registry sizes', async () => { /* eventos onProgress com total = 25866313 e loaded crescente até total */ });
it('marks the engine failed for the session when the worker errors', async () => {
  fakeBacking.triggerError(new Error('wasm OOM'));
  expect(await bergamotEngine.support('en', 'pt')).toBe('failed');
  await expect(bergamotEngine.translate('hello there', 'en', 'pt')).rejects.toThrow();
  expect(fakeBatchTranslator.instances).toBe(1);
});
it('tears the worker down after idle and recreates it lazily', async () => { /* fake timers: 120000 ms → delete(); nova translate → nova instância */ });
it('is unavailable without the required runtime features', async () => { /* sem DecompressionStream → 'unavailable' */ });
```

- [ ] **Step 2: Run** `npx vitest run src/lib/translation/engines` → FAIL
- [ ] **Step 3: Implement** os três arquivos.
- [ ] **Step 4: Run** → PASS; `npm run typecheck && npm run build` → chunk separado contém `translator.js` (conferir em `dist/assets`), bundle principal não.
- [ ] **Step 5: Commit** `:sparkles: feat: add bergamot wasm translation engine with cached models`

---

### Task 6a: Cache de traduções só em memória, com limpeza garantida

**Decisão de segurança:** as chaves das salas ficam em texto puro no IndexedDB `sparkchat-e2ee` (`lib/e2ee/key-store.ts`). Um cache em disco "cifrado com a chave da sala" deixaria chave e conteúdo lado a lado: quem lê o IndexedDB leria as traduções offline. Hoje nenhum texto de mensagem existe em disco (sempre vem cifrado do servidor, exige sessão). Para não criar essa exposição nova, o cache de traduções vive **só em memória**, no mesmo padrão de `lib/e2ee/media-cache.ts`. O custo de recarregar a página é baixo porque só o que está na tela é traduzido (Task 8).

**Files:**
- Create: `src/lib/translation/translation-cache.ts` · Test: `src/lib/translation/translation-cache.test.ts`
- Modify: `src/features/auth/hooks/useAuthSession.ts:43-44` (limpar no logout, junto de `clearRoomKeys()`), `src/lib/e2ee/room-keys.ts` (onde a chave de uma sala é removida → `clearTranslationsForRoom(roomId)`), `src/features/chat/hooks/useRoomMessages.ts:327` (mensagem apagada para todos → `forgetTranslation(roomId, messageId)`)

**Interfaces:**
- Produces:
  - `type CachedTranslation = { status: 'translated'; text: string; sourceLanguage: Language } | { status: 'none' }`
  - `translationCacheKey(input: { roomId: string; messageId: string; field: 'content' | 'caption'; target: Language; sourceText: string }): string` — `${roomId}:${messageId}:${field}:${target}:${fnv1a32(sourceText)}`. O hash do texto de origem garante que, se o conteúdo mudar (ex.: era o placeholder "mensagem indisponível" e depois descriptografou), a tradução antiga não é reutilizada.
  - `readTranslation(key: string): CachedTranslation | undefined`, `writeTranslation(key: string, value: CachedTranslation): void` — `BoundedMap(TRANSLATION_CACHE_SIZE)`; também indexa por `roomId` e `roomId:messageId` para as limpezas abaixo.
  - `forgetTranslation(roomId: string, messageId: string): void`, `clearTranslationsForRoom(roomId: string): void`, `clearTranslationCache(): void`, `getTranslationCacheSizeForTests(): number`.

- [ ] **Step 1: Write the failing tests**

```ts
it('does not reuse a translation when the source text changed', () => {
  const k1 = translationCacheKey({ roomId: 'r', messageId: 'm', field: 'content', target: 'pt', sourceText: 'Encrypted message unavailable' });
  const k2 = translationCacheKey({ roomId: 'r', messageId: 'm', field: 'content', target: 'pt', sourceText: 'good morning' });
  expect(k1).not.toBe(k2);
});
it('forgets a deleted message in every field and language', () => { /* write content/pt e caption/en de r:m → forgetTranslation('r','m') → ambos undefined; r:m2 continua */ });
it('clears one room only', () => { /* r1 limpa, r2 continua */ });
it('clears everything on logout', () => { /* clearTranslationCache → tudo undefined */ });
it('evicts beyond TRANSLATION_CACHE_SIZE', () => { /* 501 entradas → a 1ª sai */ });
```

- [ ] **Step 2: Run** `npx vitest run src/lib/translation/translation-cache.test.ts` → FAIL
- [ ] **Step 3: Implement** e ligar as três limpezas (logout, chave da sala removida, apagada para todos).
- [ ] **Step 4: Run** → PASS; `npx vitest run src/lib/e2ee` → continua verde
- [ ] **Step 5: Commit** `:lock: feat: keep message translations in memory only with explicit cleanup`

---

### Task 6: Roteador + tradução das mensagens recebidas (só o que está na tela)

**Files:**
- Create: `src/lib/translation/router.ts`, `src/lib/translation/incoming.ts`
- Test: `src/lib/translation/router.test.ts`, `src/lib/translation/incoming.test.ts`

**Interfaces:**
- Consumes: `nativeEngine`, `detectLanguage`, `hasTranslatableText`, `translatableText`, `translatePreservingSegments`, `translationCacheKey`/`readTranslation`/`writeTranslation` (Task 6a). O Bergamot entra por registro (`registerFallbackEngine`), para esta task não depender da Task 5.
- Produces:
  - `registerFallbackEngine(load: () => Promise<TranslationEngine>): void` — guarda uma função de carga; o router só a chama quando a regra abaixo escolhe o fallback. Até a Task 5 nada é registrado (fallback = `null` → mensagens no original fora do Chrome). A Task 5 registra `loadBergamotEngine` no `index.ts` (`bergamot-engine.ts` nunca é importado estaticamente).
  - `resolveEngine(source: Language, target: Language): Promise<{ engine: TranslationEngine; support: TranslationSupport } | null>` — **regra do usuário: Bergamot só em aparelho incompatível com a Translator API.** Se `'Translator' in globalThis` e `availability` ≠ `'unavailable'` → **sempre native**, inclusive em `downloadable`/`downloading`/`failed` (nesses casos a mensagem fica no original; o Bergamot nem é importado). Bergamot só se a API não existe, ou se ela responde `'unavailable'` para o par. Sem nenhuma → `null`. Memorizado por par por 30 s.
  - `type IncomingResult = { status: 'translated'; text: string; sourceLanguage: Language } | { status: 'preparing'; sourceLanguage: Language } | { status: 'none' }`
  - `type IncomingRequest = { roomId: string; messageId: string; field: 'content' | 'caption'; text: string; target: Language; signal: AbortSignal }`
  - `translateIncoming(request: IncomingRequest): Promise<IncomingResult>` — ordem: 1) cache em memória (Task 6a, `translationCacheKey` com o texto de origem); 2) detectar e traduzir. Nunca traduz o placeholder `translate('chat.message.encryptedUnavailable')` (comparar com o texto atual nos dois idiomas) → `none` sem cache. `none` se: não traduzível, detecção `null`/confiança < 0,7, idioma === alvo, sem engine, erro de tradução. `preparing` (sem cache) se a engine está `downloadable`/`downloading` — dispara `prepare` (Bergamot baixa sozinho; native só depois da 1ª interação). Cache guarda `translated` e os `none` definitivos; nada vai para disco.
  - **Só o que está na tela:** a fila é sequencial e por prioridade — pedidos com `signal` abortado (mensagem saiu da tela antes de começar) são descartados sem traduzir; o mais recente na tela vai primeiro (LIFO), porque é o que a pessoa acabou de rolar até.
  - `getCachedIncoming(roomId: string, messageId: string, field: 'content' | 'caption', target: Language): IncomingResult | undefined` — leitura síncrona da memória para o primeiro render.
  - `subscribeIncomingInvalidation(listener: () => void): () => void` — notificado quando um `prepare` termina (download concluído), para os `preparing` visíveis tentarem de novo.

- [ ] **Step 1: Write the failing tests** (mock de `./engines/*` e `./detection`)

```ts
it('uses native whenever the Translator API exists, even while its model downloads', async () => {
  installTranslatorApi({ availability: 'downloadable' });
  expect((await resolveEngine('en', 'pt'))?.engine.id).toBe('native');
  expect(bergamotLoader.load).not.toHaveBeenCalled();
});
it('falls back to bergamot only without the API or with an unavailable pair', async () => {
  expect((await resolveEngine('en', 'pt'))?.engine.id).toBe('bergamot');          // sem API
  installTranslatorApi({ availability: 'unavailable' });
  expect((await resolveEngine('en', 'pt'))?.engine.id).toBe('bergamot');
});
// helper: req('m1', 'good morning team', 'pt') monta um IncomingRequest com roomId 'r1', field 'content' e AbortSignal novo
it('translates english to portuguese when confident and caches in memory', async () => {
  detect.mockResolvedValue({ language: 'en', confidence: 0.92 });
  expect(await translateIncoming(req('m1', 'good morning team', 'pt'))).toEqual({ status: 'translated', text: 'PT:good morning team', sourceLanguage: 'en' });
  await translateIncoming(req('m1', 'good morning team', 'pt'));
  expect(native.translate).toHaveBeenCalledTimes(1);
});
it('never translates the undecryptable placeholder', async () => {
  expect(await translateIncoming(req('m2', translate('chat.message.encryptedUnavailable'), 'pt'))).toEqual({ status: 'none' });
  expect(detect).not.toHaveBeenCalled();
});
it('returns preparing and starts the download while the model is missing', async () => {
  native.support.mockResolvedValue('unavailable'); bergamot.support.mockResolvedValue('downloadable');
  detect.mockResolvedValue({ language: 'en', confidence: 0.9 });
  expect(await translateIncoming(req('m3', 'see you later', 'pt'))).toEqual({ status: 'preparing', sourceLanguage: 'en' });
  expect(bergamot.prepare).toHaveBeenCalledWith('en', 'pt');
});
it('notifies invalidation when the download finishes', async () => { /* prepare resolve → listener chamado 1x */ });
it('skips requests aborted before they start', async () => {
  const first = translateIncoming(req('a', 'first message here', 'pt'));
  const controller = new AbortController(); const second = translateIncoming({ ...req('b', 'second message here', 'pt'), signal: controller.signal });
  controller.abort(); await Promise.all([first, second.catch(() => null)]);
  expect(native.translate).toHaveBeenCalledTimes(1);
});
it('translates the most recently requested visible message first', async () => { /* fila com 3 pendentes → ordem de translate: 3ª, 2ª */ });
it('caches per target language and retranslates after a language switch', async () => {
  detect.mockResolvedValue({ language: 'en', confidence: 0.9 });
  await translateIncoming(req('m4', 'see you later', 'pt')); await translateIncoming(req('m4', 'see you later', 'pt'));
  expect(native.translate).toHaveBeenCalledTimes(1);
  expect(await translateIncoming(req('m4', 'see you later', 'en'))).toEqual({ status: 'none' });
});
it('returns none for same language or low confidence', async () => { /* pt→pt e confiança 0.5 */ });
```

- [ ] **Step 2: Run** `npx vitest run src/lib/translation/router.test.ts src/lib/translation/incoming.test.ts` → FAIL
- [ ] **Step 3: Implement**; exportar no `index.ts`.
- [ ] **Step 4: Run** → PASS
- [ ] **Step 5: Commit** `:sparkles: feat: route incoming translations between native and bergamot engines`

---

### Task 7: Configurações — switch ligado por padrão, com legenda

**Files:**
- Modify: `src/constants/storage-keys.ts` (+ `AUTO_TRANSLATE_STORAGE_KEY = 'sparkchat:auto-translate'`)
- Create: `src/features/chat/hooks/useAutoTranslatePreference.ts`, `src/features/chat/hooks/useTranslationAvailability.ts`; exportar em `src/features/chat/index.ts`
- Modify: `src/app/App.tsx:239-240,431-432`, `src/features/rooms/components/Sidebar.tsx:74-96,605`, `src/features/rooms/components/EditProfileModal.tsx:44-45,78,514-531`
- Modify: `src/locales/{pt,en}/app.json` → `profile.autoTranslate*`

**Interfaces:**
- Consumes: `armNativeOnFirstInteraction`, `nativeEngine.support`, `isBergamotRuntimeSupported`, `bergamotEngine.support`.
- Produces:
  - `useAutoTranslatePreference(): { isEnabled: boolean; toggle: () => void }` + `AutoTranslateContext = createContext<boolean>(false)`; `App.tsx` provê `value={isEnabled}` em volta da área do chat e, enquanto ligado, chama `armNativeOnFirstInteraction(['en-pt','pt-en'])`.
  - `useTranslationAvailability(): boolean` — `true` se alguma engine não está `'unavailable'`/`'failed'` para o par de recebimento (oposto da interface → interface). Só serve para mostrar o aviso abaixo.

Card novo na aba `system` do `EditProfileModal`, abaixo de "Sons do app", mesmo layout (`sc-card`), ícone `MdTranslate`, título + `Switch` (ligado por padrão) e **uma legenda fixa** embaixo. Sem linha de estado, sem botões, sem progresso de download:
- `profile.autoTranslate`: "Traduzir mensagens automaticamente" / "Translate messages automatically"
- `profile.autoTranslateHint` (sempre): "Mensagens em outro idioma são traduzidas para o idioma do app, direto no seu navegador." / "Messages in another language are translated into the app's language, right in your browser."
- `profile.autoTranslateUnavailable` (só quando `useTranslationAvailability()` é `false`, no lugar da legenda, em `theme.textMuted`): "A tradução automática não está disponível neste dispositivo." / "Automatic translation isn't available on this device." — o switch continua clicável (a preferência vale para outros acessos no mesmo navegador quando ficar disponível).

- [ ] **Step 1:** Implementar hooks, contexto, props e card.
- [ ] **Step 2: Run** `npm run typecheck && npm run lint && npm test` → verde
- [ ] **Step 3: Verificar** `npm run dev`: Chrome e Firefox → switch ligado com a legenda, nenhum estado/botão; navegador sem suporte (ex.: forçar `isBergamotRuntimeSupported` falso no DevTools) → aviso "não está disponível neste dispositivo". Desligar e recarregar → continua desligado.
- [ ] **Step 4: Commit** `:sparkles: feat: add auto-translate setting enabled by default`

---

### Task 8: Selo no MessageBubble, traduzindo só o que está na tela

**Files:**
- Create: `src/hooks/useInViewport.ts`, `src/features/chat/hooks/useMessageTranslation.ts`, `src/features/chat/components/TranslationBadge.tsx`
- Modify: `src/features/chat/components/MessageBubble.tsx:144-147,183-200,259-261`
- Modify: `src/locales/{pt,en}/app.json` → `chat.translation.*`

**Interfaces:**
- Consumes: `translateIncoming`, `getCachedIncoming`, `subscribeIncomingInvalidation` (Task 6); `AutoTranslateContext` (Task 7); `useAppLanguage`.
- Produces:
  - `useInViewport<T extends Element>(ref: RefObject<T | null>, rootMargin = '300px 0px'): boolean` — `IntersectionObserver` (sem suporte → `true`). A margem de 300 px começa a traduzir um pouco antes da mensagem aparecer ao rolar.
  - `useMessageTranslation(params: { roomId: string; messageId: string; field: 'content' | 'caption'; text: string | null | undefined; enabled: boolean; isVisible: boolean }): { text: string; result: IncomingResult; showingOriginal: boolean; toggleOriginal: () => void }`:
    - render inicial com `getCachedIncoming` (já traduzidas aparecem traduzidas na hora, sem piscar);
    - só chama `translateIncoming` quando `isVisible`; ao sair da tela antes de começar, aborta o `signal` (a fila descarta). Resultado: conversa longa só traduz o que a pessoa vê; rolando para cima, as antigas vão sendo traduzidas (e ficam no cache em memória da Task 6a enquanto a aba estiver aberta);
    - refaz ao mudar `language` ou ao receber invalidação (download terminou) se estiver visível; `enabled` falso / texto vazio → original.
  - `TranslationBadge({ result, showingOriginal, onToggle })`:
    - `translated`: "Traduzida do {{language}} · **Ver original**" ↔ "Mensagem original · **Ver tradução**"
    - `preparing`: "Traduzindo…" (sem link) — aparece enquanto o modelo baixa ou a fila chega na mensagem
    - `none`: nada
    - Estilo: `0.72rem`, `theme.textMuted`, link `<button className="sc-read-more">` com `event.stopPropagation()`.

Integração no `MessageBubble` (hooks antes dos `return` antecipados): `const bubbleRef = useRef<HTMLDivElement>(null)` no contêiner da bolha; `isVisible = useInViewport(bubbleRef)`.
- texto: `field: 'content'`, `text: message.type === 'text' && !isOwn && !message.pending ? message.content : null`; `truncateLongText` e `removeFirstUrl` passam a usar o texto resolvido.
- legenda: segunda chamada com `field: 'caption'` e `message.caption`.

Chaves (pt / en): `translatedFrom` "Traduzida do {{language}}" / "Translated from {{language}}"; `original` "Mensagem original" / "Original message"; `showOriginal` "Ver original" / "Show original"; `showTranslation` "Ver tradução" / "Show translation"; `translating` "Traduzindo…" / "Translating…"; `languages.pt` "português" / "Portuguese"; `languages.en` "inglês" / "English".

- [ ] **Step 1:** Implementar `useInViewport`, hook, badge e integração.
- [ ] **Step 2: Run** `npm run typecheck && npm run lint && npm test` → verde
- [ ] **Step 3: Verificar** duas contas (interface pt × en). Chrome: "good morning everyone" chega traduzida com selo; "Ver original" alterna; "@Ana see you at https://x.dev" mantém menção e link; "ok"/"👍"/"kkk" sem selo; trocar idioma → selos se ajustam. Firefox (1º uso): mensagem em inglês mostra "Traduzindo…" enquanto baixa e troca sozinha para traduzida. Conversa com 200+ mensagens em inglês: abrir → só as visíveis são traduzidas (contar chamadas no console em dev); rolar para cima → as antigas traduzem ao aparecer; trocar de conversa e voltar → aparecem traduzidas na hora, sem "Traduzindo…"; recarregar a página → só as visíveis são traduzidas de novo. **Checagem de segurança:** DevTools → Application → IndexedDB, Local Storage, Session Storage e Cache Storage não contêm nenhum texto de mensagem (original ou traduzido); console sem conteúdo de mensagem; logout → cache vazio (em dev, `getTranslationCacheSizeForTests() === 0`); apagar uma mensagem para todos → a tradução dela some.
- [ ] **Step 4: Commit** `:sparkles: feat: show translated messages, translating only what is on screen`

---

### Task 9: Traduzir ao enviar (enquanto digita)

**Files:**
- Create: `src/features/chat/hooks/outgoing-draft.ts`, `src/features/chat/hooks/useOutgoingTranslation.ts`
- Test: `src/features/chat/hooks/outgoing-draft.test.ts`, `src/lib/i18n/language.test.ts` (acrescentar)
- Modify: `src/lib/i18n/language.ts` (+ `oppositeLanguage`), `src/features/chat/components/MessageInput.tsx`, `src/features/chat/components/ChatArea.tsx:1209`
- Modify: `src/locales/{pt,en}/app.json` → `chat.translation.outgoing*`

**Interfaces:**
- Consumes: `resolveEngine`, `translatePreservingSegments`, `hasTranslatableText`, `usePersistedIdSet`.
- Produces:
  - `oppositeLanguage(language: Language): Language`
  - `createOutgoingDraftTranslator(translate: (text: string) => Promise<string>): { update(text: string): void; resolveForSend(text: string): Promise<{ text: string; translated: boolean }>; subscribe(listener: (state: OutgoingDraftState) => void): () => void; dispose(): void }`; `type OutgoingDraftState = { status: 'idle' | 'translating' | 'ready' | 'failed'; source: string; translated: string | null }`. Debounce `OUTGOING_TRANSLATION_DEBOUNCE_MS`; resultado de `source` antigo descartado; `resolveForSend` usa `ready` se `source === text`, aguarda tradução em andamento do mesmo texto, senão traduz na hora; não traduzível/erro → original.
  - `useOutgoingTranslation(roomId: string, userId: string, draft: string): { isEnabled: boolean; support: TranslationSupport; toggle: () => void; target: Language; state: OutgoingDraftState; resolveForSend: (text: string) => Promise<{ text: string; translated: boolean }> }` — `translate` usa a engine do par (interface → oposto) com `priority: 0`.

UI no `MessageInput` (novas props `roomId`, `userId`):
- Botão com `MdTranslate` + sigla do alvo (`EN`/`PT`), `aria-pressed`, `title` = `outgoingToggleOn`/`outgoingToggleOff`; escondido se `support` for `'unavailable'`/`'failed'`.
- Ligar o botão já dispara `prepare` do par de envio (Bergamot baixa pt→en ou en→pt sem perguntar); enquanto baixa, a faixa mostra `outgoingTranslating`. O botão só aparece com a tradução automática ligada.
- Ligado e com texto: faixa acima do input (mesmo estilo/posição da lista de menções): `outgoingPreview` "Será enviada em {{language}}:" + texto; `outgoingTranslating` "Traduzindo…"; `outgoingFailed` "Não foi possível traduzir; será enviada como está."
- `handleSubmit` `async`: com envio traduzido ligado, `const { text } = await resolveForSend(message.trim())` e usa no payload (texto ou legenda); `exceedsEncryptedLimit` checa o texto final; botão enviar desabilitado enquanto aguarda.

Chaves en: "Translate before sending to {{language}}" / "Stop translating before sending" / "Will be sent in {{language}}:" / "Translating…" / "Couldn't translate; it will be sent as is."; pt `outgoingToggleOn` "Traduzir para {{language}} ao enviar", `outgoingToggleOff` "Parar de traduzir ao enviar".

- [ ] **Step 1: Write the failing tests** (`vi.useFakeTimers()`)

```ts
it('debounces and translates the latest draft', async () => {
  const d = createOutgoingDraftTranslator(async (t) => `EN:${t}`);
  d.update('bom'); d.update('bom dia');
  await vi.advanceTimersByTimeAsync(400);
  expect(lastState).toEqual({ status: 'ready', source: 'bom dia', translated: 'EN:bom dia' });
  expect(translateCalls).toEqual(['bom dia']);
});
it('send waits for an in-flight translation of the same text', async () => { /* … */ });
it('never sends a stale translation', async () => { /* ready 'bom dia'; resolveForSend('bom dia gente') → traduz o novo */ });
it('falls back to the original on failure', async () => {
  const d = createOutgoingDraftTranslator(async () => { throw new Error('x'); });
  expect(await d.resolveForSend('olá pessoal')).toEqual({ text: 'olá pessoal', translated: false });
});
it('oppositeLanguage swaps pt and en', () => { expect(oppositeLanguage('pt')).toBe('en'); expect(oppositeLanguage('en')).toBe('pt'); });
```

- [ ] **Step 2: Run** `npx vitest run src/features/chat/hooks/outgoing-draft.test.ts src/lib/i18n/language.test.ts` → FAIL
- [ ] **Step 3: Implement** `oppositeLanguage`, `outgoing-draft.ts`, hook.
- [ ] **Step 4: Run** → PASS
- [ ] **Step 5:** Integrar no `MessageInput`/`ChatArea`.
- [ ] **Step 6: Run** `npm run typecheck && npm run lint && npm test` → verde
- [ ] **Step 7: Verificar** interface pt, sala A: ligar botão → "bom dia @Ana, tudo bem?" → preview "Será enviada em inglês: good morning @Ana, how are you?" → enviar → sai em inglês; sala B segue desligada; recarregar → sala A ligada. Enter logo após digitar → envia a tradução do texto final. Repetir no Firefox (Bergamot).
- [ ] **Step 8: Commit** `:sparkles: feat: translate outgoing messages while typing`

---

### Task 10: `translate="no"`, landing e verificação final cross-browser

**Files:**
- Modify: `app/index.html:2` → `<html lang="pt-BR" translate="no">` (só o app; a landing `index.html` continua traduzível)
- Modify: `src/locales/{pt,en}/landing.json` (nova pergunta no FAQ, mesmo formato das existentes)

FAQ (pt / en):
- "As mensagens podem ser traduzidas?" / "Can messages be translated?"
- "Sim. O SparkChat traduz as mensagens entre português e inglês direto no seu navegador. No Chrome para computador ele usa o tradutor do próprio Chrome; nos outros navegadores, baixa uma única vez um tradutor de cerca de 26 MB. O texto nunca é enviado para um serviço de tradução, então a criptografia ponta a ponta continua valendo." / "Yes. SparkChat translates messages between Portuguese and English right in your browser. In Chrome on desktop it uses Chrome's built-in translator; in other browsers it downloads a ~26 MB translator once. The text is never sent to a translation service, so end-to-end encryption still holds."

- [ ] **Step 1:** Aplicar as mudanças.
- [ ] **Step 2: Run** `npm run build` → ok; `dist/app/index.html` contém `translate="no"`; `dist/index.html` não.
- [ ] **Step 3: Verificar matriz** (anotar resultado no PR):

| Navegador | Engine esperada | Checar |
|---|---|---|
| Chrome desktop | native | tradução automática; menu "Traduzir esta página" não altera o app |
| Edge / Firefox / Safari desktop | bergamot | 1ª mensagem: "Traduzindo…" → traduzida sozinha; recarregar sem re-download; opção desligada → nenhum `.gz` na aba Network |
| Chrome Android, Safari iOS | bergamot | idem + memória/tempo aceitáveis; após 2 min ocioso e nova mensagem → traduz (worker recriado) |
| Navegador sem WASM/DecompressionStream | nenhuma | switch mostra "não suporta"; chat normal |

- [ ] **Step 4: Commit** `:globe_with_meridians: feat: disable page translation in the app and document in-browser translation`

---

## Fora deste plano (ideias registradas)

- Ação "Traduzir / Mostrar original" no menu de contexto, para quem desligar a tradução automática.
- Alvo do envio pelo idioma das últimas mensagens recebidas na sala, em vez de sempre o "contrário".
- Mostrar a quem enviou que a mensagem saiu traduzida (original só na sessão, por `clientTempId`).
- Traduzir prévia da lista de salas e notificações.
- Mover os modelos para o R2 (egress grátis) se o tráfego passar do limite brando do GitHub Pages (100 GB/mês ≈ 3.800 **aparelhos novos por mês** fora do Chrome desktop baixando uma direção de 26 MB; quem usa Chrome desktop não baixa nada do Pages, e cada aparelho baixa uma vez só por causa do Cache API) — só configurar `VITE_TRANSLATION_MODELS_URL` + CORS no bucket.

---

### Task 11: SparkAI — boas-vindas no idioma atual e sem tradução automática na conversa com o assistente

Pedido do usuário (17/11/2026). O SparkAI já responde no idioma do app (`user:set-locale` → `buildSystemInstruction(locale)` na API) e envia as boas-vindas no idioma da criação do chat (`AI_WELCOME_MESSAGES` em `API-SparkChat/src/modules/ai/ai.model.ts:8`). Faltam duas coisas, só no SPA:

1. **Boas-vindas sempre no idioma atual, texto exato.** Se o conteúdo descriptografado de uma mensagem numa sala do assistente for exatamente um dos dois textos de boas-vindas, a bolha mostra a versão do idioma atual da interface (nada de tradutor; troca só na renderização, depois da descriptografia).
2. **Sem tradução automática na sala do SparkAI.** O assistente já responde no idioma certo, e se a pessoa escrever em outro idioma de propósito ele responde nesse idioma; traduzir estragaria isso. Na sala do assistente: `useMessageTranslation` desabilitado e o botão "traduzir ao enviar" escondido.

**Files:**
- Create: `src/features/chat/utils/assistant-welcome.ts` (+ `assistant-welcome.test.ts`)
- Modify: `src/locales/{pt,en}/app.json` → `chat.assistant.welcome` com o texto **idêntico** ao da API:
  - pt: `Oi! Eu sou o SparkAI 🤖 — apareci aqui só pra gente trocar ideia. Manda o que quiser, é só um papo!`
  - en: `Hi! I'm SparkAI 🤖 — I'm here just to chat. Send me anything, no pressure!`
- Modify: `src/features/chat/components/MessageBubble.tsx` (recebe `isAssistantRoom` por prop vinda do `ChatArea`, que já usa `isAssistantRoom(room)` em `ChatArea.tsx:1220`), `src/features/chat/components/MessageInput.tsx` + `ChatArea.tsx` (esconder o botão de envio traduzido na sala do assistente).

**Interfaces:**
- `localizeAssistantWelcome(content: string, language: Language): string | null` — se `content` (após `trim`) for igual a um dos dois textos de boas-vindas (lidos de `appI18n` com `lng: 'pt'` e `lng: 'en'`), retorna o texto do `language`; senão `null`.
- `MessageBubble`: com `isAssistantRoom && !isOwn`, usa `localizeAssistantWelcome(message.content, language) ?? message.content` como texto original; `useMessageTranslation(..., enabled: autoTranslate && !isAssistantRoom)`.
- `MessageInput`: nova prop `isAssistantRoom?: boolean`; quando `true`, o botão/faixa de envio traduzido nunca aparece e o envio nunca passa por tradução.

- [ ] **Step 1: Write the failing tests** (`assistant-welcome.test.ts`)

```ts
it('shows the welcome in the current language', () => {
  expect(localizeAssistantWelcome(PT_WELCOME, 'en')).toBe(EN_WELCOME);
  expect(localizeAssistantWelcome(EN_WELCOME, 'pt')).toBe(PT_WELCOME);
  expect(localizeAssistantWelcome(`  ${PT_WELCOME}\n`, 'pt')).toBe(PT_WELCOME);
});
it('leaves any other message alone', () => {
  expect(localizeAssistantWelcome('Oi! Eu sou o SparkAI', 'en')).toBeNull();
});
it('keeps the locale strings identical to the API welcome texts', () => { /* PT_WELCOME/EN_WELCOME literais acima === appI18n.t('chat.assistant.welcome', { lng }) */ });
```

- [ ] **Step 2: Run** `npx vitest run src/features/chat/utils/assistant-welcome.test.ts` → FAIL
- [ ] **Step 3: Implement** helper, chaves e integração.
- [ ] **Step 4: Run** `npx eslint src && npm run typecheck && npx vitest run && npm run build` → verde
- [ ] **Step 5: Commit** `:sparkles: feat: localize the sparkai welcome and skip translation in the assistant chat`
