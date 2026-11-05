# QA total: resultado

05/11/2026, servidor local, com a IA real nos blocos 2 e 3. Esta régua é
mais dura que a do QA de 03/11 ([docs/qa/RETESTE.md](../qa/RETESTE.md)):
ela compara com o nível profissional ([REFERENCIAS.md](REFERENCIAS.md)) e com
as [telas de referência](telas-referencia/), e não só com "funciona".

## Notas

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
