# Serviço "backup" do Railway — roda tools/backup.mjs por cron (docs/BACKUP.md).
#
# A base é a imagem do próprio Postgres: traz pg_dump, pg_restore e o servidor
# para o teste de restauração, na MESMA versão do banco. pg_dump mais velho que
# o servidor recusa o dump; quando o Railway subir o Postgres de versão, troque
# a tag abaixo (o backup avisa por e-mail com a versão certa).
FROM postgres:18-alpine

RUN apk add --no-cache nodejs npm

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY server/backup.js server/s3.js server/mail.js ./server/
COPY tools/backup.mjs ./tools/

# initdb recusa rodar como root, e o backup não precisa de root para nada.
USER postgres
ENTRYPOINT []
CMD ["node", "tools/backup.mjs"]
