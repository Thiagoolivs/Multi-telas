# Backup do banco

Todo dia às 03h, um serviço separado no Railway copia o Postgres inteiro,
cifra, guarda num bucket **privado só de backup** e, antes de dizer que deu
certo, **restaura a cópia** num Postgres descartável e confere as linhas de
cada tabela. Falhou qualquer passo: e-mail para o dono. (PLANO §10, Fase 0.)

Código: `tools/backup.mjs` (o que roda), `server/backup.js` (cifra, nomes,
limpeza), `server/s3.js` (bucket), `backup/Dockerfile` (a imagem).

## O que acontece às 03h

1. Abre uma transação, exporta o snapshot e conta as linhas de cada tabela
   **dentro dele**. O `pg_dump` usa o mesmo snapshot, então as contagens são
   exatamente as do arquivo — mesmo com TVs gravando no banco durante o dump.
2. `pg_dump` em formato custom (já comprimido).
3. Cifra com AES-256-GCM (`BACKUP_CHAVE`) e envia como
   `postgres/AAAA-MM-DD.dump.enc`.
4. **Baixa de volta**, confere o sha256, decifra e restaura num Postgres que
   sobe e morre dentro do próprio contêiner. Compara as contagens.
5. Grava `postgres/AAAA-MM-DD.json`: contagens, tamanho, sha256 e o resultado
   da restauração.
6. Apaga os de mais de 30 dias — o prazo que a política de privacidade promete
   (`server/legal.js`) — mas **nunca os 7 mais recentes**: se o cron parar por
   dois meses, a limpeza não leva o último backup bom.

Por que cifrar se o bucket é privado: o dump tem e-mail, telefone e
aniversário de clientes e o hash das senhas. Bucket privado é uma camada, e
configuração de bucket muda sem ninguém olhar o backup.

## Montar (uma vez)

### 1. O bucket (Cloudflare R2)

1. R2 → **Create bucket** → `multitelas-backup`. Deixe **sem acesso público**
   (sem domínio `r2.dev`, sem domínio próprio).
2. R2 → **Manage R2 API Tokens** → **Create API token**:
   - Permissão **Object Read & Write**;
   - **Apply to specific buckets only** → `multitelas-backup`.
3. Anote o **Access Key ID**, o **Secret Access Key** e o endpoint
   `https://<ID-DA-CONTA>.r2.cloudflarestorage.com`.

Token só deste bucket: se a chave da mídia vazar, o backup continua fora do
alcance — e vice-versa.

### 2. A chave de criptografia

```
node tools/backup.mjs chave
```

Guarde o resultado **também fora do Railway** (gerenciador de senhas). Sem
ela o backup não abre; se o Railway sumir, a chave some junto.

### 3. O serviço no Railway

No projeto **Multi Telas**: **New → GitHub Repo** → este repositório.

| Ajuste | Valor |
|---|---|
| Nome | `backup` |
| Branch | `main` |
| Variável `RAILWAY_DOCKERFILE_PATH` | `backup/Dockerfile` |
| Cron Schedule | `0 6 * * *` (06h UTC = 03h em São Paulo) |
| Restart policy | Never |
| Domínio público | nenhum |

Variáveis:

| Variável | Valor |
|---|---|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (rede interna, sem SSL) |
| `BACKUP_S3_ENDPOINT` | `https://<ID-DA-CONTA>.r2.cloudflarestorage.com` |
| `BACKUP_S3_BUCKET` | `multitelas-backup` |
| `BACKUP_S3_ACCESS_KEY_ID` / `BACKUP_S3_SECRET_ACCESS_KEY` | do token do passo 1 |
| `BACKUP_CHAVE` | do passo 2 |
| `BACKUP_AVISO` | e-mail(s) do aviso de falha, separados por vírgula (padrão: `ADMIN_EMAILS`) |
| `RESEND_API_KEY` (ou `BREVO_API_KEY`), `MAIL_FROM` e `ADMIN_EMAILS` | `${{Multi-telas.RESEND_API_KEY}}` etc. — os mesmos do servidor, para o aviso sair |

Opcionais: `BACKUP_S3_REGION` (padrão `auto`, o do R2), `BACKUP_DIAS` (30),
`BACKUP_MANTER` (7), `PGSSL` (`disable` fora da rede interna).

Depois do primeiro deploy, rode uma vez à mão (**Run now** no cron) e confira
no log: `restaurado e conferido` e `ok em … s`.

## Restaurar de verdade

Com as variáveis `BACKUP_*` no terminal:

```
node tools/backup.mjs listar
node tools/backup.mjs baixar                 # o mais recente
node tools/backup.mjs baixar 2026-10-20      # um dia específico
```

O `baixar` confere o sha256 com o manifesto e decifra para
`backup-AAAA-MM-DD.dump`. Restaure **num banco vazio** — no Railway, um
Postgres novo:

```
pg_restore --no-owner --no-acl --exit-on-error -d "postgresql://…/banco_novo" backup-AAAA-MM-DD.dump
```

Confira o painel apontando o servidor para o banco novo **antes** de trocar a
`DATABASE_URL` de produção. Nunca restaure por cima do banco de produção: se
o backup for o problema, aí não sobra nada.

## Quando algo muda

- **Postgres subiu de versão** (o Railway atualiza): o backup falha com
  "pg_dump N é mais velho que o Postgres M" e manda e-mail. Troque a tag em
  `backup/Dockerfile` para `postgres:M-alpine`.
- **Chave nova**: os backups antigos continuam na chave antiga. Guarde as duas
  até os antigos saírem (30 dias).
- **O que este backup não cobre**: a mídia (fotos e vídeos) fica no bucket de
  mídia, não no banco. E se o cron simplesmente não rodar, nenhum e-mail chega
  — o "último backup" no painel de administração (PLANO §7.2, Saúde) é o que
  fecha esse buraco.

## Como foi testado

Além de `test/backup.test.js` (cifra, assinatura contra os exemplos da AWS,
limpeza), o caminho inteiro rodou com a imagem real contra um Postgres 18 com
o schema do app e um S3 local (RustFS) que confere assinatura:

- backup → bucket → restauração conferida, 25 tabelas;
- 1.945 gravações no banco durante o backup e as contagens ainda exatas;
- `baixar` + `pg_restore` num banco novo, contagem igual à do manifesto;
- arquivo adulterado no bucket: `baixar` recusa e não deixa meio dump;
- segredo errado: saída 1 e e-mail de falha;
- limpeza: com 10 backups velhos, apagou 4 e manteve os 7 mais recentes.
