# Bom dia: o que foi feito e como colocar numa loja esta semana

Escrito em 29/09/2026, durante a madrugada. Tudo está no PR
[#108](https://github.com/Thiagoolivs/Multi-telas/pull/108), com 800
testes passando e o APK compilando no GitHub Actions.

---

## 1. O que mudou esta noite (resumo)

**Bugs graves corrigidos**
- A TV ligava sem internet e trocava a vitrine pela demonstração. Agora ela
  mantém a última programação e reconecta sozinha.
- Três furos de cobrança fechados: a assinatura passa a cobrar pelas telas de
  verdade, atraso tem carência de 7 dias, estorno tira o plano.
- Convidar alguém para a equipe dava "erro interno" (bug que já estava em
  produção).
- Trocar a senha no modo local também quebrava.
- 10 problemas achados na revisão de código, 2 deles de segurança, corrigidos.

**Recursos novos**
- **App Android de quiosque** para TV Box (pasta `android/`, compila no CI).
- **QR Code na TV:** o dono aponta o celular e pareia sem digitar nada.
- **Recarregar a TV pelo painel**, e o painel mostra o aparelho e a resolução
  de cada tela.
- **Relatório de exibição:** o que passou, quantas vezes, em qual tela, com CSV.
- **Grupos de telas** ("Loja Centro"), com publicação no grupo inteiro de uma vez.
- **Alerta de tela caída** que respeita o horário de funcionamento. Não manda
  mais e-mail toda noite.
- **Pacotes de crédito avulsos** (25, 100 e 500).
- **Selo "versão gratuita"** na tela depois que o teste acaba sem assinatura.
- **Editor:** texto em curva e 19 elementos gráficos (selo de oferta, faixa,
  seta, balão, moldura…).
- **Ajustes da tela simplificados:** o essencial à vista, o resto em "Mais
  ajustes".
- O painel antigo (`/legacy`) saiu do ar. O README e os documentos voltaram a
  dizer a verdade.

---

## 2. O que comprar para UMA loja (supondo que a TV já existe)

| Item | Para quê | Preço aprox. |
|---|---|---|
| **Xiaomi TV Box S (3ª geração)** — Google TV, 2 GB, **homologado pela Anatel** | É o "computador" da TV: roda o app MultiTelas TV | **R$ 420 – 500** ([TechTudo, mar/2026](https://www.techtudo.com.br/listas/2026/03/tv-boxes-homologadas-estao-com-descontacos-na-semana-do-consumidor-sc26-edqualcomprarie.ghtml)) |
| Filtro de linha / DPS | Queda de energia e surto não queimam o box | R$ 40 – 80 |
| Suporte de parede (se a TV ainda não está presa) | — | R$ 60 – 150 |
| Repetidor Wi-Fi (só se o sinal perto da TV for fraco) | O box não tem entrada de cabo de rede; ele depende de um bom Wi-Fi | R$ 100 – 150 |

**Total por tela: cerca de R$ 500 a R$ 650** (sem a TV).

**O que NÃO comprar**
- **TV box sem homologação da Anatel** ("MXQ", "TX3" e similares). Pode ser
  bloqueado ou apreendido, e costuma travar e esquentar.
- **Fire TV Stick** (cerca de R$ 349). Funciona, mas o Fire OS não deixa o app
  abrir sozinho quando liga. Depois de cada queda de energia, alguém teria que
  abrir o app na mão.

**Custo zero para testar hoje:** se a loja já tem Smart TV Samsung ou LG,
abra `seu-dominio/tv` no navegador da própria TV. Serve para o piloto. O
navegador da TV pode fechar sozinho ou dormir; para ficar em definitivo, use o
box.

---

## 3. Custos mensais da operação (para você, não para o cliente)

| Serviço | Para quê | Custo |
|---|---|---|
| Railway (Hobby) | Servidor + Postgres | US$ 5/mês com US$ 5 de uso inclusos ([Railway](https://docs.railway.com/pricing/plans)) |
| Cloudflare R2 | Imagens e vídeos | Grátis até 10 GB, sem custo de saída ([R2](https://nubbo.app/blog/cloudflare-r2-free-tier/)) |
| Resend | E-mail de cadastro e alerta | Grátis até 3.000 e-mails/mês (100/dia) ([Resend](https://resend.com/blog/new-free-tier)) |
| Asaas | Cobrança | Sem mensalidade. Pix R$ 1,99 (100 primeiros grátis/mês), boleto R$ 3,49, cartão 2,99% + R$ 0,49 ([Asaas](https://www.asaas.com/precos-e-taxas)) |
| Domínio `.com.br` | Endereço próprio | cerca de R$ 40/ano (registro.br) |
| Gemini (Google) | IA | Por uso. Só a imagem custa de verdade (cerca de R$ 0,35 cada, ver `BILLING.md`) |

**Com 1 a 5 lojas: fica em torno de R$ 30 a R$ 60 por mês.**

---

## 4. Plano da semana

**Hoje (segunda/terça)**
1. Rodar o prompt do Cowork (`docs/PROMPT-COWORK.md`): domínio, R2, Resend,
   Asaas (primeiro em sandbox), Gemini e `ADMIN_EMAILS`.
2. Fazer o merge do PR #108 (o Railway publica sozinho).
3. No GitHub: **Settings › Secrets and variables › Actions › Variables** →
   criar `MT_URL` com o seu endereço (ex.: `https://app.seudominio.com.br`).
   Depois rodar de novo o workflow **App Android** e baixar o `.apk` em
   *Artifacts*. Sem isso o app aponta para o endereço padrão; dá para trocar na
   TV (VOLTAR 5 vezes), mas é mais fácil já vir certo.
4. Comprar o box (entrega em 1 ou 2 dias nas grandes lojas).
5. Mandar os Termos para o advogado.

**Enquanto os Termos não voltam:** instale na loja piloto como **cortesia**
(`CONTAS_CORTESIA` com o e-mail do dono da loja). A conta fica com o plano Pro
completo, sem cobrança e sem o selo. Comece a cobrar depois da revisão.

**Dia da instalação — cerca de 20 minutos na loja**
1. Box no HDMI e na tomada, via filtro de linha. Conectar ao Wi-Fi da loja.
2. Instalar o `.apk` pelo pendrive (o passo a passo está em `android/README.md`).
3. Abrir o MultiTelas TV. Na primeira vez ele pede **"Sobrepor a outros
   apps"**: ative.
4. A TV mostra o código e o QR. **O dono aponta o celular**, faz login ou cria
   a conta, e a tela está pareada.
5. Em **Telas › sino**: horário de funcionamento da loja (é o que evita alerta
   à noite).
6. Publicar um modelo pronto, ou gerar uma campanha com IA na frente do dono.
7. **Teste obrigatório:** tire o box da tomada, ligue de novo e confira que o
   MultiTelas volta sozinho com a programação.
8. No painel, a tela aparece "Online" com "1920×1080 · App 1.0.N".

**No dia seguinte:** abra **Relatório**. É ali que o dono vê que passou, e é o
argumento para ele pagar.

---

## 5. O que eu não consegui testar (seja o primeiro a conferir)

- **O APK nunca rodou num aparelho de verdade.** Ele compila, o Java foi
  conferido contra a API do Android e o comportamento foi simulado no
  navegador. Mas abrir sozinho no boot, a tela sempre acesa e a permissão de
  sobreposição só se confirmam no box. Faça o teste de tirar da tomada antes de
  levar à loja.
- **Asaas e Resend de verdade:** tudo foi testado em modo simulado. O primeiro
  pagamento no sandbox é o teste real (`node tools/conferir-config.mjs`
  ajuda).
- **Ler o site do cliente** (tela Marca) nunca rodou fora do ambiente de
  desenvolvimento.
