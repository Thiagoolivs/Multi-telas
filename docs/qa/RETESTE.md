# QA de lançamento — reteste

03/11/2026, branch `claude/gifted-noether-0kd67e` (até `c7f9d33`), servidor
**local** (`PORT=5911`, `STORAGE=local`, `AI_PROVIDER=dev`,
`MT_COBRANCA_SIMULADA=1`, banco novo). Cada item foi conferido no
comportamento (navegador Chromium via Playwright ou HTTP), não só no código.
A IA está em modo simulado: o que depende do modelo de verdade foi conferido
pelas rotas e pelos testes com modelo falso, e está dito onde.

Suíte inteira (`npm test`): 1727 de 1728 passam. A que falha
(`test/apk.test.js:69`) é do ambiente do reteste (o proxy injeta um
`GITHUB_TOKEN`), não do produto.

## Item a item

| # | Item | Situação | Evidência |
|---|---|---|---|
| B1 | TV nova estreia com "Óculos de sol" | ⚠️ parcial | Pareando pelo painel, Saúde, Empresas e Comércio ficaram em "Tudo certo", sem a ótica. Mas é por um bug: `perfilAtual().id` é `undefined` (`ScreensPage.jsx:427`), então **nenhuma** frente recebe tela pronta. E a única tela aprovada continua sendo a da ótica, com "até sábado, 25 de outubro" (`pecas-ouro/lateral-prazo.html:38`). Corrigido o bug, toda TV de Comércio (padaria, salão) estreia com essa oferta vencida |
| B2 | Saúde: "cura a gripe em 1 dia" | ⚠️ parcial | A campanha do Criar barra: `conferirCampanha` deixa o letreiro e as redes em "revisar", e os 25 testes de `criacoes-qa` e `regras-de-conteudo` passam. Mas na **Criação rápida e na campanha de Meus Designs** (`/api/ai/director`), numa conta Saúde, a peça saiu "Xarope Gripex cura / a gripe em 1 dia" e as legendas de Instagram, WhatsApp e LinkedIn também, sem bloqueio nem aviso. O `ai-director.js` (`dirigir`, linha 1243) não usa `js/regras-de-conteudo.js` nem recebe a frente |
| B3 | Subir foto e logo só pelo teclado | ✅ | Tab + Enter/Espaço abre o seletor (`filechooser`) em Início › "Pôr foto ou vídeo na TV" › Galeria, em Marca › Enviar logo ("Logo salva"), em Meus Designs › Importar e em Arquivos. Todos usam `EscolherArquivo.jsx` |
| B4 | Mínimo jurídico | ⚠️ parcial | A parte de código está feita: os Termos têm a cláusula 5, "Direito de arrependimento (7 dias)"; a política só grava os cookies `_ga` com "Aceitar", e o `ga-init.js` começa com o consentimento `denied`; excluir uma conta com assinatura gravou `conta.excluir-cancelou-assinatura` antes de apagar; a multa de 30% está nos Termos com exemplo. Falta a sua parte: não há razão social, CNPJ nem endereço ("Contato: a página Suporte do painel") e segue "em revisão jurídica" (`LEGAL_REVISADO`) |
| B5 | Pacote da TV em navegador antigo | ✅ | `/js/tv.pacote.js` (575 KB) passa no `node --check` e o acorn lê com `ecmaVersion: 2017`; com 2016, falha (`async`). Logo, não há `?.`, `??`, spread de objeto nem campos de classe. `compat.js` e `perf.js` são ES5. Forçando a TV sem container query (`MT_SEM_CQ`), a peça sai com as mesmas medidas. Com o pacote quebrado, a TV mostra "Este navegador é antigo… Chrome 56 ou mais novo". Pendente com você: a landing não diz o aparelho mínimo |
| 1 | "Testar grátis" abre o login | ✅ | Os CTAs vão para `/app/?frente=X&cadastro=1` (na raiz, `?cadastro=1`), e o clique em /saude abriu "Criar sua conta" |
| 2 | Membro remove TV | ✅ | O `DELETE /api/devices/:id` do membro dá 403 `papel`. No /app/ do membro, "Mais opções" não tem "Remover a TV" e não há "Parear tela"; para o dono, os dois aparecem |
| 3 | "Troca a foto" apaga textos; "preço maior" mente | ✅ | Os testes 8–14 de `criacoes-qa.test.js` passam, mas com modelo falso. Precisa de reteste com `GEMINI_API_KEY` |
| 4 | Preço e data inventados passam | ⚠️ parcial | Na campanha, viram aviso ("o preço R$ 189,90 não estava no seu pedido"). Na Criação rápida e em Meus Designs (`ai-director.js`) não há conferência nenhuma |
| 5 | Diálogos sem foco preso; Esc no "Mais" | ⚠️ parcial | O foco fica preso: em 40 Tab/Shift+Tab, nenhum saiu do diálogo. O Esc fecha, e o "Mais" do celular fecha no Esc. Mas no "Parear tela" o foco vai para `<main>`, e não para o botão. O `focoPreso.js:42` lê o `activeElement` depois de o `autoFocus` do campo já ter agido. No "Mais opções" volta certo |
| 6 | Código com espaço | ✅ | " yx4 YG9 " vira `YX4YG9` e pareia |
| 7 | TV em pé recebe tela deitada | ⚠️ parcial | Não recebe mais a deitada, mas também não recebe nenhuma: o mesmo bug do B1, e não há tela em pé aprovada |
| 8 | Reconectar perde grupo e horário; duplica | ✅ | Parear a TV que voltou dá 409 `parece-reconectar` ("Vitrine/Loja Centro"). Com "Sim, é ela", fica 1 tela, com grupo, horário 09:00–18:00 e programação. A antiga dá 404. Pelo menu Reconectar, idem |
| 9 | Limite trava frota; `X-Forwarded-For` | ⚠️ parcial | 22 TVs na mesma conta e no mesmo IP: todas 200. Com o XFF variando, o 16º código errado leva 429 (XFF ignorado por padrão, `security.js:79`). **Mas o 429 não bloqueia:** depois dele, o código certo responde 429 e a TV entra na conta assim mesmo (ver "Novos problemas", 1) |
| 10 | Fatura vencida não aparece | ✅ | `billing.assinatura()` com o Asaas falso pede `OVERDUE` primeiro e devolve `vencida: true`. O painel escreve "Há uma fatura vencida de…" (`BillingPage.jsx:532`) |
| 11 | KPI de 5+ dígitos cortado; refugo | ✅ | Na TV, 1280 e 1920: "1.234.567 pç" no destaque e "10.300 pç" na lateral de 328 px cabem, com a seta. Refugo de 2,6% com meta de 2% sai "Acima da meta (até 2%)", vermelho |
| 12 | "PLANO §4.7" para o cliente | ✅ | Varri as 24 páginas do painel nas 3 frentes: nenhum "PLANO", "§", "bancada" ou "EXECUTOR" |
| 13 | Suporte com "(owner)" e user-agent | ✅ | Mostra "(Dono)" e "Chrome 153 · Linux" |
| 14 | RH em Saúde/Comércio; e-mails iguais | ✅ | Nenhum SIPAT, RH ou Protheus no painel de Saúde ou de Comércio; em Empresas aparecem, como deve. Os e-mails trazem o nome e o preço da frente (Saúde R$ 139, Comércio R$ 79, Empresas R$ 159) |
| 15 | Selo "Mais escolhido" | ✅ | Não aparece nas 4 landings nem no painel |
| 16 | TV removida diz "conectada" | ✅ | Removida no painel, a TV real voltou sozinha ao código novo ("Conecte esta TV pelo celular · 8AV46B") em menos de 1 min |
| 17–20 | Decisões | ✅ | `cobranca-saida-ponta.test.js` passa (6/6). Na tela: "O plano continua até 03/12/2026… a TV mais antiga segue no ar, com o selo, e as outras ficam pausadas". `/api/planos?frente=` devolve 7900, 13900 e 15900, cada um sem o preço das outras. Cada landing mostra só o seu (R$ 79, R$ 139, R$ 159); a raiz não tem tabela ("O preço depende do seu tipo de negócio") |

