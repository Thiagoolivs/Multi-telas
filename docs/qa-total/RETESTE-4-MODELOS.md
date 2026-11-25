# Reteste 4, parte B: os modelos prontos (22 a 25/11/2026)

O dono perguntou, antes do primeiro cliente (RH, frente Empresas, 8 TVs,
03/12/2026):

- **"Os modelos prontos estão editáveis?"** — **Sim.** As 113 peças-ouro,
  todas, foram abertas no Prontos como cliente, editadas em cada texto, QR,
  foto (do celular e do banco), cor, fonte, elemento escondido e desenho
  trocado, salvas, postas numa TV de verdade e conferidas na TV: **113 de
  113 passam**. Das 101 telas prontas, 43 foram editadas peça a peça (cada
  texto de cada peça da tela) e postas na TV, e as outras 52 foram postas na
  TV sem mexer: **95 de 95 passam**; as 6 de época (Outubro Rosa e o inverno
  da farmácia) não aparecem no Prontos em novembro, de propósito, e foram à
  TV montadas direto. Três coisas impediam ou confundiam a edição e foram
  consertadas: o QR do Wi-Fi, o "Não cabe" em peça intocada e o desenho
  trocado com o texto de outro negócio.
- **"Está 100% limpo de coisas antigas e feias?"** — **No que o cliente da
  Empresas vê, agora sim, com quatro ressalvas** (abaixo). Tirei o que o
  robô e o olho acharam: o exemplo de outro negócio ("Desde 1987", "Cabelo ·
  unhas · estética", o telefone e a senha do Wi-Fi do exemplo, a Black
  Friday "para a loja" na fábrica), a logo escura que sumia no cabeçalho
  escuro, a mesa com o calendário em inglês (no cardápio do refeitório e
  numa tela do escritório), a mesma foto em toda peça da Empresas, os
  "null/null" e "undefined" da conta antiga, o nome técnico do tipo nas
  peças guardadas antigas, o "NaN% da meta de undefined" do Indicador na
  TV, os rótulos em inglês e a varinha que sobrou.
  **Ressalvas:** (1) no lote 3 a 5 (que espera a sua aprovação), o texto de
  Comércio de quase todas as peças é o do negócio de exemplo (padaria,
  ótica, salão) e, pela regra do Prontos, vai para todo o Comércio; (2) oito
  peças da proposta com foto de pessoa ficam com metade vazia sem a foto do
  cliente; (3) na TV de verdade, com o nome da conta (Grupo Horizonte) e o
  clima, a letra de 20 das 101 telas encolhe para 3,5–4,4% (2,95% no
  rascunho da lanchonete; a régua pede 4,5%), em 12 delas no cabeçalho com
  chamada; (4) o violeta continua sendo a cor da TV padrão e do claro do
  painel, de propósito (docs/MARCA.md).

Servidor **local** (portas 6190 e 6191, banco novo, `STORAGE=local`,
`AI_PROVIDER=dev`). Nada de produção. Para o cliente ver tudo no Prontos, o
operador **local** aprovou as 214 peças e telas no banco local; **nenhum
`estado` do `pecas-ouro/manifesto.json` mudou** (o teste
`test/aprovar-em-lote.test.js` confere que o arquivo não muda). Máximo de
2 páginas de navegador ao mesmo tempo, sempre. Scripts, fotos e JSON em
`/tmp/claude-0/-home-user-Multi-telas/b804d644-700b-5e83-ad8f-5fe2da78625e/scratchpad/r4/`
(aqui, `R4/`).

## B1: os modelos são editáveis?

### Como foi medido

- **Peças (`R4/b1/pecas.cjs`):** conta de Empresas (Grupo Horizonte, com
  site e endereço na Marca), TV de verdade deitada no Corporativo. Para cada
  uma das 113: Prontos › "Ver também os de outros negócios" › busca › Usar ›
  cada campo de texto recebe um texto de teste ("Teste A", número no lugar de
  número) › cada QR um link › cada foto troca, alternando **Do celular**
  (envio de arquivo) e **Banco de fotos** › Cor principal `#0e7c66` › Fonte
  dos títulos Nunito › Elementos: esconde o 2º texto › Desenho: conta as
  opções › Salvar › Pôr na TV › na TV, cada `[data-campo]` com o texto
  novo, a foto nova, o QR, a fonte, e o escondido escondido. Segunda volta:
  Usar › Desenho › o primeiro desenho › Salvar › Pôr na TV › a TV mudou de
  desenho.
- **O que o editor diz sem mexer (`R4/b1/conferir.cjs`):** abre e lê
  "Cabe…" ou "Não cabe…" antes de qualquer edição.
- **Espaço de foto vazio (direto, `R4/b3/pecas.mjs`):** cada peça com foto
  posta na TV como o Prontos a entrega (sem foto do cliente).
- **Telas (`R4/b1/telas.cjs`):** três TVs de verdade (deitada, quadrada e em
  pé) numa página só. Prontos › Telas inteiras › Usar › Pôr na TV sem mexer
  (a foto do B3) › e, na amostra, "Trocar textos" em **cada** peça da tela
  com textos de teste › troca a 1ª frase do rodapé › Pôr na TV › confere o
  layout, o que foi gravado em cada peça e, na TV, cada peça (as que se
  revezam com o relógio da TV adiantado). A amostra cobre cada lote, cada
  orientação, a Empresas inteira e os rascunhos.

### Peças: 113 de 113 passam

"Campos" é o que o cliente edita; "Na TV" é quantos deles a TV mostrou com
o texto, a foto ou o QR novos.

