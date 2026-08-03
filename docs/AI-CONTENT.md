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
