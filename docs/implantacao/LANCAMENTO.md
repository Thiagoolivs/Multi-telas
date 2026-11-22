# Lançamento: 8 TVs numa empresa (dezembro de 2026)

O primeiro cliente de verdade: **8 TVs numa empresa**, com rede interna,
Windows e Office nos computadores, uma pasta de rede e uma intranet. Este é o
plano do dia D-10 ao D+7. Ele junta o que já existe no produto e diz o que
conferir, em que ordem e quem faz.

Os outros papéis desta pasta:

- [PARA-A-TI.md](PARA-A-TI.md): a folha que você manda para a TI do cliente
  (os endereços, as portas, o proxy e o Wi-Fi);
- [ROTEIRO-DE-INSTALACAO.md](ROTEIRO-DE-INSTALACAO.md): o passo a passo de
  quem instala, uma TV de cada vez, com o teste de 5 minutos;
- [INTRANET-NA-TV.md](INTRANET-NA-TV.md): o que funciona e o que não
  funciona ao pôr uma página da intranet na TV.

## As datas

A data sugerida é **D = quinta-feira, 03/12/2026**. Quinta, e não sexta,
porque sobra a sexta para corrigir com a empresa aberta. Se a data mudar, as
etapas andam juntas.

| Dia | Data | O quê | Quem |
|---|---|---|---|
| D-10 | seg 23/11 | Começo. Mandar o [PARA-A-TI.md](PARA-A-TI.md) para a TI. Fechar o plano da conta. Comprar os boxes (8 + 1 de reserva). Pedir fotos de cada parede, com a tomada e o ponto de rede. | você |
| D-9 a D-8 | 24–25/11 | O checklist de antes do voo (abaixo). Aprovar o conteúdo pronto na galeria. Criar a conta do cliente. | você |
| D-7 | qui 26/11 | **A TV piloto ligada na empresa**, na rede deles e com as regras da TI já aplicadas. Pelo roteiro de instalação, com o teste de 5 minutos. | você + TI |
| D-6 a D-4 | 27–29/11 | A piloto fica ligada, inclusive no fim de semana. Olhar todo dia (seção "Semana 1", que vale para ela também). | você |
| D-3 | seg 30/11 | **Vai ou não vai** (critérios abaixo). Congelar o código até D+7. Montar os 8 boxes na bancada. | você |
| D-2 | ter 01/12 | Treinar o RH, com a TV piloto na frente. O RH aprova o conteúdo do dia 1. | você + RH |
| D-1 | qua 02/12 | Revisão final. Confirmar com a TI que os 8 pontos de rede estão prontos. Guardar o backup da TV piloto. | você |
| **D** | **qui 03/12** | **Instalar as 8 TVs** (a piloto já conta como uma). Pôr o conteúdo. Às 16h, rever tudo com o RH. | você + instalador |
| D+1 | sex 04/12 | Conferir todas as TVs antes do expediente. Ligar para o RH. Corrigir o que apareceu. | você |
| D+4 | seg 07/12 | Conferir de manhã: o fim de semana mostra se as TVs voltam sozinhas. | você |
| D+7 | qui 10/12 | Reunião da semana 1: o que caiu, o que travou, a nota do RH. Descongelar o código. | você + RH |

## 1. Antes do voo (D-10 a D-8)

Marque cada item. Nenhum é código: é configuração e decisão.

**Servidor e operação**

- [ ] **O backup do banco roda todo dia.** No Railway, o serviço `backup`
  tem o *Cron Schedule* `0 6 * * *` ([docs/BACKUP.md](../BACKUP.md)). Rode
  uma vez com **Run now** e confira no log `restaurado e conferido`.
  Depois, em **Plataforma › Negócio › Saúde**, a linha "Último backup"
  mostra a data de hoje ou de ontem. Se ela disser que "o servidor do painel
  não tem acesso ao bucket", ponha também as variáveis `BACKUP_S3_*` no
  serviço principal. Sem elas, ninguém vê quando o cron para.