| Peça | Estado | Campos (texto · QR · foto) | Cor, fonte, esconder | Desenhos | Na TV | Resultado | Por quê |
|---|---|---|---|---|---|---|---|
| `cabecalho-classico` | aprovada | 2 · 0 · 1 | ✓ ✓ ✓ | 5 (trocou ✓) | 3/3 | passa | a TV esconde de propósito: marca |
| `oferta-foto` | aprovada | 10 · 0 · 1 | ✓ ✓ ✓ | 9 (trocou ✓) | 11/11 | passa | a TV esconde de propósito: marca |
| `oferta-lista` | aprovada | 14 · 0 · 0 | ✓ ✓ ✓ | 9 (trocou ✓) | 14/14 | passa | a TV esconde de propósito: marca |
| `numero-grande` | aprovada | 7 · 0 · 0 | ✓ ✓ ✓ | 9 (trocou ✓) | 7/7 | passa | a TV esconde de propósito: marca |
| `lateral-prazo` | aprovada | 6 · 0 · 0 | ✓ ✓ ✓ | 9 (trocou ✓) | 6/6 | passa |  |
| `lateral-qr` | aprovada | 4 · 1 · 0 | ✓ ✓ ✓ | 9 (trocou ✓) | 5/5 | passa |  |
| `lateral-chamada` | aprovada | 4 · 0 · 0 | ✓ ✓ ✓ | 9 (trocou ✓) | 4/4 | passa |  |
| `rodape-selo` | aprovada | 1 · 0 · 0 | ✓ ✓ ✓ | 4 (trocou ✓) | 1/1 | passa |  |
| `cabecalho-status` | aprovada | 4 · 0 · 1 | ✓ ✓ ✓ | 5 (trocou ✓) | 5/5 | passa | a TV esconde de propósito: marca, desde |
| `cardapio-combo` | aprovada | 14 · 0 · 0 | ✓ ✓ ✓ | 9 (trocou ✓) | 14/14 | passa | a TV esconde de propósito: marca |
| `cardapio-colunas` | aprovada | 29 · 0 · 0 | ✓ ✓ ✓ | 9 (trocou ✓) | 29/29 | passa | a TV esconde de propósito: marca |
| `manifesto` | aprovada | 6 · 0 · 0 | ✓ ✓ ✓ | 9 (trocou ✓) | 6/6 | passa | a TV esconde de propósito: marca |
| `servico-horario` | aprovada | 10 · 0 · 0 | ✓ ✓ ✓ | 9 (trocou ✓) | 10/10 | passa |  |
| `social-avaliacao` | aprovada | 6 · 1 · 0 | ✓ ✓ ✓ | 9 (trocou ✓) | 7/7 | passa | a TV esconde de propósito: pedido |
| `rodape-pagamento` | aprovada | 5 · 0 · 0 | ✓ ✓ ✓ | 4 (trocou ✓) | 5/5 | passa | a TV esconde de propósito: rotulo |
| `cabecalho-centro` | aprovada | 2 · 0 · 1 | ✓ ✓ ✓ | 5 (trocou ✓) | 3/3 | passa | a TV esconde de propósito: marca |
| `oferta-selo` | aprovada | 9 · 0 · 0 | ✓ ✓ ✓ | 9 (trocou ✓) | 9/9 | passa | a TV esconde de propósito: marca |
| `servico-agenda` | aprovada | 8 · 1 · 0 | ✓ ✓ ✓ | 9 (trocou ✓) | 9/9 | passa |  |
| `servico-passos` | aprovada | 11 · 0 · 0 | ✓ ✓ ✓ | 9 (trocou ✓) | 11/11 | passa | a TV esconde de propósito: marca |
| `social-depoimento` | aprovada | 3 · 0 · 0 | ✓ ✓ ✓ | 9 (trocou ✓) | 3/3 | passa |  |
| `social-instagram` | aprovada | 3 · 1 · 0 | ✓ ✓ ✓ | 9 (trocou ✓) | 4/4 | passa |  |
| `rodape-faixa` | aprovada | 7 · 0 · 0 | ✓ ✓ ✓ | 4 (trocou ✓) | 7/7 | passa |  |
| `cabecalho-minimo` | aprovada | 1 · 0 · 1 | ✓ ✓ ✓ | 5 (trocou ✓) | 2/2 | passa | a TV esconde de propósito: marca |
| `social-data` | aprovada | 7 · 0 · 0 | ✓ ✓ ✓ | 9 (trocou ✓) | 7/7 | passa |  |
| `oferta-parcelado` | aprovada | 11 · 0 · 0 | ✓ ✓ ✓ | 9 (trocou ✓) | 11/11 | passa | a TV esconde de propósito: marca |
| `institucional-valores` | aprovada | 10 · 0 · 0 | ✓ ✓ ✓ | 9 (trocou ✓) | 10/10 | passa | a TV esconde de propósito: marca |
| `servico-alerta` | aprovada | 3 · 0 · 0 | ✓ ✓ ✓ | 9 (trocou ✓) | 3/3 | passa |  |
| `servico-comunicado` | aprovada | 8 · 0 · 0 | ✓ ✓ ✓ | 9 (trocou ✓) | 8/8 | passa | a TV esconde de propósito: marca |
| `rodape-relogio` | aprovada | 1 · 0 · 0 | ✓ ✓ ✓ | 4 (trocou ✓) | 1/1 | passa |  |
| `rodape-contagem` | aprovada | 1 · 0 · 0 | ✓ ✓ ✓ | 4 (trocou ✓) | 1/1 | passa |  |
| `cabecalho-chamada` | aprovada | 3 · 0 · 1 | ✓ ✓ ✓ | 5 (trocou ✓) | 4/4 | passa | a TV esconde de propósito: marca |
| `cabecalho-chamadas` | aprovada | 1 · 0 · 1 | ✓ ✓ ✓ | 5 (trocou ✓) | 2/2 | passa | a TV esconde de propósito: marca |
| `cardapio-categorias` | aprovada | 33 · 0 · 0 | ✓ ✓ ✓ | 9 (trocou ✓) | 33/33 | passa | a TV esconde de propósito: marca |
| `cardapio-bebidas` | aprovada | 21 · 0 · 0 | ✓ ✓ ✓ | 9 (trocou ✓) | 21/21 | passa |  |
| `institucional-lancamento` | aprovada | 6 · 0 · 0 | ✓ ✓ ✓ | 9 (trocou ✓) | 6/6 | passa | a TV esconde de propósito: marca |
| `gente-aniversariante` | aprovada | 5 · 0 · 1 | ✓ ✓ ✓ | 9 (trocou ✓) | 6/6 | passa |  |
| `gente-mes` | aprovada | 21 · 0 · 0 | ✓ ✓ ✓ | 9 (trocou ✓) | 21/21 | passa |  |
| `gente-boas-vindas` | aprovada | 8 · 0 · 1 | ✓ ✓ ✓ | 9 (trocou ✓) | 9/9 | passa | a TV esconde de propósito: marca |
| `gente-vaga` | aprovada | 8 · 1 · 0 | ✓ ✓ ✓ | 9 (trocou ✓) | 9/9 | passa |  |
| `gente-comunicado` | aprovada | 7 · 0 · 0 | ✓ ✓ ✓ | 9 (trocou ✓) | 7/7 | passa |  |
| `institucional-foto` | aprovada | 5 · 0 · 1 | ✓ ✓ ✓ | 9 (trocou ✓) | 6/6 | passa | a TV esconde de propósito: marca |
| `social-mural` | aprovada | 6 · 1 · 1 | ✓ ✓ ✓ | 9 (trocou ✓) | 8/8 | passa |  |
| `cardapio-dia-foto` | aprovada | 8 · 0 · 1 | ✓ ✓ ✓ | 9 (trocou ✓) | 9/9 | passa | a TV esconde de propósito: marca |
| `indicador-meta` | proposta | 8 · 0 · 0 | ✓ ✓ ✓ | 9 (trocou ✓) | 8/8 | passa |  |
| `gente-destaque` | proposta | 6 · 0 · 1 | ✓ ✓ ✓ | 9 (trocou ✓) | 7/7 | passa |  |
| `servico-semana` | proposta | 20 · 0 · 0 | ✓ ✓ ✓ | 9 (trocou ✓) | 20/20 | passa |  |
| `servico-ramais` | proposta | 15 · 0 · 0 | ✓ ✓ ✓ | 9 (trocou ✓) | 15/15 | passa |  |
| `social-pesquisa` | proposta | 4 · 1 · 0 | ✓ ✓ ✓ | 9 (trocou ✓) | 5/5 | passa |  |
| `cardapio-semana` | proposta | 14 · 0 · 0 | ✓ ✓ ✓ | 9 (trocou ✓) | 14/14 | passa |  |
| `servico-epi` | proposta | 8 · 0 · 0 | ✓ ✓ ✓ | 9 (trocou ✓) | 8/8 | passa |  |
| `indicador-turno` | proposta | 15 · 0 · 0 | ✓ ✓ ✓ | 9 (trocou ✓) | 15/15 | passa |  |
| `social-campanha` | proposta | 4 · 0 · 0 | ✓ ✓ ✓ | 9 (trocou ✓) | 4/4 | passa |  |
| `servico-preparo` | proposta | 7 · 0 · 0 | ✓ ✓ ✓ | 9 (trocou ✓) | 7/7 | passa |  |
| `servico-convenios` | proposta | 9 · 0 · 0 | ✓ ✓ ✓ | 9 (trocou ✓) | 9/9 | passa |  |
| `gente-equipe` | proposta | 14 · 0 · 0 | ✓ ✓ ✓ | 9 (trocou ✓) | 14/14 | passa |  |
| `servico-vacina` | proposta | 5 · 0 · 0 | ✓ ✓ ✓ | 9 (trocou ✓) | 5/5 | passa |  |
| `servico-espera` | proposta | 4 · 0 · 0 | ✓ ✓ ✓ | 9 (trocou ✓) | 4/4 | passa |  |
| `servico-hora` | proposta | 4 · 0 · 0 | ✓ ✓ ✓ | 9 (trocou ✓) | 4/4 | passa |  |
| `oferta-relampago` | proposta | 7 · 0 · 0 | ✓ ✓ ✓ | 9 (trocou ✓) | 7/7 | passa | a TV esconde de propósito: rotulo |
| `oferta-kit` | proposta | 9 · 0 · 0 | ✓ ✓ ✓ | 9 (trocou ✓) | 9/9 | passa |  |
| `oferta-chegou` | proposta | 5 · 0 · 0 | ✓ ✓ ✓ | 9 (trocou ✓) | 5/5 | passa |  |
| `social-fidelidade` | proposta | 4 · 0 · 0 | ✓ ✓ ✓ | 9 (trocou ✓) | 4/4 | passa | a TV esconde de propósito: marca |
| `social-delivery` | proposta | 5 · 1 · 0 | ✓ ✓ ✓ | 9 (trocou ✓) | 6/6 | passa |  |
| `social-wifi` | proposta | 7 · 0 · 0 | ✓ ✓ ✓ | 9 (trocou ✓) | 8/8 | passa |  |
| `servico-pagamento` | proposta | 7 · 0 · 0 | ✓ ✓ ✓ | 9 (trocou ✓) | 7/7 | passa |  |
| `social-nota` | proposta | 4 · 0 · 0 | ✓ ✓ ✓ | 9 (trocou ✓) | 4/4 | passa |  |
| `ambiente-ondas` | proposta | 2 · 0 · 0 | ✓ ✓ ✓ | 9 (trocou ✓) | 2/2 | passa |  |
| `ambiente-formas` | proposta | 2 · 0 · 0 | ✓ ✓ ✓ | 9 (trocou ✓) | 2/2 | passa |  |
| `ambiente-luz` | proposta | 2 · 0 · 0 | ✓ ✓ ✓ | 9 (trocou ✓) | 2/2 | passa |  |
| `aviso-faixa` | proposta | 4 · 0 · 1 | ✓ ✓ ✓ | 9 (trocou ✓) | 5/5 | passa |  |
| `capa-campanha` | proposta | 5 · 0 · 1 | ✓ ✓ ✓ | 9 (trocou ✓) | 6/6 | passa | a TV esconde de propósito: titulo |
| `capa-casa` | proposta | 6 · 0 · 1 | ✓ ✓ ✓ | 9 (trocou ✓) | 7/7 | passa | a TV esconde de propósito: titulo, marca |
| `capa-produto` | proposta | 6 · 0 · 1 | ✓ ✓ ✓ | 9 (trocou ✓) | 7/7 | passa | a TV esconde de propósito: centavos |
| `cardapio-destaque` | proposta | 6 · 0 · 1 | ✓ ✓ ✓ | 9 (trocou ✓) | 7/7 | passa |  |
| `cardapio-quadro` | proposta | 13 · 0 · 1 | ✓ ✓ ✓ | 9 (trocou ✓) | 14/14 | passa |  |
| `cardapio-trio` | proposta | 8 · 0 · 3 | ✓ ✓ ✓ | 9 (trocou ✓) | 11/11 | passa |  |
| `dica-foto` | proposta | 4 · 0 · 1 | ✓ ✓ ✓ | 9 (trocou ✓) | 5/5 | passa |  |
| `diptico-agenda` | proposta | 5 · 1 · 1 | ✓ ✓ ✓ | 9 (trocou ✓) | 7/7 | passa | a TV esconde de propósito: titulo |
| `diptico-oferta` | proposta | 9 · 0 · 1 | ✓ ✓ ✓ | 9 (trocou ✓) | 10/10 | passa |  |
| `diptico-servico` | proposta | 6 · 0 · 1 | ✓ ✓ ✓ | 9 (trocou ✓) | 7/7 | passa |  |
| `editorial-citacao` | proposta | 3 · 0 · 1 | ✓ ✓ ✓ | 9 (trocou ✓) | 4/4 | passa |  |
| `editorial-indice` | proposta | 5 · 0 · 1 | ✓ ✓ ✓ | 9 (trocou ✓) | 6/6 | passa |  |
| `editorial-moldura` | proposta | 5 · 0 · 1 | ✓ ✓ ✓ | 9 (trocou ✓) | 6/6 | passa |  |
| `equipe-trio` | proposta | 8 · 0 · 3 | ✓ ✓ ✓ | 9 (trocou ✓) | 11/11 | passa |  |
| `evento-foto` | proposta | 6 · 0 · 1 | ✓ ✓ ✓ | 9 (trocou ✓) | 7/7 | passa |  |
| `frase-faixa` | proposta | 5 · 0 · 1 | ✓ ✓ ✓ | 9 (trocou ✓) | 6/6 | passa | a TV esconde de propósito: titulo, marca |
| `gente-retrato` | proposta | 4 · 0 · 1 | ✓ ✓ ✓ | 9 (trocou ✓) | 5/5 | passa |  |
| `horario-foto` | proposta | 9 · 0 · 1 | ✓ ✓ ✓ | 9 (trocou ✓) | 10/10 | passa |  |
| `mural-foto` | proposta | 3 · 0 · 4 | ✓ ✓ ✓ | 9 (trocou ✓) | 7/7 | passa |  |
| `numero-dado` | proposta | 4 · 0 · 1 | ✓ ✓ ✓ | 9 (trocou ✓) | 5/5 | passa |  |
| `numero-marco` | proposta | 4 · 0 · 1 | ✓ ✓ ✓ | 9 (trocou ✓) | 5/5 | passa |  |
| `numero-preco` | proposta | 6 · 0 · 1 | ✓ ✓ ✓ | 9 (trocou ✓) | 7/7 | passa |  |
| `oferta-desconto` | proposta | 4 · 0 · 1 | ✓ ✓ ✓ | 9 (trocou ✓) | 5/5 | passa |  |
| `oferta-dupla` | proposta | 6 · 0 · 2 | ✓ ✓ ✓ | 9 (trocou ✓) | 8/8 | passa |  |
| `qr-foto` | proposta | 4 · 1 · 1 | ✓ ✓ ✓ | 9 (trocou ✓) | 6/6 | passa |  |
| `recepcao-foto` | proposta | 3 · 0 · 1 | ✓ ✓ ✓ | 9 (trocou ✓) | 4/4 | passa |  |
| `seguranca-foto` | proposta | 6 · 0 · 1 | ✓ ✓ ✓ | 9 (trocou ✓) | 7/7 | passa |  |
| `vaga-foto` | proposta | 5 · 1 · 1 | ✓ ✓ ✓ | 9 (trocou ✓) | 7/7 | passa |  |
| `cena-capa` | proposta | 4 · 0 · 1 | ✓ ✓ ✓ | 9 (trocou ✓) | 5/5 | passa | a TV esconde de propósito: kicker, titulo, apoio |
| `cena-dividida` | proposta | 7 · 0 · 1 | ✓ ✓ ✓ | 9 (trocou ✓) | 8/8 | passa |  |
| `cena-janela` | proposta | 5 · 0 · 1 | ✓ ✓ ✓ | 9 (trocou ✓) | 6/6 | passa |  |
| `cena-cardapio` | proposta | 10 · 0 · 1 | ✓ ✓ ✓ | 9 (trocou ✓) | 11/11 | passa |  |
| `cena-aberto` | proposta | 9 · 0 · 1 | ✓ ✓ ✓ | 9 (trocou ✓) | 10/10 | passa |  |
| `cena-qr` | proposta | 4 · 1 · 1 | ✓ ✓ ✓ | 9 (trocou ✓) | 6/6 | passa |  |
| `cena-numero` | proposta | 4 · 0 · 1 | ✓ ✓ ✓ | 9 (trocou ✓) | 5/5 | passa |  |
| `cena-boas-vindas` | proposta | 5 · 0 · 1 | ✓ ✓ ✓ | 9 (trocou ✓) | 6/6 | passa | a TV esconde de propósito: titulo |
| `cena-frase` | proposta | 5 · 0 · 1 | ✓ ✓ ✓ | 9 (trocou ✓) | 6/6 | passa | a TV esconde de propósito: titulo, marca |
| `cena-faixa` | proposta | 5 · 0 · 1 | ✓ ✓ ✓ | 9 (trocou ✓) | 6/6 | passa |  |
| `cena-mosaico` | proposta | 3 · 0 · 3 | ✓ ✓ ✓ | 9 (trocou ✓) | 6/6 | passa |  |
| `cena-oferta` | proposta | 5 · 0 · 1 | ✓ ✓ ✓ | 9 (trocou ✓) | 6/6 | passa | a TV esconde de propósito: centavos |
| `cena-vaga` | proposta | 5 · 1 · 1 | ✓ ✓ ✓ | 9 (trocou ✓) | 7/7 | passa |  |
| `cena-aviso` | proposta | 4 · 0 · 1 | ✓ ✓ ✓ | 9 (trocou ✓) | 5/5 | passa |  |
| `cena-depoimento` | proposta | 3 · 0 · 1 | ✓ ✓ ✓ | 9 (trocou ✓) | 4/4 | passa |  |

