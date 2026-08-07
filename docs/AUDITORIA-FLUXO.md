# Auditoria de fluxo — 2026-08-07

Leitura do sistema de ponta a ponta, seguindo o caminho real do uso: criar
conta → parear TV → gerar campanha → publicar → a TV exibir → moderar → apagar.
Complementa `AUDITORIA.md` (que olha produto e estratégia); aqui o assunto é
**coerência**: onde o sistema deixa de se entender consigo mesmo.

Cada achado aponta arquivo e linha. Onde a falha é minha, está dito.

---

## 1. O contrato da config não existe

`PUT /api/devices/:id/config` (server.js:1353) aceita qualquer objeto:

```js
if (!b || typeof b !== 'object') return sendJson(res, 400, { error: 'config inválida' });
```

`[]` passa. `{}` passa. Um objeto com `zonas: "texto"` passa, é gravado e
empurrado para a TV por SSE.

Existe um normalizador cuidadoso — `normalize()` em js/storage.js, com migração
de tema, saneamento do rodapé e (desde ontem) da trilha sonora. **Ele nunca roda
no produto.** `applyConfig()` (js/player.js:244) recebe o JSON cru vindo da
nuvem; `normalize` só é chamado em `MTStorage.load()`, isto é, no player local
e na config por URL — os dois modos legados.

Consequência prática: o painel React e o player concordam **por convenção**, não
por contrato. Toda vez que um campo novo nasce (rodapé, mural, áudio), a
compatibilidade depende de os dois lados terem sido editados juntos, sem nada
que verifique.

> Isto é meu. Escrevi 9 testes garantindo que `volume: 300` vira 100 e que faixa
> sem URL sai da lista — e essa garantia não vale para nenhuma TV pareada.

**Correção:** um único módulo de schema compartilhado (Node + navegador, como
`js/seasons.js` já é), chamado em três pontos: no `PUT` antes de gravar, no
`applyConfig` antes de montar o palco e no import de config. O Gemini sugere Zod;
concordo com a ideia e discordo do lugar — o valor não está em validar o corpo
HTTP, está em **ter uma definição só** de o que é uma config.

---

## 2. Imagens da IA não existem para o sistema

server.js:1085 e server.js:1139 gravam a imagem gerada e devolvem a URL:

```js
const saved = await storage.saveBuffer(sess.tenant_id, buf, img.mime);
return sendJson(res, 200, { url: saved.url, ... });
```

Nenhuma das duas chama `db.createMedia`. O arquivo existe no disco/R2 e **não
existe em lugar nenhum do banco**. Efeitos em cadeia:

| Onde | O que acontece |
|---|---|
| Armazenamento | a página não lista as imagens da IA |
| Cota | `sumMediaBytes` (db-sqlite.js:280) soma só a tabela `media` → a IA gera de graça |
| Exclusão da conta | `apagarTenant` junta chaves de `media` + `muralfotos` (db-sqlite.js:461) → a imagem da IA **fica no storage para sempre** |
| Plano | Grátis e Business têm a mesma cota fixa de 5 GB (`MEDIA_QUOTA`), e ela não é cobrada de quem mais consome |

O último item é o mais sério: a Política de Privacidade que escrevi diz que ao
excluir a conta "apagamos os arquivos enviados". Para imagens geradas, é falso.

**Correção (concordo inteiramente com o Gemini aqui):** uma tabela de arquivos
única. Toda gravação passa por um `midia.registrar()` que grava linha e devolve
a URL; toda entidade que usa arquivo guarda a chave, não o caminho. Foto de
mural, aniversariante, marca e IA entram no mesmo ciclo de vida. Sem isso, a
cota é ficção e a exclusão é incompleta.

---

## 3. Campanha e data comemorativa se comportam de formas opostas

As duas marcam a origem do conteúdo — `_season` e `_campanha` — mas só uma
limpa o que deixou antes:

```js
// ContentEditorPage.jsx:110 — a data comemorativa remove a anterior
const semAntigos = lista.filter((i) => !(i && i._season === season.id));

// MyDesignsPage.jsx:125 — a campanha empilha
cfg.zonas[zk].items = substituir ? novos : cfg.zonas[zk].items.concat(novos);
```

`substituir` apaga a playlist **inteira**, inclusive o que não é campanha. Não
existe o meio-termo óbvio: "troque a campanha anterior e deixe o resto". Publicar
três campanhas seguidas sem marcar substituir deixa as três rodando juntas, e o
usuário não tem como desfazer só a do meio.

Além disso, a campanha vai para **uma zona só** (`primaryZoneKey`,
MyDesignsPage.jsx:119), enquanto o pacote de data preenche principal, lateral e
rodapé (`programaDe` em js/seasons.js). É exatamente a queixa registrada em
julho — *"ele adicionou uma tela só na tela principal, sem graça, sem decoração,
sem mensagens no painel lateral"* — e ela vale hoje para campanha, não para data.

**Correção:** um único caminho de "aplicar um conjunto de conteúdo a uma tela",
com origem, escopo (quais zonas) e política de substituição. Campanha e data
passam a ser dois chamadores do mesmo código em vez de duas implementações com
regras diferentes.

---

## 4. A agenda da campanha é texto, não programação

O diretor devolve `agenda: [{ quando, canal, motivo }]` (ai-director.js:824) e o
painel a imprime numa lista com o título "Quando postar"
(MyDesignsPage.jsx:596). Nada agenda nada.

O pedido era: *"quando eu crio uma campanha, quero q ela seja capaz de rodar por
horas ou até dias com eu fazendo ajustes mínimos"*. O que existe hoje é uma
playlist plana que roda igual das 8h às 22h. O motor de agendamento por item
(data, hora, dias da semana) **já existe** no player e no editor — a campanha
simplesmente nunca o preenche.

