# Uma página da intranet na TV

A pergunta: dá para pôr na TV uma página da intranet da empresa, por exemplo
`http://intranet.empresa.local/comunicados`? A TV está dentro da rede da
empresa, então em tese ela alcança a página. Na prática, **depende de como a
intranet serve a página**. O que segue saiu da leitura do código, em 22/11.
Nada aqui foi testado num box de verdade. O teste é na TV piloto (seção 5).

## 1. Como a TV mostra uma página

- **O player** (`js/render.js`, `renderWeb`) põe a página num quadro
  (`<iframe>`) sem `sandbox`, com o endereço que está no conteúdo. O quadro é
  criado **a cada vez que o item entra no ar**: a página carrega de novo a
  cada volta, e fica em branco enquanto carrega. O tempo padrão no ar é de
  20 segundos.
- **O player é servido em https** (`https://tv.multitelas.net.br/player.html`)
  com esta política de segurança (`server/security.js`, conferida no
  cabeçalho que o servidor manda):
  `frame-src 'self' https:`. **Só entra no quadro o que é https.**
- **O app Android** (`android/.../MainActivity.java`):
  - liga JavaScript, armazenamento local e vídeo sem toque;
  - **não chama `setMixedContentMode`.** Para um app com `targetSdk` 34, o
    padrão do WebView é **nunca** aceitar conteúdo http dentro de uma página
    https;
  - **não trata erro de certificado** (`onReceivedSslError`). O padrão é
    cancelar: certificado que o Android não reconhece vira quadro em branco;
  - **não responde a pedido de senha** (`onReceivedHttpAuthRequest`). O
    padrão é cancelar: Basic, NTLM e Kerberos não passam;
  - **não liga cookie de terceiros.** O padrão do WebView é desligado, e a
    página da intranet, dentro do quadro de `tv.multitelas.net.br`, é de
    terceiros;
  - **não tem configuração de segurança de rede** (`network_security_config`):
    o app só confia nas autoridades certificadoras do sistema, não nas
    instaladas pelo usuário;
  - `shouldOverrideUrlLoading` deixa o app **só no endereço do servidor**: se
    a página da intranet tentar levar a TV inteira para ela (o velho "sair do
    quadro" de algumas intranets), o app cancela. Na TV de navegador, sem o
    app, nada impede;
  - a ponte `MTApp` é vista por **todo** quadro, inclusive o da intranet. Hoje
    ela só lê (versão, se é a tela inicial, o resumo do vigia). Saiu dela, de
    propósito, tudo que gravava ou reiniciava (`Ponte.java`).
- **O painel não oferece mais o tipo "Página Web".** Desde 05/11 ele está em
  `SAI_DO_CATALOGO` (`web/src/lib/contentTypes.js`): "ficam em branco na TV e
  não servem para quem não é técnico". A TV que já tem o item continua
  mostrando, e o editor continua abrindo, mas o RH não consegue criar um novo.
  Para o teste na piloto, quem opera cria pelo arquivo de backup: Mais opções
  › Backup e cópia › Guardar, acrescentar
  `{ "type": "web", "url": "https://…", "duracao": 30 }` nos itens de uma zona
  e Restaurar.

## 2. O que funciona e o que não funciona

| A página | Na TV com o app | Por quê | O que fazer |
|---|---|---|---|
| `http://intranet…` (sem s) | **Não abre** | Barrada duas vezes: pela nossa política (`frame-src` só aceita https) e pelo navegador (conteúdo misto) | Servir em https (abaixo) |
| `https://intranet.empresa.local`, com certificado da **CA interna** da empresa (AD CS) | **Não abre** (quadro em branco) | O app não confia na CA interna, e instalar a CA no box não muda isso. E `.local` não ganha certificado público | Certificado público |
| `https://intranet.empresa.com.br`, com **certificado público** (Let's Encrypt ou comercial), resolvido pelo DNS interno | **Abre**, se o resto abaixo estiver certo | — | O caminho recomendado |
| A página manda `X-Frame-Options: DENY` ou `SAMEORIGIN`, ou `frame-ancestors 'self'` | **Não abre** (quadro em branco) | A própria intranet proíbe ser mostrada dentro de outro site | Na página das TVs: `Content-Security-Policy: frame-ancestors https://tv.multitelas.net.br https://app.multitelas.net.br`, e tirar o `X-Frame-Options` (o WebView mais velho pode não entender o `frame-ancestors` e respeitar o `X-Frame-Options`) |
| Página que pede **login** (formulário e cookie) | **Não** | Ninguém digita senha na TV. E mesmo logada, o cookie de dentro do quadro é de terceiros: o WebView bloqueia, e os navegadores mandam só com `SameSite=None; Secure` | Uma página própria para as TVs, **sem login e só de leitura**, liberada no servidor da intranet só para os IPs das TVs |
| **Login do Windows** (autenticação integrada, NTLM ou Kerberos) ou Basic | **Não** | O app cancela o pedido de senha | Igual à linha de cima |
| SharePoint, Teams, Microsoft 365 | **Não**, em geral | Pedem login e não deixam ser mostrados em quadro de outro site | Exportar o conteúdo, ou o Conector ([CONECTOR.md](CONECTOR.md)) |
| Página https que puxa coisas em http por dentro (imagem, script) | Abre **pela metade** | Conteúdo misto dentro da própria página da intranet | Tudo em https |
| Nome terminado em **`.local`** | Pode **não achar** | O Android pode tratar `.local` como rede local (mDNS) e não perguntar ao DNS da empresa. Não conferido | Usar um nome do domínio de verdade da empresa |
| A intranet fora do ar, ou a rede caída | **Erro do navegador dentro do quadro**, na parede | A página da intranet não fica guardada para tocar sem rede: o *service worker* só guarda o que é do nosso endereço | Aceitar o risco, ou não usar a página no lugar de mais destaque |
| Página feita para computador | Abre, mas **pequena** e cortada | A TV não rola nem clica | Uma página feita para a TV: letra grande, sem rolagem, que caiba em 1920×1080 |
| TV de navegador (Smart TV sem o app) | Os mesmos bloqueios, e **sem a proteção** contra a página que leva a TV para ela | — | Usar o app |

**Mais um risco, não conferido:** os navegadores Chromium mais novos pedem
licença para um site público acessar endereços da rede local (o *Local
Network Access*). Se o WebView do box passar a fazer isso com quadros, a
página da intranet pode ser barrada mesmo com tudo certo. A TV piloto
responde.

## 3. As opções, da melhor para a pior

1. **Uma página da intranet feita para as TVs:** https com certificado
   público, num nome do domínio da empresa (DNS interno), com
   `frame-ancestors` liberando o MultiTelas, sem login (liberada só para os
   IPs das TVs), com letra grande e sem rolagem. É trabalho da TI, uma vez.
   Teste na piloto antes de pôr nas 8.
2. **Pôr o conteúdo no MultiTelas, em vez da página:** o comunicado como
   aviso, o slide como imagem, os aniversariantes pela planilha do Excel e os
   números pelos Indicadores. Em Indicadores › Receber, um servidor interno
   manda os números para `app.multitelas.net.br`, só saída.
3. **O Conector MultiTelas** ([CONECTOR.md](CONECTOR.md)): um programa
   dentro da rede leva a pasta de rede, a planilha e o feed da intranet até
   as TVs, sem quadro, sem certificado e sem login na TV. É o caminho
   recomendado para esta empresa.
4. **A API pública (`/api/v1/`,** [../INTEGRACOES.md](../INTEGRACOES.md)**):**
   o sistema da intranet publica comunicados direto na TV.

## 4. Mudanças possíveis no app e no player (propostas, não feitas)

Nenhuma é necessária para o lançamento. A mudança no app é a mais perigosa:
cada versão nova chega a **todas as TVs de todos os clientes**.

| # | Onde | O quê | Recomendação |
|---|---|---|---|
| 1 | Painel (`web/src/lib/contentTypes.js`) | Devolver "Página Web" ao Adicionar **só na frente Empresas, em Avançado**, com o aviso do que a página precisa (https público, `frame-ancestors`, sem login). É uma linha (tirar de `SAI_DO_CATALOGO` e pôr em `AVANCADOS` e `SO_NA_FRENTE`) | **Sim, depois da piloto**, se a página da intranet funcionar nela. Decisão sua: a fase 1 tirou o tipo de propósito |
| 2 | Player (`js/render.js`, `renderWeb`) | `sandbox="allow-scripts allow-same-origin allow-forms allow-popups"` no quadro, sem `allow-top-navigation`: a página não consegue levar a TV para fora do player, também na TV de navegador | Talvez. É pequena, mas página que depende de algo fora da lista quebra calada. Testar com a intranet real antes |
| 3 | App e servidor | Aceitar `http://`: `setMixedContentMode(MIXED_CONTENT_ALWAYS_ALLOW)` no WebView **e** `http:` no `frame-src` | **Não.** Abre conteúdo sem criptografia em todas as TVs, a ponte `MTApp` fica à vista de uma página que qualquer um na rede pode adulterar, e a TV de navegador continua bloqueando. https na intranet é o certo |
| 4 | App (`network_security_config` com as CAs do usuário) | Confiar na CA interna instalada no box | **Não.** Deixaria um proxy de inspeção, ou quem instalar uma CA no box, ler o tráfego da TV, inclusive o token dela. E instalar CA no Android TV já é difícil |
| 5 | App (`CookieManager.setAcceptThirdPartyCookies`) | Cookie de terceiros no quadro | **Não.** Alguém ainda teria de logar na TV, e a sessão vence |

## 5. O teste na TV piloto (D-7)

1. A TI publica uma página de teste: https, certificado público,
   `frame-ancestors https://tv.multitelas.net.br https://app.multitelas.net.br`
   e sem login.
2. Quem opera põe a página numa zona da TV piloto, pelo backup (seção 1), com
   30 segundos no ar.
3. Confira na TV:
   - ela aparece inteira;
   - a letra se lê a 3 metros;
   - depois de uma noite, continua aparecendo;
   - com o servidor da intranet desligado, veja o que fica na parede.
4. Se o quadro ficar em branco, olhe o cabeçalho da página
   (`curl -sI https://…`): o `X-Frame-Options`, o `frame-ancestors` e o
   certificado. Do box, pelo `adb`, a TI confere se o nome resolve e se o
   certificado é aceito.
5. Funcionou: decida a proposta 1 (o tipo de volta ao painel para a
   Empresas). Não funcionou: fique com as opções 2 a 4.
