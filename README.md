# AtualidadeAI Concursos

Plataforma por assinatura que entrega a candidatos de concursos públicos atualidades regionais, nacionais e internacionais, organizadas com inteligência artificial e disponibilizadas em PDFs diários, semanais e mensais.

> **Status:** Etapa 1 concluída (v0.7.0) — publicada em https://atualidadeai-concursos.vercel.app com Mercado Pago em **ambiente de teste**. Fluxo de alterações: `develop` → Pull Request → `main` ([docs/CONFIGURACAO.md §6](docs/CONFIGURACAO.md)). Veja [docs/CHANGELOG.md](docs/CHANGELOG.md).

## Stack

| Camada | Tecnologia |
| --- | --- |
| Frontend | React 19.3 + TypeScript 7 |
| Build | Vite 8 (Rolldown) |
| Estilo | Tailwind CSS v4 (plugin `@tailwindcss/vite`, sem PostCSS) |
| Banco e autenticação | Supabase (PostgreSQL + Auth) |
| Backend seguro | Supabase Edge Functions |
| Pagamentos | Mercado Pago |
| Hospedagem | Vercel (deploy automático via GitHub) |

## Pré-requisitos

- **Node.js 20.19+ ou 22.12+** (recomendado: 22 LTS — ver `.nvmrc`). Verifique com `node -v`.
- **npm 10+** (instalado junto com o Node). Verifique com `npm -v`.
- **Git**. Verifique com `git --version`.

## Como executar

```bash
# 1. Instalar dependências (gera também o package-lock.json na primeira vez)
npm install

# 2. Criar o arquivo de variáveis locais
#    Windows (PowerShell):  Copy-Item .env.example .env.local
#    macOS/Linux:           cp .env.example .env.local

# 3. Servidor de desenvolvimento -> http://localhost:5173
npm run dev
```

### Scripts

| Comando | O que faz |
| --- | --- |
| `npm run dev` | Servidor de desenvolvimento com recarga automática |
| `npm run typecheck` | Verifica os tipos TypeScript sem gerar arquivos |
| `npm run build` | Verifica os tipos e gera a versão de produção em `dist/` |
| `npm run preview` | Serve localmente o conteúdo de `dist/` para conferência |
| `npm run test:functions` | Testes das regras de pagamento (assinatura do webhook, status, valor) |
| `npm run email:samples` | Envia um exemplo de cada e-mail para `EMAIL_TEST_TO` |
| `npm run auth:email` | Configura os e-mails de login do Supabase (SMTP Resend + modelos) |
| `npm run check:supabase` | Testa a conexão com o Supabase e as permissões (lê `.env.local`) |

## Estrutura de pastas

```
.
├── docs/                    Documentação técnica e de design
│   └── design/referencias/  Imagens de referência visual
├── scripts/                 Utilitários (check-supabase.mjs)
├── public/                  Arquivos estáticos servidos na raiz (favicon)
├── src/
│   ├── components/
│   │   ├── ui/              Componentes básicos (Button, Badge, Icon, Reveal, SectionHeading…)
│   │   ├── layout/          Cabeçalho e rodapé
│   │   └── sections/        Seções da landing page (Hero, Planos, FAQ…)
│   ├── content/             ★ TEXTOS da landing e PLANOS — edite aqui
│   ├── config/              Variáveis de ambiente e dados institucionais
│   ├── hooks/               Hooks React reutilizáveis
│   ├── lib/                 Clientes externos (Supabase)
│   ├── pages/               Páginas da aplicação
│   ├── types/               Tipos compartilhados (incl. tipos do banco)
│   ├── utils/               Funções utilitárias
│   ├── App.tsx              Componente raiz
│   ├── main.tsx             Ponto de entrada
│   └── index.css            Tailwind + design tokens
├── supabase/
│   ├── migrations/          Scripts SQL versionados (executar em ordem)
│   ├── verificacao.sql      Checagem pós-instalação
│   ├── functions/           Edge Functions do Mercado Pago (mp-*) + testes
│   └── config.toml          Configuração das funções (deploy)
├── .env.example             Modelo de variáveis (sem credenciais)
├── vercel.json              Configuração de build e rotas na Vercel
└── vite.config.ts           Configuração do Vite
```

## Páginas

| Endereço | Conteúdo |
| --- | --- |
| `/` | Landing page |
| `/cadastro` | Cadastro (nome, e-mail, senha, UF, cidade, aceite dos termos) |
| `/entrar` | Login |
| `/recuperar-senha`, `/redefinir-senha` | Recuperação de senha por e-mail |
| `/confirmar-email` | Destino do link de confirmação de cadastro |
| `/conta` | Área do assinante: dados, contratação, status e cancelamento da assinatura |
| `/pagamento/retorno` (e `/sucesso`, `/pendente`, `/falha`) | Retorno do checkout — status confirmado na API do Mercado Pago |
| `/termos`, `/privacidade` | Provisórias até a publicação dos documentos |
| `/status` | Página técnica de verificação (somente em `npm run dev`) |

## Como alterar a landing page

Veja o guia em [docs/design/DESIGN.md](docs/design/DESIGN.md#como-editar-a-landing-page).

## Segurança

- Credenciais reais ficam apenas em `.env.local` (ignorado pelo Git), no painel da Vercel e nos *Secrets* do Supabase.
- Variáveis com prefixo `VITE_` são **públicas** (vão para o navegador). Nunca use esse prefixo para chaves secretas.

## Documentação

- [Arquitetura](docs/ARQUITETURA.md)
- [Banco de dados](docs/BANCO_DE_DADOS.md)
- [Configuração](docs/CONFIGURACAO.md)
- [Integrações](docs/INTEGRACOES.md)
- [Design](docs/design/DESIGN.md)
- [Relatório de testes](docs/TESTES.md)
- [Manutenção](docs/MANUTENCAO.md)
- [Changelog](docs/CHANGELOG.md)
