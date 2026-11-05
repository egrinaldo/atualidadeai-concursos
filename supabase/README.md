# Supabase

| Caminho | Conteúdo |
| --- | --- |
| `migrations/` | Scripts SQL versionados `AAAAMMDDHHMMSS_descricao.sql`. **Executar em ordem.** Todos são reexecutáveis. |
| `verificacao.sql` | Checagem pós-instalação (somente leitura) — todas as linhas devem retornar `OK`. |
| `functions/` | Edge Functions (Deno/TypeScript): checkout, webhook do Mercado Pago, e-mails (Subetapas 5 e 6). |

Passo a passo de instalação: [docs/CONFIGURACAO.md](../docs/CONFIGURACAO.md#3-supabase-subetapa-3).
Estrutura e regras de segurança: [docs/BANCO_DE_DADOS.md](../docs/BANCO_DE_DADOS.md).

**Novas alterações de banco:** crie um NOVO arquivo de migração com data/hora posterior. Não edite migrações já executadas em produção.

Segredos usados pelas funções são cadastrados com `supabase secrets set NOME=valor` (ou no painel: *Edge Functions → Secrets*). Nunca no repositório.