**Contagem (B1–B5 e graves 1–16):** ✅ 14 · ⚠️ 7 · ❌ 0.

**axe-core 4 (WCAG 2 A/AA):** nenhuma violação nas landings, nos Termos, na
Privacidade, no login do painel nem em 23 das 24 páginas do painel (também no
tema escuro). A única: o selo "Em dia" do Plano tem contraste de 4,48:1, e o
mínimo é 4,5:1.

## Notas por área

| Área | Antes | Agora | Por quê |
|---|---|---|---|
| Segurança | 9 | **8** | O XFF agora é ignorado por padrão, mas o bloqueio de códigos errados virou enfeite: responde 429 e pareia assim mesmo |
| Confiabilidade da TV | 9 | **9** | A TV removida volta ao código, a reconectada mantém tudo e a pausada fica por cima. Não refiz a carga longa |
| Desempenho | 8,5 | **8,5** | Não medi de novo |
| Custo de IA e margem | 8 | **8** | Não dá para medir sem a chave real |
| Fluxo | 6,5 | **7,5** | O cadastro abre direto, o código com espaço passa, a frota de 22 entra e o Reconectar pergunta. Mas a TV nova não ganha mais tela pronta em frente nenhuma |
| Criações | 6 | **6,5** | A campanha confere promessa, preço e data. A Criação rápida e Meus Designs, não. Sem a IA real, não dá para dar nota cheia |
| Profissionalismo visual | 6 | **6,5** | Saíram as notas internas e os textos de RH fora de Empresas. A vitrine de conteúdo pronto continua pobre |
| Comercial (landing) | 6 | **7** | Cada frente tem o seu preço e o seu texto, o CTA abre o cadastro e saiu o selo falso. Falta prova social |
| Regras de negócio | 5 | **8** | O cancelamento vai até o fim do período, só a mais antiga fica no ar, a multa do anual fica registrada e a fatura vencida aparece |
| Acessibilidade | 5 | **7,5** | Dá para subir arquivo pelo teclado, o foco fica preso e o Esc fecha. O foco não volta no Parear, e há um contraste de 4,48 |
| Jurídico | 4 | **6** | Arrependimento, cookies, exclusão que cancela e multa estão certos. Faltam razão social, CNPJ, endereço, a revisão e um e-mail de empresa no Suporte (hoje é um Gmail pessoal) |
| Preço vs. mercado | 4 | **6** | Comércio a R$ 79 entra na faixa do mercado. Empresas a R$ 159 segue no topo |
| Compatibilidade de aparelhos | 4 | **6,5** | O pacote abre do Chromium 56 em diante, a peça sem container query sai igual na emulação e há aviso claro. Não testei numa TV antiga de verdade, e a landing não diz o mínimo |
| Conteúdo pronto por frente | 3 | **3** | Continua 1 tela aprovada (a da ótica, vencida). Saúde e Empresas veem "estão chegando" |

