# Robô de coleta de notícias (Etapa 2.2)

## Como funciona

1. **Agendamento:** GitHub Actions (`.github/workflows/worker-collect.yml`) a cada 3 horas, minuto 7 (UTC). Cada rodada tem chave única por janela de 3h — reexecuções não duplicam.
2. **Fontes vencidas:** só as fontes **ativas** cujo intervalo (`fetch_interval_minutes`, padrão 180) já passou. Após falhas seguidas, a espera dobra (até 8× e no máximo 24h) — fontes instáveis não são marteladas.
3. **robots.txt:** consultado por servidor a cada rodada (RFC 9309). Caminho bloqueado → fonte não é coletada e o motivo fica registrado. `Crawl-delay` é respeitado (2 a 15 s). APIs públicas documentadas (IBGE) não passam pelo robots.txt.
4. **Requisição segura** (`worker/src/sources/fetcher.ts`): só HTTPS; só hosts cadastrados na fonte (`allowed_hosts`); IPs internos/reservados bloqueados na resolução de DNS e para IP literal; até 3 redirecionamentos, cada um revalidado; até 3 MB e 20 s; cache HTTP (`ETag`/`Last-Modified` → 304).
5. **Leitura:** RSS 2.0, RSS 1.0 e Atom (`fast-xml-parser`, sem processar entidades; documentos com DTD são recusados) e API do IBGE.
6. **Normalização:** todo HTML vira **texto puro** (sem scripts/estilos); entidades decodificadas; URL canônica (sem `utm_*`, `fbclid` etc.); data no futuro vira nula; itens com mais de **7 dias** são ignorados; até **50 itens** por fonte.
7. **Deduplicação:**
   - mesma URL canônica → não grava de novo (`url_hash` único);
   - mesmo conteúdo em outra URL (republicação, até 14 dias) → grava como `discarded` com o motivo `conteúdo duplicado de <id>`.
8. **Registro:** cada tentativa vai para `source_fetch_logs` (status, HTTP, itens, novos, duplicados, erro, duração) e a saúde da fonte é atualizada (`last_checked_at`, `last_success_at`, `last_error`, `consecutive_failures`).
9. **Encaminhamento:** notícias novas ficam com `status = 'collected'` — a triagem (Subetapa 2.3) parte delas. Alcance, UF e categoria iniciais vêm da fonte e são refinados na triagem.

Identificação do robô (User-Agent): `AtualidadeAI-Concursos-Bot/1.0 (+https://atualidadeai-concursos.vercel.app; atualidadeaiconcursos@gmail.com)`.

## Fontes cadastradas (verificadas em 05/11/2026)

| Alcance | Ativas |
| --- | --- |
| Nacional | Agência Brasil (Últimas, Economia), Agência Senado, Câmara, STF, TCU, IBGE (API), Banco Central (Notícias, Notas) |
| Internacional | Agência Brasil — Internacional, ONU (press releases), OMS, Comissão Europeia, OMC |
| Ceará | Prefeitura de Fortaleza, TCE-CE, MPCE, TJCE |

Inativas, com o motivo registrado em `terms_notes`: Governo do Ceará (certificado HTTPS incompleto), Planalto (feed desatualizado), G1 e BBC News Brasil (uso comercial exige licença), CNN Brasil (robots.txt bloqueia o site), ONU News em português (robots.txt bloqueia o feed). Sem feed acessível: FMI, Banco Mundial, Diário do Nordeste, O Povo, Assembleia do Ceará, OCDE. Reuters/AP: serviços pagos de agência — não cadastrados.

## Regras para novas fontes

1. Preferir API oficial → RSS/Atom → dados públicos estruturados. Raspagem de página só com permissão expressa.
2. Conferir `robots.txt` e termos de uso; registrar a conclusão em `terms_notes`.
3. Veículos comerciais: só com autorização/licença para produto pago.
4. Informar `allowed_hosts` (hosts exatos do feed e de seus redirecionamentos).
5. Nunca contornar paywall, login, CAPTCHA ou bloqueio.

O cadastro pelo painel administrativo chega na Subetapa 2.7; até lá, por SQL (exemplo em `supabase/migrations/20261105220000_etapa2_fontes_e_coleta.sql`).

## Operação

- Rodar manualmente: GitHub → Actions → **worker-collect** → Run workflow. Local: `cd worker && npm run job -- tick collect`.
- Diagnóstico: `select * from source_fetch_logs order by created_at desc limit 50;` e `select name, last_success_at, consecutive_failures, last_error from news_sources where is_active;`
- Retenção: texto original apagado após 30 dias; descartadas apagadas após 30 dias; logs de coleta após 90 dias.