Somas: 770 campos de texto, 13 QR, 67 espaços de foto (33 pelo celular e
34 pelo banco), 113 de 113 com cor e fonte na TV, 108 com um elemento
escondido (as 5 outras só têm um texto), 113 de 113 trocaram de desenho.

**"A TV esconde de propósito"** não é falha: o nome da empresa some da peça
quando o cabeçalho da TV já mostra a marca; a logo toma o lugar do nome no
cabeçalho; o "Aponte a câmera" sai na TV deitada da avaliação; o "Desde"
sai quando há logo. O campo continua editável e volta onde há espaço.

### O que impedia ou confundia a edição (consertado)

| # | O que o cliente via | Onde | Conserto |
|---|---|---|---|
| 1 | **O QR do Wi-Fi era um campo técnico** ("Wifi", para escrever `WIFI:T:WPA;S:…;P:…;;`) e **não seguia a rede e a senha** escritas: trocada a senha, o QR entrava na rede do exemplo. No Prontos o QR nem vinha | `web/src/components/content/EditarPeca.jsx` (Textos) | O editor monta o QR da rede e da senha (`web/src/lib/qrDoWifi.js`, `EditarPeca.jsx:245`); o campo técnico some e vira uma frase; com a rede e a senha neutras, sem QR (um QR para uma rede que não existe é pior que nenhum) |
| 2 | **"Não cabe" em peça aprovada e intocada:** os 6 cabeçalhos e 4 rodapés abriam com "Não cabe — Relogio passa da borda", "Encurte o texto…" (a faixa era conferida como tela cheia de 1920×1080). Também o `numero-grande` ("Numero encostado na borda" na quadrada) e o `institucional-foto` (2ª linha do título em pé) | `EditarPeca.jsx` (conferência) | A faixa é conferida no tamanho da faixa (`ondeConferir`, `EditarPeca.jsx:50`); o editor só avisa o que a edição causou (`EditarPeca.jsx:282`); "Relógio" com acento |
| 3 | **Trocar o desenho trazia o texto de outro negócio** no campo que só o desenho novo tem: do Wi-Fi para o "Reserve pelo WhatsApp" vinha "(11) 99999-0000"; para o Instagram, "@studiobella" | `EditarPeca.jsx` (Desenho) | O campo novo nasce como no Prontos: o texto da frente, sem contato, @, endereço nem nome da empresa de exemplo (`EditarPeca.jsx:345`, `web/src/lib/telasProntas.js:198`) |
| 4 | **A peça solta do Prontos mostrava o contato da empresa de exemplo** (o rodapé de contatos da padaria com o WhatsApp e o @ do salão; o "Reserve pelo WhatsApp" com o telefone da ótica). A tela pronta já limpava; a peça solta, não | `web/src/pages/PecasProntasPage.jsx` | A mesma limpeza da tela pronta (`camposSemExemplo`, `telasProntas.js:161`); o campo que saiu pede "O do exemplo saiu. Escreva o seu" |

