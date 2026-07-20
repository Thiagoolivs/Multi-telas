# Vistra — mídia indoor para TVs corporativas

Vistra é um sistema de digital signage para TVs corporativas: várias zonas
independentes (cabeçalho, principal, lateral, rodapé) exibindo conteúdos
diferentes ao mesmo tempo, com um painel de gestão que qualquer pessoa usa sem
saber programar. A cor e os temas são personalizáveis.

Roda no navegador, sem backend obrigatório — basta abrir a página numa Smart TV,
mini-PC, TV Box ou Chromecast. Os dados ficam no `localStorage`, ou numa URL de
config remota que você aponta.

> Sem contas, login ou multi-tenant — é "1 navegador = 1 instalação".
> Veja [Arquitetura e limites](#arquitetura-e-limites).

---

## Recursos

**Exibição**

- Multi-telas numa só exibição: zonas independentes rodando em paralelo.
- 9 temas com editor de cores, fontes e efeitos; trocar o tema reestiliza tudo.
- Conteúdos prontos que se adaptam ao tema (superfície adaptativa), com bom
  contraste também no tema claro.
- Layout inteligente: um aviso marcado como Destaque ou Urgente amplia sobre a
  tela e depois volta — vídeos e lives por baixo não são interrompidos.
- Cores adaptativas: o tema se ajusta às cores da imagem em exibição.
- Transições entre conteúdos e decorações sazonais (neve, confete, corações,
  bandeirinhas, fogos…), com 13 pacotes de datas comemorativas.

**Conteúdo (~23 tipos)**

- Avisos (9 variantes), texto/comunicado, imagem (com upload), vídeo MP4,
  YouTube/live.
- Fontes ao vivo: entrada HDMI/USB (via captador), stream IPTV/HLS e captura de
  tela/janela do próprio computador.
- Clima (agora + previsão), trânsito (Waze) e mapa (OpenStreetMap) — sem chave de API.
- Cartão e lista de aniversário, agenda, KPI, frase do dia, destaque de pessoa,
  promoção, redes sociais, relógio e QR Code.
- Notícias por RSS (G1, UOL, Folha, CNN Brasil, BBC, Agência Brasil… ou um RSS
  próprio), em faixa estilo emissora com relógio ao vivo.

**Gestão**

- 8 templates com zonas clicáveis e prévia ao vivo do que a TV vai exibir.
- Arrastar para reordenar, duplicar, favoritos e agendamento (data, hora e dia
  da semana).
- Vários painéis/playlists nomeados e trava do painel por PIN.
- Atualização automática e atualização centralizada por URL de config remota.
- Um conteúdo com erro não derruba a tela: o player isola cada item e pula para
  o próximo.

---

## Como usar (rápido)

1. Abra **`index.html`** no navegador → é o **Painel de Gestão**.
2. Escolha um **modelo**, clique em uma **área do desenho da TV** e adicione um
   **conteúdo pronto** (ou monte do zero).
3. Clique em **Salvar alterações**.
4. Abra **`player.html`** na TV (botão **Abrir na TV**). Pronto.

> Dica: na TV, dê **duplo clique** (ou tecle **F**) no player para entrar em tela cheia.

### Rodando localmente

```bash
# na pasta do projeto
node server.js
# depois acesse:
#   Admin  -> http://localhost:8080/index.html
#   Player -> http://localhost:8080/player.html
```

(Alternativa sem Node: `python3 -m http.server 8080`.)

---

## Hospedando no Railway (ou qualquer provedor)

O projeto já vem pronto para deploy — é só HTML/CSS/JS servidos por um
`server.js` mínimo, sem banco de dados e sem dependências externas.

1. Suba este repositório para o GitHub (se ainda não estiver lá).
2. No [Railway](https://railway.app), clique em **New Project → Deploy from
   GitHub repo** e selecione este repositório.
3. O Railway detecta o `package.json`, roda `npm install` (instantâneo, sem
   dependências) e inicia com `node server.js` — não precisa configurar nada.
4. Em **Settings → Networking**, gere um domínio público (**Generate Domain**).
5. Acesse `https://SEU-APP.up.railway.app/index.html` para o **Painel de
   Gestão** e `https://SEU-APP.up.railway.app/player.html` para o **Player**
   (essa é a URL que você abre na TV).

> Como os dados ficam salvos no navegador (localStorage) de quem edita, use
> a **Atualização centralizada** (exportar o `config.json` e apontar a URL
> remota) se quiser editar de um computador e exibir em TVs numa rede
> diferente — veja a seção acima.

Funciona da mesma forma em qualquer outro provedor que rode Node.js
(Render, Fly.io, um VPS próprio etc.) — basta `node server.js` respeitando
a variável de ambiente `PORT`.

---

## Atualização de várias TVs (centralizada)

Você tem duas formas de trabalhar:

**A) Local (uma máquina):** edite no Admin e salve. O player na mesma máquina/navegador
já reflete tudo. Simples e sem depender de internet.

**B) Centralizada (várias TVs):** ideal para uma rede de telas.
1. No Admin, monte tudo e clique em **Exportar** → gera `config-multitelas.json`.
2. Hospede esse arquivo em qualquer lugar público (GitHub Pages, Dropbox, seu servidor…).
3. Em cada TV, abra o Admin uma vez, vá em **Configurações → Atualização automática**
   e cole a **URL de config remota**. Salve.
