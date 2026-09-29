# Estado do projeto

Retrato honesto do MultiTelas hoje, escrito para quem vai continuar o trabalho —
inclusive para mim mesmo daqui a duas semanas, ou numa conversa nova sem
histórico nenhum. A intenção declarada do produto é **qualidade com facilidade**:
arte de agência para quem não tem agência. Este documento avalia o sistema contra
essa régua, não contra uma lista de recursos.

Atualizado em: **29/09/2026** · 774 testes passando · `server.js` com ~2.200
linhas (cobrança e telas saíram para `server/routes/`).

---

## Onde paramos (leia isto primeiro)

A última rodada foi uma auditoria de ponta a ponta seguida da correção, em
ordem, de tudo o que ela achou (PR #108). Resumo do que mudou:

- **TV ligando sem internet** trocava a vitrine pela demonstração em 60s e
  nunca mais reconectava. Consertado e conferido no navegador.
- **Cobrança que vazava:** assinatura não acompanhava as telas, atraso sem
  consequência, estorno ignorado. Consertado (`server/cobranca.js`).
- **Promessas sem código** (relatório, SSO, marca branca) saíram do site.
- **Alerta de queda** respeita horário de funcionamento por tela.
- **Pacotes de crédito avulsos**, **QR no pareamento**, **recarregar TV
  remoto**, **selo "versão gratuita"** depois do teste.
- `no-undef` no CI achou e consertou dois bugs em produção: convite de equipe
  ("erro interno") e troca de senha no SQLite.

**O que falta para publicar não é código:** é configuração e jurídico —
[`LANCAMENTO.md`](LANCAMENTO.md), com um prompt pronto para o Cowork em
[`PROMPT-COWORK.md`](PROMPT-COWORK.md).

### Decisões que ficaram com o dono

- ~~`/legacy`~~ — decidido e feito: o painel antigo saiu, o endereço
  redireciona para `/app`.
- **App Android de quiosque** para TV Box (ver abaixo).

### TV Box: como fica plug and play

O player já é web e o pareamento já existe, então o aparelho só precisa ser um
navegador que abre `/tv` e não sai dali. O que já está pronto do lado do
servidor e do player:

- pareamento por **código ou QR** (a pessoa aponta o celular e cai no painel
  com o código preenchido);
- **ligar sem internet** mantém a última programação e reconecta sozinho —
  importante porque depois de queda de energia o box liga antes do roteador;
- **recarregar remoto** pelo painel e o **pulso conta aparelho e resolução**
  (`window.MTApp.versao`, se o app existir, aparece no cartão da tela);
- a pairing screen cabe em **1280×720**, a resolução de boa parte dos boxes.

O que falta é o **app Android** (WebView em tela cheia): abrir no boot,
manter a tela acesa, reabrir se travar, guardar a identidade da tela no
armazenamento do app (o navegador de algumas TVs apaga) e expor
`window.MTApp = { versao }`. Comercialmente: começar com o app na loja e o
cliente usando o aparelho que tem; kit pré-configurado com um modelo
homologado depois. Comodato de hardware, não (ver `ANALISE-PIXMIDIA.md`).

### Trabalho em paralelo

Regras para outro agente mexendo aqui ao mesmo tempo:
[`TAREFAS-ANTIGRAVITY.md`](TAREFAS-ANTIGRAVITY.md).

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
- **Cobrança como porta**: teste de 14 dias com uma tela; depois, a tela
  segue com selo e ligar tela nova pede assinatura. Webhook do Asaas com token
  comparado em tempo constante; pacotes creditados uma vez por pagamento.

## Onde a facilidade ainda escapa

Avaliação franca, com números do próprio código:

1. **Ajustes da tela tem 16 controles.** Um dono de padaria não sabe o que é
   "layout inteligente" nem "cores adaptativas". Faltam **padrões que já estejam
   certos** e um modo avançado que esconda o resto.

2. **99 tipos de conteúdo no catálogo.** É força na venda e peso no uso. A tela
   de adicionar precisa de um caminho curto ("o que você quer mostrar?") antes da
   grade completa.

3. **`server.js` ainda tem ~2.200 linhas.** Auth, equipe, cobrança e telas
   já saíram para `server/routes/`; IA, marca, mural e plataforma continuam
   lá. O `npm run lint:nomes` no CI é o que torna a extração segura.

4. **Falta parte do essencial de um editor tipo Canva.** Máscara de imagem
   entrou; **texto em curva e biblioteca de elementos gráficos** não.

## Próximos passos

**Antes de tudo: publicar** ([`LANCAMENTO.md`](LANCAMENTO.md)).

Depois, em ordem de impacto:

1. **App Android de quiosque** para TV Box.
2. **Relatório de exibição (proof-of-play)** — volta ao plano Pro quando existir.
3. **Grupos de telas** e **orientação da tela no pareamento**.
4. **Editor: texto em curva e biblioteca de gráficos.**
5. **Simplificar Ajustes da tela e o catálogo** (itens 1 e 2 acima).
6. **Recorte inteligente** da foto do acervo e **coerência entre peças**.
7. **SSE, limites e comandos em Redis** para rodar mais de uma instância.

## Convenções

- Comentários explicam **por quê**, não o quê. Preferência por registrar a
  decisão e o erro que ela evita.
- Sem framework no servidor e sem dependência pesada; `node:sqlite` em dev,
  Postgres em produção, mesma API assíncrona nos dois.
- Testes em `npm test` (**774 hoje**). `npm run lint:nomes` pega nome indefinido no servidor. Dois padrões que se
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
