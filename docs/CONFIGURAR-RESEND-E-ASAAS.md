# Configurar o Resend e o Asaas

Os dois passos que faltam para o produto cobrar e deixar alguém entrar.

Conta, chave e DNS só você pode fazer — é o seu CNPJ e o seu domínio. O que
está aqui é a lista exata, na ordem, com os nomes das variáveis conferidos
contra o código, e uma ferramenta que PROVA que funcionou:

```
node tools/conferir-config.mjs --email seu@endereco.com
```

Ela não confere se a variável existe; ela usa as chaves contra os serviços de
verdade. Chave revogada, domínio pela metade, token diferente do cadastrado no
Asaas e ambiente trocado passam todos por "a variável está definida" e falham
depois — no cadastro de um cliente ou numa cobrança.

---

## 1 · Resend (e-mail)

Sem isto **ninguém consegue se cadastrar**: a conta só nasce quando a pessoa
clica no link de confirmação, e sem provedor o link vai para o log do
servidor.

1. Criar conta em **resend.com**.
2. **Domains → Add Domain**, pôr o seu domínio.
3. O Resend mostra 3 registros DNS (SPF, DKIM e o de retorno). Cadastrar no
   painel do domínio e esperar verificar — costuma levar minutos, pode levar
   horas.
4. **API Keys → Create**, permissão de envio.

No Railway:

```
RESEND_API_KEY=re_xxxxxxxxxxxx
MAIL_FROM=MultiTelas <nao-responda@SEUDOMINIO.com.br>
```

**O `MAIL_FROM` tem que ser do domínio verificado.** Se você verificou
`multitelas.com.br`, o remetente não pode ser `@gmail.com` — o Resend recusa a
mensagem e a pessoa fica esperando um e-mail que nunca sai. É o erro mais
comum e o mais silencioso.

**Enquanto o domínio não estiver verificado, o Resend só entrega para o e-mail
da sua própria conta.** Dá para testar assim. Não dá para lançar.

### Se você quiser subir antes de ter isso

```
SKIP_VERIFY=1
```

O cadastro volta a criar a conta na hora, sem confirmar e-mail. Funciona, e
custa: qualquer pessoa cadastra com o e-mail de qualquer outra, e você não tem
como falar com o cliente depois. O servidor avisa no boot qual dos dois modos
está rodando.

### O que mais liga junto com o Resend

Configurar o Resend não acende só o cadastro. O **alerta de tela offline**
(`server/vigia.js`) depende dele: a cada cinco minutos o servidor procura telas
sem sinal há mais de quinze minutos e avisa o dono da conta por e-mail, antes
de o cliente descobrir sozinho que a TV está preta.

Sem provedor de e-mail o alerta fica desligado, e o boot diz isso —
`vigia.sem-email` — em vez de escrever a queda num log que ninguém lê.

```
ALERTA_OFFLINE=0
```

Desliga a varredura mesmo com o Resend configurado. Só é útil enquanto você
mexe na frota de propósito e não quer o e-mail de cada tela que você mesmo
desligou.

Três coisas que ele não faz, e que valem saber antes de o primeiro sair:

- **Não avisa duas vezes da mesma queda.** Só volta a valer se a tela pulsar
  de novo — voltar e cair outra vez é queda nova, e essa merece aviso.
- **Não avisa de tela abandonada.** Queda mais velha que 24 horas não entra. É
  o que impede o primeiro deploy disto de mandar um e-mail por cada tela morta
  que já está no banco.
- **Não manda um e-mail por tela.** O aviso é por conta, com a lista: uma
  queda de link na loja é um evento, não oito.

---

## 2 · Asaas (cobrança)

Sem isto o checkout roda em **modo simulado**: quem clicar em assinar recebe
uma página de "pagamento de teste" e ganha o plano pago de graça.

1. Criar conta em **asaas.com** e concluir o cadastro da empresa (CNPJ, conta
   bancária). Sem isso a conta não emite cobrança.
2. **Integrações → Chave de API**, gerar e copiar.
3. **Integrações → Webhooks → Adicionar**:

   | campo | valor |
   |---|---|
   | URL | `https://SEU-APP/api/billing/webhook` |
   | Token de autenticação | invente um segredo longo e guarde |
   | Versão | v3 |
   | Tipo de envio | Sequencial |

4. Marcar **exatamente estes eventos** — são os que o servidor trata:

   - `PAYMENT_RECEIVED` — **libera o plano**
   - `PAYMENT_CONFIRMED` — **libera o plano**
   - `PAYMENT_OVERDUE` — marca a conta como atrasada (a tela continua no ar)
   - `SUBSCRIPTION_DELETED` — volta a conta para o grátis

   Sem os dois primeiros, **o cliente paga e nunca recebe o plano**. É a falha
   que só aparece depois do dinheiro ter saído da conta de alguém.

No Railway:

```
ASAAS_API_KEY=$aact_xxxxxxxx
ASAAS_WEBHOOK_TOKEN=o-mesmo-segredo-do-passo-3
```

### Para testar sem cobrar ninguém

```
ASAAS_AMBIENTE=sandbox
```

A chave de sandbox é **diferente** da de produção, e usar uma no lugar da
outra dá erro de credencial — que é o mesmo sintoma de "chave errada". A
ferramenta de conferência diz qual dos dois casos é.

Tirar a variável volta para produção. **O padrão é produção de propósito:**
esquecer de ligar a sandbox faz o teste falhar alto; esquecer de desligar
cobraria de ninguém e passaria despercebido.

---

## 3 · O resto que o mesmo deploy precisa

```
APP_URL=https://SEU-APP
ADMIN_EMAILS=seu@email.com
```

`APP_URL` é de onde sai o link do e-mail de confirmação. Sem ela o endereço é
montado pelo cabeçalho da requisição, que atrás de proxy pode sair errado — e
link errado é cadastro perdido.

`ADMIN_EMAILS` liga o painel da plataforma. Sem ela, ele não existe — nem para
você.

---

## 4 · Conferir

```
node tools/conferir-config.mjs --email seu@endereco.com
```

Ela confere, nesta ordem: `APP_URL` presente e em https; chave do Resend
aceita; domínio verificado; `MAIL_FROM` pertencendo ao domínio verificado;
envio real chegando; chave do Asaas aceita; webhook cadastrado, apontando para
o endereço certo, ativo, e com os quatro eventos marcados.

Sai com código 1 se algo estiver errado, então serve em script de deploy.

O painel de admin também mostra tudo isso, mas ele responde uma pergunta mais
fraca — se a variável **existe**. A ferramenta responde se ela **funciona**.

> Nota honesta: a ferramenta foi escrita e exercitada nos caminhos de erro,
> mas a máquina onde ela foi feita tem saída de rede bloqueada para o Resend e
> o Asaas. Os caminhos de sucesso nunca falaram com os serviços de verdade —
> você vai ser o primeiro a rodar isso valendo. Se alguma resposta vier em
> formato diferente do esperado, é aí.
