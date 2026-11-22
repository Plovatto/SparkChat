<div align="center">
  <a href="https://sparkchat.plovatto.dev/">
    <picture>
      <source media="(prefers-reduced-motion: reduce)" srcset="./.github/assets/hero-still-pt.webp">
      <img alt="SparkChat: chat em tempo real, criptografado de ponta a ponta. Mensagens e chamadas que nem o servidor consegue ler. Uma animação mostra o chat em vários temas no computador e no celular, acima das tags React 19, TypeScript, Socket.IO, libsodium e WebRTC" src="./.github/assets/hero-pt.webp" width="100%">
    </picture>
  </a>

  <br>
  <br>

<a href="https://sparkchat.plovatto.dev/"><img alt="Abrir o SparkChat" src="./.github/assets/btn-live-pt.webp" height="48"></a>
&nbsp;
<a href="https://sparkchat-api.plovatto.dev/docs/"><img alt="Docs da API" src="./.github/assets/btn-api-pt.webp" height="48"></a>
&nbsp;
<a href="README.md"><img alt="English version" src="./.github/assets/btn-lang-pt.webp" height="48"></a>

  <br>
  <br>

<a href="https://github.com/Plovatto/SparkChat/actions/workflows/ci.yml"><img alt="CI" src="https://img.shields.io/github/actions/workflow/status/Plovatto/SparkChat/ci.yml?branch=main&style=flat-square&label=CI"></a>
<a href="https://scorecard.dev/viewer/?uri=github.com/Plovatto/SparkChat"><img alt="OpenSSF Scorecard" src="https://img.shields.io/ossf-scorecard/github.com/Plovatto/SparkChat?style=flat-square&label=OpenSSF%20Scorecard&color=brightgreen"></a>
<a href="https://www.bestpractices.dev/projects/16064"><img alt="OpenSSF Best Practices" src="https://img.shields.io/cii/level/16064?style=flat-square&label=OpenSSF%20Best%20Practices"></a>
<a href="LICENSE"><img alt="Licença MIT" src="https://img.shields.io/badge/license-MIT-brightgreen?style=flat-square"></a>
</div>

<br>

<p align="center">O SparkChat é um chat em tempo real em que mensagens, arquivos e chamadas são criptografados no navegador, então nem o servidor consegue ler. Este repositório é o cliente web: a página de apresentação e o app. O servidor fica em <a href="https://github.com/Plovatto/API-SparkChat">API-SparkChat</a>.</p>

<p align="center"><img alt="" src="./.github/assets/theme-stripe.svg" width="100%" height="8"></p>

<details>
<summary><strong>Sumário</strong></summary>

