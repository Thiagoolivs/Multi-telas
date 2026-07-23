# IA de conteúdo — trilhas

Gera sugestões de conteúdo para as telas a partir de um briefing. Backend
pronto; a UI ("gerar com IA") entra no editor React depois.

## Endpoint
`POST /api/ai/generate-content` (requer login) · body:
```json
{ "brief": "campanha de segurança, tom firme", "empresa": "Acme", "tema": "dark-premium" }
```
Resposta: `{ "mode": "anthropic"|"dev", "items": [ ...itens do config ] }`.
Rate limit: 30/h por conta.

## Provider (agnóstico)
`AI_PROVIDER` força o provider; senão escolhe pela chave presente.
- **groq** — `GROQ_API_KEY` (opcional `GROQ_MODEL`, padrão `llama-3.3-70b-versatile`). API compatível com OpenAI, rápido/barato. Recomendado para texto.
- **anthropic** — `ANTHROPIC_API_KEY` (opcional `ANTHROPIC_MODEL`).
- **dev** — sem chave: gerador local, para testar o fluxo.

Imagens ficam para depois; por ora só texto.

## Schema dos itens (subconjunto seguro do player)
- `text`: `titulo`, `corpo`, `align`, `tamanho`, `duracao`
- `announce`: `tipo`, `titulo`, `corpo`, `duracao`

A saída é validada/limitada em `server/ai.js` (`clampItems`) antes de retornar.

## Próximo
- Botão "Gerar com IA" no editor (`/app`) que chama o endpoint e insere os
  itens na zona, já no tema atual.
