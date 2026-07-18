# Schema canônico de Campanha + contrato dos agentes

Fundação técnica do pivot. A **Campanha** é um documento estruturado,
agnóstico de canal. A IA produz/edita esse documento (validado por schema);
o **motor de render** materializa cada canal a partir dele. Nada de IA
mexendo em pixel/DOM.

## Campanha (estrutura)

```ts
type Campaign = {
  id: string;
  tenantId: string;
  status: 'draft' | 'scheduled' | 'live' | 'ended';
  brief: string;                 // o que o usuário digitou (linguagem natural)

  content: {                     // preenchido pelo Agente de Marketing
    titulo: string;
    subtitulo?: string;
    corpo?: string;
    cta?: string;                // chamada para ação
    preco?: { de?: string; por?: string };
    selo?: string;               // ex.: "OFERTA", "NOVIDADE"
    imagemRef?: string;          // id de asset (não URL crua)
    qrcode?: { data: string } | null;
  };

  design: {                      // preenchido pelo Agente de Design
    templateId: string;          // template por segmento
    tokensOverride?: Partial<BrandTokens>;  // ajustes dentro do brand kit
  };

  schedule: {
    inicio?: string;             // ISO date
    fim?: string;
    horarios?: { de: string; ate: string }[];
    dias?: number[];             // 0..6
    recorrencia?: 'nenhuma' | 'diaria' | 'semanal' | 'mensal';
    prioridade?: 'normal' | 'destaque' | 'urgente';
    regras?: Rule[];             // futuro: clima, estoque, integrações
  };

  targets: Target[];             // onde publicar

  renders?: Record<ChannelFormat, RenderRef>;  // saída materializada (cache)
};

type Target =
  | { canal: 'tv'; grupo?: string; devices?: string[] }
  | { canal: 'site' }
  | { canal: 'instagram'; formatos: ('feed' | 'story' | 'reels')[] }
  | { canal: 'facebook'; formatos: ('feed' | 'story')[] }
  | { canal: 'whatsapp'; lista?: string };   // broadcast opt-in (não "grupo")

type ChannelFormat =
  | 'tv-16x9' | 'feed-1x1' | 'feed-4x5' | 'story-9x16' | 'wide-21x9';

type Rule = { tipo: string; params: Record<string, unknown> };  // futuro
```

## Brand kit (memória visual da empresa)

Evolução direta do `theme.js` atual.

```ts
type BrandTokens = {
  brand: string; brand2: string; accent: string;
  bg: string; bg2: string; text: string; textDim: string;
  font: string; radius: number;
};

type Brand = {
  tenantId: string;
  logoRef?: string;
  tokens: BrandTokens;
  segmento: string;              // restaurante | padaria | academia | ...
  tom?: string;                  // ex.: "descontraído", "sofisticado"
  publicoAlvo?: string;
};
```

## Motor de render multiformato

- Cada `templateId` declara **variantes por `ChannelFormat`** (16:9, 1:1, 9:16…)
  com regras de reflow: hierarquia, o que priorizar, o que ocultar.
- Composição **determinística** a partir de `content` + `design` + `Brand`.
- Saída: DOM ao vivo (TV) ou imagem/vídeo (redes) via Satori/Playwright.
- Regra de ouro: **layout é determinístico, não generativo.**

## Contrato dos agentes (saída = JSON validado)

Cada agente é uma *tool* com entrada e **saída tipada** (validar com JSON
Schema/Zod; rejeitar e repetir se sair do contrato).

```ts
// Agente de Marketing: brief + brand → conteúdo
type MarketingOut = Campaign['content'];

// Agente de Design: content + brand → escolha de template e ajustes
type DesignOut = { templateId: string; tokensOverride?: Partial<BrandTokens> };

// Agente de Imagem: prompt + brand → asset
type ImageOut = { imagemRef: string };  // gera/edita e devolve id do asset

// Editor em linguagem natural: (campanha atual + comando) → patch
type EditOut = { patch: JsonPatch };    // RFC 6902, aplicado e reversível

// Agente de Publicação: NÃO é LLM — orquestra adapters de canal.
// Agente de Analytics/Diretor: LLM sobre métricas agregadas (SQL), sugere
// campanhas; saída = Campaign[] (rascunhos) + justificativa.
```

## Orquestrador

- Início simples: **pipeline de tool-calling** (o LLM escolhe as tools na
  ordem: marketing → design → imagem → agenda). Não precisa multi-agente
  autônomo no dia 1.
- Cada passo persiste o documento; erros de schema disparam retry.
- Tudo que puder ser regra (agenda, targeting, aplicar brand kit, publicar)
  fica **fora** do LLM.

## Por que assim

Previsível (schema), barato (regra + templates + cache), consistente (brand
kit + templates por segmento) e reversível (patches). É a mesma filosofia que
o signage já usa hoje, estendida para multicanal.
