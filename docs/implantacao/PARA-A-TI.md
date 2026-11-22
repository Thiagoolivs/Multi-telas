# MultiTelas: o que a TI precisa liberar

**O que é:** 8 TVs com um TV box Android (o app MultiTelas TV) mostram os
comunicados do RH. O RH publica pelo navegador, em `app.multitelas.net.br`.
Tudo é **saída HTTPS na porta 443**. **Nenhuma porta de entrada.**

## 1. Liberar na saída (TCP 443, HTTPS)

| Endereço | Quem usa | Para quê | Precisa? |
|---|---|---|---|
| `tv.multitelas.net.br` | as TVs | Tudo da TV: a página, a programação, o canal ao vivo, as fotos e os vídeos (`/media/…`) e a atualização do app (`/apk/…`) | **Sim** |
| `app.multitelas.net.br` | os computadores e celulares do RH | O painel onde se publica | **Sim** |
| `geocoding-api.open-meteo.com`, `api.open-meteo.com` | as TVs | A temperatura no cabeçalho (ligada por padrão) e os quadros de clima | Não. Sem eles, a temperatura some e o resto segue |
| `www.youtube.com` e os domínios do próprio YouTube | as TVs | Só se publicarem vídeo do YouTube. O YouTube carrega outros endereços dele (`*.googlevideo.com`, `*.ytimg.com`). A lista é do Google, não nossa | Não |
| `embed.waze.com` / `www.openstreetmap.org` | as TVs | O quadro de trânsito / o de mapa (o mapa também baixa imagens dos servidores do OpenStreetMap) | Não |
| `view.officeapps.live.com` | as TVs | O tipo "Apresentação" (PPTX), pelo visualizador da Microsoft. Não recomendamos: o RH exporta os slides como imagem ou vídeo | Não |
| `g1.globo.com`, `rss.uol.com.br`, `feeds.folha.uol.com.br`, `www.cnnbrasil.com.br`, `feeds.bbci.co.uk`, `agenciabrasil.ebc.com.br`, `exame.com`, e os de reserva `api.allorigins.win`, `api.rss2json.com` | as TVs | As manchetes no rodapé, só se o RH escolher "notícias" | Não |
| Google Play e serviços do Google | os boxes | Atualizar o **Android System WebView** (o navegador que roda a TV) e o sistema. A lista é a do Google: *Android Enterprise network requirements* | **Recomendado** |
| `multitelas.net.br` | os computadores | O site | Não |

**Rede básica:** DNS (UDP/TCP 53) para o DNS da empresa, e **NTP (UDP 123)**
(seção 4).

**Não precisa liberar:**

- `cdn.jsdelivr.net`: aparece no código do player, mas a nossa própria
  política de segurança barra, e nenhuma TV pede;
- fontes e QR codes: saem do nosso servidor;
- o armazenamento de arquivos (R2): fotos e vídeos passam por
  `tv.multitelas.net.br/media`;
- Analytics: não roda na TV.

**Conteúdo com endereço de fora** (uma imagem por link, uma página web): a TV
busca no endereço daquele conteúdo, e aí ele também precisa estar liberado.

**Se usarem Indicadores › Receber:** o servidor interno que manda os números
faz `POST https://app.multitelas.net.br/api/kpis/entrada`, com um token. Também
é só saída.

## 2. Entrada: nenhuma

A TV abre a conexão para fora e a mantém aberta. Os comandos do painel
(recarregar, reiniciar, um aviso urgente) chegam por ela. Não precisa de
redirecionamento de porta, VPN, IP público fixo nem acesso remoto à rede. O
`adb` (TCP 5555, na rede local) só é usado por quem instala, se precisar, e
fica desligado depois.

## 3. Proxy e inspeção de SSL

- **Inspeção de SSL: deixe as TVs de fora** (pelos IPs ou pela VLAN das TVs,
  ou pelo endereço `tv.multitelas.net.br`). O app só confia nos certificados
  do próprio Android, e instalar a CA da empresa no box não muda isso. Com a
  inspeção, a TV fica em "Procurando a internet…". Nos computadores do RH, a
  inspeção não atrapalha o painel.
- **Proxy com usuário e senha** (Basic, NTLM, Kerberos): a TV não sabe
  responder. Libere as TVs sem autenticação, ou sem proxy explícito, pela
  regra de firewall da seção 1. O proxy manual nem sempre existe no Android
  TV para o cabo.
