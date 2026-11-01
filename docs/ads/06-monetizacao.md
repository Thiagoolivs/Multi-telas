# 6. Monetização e cenários

**Não são projeções de faturamento.** São contas com premissas explícitas,
para saber a partir de que tamanho o negócio se paga e quais números
precisam ser validados primeiro.

## Fontes de receita

| Fonte | Começa | Comentário |
|---|---|---|
| Assinatura SaaS (já existe) | Já | R$ 149 por tela/mês no Essencial. É o que traz os estabelecimentos |
| Comissão sobre campanhas | Fase 1 | A parte da plataforma na divisão (60% do líquido, proposta) |
| Produção de peças | Fase 1 | Peça sob medida cobrada à parte (ex.: R$ 150–300); a básica pela IA vai no pacote |
| Pacotes de mídia regional | Fase 1 | É a própria forma de vender (Centro, Zona Sul, Academias…) |
| Exclusividade de categoria | Fase 2 | +30–50% sobre a cota |
| Planos para anunciante (assinatura de mídia) | Fase 3 | Mensalidade fixa com X cotas rotativas na rede; previsível para os dois lados |

## Premissas dos cenários

| Premissa | Valor | De onde vem / o que validar |
|---|---|---|
| TVs por estabelecimento | 2 | Média de academia/restaurante pequeno |
| Vagas por intervalo (cotas por TV) | 6 | 1 minuto a cada 5 (20% do tempo) — ver [03-inventario.md](03-inventario.md) |
| Preço da cota (por TV, por mês) | R$ 40 / 60 / 90 | **Hipótese** — validar com 5 anunciantes antes de tudo |
| Ocupação do inventário | 20% / 40% / 60% | Rede nova raramente passa de 40% no primeiro ano |
| Taxa de pagamento | 3% | Média Pix/boleto/cartão no Asaas |
| Impostos sobre o bruto | 8% | Hipótese (Simples + ISS); **validar com contador** |
| Divisão | 60% plataforma / 40% estabelecimento, sobre o líquido | Proposta do [02](02-modelo-de-negocio.md) |

Capacidade = estabelecimentos × 2 TVs × 6 cotas.

## Cenário base (40% de ocupação, R$ 60 por cota)

| Estabelecimentos | Cotas vendidas/mês | Bruto/mês | Líquido | Plataforma (60%) | Repasses (40%) | Repasse médio por local |
|---|---|---|---|---|---|---|
| 10 | 48 | R$ 2.880 | R$ 2.563 | R$ 1.538 | R$ 1.025 | R$ 103 |
| 30 | 144 | R$ 8.640 | R$ 7.690 | R$ 4.614 | R$ 3.076 | R$ 103 |
| 100 | 480 | R$ 28.800 | R$ 25.632 | R$ 15.379 | R$ 10.253 | R$ 103 |
| 500 | 2.400 | R$ 144.000 | R$ 128.160 | R$ 76.896 | R$ 51.264 | R$ 103 |

## Conservador (20%, R$ 40) e otimista (60%, R$ 90)

| Estabelecimentos | Plataforma/mês (conservador) | Repasse por local | Plataforma/mês (otimista) | Repasse por local |
|---|---|---|---|---|
| 10 | R$ 513 | R$ 34 | R$ 3.460 | R$ 231 |
| 30 | R$ 1.538 | R$ 34 | R$ 10.381 | R$ 231 |
| 100 | R$ 5.126 | R$ 34 | R$ 34.603 | R$ 231 |
| 500 | R$ 25.632 | R$ 34 | R$ 173.016 | R$ 231 |

## Custos operacionais (hipótese)

| Tamanho | Quem opera | Custo/mês | Plataforma no cenário base | Sobra |
|---|---|---|---|---|
| 10 | O dono vende e opera | tempo do dono | R$ 1.538 | não paga o tempo |
| 30 | O dono + produção pela IA | tempo do dono | R$ 4.614 | começa a pagar o tempo |
| 100 | 1 vendedor (R$ 3.500 + 10% das vendas) + operação/suporte meio período (R$ 2.500) | ~R$ 8.900 | R$ 15.379 | ~R$ 6.500 |
| 500 | 3 vendedores + 2 operação + produção + infraestrutura com 2 réplicas | ~R$ 38.000 | R$ 76.896 | ~R$ 39.000 |

## O que os números dizem

1. **Abaixo de ~50 estabelecimentos concentrados, o Ads não paga quem vende.**
   Ele pode existir como argumento de venda do SaaS, não como negócio.
2. **O repasse por local é pequeno** no cenário base (~R$ 100/mês, um terço
   da assinatura de 2 TVs). É argumento ("sua TV paga um terço da
   assinatura"), mas não é renda que faça alguém entrar na rede sozinho. Se
   o recrutamento travar, rever a divisão (50/50) ou oferecer TV e software
   por conta da rede em troca do inventário (modelo de rede própria).
3. **O preço da cota e a ocupação mandam em tudo:** do conservador ao
   otimista a receita muda 7 vezes. Validar preço com anunciantes reais é o
   primeiro passo, antes de qualquer linha de código.
4. **SaaS + Ads juntos** é a conta que fecha: 100 estabelecimentos com 2 TVs
   no Essencial são ~R$ 29.800/mês de assinatura, mais ~R$ 15.000 de Ads no
   cenário base.
