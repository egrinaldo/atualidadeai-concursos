# Relatório de testes — Etapa 1

Data: 05/11/2026 · Versão 0.7.0 · Ambiente: Mercado Pago **em modo de teste**.

## 1. Verificações automáticas

| Verificação | Comando | Resultado |
| --- | --- | --- |
| Tipos TypeScript | `npm run typecheck` | ✓ 0 erros |
| Build de produção | `npm run build` | ✓ landing ≈ 82 kB JS (gzip); área de login carregada sob demanda |
| Dependências vulneráveis | `npm audit` | ✓ 0 vulnerabilidades |
| Regras de pagamento e e-mail | `npm run test:functions` | ✓ 18/18 (assinatura HMAC do webhook, status, valores, modelos, escape de HTML) |
| Tipos das Edge Functions | `deno check` | ✓ sem erros |
| Conexão e permissões do banco | `npm run check:supabase` | ✓ "Tudo certo" |
| Migrações | 8 scripts reexecutados + `supabase/verificacao.sql` | ✓ todas as checagens OK |
| Security Advisor do Supabase | painel / API | ✓ sem erros; avisos restantes aceitos (ver ARQUITETURA) |

## 2. Segurança

| Item | Resultado |
| --- | --- |
| Segredos nos arquivos versionados | ✓ nenhum |
| Segredos no JavaScript publicado | ✓ nenhum (só a trava que impede chave secreta em `VITE_`) |
| Histórico do Git | ⚠ encontrado Access Token do Mercado Pago em 3 commits antigos (`.env.example`) → histórico substituído por commit único; ✓ nenhum segredo em nenhum objeto do `.git` |
| `.env` / `.env.local` | ✓ ignorados, nunca versionados |
| Cabeçalhos HTTP em produção | ✓ CSP, HSTS, X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy, COOP |
| CSP x funcionamento | ✓ nenhuma violação (fontes, municípios, Supabase) |
| RLS | ✓ usuário só lê os próprios dados; tabelas de pagamento só pelo backend |
| Webhook | ✓ rejeita assinatura inválida; notificação repetida não duplica pagamento nem e-mail |
| Ativação | ✓ só por status confirmado na API do Mercado Pago, nunca pelo redirecionamento |

## 3. Testes manuais / navegador (local)

- Landing em 320, 390, 768, 1024 e 1440 px: sem rolagem lateral; menu móvel, FAQ e âncoras OK.
- Cadastro, login, logout, recuperação e redefinição de senha: 36/36 cenários.
- E-mail inválido ou já cadastrado: mensagem clara, sem criar usuário nem lead indevido.
- Assinatura completa no sandbox (comprador de teste, cartão de teste): pagamento aprovado, assinatura ativa, e-mails enviados; cancelamento OK.

## 4. Testes em produção (`https://atualidadeai-concursos.vercel.app`)

| Teste | Resultado |
| --- | --- |
| Landing 320 / 390 / 768 / 1440 px | ✓ sem rolagem lateral, sem erros no console |
| Fontes (Sora, Manrope) | ✓ carregadas |
| Rotas `/cadastro`, `/entrar`, `/conta`, `/pagamento/retorno` e 404 | ✓ |
| `/status` (página técnica) | ✓ não exposta em produção |
| Municípios por UF | ✓ (CE: 184 cidades) |
| Login com senha errada | ✓ mensagem em português |
| Login → área do assinante | ✓ (usuário temporário, depois removido) |
| Contratação → checkout do Mercado Pago (sandbox) | ✓ redireciona para `mercadopago.com.br/subscriptions/checkout` |
| Retorno do checkout (`mp-return`) | ✓ 302 para `https://atualidadeai-concursos.vercel.app/pagamento/retorno` |
| E-mail de confirmação de cadastro (Resend) | ✓ cadastro real confirmado pelo link recebido |

Dados de teste criados em produção foram removidos (assinatura cancelada no Mercado Pago e usuário apagado).

## 5. Limitações conhecidas

- Mercado Pago em **modo de teste**: nenhuma cobrança real é feita.
- Sem domínio próprio: o Resend só entrega à conta dona da chave (`EMAIL_TEST_TO`); e-mails de login usam o remetente `onboarding@resend.dev`.
- Notificações reais de webhook do Mercado Pago no sandbox são irregulares; a conciliação agendada (a cada 6 h) e a sincronização ao abrir `/conta` cobrem isso.
- Páginas de Termos e Privacidade são provisórias.
- Vercel Hobby: apenas uso não comercial (ver CONFIGURACAO §7.6).
