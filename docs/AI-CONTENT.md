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
- **gemini** — `GEMINI_API_KEY` (ou `GOOGLE_API_KEY`). Opcional `GEMINI_MODEL`, padrão **`gemini-2.5-flash`** (rápido/barato, ótimo para copy). Use `gemini-2.5-pro` para máxima qualidade. Usa `responseMimeType: application/json` → JSON limpo.
- **groq** — `GROQ_API_KEY` (opcional `GROQ_MODEL`, padrão `llama-3.3-70b-versatile`). API compatível com OpenAI, rápido/barato.
- **anthropic** — `ANTHROPIC_API_KEY` (opcional `ANTHROPIC_MODEL`).
- **dev** — sem chave: gerador local, para testar o fluxo.

### Ligar o Gemini (Railway)
Em Variables adicione `GEMINI_API_KEY=<sua chave>` (opcional `GEMINI_MODEL=gemini-2.5-flash`) e redeploy. Pronto — a geração passa a usar o Gemini.

Imagens ficam para depois; por ora só texto.

## Schema dos itens (subconjunto seguro do player)
- `text`: `titulo`, `corpo`, `align`, `tamanho`, `duracao`
- `announce`: `tipo`, `titulo`, `corpo`, `duracao`

A saída é validada/limitada em `server/ai.js` (`clampItems`) antes de retornar.

## Próximo
- Botão "Gerar com IA" no editor (`/app`) que chama o endpoint e insere os
  itens na zona, já no tema atual.