- [ ] **O e-mail sai.** Confira `RESEND_API_KEY` (ou `BREVO_API_KEY`),
  `MAIL_FROM` do domínio verificado e `APP_URL=https://app.multitelas.net.br`.
  Sem provedor de e-mail, **o aviso de TV fora do ar não liga** (o log do
  boot diz `vigia.sem-email`). Teste: `node tools/conferir-config.mjs --email voce@dominio`.
- [ ] **O e-mail de suporte está configurado:** `SUPORTE_EMAIL` (e
  `WHATSAPP_NUMERO`, se for atender pelo WhatsApp). É o contato que aparece
  na página Suporte do painel e nas páginas legais. Sem ele, o painel mostra
  `suporte@multitelas.net.br`: confira se essa caixa existe e se alguém lê.
- [ ] **A cópia do aviso de queda vem para você:** no Railway, ponha
  `ALERTA_OFFLINE_COPIA=seu-email@...` (aceita vários, separados por
  vírgula). Você recebe uma cópia de cada aviso de TV fora do ar, com o nome
  da conta no assunto (seção "Semana 1"). Depois do lançamento, decida se
  deixa ligada.
- [ ] **O alerta de erro chega a você:** `ALERTA_WEBHOOK_URL` aponta para um
  canal que você lê (Slack, Discord, Teams ou um robô de WhatsApp ou
  Telegram). Por ele chegam o "🔴" de erro novo e o "🟢 MultiTelas no ar:
  versão …" de cada deploy ([docs/OPERACAO.md](../OPERACAO.md) §3).
- [ ] **Um monitor de fora olha o servidor.** Se o servidor cair, o vigia
  cai junto e nenhum e-mail sai. Cadastre
  `https://app.multitelas.net.br/healthz` num monitor gratuito (UptimeRobot,
  Better Stack ou outro), de 5 em 5 minutos, com aviso por e-mail. O
  esperado é `{"ok":true,"banco":"ok"}`.
