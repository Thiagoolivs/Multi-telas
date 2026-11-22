# Conector MultiTelas — guia para o TI

O Conector MultiTelas é um programa pequeno que fica em **um** computador
Windows da empresa e leva para as TVs o que mora dentro da rede:

- a **pasta de rede** onde o RH coloca imagens, vídeos, PDFs e apresentações
  (por exemplo `\\servidor\Comunicacao\TV`);
- uma **planilha** do Excel ou CSV (cardápio, metas, escala);
- o **feed de notícias da intranet** (RSS, Atom ou JSON).

O servidor do MultiTelas fica na internet e não enxerga a sua rede. O conector
enxerga: ele lê esses lugares e **envia** o que mudou para o MultiTelas, por
HTTPS. Ele nunca recebe conexões e não escolhe em quais TVs as coisas
aparecem — isso é feito no painel.

```
 \\servidor\Comunicacao\TV ─┐
 C:\Dados\Cardapio.xlsx  ───┼──► MultiTelasConector.exe ──HTTPS (saída, 443)──► app.multitelas.net.br ──► TVs
 http://intranet/rss  ──────┘          (este PC)
```

Você instala uma vez e esquece. Ele liga junto com o Windows, confere tudo a
cada minuto e volta sozinho se cair.

---

## 1. Requisitos

| O quê | Detalhe |
|---|---|
| Windows | Windows 10 ou 11, ou Windows Server 2016 ou mais novo, **64 bits**. Pode ser um PC comum que fique ligado no horário em que as TVs mostram conteúdo. |
| Rede | Saída **HTTPS (porta 443)** para `app.multitelas.net.br`, direto ou por proxy. Nenhuma porta de entrada. |
| Conta | Uma conta do Windows que consiga **ler** a pasta de rede e a planilha (veja a seção 2). |
| Token | O token do conector, gerado no painel do MultiTelas: **menu do avatar (canto de cima, à direita) › Integrações › Nova integração** (ou **Token novo**, numa que já existe). Só o dono ou um administrador da conta. |
| PowerPoint | Só se o RH usar `.pptx`/`.ppt` na pasta: Office desktop com PowerPoint instalado e ativado neste PC. |
| PDF | Nada a instalar: o próprio Windows converte (API `Windows.Data.Pdf`). |
| Disco | ~250 MB (o programa tem ~100 MB; o resto é para as imagens convertidas de PowerPoint/PDF). |

Não precisa instalar Node.js, .NET nem nada: o `MultiTelasConector.exe` é um
arquivo só.

---

## 2. A conta que roda o conector (leia antes de instalar)

O conector roda como uma **tarefa agendada** que liga com o Windows, antes de
qualquer pessoa entrar. Ela roda com a conta que você escolher, e **é essa
conta que precisa ter acesso à pasta de rede**.

> **Por que não a conta SYSTEM?** A conta SYSTEM (a padrão dos serviços)
> acessa a rede como o *computador* (`EMPRESA\NOMEDOPC$`). Quase nenhum
> compartilhamento dá permissão ao computador, e aí o conector não consegue
> abrir `\\servidor\...`. Só use SYSTEM se você der leitura no
> compartilhamento para a conta do computador.

> **Por que tarefa agendada e não serviço do Windows?** Um serviço precisa
> "conversar" com o Gerenciador de Serviços, e para isso o `.exe` teria de vir
> embrulhado num programa de terceiros (NSSM, WinSW). A tarefa agendada faz o
> mesmo papel com o que já vem no Windows: liga no boot, roda sem ninguém
> logado, com a conta escolhida, e o instalador configura para religar se cair.

Opções, da mais recomendada para a menos:

1. **Conta de serviço do domínio dedicada** (ex.: `EMPRESA\svc-multitelas`):
   usuário comum, sem ser administrador, com **Leitura** no compartilhamento e
   nas permissões NTFS da pasta e da planilha. Senha que não expira (ou
   lembre de reinstalar quando trocar).
2. **gMSA** (conta de serviço gerenciada, `EMPRESA\gmsa-multitelas$`): o
   Windows troca a senha sozinho. Instale com `-ContaGerenciada`. Não converte
   PowerPoint.