**Nota geral: 7 / 10** (era 6). Melhorou muito em regra de negócio,
acessibilidade e jurídico. Ainda **não lançaria** sem quatro coisas: o
bloqueio do pareamento, a regra de Saúde na Criação rápida e em Meus Designs,
os dados da empresa nos Termos e as telas prontas aprovadas por frente.

## Novos problemas encontrados

1. **O bloqueio de códigos errados não bloqueia** (`server/routes/telas.js:225-226` e `519-520`). `codigoTravado` devolve o que `sendJson` devolve, que é `undefined` (`server.js:171`). O `if (travado)` nunca é verdadeiro e o pedido segue: depois do 429, um código certo entra na conta de quem está chutando. O log mostra `ERR_HTTP_HEADERS_SENT`. Entrou com o commit `8b2c3c0`.
2. **TV nova sem tela pronta em todas as frentes** (`web/src/pages/ScreensPage.jsx:427`). `perfilAtual()` já devolve o id (`web/src/lib/perfil.js:32`), e o `.id` vira `undefined`. Ao corrigir, aprove antes uma tela de Comércio que não seja a oferta vencida.
3. **Criação rápida e Meus Designs sem a regra de conteúdo** (`server/ai-director.js`, `dirigir`; rota em `server.js:1997`). A frente da conta não vai ao diretor, e o resultado não passa por `conferencia.js`.
4. **O foco não volta a quem abriu um diálogo com `autoFocus`** (`web/src/lib/focoPreso.js:42`).
5. O selo "Em dia" do Plano tem contraste de 4,48:1, abaixo de 4,5.
6. A landing ("Preciso comprar algum aparelho?", `landing/index.html:493`) promete "Serve a Smart TV com navegador", sem dizer o mínimo (Chromium 56).

