# Roteiro de instalação: uma TV de cada vez

Para quem instala. São duas partes: **a bancada** (D-3, no escritório, os 9
boxes de uma vez) e **a parede** (no dia D, uma TV de cada vez, com o teste de
5 minutos no fim). Leve a planilha de instalação: nome, lugar, grupo, deitada
ou em pé, número de série e MAC do box, ponto de rede.

O que levar: os boxes já montados, o box reserva, cabos HDMI e de rede de
sobra, filtro de linha com DPS, velcro, etiquetas, um notebook com `adb` e o
APK, o celular logado no painel e esta folha.

## Parte 1: a bancada (D-3, cerca de 20 minutos por box)

Faça tudo isto em cada box, com o box no cabo de rede.

1. **Ligar e configurar o Google TV ou Android TV.** Use uma **conta Google da
   empresa**, a mesma em todos os boxes, e não uma pessoal. Sem conta, a Play
   Store não atualiza o *Android System WebView*, que é o navegador que roda a
   TV.
2. **Atualizar tudo:** o sistema (Configurações › Sistema › Sobre ›
   Atualização) e, na Play Store, **Android System WebView** e os outros
   apps. Ligue a atualização automática de apps.
3. **Data e hora:** automáticas (pela rede). Fuso horário de **Brasília**.
   Idioma: português.
4. **Tela:** resolução de saída **1080p**. HDMI-CEC ligado.
5. **Energia e descanso** (os nomes mudam por aparelho):
   - em Sistema › Energia, "Desligar a tela quando inativo" ou "Economia de
     energia": **Nunca**, ou o maior tempo que houver;
   - o protetor de tela ou modo ambiente: **desligado**;
   - "Desligar o aparelho" ou "Suspender": nunca.

   Se a opção "Nunca" não existir, faça pelo `adb` (passo 7):
   `adb shell settings put secure attentive_timeout -1` e
   `adb shell settings put secure sleep_timeout -1`. **Confirme na TV piloto**
   que ela passa da 4ª hora ligada sem apagar: o app mantém a tela acesa, mas
   o descanso por inatividade do Google TV pode passar por cima.