4. A partir daí, sempre que você atualizar o `config.json` hospedado, **todas as TVs
   pegam a atualização sozinhas** (no intervalo definido em "Recarregar a cada").

Assim uma pessoa atualiza num lugar só e a rede inteira acompanha.

### Controle pelo celular (nuvem) — em evolução

Primeiro tijolo do multi-tenant: controlar uma TV **de outro dispositivo pela
internet**, sem hospedar `config.json` na mão.

1. Suba o app com `node server.js` (o servidor já expõe a API de controle, com
   contas e banco embutido via `node:sqlite`).
2. No painel (celular ou PC), no card **"Controlar TV pelo celular"**, **crie
   uma conta / faça login**.
3. Na TV, abra o player com `?cloud=1` no fim da URL — aparece um **código de
   pareamento**.
4. No painel, digite o código para **parear** — a TV passa a pertencer à sua
   conta. A partir daí, ao salvar, o conteúdo é enviado para a TV **na hora**
   (via SSE).

Cada conta controla só os seus dispositivos. O banco fica em `data/vistra.db`
(persistir com volume no deploy, ou migrar para Postgres na escala) — ver
[`docs/ESTADO-DO-PROJETO.md`](docs/ESTADO-DO-PROJETO.md) e
[`docs/PLANO-SAAS.md`](docs/PLANO-SAAS.md).

---

## Estrutura do projeto

```
vistra/
├── index.html          # Painel de administração
├── player.html         # Tela de exibição (TV)
├── css/
│   ├── admin.css        # Estilo do painel
│   └── player.css       # Estilo do player
├── js/
│   ├── templates.js     # Catálogo de layouts (templates prontos)
│   ├── theme.js         # Motor de temas (9 presets + tokens + fontes)
│   ├── seasons.js       # Datas comemorativas BR + decorações
│   ├── adaptive.js      # Cores adaptativas (analisa a imagem exibida)
│   ├── storage.js       # Dados: salvar/carregar/exportar/importar/remoto
│   ├── news.js          # Notícias automáticas via RSS
│   ├── render.js        # Renderiza cada tipo de conteúdo
│   ├── player.js        # Motor de exibição (zonas, rotação, decorações)
│   └── admin.js         # Lógica do painel de administração
├── server.js            # Servidor estático (deploy Railway/Node)
└── README.md
```

### Modelo de dados (config)

