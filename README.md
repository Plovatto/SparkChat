# SparkChat Web

Interface do SparkChat, uma SPA desenvolvida com React, TypeScript e Vite para compor a experiência visual de uma aplicação de chat em tempo real.

## Funcionalidades

- SPA criada com React e Vite
- Layout inicial centralizado para validar a base da interface
- Configuração de ambiente para integração com backend
- Preparação para comunicação em tempo real com Socket.IO
- Alias de importação configurados no Vite
- Organização inicial por domínios da aplicação

## Tecnologias

- [React](https://react.dev/) 19
- [TypeScript](https://www.typescriptlang.org/)
- [Vite](https://vite.dev/)
- [Bootstrap](https://getbootstrap.com/) 5
- [React Bootstrap](https://react-bootstrap.github.io/)
- [Socket.IO Client](https://socket.io/docs/v4/client-api/)
- [React Icons](https://react-icons.github.io/react-icons/)
- ESLint - análise e padronização do código

## Como Executar

### Pré-requisitos

Antes de começar, tenha instalado:

- [Node.js](https://nodejs.org/)
- npm

Para testar a integração completa, mantenha também a SparkChat API em execução.

### Instalação

Clone o repositório:

```bash
git clone https://github.com/Plovatto/SPA-SparkChat.git
```

Acesse a pasta do projeto:

```bash
cd SPA-SparkChat
```

Instale as dependências:

```bash
npm install
```

Crie o arquivo de variáveis de ambiente:

```bash
cp .env.example .env
```

Execute o servidor de desenvolvimento:

```bash
npm run dev
```

O projeto estará disponível em:

```text
http://localhost:5173
```

## Variáveis de Ambiente

As variáveis são definidas no arquivo `.env`, que não deve ser versionado.

Utilize `.env.example` como referência:

```env
VITE_API_URL=http://localhost:3001
VITE_SOCKET_URL=http://localhost:3001
```

## Integração com a API

Este projeto foi preparado para trabalhar junto com a [SparkChat API](../API-SparkChat).

Em ambiente local, a configuração esperada é:

```text
SPA: http://localhost:5173
API: http://localhost:3001
```

Caso a API esteja em outra URL, atualize `VITE_API_URL` e `VITE_SOCKET_URL` no arquivo `.env`.

## Scripts

| Comando             | Descrição                                              |
| ------------------- | ------------------------------------------------------ |
| `npm run dev`       | Inicia o servidor de desenvolvimento                   |
| `npm run build`     | Executa a checagem de tipos e gera o build de produção |
| `npm run preview`   | Executa localmente o build de produção                 |
| `npm run typecheck` | Executa a checagem de tipos sem gerar arquivos         |
| `npm run lint`      | Executa a análise do código com ESLint                 |
| `npm run lint:fix`  | Corrige problemas de lint automaticamente              |

## Estrutura do Projeto

```text
src/
├── app/              # App principal, gate de autenticação e provider global
├── assets/           # Imagens, ícones e arquivos estáticos da aplicação
├── components/       # Componentes reutilizáveis de interface (modal, spinner, botões, etc.)
├── config/           # Leitura das variáveis de ambiente
├── constants/        # Constantes compartilhadas (ex.: breakpoints de layout)
├── features/
│   ├── auth/         # Login, cadastro, sessão e sincronização com o socket
│   ├── chat/         # Área de conversa, mensagens, anexos, efeitos e uploads
│   ├── notifications/# Notificações do navegador, sons e badge de não lidas
│   ├── rooms/        # Lista de conversas, perfil, novo chat e helpers de sala
│   └── theme/        # Temas, papéis de parede e aparência dos balões
├── hooks/            # Hooks reutilizáveis entre features
├── lib/              # Clientes de API, socket, E2EE, storage, áudio e formatação
├── styles/           # Estilos globais, animações e responsividade
├── types/            # Declarações de tipos globais
├── main.tsx
└── vite-env.d.ts
```
