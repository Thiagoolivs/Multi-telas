# QA total — plano

Objetivo: testar 100% do produto, dar nota a cada item em vários critérios e
decidir item a item se ele **fica**, **é melhorado** ou **sai**. Nota de
corte: **7**. A prioridade é o que aparece na TV.

## 1. O mapa dos 100%

Antes de testar, tudo vira uma linha numa planilha mestre
([`ITENS.md`](ITENS.md)), tirada do código. O "100%" é esta lista, e a
cobertura é quantas linhas têm nota.

| Grupo | Quantos (hoje) |
|---|---|
| Tipos de conteúdo do "Adicionar" | 22 |
| Layouts (divisões da tela) | 14 |
| Modelos de peça da IA (peças-ouro) | 43 |
| Telas prontas | 26 |
| Modelos do editor | 9 |
| Faixas da TV: cabeçalho, letreiro, relógio, clima, notícias, selo | 6 |
| Efeitos de datas comemorativas | 22 |
| Estados da TV: código, espera, pausada, sem internet, erro, navegador antigo | ~8 |
| Páginas do painel | 29 |
| Rotas do servidor (grupos) | 22 |
| Páginas do site: raiz, 3 frentes, legais, cadastro e login | ~10 |
| E-mails | ~7 |
| Banco de imagens, fontes, ícones e ilustrações | a contar |
| App Android | 1 |

## 2. Os critérios (0 a 10 cada)

Nem todo critério vale para todo item: a planilha marca quais valem.

| Sigla | Critério | Pergunta |
|---|---|---|
| **TV** | Qualidade na tela | Lê-se a 4 m? A tela inteira está trabalhada? Tem hierarquia, a marca do cliente, movimento e acabamento? Fica bem deitada e em pé, em 1080p e 4K? |
| **REF** | Contra o mercado | Ao lado das melhores referências (`REFERENCIAS.md`), segura? |
| **FUN** | Funciona | Faz o que promete, inclusive nos casos difíceis e nos erros? |
| **FLU** | Fluxo e facilidade | Quantos passos até o objetivo? O próximo passo é óbvio? Um idoso consegue sozinho? |
| **TXT** | Textos | Português correto, tom da frente, sem jargão, sem texto genérico ("Novo comunicado")? |
| **PRO** | Propósito | Serve à frente onde aparece (Comércio, Saúde, Empresas)? Alguém usaria numa terça comum? |
| **VIS** | Design do painel ou do site | Consistência, espaçamento, letra, estados (carregando, vazio, erro), tema escuro |
| **AST** | Assets | Imagens, fontes e ícones nítidos, coerentes e com licença |
| **DES** | Desempenho | Abre rápido no 4G? A TV aguenta horas sem pesar? |
| **CON** | Confiabilidade | Sem internet, depois de reiniciar, rodando dias seguidos |
| **ACE** | Acessibilidade | Teclado, leitor de tela, contraste |
| **SEG** | Segurança e dados | Uma conta não vê a outra; entrada maliciosa barrada |
| **COM** | Compatibilidade | Navegadores, Smart TVs e boxes |

**Como ler a escala:**

| Nota | Quer dizer |
|---|---|
| 10 | Referência de mercado: os melhores fariam igual |
| 9 | Nível dos melhores, com detalhes |
| 8 | Profissional, sem nada que incomode |
| **7** | **Aceitável (o corte)** |
| 5–6 | Funciona, mas parece amador |
| 3–4 | Confuso, feio ou quebrado em parte |
| 0–2 | Não funciona |

**Regras de decisão:**
- A nota do item é a média dos critérios que valem para ele, e na TV **TV** e **REF** pesam o dobro.
- Qualquer critério abaixo de 5 trava o item.
- Abaixo de 7: o item é melhorado se for central para uma frente; se não for, sai.
- Sair quer dizer esconder do painel: os dados ficam, e a TV que usa o item continua rodando até ser trocada.

## 3. Como cada nota é dada

1. **Medição automática.** Um robô (Playwright) monta cada item da TV, em 1920×1080, 3840×2160 e 1080×1920, com conteúdo real de cada frente, e mede:
   - a menor letra e o título, em % da altura da tela;
   - quanto da tela tem conteúdo;
   - o contraste e as palavras por tela;
   - o que vaza ou se sobrepõe;
   - se há movimento;
   - se há repetição (a mesma marca três vezes, peças iguais em sequência).

   Também roda o axe (acessibilidade) e o Lighthouse (desempenho) em cada página, e chama cada rota do servidor.