```jsonc
{
  "settings": {
    "nome": "Raft Embalagens",
    "layoutId": "dashboard",     // template escolhido
    "titulo": "Raft Embalagens",
    "cidadeClima": "São Paulo",
    "logoUrl": "",
    "transicao": "cinematic",    // cinematic | fade | slide | zoom | none
    "decoracao": "none",         // decoração animada (auto | snow | confetti | …)
    "coresAdaptativas": true,    // tema se ajusta às cores da imagem exibida
    "layoutInteligente": true,   // conteúdo prioritário toma a tela (takeover)
    "somUrgente": true,          // alerta sonoro nos avisos urgentes
    "remoteConfigUrl": "",       // URL de config remota (opcional)
    "refreshSeconds": 60,
    "theme": {                   // tema: preset + ajustes manuais
      "preset": "dark-premium",
      "font": "system",
      "overrides": {}            // { brand, accent, bg, radius, blur, fx, … }
    }
  },
  "zonas": {
    "principal": { "items": [ /* conteúdos que giram */ ] },
    "lateral":   { "items": [ /* ... */ ] },
    "rodape":    { "titulo": "ÚLTIMAS NOTÍCIAS", "modo": "noticias",
                   "fonte": "g1", "messages": ["Título :: descrição"] }
  }
}
```

> Além da config acima (chave `multitelas.config.v1`), o navegador guarda o
> **registro de painéis** (`multitelas.panels.v1`) e o **PIN** (`multitelas.pin.v1`).
> O painel ativo é sempre espelhado na config principal — por isso o player e a
> config remota continuam lendo a mesma chave sem saber que há vários painéis.

---

## Tipos de conteúdo

| Tipo | Descrição |
|------|-----------|
| Aviso Premium | 9 variantes com ícone, etiqueta e cores (urgente, evento, RH, segurança…) |
| Texto / Comunicado | Título + texto com cores personalizáveis |
| Aviso simples | Igual ao texto, com estilo de destaque |
| Imagem | URL ou **upload direto do computador** (comprimida no navegador) |
| Vídeo (MP4) | URL do vídeo, com loop e duração opcional |
| YouTube / Ao vivo | Link/ID do vídeo ou da live; ID do canal pega a live ativa; duração 0 = fixo na tela |
| Entrada HDMI / USB (ao vivo) | Fonte externa por **captador HDMI→USB** (UVC), exibida ao vivo via `getUserMedia` — precisa de contexto seguro + permissão de câmera |
| Stream ao vivo (IPTV/HLS) | URL de transmissão (`.m3u8`/MP4); HLS no Chromium via hls.js carregado sob demanda |
| Holyrics (letra ao vivo) | Slide/letra atual do Holyrics via API Server (IP + token), renderizado nativo e adaptado ao tema |
| Cartão de Aniversário | Foto, balões, confetes e mensagem — estilo cartão comemorativo |
| Lista de Aniversariantes | Lista "Nome — data", um por linha |
| Painel do Clima | Tempo agora + previsão de 6 dias, com data e cidade (Open-Meteo) |
| Trânsito (Waze) | Mapa de trânsito ao vivo da cidade/região (sem chave de API) |
| Mapa da Região | OpenStreetMap com marcador (sem chave de API) |
| Destaque de Pessoa | Funcionário do mês / reconhecimento, com foto e mensagem |
| Agenda / Programação | Lista de horários e atividades |
| Frase do Dia | Citação motivacional com autor |
| Indicador (KPI) | Número de destaque com rótulo, variação e tendência |
| Promoção / Produto | Selo, título, preço e chamada — adapta-se ao tema, com/sem imagem |
| Redes Sociais | Perfil + QR para seguir |
| Relógio | Relógio digital com data |
| Clima (simples) | Temperatura por cidade (Open-Meteo, sem chave de API) |
| Página Web | Incorpora um site via iframe |
| QR Code | Gera um QR a partir de um link/texto |

