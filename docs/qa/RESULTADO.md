# QA de lançamento — resultado

03/11/2026, versão da `main` depois do PR #305. Nove frentes de teste em
paralelo cobriram os 20 usuários do [plano](PLANO.md), mais design, textos,
regras de negócio e mercado. Os relatórios completos estão nesta pasta; os
achados mais sérios foram conferidos no código antes de entrar aqui.

## Veredito

**Ainda não dá para lançar.** O produto por baixo é sólido: segurança 9, TV
confiável, rápida e que funciona sem internet. O que impede é a **primeira
impressão** (toda TV nova estreia com uma oferta vencida de ótica), as
**regras da frente Saúde**, o **mínimo jurídico para cobrar** e alguns
furos de fluxo e de regra de negócio. A maior parte é código pequeno; uma
parte é decisão sua.

**Nota geral: 6 / 10.** Depois das correções e do reteste: **7,5 / 10** ([RETESTE.md](RETESTE.md)).

## Notas por área

| Área | Nota | Em uma frase |
|---|---|---|
| Segurança | **9** | Nenhuma conta vê a outra; peça maliciosa, upload e força bruta barrados ([17](17-seguranca.md)) |
| Confiabilidade da TV | **9** | 25 min com CPU 6× sem erro, sem vazar memória, segue sem internet ([11-12-19](11-12-19-instalador-tv-compatibilidade.md)) |
| Desempenho | **8,5** | Landing em 0,7–0,9 s em 4G; painel com 20 TVs em ~2 s; troca chega à TV em ~1 s |
| Custo de IA e margem | **8** | Peça ~R$ 0,12; com 2 fotos ~R$ 0,89; teto de R$ 50/mês garante margem de 58% a 95% ([criações](01-06-criacoes-simuladas-e-custos.md)) |
| Fluxo | **6,5** | Foto na TV em 4 toques, 20 TVs num envio; mas o "Testar grátis" abre o login e há becos (reconectar, código com espaço) |
| Criações (o que vem depois da IA) | **6** | A forma é bem protegida; o conteúdo não é conferido (preço e data inventados passam; Saúde sem filtro) |
| Profissionalismo visual | **6** | O painel é bom; a vitrine de conteúdo pronto não ([front](front-design-e-textos.md)) |
| Comercial (landing) | **6** | Rápida e clara; falta o preço na primeira tela, prova social e cada frente falar com o seu público |
| Regras de negócio | **5** | Furos de receita no cancelamento, no anual e no atraso ([regras](regras-de-negocio-e-mercado.md)) |
| Acessibilidade | **5** | Bons nomes e 44 px; mas subir foto sem mouse é impossível e os diálogos não seguram o foco ([15-16](15-16-acessibilidade-idoso.md)) |
| Jurídico | **4** | Termos em "rascunho", sem CNPJ, sem arrependimento de 7 dias, política contradiz o Analytics ([13-20](13-20-landing-juridico.md)) |
| Preço vs. mercado | **4** | R$ 149/tela é o topo do Brasil e 2–3× os de fora; só a IA justifica |
| Compatibilidade de aparelhos | **4** | As peças exigem navegador Chromium 105+; Smart TVs mais antigas mostram texto embolado |
| Conteúdo pronto por frente | **3** | Só 1 tela pronta aprovada (ótica); peças de padaria em clínica e indústria |

## Por usuário

| # | Usuário | Nota | Pior problema |
|---|---|---|---|
| 1–6 | Comércio e Saúde criando com IA (simulada) | 6 | Saúde: "cura a gripe" passa nas peças e nas redes |
| 7 | RH de metalúrgica | 6 | A primeira TV mostra "Óculos de sol 30% OFF" |
| 8 | Gestor de indústria | 6 | Não há peça de segurança do trabalho; KPI de 5 dígitos cortado |
| 9 | TI com 20 TVs | 5,6 | O 16º pareamento é bloqueado (limite por IP) |
| 10 | Membro da equipe | 6 | Membro consegue remover TV |
| 11 | Instalador | 5,5 | TV em pé recebe tela deitada; reconectar cria duplicata |
| 12 | A TV na parede | 8 | Firme; só o "27°" inventado sem clima |
| 13 | Visitante da landing | 6,5 | "Testar 14 dias grátis" abre o login |
| 14 | Financeiro | 6,5 | Cancelamento promete "até o fim do período" e corta na hora |
| 15 | Deficiência visual | 5,5 | Subir foto/logo sem mouse é impossível |
| 16 | Idoso | 6,5 | Código da TV com espaço dá "não encontrado" |
| 17 | Hacker | 9 | Só CSRF sem conferir a origem (polimento) |
| 18 | Operador | 7 | Trocar frente/contrato sem confirmar; números divergentes na Plataforma |
| 19 | Compatibilidade | 4 | Peças só em Chromium 105+ |
| 20 | Advogado e contador | 4 | Termos em rascunho, sem CNPJ, sem arrependimento |

## Bloqueadores

