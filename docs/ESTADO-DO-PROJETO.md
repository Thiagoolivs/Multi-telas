# Estado do projeto

Retrato honesto do MultiTelas hoje, escrito para quem vai continuar o trabalho —
inclusive para mim mesmo daqui a duas semanas, ou numa conversa nova sem
histórico nenhum. A intenção declarada do produto é **qualidade com facilidade**:
arte de agência para quem não tem agência. Este documento avalia o sistema contra
essa régua, não contra uma lista de recursos.

Atualizado em: **20/08/2026** · 522 testes passando · `server.js` com 2374 linhas.

---

## Onde paramos (leia isto primeiro)

Um plano de 10 passos, tirado de uma revisão de UX do dono do produto, foi
executado por inteiro. Está distribuído em três PRs:

| PR | passos | estado |
|---|---|---|
| [#96](https://github.com/Thiagoolivs/Multi-telas/pull/96) | 1–3 — rodapé de notícias infinito, IA do editor, teste de 14 dias | **mesclado** |
| [#97](https://github.com/Thiagoolivs/Multi-telas/pull/97) | 4–6 — pincel de formatação, avisos de criação, IA guiada | **mesclado** |
| [#98](https://github.com/Thiagoolivs/Multi-telas/pull/98) | 7–10 — três marcas + site de referência, painel da plataforma, animação, sobras de segurança | **aberto, rascunho, CI verde** |

Branch de trabalho: `claude/corporate-tv-multi-screen-fgk4g8`.

### Duas coisas dependem do dono, não do código

1. **`ADMIN_EMAILS` precisa ser definida no Railway** com o e-mail de quem opera.
   Sem ela o painel da plataforma **não aparece e não responde** — é de propósito:
   "sem configuração, o dono da primeira conta vira operador" transformaria uma
   instalação nova numa porta aberta.
2. **A leitura de um site real nunca foi testada de verdade.** O proxy do
   ambiente de desenvolvimento bloqueia HTTP externo (403), então `server/site.js`
   só foi exercitado contra servidores locais. Precisa ser conferido em produção
   colando o endereço de um cliente e vendo se as cores e fontes saem certas.

---

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

3. **Fontes vêm da Google.** `js/theme.js` e `web/src/lib/fontes.js` buscam de
   `fonts.googleapis.com`. TV com rede ruim ou bloqueada cai na fonte de sistema,
   que é mais larga — e todo o cálculo de "cabe na caixa" vira estimativa errada.
   As fontes são OFL: dá para servir do próprio domínio. **É a melhor relação
   qualidade/esforço aberta.**

4. **`server.js` tem 2374 linhas** de roteamento manual — quase o dobro de quando
   isto foi anotado pela primeira vez. Passou do ponto em que separar por domínio
   era luxo.

5. **Falta o essencial de um editor tipo Canva.** Ganhou pincel, réguas, modelos e
   animação, mas ainda **não tem camada com máscara, texto em curva nem
   biblioteca de elementos gráficos**. Sem esses três, a meta de "80% das funções
   do Canva" não está cumprida, e é honesto dizer isso.

## Próximos passos

Em ordem de impacto, e sem nada começado:

1. **Editor: máscara, texto em curva e biblioteca de gráficos.** É o bloco que
   fecha a promessa de paridade com o Canva. O maior dos três em esforço.
2. **Auto-hospedar as fontes** — conserta a causa raiz do texto estourado, e é
   barato.
3. **Quebrar `server.js` por domínio.** Não muda nada para o usuário, mas cada
   passo futuro fica mais barato.
4. **A IA olhar a peça pronta.** A crítica de hoje lê o relatório do validador;
   renderizar em PNG e devolver pela visão pegaria colisão, respiro torto e logo
   sobre rosto — coisas que nenhum validador expressa.
5. **Prompt de imagem ciente do layout** ("deixe o terço inferior limpo"), em vez
   de remendar com véu depois.
6. **Medir texto com as métricas reais da fonte** em vez da largura média por
   caractere.
7. **Simplificar Ajustes e o catálogo** (itens 1 e 2 acima).
8. **Recorte inteligente** da foto do acervo (hoje corta pelo centro).
9. **Coerência entre peças** — cada uma é composta isolada da anterior.

## Convenções

- Comentários explicam **por quê**, não o quê. Preferência por registrar a
  decisão e o erro que ela evita.
- Sem framework no servidor e sem dependência pesada; `node:sqlite` em dev,
  Postgres em produção, mesma API assíncrona nos dois.
- Testes em `npm test` (**522 hoje**, em 39 arquivos). Dois padrões que se
  provaram:
  - **Renderizar e olhar.** Screenshot pegou bugs que teste nenhum pegou —
    componente desmontado, texto estourando, botão que não fazia nada, cabeçalho
    que não mudava.
  - **Conferir o teste ao contrário.** Reintroduzir o defeito e exigir que o
    teste falhe. Nas últimas rodadas isso revelou **sete testes meus que estavam
    errados** — entre eles um regex de keyframes que via 2 de 15 blocos e tornava
    quase vazias as duas regras principais da animação.
