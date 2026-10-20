# Canal beta

Regra do PLANO (§10 e §11): **nada chega à tela de um cliente sem 72 h no
box beta**. O canal é por ENDEREÇO, não por código: dois serviços no
Railway, o mesmo banco, a mesma mídia.

| Serviço | Branch | Quem usa |
|---|---|---|
| `Multi-telas` (produção) — `app.` e `tv.multitelas.net.br` | `estavel` | os clientes |
| `beta` — endereço próprio | `main` | o box do dono (bancada de teste) |

Todo PR entra no `main` e vai para o beta na hora. Depois de 72 h rodando no
box do dono sem problema, o `main` passa para o `estavel`:

```
git push origin main:estavel
```

e a produção publica sozinha.

## Montar (uma vez)

1. Criar a branch `estavel` no commit que está em produção hoje.
2. Serviço `Multi-telas`: trocar a branch de deploy de `main` para `estavel`.
3. Serviço novo `beta`, do mesmo repositório, branch `main`, com as MESMAS
   variáveis da produção (referência `${{Multi-telas.NOME}}`) e um domínio
   próprio (o `*.up.railway.app` serve; `beta.multitelas.net.br` se quiser).
4. No box do dono: no app, o diálogo de endereço aponta para o domínio do
   beta. O painel do beta é o mesmo, em `/app`, com o mesmo login.

## O que muda para quem desenvolve

- **Banco compartilhado:** o beta roda código novo contra o banco de
  produção. Mudança de banco só ACRESCENTA (coluna, tabela) — nunca
  renomeia nem apaga. O estável continua lendo o que conhece.
- **Comando remoto** (recarregar, print) para o box beta sai pelo painel do
  beta: cada servidor só fala com as TVs ligadas a ele, até termos Redis
  (PLANO §9).
- **Peça com token novo** (ex.: `--mt-escala-titulo`): só vai para cliente
  depois que o player dele tiver o `js/tokens.js` novo — o canal resolve
  isso sozinho, porque peça e player sobem juntos para o estável.