2. **Olho.** Cada imagem é avaliada contra a régua e as referências. As imagens ficam lado a lado numa galeria, para você ver tudo de uma vez.
3. **Jornadas.** São 3 frentes, cada uma com:
   - quem começa do zero;
   - o dono;
   - o membro da equipe;
   - o instalador;
   - o idoso.

   Cada jornada é cronometrada, e cada travada é anotada.
4. **Mercado.** As telas e o fluxo de criar são comparados com o que os melhores entregam.
5. **O que só você faz.** O roteiro numa TV de verdade e o reteste com a IA real (`GEMINI_API_KEY`).

## 3b. Cada item em quatro estados de dados

A Programação quebrava só nas contas com campanha no ar (05/11): numa conta
vazia, o teste passava. Por isso, cada página e cada item da TV é testado em
quatro contas montadas de propósito:

| Conta | Como é |
|---|---|
| **Vazia** | Acabou de se cadastrar |
| **Típica** | 2 TVs, uma campanha no ar, 10 peças, marca com logo |
| **Cheia** | 25 TVs em 4 grupos, 6 campanhas, 300 peças, nomes longos, datas vencidas |
| **Antiga ou estranha** | Dados de versões anteriores, campos faltando, a TV pareada antes das correções |

Além disso, um lint que acusa nome usado e não definido roda em todo o
painel e no servidor (`npm run lint:nomes`, também no CI). Foi ele que achou
o bug da Programação e outro igual no editor livre.

## 3c. O que nenhum teste automático alcança

| O quê | Como cobrimos |
|---|---|
| TVs e boxes de verdade | O roteiro no aparelho (`docs/qa/ROTEIRO-APARELHO.md`), com você |
| A IA real | O reteste com a `GEMINI_API_KEY` |
| Cobrança e e-mail de verdade | O Asaas sandbox e uma caixa de teste |
| O olho humano a 4 m | A galeria de cada bloco, para você aprovar |
| Os dados da produção | As quatro contas acima, e o painel avisar o servidor quando uma tela quebra (proposta) |
| Dias seguidos rodando | Uma TV de teste ligada 24 h na homologação |

## 4. A ordem: sete blocos

Cada bloco termina com nota em todas as linhas dele e uma galeria. Só então
consertamos, do pior para o melhor, até tudo passar de 7 ou sair. Depois vem
o bloco seguinte. Os blocos 2 e 3 são os mais detalhados: é onde o produto
precisa ser o melhor do mercado.

| Bloco | O quê | Detalhe |
|---|---|---|
| **1. A TV** | Tipos de conteúdo × frentes × orientações, layouts, telas prontas, peças-ouro, faixas, estados, movimento, horas rodando | [ITENS.md](ITENS.md) |
| **2. Criações espontâneas da IA** | 60 pedidos variados, como um cliente de verdade pediria, mais os ajustes | [BLOCO-2-CRIACOES.md](BLOCO-2-CRIACOES.md) |
| **3. Programação e agendamento com IA** | O cliente leigo montando a semana, a importância de cada peça, a organização, o movimento e uma semana simulada na TV | [BLOCO-3-PROGRAMACAO.md](BLOCO-3-PROGRAMACAO.md) |
| **4. Telas e o editor à mão** | Parear, reconectar, grupos, ver agora, som, aviso rápido, e o editor da sequência sem IA | [ITENS.md](ITENS.md) |
| **5. O resto do painel** | Início, Biblioteca, Marca, Pessoas e indicadores, Mural, Relatório, Equipe, Plano, Suporte, Plataforma | [ITENS.md](ITENS.md) |
| **6. Site e e-mails** | Raiz, 3 frentes, legais, cadastro, login, os 8 e-mails | [ITENS.md](ITENS.md) |
| **7. A base** | Desempenho, confiabilidade, segurança, acessibilidade, compatibilidade, app Android | Já estão em 8–9; reconferir |

### Custo

Os testes usam **um robô só**, reaproveitado em todos os blocos, que
fotografa e mede, em vez de dezenas de agentes. Agentes entram só para
olhar galerias grandes em paralelo. A IA real entra só nos blocos 2 e 3,
com teto de cerca de **R$ 35 de geração**. A peça só com texto custa cerca
de R$ 0,12, e com foto gerada, até R$ 0,89.

## 5. O que você recebe por bloco

- **Planilha** (`ITENS.md`): item × critério, com a nota, uma linha de prova e o veredito (fica, melhora ou sai).
- **Galeria** numa página: cada item como aparece na TV, com a nota embaixo.
- **Os 10 piores** do bloco, com o que fazer em cada um.
- **Depois de cada conserto:** a nota nova e um teste automático, para não voltar a quebrar.
