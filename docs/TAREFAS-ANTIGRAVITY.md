# Tarefas para o Antigravity

Documento de trabalho paralelo. Escrito para outro agente mexer neste
repositório **ao mesmo tempo** que o Claude, sem que um desfaça o outro.

Base: `main` em `f08385e` · 601 testes · atualizado em 21/08/2026.

---

## Regra número um

> **Não reescreva decisão que já foi tomada. Conserte defeito e amplie o que
> já existe.**

Quase toda escolha estranha neste repositório tem um comentário logo acima
dizendo **por que** ela é assim e **que erro ela evita**. Esses comentários não
são decoração: cada um deles é uma cicatriz. Antes de "limpar" ou "simplificar"
qualquer trecho, leia o comentário. Se ele explica um defeito real, a
simplificação vai ressuscitar o defeito.

Três coisas são bem-vindas:

1. **Bug que passou.** Se algo está errado, conserte — inclusive em código
   escrito pelo Claude. Nada aqui é intocável por autoria.
2. **Feature existente que precisa crescer.** Ampliar o que já está lá.
3. **Feature nova da lista abaixo**, na parte marcada como livre.

Uma coisa não é: **trocar a abordagem de algo que funciona** porque outra
pareceria mais elegante. Se você achar que uma decisão está errada, escreva o
porquê num comentário ou num PR e deixe o dono decidir — não troque em
silêncio.

---

## O que NÃO pode ser desfeito

Cada item abaixo já quebrou o produto uma vez. A linha em *itálico* é o que
acontece se for desfeito.

### Produto

**A tela nunca para.** A cobrança controla a criação assistida por IA, e só
ela. Os freios (`server/limites.js`) medem o tráfego do player mas **nunca o
bloqueiam** — só o painel é bloqueado.
*Desfazer = a TV de uma recepção apaga por causa de uma fatura ou do laço no
painel de outra pessoa, na parede, na frente dos clientes dele.*

**Peça ilegível é peça errada.** Nada que a IA gera chega à tela sem passar por
`server/composer.js`, que corrige contraste, área segura, sobreposição e texto
que não cabe.
*Desfazer = arte bonita e ilegível a três metros de distância.*

### Dinheiro

**Toda imagem gerada confere saldo ANTES e cobra DEPOIS do sucesso.** Vale para
a rota avulsa e para cada imagem de dentro da campanha (`campanha-peca`).
*Desfazer = a operação mais cara do produto volta a ser de graça. Já foi assim:
uma campanha custava R$ 1,20–1,60 de verdade, o sistema registrava R$ 0,05 e
debitava zero.*

**O pedido da pessoa é LIMITE, não sugestão.** Quantidade, formatos e o modo de
imagem escolhidos na tela cortam o plano do modelo — não o inspiram.
*Desfazer = "gerar campanha" volta a produzir seis peças em três formatos que
ninguém pediu, cada uma podendo custar uma imagem paga.*

**A cópia entre formatos reusa a imagem do original.** A mesma manchete em 16/9
e 9/16 aponta para o mesmo arquivo.
*Desfazer = duas imagens quase idênticas, cobradas duas vezes, porque o prompt
era o mesmo.*
Guardado por `test/campanha-custo.test.js`.

### Segurança

**`ADMIN_EMAILS` e `CONTAS_CORTESIA` são listas separadas.** Uma dá acesso aos
dados de TODOS os clientes; a outra dá plano pago dentro da própria conta.
Nunca as una, nunca faça uma cair na outra por `||`.
*Desfazer = acrescentar um testador vira "essa pessoa vê todos os clientes".*
Guardado por `test/cortesia.test.js`.

**`/api/diagnostico` é do OPERADOR, não do `role === 'owner'`.** `owner` é o
dono de uma empresa cliente; a rota devolve `process.env` interpretado (banco,
provedor de IA, bucket, textos legais).
*Desfazer = cada cliente enxerga a infraestrutura de quem vende o produto.*