- [ ] **A mídia não some no deploy:** `STORAGE=s3` com as chaves do R2.
  Confira também se `MEDIA_PUBLIC_BASE` está **vazia**. Vazia, a TV baixa a
  mídia de `tv.multitelas.net.br/media/…`, guarda para tocar sem internet, e
  a TI só libera os nossos endereços. Preenchida, a TV vai buscar em outro
  domínio, que a TI teria de liberar, e o *service worker* não guarda
  arquivo de outro domínio para tocar sem internet (`sw.js`, "cross-origin:
  deixa passar").
- [ ] **O app da TV está publicado:**
  `https://tv.multitelas.net.br/apk/versao.json` responde com a versão, e não
  404 (no reteste 3, de 14/11, ainda respondia 404). Sem o Release assinado,
  o APK só sai do GitHub Actions, expira em 90 dias e **não se atualiza
  sozinho** ([docs/APARELHOS.md](../APARELHOS.md), "O que falta para
  publicar o Release"). Resolva antes de instalar: trocar a assinatura
  depois exige ir a cada TV.
- [ ] `ADMIN_EMAILS` tem o seu e-mail (sem ele não existe Plataforma).
  `/healthz` responde e **Plataforma › Estado do sistema** não mostra nada
  vermelho que afete a TV.

**A conta do cliente**

- [ ] **O plano comporta as 8 TVs antes do dia da instalação.** O grátis
  (teste de 14 dias) aceita **uma TV só**: a 2ª fica no código, com o aviso
  "O plano grátis tem 1 TV". Escolha uma das três:
  - o **Essencial pago** pelo Asaas, na frente Empresas: R$ 159 por TV por
    mês no mensal, ou seja, R$ 1.272 por mês para 8 TVs. O anual sai mais
    barato e tem fidelidade e multa;
  - a **cortesia** (`CONTAS_CORTESIA` com o e-mail do dono da conta), se o
    combinado for uma semana sem cobrança. Cuidado: tirar o e-mail da lista
    devolve a conta ao grátis no próximo login, e aí só a TV mais antiga
    segue no ar. As outras mostram "Esta TV está pausada". Troque para o
    pago **antes** de tirar da lista;
  - o **Enterprise**, se houver contrato à parte.
- [ ] **A frente da conta é Empresas** (Plataforma › Contas › a ficha ›
  Frente). Ela muda o preço, o menu, os exemplos e o conteúdo pronto.
- [ ] **Quem é o Dono.** O aviso de TV fora do ar vai para o **primeiro Dono**
  da conta. O certo é a responsável do RH ser a dona (ela que precisa saber).
  Você recebe a cópia pelo `ALERTA_OFFLINE_COPIA`. Os colegas do RH entram em
  Equipe como Admin (gerencia equipe e telas) ou Membro (só opera).
- [ ] **A marca da empresa** em Marca: o logo (de preferência com versão
  clara para fundo escuro), as cores e o site. Os textos de exemplo somem
  quando a marca entra.

**Conteúdo pronto**

- [ ] **Aprovar o conteúdo pronto na galeria** (Plataforma › Conteúdo
  pronto). No reteste 3, 100 de 101 telas prontas e 70 de 113 peças ainda
  esperavam a sua aprovação. O que não está aprovado não aparece em Prontos
  para o cliente, e a IA só aprende com o que foi aprovado. Para esta
  empresa, o que importa: as 8 peças de Empresas (meta, turno, EPI, ramais,
  cardápio da semana…), as telas `l3-*` de escritório e de indústria e as
  peças de modo ambiente. Olhe cada uma na bancada antes de aprovar.

**A TV piloto (D-7)**

- [ ] **Uma TV piloto ligada uma semana antes**, na empresa, num dos 8
  lugares, na rede deles, com o box do modelo que vai ser comprado. Ela é a
  homologação do box: **o app novo (vigia v2) ainda não rodou num box de
  verdade** ([CAPACIDADE-E-TVBOX.md](../CAPACIDADE-E-TVBOX.md) §6). E ela
  prova que a TI liberou o que precisava.

## 2. O hardware

### O box homologado

O que a TV precisa, pelo que foi medido em
[CAPACIDADE-E-TVBOX.md](../CAPACIDADE-E-TVBOX.md) §5 e §6.4:

| Item | Mínimo | Por quê |
|---|---|---|
| Sistema | **Android TV ou Google TV certificado, Android 10 ou mais novo**, com Play Store | É o que mantém o *Android System WebView* atualizado. Box genérico "Android 10" sem certificação costuma vir com WebView velho que nunca atualiza. |
| Memória | **2 GB de RAM** | O navegador da TV usou 360–720 MB no modo completo. Com 1 GB, só o modo leve e sem foto viva. |
| Processador | 4 núcleos Cortex-A55 ou melhor (Amlogic S905X4/S905Y4 ou equivalente) | Decodifica vídeo 1080p por hardware. |
| Armazenamento | 8 GB ou mais | O cache de mídia tem teto de 1 GB fora da programação. |
| Rede | **porta de rede (RJ45)** | Cabo é mais estável que Wi-Fi ([PARA-A-TI.md](PARA-A-TI.md)). |

- **Um modelo só, comprado todo de uma vez, no mesmo lote.** Lote de box
  barato troca de chip sem avisar.
- O exemplo do relatório (Xiaomi TV Box S, 2ª geração, Google TV, 2 GB)
  atende no sistema e na memória, **mas confira se tem porta de rede**. Até
  onde sabemos, não tem. Nesse caso, o box vai com o adaptador USB-rede que o
  fabricante indica, e o adaptador também passa pelo piloto. Ou escolha um
  modelo certificado com RJ45.
- **Compre 9:** 8 e uma reserva já montada, com o app, pronta para trocar.
- Saída de vídeo em **1080p**. Em 4K o box trabalha mais, e o texto lido a 3
  metros não melhora.

### A TV

- Qualquer TV com HDMI. A Smart TV não precisa ter o MultiTelas: quem roda é
  o box.
- Nos ajustes da TV, desligue tudo que apaga a tela sozinho: **desligamento
  automático** (muitas TVs desligam depois de 4 horas sem tocar no controle),
  **economia de energia ou "Eco"**, **desligar sem sinal** e **timer de
  desligamento**.
- Deixe a TV **ligar quando a energia volta**, se ela tiver essa opção. Ligue
  o **HDMI-CEC** (Anynet+ na Samsung, SimpLink na LG, Bravia Sync na Sony),
  para o box acordar a TV. Se a TV ficar em espera depois de uma queda de
  energia, o box volta e o painel diz "No ar", mas a tela fica preta. Isso o
  painel não vê. Por isso o teste de tirar da tomada é feito **com a TV
  junto**.

### Cabos e energia

- **Energia:** a TV e o box na mesma tomada ou no mesmo filtro de linha, com
  proteção contra surto (DPS). **O box usa a fonte dele, nunca a USB da TV:**
  a USB da TV corta a energia quando a TV entra em espera e não dá corrente
  para o box.
- **HDMI:** um cabo curto e bom (1 a 2 m). O box preso atrás da TV com
  velcro, com ar em volta (o box esquenta), e onde o controle alcança (o do
  Google TV é Bluetooth e não precisa apontar).
- **Rede:** cabo de rede Cat5e ou Cat6 até o ponto da TI. Teste o ponto antes
  do dia D (a TI confirma que o ponto está na VLAN e nas regras certas).
- **Etiquetas:** o nome da TV no box, no cabo de rede (dos dois lados) e no
  controle. O controle de cada box fica guardado com o RH, etiquetado.
- **Planilha da instalação** (o RH tem Excel): uma linha por TV com o nome,
  o lugar, o grupo, se fica deitada ou em pé, o número de série e o MAC do
  box, o ponto de rede ou a porta do switch, o IP (se for fixo) e quem
  responde por aquele lugar. A TI usa a mesma planilha para a reserva de IP.

## 3. Ligar as 8 TVs

O passo a passo está em [ROTEIRO-DE-INSTALACAO.md](ROTEIRO-DE-INSTALACAO.md).
O plano do dia:

- **D-3, na bancada:** os 8 boxes saem da caixa, recebem as atualizações do
  sistema e da Play Store (o *Android System WebView* principalmente), o app
  MultiTelas TV, a tela inicial, a energia e a data e hora. Chegam na empresa
  prontos para ligar o cabo e parear.
- **No dia D:** duas pessoas. Uma no lugar da TV, a outra no painel pelo
  celular ou notebook. A conta é de 30 a 40 minutos por TV com o teste de 5
  minutos, ou umas 4 horas para as 7 que faltam. Comece pelo lugar mais
  visível (a recepção) e termine onde a rede for mais difícil.
- **Nomes:** pelo lugar, como quem trabalha ali fala: "Recepção", "Refeitório",
  "Produção 1"… O nome aparece no aviso de queda e na lista de Telas.
- **A instalação de 8 TVs não esbarra em limite:** são 300 TVs novas por hora
  por IP e um freio do painel bem acima do que 8 TVs pedem
  ([CAPACIDADE-E-TVBOX.md](../CAPACIDADE-E-TVBOX.md) §4).

## 4. Grupos e lojas

No MultiTelas, o **grupo** de uma TV é a **loja** dela: é por ele que se
manda a mesma coisa para várias TVs de uma vez e que se dá permissão a quem
cuida só de um lugar.

- Defina os grupos **antes do dia D**, com o RH, pelo **público** de cada
  lugar, e não pela parede. Exemplo: `Recepção` (visitantes), `Refeitório`
  (todo mundo), `Produção` (o chão de fábrica), `Escritório`.
- Na TV: Telas › a TV › Mais opções › **Nome e grupo**.
- **Permissão por loja** (Equipe › Escolher lojas): use se alguém, por
  exemplo o encarregado da produção, só deve mexer nas TVs da produção.
- **Aprovação antes de ir ao ar** (Equipe, a chave): ligue se mais de duas
  pessoas vão publicar. O que um Membro põe vira pedido, e a dona ou um Admin
  aprova pelo celular. Desligada, cada um publica direto.
- **Horário de cada TV** (Mais opções › Horário e aviso de queda): o padrão é
  **segunda a sábado, das 7h às 22h, no horário de Brasília**. Acerte para o
  expediente da empresa (por exemplo, segunda a sexta, 7h–18h; a produção
  com turno tem o horário dela). É esse horário que decide **quando o aviso
  de queda sai**. Fora dele, a TV pode continuar, ficar preta ou mostrar só o
  relógio.

## 5. O conteúdo do dia 1

A regra do dia 1: **pouco, bonito e verdadeiro**. Nada de exemplo, nada de
data errada, nada que dependa de um sistema que ainda não foi testado.

- **De onde vem:** Biblioteca › Prontos (o pacote de Empresas, já com a
  marca), o Criar com a IA para os avisos do mês, as fotos e os vídeos do
  próprio RH.
- **O que pôr, por grupo** (sugestão para conversar com o RH):
  - **Recepção:** boas-vindas com a marca, o modo ambiente entre os avisos,
    dados da empresa;
  - **Refeitório:** o cardápio da semana, os aniversariantes do dia, os
    comunicados do RH;
  - **Produção:** segurança e EPI, a meta, o turno;
  - **todas:** as datas de dezembro do calendário pronto (confraternização,
    recesso, fim de ano).
- **Aniversariantes:** o RH importa a planilha em **Excel (.xlsx) ou CSV**
  (nome e nascimento; setor, cargo e foto se tiver). Importar de novo
  atualiza.
- **Apresentações do PowerPoint:** **exporte como imagem** (PowerPoint ›
  Arquivo › Exportar › PNG, todos os slides) **ou como vídeo** (Exportar ›
  Criar um vídeo, MP4) e suba como fotos ou vídeo. Não use o tipo
  "Apresentação" (PPTX/PDF) no dia 1. O PPTX depende do visualizador
  online da Microsoft, que precisa buscar o arquivo pela internet, e pelo
  código o endereço que vai para ele é relativo (`/media/…`) quando
  `MEDIA_PUBLIC_BASE` está vazia. Não foi conferido em produção. E o PDF
  dentro da TV depende do navegador: o WebView do Android não mostra PDF.
- **Páginas da intranet:** não no dia 1. Primeiro o teste na TV piloto, pelo
  [INTRANET-NA-TV.md](INTRANET-NA-TV.md).
- **Indicadores:** só se já houver planilha do Google ou um sistema que mande
  os números (Indicadores › Receber). A pasta de rede e a intranet ainda não
  entram sozinhas:
  - **em breve, Conector MultiTelas:** um programa dentro da rede da
    empresa que leva arquivos da pasta de rede e o feed da intranet até as
    TVs;
  - **em breve, API pública (`/api/v1/`):** para o sistema da empresa
    publicar na TV sem ninguém abrir o painel.
- **Antes de mexer, guarde:** em cada TV, Mais opções › Backup e cópia ›
  Guardar. É o ponto de volta se o dia 1 der errado.

## 6. Treinar o RH (D-2, 1h30, com a TV piloto)

Com o celular e o computador de quem vai usar, e a TV piloto na frente.
Cada um faz, e você só fala o passo (como no
[ROTEIRO-PILOTO.md](../qa-total/ROTEIRO-PILOTO.md)).

1. **Entrar** em `app.multitelas.net.br`. No celular, instalar como app
   (o painel oferece).
2. **Telas:** "No ar", "Fora do ar", o último sinal. **Ver agora** mostra o
   que a TV está passando.
3. **Pôr na TV:** trocar um texto, escolher **Quando** (agora, até um dia) e
   publicar. A TV muda em segundos.
4. **Aviso rápido urgente** (acabou a água, mudou a reunião): por cima de
   tudo, mas sem tomar a tela o tempo todo.
5. **Desfazer:** na página da TV, devolve o que estava.
6. **Aniversariantes:** importar a planilha do Excel.
7. **Aprovações**, se a chave estiver ligada: o pedido e o OK pelo celular.
8. **Quando a TV para:** Mais opções › **Recarregar a TV**. Se não resolver,
   **Reiniciar o app da TV** (até 1 minuto). Se continuar, chamar o suporte
   (seção 8).
9. **O que não fazer:** mexer nos ajustes do box, tirar o cabo de rede,
   trocar a TV de tomada sem avisar, apertar OK no aviso "App novo" sem
   saber o que é (instala a versão nova do app; não tem problema, mas
   acontece na frente de todo mundo).

Deixe uma folha de uma página com esses 9 itens e o contato do suporte.

## 7. Semana 1: o que vigiar

### Como você fica sabendo de um problema

| O quê | Por onde chega | Quando |
|---|---|---|
| **TV fora do ar** | E-mail "⚠ Recepção está fora do ar · MultiTelas" para o primeiro Dono da conta. Com `ALERTA_OFFLINE_COPIA`, uma cópia para você, com `[nome da conta]` no assunto | 15 minutos sem sinal **dentro do horário da TV**. Um e-mail por queda. As TVs da mesma conta que caem juntas vêm num e-mail só, com a lista. A TV que cai às 22h e não volta vira aviso às 7h15. A TV com o aviso desligado não avisa nunca (`server/vigia.js`). |
| **Todas as TVs, de todas as contas** | **Plataforma › Negócio › Frota**: a apagada há mais tempo primeiro, "fora do expediente" separada, o último sinal, o aparelho e o botão Recarregar | Ao abrir a página (os números têm no máximo 1 minuto) |
| **A TV que travou e voltou sozinha** | Frota, coluna Aparelho: `vigia: recargas 1 · webview 0 · pedidos 1 · app 0`. Recargas e WebViews novos contam travamentos que o app resolveu; pedidos são a madrugada e o painel; app são os reinícios do app | A TV salva pelo vigia segue "No ar" e **não vira e-mail**. Só aqui aparece |
| **TV que pode não voltar sozinha** | Frota: "não é a tela inicial". Na página da TV, para o cliente: "Esta TV pode não voltar sozinha", com o passo a passo | Assim que a TV pulsa |
| **App novo esperando** | No cartão da TV: "App novo (1.0.N): aperte OK no controle da TV" | Quando sai versão nova do app |
| **Erro no servidor** | O webhook (`ALERTA_WEBHOOK_URL`): "🔴 MultiTelas: …", só na primeira vez de cada erro, no máximo 5 em 5 minutos. A lista em **Plataforma › O que quebrou** (agrupada; some no deploy) | Na hora |
| **O servidor caiu** | O monitor de fora no `/healthz` (seção 1). O Railway também avisa deploy que falhou, se estiver ligado ([OPERACAO.md](../OPERACAO.md) §3) | Na hora |
| **Deploy feito** | O webhook: "🟢 MultiTelas no ar: versão abc1234". Deploy sem essa mensagem em 5 minutos não subiu | A cada deploy |
| **Backup** | Plataforma › Negócio › **Saúde** › Último backup. O e-mail de falha (`BACKUP_AVISO`) | Todo dia, 3h |
| **Erros nas últimas 24 h, conexões das TVs, trabalhos de IA** | Plataforma › Negócio › Saúde | Ao abrir a página |

**Na página de cada TV** (o que o cliente vê): "No ar · sinal agora" ou "Fora
do ar · sinal há 2 h". O aparelho ("1920×1080 · App 1.0.N"), o aviso de tela
inicial e **Ver agora**.

### A rotina da semana

- **Todo dia, antes do expediente (7h30):** a Frota. As 8 TVs "no ar". Na
  coluna Aparelho, o vigia sem número subindo e nenhum "não é a tela
  inicial". Depois a Saúde: o backup de hoje, os erros das últimas 24 h e as
  conexões.
- **Todo dia, no fim da tarde:** a caixa de e-mail (aviso de queda) e o
  canal do webhook.
- **D+1 e D+4 (segunda):** de manhã, conferir que as TVs voltaram sozinhas
  depois da noite e do fim de semana, e que **a tela está acesa** (o painel
  não vê TV em espera com o box ligado; peça ao RH uma foto ou uma olhada).
- **Logs do Railway**, quando algo não bate: `vigia.avisos` (aviso mandado),
  `vigia.envio-falhou` e `vigia.copia-falhou` (o provedor de e-mail
  recusou), `erro.capturado`, `limite.estourado`.

### O que conta como problema

- Qualquer TV fora do ar no expediente que não seja falta de energia ou de
  rede do cliente.
- As **recargas ou os WebViews novos** do vigia de uma TV **subindo de um dia
  para o outro**. A conta é desde que o app abriu, e não zera de madrugada.
  "pedidos" sobe 1 por noite e é normal. Se sobe, o box está travando: olhe o
  modelo e a memória do box. Se for um box só, troque pela reserva.
- Mudança que leva **mais de 30 segundos** para chegar na TV: o tempo real
  está bloqueado no caminho (o proxy segura a conexão longa;
  [PARA-A-TI.md](PARA-A-TI.md)). A TV ainda recebe pelo pulso de 30 s, mas a
  TI precisa ver.
- Texto cortado ou pequeno demais a 3 metros: Ajustes da TV › Encaixe.

## 8. Voltar atrás e suporte

### Congelar (D-3 a D+7)

- **Nada de deploy novo em produção** sem necessidade, de D-3 a D+7. Se o
  canal beta estiver montado ([CANAL-BETA.md](../CANAL-BETA.md)), não
  empurre a `main` para a `estavel` nesses dias. Correção urgente: uma só,
  pequena, testada no box beta.
- **Nada em `android/`** nesse tempo. Cada push na `main` que mexe no app
  publica uma versão nova, e **todas as TVs** oferecem a atualização.

### Voltar atrás, do menor para o maior

| O que deu errado | Como voltar |
|---|---|
| Conteúdo errado numa TV | Página da TV › **Desfazer**, ou os "Últimos envios" |
| A programação inteira de uma TV | Mais opções › Backup e cópia › **Restaurar** o arquivo guardado no D-1, ou **Copiar de outra tela** |
| A TV parou, travou ou ficou preta | **Recarregar a TV** › **Reiniciar o app da TV** › o RH tira o box da tomada e liga de novo |
| A TV mostra um código em vez da programação | Mais opções › **Reconectar** e digitar o código: volta tudo, sem ocupar vaga |
| O box morreu | Trocar pelo box reserva (já montado), ligar e **Reconectar** a TV antiga com o código do novo |
| Um deploy quebrou as TVs | As TVs continuam com o que já tinham (o player e a mídia ficam guardados). Volte o servidor: Railway › Deployments › o deploy anterior › **Redeploy**, ou devolva a `estavel` ao commit anterior. O webhook "🟢 no ar" confirma |
| O banco | O backup do dia ([BACKUP.md](../BACKUP.md), "Restaurar de verdade"), **sempre num banco novo**, nunca por cima |
| A rede da empresa caiu | Nada a fazer no MultiTelas: a TV segue com a última programação e volta sozinha |
| Tudo falhou no dia D | Último recurso: os avisos do dia em fotos num pendrive, no reprodutor da própria TV, enquanto você resolve |

### Suporte na semana 1

- **Canal combinado com o RH:** um e-mail (o `SUPORTE_EMAIL`) e um WhatsApp,
  com o horário de atendimento escrito. Na semana 1: resposta em até 1 hora
  no expediente.
- **Quem faz o quê:**
  1. o RH confere se a TV está ligada, com cabo e na tomada;
  2. o RH usa Recarregar e depois Reiniciar o app;
  3. você entra na conta pelo **acesso de suporte** (Plataforma › Contas ›
     a ficha › Entrar como o dono da conta, por 1 hora, com o motivo
     escrito; fica registrado) e olha a página da TV;
  4. a TI do cliente, se o problema for de rede (o
     [PARA-A-TI.md](PARA-A-TI.md) tem a lista);
  5. ida até a empresa, com o box reserva.
- **Anote cada chamado:** a hora, a TV, o que era e como resolveu. Vira a
  pauta do D+7 e o próximo roteiro de instalação.

### Vai ou não vai (D-3)

Vai se tudo isto for verdade:

- a TV piloto ficou **72 horas** ligada, incluindo o fim de semana, sem queda
  sem motivo, com o vigia em zero ou perto disso;
- ela **voltou sozinha** depois de tirar da tomada (o box e a TV juntos);
- não aparece "não é a tela inicial";
- uma mudança feita no painel chega à TV em **até 5 segundos**;
- a TI confirmou as regras para os 8 pontos;
- o backup de hoje está na Saúde;
- o plano da conta aceita 8 TVs;
- os 9 boxes estão na mão;
- o RH aprovou o conteúdo do dia 1.

Se um item falhar, adie a instalação ou instale só onde der, e escreva o
que falta.
