# Multi Telas Ads — planejamento

Estudo de uma nova linha de negócio: vender tempo de exibição nas TVs de
estabelecimentos (academias, restaurantes, clínicas…) para anunciantes
locais, com o Multi Telas operando a rede.

**Estado: proposta.** Nada aqui foi implementado. A regra de produto do QA
de 26/10 vale também para o Ads: *recurso novo só entra se tirar outro ou se
um cliente pagante pediu* — por isso o roteiro começa sem código.

## Leitura em ordem

| # | Documento | O que responde |
|---|---|---|
| 1 | [Auditoria do sistema](01-auditoria.md) | O que já existe e serve, o que adaptar, o que construir, riscos técnicos |
| 2 | [Modelo de negócio](02-modelo-de-negocio.md) | Aberto, intermediado ou híbrido; quem vende, quem define preço, repasse |
| 3 | [Inventário publicitário](03-inventario.md) | Como vender tempo de tela sem vender o que não existe |
| 4 | [Experiência](04-experiencia.md) | Portal do estabelecimento, do anunciante e da administração |
| 5 | [Arquitetura técnica](05-arquitetura.md) | Como encaixar no produto atual, entidades, segurança |
| 6 | [Monetização e cenários](06-monetizacao.md) | Simulações com 10, 30, 100 e 500 estabelecimentos |
| 7 | [Riscos e viabilidade](07-riscos.md) | O que pode inviabilizar o negócio |
| 8 | [MVP e roteiro](08-mvp-e-roteiro.md) | O que fazer primeiro, critérios para seguir ou parar |

## Decisões

| Tema | Decisão | Quem / quando |
|---|---|---|
| Base de clientes hoje | Nenhum pagante ainda; alguns encaminhados | Dono, 01/11 |
| Estabelecimento recebe | **Repasse em dinheiro** (não desconto na mensalidade) | Dono, 01/11 |
| Quem vende anúncio | O dono, por enquanto; marketing contratado depois | Dono, 01/11 |
| Modelo para começar | **Intermediado** (a equipe vende e opera) — recomendado | A confirmar |
| Unidade de venda | **Cota de intervalo comercial** por tela e período — recomendado | A confirmar |
| Divisão da receita | Ponto de partida 60% plataforma / 40% estabelecimento — recomendado | A confirmar |

## Perguntas em aberto (as que mudam o plano)

1. Os primeiros estabelecimentos serão clientes do SaaS (que já pagam a
   assinatura) ou locais recrutados só para a rede, com TV e software por
   nossa conta?
2. Qual cidade/bairro concentra a rede? Anunciante local compra *bairro*,
   não tela solta.
3. Quem produz a peça do anunciante que não tem uma: a IA do produto, a
   equipe, ou o anunciante paga à parte?
4. Os cenários de preço (R$ 40–90 por cota/tela/mês) batem com o que os
   anunciantes que você conhece pagariam? Uma conversa com 5 deles vale mais
   que qualquer planilha.
