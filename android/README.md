# MultiTelas TV — app de quiosque para TV Box

O player do MultiTelas é web (`/tv`). Este app é só a moldura que um TV Box
comum não tem:

- abre direto no `/tv`, em tela cheia, e **não sai dali** (VOLTAR não fecha);
- **mantém a tela acesa**;
- se a página travar ou o processo do WebView morrer, **volta sozinho**;
  se o app cair, **reabre em 2 segundos**;
- a identidade da tela fica no armazenamento do WebView do próprio app, que
  não é limpo como o navegador de algumas TVs;
- aparece no painel, no cartão da tela, como "App 1.0.N".

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
4. **Faça o app abrir sozinho quando o box liga.** No Android 10+ (Google
   TV incluso) isso exige UMA destas duas coisas:
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

Qualquer Android 5+ com WebView atualizado. Recomendado: **Android 9 ou mais
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

- Não compila no ambiente de desenvolvimento deste repositório (sem Android
  SDK); o CI compila. O Java foi conferido contra a API do Android 9.
- `usesCleartextTraffic=true`: produção é HTTPS, mas o endereço trocado na
  TV (5× VOLTAR) aceita `http://` para testar com um servidor na rede local.
