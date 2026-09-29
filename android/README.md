# MultiTelas TV — app de quiosque para TV Box

O player do MultiTelas é web (`/tv`). Este app é só a moldura que um TV Box
comum não tem:

- abre direto no `/tv`, em tela cheia, e **não sai dali** (VOLTAR não fecha);
- **mantém a tela acesa**;
- se a página travar ou o processo do WebView morrer, **volta sozinho**;
  se o app cair, **reabre em 2 segundos**;
- guarda a identidade da tela nas preferências do app (além do localStorage
  e do cookie) — trocar de aparelho não perde o pareamento por acidente;
- aparece no painel, no cartão da tela, como "App 1.0.N".

## Onde baixar

Cada push em `android/` compila no GitHub Actions (workflow **App Android**).
O `.apk` fica em **Actions › App Android › (a execução) › Artifacts**.

O endereço do servidor entra no build pela variável do repositório `MT_URL`
(**Settings › Secrets and variables › Actions › Variables**), por exemplo
`https://app.suaempresa.com.br`. Sem ela, o padrão do `app/build.gradle`.

## Instalar num TV Box (sideload)

1. Copie o `.apk` para um pendrive (ou use o app "Send files to TV").
2. No box: **Configurações › Segurança › Fontes desconhecidas** (ou "Instalar
   apps desconhecidos" para o gerenciador de arquivos) — permitir.
3. Abra o `.apk` pelo gerenciador de arquivos e instale.
4. **Defina o MultiTelas TV como tela inicial** (Configurações › Apps ›
   Apps padrão › Tela inicial, ou aperte HOME e escolha "Sempre"). É isto que
   faz o app abrir sozinho quando o box liga — no Android 10 ou mais novo,
   é o único jeito confiável.
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
- Só HTTPS (`usesCleartextTraffic=false`). Servidor de teste em `http://`
  numa rede local não abre.
