# 8. MVP e roteiro

Regra: **nada complexo antes de provar a necessidade comercial.** Cada etapa
tem critério para seguir — e para parar.

## Etapa 0 — Validar sem código (4–6 semanas)

**O que é:** vender anúncio à mão para os primeiros locais.

- Região: **Centro** (decidido).
- Locais: **clientes da assinatura** das frentes Comércio e Saúde no Centro
  (decidido). Oferta: "cede 1 minuto a cada 5 e recebe parte do que
  vendermos".
- Peça: **feita pela IA do produto** (decidido), no Criar, a partir do
  briefing do anunciante.
- Montar 1 pacote ("Centro: N TVs, 1 cota, 30 dias") e oferecer a 10
  anunciantes locais.
- Operar com o que já existe: o operador entra na conta do local (acesso de
  suporte) e põe a peça agendada na programação; o relatório de exibição
  (CSV) vira a comprovação; cobrança por link avulso do Asaas; repasse por
  Pix com planilha.

**Seguir se:** ≥ 8 locais aceitam ceder tempo **e** ≥ 3 anunciantes pagam
o primeiro mês **e** ≥ 2 renovam o segundo.
**Parar (ou repensar preço/divisão) se:** nenhum anunciante renova, ou os
locais recusam por medo de "poluir" a TV.

## Etapa 1 — MVP essencial (≈ 3–4 semanas de desenvolvimento)

Só o que tira o trabalho manual da etapa 0, para o operador:

| Item | Essencial porque |
|---|---|
| Intervalo comercial no player (camada por cima, como o aviso urgente) | Frequência garantida e anúncio fora da programação do dono |
| Política de anúncio por TV (participa, intervalo, vagas, horário, categorias) | Capacidade definida |
| Local (endereço, tipo, faixa de movimento) | Montar pacote por região |
| Campanha, peça e reserva — criadas pelo **operador** | Sem portal ainda |
| Conferência de vaga na reserva (transação) | Não vender o que não existe |
| Exibições com id da reserva + entrega diária | Comprovação e compensação |
| Relatório da campanha (PDF/link) para o anunciante | É o que ele compra |
| Livro-caixa e extrato de repasse (Pix manual) | Pagar certo |
| Migrations + Postgres em todo lugar (antes das tabelas de dinheiro) | Integridade |

**Critério de aceite da etapa:** uma campanha de 30 dias em 10 TVs roda do
começo ao fim sem o operador editar programação de ninguém; o relatório bate
com a entrega diária; o extrato de repasse soma exatamente o líquido × 40%.

## Etapa 2 — Importante para evoluir

| Item | Depende de |
|---|---|
| Portal do estabelecimento (ativar, aprovar peças, ver receita e repasse) | Etapa 1 |
| Aprovação de peça pelo local (48 h, categorias pré-aprovadas) | Portal do local |
| Cobrança recorrente do anunciante e notas | Etapa 1 |
| Split do Asaas para o repasse | Subconta/KYC dos locais |
| Anti-fraude: lote assinado, cruzamento com sinal de vida, amostragem | Etapa 1 |
| Exclusividade de categoria e separação de concorrentes | Reserva |

**Seguir para a etapa 3 se:** ≥ 50 locais na rede, ocupação ≥ 35% por 3
meses, e pedidos de anunciantes querendo contratar sozinhos.

## Etapa 3 — Avançado, para escala

| Item | Por quê só agora |
|---|---|
| Portal do anunciante com busca/mapa, montar campanha, pagar (modelo híbrido) | Só faz sentido com liquidez |
| Membros (1 usuário em várias empresas) — agências | Pré-requisito do portal do anunciante |
| Estado do canal ao vivo fora da memória + 2 réplicas | Rede de milhares de TVs |
| Planos de mídia por assinatura para anunciantes | Previsibilidade de receita |
| Medição de audiência, integração programática | Volume e outro patamar de produto |

## Dependências

```
Etapa 0 (sem código)
  └─ prova preço e demanda
      └─ Etapa 1: migrations/Postgres → local + política → intervalo no player
                  → campanha/peça/reserva (operador) → exibições por reserva
                  → entrega diária → relatório → livro-caixa/extrato
          └─ Etapa 2: portal do local → aprovação → split → anti-fraude
              └─ Etapa 3: membros → portal do anunciante → escala
```

## O que fazer na segunda-feira

1. Vender a assinatura no Centro até ter 8–10 locais de Comércio e Saúde —
   eles são a oferta da rede.
2. Conversar com 5 anunciantes do Centro com uma proposta de uma
   página (pacote, frequência, preço, relatório de exemplo — o CSV do
   relatório de exibição já serve).
3. Só então abrir a etapa 1.
