# Estado do projeto

Retrato honesto do MultiTelas hoje, escrito para quem vai continuar o trabalho —
inclusive para mim mesmo daqui a duas semanas, ou numa conversa nova sem
histórico nenhum. A intenção declarada do produto é **qualidade com facilidade**:
arte de agência para quem não tem agência. Este documento avalia o sistema contra
essa régua, não contra uma lista de recursos.

Atualizado em: **20/08/2026** · 547 testes passando · `server.js` com 2418 linhas.

---

## Onde paramos (leia isto primeiro)

Um plano de 10 passos, tirado de uma revisão de UX do dono do produto, foi
executado por inteiro e **está todo em `main`** (PRs [#96][96], [#97][97] e
[#98][98], mesclados). Depois disso veio o trabalho de publicação: **fontes
próprias** e **observabilidade**.

[96]: https://github.com/Thiagoolivs/Multi-telas/pull/96
[97]: https://github.com/Thiagoolivs/Multi-telas/pull/97
[98]: https://github.com/Thiagoolivs/Multi-telas/pull/98

**A decisão que manda agora: publicar esta semana.** O que falta para isso não
é código — é configuração no Railway e revisão jurídica. A lista está em
[`LANCAMENTO.md`](LANCAMENTO.md), que voltou a ser verdadeira (ficou meses
dizendo que faltavam CI, landing e cabeçalhos de segurança muito depois de os
três existirem).

### O que depende do dono, não do código

1. **Quatro variáveis no Railway**, e nenhuma é opcional: `STORAGE=s3` com as
   chaves do R2 (sem elas, **toda mídia some no próximo deploy**),
   `STRIPE_PRICE_*` e `STRIPE_WEBHOOK_SECRET` (sem eles não há checkout),
   `ADMIN_EMAILS` (sem ela o painel da plataforma não aparece e não responde —
   de propósito) e `APP_URL`/`SUPPORT_EMAIL` do domínio próprio.
2. **Revisão jurídica dos Termos**, e então `LEGAL_REVISADO=true` para o aviso
   de rascunho sair das páginas.
3. **A leitura de um site real nunca foi testada de verdade.** O proxy do
   ambiente de desenvolvimento bloqueia HTTP externo (403), então
   `server/site.js` só rodou contra servidores locais. Precisa ser conferido em
   produção colando o endereço de um cliente e vendo se as cores e as fontes
   saem certas.

### Já decidido, adiado de propósito

**A cobrança vai sair do Stripe e ir para o Asaas.** Não entra antes de
publicar. `server/billing.js` é o único lugar que fala com o provedor, e
`server/plans.js` guarda o catálogo separado dele — a troca é contida.

## Como o sistema está montado

```
TV (player)                    Painel (React)              Servidor (Node)
─────────────                  ──────────────              ───────────────
player.html                    web/src/pages/*             server.js  (rotas)
 js/player.js  playlist        MyDesignsPage   campanhas   server/ai-director.js
 js/render.js  desenha item    ContentEditor   telas       server/composer.js
 js/animacao.js  entradas      BrandPage       identidade  server/design-system.js
 js/theme.js   cores           PlatformPage    operação    server/db-*.js
 js/cloud.js   SSE + passe     SettingsPage    conta       server/storage.js (R2)
 offline-first (SW)            build → /app                server/site.js (SSRF)
                                                           server/log.js   linhas
                                                           server/erros.js grupos

 fonts/  as 14 famílias (OFL), servidas por nós — ver tools/baixar-fontes.mjs
```

O player é vanilla e funciona sem rede: guarda a última configuração e continua
exibindo. Isso não é detalhe — é o que separa signage de site.

**Módulos UMD (fonte única):** `js/cor.js`, `js/seasons.js`, `js/animacao.js`.
Cada um funciona como global de navegador, `require()` no Node e `import` no
Vite. O lado ESM importa por efeito colateral e **reexporta `globalThis.MTx`** —
nunca uma cópia. Quebrar isso ressuscita a classe de bug que o `js/cor.js`
existe para matar.

**Armadilhas que já custaram caro** (cada uma virou comentário no código):

- `cqw` é % da **largura** da peça. `x`/`w` são % da largura; `y`/`h` são % da
  altura. Misturar os dois é o bug mais recorrente do editor.
- CSP tem `script-src 'self'`, sem `unsafe-inline`: script embutido no HTML
  simplesmente não roda, e não avisa.
- `res.writeHead(status, headers)` **não** sobrepõe o que já foi posto com
  `res.setHeader()`. Uma correção de cabeçalho feita no `writeHead` vira
  decoração silenciosa.
- A config do dispositivo é `{ settings: { layoutId }, zonas: { principal: {
  items: [] } } }` — não `layout`/`zones`.
- **Família nova no catálogo pede `node tools/baixar-fontes.mjs`.** Sem isso a
  fonte não existe no domínio, a CSP recusa buscá-la fora, e o texto sai na
  fonte de sistema — mais larga que a medida. `test/fontes-proprias.test.js`
  falha antes disso chegar à parede de alguém.

## A tese do motor de IA

**O modelo dirige; o código garante que dê para ler.**

A IA decide quantas peças, o que cada uma diz, qual direção de arte e se precisa
de foto. Nada disso chega à tela sem passar por `server/composer.js`, que corrige
contraste, área segura, sobreposição e texto que não cabe. Uma peça bonita e
ilegível é uma peça errada, e modelo nenhum garante legibilidade sozinho.

O pipeline hoje: **briefing → plano → imagens → composição → crítica**. A crítica
devolve ao modelo o que o validador precisou consertar e refaz a peça, mas só
onde houve problema, e só substitui se a nova versão tiver *menos* conserto.

Roda como trabalho em segundo plano (`server/jobs.js`) porque leva minutos.

## O que já funciona bem

- **Identidade que atravessa o sistema.** Cores, fontes, logo e fotos cadastradas
  em Marca valem na geração de peça **e** no tema da TV. Precedência clara:
  pedido > marca salva > escolha do modelo. Agora são **até 3 marcas por conta**,
  com troca da marca ativa; o resto do sistema continua perguntando pela "marca"
  no singular e recebe a ativa.
- **O site do cliente como referência de estilo.** Cola-se o endereço e saem
  cores (por frequência, descartando preto/branco/cinza), fontes e a imagem que o
  site publica como sua cara. O resumo entra no prompt **marcado como material de
  referência** e fica visível na tela — resumo escondido que vai para o prompt é
  como a IA erra sem ninguém saber por quê.
- **O acervo do cliente vence a foto inventada.** O diretor escolhe entre as
  fotos da empresa antes de gerar — mais barato e mais verdadeiro.
- **Legibilidade medida, não estimada.** Contraste calculado em todo lugar: peça,
  tema derivado da marca, rodapé colorido. A matemática mora em `js/cor.js`,
  uma vez só.
- **Editor de peça** com redimensionamento que funciona, pincel de formatação,
  Alt+arrastar para duplicar, réguas, modelos de partida e IA guiada (o pedido
  pergunta o quê, onde, de que cor e de que tipo — texto, forma ou ícone).
- **Elementos que entram animados**, estilo mídia indoor: 8 entradas, 4
  movimentos contínuos, duração e espera por elemento, e um botão que escalona a
  peça inteira. Só `transform` e `opacity` — há teste percorrendo todas as
  keyframes recusando qualquer propriedade que force layout, porque numa TV de
  R$ 900 é a diferença entre fluido e travando.
- **Painel da plataforma**, separado do painel do cliente: telas vivas, contas,
  tempo de uso, funções mais usadas, reclamações. Porta única no topo, raiz de
  confiança em `ADMIN_EMAILS`, e responde **404** a quem não pode — 403
  confirmaria que a pessoa achou o endereço certo.
- **Publicar campanha inteira** em várias telas, filtrando por formato.
- **LGPD** com aceite versionado, exportar e excluir de verdade — inclusive as
  fotos do mural, que são dado pessoal de terceiros.
- **Música de fundo por tela**, com controle remoto ao vivo (SSE) e vídeo que
  abaixa a trilha em vez de brigar com ela.
- **Mural de fotos por QR**: o público manda foto pelo celular (câmera **ou**
  galeria) e ela entra na TV em segundos, com botão de pânico que limpa a tela e
  fecha o mural num clique. O QR é desenhado pelo próprio servidor, sem serviço
  externo.
- **Player robusto**: offline, pré-carga da próxima mídia, fallback quando a IA
  ou o feed caem. Painel e player são **instaláveis** (PWA).
- **Onboarding** (`PrimeirosPassos.jsx`): quem cria conta não cai mais num painel
  vazio.
- **A tipografia é nossa.** As 14 famílias (todas OFL) moram em `fonts/`, com a
  licença de cada uma junto. Enquanto vinham da Google, a fonte que a TV
  desenhava dependia da rede do cliente — e quando não chegava, o navegador
  caía na fonte de sistema, mais larga, estourando o texto que o compositor
  tinha medido. Sem erro, sem log, só na parede. A CSP fechou os dois hosts
  externos para que um retorno acidental falhe no primeiro teste.
- **Dá para ver o que quebrou.** Log estruturado (`server/log.js`) sem dado
  pessoal nem segredo, e erros agrupados por assinatura (`server/erros.js`)
  visíveis no painel da plataforma. Antes disso o servidor falava por
  `console.warn(e.message)` em quinze lugares: sem pilha, sem contexto, e uma
  promessa rejeitada derrubava o processo levando o motivo junto.

## Segurança: o que está fechado

Auditoria ponta a ponta feita em três rodadas (PRs #95, #97, #98):

- **SSE sem segredo eterno na URL.** `EventSource` é a única API do navegador que
  não deixa mandar cabeçalho, então o token da TV ia em `/events?dt=` — e URL vai
  parar em log de acesso, log de proxy e painel do provedor. Hoje a TV troca o
  token (num POST, com cabeçalho) por um **passe de 1 minuto, uso único, preso
  àquela tela**. `?dt=` deixou de ser aceito.
- **SVG servido isolado**: `sandbox` + `default-src 'none'` + `attachment`,
  presos ao arquivo em vez de depender só do CSP global.
- **SSRF por construção** em `server/site.js`, porque o endereço é escolhido pelo
  usuário: allowlist de esquema, faixas internas bloqueadas (incluindo
  **169.254**, metadados da nuvem), **conexão fixada no IP já conferido** (`fetch`
  resolveria o nome de novo — essa janela é o DNS rebinding inteiro), redirect
  seguido à mão com no máximo 3 saltos e re-checagem em cada um, tetos de tempo,
  tamanho e chamadas por hora.
- **Cobrança como porta**: dá para entrar e explorar, mas cadastrar a primeira
  tela exige pagamento; teste de 14 dias.

## Onde a facilidade ainda escapa

Avaliação franca, com números do próprio código:

1. **Ajustes da tela tem 16 controles.** Um dono de padaria não sabe o que é
   "layout inteligente" nem "cores adaptativas". Faltam **padrões que já estejam
   certos** e um modo avançado que esconda o resto.

2. **99 tipos de conteúdo no catálogo.** É força na venda e peso no uso. A tela
   de adicionar precisa de um caminho curto ("o que você quer mostrar?") antes da
   grade completa.

3. **O texto ainda é medido por estimativa.** Com a fonte servida por nós, a
   causa raiz do texto estourado foi embora — a fonte que a TV desenha é a
   mesma que o compositor mediu. Mas a medida continua sendo a largura média
   por caractere (`largura`, em `js/fontes.js`), e não as métricas reais da
   fonte. Antes isso não valia a pena, porque a fonte podia nem chegar; agora
   o arquivo está em `fonts/` e dá para medir de verdade no servidor.

4. **`server.js` tem 2418 linhas** de roteamento manual — quase o dobro de quando
   isto foi anotado pela primeira vez. Passou do ponto em que separar por domínio
   era luxo.

5. **Falta o essencial de um editor tipo Canva.** Ganhou pincel, réguas, modelos e
   animação, mas ainda **não tem camada com máscara, texto em curva nem
   biblioteca de elementos gráficos**. Sem esses três, a meta de "80% das funções
   do Canva" não está cumprida, e é honesto dizer isso.

## Próximos passos

**Antes de tudo: publicar.** O que falta não é código, e a lista está em
[`LANCAMENTO.md`](LANCAMENTO.md). Enquanto as variáveis do Railway não
estiverem definidas, nada do que vem abaixo chega a um cliente.

Depois, em ordem de impacto e sem nada começado:

1. **Editor: máscara, texto em curva e biblioteca de gráficos.** É o bloco que
   fecha a promessa de paridade com o Canva. O maior dos três em esforço.
2. **Trocar o Stripe pelo Asaas.** Já decidido; adiado para não segurar a
   publicação. `server/billing.js` é o único lugar que fala com o provedor.
3. **Verificação de e-mail no cadastro.** O envio existe, falta o fluxo — hoje
   dá para criar conta com o e-mail de outra pessoa.
4. **Quebrar `server.js` por domínio.** Não muda nada para o usuário, mas cada
   passo futuro fica mais barato.
5. **A IA olhar a peça pronta.** A crítica de hoje lê o relatório do validador;
   renderizar em PNG e devolver pela visão pegaria colisão, respiro torto e logo
   sobre rosto — coisas que nenhum validador expressa.
6. **Prompt de imagem ciente do layout** ("deixe o terço inferior limpo"), em vez
   de remendar com véu depois.
7. **Medir texto com as métricas reais da fonte** em vez da largura média por
   caractere — agora possível, porque o arquivo da fonte é nosso.
8. **Simplificar Ajustes e o catálogo** (itens 1 e 2 acima).
9. **Recorte inteligente** da foto do acervo (hoje corta pelo centro).
10. **Coerência entre peças** — cada uma é composta isolada da anterior.

## Convenções

- Comentários explicam **por quê**, não o quê. Preferência por registrar a
  decisão e o erro que ela evita.
- Sem framework no servidor e sem dependência pesada; `node:sqlite` em dev,
  Postgres em produção, mesma API assíncrona nos dois.
- Testes em `npm test` (**547 hoje**, em 41 arquivos). Dois padrões que se
  provaram:
  - **Renderizar e olhar.** Screenshot pegou bugs que teste nenhum pegou —
    componente desmontado, texto estourando, botão que não fazia nada, cabeçalho
    que não mudava.
  - **Conferir o teste ao contrário.** Reintroduzir o defeito e exigir que o
    teste falhe. Nas últimas rodadas isso revelou **nove testes meus que estavam
    errados** — entre eles um regex de keyframes que via 2 de 15 blocos e tornava
    quase vazias as duas regras principais da animação, e dois do coletor de
    erros que passavam com o teto de grupos desligado. O segundo desses, ao ser
    consertado, descobriu um buraco real: `origem()` filtrava `node:internal` e
    deixava passar `node:fs`.