Todos os conteúdos prontos (exceto os que já têm arte própria, como o cartão de
aniversário) usam a **superfície adaptativa** — herdam fundo e cores do tema atual.

---

## Arquitetura e limites

O sistema é **client-side puro** (sem backend, sem banco). Isso é ótimo para
simplicidade e custo, mas define o que ele **é e não é**:

- **Não é multi-tenant / não tem contas.** Não há login, usuários nem organizações
  isoladas. Não existe "salvar um dispositivo por conta".
- **Dados por navegador.** A config vive no `localStorage` de quem edita. Para
  exibir em várias TVs, use a **config remota** (exporte o `config.json`, hospede-o
  e aponte a URL em cada TV) — veja a seção de atualização centralizada.
- **"Vários painéis" são locais.** Os painéis nomeados ficam só naquele navegador;
  não sincronizam entre máquinas nem representam contas.
- **PIN é uma trava de conveniência**, guardada no `localStorage` (hash simples).
  Impede acesso casual ao painel, mas **não é segurança de servidor** — quem tem
  acesso ao navegador/DevTools contorna.
- **Dependências externas.** Notícias usam fetch direto ou o proxy público
  *allorigins* como reserva; clima (Open-Meteo), mapas (OSM), trânsito (Waze),
  QR (api.qrserver) e YouTube dependem desses serviços e de suas políticas de CORS.
- **Cores adaptativas** só funcionam com imagens do mesmo domínio ou com CORS
  liberado (o canvas "suja" com imagens de outros domínios e não adapta).
- **Limite de armazenamento (~5 MB do localStorage).** Uploads de imagem (base64)
  consomem esse espaço; há aviso ao salvar quando enche — prefira URLs para imagens
  grandes.

Para **multi-tenant de verdade** (empresas/contas, TVs registradas por dispositivo,
edição centralizada na nuvem, papéis de acesso) seria necessário um **backend**
(auth + banco + API). Isso é uma evolução de arquitetura, não um ajuste do atual —
o plano completo está em [`docs/PLANO-SAAS.md`](docs/PLANO-SAAS.md).

> **Fontes ao vivo (HDMI/stream):** um navegador não lê HDMI-in nem sintonizador de
> TV diretamente. Para exibir uma entrada HDMI, use um **captador HDMI→USB** (o
> conteúdo "Entrada HDMI / USB" lê esse dispositivo ao vivo). Para canais, use um
> **stream/IPTV** (`.m3u8`) ou o conteúdo **YouTube / Ao vivo**.

---

## Dicas para a TV

- Configure a TV/mini-PC para **abrir o navegador em tela cheia** com a URL do player
  ao ligar (modo quiosque). No Chrome: `chrome --kiosk http://.../player.html`.
- Para evitar que a tela apague, desative a suspensão/proteção de tela do dispositivo.
- O player já esconde o cursor do mouse automaticamente.

---

## Perguntas comuns

**Preciso de internet?** Só para conteúdos externos (imagens/vídeos por URL, YouTube,
clima, config remota). O sistema em si roda offline.

**Onde os dados ficam salvos?** No `localStorage` do navegador da máquina.
Para backup ou levar para outra máquina, use **Exportar / Importar**.

**Dá para ter vários painéis diferentes?** Sim, de duas formas: (a) crie **painéis
nomeados** no seletor do topo do admin (guardados naquele navegador); ou (b) para
uma rede de TVs, mantenha um `config.json` por painel e aponte a URL remota de cada
TV para o arquivo correto.

**Tem contas / login / multi-tenant?** Não. Não há autenticação nem separação por
conta — é "1 navegador = 1 instalação". A trava por PIN é só uma proteção local do
painel. Para contas e dispositivos registrados na nuvem, veja
[Arquitetura e limites](#arquitetura-e-limites).

**O PIN protege de verdade?** Ele impede acesso casual ao painel de gestão, mas é
uma trava local (guardada no navegador) — não substitui autenticação de servidor.