**Rotas da plataforma respondem 404, não 403.**
*Desfazer = 403 confirma a quem tentou que o endereço existe e que só falta o
crachá.*

**O SSE usa passe curto, nunca `?dt=`.** `EventSource` não manda cabeçalho, e
o token da TV não expira; URL vai parar em log de acesso, log de proxy e painel
do provedor.
*Desfazer = quem ler qualquer log lê a config da tela para sempre.*

**SSRF em `server/site.js`:** allowlist de esquema, faixas internas bloqueadas
(inclusive 169.254), **conexão fixada no IP já conferido**, redirect seguido à
mão com re-checagem.
*Desfazer o IP fixado = DNS rebinding inteiro de volta, porque `fetch`
resolveria o nome outra vez.*

**Log sem dado pessoal nem segredo.** `server/log.js` mascara e-mail e oculta
campo com cara de segredo, casando por **pedaço** do nome.
*Desfazer = token vazado em log, e-mail de cliente fora do controle do titular.*

### Player e TV

**Fontes servidas do próprio domínio; CSP fechada para `fonts.googleapis.com` e
`fonts.gstatic.com`.** O compositor mede texto pela largura média de caractere;
se a fonte que a TV desenha não for a medida, o texto estoura.
*Desfazer = título estourando a peça, sem erro e sem log, só na parede.*
Família nova no catálogo **exige** `node tools/baixar-fontes.mjs`.

**O letreiro repete o texto até cobrir a tela mais uma cópia, e a volta anda em
PIXELS.** Duas cópias e `-50%` só fecham a emenda quando uma cópia é mais larga
que a tela.
*Desfazer = faixa vazia atravessando a tela (medido: 1040px com uma mensagem).*

**Animação: só `transform` e `opacity`.** Entrada roda `1`, contínua roda
`infinite` — e nas regras combinadas os dois valores vão juntos (`1, infinite`).
*Desfazer o par = a entrada repete para sempre; animar top/left = TV travando.*

**Subir `SHELL_CACHE` (`sw.js`) ao mexer em `player.html`, `js/*` ou
`css/player.css`.**
*Esquecer = a correção não chega a nenhuma TV já pareada; o cache serve a
versão velha para sempre.*

**Player offline-first.** Ele guarda a última configuração e continua
exibindo sem rede. É o que separa signage de site.

### Servidor

**Módulos UMD (`js/cor.js`, `js/seasons.js`, `js/animacao.js`, `js/fontes.js`):**
o lado ESM importa por efeito colateral e **reexporta `globalThis.MTx`** —
nunca uma cópia.
*Desfazer = editor e TV desenham coisas diferentes, e ninguém entende por quê.*

**Trabalhos de IA: escritas em FILA por trabalho; leitura vê memória antes do
banco.**
*Desfazer a fila = no Postgres o UPDATE do resultado chega antes do INSERT, não
encontra a linha, não reclama, e o trabalho some.*

**Erros ficam em MEMÓRIA (`server/erros.js`), não no banco.**
*Desfazer = uma escrita por erro justamente quando o sistema já está mal, e
erro dentro do banco vira laço de erro gravando erro.*

**`PRAGMA busy_timeout` vem ANTES de `journal_mode = WAL`, e a ordem é o
conserto.** Trocar o modo de diário exige lock exclusivo: é a instrução que
mais precisa do tempo de espera.
*Desfazer = "database is locked" no boot, e a instância nova morre depois de um
deploy enquanto a velha ainda roda.*

**Coluna nova passa por `garantirColuna`, nunca por `ALTER TABLE` solto.** As
migrações perguntam "esta coluna existe?" e só então criam — duas operações, e
entre uma e outra outro processo pode ter criado.
*Desfazer = "duplicate column name" quando duas instâncias sobem juntas, que é
o que o Railway faz a cada deploy.*
Guardado por `test/banco-concorrente.test.js`.

### Armadilhas que já custaram caro

