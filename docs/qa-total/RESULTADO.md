# QA total: resultado

05/11/2026, servidor local, com a IA real nos blocos 2 e 3. Esta régua é
mais dura que a do QA de 03/11 ([docs/qa/RETESTE.md](../qa/RETESTE.md)):
ela compara com o nível profissional ([REFERENCIAS.md](REFERENCIAS.md)) e com
as [telas de referência](telas-referencia/), e não só com "funciona".

## O reteste 2 (09/11)

Os mesmos blocos, o mesmo método e a mesma régua, depois de tudo o que
entrou de 05 a 07/11 (contraste da TV, cabeçalhos, piso do balcão com borda,
paletas e climas, espaços de foto, a Primeira TV, a Biblioteca em 2 níveis,
aprovação e permissão por loja, planilhas, senha, modo ambiente, lotes 3 e
4, "Arrumar a volta"). Servidor local, sem a IA real. Relatório completo:
[RETESTE-2](RETESTE-2.md).

| Bloco | 05/11 (fase 10) | 09/11 |
|---|---|---|
| 1. A TV | 6,5 | **7,0** |
| 2. Criações da IA | 6,3 | — (precisa da IA real; fica 6,3) |
| 3. Programação | 8,0 nos 7 cenários sem IA | **8,3** nos mesmos 7 (o bloco, com a IA antiga: 7,0) |
| 4. Telas e a página da TV | 8,5 | **8,5** |
| 5. O resto do painel | 7,5 | **8,0** |
| 6. Site e e-mails | 8 | **8,5** |
| 7. A base | 8,5 | **8,5** |
| 8. A interface do painel | 6,7 | **7,7** |

**Nota geral provisória: 7,5 / 10** (era 7,1), com o mesmo peso dobrado
para a TV, a IA, a programação e a interface.

**Nenhum bloco chegou a 9, e não há bloqueador** (nenhuma quebra,
vazamento ou falha de segurança). O que mais segura:
- 90 de 91 telas e 55 de 98 peças esperam a sua aprovação na galeria;
- o `cabecalho-centro` corta a data e os acentos em 13 telas, e o combo
  põe texto sobre texto na TV quadrada;
- peça com espaço de foto e sem foto fica pela metade;
- a prévia das Aprovações vem vazia e o "Ver agora" de Telas ainda é desenho;
- a Primeira TV passou a 16 toques (meta 15) com o Trocar foto, e o robô
  dos 5 minutos quebrou nesse commit;
- a volta longa aparece como "tudo certo · 1 dica", e a IA vai ao ar sem o
  "Quando";
- Prontos para você leva 7,4 s no 4G lento, e mostra "Outubro Rosa" em
  novembro e um parcelado para clínica.

## O reteste (fase 10, 05/11)

Os mesmos blocos, com o mesmo método e a mesma régua, depois das fases 0 a 9.
Servidor local, robô e TVs de verdade no navegador. A IA real ficou de fora:
a chave do Gemini respondeu 402 (créditos esgotados).

| Bloco | Antes | Agora | Relatório |
|---|---|---|---|
| 1. A TV | 4,5 | **6,5** | [RETESTE-BLOCO-1](RETESTE-BLOCO-1.md) |
| 2. Criações da IA | 6,3 | — | Precisa da IA real |
| 3. Programação | 5,9 | **8,0** nos 7 cenários sem IA (eram 6,3) | [RETESTE-BLOCO-3](RETESTE-BLOCO-3.md) |
| 4. Telas e a página da TV | 7 | **8,5** | [RETESTE-BLOCO-4-7](RETESTE-BLOCO-4-7.md) |
| 5. O resto do painel | 7 | **7,5** | [RETESTE-BLOCO-4-7](RETESTE-BLOCO-4-7.md) |
| 6. Site e e-mails | 8 | **8** | [RETESTE-BLOCO-4-7](RETESTE-BLOCO-4-7.md) |
| 7. A base | 8 | **8,5** | [RETESTE-BLOCO-4-7](RETESTE-BLOCO-4-7.md) |
| 8. A interface do painel | 5,5 | **6,7** | [RETESTE-BLOCO-8](RETESTE-BLOCO-8.md) |

