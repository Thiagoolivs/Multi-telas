# 4. Experiência dos usuários

Três ambientes, **no mesmo painel** (não três produtos): o que aparece
depende do tipo da conta e do papel da pessoa.

## Portal do estabelecimento

Mora dentro do painel atual, como um grupo novo no menu: **Ganhar com a TV**
(só aparece para quem ativa).

Fluxo de ativação (uma vez):

```
Início › cartão "Sua TV pode pagar a assinatura"
  → Ganhar com a TV › Ativar
    1. Onde fica (endereço, tipo de local, movimento por dia — faixas)
    2. Quais TVs aceitam anúncio (lista das telas, liga/desliga)
    3. Quanto tempo ceder (intervalo a cada 5/10 min, 30 s a 90 s)
       — prévia: "a cada 5 minutos, 1 minuto de anúncios"
    4. O que NÃO aceita (categorias: concorrentes, bebida alcoólica, …)
    5. Dados para o repasse (CNPJ/CPF, chave Pix) e aceite do contrato
```

Telas principais:

| Tela | O que mostra |
|---|---|
| **Resumo** | Receita do mês até agora, próximo repasse e data, campanhas no ar, % de entrega das suas TVs |
| **Campanhas** | Pendentes de aprovação (com a peça, aprovar/vetar), no ar, encerradas |
| **Exibições** | Por TV e por campanha (o relatório de exibição, filtrado) |
| **Repasses** | Extrato mês a mês, nota a emitir, comprovante do Pix |
| **Ajustes** | Tempo cedido, categorias vetadas, TVs que participam, sair da rede |

Regra de ouro: o dono nunca precisa entender "cota" ou "vaga". Ele vê
"quanto tempo cedi", "o que está passando" e "quanto vou receber".

## Portal do anunciante

No começo (modelo intermediado) o anunciante **não tem login**: recebe a
proposta, paga pelo link do Asaas e recebe o relatório por e-mail/WhatsApp.
O portal entra quando houver volume (fase 3 do roteiro).

Quando entrar:

```
Cadastro (empresa, CNPJ, segmento)
  → Montar campanha
    1. Onde: mapa/lista de pacotes por região e tipo de local
    2. Quando: período (30/90/180 dias), faixas e dias (opcional)
    3. Quanto: cotas por tela → preço total, exibições estimadas por dia
    4. Peça: enviar imagem/vídeo, ou "criar com a IA" (o Criar do produto)
    5. Pagar (Pix/boleto/cartão)
  → Acompanhar: exibições por dia e por local, fotos/estado das TVs
  → Relatório final (PDF) e renovar
```

| Tela | O que mostra |
|---|---|
| **Campanhas** | No ar, aguardando aprovação, aguardando pagamento, encerradas |
| **Campanha** | Entrega do dia/semana vs. contratado, por local; peças |
| **Relatório** | Exibições, horas no ar, locais, compensações aplicadas |
| **Faturas** | Pagas, a pagar, notas fiscais |

## Administração Multi Telas

Dentro do painel da plataforma que já existe (`/app`, seção de quem opera),
uma área **Rede de anúncios**:

| Tela | O que faz |
|---|---|
| **Estabelecimentos** | Ativos na rede, aguardando aprovação, TVs, entrega média, categorias vetadas |
| **Anunciantes** | Cadastro, segmento, campanhas, situação de pagamento |
| **Inventário** | Mapa de ocupação: por região/pacote/TV, vagas livres por período |
| **Propostas e campanhas** | Montar proposta (escolher pacote, período, cotas → preço), mandar link, acompanhar aprovação do estabelecimento e pagamento |
| **Peças** | Fila de revisão (formato, legibilidade, regras), produção pela IA |
| **Entrega** | Campanhas abaixo de 90%, TVs fora do ar com campanha, compensações |
| **Financeiro** | Recebido, a repassar por estabelecimento, repasses feitos, comissão |
| **Configurações** | Divisão de receita, preços base por pacote, categorias, regras |

Indicadores do topo: receita do mês, ocupação do inventário (%), entrega
média (%), TVs com campanha fora do ar, repasses pendentes.

## Fluxo de uma venda (modelo intermediado)

```
Vendedor (admin) monta proposta: "Centro, 12 TVs, 1 cota, 30 dias"
  → sistema confere vagas e segura por 48 h
  → anunciante recebe link: proposta + pagamento
  → pagou → peça entra na fila de revisão
  → revisada → estabelecimentos recebem para aprovar (48 h; categoria pré-aprovada vale)
  → no ar na data → TV conta exibições com o id da reserva
  → diário: entrega vs. esperado; abaixo de 90% → alerta e compensação
  → fim: relatório ao anunciante, extrato de repasse aos estabelecimentos
```