- [Um chat, doze climas](#um-chat-doze-climas)
- [Só você consegue ler](#só-você-consegue-ler)
- [Chamadas de vídeo, de ponta a ponta](#chamadas-de-vídeo-de-ponta-a-ponta)
- [Conheça a SparkAI](#conheça-a-sparkai)
- [O mesmo chat, do seu jeito](#o-mesmo-chat-do-seu-jeito)
- [Receitas de tema](#receitas-de-tema)
- [96 temas, 121 papéis de parede](#96-temas-121-papéis-de-parede)
- [Abra no celular](#abra-no-celular)
- [Funcionalidades](#funcionalidades)
- [Tecnologias](#tecnologias)
- [Qualidade e segurança](#qualidade-e-segurança)
- [Como executar](#como-executar)
- [Como funciona](#como-funciona)
- [Scripts](#scripts)
- [Estrutura do projeto](#estrutura-do-projeto)
- [Deploy](#deploy)
- [Como contribuir](#como-contribuir)
- [Segurança](#segurança)
- [Changelog](#changelog)
- [Autora](#autora)
- [Licença](#licença)

</details>

## Um chat, doze climas

Cada tema muda o app inteiro de uma vez: cores, papel de parede e balões, ajustados para continuar legíveis em cada combinação.

<picture>
  <source media="(prefers-reduced-motion: reduce)" srcset="./.github/assets/themes-still.webp">
  <img alt="A mesma conversa passando por doze temas, entre eles Malaquita, Magma, Clássico, Abismo, Sakura, Íris, Nórdico, Mediterrâneo, Vaporwave, Pavão e Outono" src="./.github/assets/themes.webp" width="100%">
</picture>

## Só você consegue ler

Mensagens e anexos são criptografados no navegador com libsodium. O servidor só guarda texto cifrado.

<img alt="Só você consegue ler: um escudo com cadeado ao lado da página de segurança, que explica que as chaves nascem no seu aparelho, cada mensagem é criptografada antes de sair, o servidor só entrega e só quem está na conversa consegue ler" src="./.github/assets/encryption.webp" width="100%">

## Chamadas de vídeo, de ponta a ponta

Chamadas de voz e vídeo vão direto entre os aparelhos por WebRTC, com compartilhamento de tela, troca de câmera, redução de ruído e sinalização assinada.

<img alt="Uma chamada de vídeo com Rafael mostrando uma paisagem de montanha, com uma segunda janela na frente mostrando um gato, e as tags troca de câmera, redução de ruído e sinalização assinada" src="./.github/assets/video-calls.webp" width="100%">

## Conheça a SparkAI

Uma assistente fixada no topo da sua lista. Ela planeja viagens, resume arquivos e ajuda a escolher uma cor.

<img alt="Chat da SparkAI no navegador: a assistente planeja uma viagem de três dias para Lisboa e sugere um tema Oceano Azul escuro, com as tags chat fixado, lê arquivos e criptografada também" src="./.github/assets/sparkai.webp" width="100%">

## O mesmo chat, do seu jeito

À esquerda, o visual padrão. À direita, o modo Meia-Noite com o tema Galáxia, o papel de parede Via Láctea e balões de vidro.

<img alt="Comparação do mesmo chat: o tema padrão à esquerda e um tema Galáxia no modo Meia-Noite, com papel de parede estrelado e balões translúcidos, à direita" src="./.github/assets/before-after.webp" width="100%">

## Receitas de tema

Modo, tema de cor, papel de parede e cores dos balões: seis combinações que funcionam juntas.

<img alt="Seis celulares com receitas de tema: Galáxia, Sakura, Entardecer, Aurora, Lavanda e Miami 86, cada uma com seu modo, tema, papel de parede e cores dos balões" src="./.github/assets/recipes.webp" width="100%">

## 96 temas, 121 papéis de parede

Três modos (escuro, claro e meia-noite), aplicados a um chat ou a todos.

<table>
  <tr>
    <td width="50%"><img alt="Quatro janelas do navegador com a mesma conversa empilhadas em perspectiva, cada uma em um tema diferente" src="./.github/assets/moods.webp"></td>
    <td width="50%"><img alt="SparkChat 2.0: doze capturas do mesmo chat com papéis de parede e cores diferentes" src="./.github/assets/colors.webp"></td>
  </tr>
</table>

## Abra no celular

O SparkChat roda no navegador e pode ser instalado como app.

<a href="https://sparkchat.plovatto.dev/"><img alt="QR code que abre sparkchat.plovatto.dev, ao lado dos endereços da página em português, da página em inglês e do app" src="./.github/assets/demo-pt.webp" width="100%"></a>

## Funcionalidades

Tudo o que um chat moderno precisa, com privacidade de fábrica.

<table>
  <tr>
    <td width="50%" valign="top">
      <p><img alt="" src="./.github/assets/icons/encryption.svg" width="40" height="40"><br><strong>Criptografia de ponta a ponta</strong><br>Mensagens, arquivos, reações e nomes de grupo são criptografados no navegador antes de sair do aparelho.</p>
      <br>
      <p><img alt="" src="./.github/assets/icons/sparkai.svg" width="40" height="40"><br><strong>Assistente SparkAI</strong><br>Um chat fixado que planeja, resume arquivos e responde dentro da própria conversa.</p>
      <br>
      <p><img alt="" src="./.github/assets/icons/media.svg" width="40" height="40"><br><strong>Mensagens completas</strong><br>Fotos, mensagens de voz, arquivos com prévia, GIFs, reações, respostas citadas e indicadores de digitação e gravação.</p>
    </td>
    <td width="50%" valign="top">
      <p><img alt="" src="./.github/assets/icons/calls.svg" width="40" height="40"><br><strong>Chamadas criptografadas</strong><br>Voz e vídeo por WebRTC, com compartilhamento de tela, troca de câmera e redução de ruído.</p>
      <br>
      <p><img alt="" src="./.github/assets/icons/themes.svg" width="40" height="40"><br><strong>Do seu jeito</strong><br>3 modos, 96 temas de cor, 121 papéis de parede e balões com cor, transparência e desfoque, sincronizados entre aparelhos.</p>
      <br>
      <p><img alt="" src="./.github/assets/icons/translate.svg" width="40" height="40"><br><strong>Tradução privada</strong><br>Mensagens traduzidas entre português e inglês no próprio navegador. Nenhum texto sai do aparelho.</p>
    </td>
  </tr>
</table>

<details>
<summary>Ver todas as funcionalidades</summary>

<br>

<p align="center"><img alt="Ficha de funcionalidades do SparkChat: chamadas de voz e vídeo criptografadas com WebRTC; criptografia de ponta a ponta de mensagens e arquivos; fotos, mensagens de voz e anexos; compartilhamento de tela, reações, GIFs e tradução; assistente SparkAI fixada na lista; chats privados e grupos com links de convite; 3 modos e 96 temas de cor; 121 papéis de parede, por chat ou para todos; balões com cor, transparência e desfoque; indicadores de digitação e gravação; notificações, sons e contador de não lidas; português e inglês" src="./.github/assets/feature-sheet.webp" width="70%"></p>

- Chat em tempo real com Socket.IO, com nova autenticação automática a cada reconexão
- Chats privados e grupos com links de convite
- Miniaturas geradas no cliente para a prévia da conversa
- Notificações do navegador, sons e contador de não lidas
- Interface em português e inglês, com o idioma inicial vindo do sistema e troca a qualquer momento
- Instalável como app, com página de apresentação renderizada por idioma para os buscadores

</details>

## Tecnologias

O cliente web deste repositório e a API com que ele conversa.

<img alt="Feito com: React 19 na interface, TypeScript de ponta a ponta, Socket.IO para tempo real, libsodium para criptografia, Vite como ferramenta de build, Node.js na API, Express para REST e uploads, Turso como banco de dados, Cloudflare R2 para guardar mídias e WebRTC nas chamadas" src="./.github/assets/built-with.webp" width="100%">

<details>
<summary>Ver todas as ferramentas do cliente web</summary>

| Tecnologia                                                                                       | Uso                                                 |
| :----------------------------------------------------------------------------------------------- | :-------------------------------------------------- |
| [React](https://react.dev/) 19 + [TypeScript](https://www.typescriptlang.org/)                   | Interface e componentes tipados                     |
| [Vite](https://vite.dev/)                                                                        | Servidor de desenvolvimento e build                 |
| [Bootstrap](https://getbootstrap.com/) 5 + [React Bootstrap](https://react-bootstrap.github.io/) | Layout e componentes base                           |
| [Socket.IO Client](https://socket.io/docs/v4/client-api/)                                        | Mensagens em tempo real                             |
| [libsodium](https://doc.libsodium.org/)                                                          | Criptografia de ponta a ponta                       |
| WebRTC + [RNNoise](https://github.com/jitsi/rnnoise-wasm)                                        | Chamadas e redução de ruído                         |
| [Bergamot translator](https://browser.mt/) + modelos do Mozilla                                  | Tradução no navegador                               |
| [PDF.js](https://mozilla.github.io/pdf.js/)                                                      | Prévia de arquivos                                  |
| [i18next](https://www.i18next.com/) + [react-i18next](https://react.i18next.com/)                | Internacionalização                                 |
| [Vitest](https://vitest.dev/), [fast-check](https://fast-check.dev/) e Testing Library           | Testes unitários, por propriedades e de componentes |
| ESLint                                                                                           | Análise do código                                   |

</details>

## Qualidade e segurança

Toda mudança passa pelas mesmas etapas antes de ir para o ar.

<img alt="Verificado a cada push: lint com ESLint, tipos com tsc, testes com Vitest e fast-check, build com Vite e deploy no GitHub Pages. Segurança sempre ligada com CodeQL, OpenSSF Scorecard semanal, atualizações agrupadas do Dependabot e modelos de tradução conferidos por sha256 no build" src="./.github/assets/quality-pt.webp" width="100%">

<details>
<summary>Como cada verificação funciona</summary>

- [`ci.yml`](.github/workflows/ci.yml) roda o lint, a checagem de tipos e os testes a cada push e pull request na `main`.
- [`deploy-pages.yml`](.github/workflows/deploy-pages.yml) gera o build e publica o site a cada push na `main`.
- O [CodeQL](https://github.com/Plovatto/SparkChat/security/code-scanning) analisa o código, e o [OpenSSF Scorecard](https://scorecard.dev/viewer/?uri=github.com/Plovatto/SparkChat) roda toda semana.
- [`lighthouse.yml`](.github/workflows/lighthouse.yml) audita as páginas de apresentação em português e inglês em acessibilidade, boas práticas e SEO.
- [`pr-title.yml`](.github/workflows/pr-title.yml) confere se o título do pull request segue o formato gitmoji com Conventional Commits.
- O Dependabot agrupa as atualizações de dependências.
- Os modelos de tradução são baixados e conferidos por sha256 durante o build.

</details>

## Como executar

Requer [Node.js](https://nodejs.org/) 20 ou mais recente (o CI usa a versão do [`.nvmrc`](.nvmrc)) e npm. Para testar a experiência completa, mantenha a [SparkChat API](https://github.com/Plovatto/API-SparkChat) rodando também.

1. Clone o repositório e instale as dependências:

   ```bash
   git clone https://github.com/Plovatto/SparkChat.git
   cd SparkChat
   npm install
   ```

2. Copie o arquivo de ambiente:

   ```bash
   cp .env.example .env
   ```

3. Inicie o servidor de desenvolvimento. A página de apresentação abre em <http://localhost:5173> e o app em <http://localhost:5173/app/>:

   ```bash
   npm run dev
   ```

| Variável                      | Descrição                                                                             |
| :---------------------------- | :------------------------------------------------------------------------------------ |
| `VITE_API_URL`                | URL da SparkChat API, por exemplo `http://localhost:3001`                             |
| `VITE_SOCKET_URL`             | URL do servidor Socket.IO, normalmente a mesma da API                                 |
| `VITE_MEDIA_ORIGIN`           | Opcional. Origem que serve as mídias enviadas, como a URL pública do bucket R2        |
| `VITE_TRANSLATION_MODELS_URL` | Opcional. Outra origem para os modelos de tradução, como um bucket com CORS           |
| `VITE_KT_LOG_PUBLIC_KEY`      | Opcional. Fixa no build a chave pública do registro de transparência de chaves        |
| `VITE_KT_WITNESS_URL`         | Opcional. URL da cabeça assinada publicada pela testemunha da transparência de chaves |

> [!NOTE]
> Se a API estiver em outra URL, atualize `VITE_API_URL` e `VITE_SOCKET_URL`. A URL do frontend também precisa constar em `FRONTEND_URL` na API, que controla o CORS.

## Como funciona

<details>
<summary>Origem das mídias</summary>

Quando `VITE_MEDIA_ORIGIN` está definida (por exemplo, a URL pública do bucket R2, igual a `R2_PUBLIC_BASE_URL` na API), o app só busca mídias dessa origem e a Content-Security-Policy libera conexões apenas para ela. Sem ela, o app aceita qualquer origem `https`, desde que o caminho seja `/uploads/images/`, `/uploads/audio/` ou `/uploads/files/`.

</details>

<details>
<summary>Content-Security-Policy</summary>

No build, as duas páginas (`index.html` e `app/index.html`) recebem uma Content-Security-Policy em `<meta http-equiv>`. Ela libera scripts do próprio site (mais o hash sha256 do script de inicialização da apresentação, calculado no build), `wasm-unsafe-eval` para libsodium e Bergamot, workers do próprio site e `blob:`, conexões para `VITE_API_URL`, `VITE_SOCKET_URL` (http e ws), a origem de mídia e `VITE_TRANSLATION_MODELS_URL`, e imagens do próprio site, `blob:`, `data:` e do Unsplash (papéis de parede). Plugins, frames, `<base>` e envio de formulários ficam bloqueados. O servidor de desenvolvimento não aplica a política.

</details>

<details>
<summary>Transparência de chaves</summary>

`VITE_KT_LOG_PUBLIC_KEY` e `VITE_KT_WITNESS_URL` são opcionais e só valem quando a API liga a transparência de chaves (`KEY_TRANSPARENCY_ENABLED`). A primeira fixa no build a chave pública do registro, em vez de confiar na que o servidor anuncia no primeiro uso. A segunda é a URL da cabeça assinada publicada pela testemunha (por exemplo, um arquivo no GitHub Pages); quando definida, a Content-Security-Policy libera conexões também para a origem dela.

Com a transparência desligada no servidor, o app não faz nada a mais, exceto quando a conta já usou o registro antes ou o build fixa a chave: nesse caso, a ausência da configuração gera um alerta de rebaixamento, e com a chave fixada o app recusa chaves novas ou alteradas de contatos até o registro voltar. O roteiro de ativação está no repositório da API (`docs/key-transparency.md`).

</details>

<details>
<summary>Tradução de mensagens</summary>

O app pode traduzir mensagens entre português e inglês direto no navegador. Os modelos são os de pt↔en do Mozilla (MPL-2.0), baixados e verificados por sha256 durante o build (`npm run models:fetch`, executado automaticamente em `dev` e `build`) e servidos pelo próprio site. Nenhum texto de mensagem sai do aparelho. Opcionalmente, `VITE_TRANSLATION_MODELS_URL` aponta para outra origem dos modelos.

</details>

<details>
<summary>Ambiente local com a API</summary>

```text
Apresentação: http://localhost:5173
App:          http://localhost:5173/app/
API:          http://localhost:3001
```

</details>

## Scripts

| Comando              | Descrição                                              |
| :------------------- | :----------------------------------------------------- |
| `npm run dev`        | Inicia o servidor de desenvolvimento                   |
| `npm run build`      | Executa a checagem de tipos e gera o build de produção |
| `npm run preview`    | Executa localmente o build de produção                 |
| `npm run typecheck`  | Executa a checagem de tipos sem gerar arquivos         |
| `npm run lint`       | Executa a análise do código com ESLint                 |
| `npm run lint:fix`   | Corrige problemas de lint automaticamente              |
| `npm test`           | Executa os testes                                      |
| `npm run test:watch` | Executa os testes em modo de observação                |

## Estrutura do projeto

<details>
<summary>Ver a árvore de pastas</summary>

```text
src/
├── app/              # App principal, gate de autenticação e provider global
├── assets/           # Imagens, ícones e arquivos estáticos da aplicação
├── components/       # Componentes reutilizáveis de interface (modal, spinner, botões e outros)
├── config/           # Leitura das variáveis de ambiente
├── constants/        # Constantes compartilhadas, como breakpoints de layout
├── features/
│   ├── auth/         # Login, cadastro, sessão e sincronização com o socket
│   ├── chat/         # Área de conversa, mensagens, anexos, efeitos e uploads
│   ├── landing/      # Página de apresentação da raiz, com prévia dos temas
│   ├── notifications/# Notificações do navegador, sons e badge de não lidas
│   ├── rooms/        # Lista de conversas, perfil, novo chat e helpers de sala
│   └── theme/        # Temas, papéis de parede e aparência dos balões
├── hooks/            # Hooks reutilizáveis entre features
├── lib/              # Clientes de API, socket, E2EE, idioma, storage, áudio, mídia e formatação
├── locales/          # Traduções em português e inglês (landing, app e nomes de temas)
├── styles/           # Estilos globais, animações e responsividade
├── types/            # Declarações de tipos globais
├── main.tsx
└── vite-env.d.ts
```

</details>

## Deploy

<details>
<summary>Como o site é publicado no GitHub Pages</summary>

O site é publicado no GitHub Pages pelo [`deploy-pages.yml`](.github/workflows/deploy-pages.yml) a cada push na `main`. Ele é servido em `sparkchat.plovatto.dev`, e a API em `sparkchat-api.plovatto.dev`.

A raiz (`/`) mostra a página de apresentação em português, `/en/` mostra a mesma página em inglês e o app fica em `/app/`. Antes de a página aparecer, um script no `<head>` escolhe o idioma: primeiro a escolha salva, depois o idioma do sistema (português ou inglês) e, se não for nenhum dos dois, inglês. Buscadores não são redirecionados. Quem já tem sessão salva e abre a raiz vai direto para o app, e links de convite antigos (`/?join=` e `/?startChat=`) são repassados para `/app/`.

O build tem duas páginas: `index.html` (apresentação) e `app/index.html` (app). Ao final do build, a página de apresentação é renderizada no servidor uma vez por idioma e gravada em `dist/index.html` e `dist/en/index.html`, cada uma com título, descrição, Open Graph e `hreflang` no próprio idioma.

Configuração única nas opções do repositório:

- **Settings → Pages:** a origem deve estar como **GitHub Actions**.
- **Settings → Pages → Custom domain:** `sparkchat.plovatto.dev`, com **Enforce HTTPS** ativo.
- **Settings → Environments → github-pages:** `VITE_API_URL` e `VITE_SOCKET_URL` devem apontar para a API hospedada, e `VITE_MEDIA_ORIGIN` (opcional, recomendado) para a origem pública das mídias. O Vite embute essas variáveis no build, então elas precisam existir no ambiente da Action, não apenas no `.env` local.

No DNS, o subdomínio `sparkchat` é um registro `CNAME` apontando para `plovatto.github.io`.

</details>

## Como contribuir

Issues e pull requests são bem-vindos. Leia o [guia de contribuição](CONTRIBUTING.md) para conhecer as convenções de branch, commit e pull request, e siga o [código de conduta](CODE_OF_CONDUCT.md).

## Segurança

Não abra issues públicas para vulnerabilidades. Relate de forma privada, como descrito na [política de segurança](SECURITY.md).

## Changelog

As mudanças relevantes ficam no [changelog](CHANGELOG.md), e cada versão é publicada na [página de releases](https://github.com/Plovatto/SparkChat/releases).

## Autora

**Pandora Becker Lovatto** · [@Plovatto](https://github.com/Plovatto) · [plovatto.dev](https://plovatto.dev/)

## Licença

Distribuído sob a [Licença MIT](LICENSE).

<br>

<p align="center"><img alt="" src="./.github/assets/theme-stripe.svg" width="100%" height="8"></p>

<p align="center"><a href="#readme"><img alt="Voltar ao topo" src="./.github/assets/logo-mark.svg" width="44"></a></p>