**Correção:** o plano da campanha passa a produzir uma faixa horária por peça
(manhã/almoço/tarde/fim de expediente é suficiente para começar), gravada no
`agendamento` que o player já entende. É a mudança de maior efeito percebido
nesta lista inteira, e não precisa de código novo no player.

---

## 5. A TV pode ficar surda sem ninguém notar

Em modo nuvem, a config chega só por SSE. `es.onerror` (js/cloud.js:152) é um
comentário:

```js
es.onerror = () => { /* reconecta sozinho */ };
```

O `EventSource` reconecta sozinho em queda de rede, mas **desiste
permanentemente** quando o servidor responde com status não-2xx — o que acontece
num deploy no meio da conexão, ou se o device token for recusado. A partir daí a
TV mostra a última config para sempre.

E o pior: o heartbeat continua (js/player.js:178), então o painel mostra a tela
como **online**. O operador publica, vê "publicado", e a TV não muda. Nenhuma
das duas pontas mente sozinha; juntas, mentem.

O Gemini diz que o player usa *polling* e recomenda SSE. Está enganado — SSE já
é o mecanismo, desde o começo. O problema real é o oposto: **falta o polling de
segurança**. Signage não deve depender de um único canal.

**Correção:** cachear o `updatedAt` da config, conferi-lo no heartbeat (que já
vai ao servidor a cada 30s) e recarregar quando divergir. É a rede de segurança
que o SSE não tem, sem custo perceptível.

---

## 6. Matemática de cor duplicada, e já custou um bug

`luminance`/`contraste` vivem em `server/design-system.js:31` e, de novo, em
`js/theme.js:201`. Mesma linguagem, dois arquivos.

Não é hipótese: em julho, `acentoSobre` devolvia 2.32:1 sobre laranja porque
escolhia clarear ou escurecer pela luminância do fundo — **o mesmo bug que já
tinha sido corrigido meses antes em `composer.js`**. A correção não atravessou
porque não havia nada a atravessar.

**Correção:** um `cor.js` dual-module (como `js/seasons.js`), importado pelos
dois lados. É a dívida com melhor relação custo/benefício do repositório.

---

## 7. Segurança e dependências externas

- **Zero cabeçalhos de segurança.** Nenhum `Content-Security-Policy`,
  `X-Content-Type-Options`, `Referrer-Policy` ou HSTS em todo o server.js. O
  painel é uma SPA autenticada por cookie; um XSS em qualquer campo refletido
  vira sessão roubada.
- **Fontes pelo Google** (js/theme.js:59-68). Contradiz a promessa de
  offline-first — TV sem internet cai na fonte de sistema e a identidade da
  empresa muda sozinha — e conta ao Google, a cada tela, quem está exibindo o
  quê. Auto-hospedar as ~6 fontes usadas resolve os dois.
- **`subscribers` e `estadoSom` em memória** (server.js:53-56). Uma instância
  só. Com duas réplicas no Railway, metade dos comandos de som e metade dos
  avisos de mural não chegam. Documentado como risco desde a auditoria anterior;
  continua verdadeiro e agora tem mais coisa dependendo dele.
- **Sem CI.** Não existe `.github/`. Os 109 testes só rodam se alguém lembrar.

---

## 8. Dois editores vivos

`js/admin.js` tem 1712 linhas e continua servido em `/` e `/legacy`. Ele edita
`localStorage`, não a nuvem, e não conhece mural, trilha sonora nem os campos
novos do rodapé. Não é um backup do editor React — é um segundo produto, com
outro modelo de dados, que ainda abre para qualquer visitante.

**Correção:** decidir. Ou vira "modo local sem conta" declarado e documentado
(com aviso na tela de que não sincroniza), ou sai. Manter sem decidir é o que
faz o sistema parecer que não se entende.

---

## Sobre o relatório do Gemini

| Ponto dele | Veredito |
|---|---|
| Tabela central de mídia | **Certo, e mais grave do que ele diz** — ver §2, a exclusão de conta está incompleta |
| SQL duplicado entre SQLite e Postgres | **Certo.** Mas o remédio caro (Prisma) não é o primeiro passo: o que dói hoje é não ter *uma* definição de schema, e isso um arquivo compartilhado resolve |
| Player usa polling | **Errado** — é SSE desde o início. O problema real é o inverso (§5) |
| Animações precisam de `transform`/`opacity` | **Já é assim** (js/player.js:31), com comentário explicando por que nada de blur em GPU de TV |
| Reciclar nós do DOM | **Plausível, não medido.** Não vou afirmar ganho sem medir numa TV de verdade; hoje o gargalo visível é decodificação de imagem, e o preload já ataca isso |
| Express/Fastify | **Parcial.** O roteamento manual está legível; o que falta é validação e um lugar único para erro. Trocar o framework não resolveria §1 |
| Zustand no editor | **Parcial.** Re-render não foi medido. Já o desfazer/refazer ausente é real e sentido |

---

## Ordem que eu seguiria

1. **§4 agenda que agenda** — o pedido explícito, e o player já sabe fazer.
2. **§2 tabela de mídia única** — corrige cota, órfãos e a promessa da LGPD.
3. **§1 schema compartilhado** — para de deixar o contrato no boca a boca.
4. **§5 rede de segurança do SSE** — barato, e evita a pior classe de suporte.
5. **§3 aplicar conteúdo por um caminho só** — mata a incoerência sentida.
6. **§6 cor num arquivo só** — dívida pequena, já cobrou juros.
7. **§7 cabeçalhos + fontes locais + CI**.
8. **§8 decidir sobre o admin legado**.
