# As três frentes: MultiTelas Empresas, Saúde e Comércio

Decisão do dono em 02/11: três frentes bem separadas para o cliente,
reaproveitando ao máximo o mesmo produto por baixo.

## Como está montado

**Um app só** (mesmo servidor, painel, TV, login e cobrança). A frente é um
campo da conta (`tenants.perfil`: `empresa`, `saude`, `comercio`) e **tudo o
que muda de uma frente para outra mora num registro só**:
[`js/perfil.js`](../js/perfil.js). O resto do código lê o registro em vez de
perguntar "se for clínica…".

| No registro (`js/perfil.js`) | Onde aparece |
|---|---|
| `marca` ("MultiTelas Saúde") | barra lateral do painel, Ajustes, cadastro, operador |
| `slug` (`saude`) | landing `/saude`, cadastro `/app/?frente=saude` |
| `opcoes`, `exemplo` | começos do Início e do Criar, exemplo da caixa de texto |
| `paraIA` | tom e assunto da IA (`server/ai-conversa.js`, `server/ai-guia.js`) |
| `lugar`, `lugarDe`, `publico` | como o painel chama o lugar e quem assiste |
| `extras` | nome e posição do grupo Pessoas/Mural/Indicadores no menu |
| `recebeAnuncios` | se a frente entra na rede de anúncios ([`ads/`](ads/README.md)) |

## O que muda em cada frente

| | Empresas | Saúde | Comércio |
|---|---|---|---|
| Fala com | quem trabalha aqui | pacientes na sala de espera | clientes |
| Landing | `/empresas` | `/saude` | `/comercio` (e a página principal) |
| Menu | "Pessoas e indicadores" logo depois da Biblioteca | "Recursos extras" no fim | "Recursos extras" no fim |
| Começos do Criar | aviso, comunicado, aniversário, indicador, segurança, vaga… | dica, serviços, prevenção, convênios… | promoção, novidade, cardápio, Instagram… |
| IA | comunicação interna, sem preço nem oferta | acolhedora, sem promessa de cura | ofertas, novidades, redes |
| Telas prontas | as da frente primeiro | as da frente primeiro | as da frente primeiro |
| Rede de anúncios | não (a TV é da equipe) | sim | sim |

## O que é igual nas três

Pareamento e TVs, programação, o player, peças e o motor de desenho, marca,
biblioteca, relatório de exibição, equipe, planos e cobrança, operação. Uma
correção em qualquer um vale para as três.

## Escolher e trocar de frente

- **No cadastro:** a pessoa escolhe "Para quem é a TV". Vindo da landing de
  uma frente (`/saude` → `/app/?frente=saude`), já começa marcada.
- **Depois:** só o **operador** troca, em Plataforma › Contas › a ficha da
  conta › Ações › Frente (`POST /api/plataforma/contas/:id/frente`, fica no
  registro da conta). Para o cliente, Ajustes mostra a frente e o caminho do
  suporte; a API recusa a troca (`403 frente_pelo_suporte`).
- **Conta antiga que nunca escolheu** (frente deduzida do nome): escolhe uma
  vez em Ajustes; depois, vale a regra acima.

## Acrescentar uma diferença entre frentes

1. Ponha o dado no registro (`js/perfil.js`), nas três frentes.
2. Leia do registro onde ele aparece (painel: `usePerfil()`; servidor:
   `require('../js/perfil.js')`).
3. Teste em `test/frentes.test.js`: as três frentes têm o campo.

Não crie páginas, rotas ou componentes duplicados por frente: a separação é
de configuração, não de código.

## Onde mora cada parte

| Parte | Arquivo |
|---|---|
| Registro | `js/perfil.js` (o painel lê por `web/src/lib/perfil.js`) |
| Menu por frente | `web/src/lib/menu.js` (`gruposDa`) |
| Landing por frente | `server/landing-frentes.js` (textos) + marcadores `<!--frente:…-->` em `landing/index.html` |
| Troca pelo operador | `server.js` (rota `/frente`), `web/src/pages/PlatformPage.jsx` |
| Trava para o cliente | `server/routes/auth.js` (`profile`), `web/src/pages/SettingsPage.jsx` |

`/saude` é a landing do MultiTelas Saúde; a verificação de saúde do servidor
para o Railway é `/healthz` ([`OPERACAO.md`](OPERACAO.md)).
