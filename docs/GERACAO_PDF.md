# Geração dos PDFs (Etapa 2.6)

Gerador **próprio e gratuito**: template HTML/CSS com a identidade do site, renderizado pelo Chromium (Playwright) no GitHub Actions. Código: `worker/src/pdf/` e `worker/src/jobs/{compose,render}.ts`.

## Fluxo e horários (Brasília)

| Hora | Etapa | O que faz |
| --- | --- | --- |
| a cada 3h | coleta → triagem → agrupamento → verificação → análise | prepara os assuntos (ver `ROBO_NOTICIAS.md`, `IA_NVIDIA.md`) |
| **22h12** | `compose` | monta as edições do dia seguinte: diária sempre; **semanal** às segundas; **mensal** no dia 1 |
| até 04h30 | revisão | prazo para o editor revisar (painel na Subetapa 2.7) |
| **04h35** | `render` | gera o PDF base de cada edição/UF, controle de qualidade, envia ao armazenamento privado |
| 06h | publicação | Subetapa 2.8 (personalização com nome e e-mail + envio) |

Workflow: `.github/workflows/worker-edition.yml` (pode ser disparado à mão escolhendo `compose` ou `render`).

## Montagem da edição (`compose`)

- **Janela**: diária = 24h até o fechamento das 22h da véspera (+12h de tolerância); semanal = 7 dias; mensal = mês anterior.
- **Assuntos**: analisados (análise válida), elegíveis pela política de verificação, **sem revisão pendente**, relevância ≥ média; os de maior nota em cada bloco.
- **Sem repetição (diária)** — revisto em 08/11/2026 (`pdf/repeats.ts`):
  - **Histórico comparado:** bloco estadual = diárias anteriores da própria UF; blocos nacional e internacional = diárias de **todas** as UFs (fato nacional já publicado é velho para qualquer estado, inclusive um estado que acabou de entrar).
  - **Mesmo assunto** = mesmo agrupamento **ou** outro agrupamento com texto quase igual (`edition.repeat_similarity`, 0,6) **ou** com os mesmos nomes próprios distintivos (ex.: "Santiago Peña" + "Paraguai"). Nomes de órgãos ("Prefeitura de Fortaleza", "Ministério Público…") e siglas (MPCE, TCE-CE) não ligam assuntos.
  - Assunto já publicado (últimos 10 dias; outro agrupamento: 5 dias) só volta como **"Atualização — assunto publicado em DD/MM"** se houver matérias depois daquela edição, texto novo **e manchete nova** (`edition.update_headline_similarity`, 0,6). Título reescrito com o mesmo fato é repetição. Agrupamento que começou antes da publicação anterior é antecedente, não novidade.
  - **Na mesma edição**, dois agrupamentos do mesmo assunto entram uma vez só (fica o mais relevante; a vaga é completada com o próximo).
  - **Folga do período:** 6h antes do início (`edition.grace_hours`; era 12h e trazia fato da véspera).
  - Por isso a diária pode ter **menos itens** que o máximo do bloco: só entra o que é novo. O motivo de cada assunto retirado fica em `editions.summary.repeats.skipped`.
- **Ordem fixa**: Estado (UF da edição) → Brasil → Mundo. Quantidades em `app_settings` → `edition.items_per_block` (diária 5/6/4; semanal 8/10/6; mensal 10/14/8).
- Grava `editions` (status `in_review`) e `edition_items`. Edição já gerada/publicada não é alterada (salvo `{"force": true}`).

## O documento

- **Capa** (página inteira, sem cabeçalho): marca, tipo da edição, UF, data, período coberto, números da edição, sumário por bloco e a **área reservada à personalização** ("Exemplar de uso pessoal e intransferível").
- **Miolo** (A4, cabeçalho e rodapé com paginação): abertura de cada bloco e, por assunto: categoria, **selo de verificação** (confirmada por N fontes / fonte oficial / fonte única), resumo, o que aconteceu, contexto, antecedentes, análises, por que importa, efeitos confirmados × **projeções** (sinalizadas), **Para memorizar**, **Na prova** (temas e como as bancas cobram), questões e **fontes com link**.
- **Gabarito comentado** ao final e a página "Como este material é feito" (método, fontes, uso pessoal, contato).
- Fontes **Sora** e **Manrope** embutidas (licença OFL, arquivos em `worker/assets/fonts/`) — o PDF não depende de rede nem de fontes do sistema.
- Cores: navy `#0b1230`, azul `#3366ff`, ciano `#38e1ff` (as mesmas do site).

## Personalização (preparada para a 2.8)

O PDF **base** não tem dado de assinante. As áreas a carimbar com `pdf-lib` estão em `PERSONALIZATION_SLOTS` (`worker/src/pdf/template.ts`): faixa da capa e metade direita do rodapé de cada página. Cópias personalizadas ficam 7 dias; bases, 90 dias.

## Controle de qualidade (antes de publicar)

`worker/src/pdf/qa.ts` reprova: menos de 3 assuntos; texto quebrado (`undefined`, `null`, `NaN`); assunto sem fonte ou com link inválido; **qualquer e-mail além do de contato** (o base não pode ter dado pessoal); PDF ilegível; mais de 20 MB; páginas fora de 2–160. Avisos (não reprovam): bloco vazio, assunto de fonte única, assunto sem questões. Resultado em `generated_documents.qa_report`. Reprovado → o arquivo não é enviado e a edição fica `failed`.

## Armazenamento

- Bucket **privado** `documents` (só PDF, até 20 MB): `base/{tipo}/{UF}/{AAAA-MM-DD}/v{versão}.pdf`. Acesso público é negado; o assinante receberá link temporário assinado (2.8).
- `generated_documents`: versão, caminho, tamanho, páginas, **SHA-256**, versão do template, QA. Nova geração da mesma edição cria `v2`, `v3`… e marca as anteriores como `superseded`.

## Rodar à mão

```bash
cd worker
npx playwright install chromium          # 1ª vez (no GitHub Actions: --with-deps)
npm run job -- tick compose               # monta a edição do próximo dia
npm run job -- tick render                # gera os PDFs das edições de hoje
```

## Primeira edição real (06/11/2026)

Informativo Diário · Ceará: 14 assuntos (5 Ceará, 5 Brasil, 4 Mundo), 26 questões, 30 páginas, 881 KB, QA aprovado, gerado em ~6 s. Download privado conferido pelo SHA-256; acesso público negado.

## Formato das revisões (desde 09/11/2026)

A **diária** traz o assunto completo (o que aconteceu, contexto, antecedentes, análises, desdobramentos, formas de cobrança e todas as questões). A **semanal** e a **mensal** usam o **cartão de revisão** (`template.ts`, `compact`): resumo, linha do tempo (assunto de vários dias), até 4 pontos "Para memorizar", "Na prova" (sem as formas de cobrança), **1 questão** por assunto e fontes; blocos sem quebra de página e gabarito em seguida. Referência: revisão semanal de 16 assuntos = 17 páginas (antes, 34).

