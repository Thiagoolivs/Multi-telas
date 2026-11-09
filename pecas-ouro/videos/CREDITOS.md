# Banco de vídeos da foto viva

Laços curtos e mudos para os espaços de foto das peças (FOTO VIVA): o café fumegando, o pão saindo
do forno, a faísca da solda. Todo espaço de foto (`data-campo-img`) aceita um destes no lugar da
foto; na TV ele toca em laço, sem som, com o mesmo encaixe da foto (foco, fundo desfocado), e no
modo leve aparece o poster parado (`js/peca-render.js`, `videoNoLugar`). O cliente escolhe na aba
"Banco de fotos" do "Trocar foto", no filtro **Vídeos** (`web/src/components/fotos/TrocarFoto.jsx`).

## O formato

`banco.json` segue o banco de fotos (`pecas-ouro/fotos/banco.json`), com dois campos a mais:

| Campo | O quê |
|---|---|
| `id` | `<pasta>-<nome>` |
| `arquivo` | `/pecas-ouro/videos/<pasta>/<nome>.mp4` |
| `poster` | o primeiro quadro, em JPEG, **ao lado** do vídeo (`<nome>.jpg`) — é onde a TV o procura |
| `ramos` | ids de `js/paletas.js` (`RAMOS`), ou `geral` |
| `papel` | `produto`, `ambiente`, `pessoa` ou `textura` |
| `foco` | `{ x, y }` de 0 a 1: o que não pode sair do corte |
| `duracao` | segundos (5 a 10) |
| `descricao`, `credito`, `licenca`, `fonte` | o que é, de quem é, sob que licença e onde está |

## Como cada vídeo foi feito

Baixado do Pexels (arquivo original do `videos.pexels.com`), e refeito com o ffmpeg:

- o trecho escolhido (5 a 8 s), recortado em 16:9 (o vídeo deitado) ou quadrado (o vídeo em pé);
- **laço sem emenda**: o último segundo do trecho é fundido no primeiro (`xfade`), de modo que o fim
  do vídeo continua exatamente no começo; a sala de espera, curta demais, vai e volta;
- H.264 *high* 4.1, até 1080p, CRF 26 com teto de 4 Mbps, 24 a 30 quadros, sem áudio, `faststart`
  (a TV começa a tocar antes de baixar tudo); o poster é o primeiro quadro, JPEG q4.

```
ffmpeg -ss <início> -t <D+1,5> -i original.mp4 -filter_complex \
  "[0:v]crop=<recorte>,scale=-2:'min(1080,ih)',fps=<fps>,format=yuv420p,settb=AVTB,trim=0:<D+1>,setpts=PTS-STARTPTS,split[a][b];\
   [a]trim=<D>:<D+1>,setpts=PTS-STARTPTS[t];[b]trim=0:<D>,setpts=PTS-STARTPTS[m];\
   [t][m]xfade=transition=fade:duration=1:offset=0,format=yuv420p[v]" \
  -map "[v]" -an -c:v libx264 -profile:v high -level 4.1 -preset slow -crf 26 -maxrate 4M -bufsize 8M \
  -g <2×fps> -movflags +faststart nome.mp4
ffmpeg -i nome.mp4 -frames:v 1 -q:v 4 nome.jpg
```

Sem versão 720p: o box de entrada decodifica 1080p em H.264 (`js/video.js`), e a TV fraca de
verdade (modo leve) nem toca o vídeo — mostra o poster. Uma versão menor dobraria o peso do banco
sem servir a ninguém.

## Onde o banco mora (e por quê no repositório)

Os vídeos estão aqui, no repositório, ao lado das fotos: são servidos de `/pecas-ouro/` pelo próprio
servidor (sem depender do bucket), a TV os guarda no cache da mídia (`sw.js`) e toca offline, e o
teste confere arquivo, codec, duração, tamanho e crédito de cada um (`test/foto-viva.test.js`). O
banco inteiro (44 laços com os posters, ~78 MB; em média 1,7 MB por vídeo) fica abaixo do teto de
150 MB que o teste impõe. Na TV, só desce o vídeo que uma peça usa.

Para crescer além disso (centenas de vídeos), o caminho é o bucket de mídia: subir os `.mp4` e os
`.jpg` com o mesmo nome para `media/banco-videos/` no bucket (`MEDIA_PUBLIC_BASE`), apontar o
`arquivo` e o `poster` do `banco.json` para `https://<host do bucket>/media/banco-videos/…` e deixar
no repositório só o índice. A porta já aceita esse endereço (`js/peca-html.js`, `ehMidia` com os
hosts que o servidor declara em `hostsMidia`). Duas coisas mudam junto: o teste do banco passa a
conferir só o índice, e o `sw.js` precisa guardar também a mídia desse host (hoje ele deixa passar
o que vem de outra origem, e a TV sem rede ficaria só com o poster que ainda tiver).

