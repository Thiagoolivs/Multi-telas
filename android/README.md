# MultiTelas TV — app de quiosque para TV Box

O player do MultiTelas é web (`/tv`). Este app é só a moldura que um TV Box
comum não tem:

- abre direto no `/tv`, em tela cheia, e **não sai dali** (VOLTAR não fecha);
- **mantém a tela acesa**;
- se a página travar ou o processo do WebView morrer, **volta sozinho**
  (o vigia, abaixo); se o app cair, **reabre em 2 segundos**;
- a identidade da tela fica no armazenamento do WebView do próprio app, que
  não é limpo como o navegador de algumas TVs;
- aparece no painel, no cartão da tela, como "App 1.0.N".

## Contra travamento (o vigia do app)

O vigia (`MainActivity`, regras em `RegrasDoVigia.java`) pergunta à página
a cada minuto se o player está de pé. Desde o vigia v2:

| A página… | O que conta | O que o app faz |
|---|---|---|
| responde "ok" | — | zera a conta |
| responde, mas não é o player (página em branco, erro, aparelho antigo) | falha "fora" | 3 seguidas: **recarrega** (como antes, de 3 em 3 min no máximo). Não sobe a escada. |
| **não responde** em 1 min (JavaScript ou renderizador travado) | falha "silêncio" | sobe a escada, sempre com 3 falhas seguidas antes de cada degrau |
| tem uma zona parada há mais de 15 min, com o servidor respondendo (o vigia da página tentou e não resolveu — `js/vigia.js`) | falha "parado" | sobe a escada |

A escada: **1.** recarregar a página → **2.** recriar o WebView (no Android
10+ mata o processo do WebView com `terminate()`; antes do 10, troca o
WebView) → no **Android até 9**, com silêncio, o 2º degrau é **reiniciar o
app** (alarme de 2 s + sair), porque lá o renderizador travado não morre
sozinho; **no máximo uma vez a cada 6 h** (a marca fica gravada) → depois do
topo, **uma ação a cada 30 min no máximo**. 30 min sem falha e a escada
volta ao começo. Com outra tela por cima (configurações, instalador), só o
1º degrau. Enquanto aparece "Procurando a internet…", o vigia descansa (a
nova tentativa de 15 s cuida). O processo do WebView que cai sozinho 4 vezes
em 10 min espera 1 min antes de carregar de novo.

**Uma vez por dia**, a recarga da madrugada do player (`js/vigia.js`: ligado
há mais de 20 h, entre 3h e 5h da loja, com o servidor respondendo) vira um
**WebView novo** no app: devolve também a memória do processo do WebView,
que a recarga da página não devolve. Quem decide a hora é o vigia da página;
o app só executa — os dois nunca agem na mesma madrugada.

**Reiniciar o app pelo painel:** Telas › Mais opções › **Reiniciar o app da
TV** (só aparece na TV com o app). A página marca `window.MT_REINICIAR` e o
vigia recria o WebView em até 1 min (no máximo um pedido a cada 5 min; sem
ele agir em 3 min, a página recarrega). Não é um método da ponte `MTApp` de
propósito: a ponte é vista por todo iframe, e um site externo num conteúdo
reiniciaria a TV em laço.

O que o vigia fez vai no pulso (`info.appVigia`, por exemplo
"recargas 1 · webview 0 · pedidos 1 · app 0": recargas e WebViews novos por
falha e pedidos da página — madrugada e painel — desde que o app abriu; "app"
são os reinícios do app pelo vigia, no aparelho) e no log do Android
(`adb logcat -s MultiTelas`).

## Onde baixar

Cada push em `android/` compila no GitHub Actions (workflow **App Android**).
O `.apk` fica em **Actions › App Android › (a execução) › Artifacts**. Com a
chave de release configurada, o APK assinado da `main` fica também em
**Releases** (`apk-v…`) e em `<servidor>/apk/ultimo.apk` — esse não expira.

O endereço do servidor entra no build pela variável do repositório `MT_URL`
(**Settings › Secrets and variables › Actions › Variables**), por exemplo
`https://tv.multitelas.net.br`. Sem ela, o padrão do `app/build.gradle`, que
já é `https://tv.multitelas.net.br`.
Trocou a variável? **Actions › App Android › Run workflow** gera o APK novo.

## Atualização remota (D41)

O player se atualiza sozinho a cada publicação; o app (esta moldura) também,
desde que o APK seja **assinado sempre com a mesma chave** — o Android só
aceita atualização com a mesma assinatura.

1. Com os secrets da chave (ver **Play Store**, abaixo), cada push na `main`
   que mexe em `android/` publica um Release `apk-v<versão>` com o
   `multitelas-tv.apk` assinado e o `versao.json` (versionCode, versionName,
   tamanho, sha256).
2. O servidor busca o Release mais novo (a cada 30 min), confere o sha256 e
   serve em `/apk/versao.json` e `/apk/ultimo.apk` — a TV baixa só de nós.
   `MT_APK_REPO=desligado` no servidor tira isso do ar.
3. O app confere 3 min depois de abrir e de 6 em 6 horas. Versão nova:
   baixa em segundo plano, confere tamanho, sha256, pacote e versão, e mostra
   um aviso pequeno no canto de cima ("aperte OK para instalar"). O OK do
   controle abre o instalador do Android; mais um OK instala. No Android 8+
   a primeira vez pede "permitir instalar apps" para o MultiTelas TV.