## Corrigido depois do reteste

Os seis problemas acima, com teste para cada um, e mais os achados da revisão do código: a edição à mão na biblioteca também passa pela régua, a legenda barrada não barra as peças (some da tela), a mesma peça em três formatos conta uma vez e o que a marca e a memória já disseram não vira "inventado". `npm test` passa inteiro: 1731 testes (dois testes, `apk` e `link-de-senha`, falharam uma vez cada sob carga e passam sozinhos).

| # | O quê | Como ficou |
|---|---|---|
| 1 | Bloqueio do pareamento | `codigoTravado` devolve `true`: com 429, o pedido para. Teste: depois de 16 códigos errados, o código certo dá 429 e a TV não entra na conta, nem pelo Reconectar (`test/telas-qa-lancamento.test.js`) |
| 2 | TV nova sem tela pronta | `perfilAtual()` sem o `.id`. E a estreia só usa uma tela marcada com `paraComecar: true` no manifesto: a da ótica (oferta datada, de um negócio só) não serve de estreia. Até haver uma marcada por frente, a TV fica na espera neutra (`test/tv-nova-pronta.test.js`) |
| 3 | Regra de conteúdo na Criação rápida e em Meus Designs | O resultado do diretor volta conferido (`conferencia.conferirPecasSoltas`: peça, HTML, texto desenhado e legendas). A Criação rápida não guarda nem publica o que está barrado e diz o porquê. Meus Designs mostra a conferência e desliga "Só salvar" e "Salvar e publicar". A biblioteca (`POST /api/library`) recusa com 422 o que a lei barra. Preço e data que ninguém disse viram aviso (`test/conferencia-solta.test.js`) |
| 4 | O foco não voltava a quem abriu | O `Dialog` guarda quem tinha o foco no render, antes do `autoFocus`. Conferido no navegador: Esc no "Parear" devolve o foco ao botão "Ligar a primeira TV" |
| 5 | Contraste do "Em dia" | `--c-ok` passou de #15803D para #157A3A: 4,85:1 no fundo do selo e 5,42:1 no branco |
| 6 | Aparelho mínimo na landing | "Quase sempre, não: Smart TV Samsung de 2018 ou LG de 2020 em diante, box Android ou computador. TV mais antiga pede um box com Play Store, e ela mesma avisa." (`docs/APARELHOS.md`) |

Com isso, as notas sobem:
- **Segurança** volta a 9;
- **Fluxo**, 7,5 (a estreia com tela pronta depende das telas marcadas);
- **Criações**, 7;
- **Acessibilidade**, 8;
- **Compatibilidade**, 7.

**Nota geral: 7,5 / 10.** O que falta para lançar já não é código:
- as telas prontas aprovadas e marcadas para começar em cada frente;
- os dados da empresa nos Termos e a revisão do advogado;
- o e-mail de suporte;
- o reteste com a IA real.