### Não consertado (fica registrado)

- **Rodapé que passa os avisos numa TV sem aviso no rodapé:** "Pôr na TV" do `rodape-selo`, `rodape-pagamento`, `rodape-relogio` e `rodape-contagem` numa TV sem frase no rodapé não muda nada na TV (`js/player.js`, `pecasDaFaixa`: de propósito, "pele de rodapé passando vazia"), e o painel diz "Na TV: 1 tela". O robô deu a frase e as quatro passam. Proposta: o "Pôr na TV" dessas faixas pedir a primeira frase.
- **Faixa numa TV sem faixa:** o cabeçalho ou o rodapé posto numa TV de layout sem aquela zona (Tela cheia) não entra, calado (`js/lote-tv.js:357`). A campanha pergunta se troca o layout; a peça solta, não.

### Telas: 95 de 95 passam (e 6 de época)

"Peças editadas" é cada peça da tela que recebeu textos de teste, com o
número de campos. "Lido no meio da animação" é a medida que pegou a peça
entrando; a foto da TV, depois, mostra o texto certo.

| Tela | Estado | TV | Peças editadas (campos) | Na TV | Resultado | Por quê |
|---|---|---|---|---|---|---|
| `otica-semana-do-sol` | aprovada | deitada | cabecalho-classico (2), oferta-foto (10), oferta-lista (14), numero-grande (7), lateral-qr (5), rodape-selo (1) | 6/6 | passa |  |
| `padaria-cafe-da-manha` | rascunho | deitada | cabecalho-status (4), cardapio-combo (14), cardapio-colunas (29), manifesto (6), servico-horario (10), social-avaliacao (7), rodape-pagamento (5) | 7/7 | passa |  |
| `salao-terca-da-cor` | rascunho | deitada | cabecalho-centro (2), oferta-selo (9), servico-passos (11), social-depoimento (3), servico-agenda (9), social-instagram (4), rodape-faixa (7) | 7/7 | passa |  |
| `clinica-outubro-rosa` | rascunho | – | – | – | fora de época | não aparece no Prontos em novembro, de propósito (época 10-01 a 10-31); a foto do B3 foi montada direto |
| `lanchonete-terca-do-burger` | rascunho | em-pe | cabecalho-chamada (3), cardapio-categorias (33), institucional-lancamento (6), cardapio-combo (14), cardapio-bebidas (21), social-instagram (4), rodape-pagamento (5) | 7/7 | passa |  |
| `rotasul-mural-da-equipe` | rascunho | deitada | cabecalho-classico (2), gente-aniversariante (5), gente-boas-vindas (8), gente-comunicado (7), gente-mes (21), gente-vaga (9), rodape-selo (1) | 7/7 | passa |  |
| `l1-comercio-vitrine` | proposta | deitada | cabecalho-classico (2), oferta-foto (10), oferta-lista (14), numero-grande (7), lateral-prazo (6), lateral-qr (5), rodape-selo (1) | 7/7 | passa |  |
| `l1-comercio-cardapio` | proposta | deitada | cabecalho-status (4), cardapio-colunas (29), cardapio-combo (14), cardapio-bebidas (21), social-instagram (4), rodape-pagamento (5) | 6/6 | passa |  |
| `l1-comercio-relampago` | proposta | deitada | cabecalho-chamada (3), oferta-selo (9), oferta-parcelado (11), rodape-contagem (1) | 4/4 | passa |  |
| `l1-comercio-institucional` | proposta | deitada | cabecalho-centro (2), institucional-foto (5), institucional-valores (10), manifesto (6), social-instagram (4), lateral-qr (5), rodape-faixa (7) | 7/7 | passa |  |
| `l1-comercio-lancamento` | proposta | deitada | institucional-lancamento (6), oferta-foto (10), rodape-contagem (1) | 3/3 | passa |  |
| `l1-comercio-totem` | proposta | em-pe | cabecalho-minimo (1), cardapio-dia-foto (8), oferta-selo (9), servico-horario (10), social-avaliacao (7), rodape-pagamento (5) | 6/6 | passa |  |
| `l1-comercio-redes` | proposta | deitada | social-mural (7), social-avaliacao (7), social-depoimento (3), lateral-chamada (4), rodape-faixa (7) | 5/5 | passa |  |
| `l1-empresa-mural` | proposta | deitada | cabecalho-classico (2), gente-aniversariante (5), gente-boas-vindas (8), gente-comunicado (7), gente-mes (21), gente-vaga (9), rodape-selo (1) | 7/7 | passa |  |
| `l1-empresa-seguranca` | proposta | deitada | cabecalho-status (4), numero-grande (7), servico-alerta (3), institucional-valores (10), lateral-chamada (4), servico-alerta (3), rodape-selo (1) | 7/7 | passa |  servico-alerta: lido no meio da animação |
| `l1-empresa-comunicado` | proposta | deitada | cabecalho-centro (2), gente-comunicado (7), servico-comunicado (8), rodape-selo (1) | 4/4 | passa |  |
| `l1-empresa-institucional` | proposta | deitada | cabecalho-centro (2), manifesto (6), institucional-valores (10), numero-grande (7), lateral-chamada (4), lateral-qr (5), rodape-faixa (7) | 7/7 | passa |  |
| `l1-empresa-lancamento` | proposta | deitada | institucional-lancamento (6), servico-passos (11), rodape-contagem (1) | 3/3 | passa |  |
| `l1-empresa-totem` | proposta | em-pe | cabecalho-minimo (1), gente-boas-vindas (8), institucional-valores (10), servico-horario (10), lateral-qr (5), rodape-selo (1) | 6/6 | passa |  |
| `l1-saude-espera` | proposta | deitada | servico-passos (11), social-depoimento (3), institucional-valores (10), servico-horario (10), social-avaliacao (7), rodape-selo (1) | 6/6 | passa |  |
| `l1-saude-prevencao` | proposta | – | – | – | fora de época | não aparece no Prontos em novembro, de propósito (época 10-01 a 10-31); a foto do B3 foi montada direto |
| `l1-saude-institucional` | proposta | deitada | cabecalho-centro (2), numero-grande (7), institucional-valores (10), manifesto (6), servico-horario (10), lateral-qr (5), rodape-faixa (7) | 7/7 | passa |  |
| `l1-saude-totem` | proposta | em-pe | (posta sem mexer) | 4 peças à vista | passa | só Pôr na TV (a edição é a das peças, já conferida) |
| `l1-saude-depoimentos` | proposta | deitada | social-depoimento (3), social-depoimento (3), social-avaliacao (7), social-instagram (4), rodape-faixa (7) | 5/5 | passa |  social-depoimento: lido no meio da animação |
| `l1-saude-avisos` | proposta | deitada | cabecalho-chamada (3), servico-comunicado (8), servico-horario (10), rodape-selo (1) | 4/4 | passa |  |
| `l1-comercio-avisos` | proposta | deitada | cabecalho-chamada (3), servico-comunicado (8), servico-horario (10), rodape-pagamento (5) | 4/4 | passa |  |
| `l2-padaria-deitada` | proposta | deitada | cabecalho-status (4), cardapio-combo (14), manifesto (6), lateral-chamada (4), servico-horario (10), rodape-pagamento (5) | 6/6 | passa |  |
| `l2-padaria-em-pe` | proposta | em-pe | cabecalho-status (4), cardapio-combo (14), manifesto (6), lateral-chamada (4), servico-horario (10), rodape-pagamento (5) | 6/6 | passa |  |
| `l2-padaria-quadrada` | proposta | quadrada | cardapio-combo (14), manifesto (6), lateral-chamada (4), servico-horario (10), rodape-pagamento (5) | 5/5 | passa |  |
| `l2-otica-deitada` | proposta | deitada | (posta sem mexer) | 4 peças à vista | passa | só Pôr na TV (a edição é a das peças, já conferida) |
| `l2-otica-em-pe` | proposta | em-pe | (posta sem mexer) | 4 peças à vista | passa | só Pôr na TV (a edição é a das peças, já conferida) |
| `l2-otica-quadrada` | proposta | quadrada | (posta sem mexer) | 2 peças à vista | passa | só Pôr na TV (a edição é a das peças, já conferida) |
| `l2-restaurante-deitada` | proposta | deitada | (posta sem mexer) | 4 peças à vista | passa | só Pôr na TV (a edição é a das peças, já conferida) |
| `l2-restaurante-em-pe` | proposta | em-pe | (posta sem mexer) | 4 peças à vista | passa | só Pôr na TV (a edição é a das peças, já conferida) |
| `l2-restaurante-quadrada` | proposta | quadrada | (posta sem mexer) | 2 peças à vista | passa | só Pôr na TV (a edição é a das peças, já conferida) |
| `l2-salao-deitada` | proposta | deitada | (posta sem mexer) | 4 peças à vista | passa | só Pôr na TV (a edição é a das peças, já conferida) |
| `l2-salao-em-pe` | proposta | em-pe | (posta sem mexer) | 4 peças à vista | passa | só Pôr na TV (a edição é a das peças, já conferida) |
| `l2-salao-quadrada` | proposta | quadrada | (posta sem mexer) | 2 peças à vista | passa | só Pôr na TV (a edição é a das peças, já conferida) |
| `l2-clinica-deitada` | proposta | – | – | – | fora de época | não aparece no Prontos em novembro, de propósito (época 10-01 a 10-31); a foto do B3 foi montada direto |
| `l2-clinica-em-pe` | proposta | – | – | – | fora de época | não aparece no Prontos em novembro, de propósito (época 10-01 a 10-31); a foto do B3 foi montada direto |
| `l2-clinica-quadrada` | proposta | – | – | – | fora de época | não aparece no Prontos em novembro, de propósito (época 10-01 a 10-31); a foto do B3 foi montada direto |
| `l2-dentista-deitada` | proposta | deitada | (posta sem mexer) | 4 peças à vista | passa | só Pôr na TV (a edição é a das peças, já conferida) |
| `l2-dentista-em-pe` | proposta | em-pe | (posta sem mexer) | 4 peças à vista | passa | só Pôr na TV (a edição é a das peças, já conferida) |
| `l2-dentista-quadrada` | proposta | quadrada | (posta sem mexer) | 2 peças à vista | passa | só Pôr na TV (a edição é a das peças, já conferida) |
| `l2-farmacia-deitada` | proposta | deitada | (posta sem mexer) | 4 peças à vista | passa | só Pôr na TV (a edição é a das peças, já conferida) |
| `l2-farmacia-em-pe` | proposta | em-pe | (posta sem mexer) | 4 peças à vista | passa | só Pôr na TV (a edição é a das peças, já conferida) |
| `l2-farmacia-quadrada` | proposta | quadrada | (posta sem mexer) | 2 peças à vista | passa | só Pôr na TV (a edição é a das peças, já conferida) |
| `l2-escritorio-deitada` | proposta | deitada | cabecalho-centro (2), gente-comunicado (7), numero-grande (7), gente-aniversariante (5), servico-alerta (3), rodape-relogio (1) | 6/6 | passa |  |
| `l2-escritorio-em-pe` | proposta | em-pe | cabecalho-centro (2), gente-comunicado (7), numero-grande (7), gente-aniversariante (5), servico-alerta (3), rodape-relogio (1) | 6/6 | passa |  |
| `l2-escritorio-quadrada` | proposta | quadrada | gente-comunicado (7), numero-grande (7), gente-aniversariante (5), servico-alerta (3), rodape-relogio (1) | 5/5 | passa |  |
| `l2-industria-deitada` | proposta | deitada | (posta sem mexer) | 4 peças à vista | passa | só Pôr na TV (a edição é a das peças, já conferida) |
| `l2-industria-em-pe` | proposta | em-pe | (posta sem mexer) | 4 peças à vista | passa | só Pôr na TV (a edição é a das peças, já conferida) |
| `l2-industria-quadrada` | proposta | quadrada | (posta sem mexer) | 2 peças à vista | passa | só Pôr na TV (a edição é a das peças, já conferida) |
| `l3-padaria-deitada` | proposta | deitada | cabecalho-status (4), social-fidelidade (4), oferta-relampago (7), social-wifi (7), servico-hora (4), rodape-pagamento (5) | 6/6 | passa |  |
| `l3-padaria-quadrada` | proposta | quadrada | social-fidelidade (4), oferta-relampago (7), servico-hora (4), ambiente-luz (2), rodape-pagamento (5) | 5/5 | passa |  |
| `l3-restaurante-em-pe` | proposta | em-pe | cabecalho-chamada (3), cardapio-semana (14), social-nota (4), social-delivery (6), servico-pagamento (7), rodape-faixa (7) | 6/6 | passa |  |
| `l3-restaurante-quadrada` | proposta | quadrada | (posta sem mexer) | 2 peças à vista | passa | só Pôr na TV (a edição é a das peças, já conferida) |
| `l3-otica-deitada` | proposta | deitada | (posta sem mexer) | 4 peças à vista | passa | só Pôr na TV (a edição é a das peças, já conferida) |
| `l3-otica-em-pe` | proposta | em-pe | (posta sem mexer) | 4 peças à vista | passa | só Pôr na TV (a edição é a das peças, já conferida) |
| `l3-salao-em-pe` | proposta | em-pe | (posta sem mexer) | 4 peças à vista | passa | só Pôr na TV (a edição é a das peças, já conferida) |
| `l3-salao-quadrada` | proposta | quadrada | (posta sem mexer) | 2 peças à vista | passa | só Pôr na TV (a edição é a das peças, já conferida) |
| `l3-farmacia-deitada` | proposta | deitada | (posta sem mexer) | 4 peças à vista | passa | só Pôr na TV (a edição é a das peças, já conferida) |
| `l3-farmacia-quadrada` | proposta | quadrada | (posta sem mexer) | 2 peças à vista | passa | só Pôr na TV (a edição é a das peças, já conferida) |
| `l3-clinica-deitada` | proposta | deitada | (posta sem mexer) | 4 peças à vista | passa | só Pôr na TV (a edição é a das peças, já conferida) |
| `l3-clinica-em-pe` | proposta | em-pe | (posta sem mexer) | 4 peças à vista | passa | só Pôr na TV (a edição é a das peças, já conferida) |
| `l3-dentista-em-pe` | proposta | em-pe | (posta sem mexer) | 4 peças à vista | passa | só Pôr na TV (a edição é a das peças, já conferida) |
| `l3-dentista-quadrada` | proposta | quadrada | (posta sem mexer) | 2 peças à vista | passa | só Pôr na TV (a edição é a das peças, já conferida) |
| `l3-escritorio-deitada` | proposta | deitada | cabecalho-centro (2), indicador-turno (15), servico-semana (20), gente-destaque (6), servico-ramais (15), rodape-relogio (1) | 6/6 | passa |  |
| `l3-escritorio-em-pe` | proposta | em-pe | cabecalho-minimo (1), indicador-turno (15), servico-semana (20), gente-destaque (6), social-pesquisa (5), rodape-relogio (1) | 6/6 | passa |  |
| `l3-industria-deitada` | proposta | deitada | (posta sem mexer) | 4 peças à vista | passa | só Pôr na TV (a edição é a das peças, já conferida) |
| `l3-industria-quadrada` | proposta | quadrada | servico-epi (8), indicador-meta (8), cardapio-semana (14), ambiente-formas (2), rodape-relogio (1) | 5/5 | passa |  |
| `l4-padaria-deitada` | proposta | deitada | cabecalho-minimo (1), capa-produto (6), cardapio-trio (8), evento-foto (6), rodape-pagamento (5) | 5/5 | passa |  |
| `l4-padaria-em-pe` | proposta | em-pe | cabecalho-minimo (1), oferta-dupla (6), frase-faixa (5), horario-foto (9), aviso-faixa (4), rodape-selo (1) | 6/6 | passa |  aviso-faixa: lido no meio da animação |
| `l4-restaurante-deitada` | proposta | deitada | (posta sem mexer) | 4 peças à vista | passa | só Pôr na TV (a edição é a das peças, já conferida) |
| `l4-restaurante-em-pe` | proposta | em-pe | (posta sem mexer) | 4 peças à vista | passa | só Pôr na TV (a edição é a das peças, já conferida) |
| `l4-lanchonete-deitada` | proposta | deitada | (posta sem mexer) | 4 peças à vista | passa | só Pôr na TV (a edição é a das peças, já conferida) |
| `l4-lanchonete-em-pe` | proposta | em-pe | (posta sem mexer) | 4 peças à vista | passa | só Pôr na TV (a edição é a das peças, já conferida) |
| `l4-otica-deitada` | proposta | deitada | (posta sem mexer) | 4 peças à vista | passa | só Pôr na TV (a edição é a das peças, já conferida) |
| `l4-otica-em-pe` | proposta | em-pe | (posta sem mexer) | 4 peças à vista | passa | só Pôr na TV (a edição é a das peças, já conferida) |
| `l4-salao-deitada` | proposta | deitada | (posta sem mexer) | 4 peças à vista | passa | só Pôr na TV (a edição é a das peças, já conferida) |
| `l4-salao-em-pe` | proposta | em-pe | (posta sem mexer) | 4 peças à vista | passa | só Pôr na TV (a edição é a das peças, já conferida) |
| `l4-farmacia-deitada` | proposta | – | – | – | fora de época | não aparece no Prontos em novembro, de propósito (época 03-01 a 07-31); a foto do B3 foi montada direto |
| `l4-farmacia-em-pe` | proposta | em-pe | (posta sem mexer) | 4 peças à vista | passa | só Pôr na TV (a edição é a das peças, já conferida) |
| `l4-clinica-deitada` | proposta | deitada | (posta sem mexer) | 4 peças à vista | passa | só Pôr na TV (a edição é a das peças, já conferida) |
| `l4-clinica-em-pe` | proposta | em-pe | (posta sem mexer) | 4 peças à vista | passa | só Pôr na TV (a edição é a das peças, já conferida) |
| `l4-dentista-deitada` | proposta | deitada | (posta sem mexer) | 4 peças à vista | passa | só Pôr na TV (a edição é a das peças, já conferida) |
| `l4-dentista-em-pe` | proposta | em-pe | (posta sem mexer) | 4 peças à vista | passa | só Pôr na TV (a edição é a das peças, já conferida) |
| `l4-escritorio-deitada` | proposta | deitada | cabecalho-centro (2), capa-casa (6), numero-dado (4), aviso-faixa (4), rodape-selo (1) | 5/5 | passa |  |
| `l4-escritorio-em-pe` | proposta | em-pe | cabecalho-centro (2), editorial-moldura (5), diptico-servico (6), qr-foto (5), evento-foto (6), rodape-selo (1) | 6/6 | passa |  diptico-servico: lido no meio da animação; evento-foto: lido no meio da animação |
| `l4-industria-deitada` | proposta | deitada | (posta sem mexer) | 4 peças à vista | passa | só Pôr na TV (a edição é a das peças, já conferida) |
| `l4-industria-em-pe` | proposta | em-pe | (posta sem mexer) | 4 peças à vista | passa | só Pôr na TV (a edição é a das peças, já conferida) |
| `l5-padaria-deitada` | proposta | deitada | cabecalho-minimo (1), cena-capa (4), cena-oferta (5), cena-mosaico (3), cena-aberto (9), cena-frase (5), rodape-pagamento (5) | 7/7 | passa |  |
| `l5-padaria-em-pe` | proposta | em-pe | cabecalho-minimo (1), cena-oferta (5), cena-capa (4), cena-aberto (9), cena-frase (5), rodape-selo (1) | 6/6 | passa |  |
| `l5-restaurante-deitada` | proposta | deitada | (posta sem mexer) | 4 peças à vista | passa | só Pôr na TV (a edição é a das peças, já conferida) |
| `l5-lanchonete-deitada` | proposta | deitada | (posta sem mexer) | 4 peças à vista | passa | só Pôr na TV (a edição é a das peças, já conferida) |
| `l5-lanchonete-em-pe` | proposta | em-pe | (posta sem mexer) | 4 peças à vista | passa | só Pôr na TV (a edição é a das peças, já conferida) |
| `l5-escritorio-deitada` | proposta | deitada | cabecalho-centro (2), cena-boas-vindas (5), cena-faixa (5), cena-vaga (6), cena-numero (4), cena-frase (5), rodape-selo (1) | 7/7 | passa |  |
| `l5-escritorio-em-pe` | proposta | em-pe | cabecalho-centro (2), cena-boas-vindas (5), cena-capa (4), cena-aviso (4), cena-numero (4), rodape-selo (1) | 6/6 | passa |  cena-numero: lido no meio da animação |
| `l5-industria-deitada` | proposta | deitada | (posta sem mexer) | 4 peças à vista | passa | só Pôr na TV (a edição é a das peças, já conferida) |
| `l5-clinica-deitada` | proposta | deitada | (posta sem mexer) | 4 peças à vista | passa | só Pôr na TV (a edição é a das peças, já conferida) |
| `l5-clinica-em-pe` | proposta | em-pe | (posta sem mexer) | 4 peças à vista | passa | só Pôr na TV (a edição é a das peças, já conferida) |