6. **Instalar o app MultiTelas TV**, o APK de
   `https://tv.multitelas.net.br/apk/ultimo.apk`, por um destes caminhos:
   - pelo `adb`, o mais rápido para 9 boxes: `adb install multitelas-tv.apk`;
   - por um pendrive e um gerenciador de arquivos (permita "instalar apps
     desconhecidos" para o gerenciador);
   - por um app de download, digitando o endereço.

   Box que já tinha um app MultiTelas de teste, assinado com outra chave:
   desinstale antes ([android/README.md](../../android/README.md)).
7. **Abrir o app uma vez:**
   - permita **"Sobrepor a outros apps"**, quando ele pedir;
   - permita **"Instalar apps desconhecidos" para o MultiTelas TV**, senão a
     atualização sozinha não instala.

   Se as telas não abrirem, faça pelo `adb`. Ligue em Opções do
   desenvolvedor › Depuração USB ou de rede, depois rode:
   ```
   adb connect IP-DO-BOX
   adb shell appops set br.com.multitelas.tv SYSTEM_ALERT_WINDOW allow
   ```
8. **O MultiTelas como TELA INICIAL** (o mais importante). É a única garantia
   de a TV voltar sozinha quando o Android fecha o app por falta de memória
   ou ao atualizar o WebView. Faça um destes:
   - aperte **Início** (a casinha) no controle e escolha **MultiTelas TV ›
     Sempre**;
   - ou Configurações › Apps › Apps padrão › **Tela inicial** › MultiTelas
     TV;
   - **no Google TV**, que costuma esconder a opção:
     `adb shell cmd package set-home-activity br.com.multitelas.tv/.MainActivity`.
9. **Teste da tomada na bancada:** tire o box da tomada, espere 10 segundos e
   ligue. O MultiTelas tem que abrir sozinho, sem tocar no controle, e
   mostrar o código. Se abrir o menu do Google TV, volte ao passo 8.
10. **Desligue a depuração** (Opções do desenvolvedor) e **etiquete** o box,
    o controle e a fonte com o nome da TV.

## Parte 2: a parede (dia D, uma TV de cada vez)

### 1. Montar

- O box atrás da TV, com velcro e ar em volta, ligado na **fonte dele**
  (nunca na USB da TV), no mesmo filtro de linha da TV.
- HDMI na entrada que vai ficar fixa. Cabo de rede no ponto da TI.
- **Na TV:** desligue o desligamento automático, o modo Eco e o "desligar sem
  sinal". Ligue o HDMI-CEC. Se houver a opção, deixe a TV ligar quando a
  energia voltar. Em "Tamanho da imagem", use "Ajustar à tela" (Just Scan),
  senão as bordas cortam.

### 2. Ligar e parear

1. Ligue. O MultiTelas abre sozinho e mostra **um código de 6 letras e um
   QR**. Se aparecer **"Procurando a internet…"**, veja "Quando dá errado",
   no fim desta folha.
2. No celular, no painel (`app.multitelas.net.br`): **Telas › Ligar uma TV**.
   Digite o código e o **nome da planilha** (ex.: "Refeitório"; as sugestões
   embaixo do campo preenchem com um toque). Toque em **Ligar**. Sem nome, a
   TV vira "TV 2", "TV 3"…, e aí é preciso renomear depois. Na primeira TV da
   conta, o "Sua primeira TV" também pede o nome (o campo vem com "TV 1":
   troque pelo da planilha). O QR também serve, mas abre o painel no
   endereço da TV e pode pedir login de novo.
3. Em poucos segundos a TV sai do código e mostra a programação (ou a marca
   da empresa, se ainda não houver programação).
4. Se aparecer **"O plano grátis tem 1 TV"**, o plano da conta não está pronto.
   Pare e fale com o dono. O código fica na tela: resolvido o plano, digite o
   mesmo código de novo.
5. Se aparecer **"Esta TV é do mesmo modelo de uma TV da conta que parou de
   dar sinal"**, com o nome dela, o grupo e a hora do último sinal (ex.:
   "Recepção · grupo Produção · último sinal há 12 min (hoje, 09:40)"), numa
   TV que você está instalando agora, toque em **"Não, é outra TV"**: é o
   botão violeta, o primeiro. A pergunta aparece porque os 8 boxes são iguais
   e uma TV já pareada está desligada ou sem rede.
   **"É a Recepção, que voltou"** só serve para a TV que **já funcionava** e
   voltou mostrando um código (ela assume o nome e a programação da antiga).
   Esse botão pede confirmação, com a hora do último sinal: se a Recepção
   continua na parede dela, toque em **Cancelar**. Confirmar por engano tira a
   programação de outra parede.

### 3. Nome, grupo e horário

- Telas › a TV › Mais opções › **Nome e grupo**: o grupo da planilha (ex.:
  "Refeitório", "Produção").
- Mais opções › **Horário e aviso de queda**: o expediente daquele lugar e o
  que a TV mostra fora dele. O aviso por e-mail fica **ligado**.

### 4. O conteúdo

- Se o conteúdo do grupo já está pronto numa TV (a piloto, por exemplo):
  Mais opções › Backup e cópia › **Copiar de outra tela**.
- Ou: Telas › **Abrir a TV**, e o conteúdo do dia 1 aprovado pelo RH.

### 5. Conferir a página da TV no painel

Telas › **Abrir a TV**. No topo, tem que aparecer:

- **"No ar · sinal agora"**;
- na lista de Telas, debaixo do nome: **"1920×1080 · App 1.0.N"**. Se aparecer
  só "Android", a TV está no navegador e não no app;
- **nenhum aviso amarelo "Esta TV pode não voltar sozinha".** Se aparecer,
  o app não é a tela inicial: volte ao passo 8 da bancada. O aviso some na
  próxima vez que a página abrir;
- no cartão da TV, nenhum "App novo… aperte OK no controle". Se houver, aperte
  OK no controle da TV, e OK de novo no instalador.

E **Ver agora** mostra o mesmo que a TV está passando.

### 6. O comando "Reiniciar"

