# Direção visual

## Referências analisadas (`docs/design/referencias/`)

| Arquivo | Característica principal |
| --- | --- |
| `14f2aaa…jpg` | Fundo azul-marinho/índigo, linhas e grade técnicas, acento coral, faixa de números (aulas/alunos/módulos), cards de vídeo. |
| `23d9a7e…jpg` | Preto + vermelho, formas hexagonais, comparação "antes/depois", pilares em cards, FAQ em acordeão. |
| `29da1a1…jpg` | Preto + verde-limão, card de preço central em destaque, 3 pilares, CTA repetido ao longo da página. |

### Padrões em comum (adotados)
1. **Fundo escuro** com textura sutil (grade, brilho radial).
2. **Um único acento vibrante**, usado com parcimônia para destacar palavras-chave e CTAs.
3. **Títulos grandes e pesados**, com uma parte da frase colorida.
4. **Faixa de indicadores** logo após o hero.
5. **Pilares em cards** (3 colunas no desktop, empilhados no celular).
6. **Card de preço central** com destaque luminoso.
7. **FAQ em acordeão** e **CTA repetido** em pontos estratégicos.

### O que NÃO será copiado
- Fotos de pessoas, depoimentos, números de alunos/resultados — o briefing proíbe dados fictícios; indicadores só com dados reais ou marcados como exemplo.
- Vermelho e verde-limão — fogem da paleta pedida (azul-marinho, azul e neutros).

## Paleta

| Token | Hex | Uso |
| --- | --- | --- |
| `navy-950` | `#070B1F` | Fundo da página |
| `navy-900` / `navy-800` | `#0B1230` / `#111A42` | Cards e superfícies |
| `brand-500` | `#3366FF` | Botões primários |
| `brand-400` / `brand-300` | `#5B8CFF` / `#8FB3FF` | Links, ícones, destaques suaves |
| `signal-400` | `#38E1FF` | Acento único: palavras em destaque, indicadores "ao vivo" |
| `slate-*` (Tailwind) | — | Textos neutros |

Alternativa disponível: um acento **coral** (como na referência 1) para os CTAs. Basta pedir.

## Tipografia
- **Sora** (títulos): geométrica, técnica, peso forte — aproxima a força dos títulos das referências.
- **Manrope** (texto): alta legibilidade em telas pequenas.

## Como alterar
Todas as cores, fontes e animações estão no bloco `@theme` de `src/index.css`. Alterar um valor ali atualiza o site inteiro.

## Como editar a landing page

| Quero mudar… | Arquivo | O que fazer |
| --- | --- | --- |
| Qualquer texto (títulos, descrições, FAQ, passos) | `src/content/landing.ts` | Edite o texto entre aspas. Mantenha vírgulas e chaves. |
| Nome, descrição e preço da assinatura | `src/content/plans.ts` → `plan` | Preço em **centavos** (`999` = R$ 9,99). Mude também o preço do plano no banco (tabela `plans`), que é o valor cobrado pelo Mercado Pago. O novo valor aparece automaticamente no hero, na seção de assinatura e no FAQ. |
| Itens "O que está incluso" | `src/content/plans.ts` → `planFeatures` | Um item por linha. |
| Itens do menu | `src/content/landing.ts` → `navLinks` | `href` deve apontar para o `id` de uma seção. |
| E-mail, razão social, CNPJ | `src/config/site.ts` | Aparecem no rodapé quando preenchidos. |
| Cores e fontes | `src/index.css` (bloco `@theme`) | Ex.: trocar `--color-signal-400` muda todos os destaques. |
| Ícones | `src/components/ui/Icon.tsx` | Use um nome existente (`mapPin`, `globe`…) nos arquivos de conteúdo. |
| Ordem das seções | `src/pages/Home.tsx` | Reordene ou remova as linhas `<Hero />`, `<Pricing />` etc. |
| Logotipo | `src/components/ui/Logo.tsx` e `public/favicon.svg` | Logotipo provisório em SVG; pode ser substituído por imagem em `src/assets/`. |

**Imagens:** a página não usa fotos (as referências usam fotos de pessoas, mas o briefing proíbe depoimentos/personagens fictícios). Para incluir uma imagem própria, coloque o arquivo em `src/assets/` e importe-o no componente: `import foto from '@/assets/foto.webp'` → `<img src={foto} alt="descrição" />`.

## Como testar a responsividade

1. `npm run dev` e abra <http://localhost:5173>.
2. Pressione **F12** e depois **Ctrl+Shift+M** (modo dispositivo).
3. Teste larguras **320**, **390**, **768**, **1024** e **1440 px** (campo de largura no topo).
4. Verifique: nenhuma rolagem horizontal; menu ☰ abre e fecha (e fecha com **Esc**); links do menu levam à seção correta; perguntas do FAQ abrem e fecham.
5. Navegue só com **Tab** para conferir o foco visível nos links e botões.