4. O painel mostra no cartão da tela "App novo (1.0.N)".

Falhou (sem rede, sem espaço, assinatura diferente): a TV segue na versão
de agora, exibindo normalmente, e não insiste nessa versão.

**Uma vez só:** os APKs de antes da chave foram assinados com a chave de
debug do runner, que muda a cada execução. Esses boxes precisam de UMA
reinstalação manual (desinstalar e instalar o primeiro APK assinado, do
Release). Daí em diante, atualizam sozinhos. O painel avisa: "instale uma vez
pelo pendrive".

## Instalar num TV Box (sideload)

1. Copie o `.apk` para um pendrive (ou use o app "Send files to TV").
2. No box: **Configurações › Segurança › Fontes desconhecidas** (ou "Instalar
   apps desconhecidos" para o gerenciador de arquivos) — permitir.
3. Abra o `.apk` pelo gerenciador de arquivos e instale. **Box com o app de
   antes da chave de release** (o box de teste está no 1.0.55): desinstale
   o antigo primeiro — a assinatura é outra e o Android recusa por cima.
   Uma vez só; daí em diante ele se atualiza sozinho.
   **Android 8 ou mais novo:** na primeira atualização remota o box pede,
   uma vez, "permitir instalar apps desta fonte" para o MultiTelas TV.
   Permita (ou já deixe permitido aqui, na instalação).
4. **Faça o app abrir sozinho quando o box liga — de preferência como TELA
   INICIAL.** Ser a tela inicial é a única garantia de a TV voltar sozinha
   depois do que o app não consegue tratar: o Android matando o app por
   falta de memória, uma queda nativa e a **atualização do Android System
   WebView** (que mata o app). O app conta no pulso se é a tela inicial, e o
   painel avisa na página da TV quando não é. No Android 10+ (Google
   TV incluso) abrir sozinho ao ligar exige UMA destas duas coisas:
   - **Permitir "Sobrepor a outros apps"** — o app abre essa tela na primeira
     vez; é só ativar. Se a tela não abrir: Configurações › Apps › Acesso
     especial › Sobrepor a outros apps › MultiTelas TV.
   - **Ou definir como tela inicial** — Configurações › Apps › Apps padrão ›
     Tela inicial (ou aperte HOME e escolha "Sempre").
   No Google TV essas opções às vezes estão escondidas. Com o box no mesmo
   Wi-Fi de um computador com `adb` (Opções do desenvolvedor › Depuração USB
   /rede):
   ```
   adb connect IP-DO-BOX
   adb shell appops set br.com.multitelas.tv SYSTEM_ALERT_WINDOW allow
   adb shell cmd package set-home-activity br.com.multitelas.tv/.MainActivity
   ```
   **Teste antes de sair da loja:** tire o box da tomada, ligue de novo, e
   confira que o MultiTelas volta sozinho.
5. A TV mostra o código e o QR. Aponte o celular e pareie.

Trocar o servidor na própria TV: **aperte VOLTAR cinco vezes seguidas**.

Para sair do quiosque (manutenção): Configurações do Android › Apps ›
MultiTelas TV › Forçar parada, e volte a tela inicial para a padrão.

## Aparelho

Qualquer Android 5+ com WebView atualizado — **motor Chromium 56 ou mais
novo**; abaixo disso a TV mostra o aviso "O WebView deste aparelho é antigo
para o MultiTelas" (`js/compat.js`). A tabela completa, por aparelho, e o
que muda em cada faixa está em `docs/APARELHOS.md`. Recomendado: **Android 9 ou mais
novo, 2 GB de RAM**, rede cabeada quando der. Box de 1 GB roda, mas vídeo em
1080p com transição engasga. Homologue um modelo e compre sempre o mesmo:
lote de TV Box barato muda de hardware sem avisar.

## Play Store

Precisa de build de release assinado: gere uma chave
(`keytool -genkeypair -v -keystore release.jks -alias multitelas -keyalg RSA -keysize 2048 -validity 10000`)
e cadastre nos secrets do repositório `MT_KEYSTORE_BASE64` (o `.jks` em
base64), `MT_KEYSTORE_PASSWORD`, `MT_KEY_ALIAS` e `MT_KEY_PASSWORD`. O
workflow passa a gerar também o release. **Guarde a chave fora do GitHub
também**: perder a chave é nunca mais conseguir atualizar o app na loja.

## Limites conhecidos

- O ambiente de desenvolvimento não traz o Android SDK; o CI compila e
  publica. Dá para compilar aqui baixando o SDK (`sdkmanager
  "platforms;android-34" "build-tools;34.0.0"`, `ANDROID_HOME` apontando para
  ele) — o vigia v2 foi compilado e passou no lint assim. As regras do vigia
  (`RegrasDoVigia.java`) não usam nada do Android: o `npm test` as compila e
  roda com o `javac` da máquina (`test/app-contra-travamento.test.js`).
- `usesCleartextTraffic=true`: produção é HTTPS, mas o endereço trocado na
  TV (5× VOLTAR) aceita `http://` para testar com um servidor na rede local.
