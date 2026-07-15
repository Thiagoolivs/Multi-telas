# Raft Mídia — Mídia Indoor para TVs Corporativas

Sistema de **multi-telas na mesma exibição** (digital signage) no estilo Pix Mídia,
feito para rodar em TVs corporativas com **atualização fácil** e **templates prontos**.
Identidade visual padrão da **Raft Embalagens** (azul corporativo `#2F6FEB`),
totalmente personalizável — 9 temas premium prontos e editor de cores/fontes.

Funciona **100% no navegador**, sem servidor obrigatório — nada de backend para cair.
Basta abrir a página numa Smart TV, mini-PC, TV Box ou Chromecast/navegador.

> **Modelo de dados:** tudo fica no `localStorage` do navegador (ou numa URL de
> config remota que você aponta). **Não há contas, login nem multi-tenant** — é
> "1 navegador = 1 instalação". Veja [Arquitetura e limites](#arquitetura-e-limites).

---

## O que ele faz

- **Multi-telas numa só exibição:** várias zonas independentes (principal, lateral,
  cabeçalho, rodapé) rodando conteúdos diferentes ao mesmo tempo.
- **Visual premium com glassmorphism:** zonas em vidro fosco com profundidade,
  fundo vivo (aurora + granulado sutil) e transições cinematográficas.
- **9 temas premium prontos:** Dark Premium, Corporate Blue, Luxury Gold, Neon Cyber,
  Glassmorphism, Minimal White, Elegant Black, Energy Green e Modern Purple — trocar
  o tema reestiliza a interface inteira num clique.
- **Layout inteligente:** conteúdos marcados como **Destaque** ou **Urgente** tomam a
  tela (os demais desfocam/escurecem), com animação cinematográfica, e depois voltam
  ao normal — vídeos e lives por baixo nunca são interrompidos.
- **Cores adaptativas:** ao exibir uma imagem, o tema desloca suavemente o destaque
  para combinar com as cores dela — o player parece "entender" o conteúdo.
- **Editor visual de tema:** cores (primária/secundária/destaque/fundo), fontes
  (Inter, Poppins, Montserrat, Roboto, Space Grotesk) e sliders de vidro, desfoque,
  cantos e intensidade dos efeitos — com prévia ao vivo. Identidade visual própria.
- **8 templates prontos** com **zonas clicáveis** — incluindo o "Painel Notícias"
  (clima na lateral, destaque grande e faixa de notícias com relógio ao vivo).
- **Biblioteca de conteúdos por categoria:** Comunicação interna, Eventos, Pessoas,
  Marketing e Tempo real — o cliente escolhe um modelo pronto e só edita os textos.
- **Datas comemorativas brasileiras:** 13 pacotes (Natal, Ano Novo, Carnaval, Páscoa,
  Dia do Trabalho, Dia das Mães, Festa Junina, Dia dos Pais, Independência, Dia das
  Crianças, Outubro Rosa, Novembro Azul, Black Friday) — aplicar define tema, decoração
  e mensagem pronta. **Decorações animadas** (neve, corações, bandeirinhas, confete,
  fogos, pétalas, luzes) com opção automática pela data.
- **Dados em tempo real, sem chave de API:** data/hora com segundos, clima atual +
  previsão de 6 dias (Open-Meteo), **trânsito ao vivo (Waze)** e mapas (OpenStreetMap).
- **Notícias automáticas de portais famosos (RSS):** G1, UOL, Folha, CNN Brasil,
  BBC News Brasil, Agência Brasil, Exame ou qualquer RSS personalizado — as
  manchetes chegam sozinhas e se renovam a cada 10 minutos, com mensagens de
  reserva caso o portal esteja fora do ar.
- **Faixa de notícias estilo emissora:** selo com dia/mês e relógio ao vivo,
  manchetes rotativas com título + descrição ("Título :: descrição").
- **Avisos Premium prontos para cada situação:** 9 variantes desenhadas
  (Comunicado, Urgente, Evento, RH, Segurança, Manutenção, Conquista,
  Treinamento, Saúde) com ícone, etiqueta e cores próprias — 1 clique e edita.
- **Cartão de aniversário decorado:** foto (com upload), balões, confetes e
  mensagem personalizada — pronto em segundos.
- **Conteúdos prontos (1 clique):** YouTube ao vivo, Aniversariantes do mês,
  Aviso importante, Clima e tempo, Boas-vindas, Comunicado interno, Segurança,
  Foto/campanha e Relógio.
- **YouTube ao vivo:** cole o link da live (ou o ID do canal, que pega a live ativa
  automaticamente) e deixe **fixa na tela** (duração 0) — ideal para transmissões
  em tempo real.
- **Upload de imagem direto do computador:** a foto é comprimida no navegador e
  salva junto com a configuração (sem precisar hospedar em lugar nenhum).
- **~21 tipos de conteúdo:** Aviso Premium, Texto/Comunicado, Aviso simples, Imagem,
  Vídeo (MP4), YouTube/Ao vivo, Cartão de Aniversário, Lista de Aniversariantes,
  Painel do Clima, Trânsito (Waze), Mapa, Destaque de Pessoa, Agenda, Frase do Dia,
  Indicador (KPI), Promoção/Produto, Redes Sociais, Relógio, Clima simples,
  Página Web e QR Code.
- **Superfície adaptativa ao tema:** os conteúdos prontos (frase, KPI, agenda,
  destaque, aniversariantes, promoção, redes…) derivam fundo, cores e fontes dos
  tokens do tema — o mesmo conteúdo fica premium e uniforme em qualquer paleta,
  com contraste garantido no tema claro.
- **Painel de gestão visual:** qualquer pessoa atualiza sem saber programar.
  Prévia ao vivo do que a TV vai exibir; mapa das áreas da tela abaixo da prévia.
- **Gestão premium de conteúdo:** arraste para reordenar, **duplicar** com um clique,
  **favoritos** reutilizáveis e **agendamento** (exibir um conteúdo só em certas
  datas, horários e dias da semana — o player filtra em tempo real).
- **Vários painéis / playlists:** crie, renomeie e alterne entre configurações
  nomeadas (ex.: "Recepção", "Fábrica") — cada uma com seu próprio conteúdo e tema.
  *(São guardados neste navegador; não são contas separadas — veja os limites.)*
- **Trava do painel por PIN:** protege o painel de gestão com um PIN de acesso
  (trava de conveniência local, não segurança de servidor).
- **Alerta sonoro no aviso urgente:** avisos marcados como urgentes tocam um alerta
  sonoro sintetizado e ganham um flash vermelho reforçado (ligável nas configurações).
- **Rodapé de avisos rolando** (ticker) e **cabeçalho premium com relógio + clima**.
- **Atualização automática:** o player recarrega sozinho a cada X segundos.
- **Robusto:** cada conteúdo é isolado — se um falhar, o player pula para o próximo
  sem travar a tela; zonas com um único conteúdo (ex.: live) ficam estáticas e nunca
  recarregam a transmissão.

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

---

## Estrutura do projeto

```
Multi-telas/
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
    "theme": {                   // tema premium: preset + ajustes manuais
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
(auth + banco + API). Isso é uma evolução de arquitetura, não um ajuste do atual.

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