**Nota geral provisória: 7,1 / 10** (era 6,2), com o mesmo peso dobrado para a
TV, a IA, a programação e a interface. No bloco 2 entra a nota antiga. No 3,
os 7 cenários medidos e a nota antiga dos 5 que dependem da IA.

**Nenhum bloco chegou a 9.** O que falta em cada um está no plano, na
[fase 10](PLANO-DE-ACAO.md#fase-10-reteste-completo-e-lançamento-para-pilotos-2-dias).

**Corrigido já, com o que o reteste achou:**
- A TV quadrada desenhava toda peça a 56% do piso, porque era tratada como 16:9 (`js/render.js`). A bancada não via isso, porque desenhava a tela quadrada em 1920×1080 (`js/bancada.js`).
- 12 textos do cliente eram apagados nas telas prontas, porque os ids das marcas de exemplo são palavras comuns, como "dentista" e "clinica".
- O pacote do dentista anunciava preço parcelado, e o código de ética do CFO não permite.
- O axe com uma campanha no ar acusava 8 falhas: o título fora de ordem e o selo "rodando" sem contraste.
- "Pôr pra rodar" virou "Pôr na TV", "Trocar agora" virou "Abrir a TV", e o "Mídias" que tinha sobrado na Marca saiu.
- A Agenda não repete mais o mesmo nome em cada célula.

## As notas do QA original (05/11)

| Bloco | Nota | Em uma frase | Relatório |
|---|---|---|---|
| 1. A TV | **4,5** | Funciona muito bem, mas a letra é pequena em todo lugar, a zona só encolhe e a marca não entra sozinha | [BLOCO-1](BLOCO-1-RESULTADO.md) |
| 2. Criações da IA | **6,3** | Modelo arrumado do Canva: letra pequena, pedido perdido, nome da empresa ausente, ajustes que não fazem nada | [BLOCO-2](BLOCO-2-RESULTADO.md) |
| 3. Programação com IA | **5,9** | Nada vencido no ar e o urgente chega em meio segundo, mas o urgente não tem teto nem fim, sobram buracos no dia e o horário segue o fuso errado | [BLOCO-3](BLOCO-3-RESULTADO.md) |
| 4. Telas e editor | **7** | Publicar chega à TV em 0,6 s; o editor quebra com dados antigos | [BLOCO-4-7](BLOCO-4-7-RESULTADO.md) |
| 5. O resto do painel | **7** | Sem quebra nas contas novas; três telas caem com dados antigos | [BLOCO-4-7](BLOCO-4-7-RESULTADO.md) |
| 6. Site e e-mails | **8** | Rápido, preços certos por frente, 8 e-mails saindo | [BLOCO-4-7](BLOCO-4-7-RESULTADO.md) |
| 7. A base | **8** | Segurança 9, desempenho 9, confiabilidade 8 | [BLOCO-4-7](BLOCO-4-7-RESULTADO.md) |
| 8. A interface do painel | **5,5** | Limpo, mas parece ferramenta interna: a TV real quase não aparece e há portas demais | [BLOCO-8](BLOCO-8-INTERFACE.md) |

**Nota geral: 6,2 / 10.** Na média, a TV, a IA, a programação e a
interface pesam o dobro. É por elas que o cliente paga, e é nelas que a nota
está mais baixa, entre 4,5 e 6,3. A base (segurança, desempenho, site) está
boa e não precisa de reforma.

## O que ficou de fora

- **Bloco 2:** a chave do Gemini ficou sem crédito às 05:48. Rodaram 35 dos 60 pedidos, e faltaram os internos de Empresas, os informativos de Saúde e os casos de promessa de cura. Para terminar, recarregue o crédito; o agente deixou os scripts prontos.
- **Fica com você:** as TVs e os boxes de verdade, outros navegadores além do Chromium, o tema escuro, o envio real de e-mail e o pagamento real.

## O plano

- O que fazer, em fases pequenas e com o objetivo de cada uma: [PLANO-DE-ACAO.md](PLANO-DE-ACAO.md).
- O que falta no sistema, o que dá para implementar e o que sai: [O-QUE-FALTA.md](O-QUE-FALTA.md).
