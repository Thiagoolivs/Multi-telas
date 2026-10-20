# IA de conteúdo — trilhas

Gera sugestões de conteúdo para as telas a partir de um briefing. Backend
pronto; a UI ("gerar com IA") entra no editor React depois.

## Endpoint
`POST /api/ai/generate-content` (requer login) · body:
```json
{ "brief": "campanha de segurança, tom firme", "empresa": "Acme", "tema": "dark-premium" }
```
Resposta: `{ "mode": "gemini"|"groq"|"anthropic"|"dev", "items": [ ...itens do config ] }`.
Rate limit: 30/h por conta.

## Layout de composição (editor livre)
`POST /api/ai/generate-composition` (login) · body `{ "brief": "...", "empresa"?, "tema"?, "brand"?: "#hex" }`.
Resposta `{ "mode", "bg": { "kind":"cor", "cor":"#hex" }, "elementos": [ { "tipo":"texto", "text", "x","y","w","h","rot","cor","peso","tamanho","align" } ] }` — a IA monta fundo + blocos de texto posicionados (em %), deixando espaço para a imagem que o usuário insere no editor. Rate limit 30/h.

## Arte do dia comemorativo
`POST /api/ai/generate-seasonal` (login) · body `{ "season": { "label": "Dia do Trabalho", "emoji": "🛠️" }, "empresa"?, "tema"? }`.
Resposta `{ "mode", "items": [...] }` — 1-2 posters temáticos na cor da marca. O cliente descobre a data de hoje pelo `js/seasons.js` (`MTSeasons.todaySeason()`) e passa o `label`/`emoji`. Rate limit 30/h.

## Variações por horário (dayparts)
`POST /api/ai/generate-dayparts` (login) · body `{ "answers": { "objetivo"|"brief", "publico"?, "tom"? }, "empresa"?, "tema"? }`.
Resposta `{ "mode", "items": [...] }` — o mesmo tema em 3 períodos (manhã 05–12 / tarde 12–18 / fim de expediente 18–24), cada item já com `agendamento` de hora. O player mostra só o da janela atual (custo zero). Rate limit 30/h.

## Reescrever para caber (legível à distância)
`POST /api/ai/rewrite` (login) · body `{ "text": "...", "campo": "titulo"|"frase"|"corpo", "tom": "...", "max": number? }`.
Resposta `{ "mode", "text" }`. Encurta/reescreve mantendo o sentido e garante o teto de caracteres (título 42 / frase 90 / corpo 130 por padrão). Rate limit 30/h.

## Provider (agnóstico)
`AI_PROVIDER` força o provider; senão escolhe pela chave presente
(ordem de detecção: gemini → groq → anthropic → dev).
- **gemini** — `GEMINI_API_KEY` (ou `GOOGLE_API_KEY`). Opcional `GEMINI_MODEL`. Como a disponibilidade dos nomes fixos varia por conta ("no longer available"), o código tenta o modelo do env e depois cai por uma lista de candidatos (`gemini-3.6-flash` → `gemini-flash-latest` → `gemini-3.5-flash` → `gemini-2.5-flash` → `gemini-2.0-flash` → `gemini-pro-latest`). Recomendado deixar `GEMINI_MODEL` vazio (usa `gemini-3.6-flash`, GA em 2026) ou apontar para um modelo que sua conta acesse. A resposta é parseada com tolerância (aceita cercas ```json``` e objeto/array). Usa `responseMimeType: application/json` → JSON limpo.
- **groq** — `GROQ_API_KEY` (opcional `GROQ_MODEL`, padrão `llama-3.3-70b-versatile`). API compatível com OpenAI, rápido/barato.
- **anthropic** — `ANTHROPIC_API_KEY` (opcional `ANTHROPIC_MODEL`, padrão `claude-sonnet-5-5`; `ANTHROPIC_MODEL_TETO`, padrão `claude-opus-5-5`).
- **dev** — sem chave: gerador local, para testar o fluxo.

### A camada de motores (server/motores.js)
Toda chamada de texto e visão passa por `motores.chamar({ motor, sistema, fixo, usuario, imagens, maxTokens, json })`:

- **Motor por chamada:** `gemini`, `claude-sonnet`, `claude-opus` ou `groq`. Sem `motor`, vale a regra acima (`AI_PROVIDER` ou a chave presente) — as trilhas prontas continuam no mesmo provedor.
- **Saída:** padrão de 8192 tokens (cabe uma peça em HTML); as trilhas prontas usam 4096.
- **Visão nos três provedores:** `imagens: [{ mime, data }]` (base64).
- **Cache:** o que se repete entre chamadas (a biblioteca-ouro, regras longas) vai em `fixo` e entra **antes** do sistema — no Claude com `cache_control`, no Gemini e no Groq pelo cache implícito de prefixo.
- **Tokens medidos:** cada chamada devolve entrada, saída e cache lido/escrito. A requisição inteira é somada (`motores.medir` no `server.js`) e o `uso_ia` grava modelo, tokens e `custo_medido` (centavos com fração).
- **Preço é configuração:** `MT_PRECOS_IA` (JSON, US$ por milhão de tokens, por motor, ex.: `{"claude-sonnet":{"entrada":3,"saida":15}}`) e `MT_COTACAO_DOLAR` (padrão 5,5). Os padrões do código são referência e **precisam ser conferidos** na página de cada provedor antes do experimento.

### Ligar o Gemini (Railway)
Em Variables adicione `GEMINI_API_KEY=<sua chave>` (opcional `GEMINI_MODEL=gemini-2.0-flash`) e redeploy. Pronto — a geração passa a usar o Gemini.

Imagens ficam para depois; por ora só texto.

## Schema dos itens (subconjunto seguro do player)
- `text`: `titulo`, `corpo`, `align`, `tamanho`, `duracao`
- `announce`: `tipo`, `titulo`, `corpo`, `duracao`

A saída é validada/limitada em `server/ai.js` (`clampItems`) antes de retornar.

## Próximo
- Botão "Gerar com IA" no editor (`/app`) que chama o endpoint e insere os
  itens na zona, já no tema atual.
