# Bloco 2: criações espontâneas da IA

A pergunta é uma só: um cliente sem ninguém de marketing pede do jeito
dele, e a peça sai no nível de uma marca grande? A meta é **média ≥ 8,5 e
nenhuma peça abaixo de 7**. Só assim é o melhor do mercado.

Tudo roda no servidor local, com a IA real, nos três caminhos de criar:
Criação rápida, a campanha do Criar e a campanha de Meus Designs.

## 1. Os 60 pedidos

São 20 por frente, escritos como o cliente escreve: com erro, gíria, pressa
ou texto colado do WhatsApp. Cada linha abaixo é um tipo de pedido; entre
parênteses, quantos de cada frente (Comércio / Saúde / Empresas).

| Tipo | Exemplo | Quantos |
|---|---|---|
| Claro e completo | "pão de queijo em dobro à tarde, R$ 0,90 cada, hoje até 18h" | 3 / 3 / 3 |
| Vago | "faz alguma coisa bonita pra sexta" | 3 / 2 / 2 |
| Com erro e gíria | "promossão de cerveija gelada sabado, ta barato" | 2 / 2 / 2 |
| Longo, colado do WhatsApp | um parágrafo com 4 informações misturadas | 2 / 2 / 2 |
| Com foto do cliente | foto boa; foto escura e torta de celular; foto com fundo bagunçado | 3 / 2 / 2 |
| Data comemorativa | Black Friday, Dia das Mães, Outubro Rosa, Natal | 2 / 2 / 2 |
| Risco legal | "o mais barato da cidade"; "remédio que cura gripe"; "clareamento garantido"; preço sem condição | 2 / 3 / 1 |
| TV em pé | totem na entrada | 1 / 1 / 1 |
| Vários produtos | "3 armações com preço" | 2 / 0 / 0 |
| Interno, só de Empresas | indicador, 300 dias sem acidente, aniversário, mudança chata de horário, vaga | 0 / 0 / 5 |
| Informativo, só de Saúde | horário, vacina chegou, como agendar, prevenção | 0 / 3 / 0 |

**Variedade:** 5 pedidos são feitos três vezes cada. As três peças precisam
sair diferentes e todas boas.

**Ajustes:** 15 peças recebem 3 pedidos de ajuste cada, como o cliente fala:
- "deixa o preço maior";
- "troca a foto";
- "tá muito escuro";
- "mais chique";
- "tira o telefone";
- "coloca que é só hoje".

## 2. O que é avaliado em cada peça (0 a 10)

| Critério | Pergunta | Como |
|---|---|---|
| **Leitura** | Lê-se a 4 m, pela régua de letra e contraste? | Robô |
| **Composição** | Hierarquia, respiro, nada vazando, tela bem ocupada | Robô e olho |
| **Estética** | Ao lado das referências (BK, Shake Shack, Appspace), segura? | Olho, com as âncoras abaixo |
| **Marca** | Cores, fonte e logo do cliente aplicados como sistema | Robô e olho |
| **Texto** | Ortografia, tom da frente, persuasão, chamada clara, 1 mensagem | Olho |
| **Fidelidade** | Nada inventado (preço, data, telefone), nada do pedido esquecido | Robô (a conferência) e olho |
| **Propósito** | Serve àquele negócio, àquela frente e àquela TV? | Olho |
| **Segurança legal** | Saúde sem promessa; nada de "o mais barato" sem prova | Robô (a régua) e olho |
| **Variedade** | Os 3 pedidos iguais saem diferentes? | Olho |
| **Ajuste** | O ajuste fez o que foi pedido, sem estragar o resto? | Olho |
| **Robustez** | Nunca vazia, quebrada, com texto padrão ou cortada | Robô |
| **Tempo e custo** | Segundos até ficar pronta; créditos e R$ gastos | Robô |

**As âncoras da estética:**

| Nota | Quer dizer |
|---|---|
| 10 | Podia ser de uma marca grande (BK, Shake Shack, Apple) |
| 8 | Agência boa |
| 7 | Freelancer bom |
| 5 | Modelo padrão do Canva sem mexer |
| 3 | Amador |

## 3. O que você recebe

- **Uma galeria** com as 60 peças, mais as variações e os ajustes. Cada peça aparece com o pedido exato, as notas e quanto custou.
- **As médias** por frente, por tipo de pedido e por caminho (Criação rápida, campanha ou Meus Designs).
- **Os 10 piores e os 10 melhores**, com o porquê de cada um.
- **O que mudar no motor da IA:** instruções, modelos de peça, regras e fotos, em ordem de impacto.

**Custo:** cerca de 105 gerações. As que têm foto gerada ficam limitadas a
25. O teto é de **R$ 35**.