## B2: coisas antigas e feias

### Como foi medido

- **Painel (`R4/b2/crawl.cjs`, `R4/b2/analisar.cjs`):** 26 páginas pelo
  endereço, 3 por dentro (Criando, Rápida, Sistema) e a página de cada TV;
  contas vazia, típica (com logo **escura** sem versão branca, 2 TVs, uma
  campanha, peças guardadas, 12 pessoas) e **antiga** (montada com dados de
  antes: os tipos que saíram do catálogo — texto, frase, arte/poster nas
  quatro variações, página web, composição com o fundo `#0a1020` — nas TVs e
  nas peças guardadas; config com layout que não existe, zonas em forma
  errada, JSON quebrado, `null`, `[]`; pessoa sem nome e sem data, 31/02,
  mês 13; data de calendário inválida; agenda com data em outro formato;
  logo que sumiu; cores corrompidas); claro e escuro; 1440 e 390: **380
  aberturas em 12 combinações**. Mede quebra, rolagem lateral, violeta fora
  do lugar (no escuro, qualquer violeta; no claro, o que não é o `#5B2EFF`
  da marca), ícone de brilho/varinha, letra que não é a Outfit, palavra em
  inglês ou técnica, dado de exemplo, vazio sem frase nem ação, botão sem
  nome.
