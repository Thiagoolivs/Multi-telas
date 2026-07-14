# Raft Mídia — Mídia Indoor para TVs Corporativas

Sistema de **multi-telas na mesma exibição** (digital signage) no estilo Pix Mídia,
feito para rodar em TVs corporativas com **atualização fácil** e **templates prontos**.
Identidade visual padrão da **Raft Embalagens** (verde militar), totalmente personalizável.

Funciona **100% no navegador**, sem servidor obrigatório — nada de backend para cair.
Basta abrir a página numa Smart TV, mini-PC, TV Box ou Chromecast/navegador.

---

## O que ele faz

- **Multi-telas numa só exibição:** várias zonas independentes (principal, lateral,
  cabeçalho, rodapé) rodando conteúdos diferentes ao mesmo tempo.
- **Visual premium com glassmorphism:** zonas em vidro fosco com profundidade,
  fundo vivo (aurora + granulado sutil) e transições cinematográficas.
- **9 temas premium prontos:** Dark Premium, Corporate Blue, Luxury Gold, Neon Cyber,
  Glassmorphism, Minimal White, Elegant Black, Energy Green e Modern Purple — trocar
  o tema reestiliza a interface inteira num clique.
- **Editor visual de tema:** cores (primária/secundária/destaque/fundo), fontes
  (Inter, Poppins, Montserrat, Roboto, Space Grotesk) e sliders de vidro, desfoque,
  cantos e intensidade dos efeitos — com prévia ao vivo. Identidade visual própria.
- **8 templates prontos** com **zonas clicáveis** — incluindo o "Painel Notícias"
  (clima na lateral, destaque grande e faixa de notícias com relógio ao vivo).
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
- **10 tipos de conteúdo:** Texto/Comunicado, Aviso, Imagem, Vídeo (MP4),
  YouTube/Ao vivo, Aniversariantes, Relógio, Clima, Página Web e QR Code.
- **Painel de gestão visual:** qualquer pessoa atualiza sem saber programar.
  Prévia ao vivo do que a TV vai exibir.
- **Rodapé de avisos rolando** (ticker) e **cabeçalho com relógio + clima**.
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
│   ├── storage.js       # Dados: salvar/carregar/exportar/importar/remoto
│   ├── news.js          # Notícias automáticas via RSS
│   ├── render.js        # Renderiza cada tipo de conteúdo
│   ├── player.js        # Motor de exibição (zonas, rotação, ticker)
│   └── admin.js         # Lógica do painel de administração
├── server.js            # Servidor estático (deploy Railway/Node)
└── README.md
```

### Modelo de dados (config)

```jsonc
{
  "settings": {
    "nome": "Raft Embalagens",
    "layoutId": "corporate",     // template escolhido
    "titulo": "Raft Embalagens",
    "cor": "#4B5320",            // cor da marca (verde militar Raft)
    "cidadeClima": "São Paulo",
    "logoUrl": "",
    "transicao": "fade",         // fade | slide | none
    "remoteConfigUrl": "",       // URL de config remota (opcional)
    "refreshSeconds": 60
  },
  "zonas": {
    "principal": { "items": [ /* conteúdos que giram */ ] },
    "lateral":   { "items": [ /* ... */ ] },
    "rodape":    { "messages": ["Aviso 1", "Aviso 2"], "velocidade": 60 }
  }
}
```

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
| Relógio | Relógio digital com data |
| Clima (simples) | Temperatura por cidade (Open-Meteo, sem chave de API) |
| Página Web | Incorpora um site via iframe |
| QR Code | Gera um QR a partir de um link/texto |

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

**Dá para ter vários painéis diferentes?** Sim — mantenha um `config.json` por painel
e aponte a URL remota de cada TV para o arquivo correto.
