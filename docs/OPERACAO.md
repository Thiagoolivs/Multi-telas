# Operação — o que fazer no Railway

Os itens de operação do QA de 26/10 que dependem de clicar no Railway, e não
de código. O que era código já está no repositório (`/healthz`,
`healthcheckPath`, aviso de "versão no ar", compressão).

## 1. Região: da Holanda para os EUA (leste)

**Por quê:** o serviço roda em `europe-west4`. Cada clique no painel, cada
pulso da TV e cada passe do canal ao vivo cruza o Atlântico: ~200 ms de ida e
volta, contra ~120 ms a partir do leste dos EUA (o Railway não tem região na
América do Sul).

**Como (numa janela fora do horário comercial, ~30 min):**

1. Backup do banco atual: Railway › Postgres › *Backups* › *Create backup*
   (ou `pg_dump "$DATABASE_URL" -Fc -f multitelas.dump` de um computador).
2. Crie um Postgres novo na região **US East** (Railway › *New* › *Database*
   › Postgres; em *Settings › Region* escolha `us-east4`).
3. Restaure: `pg_restore --no-owner -d "$URL_DO_NOVO" multitelas.dump`.
4. No serviço do MultiTelas: *Settings › Region* → `us-east4`, e troque a
   variável `DATABASE_URL` para a referência do Postgres novo
   (`${{Postgres-novo.DATABASE_URL}}`).
5. O deploy só troca de versão quando `/healthz` responder (o banco novo
   precisa estar de pé). Confira: `curl https://app.multitelas.net.br/healthz`
   → `{"ok":true,"banco":"ok"}`.
6. Deixe o Postgres antigo parado uma semana antes de apagar.

**Como medir:** a resposta da API a partir do Brasil deve cair abaixo de
200 ms (`curl -w '%{time_total}\n' -o /dev/null -s https://app.multitelas.net.br/healthz`).

## 2. Homologação (staging) com uma TV de teste ligada 24 h

**Por quê:** num só dia foram quatro merges direto em produção, um deles
mexendo na reconexão de todas as TVs.

**Como:**

1. Railway › o projeto › *Environments* › *New environment* › `staging`
   (duplicando o de produção). Ele ganha serviço e Postgres próprios.
2. No serviço do `staging`: *Settings › Source* → branch `staging` (ou deploy
   de PR, se preferir), e um domínio próprio, ex.: `staging.multitelas.net.br`.
3. Variáveis do `staging`: as mesmas de produção, **exceto**:
   - `ASAAS_API_KEY` → a chave do **sandbox** do Asaas;
   - `GA_MEASUREMENT_ID` → vazia (não suja o Analytics);
   - `ADMIN_EMAILS` → só quem testa.
4. Uma TV (ou um TV box barato) ligada 24 h em `staging.multitelas.net.br/tv`.
5. Regra: **nenhum merge na `main` sem passar pelo `staging`**. Abra o PR
   contra `staging`, confira na TV de teste, e só então leve para a `main`.

## 3. Saber quando um deploy falha

O código já faz duas coisas:

- **`/healthz` + `healthcheckPath`** (`railway.json`): um deploy que sobe mas
  não fala com o banco não substitui o que está no ar, e o Railway marca a
  falha.
- **"🟢 MultiTelas no ar: versão abc1234"** no mesmo webhook dos erros
  (`ALERTA_WEBHOOK_URL`), a cada processo que sobe. Deploy feito e nenhuma
  mensagem em 5 minutos = deploy que não subiu. Várias seguidas = processo
  reiniciando em laço.

Falta ligar no Railway: *Project Settings › Notifications* (ou *Webhooks*)
→ marcar **Deploy failed / crashed** para o seu e-mail ou para o mesmo
webhook. Sem isto, a falha de **build** (antes do servidor subir) continua
só no painel do Railway.

`ALERTA_WEBHOOK_URL` aceita qualquer destino que receba
`POST {"text": "..."}`: um webhook do Slack, do Discord, ou um robô de
WhatsApp/Telegram.

## 4. Conferir a compressão em produção

```bash
curl -sI -H 'Accept-Encoding: br, gzip' https://app.multitelas.net.br/app/ | grep -i content-encoding
```

Deve responder `content-encoding: br`. Se o proxy do Railway já comprimir, a
resposta vem com o dele e o servidor não comprime de novo.

## 5. Por que ainda é uma instância só

O canal ao vivo das TVs (SSE), os comandos, os passes e os limites vivem na
memória do processo. Duas réplicas dividiriam as TVs entre si e cada uma não
veria as conexões da outra. Para escalar horizontalmente é preciso mover esse
estado para um lugar comum (Redis ou o próprio Postgres com
`LISTEN/NOTIFY`) — ver `docs/ads/05-arquitetura.md`, riscos.
