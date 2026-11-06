# Entrega dos informativos (Subetapa 2.8)

Personalização, publicação às 06h, área do assinante, e-mail e limpeza.

## Fluxo diário (horário de Brasília)

| Hora | Etapa | O que faz |
|---|---|---|
| 04h35 | `audit@pdf → render → personalize` | Audita o que ficou pendente, gera os PDFs base e prepara **uma cópia personalizada por assinante** |
| 05h57 | `deliver → cleanup` | Espera dar 06h e **publica**: edição e documento ficam "publicados" e as cópias aparecem na área do assinante. Com o e-mail ligado, envia **um e-mail por assinante** com os PDFs do dia em anexo. Depois roda a limpeza |

## Quem recebe

- Assinatura com status **ativo**.
- Recebe as edições da UF do seu cadastro (`profiles.state`). Assinante sem estado não recebe e é contado em `without_state` no resultado da tarefa.
- Na segunda-feira e no dia 1, a diária e a revisão (semanal/mensal) chegam juntas: são dois PDFs no mesmo e-mail.

## Personalização (`worker/src/pdf/personalize.ts`)

- **Ferramenta:** carimbo com pdf-lib sobre o PDF base, sem gerar o documento de novo.
- **Capa:** nome em destaque e e-mail na faixa reservada, logo abaixo de "Exemplar de uso pessoal e intransferível".
- **Rodapé:** "Nome · e-mail" na metade direita de todas as páginas.
- **Metadados:** nome e e-mail, mais um **código da entrega** (12 caracteres, derivado do documento e do assinante). Esse código identifica uma cópia repassada sem expor dados.
- **Fonte:** Helvetica padrão do PDF. Os acentos do português aparecem; letras de outros alfabetos são aproximadas.
- **Arquivo:** `personalizados/{id do usuário}/{id do documento}.pdf` no bucket privado `documents`. O caminho não contém nome nem e-mail.
- **Repetição:** a tarefa pode rodar de novo sem duplicar; cópia já preparada não é refeita.

## Área do assinante

- **Onde:** página Minha conta → "Meus informativos". Os dados vêm da Edge Function `account`:
  - `documents` lista as entregas;
  - `document_url` gera um link de 2 minutos **só para a cópia do próprio usuário**.
- **Limite de uso:** 60 pedidos a cada 10 minutos. Exportar e excluir a conta mantêm o limite de 10.
- **Validade:** a cópia fica disponível por **7 dias**. Depois disso, aparece como "Expirado".
- **Exclusão de conta:** apaga as cópias personalizadas do usuário. A exportação de dados (LGPD) inclui as entregas.

## E-mail

- **Ligar/desligar:** `delivery.email_enabled`, **desligado por padrão**. Ligar significa enviar a pessoas reais, então só com autorização.
- **Provedor:** Resend, chamado direto do worker.
- **Remetente:** `EMAIL_FROM`. Sem domínio verificado no Resend, só é possível enviar para o dono da conta Resend.
- **Modo de teste:** `EMAIL_TEST_TO` redireciona **todos** os envios e acrescenta "[TESTE → destinatário]" ao assunto.
- **Repetição segura:**
  - chave de idempotência `informativo:{data}:{usuário}`;
  - cada entrega fica em `document_deliveries` (canal `email`);
  - o envio fica registrado em `email_log` (tipo `informativo`).
- **Falhas:** novas tentativas nas próximas execuções, até 3.
- **Anexo grande:** acima de 15 MB, o e-mail vai só com o link da área.
- **Modelo:** `renderEditionEmail` em `supabase/functions/_shared/email/templates.ts`, o mesmo layout dos e-mails da assinatura.

## Limpeza (`cleanup`)

- **Cópias personalizadas com mais de 7 dias** (`delivery.personalized_days`): o arquivo é apagado; o registro da entrega continua, sem o caminho.
- **PDFs base com mais de 90 dias** (`delivery.base_days`): o arquivo é apagado e o documento fica com status `deleted`.
- **Contas excluídas:** pastas personalizadas de contas que não existem mais são apagadas.
- **Retenção do banco:** `apply_retention()`. Antes não havia quem a executasse; a migração 22 deu permissão ao worker.

## Espaço em disco

- Uma cópia personalizada tem ~0,9 MB. Com 7 dias de retenção, cada assinante ocupa ~6–7 MB, e na segunda-feira são duas cópias.
- O plano gratuito do Supabase tem 1 GB de Storage, o que dá para ~140 assinantes.
- Acima disso há dois caminhos:
  - plano pago (100 GB);
  - personalizar na hora do download, pela Edge Function, sem guardar a cópia. Isso exige mudar a decisão de guardar as cópias por 7 dias.

## Secrets do GitHub (ambiente `production`)

- **Obrigatórios para o e-mail:** `RESEND_API_KEY` e `EMAIL_FROM` (remetente de um domínio verificado no Resend).
- **Opcionais:** `EMAIL_REPLY_TO` e `EMAIL_TEST_TO`. Este último **mantém tudo em modo de teste enquanto existir**.
- **Variável:** `SITE_URL` (link da área no e-mail; padrão `https://atualidadeai-concursos.vercel.app`).

## Teste real (06/11, assinante temporário)

- **Personalização:** 1 cópia (911 KB) em 4,9 s, conferida visualmente (capa e rodapé).
- **Publicação:** edição 06/11 publicada, v2 `published` e v1 `superseded`; entrega na área `sent`.
- **E-mail:** 1 envio real só para o endereço de teste, com o PDF em anexo, autorizado. Depois o e-mail foi desligado de novo.
- **Limpeza:** depois de excluído o assinante de teste, a pasta dele foi apagada (1 arquivo). `apply_retention` rodou sem erro.