- **TV (`R4/b2/tipos.mjs`):** cada tipo do "Adicionar" de cada frente
  (76 combinações), com o exemplo dela, em tela cheia e no Corporativo, e os
  tipos antigos; a logo escura no cabeçalho da TV e na peça.

**Depois dos consertos (última passada, as 380 aberturas):** 0 quebra, 0
rolagem lateral, 0 violeta fora do lugar no escuro (a ilustração do
achado 19 é de propósito), 0 ícone de
brilho/varinha, 0 letra fora da Outfit, 0 vazio sem frase nem ação, 0 link
morto. O que o robô ainda marca é dado da própria conta de teste (e-mail
`@teste.local`, "Post velho", "Novo poster", "Siga-nos" que a conta antiga
gravou), frase do produto ("Na TV o mês todo", "Sem buraco…") e o "API para
a intranet" (abaixo).

### Achados, com arquivo e linha

| # | Achado | Onde | Estado |
|---|---|---|---|
| 1 | Exemplo de outro negócio no texto das peças: "Desde 1987" e os outros anos de fundação, "Cabelo · Unhas · Estética", "(11) 99999-0000", a rede e a senha do Wi-Fi do exemplo, "@studiobella", o nome da padaria no texto de Comércio de peça que serve a toda loja | `pecas-ouro/cabecalho-centro.html:71`, `cabecalho-status.html:91`, `capa-casa.html:81`, `institucional-foto.html:55`, `numero-grande.html:99`, `numero-marco.html:49`, `social-wifi.html:111-112`; `pecas-ouro/manifesto.json` (textos de Comércio de 11 peças, os anos de 5 peças, o Wi-Fi nas 3 frentes e as telas l1, l2-ótica, l3 Wi-Fi ×5, l4, l5 boas-vindas ×4) | **consertado** (nenhum `estado` mudou) |
| 2 | A logo escura sem versão branca sumia no cabeçalho escuro (TV e peça) | `js/peca-render.js:206` (a placa; `:1369`, a mesma sem `:where()` para a TV antiga), `:762` (`precisaDePlaca`), `:766` (`logoNaPlaca`), `:2285`; `js/player.js:3428` (`placaNaLogo`: cabeçalho, espera, pareamento); `css/player.css:507` | **consertado**: placa clara só quando a logo não se lê no fundo (contraste < 3) |
| 3 | A mesa com o calendário em inglês (M T W T F S) no "Almoço de hoje" e nos cardápios do refeitório, e como foto fixa da tela `l4-escritorio-em-pe`, que também mostrava dois estranhos de terno do banco como a "confraternização" da equipe | `pecas-ouro/manifesto.json` (`fotosDaFrente` de `cardapio-dia-foto`, `cardapio-destaque`, `cardapio-quadro`; as fotos da `l4-escritorio-em-pe`, linhas 12676 e 12717), `web/src/lib/modelosOuro.js:87`; `js/peca-render.js` (`FOTOS_PADRAO.corporativo`) | **consertado**: o prato no refeitório; na tela, a sala de reunião e a mesa com café |
| 4 | A Empresas com a mesma foto padrão em toda peça (e o rosto de banco do rapaz no notebook) | `js/peca-render.js:993` (`VARIACOES`), `:998` (`fotoPadrao` com semente: a mesma peça, a mesma foto) | **consertado** |
| 5 | A fábrica via "Hoje: Black Friday … para a loja" no Início e no Criar | `js/seasons.js:157`, `server.js:1314` (as datas da frente da conta), `web/src/lib/ideiaDaData.js:14`, `web/src/pages/DashboardPage.jsx:142`, `CriarPage.jsx` | **consertado** |
| 6 | Conta antiga: "null/null", "Editar null", a pessoa sem nome nos aniversariantes | `web/src/pages/BirthdaysPage.jsx:39-40`, `server.js:1026-1027` | **consertado** |
| 7 | Data de calendário inválida como "undefined" / "NaN" | `web/src/lib/calendario.js:33`, `web/src/pages/CalendarioPage.jsx:195` | **consertado** ("sem data", "Data sem nome") |
| 8 | Agenda com data de antes ("31/12/2020") virava "Todo dia, até " pela metade | `web/src/lib/agenda.js:49` | **consertado** |
| 9 | Peça guardada de tipo antigo: miniatura vazia e o nome técnico ("pricetable", "xyz") | `web/src/components/content/DesignThumb.jsx:50`, `ItemPreview.jsx:193`, `:240` | **consertado** ("Conteúdo de uma versão antiga", a prévia de verdade) |
| 10 | Rótulos em inglês ou técnicos: "Cover/Contain", "CTA", "KPI", "Video", "Widgets", e os temas "Corporate Blue", "Glassmorphism", "Gold", "Clean White"… | `web/src/lib/contentTypes.js:28`, `:94`, `:136`, `:176`, `:191`, `:244`; `web/src/lib/screenConfig.js:108-115` | **consertado** |
| 11 | A varinha que sobrou (botão "Arrumar" do editor de composição) | `web/src/components/content/CompositionEditor.jsx:1024` | **consertado** (ícone de lista) |
| 12 | O nome da tela pronta com a empresa de exemplo ("Vértice Contabilidade · …") | `web/src/lib/telasProntas.js:56` (`nomeParaOCliente`) | **consertado** |
| 13 | O exemplo do nome na Marca de outra frente ("Ex.: Padaria Aurora" na Empresas) | `web/src/pages/BrandPage.jsx:60` | **consertado** (um por frente) |
| 14 | O Indicador do "Adicionar" ia ao ar com "NaN% da meta de undefined" e a barra vazia (Saúde e Empresas) | `js/render.js:1348` | **consertado** (a meta só com o número) |
| 15 | Os textos de Comércio do lote 3 a 5 são do negócio de exemplo e vão para todo o Comércio (`negocioDoModelo`, regra fixada em `test/fase10-interface.test.js`) | `pecas-ouro/manifesto.json` (`textos.comercio`) | **não consertado**: é a regra do Prontos, e as peças esperam aprovação; a galeria marca cada uma (ressalva 1) |
| 16 | Oito peças da proposta com foto de pessoa ficam com metade vazia sem a foto do cliente (o banco nunca põe rosto de estranho); `oferta-dupla` e `cena-mosaico` repetem a foto do banco nos dois espaços | as peças (`diptico-agenda`, `editorial-citacao`, `equipe-trio`, `gente-retrato`, `mural-foto`, `numero-marco`, `seguranca-foto`, `vaga-foto`) | **não consertado**: pede desenho novo (ou pedir a foto no Usar); fora do "não redesenhar" |
| 17 | Na TV de verdade, com o nome da conta (Grupo Horizonte, 15 letras) e o clima, a peça não cabe com a letra inteira e o piso cede: o cabeçalho com nome, clima, data e chamada em 12 telas (3,52% nas `l2/l3-industria-deitada`, com "Semana da segurança · até sexta"; 3,8% a 4,36% nas outras), uma peça da principal em pé ou quadrada com o nome em 6 (4,08% a 4,36%), o `numero-grande` da `l1-empresa-seguranca` (3,66%) e o rascunho da lanchonete (2,95%) | `pecas-ouro/cabecalho-classico.html`, `cabecalho-centro.html`, `cabecalho-chamada.html`; o piso cede em `js/peca-render.js` (`semCorte`) | **não consertado**: a régua confere com os nomes das marcas de exemplo e sem o clima, e passa; pede outro desenho do cabeçalho com chamada (fora do "não redesenhar"). Na galeria, cada uma vai a "rever" com a medida |
| 18 | "API para a intranet" (palavra técnica) | `web/src/pages/IntegracoesPage.jsx:436` | **não consertado**, de propósito: a seção é para a TI do cliente |
| 19 | O violeta da ilustração do vazio (a TV de exemplo) | `web/src/components/ui/Feedback.jsx:40-41` | **não consertado**, de propósito: é a cor da TV padrão (docs/MARCA.md) |