- `cqw` é % da **largura** da peça. `x`/`w` são % da largura; `y`/`h` são % da
  **altura**. Misturar é o bug mais recorrente do editor.
- CSP tem `script-src 'self'` sem `unsafe-inline`: **script embutido no HTML
  não roda, e não avisa.**
- `res.writeHead(status, headers)` **não** sobrepõe o que foi posto com
  `res.setHeader()`. Correção de cabeçalho feita no `writeHead` vira decoração
  silenciosa.
- A config do dispositivo é `{ settings: { layoutId }, zonas: { principal: {
  items: [] } } }` — **não** `layout`/`zones`.

---

## Como trabalhar sem colidir

**Arquivos de alto risco de conflito** (o Claude mexe muito neles):
`server.js`, `web/src/pages/PlatformPage.jsx`,
`web/src/components/content/CompositionEditor.jsx`.

Se a sua tarefa exige mexer neles, prefira **acrescentar** num ponto novo a
reorganizar o que já está lá.

**Não faça, sem combinar antes:**
- Quebrar `server.js` (2672 linhas) por domínio. É a refatoração certa e está
  na lista — mas feita em paralelo garante conflito em tudo.
- Trocar o Stripe pelo Asaas. Já decidido, adiado de propósito, e toca
  `server/billing.js`, `server/plans.js` e a tela de Plano ao mesmo tempo.
- Renomear qualquer coisa "por consistência".

---

## Como saber que não quebrou nada

```bash
npm test                       # 601 testes, 44 arquivos
npm --prefix web run build     # erro de import passa em todo teste e só aparece aqui
```

**A prática da casa: conferir o teste ao contrário.** Depois de escrever um
teste, reintroduza o defeito que ele deveria pegar e **exija que ele falhe**.
Nas últimas rodadas isso revelou **cinco testes que não guardavam nada** — um
deles cobria exatamente o bug do letreiro e passava com o bug no lugar, porque
perguntava "o código está escrito daquele jeito?" em vez de "o texto cobre a
tela?".

Se um teste falhar de forma intermitente, **não marque como flaky**. As três
últimas intermitências eram bugs reais: escritas fora de ordem no Postgres,
falta de `busy_timeout`, e migração de coluna assumindo que estava sozinha.

E se algo passar aqui e quebrar no CI, **o CI está certo**: ele roda um
processo por arquivo de teste contra o mesmo banco, que é a mesma disputa que o
Railway cria a cada deploy ao subir a instância nova antes de derrubar a velha.

E o segundo padrão que se provou: **renderizar e olhar.** Screenshot pegou bugs
que teste nenhum pegou — componente desmontado, texto estourando, botão que não
fazia nada. Chromium está disponível.

---

## Tarefas

### A · Bugs e acabamento — livre, pode pegar

Trabalho contido, baixo risco de conflito.

- [ ] **A1 · Orientação da tela no pareamento.** O filtro de formato ao
      publicar assume paisagem. Guardar a orientação no pareamento e usá-la.
- [ ] **A2 · Recorte inteligente da foto do acervo.** Hoje corta pelo centro,
      e corta rosto. Detectar região de interesse antes de cortar.
- [ ] **A3 · O upload ainda avisa por `alert()`.** Três pontos em
      `web/src/components/content/CompositionEditor.jsx` (linhas ~600, ~667,
      ~675) e sete em `js/admin.js`. O alerta do navegador rouba o foco, some
      ao primeiro clique e não sobrevive a trocar de aba. A barra da IA no
      mesmo arquivo já mostra o padrão a seguir.
- [ ] **A4 · A árvore de pastas do README está velha** — não cita `server/`,
      `web/` nem `test/` corretamente. Só documentação.
- [ ] **A5 · Varrer o editor atrás de `x`/`w` usados com % de altura** (e
      vice-versa). É o bug mais recorrente do editor e provavelmente ainda há
      casos.

### B · Features novas — livre, pode pegar