## Licença

Todos sob a [Licença do Pexels](https://www.pexels.com/license/): uso comercial livre, sem
atribuição obrigatória, sem venda do vídeo puro. O crédito fica registrado aqui e no `banco.json`.
Quando o autor não aparece na coluna, ele está na página de origem (o Pexels não deixou ler a
página daqui). Critério da curadoria: calmos, sem rosto de perto (sobretudo na saúde), sem marca ou
logotipo à vista.

| Arquivo | O que mostra | Autor | Duração · tamanho | Licença | Fonte |
|---|---|---|---|---|---|
| `padaria/cafe-fumegando.mp4` | Caneca laranja de café fumegando ao sol da janela | (na página) | 8,0 s · 1080×1080 · 1.2 MB | Pexels License | [Pexels 20736942](https://www.pexels.com/video/a-coffee-cup-with-steam-coming-out-of-it-20736942/) |
| `padaria/cafe-na-xicara.mp4` | Café passado enchendo a xícara vermelha | (na página) | 7,0 s · 1920×1080 · 2.0 MB | Pexels License | [Pexels 852348](https://www.pexels.com/video/coffee-at-the-morning-852348/) |
| `padaria/espresso-saindo.mp4` | Espresso saindo da máquina no copinho de vidro | (na página) | 7,0 s · 1920×1080 · 1.7 MB | Pexels License | [Pexels 853761](https://www.pexels.com/video/coffee-machine-dispensing-coffee-853761/) |
| `padaria/espuma-do-cafe.mp4` | A espuma do café vista de cima | (na página) | 7,0 s · 1920×1080 · 2.5 MB | Pexels License | [Pexels 10014105](https://www.pexels.com/video/close-up-of-a-hot-coffee-10014105/) |
| `padaria/cafe-coado.mp4` | Café coado caindo da jarra de vidro na xícara | (na página) | 7,0 s · 1080×1080 · 0.8 MB | Pexels License | [Pexels 7118100](https://www.pexels.com/video/pouring-black-coffee-into-a-cup-7118100/) |
| `padaria/maos-na-farinha.mp4` | Mãos abrindo a farinha na bancada | (na página) | 7,0 s · 1280×720 · 1.1 MB | Pexels License | [Pexels 11265881](https://www.pexels.com/video/close-up-on-bread-making-11265881/) |
| `padaria/massa-sovada.mp4` | Massa de pão sendo sovada na bancada enfarinhada | (na página) | 7,0 s · 1920×1080 · 2.2 MB | Pexels License | [Pexels 8190079](https://www.pexels.com/video/close-up-of-a-person-kneading-a-dough-8190079/) |
| `padaria/padeiro-modelando.mp4` | Padeiro modelando os pães na bancada | (na página) | 7,0 s · 1920×1080 · 1.8 MB | Pexels License | [Pexels 3195294](https://www.pexels.com/video/a-baker-showing-his-skill-in-forming-a-dough-ready-for-baking-3195294/) |
| `padaria/biscoitos-no-forno.mp4` | Biscoitos crescendo e dourando no forno | (na página) | 8,0 s · 1920×1080 · 1.4 MB | Pexels License | [Pexels 852375](https://www.pexels.com/video/backing-cookies-852375/) |
| `padaria/pao-partido.mp4` | Pão quentinho sendo partido com as mãos | (na página) | 6,0 s · 1920×1080 · 1.0 MB | Pexels License | [Pexels 6421230](https://www.pexels.com/video/a-person-tearing-a-bread-6421230/) |
| `restaurante/vinho-na-taca.mp4` | Vinho tinto servido na taça de cristal, à mesa | cottonbro studio | 5,5 s · 1080×1080 · 0.8 MB | Pexels License | [Pexels 3198246](https://www.pexels.com/video/a-person-pouring-red-wine-on-a-wine-glass-3198246/) |
| `restaurante/vinho-servido.mp4` | Vinho tinto sendo servido na taça, à mesa | RDNE Stock project | 8,0 s · 1080×1080 · 1.1 MB | Pexels License | [Pexels 6005092](https://www.pexels.com/video/pouring-red-wine-in-a-glass-6005092/) |
| `restaurante/massa-servida.mp4` | Massa cremosa saindo da frigideira para o prato | (na página) | 6,0 s · 1920×1080 · 2.1 MB | Pexels License | [Pexels 3196175](https://www.pexels.com/video/cooking-creamy-pasta-on-a-pan-3196175/) |
| `restaurante/espaguete-na-panela.mp4` | Espaguete amolecendo na panela | (na página) | 6,0 s · 1080×1080 · 1.2 MB | Pexels License | [Pexels 6289336](https://www.pexels.com/video/hands-putting-spaghetti-pasta-on-a-pot-6289336/) |
| `lanchonete/hamburguer-na-chapa.mp4` | Hambúrguer chiando na chapa quente | (na página) | 5,0 s · 1920×1080 · 1.9 MB | Pexels License | [Pexels 4131833](https://www.pexels.com/video/close-up-view-of-delicious-grilled-burger-4131833/) |
| `lanchonete/cheeseburger-na-grelha.mp4` | Queijo derretendo nos hambúrgueres da grelha | (na página) | 7,0 s · 1280×720 · 1.1 MB | Pexels License | [Pexels 6756617](https://www.pexels.com/video/cheeseburgers-on-the-grill-6756617/) |
| `lanchonete/batata-fritando.mp4` | Batatas fritando no óleo, no cesto da fritadeira | Ron Lach | 7,0 s · 1920×1080 · 2.9 MB | Pexels License | [Pexels 8880949](https://www.pexels.com/video/a-person-cooking-french-fries-8880949/) |
| `lanchonete/batata-temperada.mp4` | Batata frita temperada, bem de perto | Engin Akyurt | 7,0 s · 1920×1080 · 1.7 MB | Pexels License | [Pexels 7490594](https://www.pexels.com/video/close-up-view-of-french-fries-7490594/) |
| `otica/vitrine-de-oculos.mp4` | Óculos de grau na vitrine de vidro | (na página) | 8,0 s · 1920×1080 · 1.6 MB | Pexels License | [Pexels 5241104](https://www.pexels.com/video/variety-of-eyeglasses-on-display-5241104/) |
| `clinica/recepcao-clara.mp4` | Sala de espera clara e vazia | Enrique Silva | 5,6 s · 1920×1080 · 1.2 MB | Pexels License | [Pexels 5203514](https://www.pexels.com/video/an-empty-hospital-lobby-5203514/) |
| `farmacia/comprimidos.mp4` | Comprimidos e cápsulas coloridos sobre a mesa | (na página) | 8,0 s · 1920×1080 · 0.7 MB | Pexels License | [Pexels 7033922](https://www.pexels.com/video/pills-close-up-7033922/) |
| `farmacia/bancada-de-laboratorio.mp4` | Cápsulas, frascos e béqueres numa bancada de laboratório | (na página) | 5,0 s · 1920×1080 · 0.6 MB | Pexels License | [Pexels 7230312](https://www.pexels.com/video/close-up-view-of-medicines-tablets-and-substances-7230312/) |
| `escritorio/equipe-trabalhando.mp4` | Equipe trabalhando nos computadores do escritório | (na página) | 6,5 s · 1920×1080 · 1.4 MB | Pexels License | [Pexels 3249672](https://www.pexels.com/video/a-group-of-people-busy-working-with-their-computers-3249672/) |
| `escritorio/equipe-conversando.mp4` | Equipe conversando no escritório envidraçado | (na página) | 7,0 s · 1920×1080 · 2.5 MB | Pexels License | [Pexels 6773475](https://www.pexels.com/video/people-working-in-an-office-6773475/) |
| `escritorio/nuvens-sobre-a-cidade.mp4` | Nuvens passando sobre os prédios, em timelapse | (na página) | 8,0 s · 1920×1080 · 3.0 MB | Pexels License | [Pexels 5338574](https://www.pexels.com/video/time-lapse-footage-of-a-sky-on-the-city-5338574/) |
| `escritorio/cidade-de-dia.mp4` | Prédios da cidade sob nuvens brancas, em timelapse | (na página) | 8,0 s · 1920×1080 · 2.3 MB | Pexels License | [Pexels 5335804](https://www.pexels.com/video/time-lapse-video-of-city-buildings-under-white-clouds-5335804/) |
| `escritorio/cidade-ao-entardecer.mp4` | A cidade ao entardecer, céu rosado | (na página) | 8,0 s · 1920×1080 · 2.3 MB | Pexels License | [Pexels 4400217](https://www.pexels.com/video/a-timelapse-video-over-a-city-4400217/) |
| `industria/solda-faiscas.mp4` | Faíscas da solda numa chapa de aço | (na página) | 7,0 s · 1920×1080 · 2.9 MB | Pexels License | [Pexels 6046358](https://www.pexels.com/video/professional-welding-steel-6046358/) |
| `texturas/fumaca-suave.mp4` | Fumaça branca suave no fundo preto | cottonbro studio | 8,0 s · 1920×1080 · 1.0 MB | Pexels License | [Pexels 9694807](https://www.pexels.com/video/footage-of-smoke-against-black-background-9694807/) |
| `texturas/nevoa.mp4` | Névoa densa subindo no escuro | Sayan Malakar | 8,0 s · 1280×720 · 1.2 MB | Pexels License | [Pexels 3996046](https://www.pexels.com/video/smoke-on-a-black-background-3996046/) |
| `texturas/luzes-da-noite.mp4` | Luzes desfocadas da cidade à noite | (na página) | 8,0 s · 1920×1080 · 2.0 MB | Pexels License | [Pexels 854569](https://www.pexels.com/video/video-of-bokeh-lights-854569/) |
| `texturas/luzes-douradas.mp4` | Pontos de luz dourada no fundo escuro | The Marc Knight | 8,0 s · 1920×1080 · 1.1 MB | Pexels License | [Pexels 3400765](https://www.pexels.com/video/video-of-bokeh-lights-3400765/) |
| `texturas/brilho-dourado.mp4` | Brilho dourado desfocado | Nadezhda Moryak | 8,0 s · 1080×1080 · 2.6 MB | Pexels License | [Pexels 6340529](https://www.pexels.com/video/bokeh-effect-of-lights-6340529/) |
| `texturas/seda-creme.mp4` | Seda creme ondulando com a luz | Mikhail Nilov | 8,0 s · 1920×1080 · 2.9 MB | Pexels License | [Pexels 7677259](https://www.pexels.com/video/a-moving-fabric-7677259/) |
| `texturas/seda-vinho.mp4` | Seda cor de vinho em movimento lento | Mikhail Nilov | 8,0 s · 1920×1080 · 3.2 MB | Pexels License | [Pexels 7677235](https://www.pexels.com/video/close-up-video-of-a-red-silk-cloth-7677235/) |
| `texturas/seda-preta.mp4` | Seda preta com reflexos suaves | Mikhail Nilov | 8,0 s · 1280×720 · 1.1 MB | Pexels License | [Pexels 7677321](https://www.pexels.com/video/close-up-video-of-a-black-silk-cloth-7677321/) |
| `texturas/tecido-bronze.mp4` | Tecido acetinado cor de bronze | Artem Podrez | 8,0 s · 1920×1080 · 2.0 MB | Pexels License | [Pexels 7233559](https://www.pexels.com/video/close-up-video-of-a-wave-cloth-7233559/) |
| `texturas/trama-dourada.mp4` | Trama de tecido dourado em câmera lenta | StefWithAnF | 8,0 s · 1920×1080 · 3.2 MB | Pexels License | [Pexels 5514239](https://www.pexels.com/video/macro-view-of-a-yellow-weaved-fabric-5514239/) |
| `industria/fresadora.mp4` | Fresadora desbastando um bloco de metal | Daniel Smyth | 7,0 s · 1920×1080 · 1.4 MB | Pexels License | [Pexels 12918424](https://www.pexels.com/video/close-up-of-grinding-metal-12918424/) |
| `industria/torno-cnc.mp4` | Torno CNC usinando um eixo de aço | Daniel Smyth | 6,0 s · 1600×900 · 0.7 MB | Pexels License | [Pexels 19791092](https://www.pexels.com/video/turning-steel-on-a-cnc-machine-19791092/) |
| `clinica/maos-com-luva.mp4` | Mãos calçando a luva descartável | Kaboompics | 7,0 s · 1280×720 · 0.6 MB | Pexels License | [Pexels 4132752](https://www.pexels.com/video/rekawiczki-4132752/) |
| `farmacia/cartelas-de-comprimidos.mp4` | Cartelas de comprimidos sobre a mesa de madeira | (na página) | 10,0 s · 1920×1080 · 1.6 MB | Pexels License | [Pexels 5406007](https://www.pexels.com/video/aerial-view-of-medicine-strips-on-a-table-5406007/) |
| `salao/corte-com-tesoura.mp4` | Pente e tesoura acertando o corte, de perto | K | 7,0 s · 1280×720 · 0.8 MB | Pexels License | [Pexels 9738001](https://www.pexels.com/video/close-up-of-barber-cutting-hair-9738001/) |
| `salao/barbeiro-cortando.mp4` | Barbeiro acertando o corte com pente e tesoura | ArtHouse Studio | 6,0 s · 1920×1080 · 1.6 MB | Pexels License | [Pexels 7686515](https://www.pexels.com/video/barber-cutting-the-hair-of-the-customer-7686515/) |
