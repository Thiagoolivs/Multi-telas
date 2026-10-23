# Roteiro do testador

Você é o segundo PC. O executor (outro Claude) implementa a fila do
[`EXECUTOR.md`](EXECUTOR.md) §2f, um PR por item, e faz o merge — o
Railway publica sozinho. Você testa **em produção**, como um cliente
testaria, e conta o que viu na **issue de testes,
[#198](https://github.com/Thiagoolivs/Multi-telas/issues/198)**. Você nunca mexe em
código nem faz merge.

## Antes de começar

- Painel: `https://app.multitelas.net.br/app` · TV: `https://tv.multitelas.net.br`.
- Use **duas contas de teste suas**, criadas pelo cadastro normal: uma de
  **empresa** (ex.: uma metalúrgica, com RH e avisos) e uma de
  **comércio** (ex.: uma padaria). Nunca use conta de cliente.
- Abra a TV numa aba do navegador (ou num box) e pareie com cada conta.
- Guarde as senhas onde o dono indicar. Nunca escreva senha, chave ou
  token na issue.

## O ciclo

1. Leia a issue de testes a cada ~5 minutos.
2. Quando aparecer `[executor] D<n> no ar, PR #X — testar: …`, espere o
   deploy (o rodapé do painel ou a TV recarregada mostram a versão nova),
   siga o roteiro do executor e o "Pronto quando" do item no
   `EXECUTOR.md`.
3. Teste no computador e no celular (360 px), nos dois temas, e olhe a TV.
4. Responda na issue com uma linha de cabeçalho e, se precisar, os
   detalhes:
   - `[testador] D<n> ✅` — funcionou como o item promete.
   - `[testador] D<n> 🔴 <resumo>` — **bloqueia**: quebrou algo, perdeu
     dado, a TV ficou errada, ou o item não faz o que promete. O executor
     para e conserta antes do próximo item.
   - `[testador] D<n> 🟡 <resumo>` — defeito menor; entra no fim da fase.
   - `[testador] ⚪ <ideia>` — sugestão para o dono decidir.
5. Todo 🔴 e 🟡 tem: **passos** (o que você tocou, em ordem), **esperado**,
   **visto** e um **print** (anexe na issue).

## No fim de cada fase

Refaça o caminho inteiro nas duas contas, no computador e no celular:
cadastro → Marca (logo e cores) → Criar uma peça → pôr na TV → um aviso →
aniversariantes → mural → Programação → Campanhas → Plano. Anote tudo o
que confundir: a régua do dono é **facilidade** — "tirar coisas que
confundam o usuário".

## O que olhar sempre

- A TV nunca fica preta sem motivo, nunca mostra texto de exemplo de outra
  empresa, nunca mostra o pedido da zona como texto.
- Nada some sem aviso; erro diz o que fazer.
- O que o painel diz que está na TV está mesmo na TV.
- Português de lojista: sem "player", "dispositivo", "frota", "token".
