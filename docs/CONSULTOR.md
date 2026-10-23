# Falar com o consultor

O consultor é um Claude no PC do dono, de plantão na issue
[#135](https://github.com/Thiagoolivs/Multi-telas/issues/135). Ele lê a
issue a cada minuto. A fila de trabalho continua no
[`EXECUTOR.md`](EXECUTOR.md): este arquivo só diz como conversar com ele.

## Como chamar

```bash
gh issue comment 135 --body "@consultor <assunto>: <pergunta ou pedido>"
```

- **Sempre com `@consultor`.** Sem isso, ele não é chamado.
- **Um assunto por comentário**, com o número do item e do PR.
- **Diga o que você quer de volta:** "sim ou não", "qual das duas",
  "confirme no ar".
- **Não espere parado.** Chamou, siga para o próximo item. A resposta chega
  em poucos minutos, começando com `[consultor]`.
- **Leia as respostas** com `gh issue view 135 --comments` ao começar cada
  item e antes de cada merge.

Modelos:

```
@consultor testar no ar: item D41, PR #210. Confira /apk/versao.json (200, sha256 bate).
@consultor infra: o item 12 precisa de ffmpeg no servidor. Pode pôr?
@consultor revisar: PR #201 mexe em server/cobranca.js. Pode olhar antes do merge?
@consultor dúvida: o selo de atraso vai no canto ou no rodapé?
```

## O que o consultor pode fazer por você

O dono deu acesso a ele para resolver os bloqueios enquanto dorme.

- **Railway:** ver deploy e log, destravar build, refazer deploy, conferir
  e ajustar variável que não é segredo. Você continua sem mexer no Railway:
  peça a ele.
- **Cloudflare:** DNS e domínio.
- **GitHub:** revisar o diff de PR sensível (segurança, cobrança, banco,
  TV) contra o "O que não pode regredir" do `EXECUTOR.md`, e acrescentar
  itens aprovados do PLANO à sua fila quando ela acabar.
- **Asaas:** só olhar (cobrança, webhook, status). Não move dinheiro.
- **Testar no ar** em `https://app.multitelas.net.br`, só o que não pede
  login: arquivos, rotas públicas, páginas.

## O que ele não faz

- Não escreve código de produto: mexe só em `docs/`.
- Não escreve nem digita segredo (chave, senha, token) em lugar nenhum. Se
  precisar de uma variável secreta nova, ele anota para o dono.
- Não cria conta nem entra com senha em produção.
- Não move dinheiro nem apaga serviço, banco ou volume.
- Não decide produto, gasto, contrato ou preço: anota para o dono e responde
  "fica com o dono". Nesse caso, faça a parte sem a decisão e siga.

## Pendente com o dono

Não pergunte de novo; quando decidir, o consultor avisa na issue.

- Multa do anual.
- ffmpeg no servidor (item 12, converter vídeo).
- Bucket e chave do backup; leitura do bucket pelo painel.
- `WHATSAPP_NUMERO` (alerta e botão de WhatsApp).
- Foto real de TV instalada; autorização da ótica.
- Checkout anual (espera o advogado).
