# MultiTelas — mídia indoor para TVs corporativas

MultiTelas é um sistema de digital signage para TVs corporativas: várias zonas
independentes (cabeçalho, principal, lateral, rodapé) exibindo conteúdos
diferentes ao mesmo tempo, com um painel de gestão que qualquer pessoa usa sem
saber programar. A cor e os temas são personalizáveis.

É um SaaS: a empresa cria a conta, pareia as TVs pelo celular e publica do
painel (`/app`). A TV é só um navegador abrindo `/tv` — numa Smart TV, num TV
Box, num mini-PC ou num Chromecast — e continua exibindo sem internet.

- **Servidor:** Node 22 sem framework, Postgres em produção (SQLite em dev).
- **Painel:** React (Vite), servido em `/app`.
- **TV (player):** JavaScript puro, offline-first (service worker).
- **Cobrança:** Asaas (Pix, boleto, cartão), preço por tela.
- **IA:** Gemini (texto, imagem e visão), com validador próprio de legibilidade.

> O modo antigo "1 navegador = 1 instalação" (sem conta, dados no
> `localStorage`) ainda existe em `/legacy`. Ver
> [Arquitetura e limites](#arquitetura-e-limites).

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

1. Crie a conta em **`/app`**.
2. Na TV, abra **`seu-dominio/tv`**. Ela mostra um código de 6 dígitos e um QR.
3. Aponte a câmera do celular para o QR (ou digite o código em **Telas ›
   Parear tela**). A TV passa a ser da sua conta.
4. Publique um conteúdo: modelo pronto, editor ou campanha por IA. A TV troca
   na hora.

### Rodando localmente

```bash
npm install
npm run build          # painel React → web/dist
SKIP_VERIFY=1 node server.js
#   Site    -> http://localhost:8080/
#   Painel  -> http://localhost:8080/app
#   TV      -> http://localhost:8080/tv
```

Sem `DATABASE_URL` o banco é SQLite em `data/`. Sem `ASAAS_API_KEY` a cobrança
é simulada, sem `GEMINI_API_KEY` a IA roda em modo demonstração, e sem
provedor de e-mail o link de confirmação vai para o log — por isso o
`SKIP_VERIFY=1` local. **Nunca** use `SKIP_VERIFY=1` em produção.

```bash
npm test               # a suíte inteira
npm run lint:nomes     # nome indefinido no servidor (roda no CI)
```

---

## Hospedando no Railway

`railway.json` já traz build e start. O que falta é configuração, e ela está
em três lugares:

- [`docs/LANCAMENTO.md`](docs/LANCAMENTO.md) — o que precisa estar definido
  antes de vender.
- [`docs/CONFIGURAR-RESEND-E-ASAAS.md`](docs/CONFIGURAR-RESEND-E-ASAAS.md) e
  [`docs/ARMAZENAMENTO.md`](docs/ARMAZENAMENTO.md) — passo a passo.
- [`docs/PROMPT-COWORK.md`](docs/PROMPT-COWORK.md) — um prompt para o Cowork
  fazer a configuração inteira no seu navegador.

Depois de subir, `/sistema` (logado com um e-mail de `ADMIN_EMAILS`) diz o que
está verde e o que falta, e `node tools/conferir-config.mjs` prova que as
chaves funcionam.

---

## Modo local (legado)

Em `/legacy` continua o painel antigo, que guarda tudo no `localStorage` do
navegador e não sincroniza com a nuvem. Para várias TVs nesse modo, exporte o
`config.json`, hospede-o e cole a URL em **Configurações › Atualização
automática** de cada TV. Não conhece mural, trilha sonora, cobrança nem IA.

### Painel de quem opera a plataforma

Existe uma página separada — telas vivas, contas, tempo de uso, funções mais
usadas, reclamações — para quem **opera o MultiTelas**, não para quem o usa.
Ela só existe se `ADMIN_EMAILS` estiver definida:

```
ADMIN_EMAILS=voce@exemplo.com,socio@exemplo.com
```

É variável de ambiente de propósito: só muda por deploy. Se a lista de
operadores vivesse no banco, uma senha vazada bastaria para alguém se promover e
ver os dados de todos os clientes. **Sem a variável, o painel não aparece e a
rota responde 404** — "sem configuração, o dono da primeira conta vira operador"
transformaria uma instalação nova numa porta aberta.

O **Estado do sistema** (banco, provedor de IA, bucket, textos legais) também
mora aqui. É infraestrutura de quem VENDE o produto, não de quem o compra.

O painel traz ainda **supervisão por conta** — procure por nome, e-mail do dono
ou id e abra a ficha: plano, telas e quando cada uma apareceu por último, uso
de IA, o que já gastou, conexões abertas e se a conta esbarrou em algum teto.

### Os freios

`server/limites.js` põe teto por **conta inteira**, além dos limites por rota
que já existiam — vinte rotas a trinta por hora somam seiscentas chamadas sem
nenhuma passar do próprio teto, e as rotas comuns não tinham teto nenhum.

O que ele defende é a máquina, não o custo de IA (isso é crédito). Um laço no
navegador de um cliente, um script que repete, uma TV que reabre conexão sem
fechar a anterior: nenhum é ataque, e todos derrubam o servidor de todo mundo.

| | teto | postura |
|---|---|---|
| painel | 600 / 5 min por conta | **bloqueia** (429) |
| player | 1200 / 5 min por conta | **só mede, nunca bloqueia** |
| upload | 120 / hora por conta | bloqueia |
| conexões SSE | 4 por tela · 4×telas (mín. 20) por conta · 2000 no servidor | recusa com 503 |

**O player nunca é bloqueado, e isso é o princípio, não um esquecimento:**
derrubar a TV de uma recepção porque o painel de alguém entrou em laço puniria
quem não fez nada, na parede, na frente dos clientes dele. Do outro lado do
painel há uma pessoa que vê o aviso e pode parar; do outro lado do player há só
uma parede. O tráfego da tela é medido mesmo assim — é como uma TV com defeito
de rede aparece na supervisão antes de alguém ligar reclamando.

A classificação é por **quem está autenticado**, não por caminho de URL:
`/api/devices/:id/config` é chamado pelos dois, e classificar por URL faria um
painel em laço passar despercebido num orçamento que nunca bloqueia.

### Contas liberadas para testar

Para mandar o produto a alguém experimentar sem passar pelo teste de 14 dias:

```
CONTAS_CORTESIA=amigo@empresa.com,cliente@teste.com
```

Quem está na lista recebe os limites do plano **Pro** — telas, crédito de IA,
armazenamento e todos os recursos — sem cobrança e sem prazo. A tela de Plano
diz "Cortesia", para a pessoa não achar que está pagando.

**A lista manda nos dois sentidos:** tirar o e-mail devolve a conta ao grátis
no próximo login. Sem isso, cada cortesia duraria para sempre e seguiria
gastando chamada de modelo muito depois do teste.

Duas coisas que ela **não** faz: não toca em conta com assinatura ativa, e
**não dá acesso ao painel da plataforma** — isso é `ADMIN_EMAILS`, e são duas
variáveis justamente para que acrescentar um testador nunca possa virar "essa
pessoa agora vê todos os clientes" por descuido de digitação.

---

## Estrutura do projeto

```
multitelas/
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
├── fonts/               # As 14 famílias (OFL), servidas do próprio domínio
│   ├── fontes.css        # GERADO — todas as @font-face
│   ├── arquivos/         # os .woff2
│   └── licencas/         # a OFL de cada família (a licença vai junto)
├── tools/
│   └── baixar-fontes.mjs # Regera fonts/ — rode ao acrescentar família
├── server/              # Módulos do servidor (auth, cobrança, IA, log, erros…)
│   └── routes/           # Rotas extraídas de server.js (auth, equipe, cobrança, telas)
├── web/                 # Painel React (Vite) → build em /app
├── test/                # `npm test`
├── server.js            # Servidor (rotas)
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
| QR Code | Gera um QR a partir de um link/texto (desenhado pelo próprio servidor) |
| Mural de fotos (QR) | O público lê o QR, manda foto pelo celular e ela aparece na TV em segundos |

**Música de fundo.** Cada tela tem uma trilha própria (MP3/M4A/OGG/WAV), com
volume, ordem aleatória e controle ao vivo — play, pausa, pular faixa e volume
agem na TV na hora, sem salvar nem recarregar. Vídeo com som abaixa a música e
ela volta quando ele acaba. Navegador só libera som depois de um toque na tela
da TV; quando isso falta, o player avisa em vez de fingir que tocou.

Todos os conteúdos prontos (exceto os que já têm arte própria, como o cartão de
aniversário) usam a **superfície adaptativa** — herdam fundo e cores do tema atual.

---

## Arquitetura e limites

- **Multi-tenant por `tenant_id`**, com papéis (dono, admin, membro). Sessão em
  cookie HttpOnly; a TV se identifica por um token próprio (cabeçalho), e o
  tempo real (SSE) usa um passe de 1 minuto — nunca o token na URL.
- **A tela nunca para.** Fatura atrasada, crédito acabado ou teste vencido não
  apagam a TV de ninguém. O que se corta é IA e tela nova (ver
  [`docs/BILLING.md`](docs/BILLING.md)).
- **Offline-first.** A TV guarda a última config e as mídias; se ligar sem
  internet, mostra o que tinha e insiste com o servidor até voltar.
- **Uma instância só, por enquanto.** SSE, limites e comandos pendentes vivem
  em memória do processo. Para escalar horizontalmente é preciso levar isso
  para um Redis (ver `docs/LANCAMENTO.md`).
- **Mídia no R2/S3** (`STORAGE=s3`). Sem isso, a mídia vai para o disco do
  contêiner e some no próximo deploy.
- **Dependências externas de conteúdo:** notícias (RSS, com proxy público de
  reserva), clima (Open-Meteo), mapas (OSM), trânsito (Waze) e YouTube. O QR e
  as fontes são nossos.

> **Fontes ao vivo (HDMI/stream):** um navegador não lê HDMI-in nem sintonizador de
> TV diretamente. Para exibir uma entrada HDMI, use um **captador HDMI→USB** (o
> conteúdo "Entrada HDMI / USB" lê esse dispositivo ao vivo). Para canais, use um
> **stream/IPTV** (`.m3u8`) ou o conteúdo **YouTube / Ao vivo**.

---

## Dicas para a TV

- O endereço é sempre **`seu-dominio/tv`**. `/tv?new=1` esquece o pareamento
  e gera outro código (TV trocada de sala ou de cliente).
- TV Box / mini-PC: configure para abrir o navegador em tela cheia no `/tv` ao
  ligar (modo quiosque; no Chrome, `chrome --kiosk https://seu-dominio/tv`) e
  desligue a suspensão de tela.
- **Recarregar a TV** e ver **resolução e aparelho** estão no cartão da tela,
  em **Telas**. O **horário de funcionamento** de cada tela (sino) decide
  quando o alerta de queda por e-mail vale.

---

## Perguntas comuns

**Preciso de internet?** Para receber publicações, sim. Sem internet a TV
continua exibindo a última programação e as mídias que já baixou.

**Onde os dados ficam?** No banco do servidor (Postgres) e a mídia no R2/S3. A
TV guarda uma cópia da última config para funcionar offline.

**O que acontece se o cliente não pagar?** A tela continua no ar. Depois de 7
dias de atraso, param a IA e o pareamento de telas novas. Terminado o teste
sem assinatura, a tela mostra um selo discreto "versão gratuita".