Não encostam no que o Claude está mexendo.

- [ ] **B1 · Verificação de e-mail no cadastro.** O envio já existe
      (`server/mail.js`); falta o fluxo. **Hoje dá para criar conta com o
      e-mail de outra pessoa.** É o mais valioso desta seção.
      Cuidado: não bloqueie o login de quem já tem conta sem verificar — a
      migração precisa ser suave.
- [ ] **B2 · Grupos de telas** + publicar para o grupo. Puxa venda corporativa.
- [ ] **B3 · Proof-of-play / relatórios** — o que tocou, quando, em qual tela.
      Forte na venda corporativa. Já há `eventos` no banco para se apoiar.
- [ ] **B4 · Medir o custo real de IA** em vez de estimar. Hoje
      `server/creditos.js` usa R$ 0,35 por imagem e R$ 0,05 por texto como
      número fixo. Registrar tokens de entrada/saída por chamada e trocar a
      estimativa por dado. **Não mexa nas regras de cobrança** — só na medição.
- [ ] **B5 · Medir texto com as métricas reais da fonte** em vez da largura
      média por caractere (`largura` em `js/fontes.js`). Agora que o arquivo da
      fonte é nosso, dá para medir de verdade. Isso melhora a qualidade de toda
      peça gerada.

### C · Editor — livre, é o maior bloco

Fecha a promessa de paridade com o Canva. Os três são independentes entre si.

- [ ] **C1 · Camada com máscara.**
- [ ] **C2 · Texto em curva.**
- [ ] **C3 · Biblioteca de elementos gráficos.**

Ao mexer em `CompositionEditor.jsx`, prefira componentes novos a reorganizar o
que existe — é o arquivo que o Claude mais toca.

### D · Simplificação de uso — livre, precisa de cuidado de produto

- [ ] **D1 · Ajustes da tela tem 16 controles** (10 campos + 6 caixas de
      marcar). Um dono de padaria não sabe o que é "layout inteligente" nem
      "cores adaptativas". Faltam **padrões que
      já estejam certos** e um modo avançado que esconda o resto.
      **Não remova controle nenhum** — esconda.
- [ ] **D2 · Catálogo de conteúdo grande demais** (68 modelos em
      `js/templates.js` + os tipos de `js/render.js`). Falta um caminho curto
      ("o que você quer mostrar?") antes da grade completa. Mesma regra: o
      caminho curto é um atalho, não uma amputação.

### E · Combinar antes de começar

- [ ] **E1 · Quebrar `server.js` por domínio** (2672 linhas de roteamento
      manual). Certo e necessário — e garantido para conflitar se feito em
      paralelo.
- [ ] **E2 · Stripe → Asaas.** Decidido pelo dono, adiado para não segurar a
      publicação.
- [ ] **E3 · Rate limit e SSE distribuídos** (Redis). Hoje é em memória por
      processo, o que trava o produto em uma instância.
- [ ] **E4 · A IA olhar a peça pronta.** A crítica de hoje lê o relatório do
      validador; renderizar em PNG e devolver pela visão pegaria colisão,
      respiro torto e logo sobre rosto. Muda o pipeline de geração.

---

## O que está fora do escopo de todo mundo agora

Publicação depende de configuração no Railway e de revisão jurídica, não de
código. Ver [`LANCAMENTO.md`](LANCAMENTO.md). Se você encontrar algo que
**impeça** a publicação, isso vira prioridade acima de qualquer item desta
lista — avise em vez de só consertar.

---

## Convenções de código

- Comentário explica **por quê**, não o quê. Registre a decisão e o erro que
  ela evita.
- Sem framework no servidor e sem dependência pesada. `node:sqlite` em dev,
  Postgres em produção, **mesma API assíncrona nos dois** — toda função nova de
  banco precisa existir nos dois arquivos.
- Português no código, nos comentários e nas mensagens de commit.
- Mensagem de erro para o usuário diz **o que fazer**, não o que falhou.
