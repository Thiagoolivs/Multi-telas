# Documentação — por onde começar

O QA de 26/10 encontrou 31 documentos aqui, vários velhos. Este mapa diz o
que é **vivo** (vale hoje), o que é **referência** (o porquê de decisões
passadas) e o que foi para o **arquivo**.

## Vivos — leia estes

| Documento | Para quê |
|---|---|
| [`ESTADO-DO-PROJETO.md`](ESTADO-DO-PROJETO.md) | **O retrato atual**: o que existe, o que mudou em cada rodada, o que falta |
| [`FRENTES.md`](FRENTES.md) | **As três frentes** (Empresas, Saúde, Comércio): o que muda, o que é igual, quem troca |
| [`MARCA.md`](MARCA.md) | Cores, letra e forma da marca (uma página) |
| [`OPERACAO.md`](OPERACAO.md) | O que fazer no Railway: região, homologação, alerta de deploy |
| [`LANCAMENTO.md`](LANCAMENTO.md) | O que precisa estar configurado antes de vender |
| [`CONFIGURAR-RESEND-E-ASAAS.md`](CONFIGURAR-RESEND-E-ASAAS.md), [`ARMAZENAMENTO.md`](ARMAZENAMENTO.md), [`BACKUP.md`](BACKUP.md) | Passo a passo de configuração |
| [`PROMPT-COWORK.md`](PROMPT-COWORK.md) | Prompt para configurar tudo pelo navegador |
| [`BILLING.md`](BILLING.md) | Como a cobrança funciona (Asaas, planos, atraso) |
| [`ads/`](ads/README.md) | **Multi Telas Ads**: planejamento da rede de anúncios (proposta) |

## Referência — o porquê das decisões

| Documento | Conteúdo |
|---|---|
| [`EXECUTOR.md`](EXECUTOR.md) | Ordens de serviço numeradas (D0.1–D51); os comentários do código citam os números |
| [`PLANO.md`](PLANO.md) | Plano de produto "de bom a premium" (seções citadas no código, ex. §5.1) |
| [`PLANO-SAAS.md`](PLANO-SAAS.md) | Modelo multi-empresa |
| [`AGENTES.md`](AGENTES.md), [`CONSULTOR.md`](CONSULTOR.md), [`TESTADOR.md`](TESTADOR.md) | Como consultor, executor e testador trabalham no repositório |
| [`AI-CONTENT.md`](AI-CONTENT.md), [`CAMPANHA-SCHEMA.md`](CAMPANHA-SCHEMA.md), [`EVAL.md`](EVAL.md) | IA de conteúdo, formato da campanha, avaliação |
| [`BANCO-DE-IMAGENS.md`](BANCO-DE-IMAGENS.md), [`LOGIN-E-EMAIL.md`](LOGIN-E-EMAIL.md), [`CANAL-BETA.md`](CANAL-BETA.md) | Recursos específicos |
| [`VISAO-PLATAFORMA.md`](VISAO-PLATAFORMA.md) | Estudo de pivô para comunicação multicanal |
| [`ANALISE-PIXMIDIA.md`](ANALISE-PIXMIDIA.md), [`REFERENCIA-CONCORRENTES.md`](REFERENCIA-CONCORRENTES.md) | Concorrência |
| `AVALIACAO-ASSISTENTE-*.md` | Gerados por `tools/avaliar-assistente.mjs` (ficam aqui porque a ferramenta escreve aqui) |

## Arquivo

[`arquivo/`](arquivo/) guarda o que já cumpriu o papel: a auditoria e a
auditoria de fluxo de agosto, o trabalho com o Antigravity e o "como pôr
numa loja esta semana". Não apague: o histórico explica decisões. Não use
como retrato do produto.

**Regra para documento novo:** se ele descreve o estado atual, a mudança vai
para o `ESTADO-DO-PROJETO.md`; arquivo novo só para assunto novo (como
`ads/`).