Mais opções › **Reiniciar o app da TV** (só aparece na TV com o app). O
cartão diz "Reiniciando o app da TV (até 1 minuto)…". Em até 1 minuto a TV
apaga rapidinho e volta **com a mesma programação, sem código**. É o que o RH
vai usar quando "Recarregar a TV" não resolver. Ele aceita um pedido a cada 5
minutos.

### 7. O teste de 5 minutos (abaixo), e anotar na planilha

## O teste de aceitação: 5 minutos por TV

TV: ____________ · Grupo: ____________ · Box (série): ____________ · Data e hora: ____________

| # | Tempo | Faça | Esperado | ✅ / ❌ |
|---|---|---|---|---|
| 1 | 0:00 | Olhe a TV e a página dela no painel | A programação certa. "No ar". "App 1.0.N". Sem o aviso de tela inicial | |
| 2 | 0:30 | Mude um texto e toque em **Pôr na TV** | A TV muda em **até 5 segundos**. Se passar de 30, o canal ao vivo está barrado: anote e avise a TI | |
| 3 | 1:00 | Página da TV › **Desfazer** | A TV volta ao que estava | |
| 4 | 1:30 | **Ver agora** | O celular mostra o que a TV está passando | |
| 5 | 2:00 | Mais opções › **Reiniciar o app da TV** | Em até 1 minuto a TV volta, com a mesma programação e sem código | |
| 6 | 3:00 | Tire **o box e a TV** da tomada, espere 10 s e ligue os dois | A TV acende sozinha, o MultiTelas abre sozinho e volta à programação, sem código, em até 2 minutos | |
| 7 | 5:00 | De onde as pessoas ficam (uns 3 m): leia a TV | Tudo legível, nada cortado nas bordas (se cortar: Ajustes da TV › Encaixe) | |

**Só na TV piloto**, mais dois testes: tire o cabo de rede por 2 minutos (a TV
continua passando e, com o cabo de volta, recebe sozinha a próxima mudança) e
deixe a TV ligada por 72 horas, sem apagar sozinha.

A TV passa com os 7 ✅. Um ❌ no 1, no 5 ou no 6 é para resolver antes de ir
para a próxima TV.

## Quando dá errado

| O que aparece | Causa provável | O que fazer |
|---|---|---|
| "Procurando a internet…" | Sem rede, DNS, hora errada, inspeção de SSL ou proxy com senha | Confira o cabo e a luz do ponto. Veja a data e hora do box: hora errada derruba o HTTPS. Depois, a TI, com o [PARA-A-TI.md](PARA-A-TI.md) §3 |
| A TV mostra o código depois de religar | A TV perdeu o vínculo | Mais opções › **Reconectar** e digite o código novo: volta tudo, sem ocupar outra vaga |
| Ao religar, abre o menu do Google TV | O app não é a tela inicial | Bancada, passo 8 |
| Tela preta, e o painel diz "No ar" | A TV em espera, a entrada HDMI errada ou o CEC desligado | Os ajustes da TV (Montar) |
| "O WebView deste aparelho é antigo para o MultiTelas" | O Android System WebView está velho | Play Store › Android System WebView › Atualizar. Se não houver atualização, o box não serve |
| "O plano grátis tem 1 TV" | O plano da conta | O dono, em Plano |
| A mudança demora mais de 30 segundos | O canal ao vivo está barrado no proxy | A TI ([PARA-A-TI.md](PARA-A-TI.md) §3) |
| Apaga sozinha depois de horas | O descanso do box ou o desligamento automático da TV | Bancada, passo 5, e os ajustes da TV |
| Engasga ou fica lenta | Box fraco ou saída em 4K | A saída em 1080p. O modo leve liga sozinho. Persistiu: trocar pelo box reserva e anotar o modelo |
| A borda corta o texto | O "tamanho da imagem" da TV | "Ajustar à tela" na TV, ou Ajustes da TV › Encaixe |
| O box morreu | — | Box reserva: ligar, e na TV antiga do painel, **Reconectar** com o código do reserva |

Anote tudo que deu errado, com a hora e o que resolveu. Vira a pauta do D+7.
