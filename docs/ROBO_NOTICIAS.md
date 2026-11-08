# Robô de notícias: coleta (2.2), triagem e agrupamento (2.3)

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

Identificação do robô (User-Agent): `AtualidadeAI-Concursos-Bot/1.0 (+https://www.atualidadeaiconcursos.com.br; atualidadeaiconcursos@gmail.com)`.

## Triagem e agrupamento (Subetapa 2.3)

Rodam logo após a coleta, no mesmo workflow (`tick collect,triage,cluster,verify,analyze`). A verificação está em `docs/VERIFICACAO_INFORMACOES.md`. São **regras determinísticas e explicáveis, sem IA** — custo zero, resultado reproduzível. A IA (Subetapa 2.5) entra depois, só nos assuntos já selecionados.

**Triagem** (`worker/src/triage/classify.ts`, regras em `rules.ts`), para cada notícia `collected`:

1. **Idioma** detectado pelo texto (pt/en/es/fr).
2. **Ruído descartado** com motivo (`discard_reason`): áudio/vídeo sem texto, boletins diários, registros de sessão, avisos de expediente, títulos vazios.
3. **Relevância 0–100**: base 30, mais pontos para pautas de prova (lei aprovada/sancionada, MP, decisão do STF, indicadores oficiais, eleições, organismos internacionais, saúde pública, clima, direitos), menos para pauta institucional (homenagens, eventos, cursos, divulgação, esporte, discursos). Fonte oficial +4. Faixas: **muito alta** ≥ 70, **alta** ≥ 50, **média** ≥ 35, **baixa** < 35. Cada regra aplicada fica em `triage_reasons`.
4. **Categoria** (17 de `news_categories`) por palavras-chave; sem sinal → padrão da fonte.
5. **Alcance/UF**: vem da fonte. Veículo de imprensa estadual (O Povo, CN7) que não cita o próprio estado vai para Mundo (fato no exterior ou seção `/mundo/`) ou Brasil (seção `/brasil/`); órgão oficial do estado fica sempre no bloco do estado. Notícia de fonte nacional sobre **um único estado** vai para o bloco desse estado (exceto lei federal); sobre fato **no exterior** sem envolvimento brasileiro vai para internacional.

**Agrupamento** (`worker/src/triage/cluster.ts`): notícias sobre o mesmo fato viram um **assunto** (`news_clusters`):

- Similaridade de texto TF-IDF + cosseno (título pesa 2×), mesmo idioma, janela de **72h**, limiar **0,38** (calibrado nas notícias reais: junta "produção industrial −0,8%" de IBGE e Agência Brasil; não junta projetos diferentes da Câmara).
- Uma notícia nova entra no assunto existente mais parecido ou abre um novo.
- O assunto recebe: título da matéria mais relevante; alcance e categoria da maioria (estados diferentes → nacional); relevância = maior nota + **5 por fonte independente** adicional (grupos editoriais distintos, até +15).

Parâmetros ajustáveis em `app_settings` (`triage.similarity_threshold`, `triage.cluster_window_hours`, `triage.min_relevance_for_edition`).

Reprocessar após ajustar regras (exemplo, últimas 48h):
```sql
update news set status = 'collected', cluster_id = null where status in ('triaged','clustered') and collected_at > now() - interval '48 hours';
delete from news_clusters c where not exists (select 1 from news n where n.cluster_id = c.id);
```

## Fontes cadastradas (verificadas em 05/11/2026)

| Alcance | Ativas |
| --- | --- |
| Nacional | Agência Brasil (Últimas, Economia), Agência Senado, Câmara, STF, TCU, IBGE (API), Banco Central (Notícias, Notas) |
| Internacional | Agência Brasil — Internacional, ONU (press releases), OMS, Comissão Europeia, OMC |
| Ceará | Prefeitura de Fortaleza, TCE-CE, MPCE, TJCE |

Inativas, com o motivo registrado em `terms_notes`: Governo do Ceará (certificado HTTPS incompleto), Planalto (feed desatualizado), G1 e BBC News Brasil (uso comercial exige licença), CNN Brasil (robots.txt bloqueia o site), ONU News em português (robots.txt bloqueia o feed). Sem feed acessível: FMI, Banco Mundial, Diário do Nordeste, O Povo, Assembleia do Ceará, OCDE. Reuters/AP: serviços pagos de agência — não cadastrados.

## Veículos de imprensa (Subetapa 2.5b — verificados em 06/11/2026)

Além das fontes públicas, o robô lê **feeds e mapas de notícias** de veículos de imprensa, em **modo resumo** (`content_mode = 'summary'`):

