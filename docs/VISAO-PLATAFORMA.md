# Visão — Plataforma de Comunicação Digital (pivot do Vistra)

Análise de viabilidade e arquitetura para reposicionar o produto de "software
de digital signage" para uma **plataforma inteligente de comunicação para
PMEs**. Documento de estratégia/arquitetura — não é código.

## Reposicionamento

- **De:** software para exibir conteúdo em TVs.
- **Para:** plataforma onde a empresa cria **uma campanha** e ela é gerada,
  adaptada, publicada e monitorada **automaticamente em todos os canais**
  (TV, painéis, totens, Instagram, Facebook, site, WhatsApp…). A TV vira
  **um dos canais**.
- **Proposta de valor:** "Crie uma campanha uma vez; a plataforma publica em
  todos os canais." Foco em **produtividade de marketing**, não em gestão de
  telas.
- **Público inicial:** PMEs (padarias, restaurantes, academias, clínicas, pet
  shops, farmácias, óticas, pequenas redes e franquias).
- **Diferencial nº 1:** **simplicidade** (experiência tipo Canva/Notion),
  não a IA em si. Campanha completa em minutos, sem treinamento.

## Veredito de viabilidade

**Tecnicamente viável e com vantagem de largada** — o motor de "conteúdo como
dado → render determinístico" já existe no signage e é o pedaço difícil.

Os riscos **não são a IA**, são três:
1. **Publicação multicanal** (Meta/WhatsApp) — atrito de API/políticas.
2. **Motor de render multiformato** (uma campanha → 16:9, 9:16, 1:1…) — é
   problema de *design system*, não de IA.
3. **Go-to-market para PME** — vender/distribuir.

## Aproveitamento do que já existe

| Já existe | Vira |
|---|---|
| `render.js` (conteúdo = dado → DOM) | Campanha como dado → renderer |
| `theme.js` (design tokens) | Brand kit / memória visual da empresa |
| `templates.js` | Templates inteligentes por segmento |
| Superfície adaptativa | Base da adaptação por formato/canal |

## Arquitetura proposta (modular)

1. **Campanha como documento estruturado** (JSON canônico, agnóstico de
   canal). Ver [`CAMPANHA-SCHEMA.md`](CAMPANHA-SCHEMA.md).
2. **Motor de render multiformato (determinístico, sem IA):** um mesmo
   conteúdo renderizado em N formatos, via variantes de template + design
   tokens + constraint layout. Geração de imagem estática com **Satori
   (HTML→SVG→PNG)**; vídeo/animação com **Playwright/ffmpeg** em workers. TV
   continua sendo o player web ao vivo.
3. **Camada de IA — orquestrador + agentes como *tools*:** LLM com
   tool-calling e **saída sempre validada por schema**. Agentes: Marketing
   (copy/CTA), Design (template + tokens), Imagem (gerar/editar), Publicação
   (determinístico, não-LLM), Analytics/Diretor (LLM sobre dados agregados).
   Comece com um pipeline simples de tool-calling, não multi-agente autônomo.
4. **Publicação multicanal (adapters):** um adapter por canal, cada um com sua
   realidade (ver riscos abaixo).
5. **Memória da empresa:** brand kit estruturado (tabela) + histórico
   (embeddings/pgvector) para "no seu estilo" e para o Diretor de Marketing.
6. **Editor em linguagem natural:** o LLM recebe o JSON atual + o comando e
   devolve um **patch (JSON Patch)**, não o documento todo. Aplicar + re-render.

## LLM x regras (a divisão que decide o custo)

| Usa LLM | Usa regra determinística |
|---|---|
| Copy, slogan, CTA, tom | Layout/composição (motor de render) |
| Escolher template + ajustes | Aplicar brand kit (cores/fontes) |
| Comando NL → patch | Agendamento, recorrência, targeting |
| Gerar imagem | Publicação/adapters |
| Diretor de Marketing (sobre dados) | Analytics (é SQL) |

Quanto mais em regra + templates, mais barato, rápido e consistente.

## Publicação multicanal — o maior risco externo

- **TV/totem/painel:** já dominado (device pull + sync). Fácil.
- **Instagram/Facebook:** Meta Graph / Content Publishing API — exige conta
  Business, **App Review**, permissões, e tem **limites diários** e políticas.
  Não é plug-and-play; é manutenção contínua quando a Meta muda regra.
- **WhatsApp:** Cloud API publica em **templates aprovados** para contatos
  opt-in — **não** "posta em grupo" livremente. Ajustar a promessa:
  broadcast/notificação, não "posto no grupo".
- **Site:** trivial (widget/embed ou publish estático).

Combo realista para o MVP do pivot: **TV + Site + Instagram Feed**.

## Maiores desafios de engenharia

1. Motor de layout multiformato **bonito** sem designer (o coração).
2. Adapters de publicação (App Review + manutenção eterna).
3. Pipeline de IA confiável (schema-validated, custo/latência controlados).
4. Biblioteca de templates por segmento (trabalho de design).
5. Diretor de Marketing proativo (só fica útil com dados; v2+).

## Escala e custo

- **Telas** escalam barato: device puxa config de **CDN/edge com cache**.
- **Custo variável** = geração de mídia e chamadas de LLM/imagem → mitigar com
  **cache**, templates, modelos pequenos para tarefas simples.
- **Multi-tenant:** Postgres + RLS + filas stateless → escala horizontal.

## Stack recomendada

- API: Node (NestJS/Fastify) ou Python (FastAPI). Banco: **Postgres +
  pgvector**. Fila: **Redis + BullMQ**. Render: **Satori + Playwright/ffmpeg**
  em workers. Storage: **S3/R2 + CDN**. Auth/billing: Supabase/Clerk + Stripe.
- Dashboard: Next.js/React. **Player continua vanilla.**

## Faseamento

1. Fundação SaaS (contas, multi-tenant, devices, billing) — ver `PLANO-SAAS.md`.
2. Campanha-como-dado + render multiformato (TV + Site + IG Feed).
3. IA: brief → JSON + editor NL + templates por segmento.
4. Publicação (Instagram → Stories → WhatsApp com promessa ajustada).
5. Analytics (SQL) → Diretor de Marketing proativo.

**MVP do pivot ≈ passos 1-3.**

## Resumo honesto

Viabilidade técnica alta. Diferencial certo = simplicidade, não IA. Riscos são
de integração (Meta/WhatsApp), design (templates) e mercado (GTM), não de
núcleo. Vantagem concreta: o motor de conteúdo-como-dado já existe.
