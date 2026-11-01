# 2. Modelo de negócio

## O ponto de partida honesto

- **Hoje não há estabelecimento pagante.** O Ads é um mercado de dois lados
  (telas e anunciantes) e começa sem nenhum dos dois.
- Anunciante local não compra "uma TV numa academia": compra **um bairro,
  um público, uma frequência**. Com poucas telas espalhadas, não há o que
  vender.
- Por isso a recomendação inteira deste documento é: **validar vendendo à
  mão antes de construir marketplace**.

## As três opções

| | A. Marketplace aberto | B. Intermediado | C. Híbrido |
|---|---|---|---|
| Como funciona | Anunciante entra, escolhe telas, paga | A equipe vende e opera as campanhas | Os dois caminhos |
| Precisa de | Muitas telas (liquidez), preço publicado, checkout, aprovação automática, peça pronta | Poucas telas concentradas, um vendedor, planilha | Tudo de A e de B |
| Custo de construir | Alto (portal, busca, mapa, checkout, split, aprovação, relatórios) | Baixo (operador + relatório que já existe) | O mais alto |
| Risco | Anunciante entra, não acha nada e não volta | Depende de alguém vendendo | Dispersão |
| Quando faz sentido | Centenas de telas numa cidade, preço conhecido | **Agora** | Depois de B provar preço e demanda |

**Recomendação: B (intermediado) para começar**, com o roteiro já desenhado
para virar C quando houver liquidez. Motivos:

1. **Liquidez:** com 10–30 estabelecimentos, uma busca por mapa mostraria
   quase nada. Um vendedor monta o pacote ("as 12 TVs do Centro") e vende.
2. **Preço desconhecido:** ninguém sabe quanto vale uma cota numa academia de
   bairro. O vendedor descobre em conversas; o portal teria que chutar.
3. **Peça:** o pequeno anunciante não tem vídeo de 10 s. A equipe (com a IA
   do produto) produz — e isso é receita também.
4. **Aprovação e categoria:** a academia não quer anúncio de lanchonete
   gordurosa; o restaurante não quer o concorrente. Um humano resolve na
   conversa até as regras estarem claras para virar sistema.

## As perguntas do modelo

**Quem comercializa?** O Multi Telas (hoje, o dono). O estabelecimento não
vende: ele cede tempo e aprova categorias.

**Quem define o preço?** O Multi Telas, por pacote. O estabelecimento define
quanto tempo cede e o que não aceita; não negocia preço caso a caso (isso
mataria a venda de pacotes de rede). Mais tarde, um fator por estabelecimento
(movimento, público) entra no preço da cota.

**Como se calcula o valor de uma tela?** Proposta inicial, simples e
explicável ao anunciante:

```
preço da cota = preço base do pacote × fator do local
fator do local = movimento estimado (pessoas/dia) × tempo de permanência
```

Academia e sala de espera (permanência longa) valem mais que loja de
passagem. Começar com 3 faixas (A, B, C), não com fórmula.

**Como se divide a receita?** Ponto de partida **60% plataforma / 40%
estabelecimento** sobre o valor líquido (depois de taxa de pagamento e
impostos). A plataforma fica com mais porque vende, produz, opera e
responde pela entrega. Referência de mercado de mídia indoor: o local fica
entre 20% e 50%; abaixo de 30% o repasse fica pequeno demais para o
estabelecimento se importar (ver os números em
[06-monetizacao.md](06-monetizacao.md)).

**Comissão da plataforma?** É a parte acima (60%). Não cobrar
"taxa de plataforma" separada do anunciante no começo: complica a venda.

**Pagamentos.** Anunciante paga ao Multi Telas por Pix, boleto ou cartão
(Asaas, que já está integrado), **adiantado por mês** (mídia vende
pré-pago). Contrato de 1, 3 ou 6 meses, com desconto nos mais longos.

**Peças publicitárias.** Três caminhos, nesta ordem de preferência:
1. o anunciante manda a peça (imagem ou vídeo de 10–15 s, 16:9) e a
   plataforma confere formato e regras;
2. a plataforma produz com a IA do produto (incluso no pacote básico, 1 peça
   por mês);
3. produção sob medida, cobrada à parte (receita extra).

**Aprovação.** Duas camadas: (1) a plataforma confere a peça contra regras
gerais (lei, categorias proibidas, legibilidade); (2) **o estabelecimento
pode vetar** por categoria (definida antes) ou caso a caso em até 48 h — sem
resposta, vale a aprovação por categoria.

**Cancelamento e inadimplência.**
- Pré-pago: não pagou, a campanha não começa; não renovou, ela para no fim
  do período.
- Cancelamento pelo anunciante no meio do mês: sem devolução do mês corrente.
- Falha de exibição nossa (TV fora do ar, entrega abaixo do contratado):
  **compensação em exibições** (dias a mais) e, se não der, crédito.
- Estabelecimento que tira a TV do ar ou sai da rede: aviso com 30 dias; as
  campanhas ativas migram para outras telas do mesmo pacote.

**Repasse aos estabelecimentos (decidido: em dinheiro).**
- Mensal, até o dia 10 do mês seguinte, sobre o que foi **pago e exibido**
  (não sobre o vendido).
- Valor proporcional à entrega de cada tela (exibições comprovadas ÷
  contratadas).
- Começo: Pix manual a partir de um extrato gerado pelo sistema. Depois:
  **split do Asaas** (cada estabelecimento com subconta/carteira; o Asaas
  divide na hora do pagamento) — mas o split paga na entrada, não na
  entrega, então o desconto por falha de exibição vira ajuste no mês
  seguinte.

## Questões fiscais e contratuais (validar com contador e advogado)

- Inserção de publicidade é serviço tributado por **ISS** (item 17.25 da lista
  da LC 116/2003, incluído pela LC 157/2016). Quem emite a nota ao
  anunciante é o Multi Telas, pelo valor cheio.
- O repasse ao estabelecimento precisa de documento: nota do estabelecimento
  (se for empresa, o normal) contra o Multi Telas. Sem isso, o Multi Telas
  paga imposto sobre 100% e repassa sem abater.
- Contrato com o estabelecimento: cessão de tempo de tela, percentual,
  categorias vetadas, prazo de aviso para sair, quem responde pelo
  conteúdo.
- Contrato com o anunciante: período, telas, frequência garantida,
  compensação, responsabilidade pelo conteúdo (o anunciante responde pelo
  que anuncia).
- Termos de uso e política de privacidade do produto precisam citar a nova
  atividade (hoje não citam).

## Recomendação

Modelo **intermediado**, pré-pago, preço por pacote definido pela
plataforma, 60/40 sobre o líquido, repasse mensal em dinheiro sobre o
exibido. Validar com 5–10 estabelecimentos numa mesma região e 3 anunciantes
antes de escrever o portal.