- só **título + resumo curto (até 400 caracteres)** — mesmo quando o feed traz a matéria inteira, o resto é descartado e nada do texto é guardado;
- **nunca** acessa a página da matéria, não contorna paywall e respeita o robots.txt — inclusive do servidor de destino quando o feed redireciona (a CNN Brasil redireciona para um servidor que bloqueia robôs; por isso usamos o **mapa de notícias** dela, que o robots.txt libera para agregadores);
- a IA escreve **texto próprio** a partir dos fatos e **cita veículo + link**; cópia literal de 14+ palavras é recusada na validação;
- veículos do mesmo grupo (G1/O Globo/Valor; Folha/UOL; BBC Brasil/World) contam como **uma** fonte na verificação.

| Situação | Veículos |
| --- | --- |
| **Ativos — nacionais** | G1 (Últimas, Política, Economia, Educação), O Globo, Valor, UOL (Notícias, Economia), Folha (Em cima da hora, Poder, Mercado), CNN Brasil (mapa de notícias, só títulos), Poder360, Veja, Jovem Pan, CartaCapital, InfoMoney, Conjur, Agência Gov (oficial) |
| **Ativos — Ceará** | G1 Ceará, O Povo, CN7 |
| **Ativos — internacionais** | G1 Mundo, Folha Mundo, BBC News Brasil, BBC World, DW Brasil, El País, Euronews, NPR |
| **Inativos — termos proíbem robôs** | Estadão, Exame, Gazeta do Povo, Metrópoles, JOTA, RFI, France 24, The Guardian, The New York Times, Al Jazeera |
| **Inativos — feed parado** | GloboNews (conteúdo sai nos feeds do G1), CNN internacional, Correio Braziliense |
| **Sem feed** | Diário do Nordeste, Migalhas, Washington Post, Tribuna do Ceará |

**Risco jurídico residual** (anotado em `terms_notes` de cada fonte): BBC, DW e Euronews restringem o conteúdo a uso pessoal/não comercial; UOL, Folha, Jovem Pan, InfoMoney, O Povo, CN7 e NPR têm termos não verificados (página inacessível a robôs ou não localizada). Fatos não têm direito autoral (Lei 9.610/98, art. 8º) e não reproduzimos texto, mas **antes de atender clientes pagantes** recomenda-se revisão jurídica e, se necessário, licenciamento — ou desativar a fonte (`update news_sources set is_active = false where name = '...'`).

## Bahia (migração 27 — verificadas em 08/11/2026)

| Fonte | Tipo | Modo | Situação |
|---|---|---|---|
| TJBA — Notícias | Órgão público (feed) | integral | Ativa; sem robots.txt (permitido) |
| MPBA — Notícias | Órgão público | integral | Ativa; robots.txt permite |
| TCM-BA — Notícias | Órgão público | integral | Ativa; robots.txt permite |
| G1 — Bahia | Imprensa | resumo | Ativa (feed `/rss/g1/ba/bahia/`; o antigo `/rss/g1/bahia/` parou em 2018) |
| A Tarde | Imprensa | resumo | Ativa; termos não localizados |
| Bahia Notícias | Imprensa | resumo | Ativa; termos não localizados |
| Metro1 | Imprensa | resumo | Ativa; termos não localizados |
| Prefeitura de Salvador | Órgão público | integral | **Inativa**: feed parado desde 23/10/2026 |

Sem feed público: Governo da Bahia (ba.gov.br), Assembleia Legislativa (al.ba.gov.br) e TCE-BA. Primeira coleta: 163 notícias, nenhuma falha.

## Regras para novas fontes

1. Preferir API oficial → RSS/Atom → mapa de notícias (sitemap) → dados públicos estruturados. Raspagem de página só com permissão expressa.
2. Conferir `robots.txt` e termos de uso; registrar a conclusão em `terms_notes`.
3. Veículos de imprensa: modo resumo (`content_mode = 'summary'`); fica inativo se os termos proibirem robôs; registrar a leitura dos termos em `terms_notes`.
4. Informar `allowed_hosts` (hosts exatos do feed e de seus redirecionamentos).
5. Nunca contornar paywall, login, CAPTCHA ou bloqueio.

O cadastro pelo painel administrativo chega na Subetapa 2.7; até lá, por SQL (exemplo em `supabase/migrations/20261105220000_etapa2_fontes_e_coleta.sql`).

## Operação

- Rodar manualmente: GitHub → Actions → **worker-collect** → Run workflow. Local: `cd worker && npm run job -- tick collect,triage,cluster,verify,analyze`.
- Diagnóstico: `select scope, state, relevance_score, source_count, title from news_clusters order by last_seen_at desc limit 50;` · `select * from source_fetch_logs order by created_at desc limit 50;` e `select name, last_success_at, consecutive_failures, last_error from news_sources where is_active;`
- Retenção: texto original apagado após 30 dias; descartadas apagadas após 30 dias; logs de coleta após 90 dias.