| # | O quê | Onde | Quem resolve |
|---|---|---|---|
| B1 | Toda TV nova, de qualquer frente, estreia com "Óculos de sol 30% OFF, até 25/10" (vencida) | `web/src/lib/telasProntas.js` (`telaParaComecar` cai em qualquer tela) + só 1 tela aprovada em `pecas-ouro/manifesto.json` | **Código** (só a tela da frente; senão, a espera) + **você** (aprovar as telas de cada frente na bancada) |
| B2 | Saúde sem filtro de promessa: "cura a gripe em 1 dia" sai na peça e na legenda das redes | `server/` (geração das redes não recebe a regra da frente; nenhum verificador de termos) | **Código** |
| B3 | Subir foto e logo é impossível pelo teclado | `SubirConteudo.jsx`, `LogoDaMarca.jsx`, `BrandPage.jsx`, `ScreensPage.jsx`, `MyDesignsPage.jsx`, `CriacaoRapidaPage.jsx` | **Código** (copiar o padrão de `StoragePage.jsx`) |
| B4 | Mínimo jurídico para cobrar: Termos com aviso de "rascunho"; sem razão social/CNPJ; sem arrependimento de 7 dias; política diz "sem cookies de análise" com o GA4 ligado; excluir a conta não cancela a assinatura no Asaas | `server/legal.js`, `server.js` (excluir conta) | **Você** (dados da empresa, advogado, `LEGAL_REVISADO`) + **código** (cancelar no Asaas, texto de cookies, arrependimento) |
| B5 | Peças só funcionam em navegador Chromium 105+; o pacote da TV nem abre abaixo do Chromium 64 | `css/player.css` (container queries), `js/peca-html.js`, `js/seasons.js` | **Você** (decidir o aparelho mínimo e dizer na landing) + **código** (o pacote abrir em navegador antigo; aviso claro na TV) |

## Graves

**Código (posso fazer):**

1. "Testar 14 dias grátis" abre "Entrar" em vez do cadastro (`AuthScreen.jsx:27`).
2. Membro da equipe remove TV (`server/routes/telas.js:516`, falta o papel).
3. "Troca a foto" apaga textos e preço; "deixa o preço maior" responde que fez e não faz.
4. Preço e data inventados pela IA passam sem aviso (conferir contra o pedido).
5. Diálogos não seguram nem devolvem o foco; o menu "Mais" no celular não fecha no Esc.
6. Código da TV digitado com espaço é cortado (`ScreensPage.jsx:459`).
7. TV em pé recebe tela pronta deitada (`ScreensPage.jsx:388`).
8. Reconectar perde grupo e horário; o caminho óbvio cria TV duplicada e cobrada.
9. Limite de 15 pareamentos/10 min por IP trava a instalação de frota; `X-Forwarded-For` aceito de qualquer um permite pular limites (`server/security.js:35`).
10. Fatura vencida (`OVERDUE`) não aparece para quem está em atraso (`billing.assinatura`).
11. Cartão de indicador com 5+ dígitos sai cortado; refugo acima da meta aparece como "Meta batida!".
12. "PLANO §4.7" e notas internas aparecem para o cliente (`pecas-ouro/manifesto.json`).
13. Suporte mostra "(owner)" e o user-agent inteiro.
14. Textos de RH (SIPAT, "Fale com o RH", Protheus) em Saúde e Comércio; e-mails iguais para as três frentes.
15. Selo "Mais escolhido" sem nenhum cliente (publicidade enganosa).
16. TV removida segue dizendo "conectada à sua conta".

**Decisão sua (eu implemento depois):**

17. **Cancelamento:** os textos prometem "no ar até o fim do período pago", e o código rebaixa na hora. Escolher: manter até o fim do período (recomendo) ou mudar o texto.
18. **Depois do cancelamento as TVs seguem no ar com selo**, sem limite de telas (decisão sua de "a TV não apaga"). O consultor chama isso de furo de receita: pagar 1 mês e ficar com 10 TVs grátis. Sugestão: no grátis, só 1 TV segue no ar.
19. **Anual:** cancela sozinho pelo painel, a multa só aparece na tela e ninguém cobra; ao cancelar, `plan_contrato` fica salvo; a fórmula da multa sobe perto do fim.
20. **Preço:** R$ 149/tela é o topo do mercado. Sugestão do consultor: Básico sem IA a R$ 59–69 (Comércio e Saúde) e Empresas com mínimo de R$ 299 por conta.
21. **Conteúdo pronto:** aprovar as telas prontas das três frentes na bancada; peças de segurança do trabalho para Empresas.
22. **E-mail de suporte** de verdade (hoje um Gmail pessoal) e o app Android publicado num Release (as 4 chaves no GitHub).

## O que está bom e deve ficar

- Segurança madura: isolamento, sanitização de peça, limites, webhook, papéis no servidor.
- A TV: não apaga, volta sozinha, funciona sem internet, troca em ~1 s, sem vazar memória.
- Envio para 20 TVs de uma vez, com Desfazer; ver a TV agora; relatório de exibição com CSV.
- Aviso urgente, aniversariantes e foto por QR funcionando de ponta a ponta.
- A forma das peças é protegida (cor fixa, px, letra mínima no navegador).
- Custo de IA sob controle, com teto por conta e global.
- Landing rápida; preços iguais na landing, na API, no painel e nos e-mails.

## Plano de correção

**Fase 1 — código, sem depender de você (1–2 dias):** B1 (parte de código),
B2, B3, B4 (cancelar no Asaas ao excluir, texto de cookies, cláusula de
arrependimento como rascunho para o advogado), B5 (o pacote abrir em
navegador antigo e avisar), e os graves 1 a 16.

**Fase 2 — suas decisões:** itens 17 a 22, os dados da empresa para os
Termos, a revisão do advogado e o aparelho mínimo.

**Fase 3 — reteste:** os mesmos 20 usuários, com a IA real (`GEMINI_API_KEY`),
e nota nova.