## B3: a galeria para o dono aprovar

`docs/qa-total/galeria-para-aprovar/index.html` (abre do disco, sem
internet, 3,1 MB, miniaturas WebP): cada uma das 170 que esperam (70
peças e 100 telas, 5 delas rascunho), na foto da TV como o cliente veria (a peça deitada e,
quando cabe, em pé e quadrada; a tela na TV dela), agrupadas por
recomendação, com o id e o motivo, e a lista pronta para colar.

| Recomendação | Peças | Telas | Total |
|---|---|---|---|
| Aprovar | 28 | 58 | 86 |
| Rever | 42 | 41 | 83 |
| Recusar | 0 | 1 | 1 |
| **Total** | 70 | 100 | 170 |

**Aprovar (86):** letra na régua na TV de verdade, nada cortado nem
sobreposto, sem texto de outro negócio nem dado de exemplo que pareça real,
edição conferida na TV. Da Empresas, 17 das 23 telas.

**Rever (83), pelos motivos** (uma pode ter mais de um):

- **Texto de Comércio de um negócio só** — 36 peças e 8 telas de uso geral
  do Comércio com o texto da padaria, da ótica, do salão, do restaurante ou
  da lanchonete: pela regra do Prontos aparecem para toda loja. Trocar o
  texto de Comércio por um neutro, ou deixar a peça só no pacote daquele
  negócio.