- **O canal ao vivo** (`/api/devices/…/events`, `text/event-stream`) é uma
  conexão longa, com um sinal a cada 25 segundos. O proxy **não pode
  segurá-la em buffer** e não pode fechá-la parada por menos de 60 segundos.
  Sem o canal, a TV ainda recebe as mudanças pelo pulso de 30 segundos, mas o
  aviso urgente atrasa.
- **Filtro por categoria:** `tv.multitelas.net.br` pode cair em "sem
  categoria" ou "domínio novo". Libere pelo nome.
- **Downloads:** deixe passar o APK (`/apk/ultimo.apk`,
  `application/vnd.android.package-archive`), senão o app não se atualiza, e
  vídeos MP4 de até 200 MB em `/media/`.

## 4. O box na rede

- **Cabo, de preferência.** Se a porta usa 802.1X, o box não autentica: use
  porta sem 802.1X ou liberação pelo MAC.
- **Wi-Fi, se não houver cabo:**
  - WPA2 ou WPA3 com senha funciona;
  - WPA2-Enterprise (802.1X) é difícil no TV box, por causa dos
    certificados;
  - Wi-Fi com página de login (portal de visitante) **não funciona**;
  - prefira 5 GHz, com sinal bom no lugar da TV;
  - no Android 10 ou mais novo, o Wi-Fi pode usar **MAC aleatório**. Se a TI
    reserva IP ou filtra por MAC, escolha "usar o MAC do aparelho" na rede
    do box, se o aparelho tiver a opção, e anote o MAC que o box mostra
    conectado.
- **DHCP com reserva de IP**, de preferência, ou IP fixo. IPv4 basta.
- **DNS da empresa:** é ele que acha a intranet, se forem usar. No box, o
  "DNS privado" do Android fica em **Automático** ou desligado. Um provedor
  fixo (como `dns.google`) passa por cima do DNS da empresa.
- **Hora certa (NTP) é obrigatória.** Sem ela o HTTPS falha, e o horário e as
  datas da programação erram. A TV não pega a hora do nosso servidor. O
  Android usa `time.android.com` (UDP 123) por padrão, mas alguns
  fabricantes trocam. Se o NTP de fora é bloqueado, libere esse endereço ou
  aponte o box para o NTP da empresa. O Android TV não tem essa opção na
  tela: quem instala faz pelo `adb` (`settings put global ntp_server IP`;
  confirmar no box piloto).
- **Banda:** pouca. Cada TV baixa cada foto e vídeo uma vez e guarda para
  tocar sem internet. Depois disso, só a programação (poucos KB) e o pulso de
  30 segundos.

## 5. Páginas da intranet na TV

A TV abre a página dentro de um quadro (iframe) de uma página
`https://tv.multitelas.net.br`. A nossa política de segurança é
`frame-src 'self' https:`. O detalhe está em
[INTRANET-NA-TV.md](INTRANET-NA-TV.md). O resumo:

- **`http://` não abre.** Duas coisas barram: a nossa política, que só aceita
  https, e o próprio navegador, que bloqueia conteúdo http dentro de uma
  página https;
- **`https://` com certificado da CA interna da empresa também não abre**
  no app. A página precisa de um certificado público, por exemplo
  `intranet.empresa.com.br`, resolvido pelo DNS interno;
- a página precisa **permitir ser mostrada num quadro**:
  `Content-Security-Policy: frame-ancestors https://tv.multitelas.net.br https://app.multitelas.net.br`,
  e sem `X-Frame-Options: DENY` ou `SAMEORIGIN`;
- **página com login não funciona.** Use uma página própria para as TVs, sem
  login, só de leitura;
- nomes terminados em **`.local`** podem não ser achados pelo Android. Teste
  no box piloto.

**Em breve:**

- o **Conector MultiTelas** vai levar arquivos da pasta de rede e o feed da
  intranet até as TVs, sem nada disso. A TI recebe uma folha própria quando
  ele sair;
- a **API pública** (`/api/v1/`) vai deixar os sistemas da empresa
  publicarem na TV.

## 6. Para a TI responder

- [ ] Saída 443 liberada para `tv.multitelas.net.br` (as TVs) e
  `app.multitelas.net.br` (os computadores), e os opcionais que quiserem
- [ ] As TVs fora da inspeção de SSL e sem proxy com autenticação
- [ ] O canal ao vivo sem buffer, e as conexões paradas fechadas só depois de
  60 segundos ou mais
- [ ] 8 pontos de rede (ou o Wi-Fi), com DHCP, DNS e NTP, e a reserva de IP
  pela planilha de instalação
- [ ] A TV piloto ligada no D-7 recebeu uma mudança do painel em até 5
  segundos

Dúvidas: o contato de suporte do MultiTelas.