3. **Conta de usuário de verdade**: obrigatória se você precisa que
   **PowerPoint** seja convertido (veja abaixo).
4. **SYSTEM** (`-UsarSistema`): só com o compartilhamento liberado para o
   computador, e sem PowerPoint.

A conta precisa do direito **"Fazer logon como trabalho em lotes"** (o Windows
costuma dar sozinho ao registrar a tarefa; se uma política de grupo (GPO)
controla esse direito, inclua a conta lá).

Para conferir se a conta enxerga a pasta, antes de instalar:

```
runas /user:EMPRESA\svc-multitelas "cmd /k dir \\servidor\Comunicacao\TV"
```

**Use o caminho de rede (`\\servidor\pasta`), não a letra de unidade
(`Z:\`).** Unidade mapeada existe só na sessão de quem mapeou; a tarefa não
enxerga.

### PowerPoint e a conta de serviço

A TV não toca `.pptx` nem `.pdf`. Por isso o conector transforma cada slide
(e cada página de PDF) numa imagem PNG antes de enviar —
`Apresentacao.pptx` vira `Apresentacao.pptx/01.png`, `02.png`… Quando a
apresentação muda, as imagens são refeitas; quando ela sai da pasta, as
imagens saem das TVs. O arquivo `.pptx`/`.pdf` em si nunca é enviado.

Para o PowerPoint, o conector usa o próprio PowerPoint instalado neste PC.
A Microsoft **não dá suporte oficial** a automatizar o Office numa conta sem
ninguém logado (é o caso de uma tarefa agendada). Na prática costuma
funcionar, desde que:

- a tarefa rode com uma **conta de usuário de verdade** (não SYSTEM, não gMSA);
- você **entre no Windows uma vez com essa conta e abra o PowerPoint**, para
  passar pela ativação do Office e pelas telas da primeira execução;
- o Office esteja ativado para essa conta.

Se a conversão não funcionar, o conector **não para**: ele pula a
apresentação, escreve no log uma mensagem pedindo para o RH salvar os slides
como imagens (no PowerPoint: *Arquivo › Exportar › Alterar o tipo de arquivo ›
PNG › Todos os slides*) e continua sincronizando o resto. As imagens que já
estavam nas TVs ficam lá.

> **A validar no Windows:** a conversão de PowerPoint e PDF foi testada com um
> conversor simulado. O primeiro uso numa máquina real deve ser conferido
> (veja "Primeiro teste" na seção 3).

---

## 3. Instalar

1. Baixe o `MultiTelasConector.zip` no painel do MultiTelas: **menu do avatar
   › Integrações › Como instalar o Conector** (o link baixa a versão mais nova;
   só o dono ou um administrador da conta, logado). Clique com o botão direito
   › **Propriedades** › marque **Desbloquear** › OK. Depois **Extrair tudo**.
   Quem quiser conferir: o sha256 do zip vem no cabeçalho `X-Conector-Sha256`
   do download e no `MultiTelasConector.zip.sha256` do Release.
2. No mesmo lugar (**Integrações**), gere o **token do conector** — **Nova
   integração**, ou **Token novo** numa que já existe — e deixe à mão (ele
   aparece uma vez só). Ali também se criam as pastas, as planilhas e os
   feeds, com as TVs de cada um: o conector só lê o que o painel lista.
3. Abra o **PowerShell como Administrador**, entre na pasta extraída e rode:

   ```powershell
   powershell -ExecutionPolicy Bypass -File .\instalar.ps1 -Conta EMPRESA\svc-multitelas
   ```

   (Com gMSA: `-Conta EMPRESA\gmsa-multitelas$ -ContaGerenciada`.
   Com SYSTEM: `-UsarSistema`.)

4. O instalador pede a **senha** da conta e depois faz as perguntas do
   conector:
   - endereço do servidor (deixe o padrão `https://app.multitelas.net.br`);
   - o **token** (não aparece na tela enquanto você digita);
   - o proxy da empresa, se houver (Enter = sem proxy);
   - **onde fica cada pasta e cada planilha** que o painel listou — ele já
     testa se abre;
   - se pode ler os **hosts da intranet** dos feeds (responda S para cada um
     que você reconhece).

O que o instalador faz:

- copia os arquivos para `C:\Program Files\MultiTelas Conector`;
- tira a marca de "baixado da internet" do `.exe` e confere o SHA256;
- **restringe a pasta**: só Administradores, SYSTEM e a conta do conector
  leem (o `conector.json` guarda o token);
- registra a tarefa **"MultiTelas Conector"**: liga 1 minuto depois do boot,
  sem limite de tempo, nunca duas cópias ao mesmo tempo, e um "vigia" de 5 em 5
  minutos que religa se ela tiver caído;
- liga o conector e mostra o `status`.

### Primeiro teste

Depois de instalar, rode (no PowerShell como administrador):

```powershell
& 'C:\Program Files\MultiTelas Conector\MultiTelasConector.exe' status
```

Confira: "Rodando agora: sim", a conta certa, "Último contato com o servidor"
de segundos atrás, e cada pasta com "última sincronização". Coloque uma
imagem e, se usar, um `.pptx` de 2 slides na pasta e veja aparecer no painel
em até 2 minutos.

---

## 4. Configuração (`conector.json`)

Fica ao lado do `.exe`. O `configurar` escreve por você; se editar à mão, use o
Bloco de Notas e lembre que, em JSON, **cada `\` do caminho do Windows vai
dobrado**. O conector relê o arquivo a cada ciclo: não precisa reiniciar.

```json
{
  "servidor": "https://app.multitelas.net.br",
  "token": "o token do painel",
  "pastas": { "comunicacao": "\\\\servidor\\Comunicacao\\TV" },
  "planilhas": { "cardapio": "C:\\Dados\\Cardapio.xlsx" },
  "intranet": { "hostsPermitidos": ["intranet.empresa.local"] },
  "proxy": "",
  "tamanhoMaximoMB": 200,
  "segundosParaEstabilizar": 10
}
```

| Campo | Para quê |
|---|---|
| `servidor` | Endereço do MultiTelas. Só `https://`. |
| `token` | O token do painel. Pode ficar fora do arquivo: defina a variável de ambiente **do sistema** `MULTITELAS_TOKEN` (ela vence o arquivo; reinicie o Windows depois de criar). |
| `pastas` | Para cada **chave** que o painel mostra, o caminho nesta rede. |
| `planilhas` | Para cada chave, o arquivo `.xlsx` (vai a primeira aba) ou `.csv`. |
| `intranet.hostsPermitidos` | Os únicos hosts que o conector pode ler para os feeds. Aceita `*.empresa.local`. O endereço do feed vem do painel, mas quem decide o que pode ser lido dentro da rede é você. |
| `intranet.cabecalhos` | Opcional: cabeçalho de login para um host, ex.: `{ "intranet.empresa.local": { "Authorization": "Basic dXN1YXJpbzpzZW5oYQ==" } }`. |
| `intranet.usarProxy` | `true` se a intranet também tiver de passar pelo proxy (raro). |
| `proxy` | Proxy para a internet, ex.: `http://proxy.empresa.local:3128` (veja a seção 7). |
| `semProxy` | Hosts que não passam pelo proxy, separados por vírgula. |
| `certificadoCA` | Arquivo do certificado da empresa (veja a seção 7). |
| `tamanhoMaximoMB` | Arquivo maior que isto não é enviado (aparece no log). Padrão 200. |
| `segundosParaEstabilizar` | Quanto tempo o arquivo fica parado antes de subir (evita enviar cópia pela metade). Padrão 10. |
| `ciclosParaApagar` | Em quantas leituras seguidas um arquivo precisa estar sumido antes de sair das TVs. Padrão 2. |

A **chave** é o nome curto que o painel mostra para cada pasta/planilha. O
painel diz quais existem; o `conector.json` diz onde cada uma fica.

---

## 5. Comandos

Todos com `MultiTelasConector.exe <comando>`, na pasta da instalação:

| Comando | O que faz |
|---|---|
| `configurar` | As perguntas da instalação, de novo (trocar token, caminho, proxy). |
| `testar` | Mostra o que **seria** enviado e apagado, sem mexer em nada. Bom antes de apontar para uma pasta grande. |
| `status` | Se está rodando, a conta, o último contato com o servidor, cada fonte com a última sincronização, a fila, os erros recentes e a versão. |
| `uma-vez` | Um ciclo de sincronismo e sai. |
| `diagnostico` | Versão, proxy em uso, certificados e a conta do Windows. |

O log fica em `conector.log` (e `conector.log.1` … `.5`, os mais antigos), em
português, ao lado do `.exe`.

---

## 6. O que o conector faz com cada coisa

**Pasta de rede**

- Lê a pasta e as subpastas a cada ciclo (o painel define o intervalo, em geral
  1 minuto). A leitura periódica é a fonte da verdade; aviso de mudança do
  Windows só adianta o ciclo (em pasta de rede ele falha com frequência).
- Envia: `jpg`, `jpeg`, `png`, `webp`, `mp4` (o servidor confere o tipo pelo
  conteúdo). Converte em imagens: `pptx`, `ppt`, `pdf` — cada slide/página vai
  como `Apresentacao.pptx/01.png`, `02.png`…, e na TV os slides de uma
  apresentação passam **juntos e em ordem**, mesmo com a pasta em "mais novo
  primeiro". O `.pptx`/`.pdf` cru o servidor recusa (a TV não toca). Planilha
  (`.xlsx`, `.csv`) numa pasta é ignorada: ela entra como **planilha** no
  painel. O resto é ignorado (e aparece no `testar`).
- O nome vai como está na pasta, com as subpastas (`Avisos/natal.jpg`): até
  240 caracteres e 8 níveis de subpasta (o que passar fica de fora, com o
  motivo no `testar`). No MultiTelas, cada pasta guarda até **200 arquivos**.
- Arquivo que o servidor **recusa** (tipo, tamanho, nome: respostas 413, 415
  ou 422) não é mandado de novo enquanto não mudar; falha de envio (rede,
  400, 5xx) é tentada de novo no ciclo seguinte.
- Ignora temporários e ocultos: `~$arquivo` (Office aberto), `~*`, `*.tmp`,
  `*.part`, `.*`, `Thumbs.db`, `desktop.ini`.
- Só envia o que **mudou** (compara o SHA-256 com o que está no servidor).
- Espera o arquivo **parar de mudar** antes de enviar: cópia grande pela rede
  leva minutos.
- **Pasta fora do ar não apaga nada.** Se o compartilhamento não abre (servidor
  desligado, rede caída, permissão), nada é enviado nem apagado, e o log diz
  isso. Um arquivo só sai das TVs depois de sumir da pasta em 2 leituras
  seguidas com a pasta lida por inteiro.
- Nunca sai da pasta configurada: atalho (link simbólico, junção) que aponta
  para fora é ignorado.

**Planilha**: a primeira aba do `.xlsx` vira CSV (RFC 4180: vírgula, aspas
quando precisa, CRLF, UTF-8) com cada célula **como o Excel mostra no
Brasil**: datas em dd/mm/aaaa, número com **vírgula decimal** (`12,5`,
`5,899`) e percentual multiplicado (`87,5%`). Com ponto, o MultiTelas leria
`5.899` como cinco mil oitocentos e noventa e nove. CSV sobe como está — o do
Excel brasileiro, com `;` e vírgula decimal, é só convertido para UTF-8 —, e
o servidor lê os dois do mesmo jeito. Sobe quando muda. `.xls` antigo não:
salve como `.xlsx`.

**Feed da intranet**: cada item vira um comunicado (título até 120
caracteres, texto até 600, com reticências), que entra na TV a partir da
**data de publicação** do item e fica enquanto o item estiver no feed. A
imagem do item é baixada pela intranet e enviada para a pasta reservada
`_feed-<chave do feed>` no MultiTelas (o servidor não alcança a intranet);
ela não aparece no painel como pasta e só vai para a TV junto do comunicado.
Item que sai do feed sai das TVs (depois de 2 leituras sem ele), e a imagem
dele também. Feed fora do ar, ou que devolve uma página de login, não apaga
nada. Só os hosts de `intranet.hostsPermitidos` são lidos, inclusive em
redirecionamento. Se o `estado.json` se perder, o conector pergunta ao
MultiTelas o que já mandou daquele feed e continua tirando o que sai.

**Apagar no painel**: apagar um feed no painel tira das TVs, na hora, os
comunicados que vieram dele e as imagens; apagar uma pasta tira as fotos
dela. O conector não precisa fazer nada (a fonte só some da lista dele).

---

## 7. Firewall e proxy

**Firewall.** O conector só faz conexões **de saída**:

- HTTPS (TCP 443) para `app.multitelas.net.br`;
- HTTP/HTTPS para os hosts da intranet que você liberou (os feeds);
- SMB para o servidor de arquivos (como qualquer acesso a `\\servidor`).

Ele **não abre nenhuma porta** e não precisa de regra de entrada. Se o
firewall da empresa filtra saída, libere `app.multitelas.net.br:443` para este
PC (ou para o programa `C:\Program Files\MultiTelas Conector\MultiTelasConector.exe`).

**Proxy.** Se a internet da empresa passa por proxy:

- ponha `"proxy": "http://proxy.empresa.local:3128"` no `conector.json`
  (o `configurar` pergunta), **ou**
- defina a variável de ambiente do sistema `HTTPS_PROXY` (e `NO_PROXY` para
  as exceções).
- Proxy com senha: `http://usuario:senha@proxy:3128` (só autenticação básica;
  a senha não aparece no log). Proxy que exige login do Windows
  (NTLM/Kerberos) **não é suportado**: peça uma exceção para
  `app.multitelas.net.br` ou um acesso com autenticação básica.
- A intranet (os feeds) **não** passa pelo proxy.

**Proxy que inspeciona HTTPS.** Se o proxy troca o certificado (Fortinet,
Zscaler, Palo Alto…), o conector precisa confiar no certificado da empresa.
Ele já usa os **certificados confiáveis do Windows**: se o certificado da
empresa foi distribuído por GPO, não há nada a fazer. Se não foi, exporte o
certificado raiz (Base-64 ou DER) e aponte `"certificadoCA":
"C:\\Program Files\\MultiTelas Conector\\empresa.cer"`, ou defina a variável
`NODE_EXTRA_CA_CERTS` com o caminho do arquivo.

---

## 8. Atualizar

Extraia o zip novo e rode o instalador de novo, sem reconfigurar:

```powershell
powershell -ExecutionPolicy Bypass -File .\instalar.ps1 -Conta EMPRESA\svc-multitelas -SemConfigurar
```

Ele para o conector, troca o `.exe` e liga de novo. O `conector.json`, o
estado e o log ficam.

## 9. Desinstalar

No PowerShell como administrador, na pasta extraída (ou na da instalação):

```powershell
powershell -ExecutionPolicy Bypass -File .\desinstalar.ps1               # remove a tarefa, mantém os arquivos
powershell -ExecutionPolicy Bypass -File .\desinstalar.ps1 -ApagarArquivos  # remove tudo
```

Depois **revogue o token no painel** do MultiTelas (menu do avatar ›
Integrações › **Revogar**): ele continua válido até alguém revogar. O que já
foi enviado continua nas TVs até ser tirado pelo painel (apagar a pasta, o
feed ou a integração tira).

---

## 10. Segurança, em resumo

- O token fica no `conector.json`, numa pasta que só Administradores, SYSTEM e
  a conta do conector leem — ou na variável `MULTITELAS_TOKEN`. Ele **nunca**
  é escrito no log nem mostrado no `status`.
- Token revogado no painel: o conector **para** na hora, escreve no log o que
  fazer e não insiste. Com um token novo no `conector.json`, volta sozinho.
- Só sai desta máquina o que está dentro das pastas e planilhas configuradas,
  com as extensões da lista. Atalhos para fora são ignorados.
- Da intranet, só os hosts que você liberou. O token do MultiTelas nunca vai
  para a intranet.
- Nenhuma porta de entrada.

---

## 11. Problemas comuns

Comece sempre pelo `status` e pelo `conector.log`.

| O que aparece | O que fazer |
|---|---|
| `Rodando agora: NÃO` | Abra o **Agendador de Tarefas** › "MultiTelas Conector" › *Histórico*. "Falha de logon" = senha errada ou trocada: rode o `instalar.ps1 -SemConfigurar` de novo com a senha nova. "Logon como lote negado" = falta o direito "Fazer logon como trabalho em lotes" (GPO). |
| `sem permissão para ler "\\servidor\..."` | A conta da tarefa não tem leitura no compartilhamento ou no NTFS. Teste com `runas` (seção 2). |
| `"Z:\..." não existe ou o servidor não respondeu` | Letra de unidade mapeada não existe para a tarefa: use `\\servidor\pasta`. Ou o servidor de arquivos está fora do ar (nada foi apagado). |
| `recusou o token (401)` / `PARADO` | O token foi revogado ou copiado errado. Gere outro no painel (menu do avatar › Integrações › **Token novo**) e rode `configurar`. |
| `o servidor recusou "X" (413/415/422)` | O arquivo não serve para a TV (tipo, tamanho, nome longo demais). Ele não é mandado de novo enquanto não mudar. O motivo vem escrito no log e no painel. |
| `A pasta "X" já tem 200 arquivos, o máximo` | Tire os antigos do compartilhamento, ou divida em duas pastas no painel. |
| `não achei o endereço app.multitelas.net.br (DNS)` / `conexão recusada` | Esta máquina não sai para a internet: firewall ou proxy (seção 7). |
| `o proxy pediu usuário e senha (407)` | Ponha usuário e senha no `proxy`, ou peça exceção no proxy. |
| `o certificado HTTPS … não foi aceito` | Proxy inspecionando HTTPS: veja "certificadoCA" na seção 7. |
| Arquivo não aparece | `testar` mostra o motivo: extensão fora da lista, acima de `tamanhoMaximoMB`, nome temporário (`~$`), ou ainda "esperando terminar de ser copiado". |
| `"X.pptx" NÃO foi para a TV: o PowerPoint não está instalado ou não abre com a conta do conector` | Veja "PowerPoint e a conta de serviço" (seção 2). Enquanto isso, o RH pode salvar os slides como imagens. |
| `não consegui converter "X.pptx"` | Arquivo com senha, corrompido, ou o PowerPoint travou numa janela. O conector tenta de novo em 1 hora ou quando o arquivo mudar. Se travar sempre, feche o `POWERPNT.EXE` que ficou aberto no Gerenciador de Tarefas. |
| `o host "x" … não tem permissão de ler` | O feed aponta para um host que não está em `intranet.hostsPermitidos`. Rode `configurar` ou acrescente o host. |
| `não é um feed RSS/Atom (é uma página de login?)` | A intranet pede login para o feed. Peça um endereço público dentro da rede, ou use `intranet.cabecalhos` com autenticação básica/token. Login do Windows (NTLM) não é suportado. |
| `Já existe um conector rodando nesta pasta` | A tarefa já está rodando; use `status` em vez de abrir o `.exe` de novo. |

---

## 12. Limites conhecidos

- **A validar no Windows:** conversão de PowerPoint (automação do Office) e de
  PDF (`Windows.Data.Pdf`), a tarefa agendada e o `.exe` em si foram montados
  e testados a partir do Linux, com simulação nas partes que só existem no
  Windows. Confira o "Primeiro teste" na primeira instalação. Também a
  conferir lá: a leitura de `\\servidor\pasta` pela conta de serviço (o
  teste de ponta a ponta usa pastas locais), o proxy embutido do Node com o
  proxy da empresa, o certificado da empresa (`certificadoCA`) e os acentos
  dos `.ps1` no PowerShell 5.1 (o zip leva os scripts com BOM e CRLF).
- O conector e o servidor foram testados juntos, de ponta a ponta, no Linux
  (`test/conector-ponta-a-ponta.test.js`): a pasta, a subpasta, a planilha
  `.xlsx` e a `.csv`, o RSS com imagem, o que sai, o compartilhamento fora do
  ar e o token revogado.
- Arquivo marcado como "oculto" no Windows (atributo), mas com nome comum, é
  enviado; só nomes começando com `.` ou `~` são tratados como ocultos.
- Proxy com login do Windows (NTLM/Kerberos) e feed que exige login do Windows
  não são suportados.
- O conector lê até 5.000 arquivos por pasta e 200 páginas por
  apresentação/PDF; o MultiTelas guarda até **200 arquivos por pasta**
  (somando os slides) e 200 imagens por feed.
- O `.exe` não é assinado digitalmente: o Windows SmartScreen pode avisar no
  primeiro uso ("Desbloquear", no passo 1, evita isso).
