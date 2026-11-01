# 3. Inventário publicitário

O problema central: vender tempo de tela **sem vender o que não existe**, e
provar depois que foi entregue.

## O exemplo de referência

Academia com 2 TVs, aberta das 6h às 22h (16 h), cede **30% do tempo**,
inserções de **10 s**, contratos de 30 dias.

- Tempo comercializável por TV por hora: 30% × 3.600 s = **1.080 s**.
- Em inserções de 10 s: **108 por hora por TV**.
- Por dia: 108 × 16 h = 1.728 inserções por TV; o mês tem ~51.800 por TV.

O número cru engana: 108 anúncios por hora seriam um a cada 33 s — a TV
vira um canal de comerciais e o dono desliga. **A capacidade real é limitada
pela tolerância de quem assiste**, não pela conta.

## Modelos comparados

| Modelo | Como vende | Bom | Ruim |
|---|---|---|---|
| Por período (mês) | "Seu anúncio nesta TV por 30 dias" | Simples de vender | Sem frequência, não dá para controlar capacidade |
| Por reproduções | "10.000 exibições" | Mensurável | Entrega depende de a TV estar ligada; difícil prometer prazo |
| Por faixa de horário | "Das 18h às 21h" | O anunciante paga pelo horário bom | Fragmenta o inventário; poucos compram |
| Por dia da semana | "Só sábados" | Idem | Idem |
| Por localização / estabelecimento | "Esta academia" | Claro | Pouco volume por tela |
| Por segmento | "Todas as academias" | Público definido | Precisa de muitas academias |
| Por rede / pacote | "As 20 TVs do Centro" | **É o que o anunciante local compra** | Precisa de concentração |
| Exclusividade de categoria | "Único restaurante na rede" | Preço premium | Bloqueia inventário |

## Recomendação: cota de intervalo comercial

Copiar o que a TV aberta já ensinou ao público: **intervalos**.

- A cada **N minutos** de conteúdo do estabelecimento (padrão: 5), a TV
  roda um **intervalo** de até **X segundos** (padrão: 60 s, ou seja, 20%
  do tempo; o estabelecimento escolhe até 30%).
- O intervalo tem **vagas** de 10 s (60 s = 6 vagas).
- Uma **cota** = uma vaga em todo intervalo, numa TV, durante o horário
  comercializável, por um período (30 dias).
  - Com intervalo a cada 5 min: 12 exibições/hora por cota; ~5.760/mês numa
    TV aberta 16 h.
- Inserções de 15 s ou 20 s ocupam 2 vagas.
- **Pacote** = N cotas em M telas (ex.: "Centro: 12 TVs, 1 cota cada").

Por que este modelo:

1. **Capacidade é aritmética simples:** vagas por intervalo × telas.
   Vender a 7ª cota numa TV de 6 vagas é impossível por construção.
2. **Frequência é garantida por desenho**, não estatisticamente: cada cota
   aparece em todo intervalo.
3. **Fácil de explicar** ao dono ("a cada 5 minutos, 1 minuto de
   anúncios") e ao anunciante ("seu anúncio passa 12 vezes por hora em cada
   TV").
4. **Encaixa no player atual** (ver [05-arquitetura.md](05-arquitetura.md)):
   o intervalo é uma camada por cima da programação, como o "aviso urgente"
   que já existe.
5. Faixa de horário, dia da semana e exclusividade viram **atributos** da
   cota (com preço próprio), não modelos diferentes.

## Regras de inventário

- **Horário comercializável** = horário de funcionamento da TV
  (`expediente`, que já existe) ∩ horário que o estabelecimento cede.
- **Capacidade por TV** = vagas por intervalo (do estabelecimento) — limite
  da plataforma: no máximo 30% do tempo e 8 vagas por intervalo.
- **Reserva**: uma cota reserva **1 vaga numa TV num período** (data início,
  data fim). Conflito = a soma de vagas reservadas da TV no período passar da
  capacidade.
- **Concorrência entre reservas**: reservar é uma transação que confere e
  grava junto (bloqueio da linha da TV no Postgres, `SELECT … FOR UPDATE`).
  Proposta enviada segura a vaga por 48 h; não paga, solta.
- **Exclusividade de categoria**: no máximo 1 cota por categoria por TV no
  mesmo período (opcional, com preço maior).
- **Separação**: o mesmo anunciante nunca em duas vagas seguidas; dois
  concorrentes diretos nunca no mesmo intervalo.
- **Prioridade**: só existe entre cotas e conteúdo de preenchimento (vagas
  não vendidas são devolvidas ao conteúdo do estabelecimento — o intervalo
  encolhe, não fica um "espaço vazio").

## Entrega e compensação

- **Esperado** por cota por dia = intervalos no horário comercializável
  (com a TV no ar).
- **Entregue** = exibições comprovadas pela TV (proof-of-play com o id da
  reserva).
- **Entrega mínima**: 90% do esperado no período. Abaixo disso:
  1. **compensação em exibições** (o sistema estende a cota pelos dias
     necessários, se houver vaga);
  2. não havendo vaga, **crédito** proporcional no próximo período.
- TV fora do ar por culpa do estabelecimento reduz o repasse dele na mesma
  proporção.

## Alternativas consideradas e por que não agora

- **Leilão em tempo real / programática**: precisa de volume, de medição de
  audiência e de integração com plataformas de mídia. Muito antes do tempo.
- **Rodízio ponderado sem intervalo** (pôr os anúncios na playlist com
  peso): é o que o player já faz, mas a frequência vira estatística, a
  capacidade fica indefinida e o anúncio briga com o conteúdo do dono.
- **Zona exclusiva de anúncio** (ex.: a lateral da tela sempre comercial):
  boa como produto complementar ("faixa patrocinada"), ruim como principal —
  zona pequena vale pouco e polui o layout.