- **Letra abaixo da régua na TV de verdade** — 19 telas, com o nome da conta
  (Grupo Horizonte) e o clima: o cabeçalho com chamada (12), uma peça da
  principal em pé ou quadrada com o nome (6) e os dias sem acidente da
  `l1-empresa-seguranca` (3,66%). A régua, com as marcas de exemplo, passa
  (achado 17 do B2).
- **Foto de pessoa** — 8 peças ficam com metade vazia sem a foto do cliente
  (o banco nunca põe rosto de estranho; `oferta-dupla` repete a mesma foto
  nos dois espaços) e 9 telas do lote 4 mostram um estranho do banco como se
  fosse da equipe do cliente.
- **Rascunho** — 4 (o próprio manifesto diz que não estão prontos; a
  `rotasul-mural-da-equipe` traz aniversariantes de exemplo com nome).
- **Dado inventado que parece real** — convênios (`servico-convenios`,
  `l3-dentista-em-pe`) e número de CRO (`l3-dentista-quadrada`).
- **O olho** — em pé, a `l1-saude-totem` aperta a coluna dos passos e a
  `l2-industria-em-pe` deixa o "98 dias" pequeno no alto; na quadrada, o
  selo "20% OFF" da `l2-salao-quadrada` cobre o nome e a chamada.

**Recusar (1):** `lanchonete-terca-do-burger` — rascunho de antes dos
lotes, a tabela de bebidas com letra de 2,95% e o mesmo conteúdo já existe
no pacote da lanchonete dos lotes 4 e 5.

**Consertado no caminho (Empresas):** a `l4-escritorio-em-pe` trazia a mesa
com o calendário em inglês como foto fixa e dois estranhos de terno como a
"confraternização" da equipe; agora a sala de reunião e a mesa com café
(`pecas-ouro/manifesto.json`), e foi para "aprovar".

**Para aprovar rápido:** a galeria traz a lista dos 86 "aprovar" pronta
(`peca:id` ou `tela:id`, um por linha). Plataforma › Conteúdo pronto ›
"Marcar por lista" › colar › "Marcar estes" › "Aprovar selecionados".

**Aprovar de uma vez:** Plataforma › Conteúdo pronto não tinha seleção
múltipla. Agora tem "Marcar" em cada cartão, "Marcar todos daqui", "Marcar
por lista" (cole os ids da galeria) e **"Aprovar selecionados"**, num
pedido só que confere tudo antes de gravar (`POST
/api/plataforma/conteudo/lote`, `server.js:1459`,
`server/conteudoPronto.js:81`, `web/src/components/platform/ConteudoPronto.jsx`),
só para o operador, com teste (`test/aprovar-em-lote.test.js`: quem não é
operador recebe 404; um id errado devolve 400 e nada muda; a tela aprovada
aprova junto as peças dela que esperam; o manifesto não muda). **Conferido no
painel de verdade** (`R4/b3/aprovar-ui.cjs`): três itens voltados à espera,
colados na lista com um id que não existe, "Aprovar selecionados (3)",
os três aprovados e o aviso "Não achei: nao-existe".

## Testes e régua

- `env -u GITHUB_TOKEN npm test`: **2167 testes, 2166 passam, 1 pulado, 0
  falha.** Novos: `test/aprovar-em-lote.test.js` (o lote só para o
  operador, tudo ou nada, a tela leva as peças dela, o manifesto não muda) e
  `test/reteste4-modelos.test.js` (15: o QR do Wi-Fi, a conferência da
  faixa, o desenho trocado, a peça do Prontos sem dado de exemplo em toda
  peça e toda frente, os textos neutros, a placa da logo — também na TV
  antiga —, os tipos antigos e os rótulos, a data da frente, a foto do
  refeitório e a variação da Empresas, as fotos da `l4-escritorio-em-pe`, o
  Indicador sem meta, a agenda, o nome da tela).
- `cd web && npm run build`: passa. `npm run lint:nomes`: limpo.
- **`npm run regua`, inteira**, em três passadas, uma TV por vez
  (`REGUA_TVS`, como na máquina de pouca memória; porta 6191, 2 páginas):
  deitada **passou** (1613 s), em pé **passou** (1535 s), quadrada
  reprovou **num caso**: o QR da Saúde em tela cheia ("Avalie o seu
  atendimento", 4,46%) foi medido no meio da entrada — a foto da TV mostra o
  slide ainda transparente, e a zona medida tinha 1038 px em vez dos 1056 do
  mesmo caso no Comércio. Nada deste trabalho mexe no QR. Refeito só ele
  (`REGUA_TVS=quadrada REGUA_SO=qrcode`, com as peças e as telas de novo):
  **passou**, 4,5% nos dois, zona 1056 px.
- Em toda passada: peças-ouro 306 de 306 em tela cheia, 3366 de 3366 nas 11
  marcas, 363 de 363 cabeçalhos e rodapés, 12471 de 12471 sem texto sobre
  texto nem cortado, 101 de 101 telas prontas sem nada sobre nada, cortado
  ou para fora, contraste 13 de 13, texto padrão do "Adicionar" na TV 0 de
  18. Só medida (não bloqueia, como antes): 981 de 1122 peças com a letra
  inteira na principal da TV quadrada com rodapé.
- `SHELL_CACHE` em `mt-shell-v98` (`sw.js`), um acima do `v97`.
