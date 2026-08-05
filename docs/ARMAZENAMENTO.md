# Armazenamento de mídia (persistência)

Tudo que é enviado ou gerado — logo, fotos dos aniversariantes, vídeos,
imagens da IA, referências de campanha — vira **arquivo**, não vai para o
banco. Este documento diz onde esses arquivos moram e como não perdê-los.

## O problema que isso resolve

No Railway (e em qualquer PaaS), **o disco do contêiner é apagado a cada
deploy**. Com o driver padrão (`disk`) e sem volume, a mídia funciona
perfeitamente até o próximo deploy — e some. É uma falha silenciosa: nada
quebra na hora, o cliente é que descobre depois com a logo sumida.

Por isso o servidor **avisa no boot** quando está nessa situação:

```
⚠️  [storage] Mídia gravando em disco EFÊMERO (…). Uploads somem no próximo deploy.
```

## Duas saídas

### Opção A — Volume persistente (mais simples)

Boa para começar e para uma instância só.

1. No Railway, crie um **Volume** no serviço e monte em `/data`.
2. O Railway define `RAILWAY_VOLUME_MOUNT_PATH` sozinho — o servidor já usa
   esse caminho automaticamente. Em outro PaaS, defina `MEDIA_DIR=/data`.
3. Reinicie. O aviso do boot deve sumir.

Limite: volume prende o serviço a **uma instância**. Para escalar
horizontalmente (ou usar CDN), vá para a opção B.

### Opção B — Object storage compatível com S3 (recomendado para produção)

Funciona com **AWS S3**, **Cloudflare R2**, Backblaze B2 e MinIO. A assinatura
SigV4 é feita no próprio código (`server/storage.js`), sem dependências.

```
STORAGE=s3
S3_ENDPOINT=https://<conta>.r2.cloudflarestorage.com
S3_BUCKET=multitelas-midia
S3_REGION=auto                # na AWS, use a região real (ex.: sa-east-1)
S3_ACCESS_KEY_ID=...
S3_SECRET_ACCESS_KEY=...
```

#### Passo a passo na AWS S3

**1. Região.** Anote a região do bucket (canto superior direito do console).
Na AWS ela **não pode ser `auto`** — a assinatura leva a região dentro dela e
o pedido é recusado se estiver errada. São Paulo é `sa-east-1`.

**2. Usuário do IAM só para isto.** Em *IAM → Users → Create user*, sem acesso
ao console. Anexe uma política inline com o mínimo necessário:

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"],
    "Resource": "arn:aws:s3:::SEU-BUCKET/*"
  }]
}
```

Depois crie uma **access key** (*Security credentials → Create access key →
Application running outside AWS*). O segredo aparece **uma vez só**.

**3. Bloqueio de acesso público: deixe LIGADO.** O servidor busca o objeto
autenticado e repassa em `/media/...`; o bucket não precisa ser público.
Só abra se você for colocar CloudFront na frente (veja abaixo).

**4. Variáveis:**

```
STORAGE=s3
S3_ENDPOINT=https://s3.sa-east-1.amazonaws.com
S3_BUCKET=seu-bucket
S3_REGION=sa-east-1
S3_ACCESS_KEY_ID=AKIA...
S3_SECRET_ACCESS_KEY=...
```

O endpoint do bucket (`https://seu-bucket.s3.sa-east-1.amazonaws.com`) também
funciona — o servidor detecta sozinho qual dos dois formatos você usou e ajusta
o endereçamento. Não precisa mexer em `S3_FORCE_PATH_STYLE`.

**5. CORS: não precisa**, porque o navegador fala com o nosso servidor, não com
o bucket. Só configure CORS se apontar `MEDIA_PUBLIC_BASE` direto para o S3.

**6. CloudFront (opcional).** Para não pagar saída de dados pelo servidor,
coloque um CloudFront na frente do bucket e defina
`MEDIA_PUBLIC_BASE=https://dxxxx.cloudfront.net`. Aí as URLs apontam para o CDN
e o servidor sai do caminho do download.

Opcionais:

| Variável | Para quê |
| --- | --- |
| `MEDIA_PUBLIC_BASE` | Domínio público do bucket ou CDN. Definido, as URLs apontam direto para lá e o servidor deixa de intermediar o download (mais rápido e mais barato). |
| `S3_FORCE_PATH_STYLE` | `true` (padrão) usa `/bucket/chave` — o que R2 e MinIO esperam. Na AWS com host virtual (`https://bucket.s3.regiao.amazonaws.com`), defina `false`. |
| `MEDIA_MAX_FILE` | Limite por arquivo em bytes (padrão 200 MB). |
| `MEDIA_QUOTA` | Cota por empresa em bytes (padrão 5 GB). |

Sem `MEDIA_PUBLIC_BASE`, o servidor busca o objeto no bucket e repassa em
`/media/...`. Funciona, mas todo byte passa pelo servidor — com CDN é melhor.

## Como fica a URL

Em ambos os drivers a mídia é referenciada como `/media/<empresa>/<id>.<ext>`.
A chave é opaca e não adivinhável, e a resposta vai com cache longo
(`immutable`) porque o nome nunca se repete.

Trocar de driver **não muda as URLs já salvas nas telas** — mas os arquivos
não migram sozinhos. Se você já tem mídia em disco e vai para o S3, copie o
conteúdo de `data/media/` para o bucket mantendo os mesmos caminhos.

## Limites e segurança

- Tipos aceitos: PNG, JPEG, WebP, GIF, SVG, MP4, WebM, PPTX, PPT e PDF.
  HTML fica de fora de propósito (XSS).
- O upload é **streaming**: o arquivo passa por um temporário e vai para o
  destino sem ser carregado inteiro na memória — vídeo grande não derruba o
  servidor.
- Chaves com `..` ou caminho absoluto são recusadas com 403, nos dois drivers.
- O `Content-Type` é derivado da extensão e vai com `X-Content-Type-Options:
  nosniff`.

## Verificando que está tudo certo

No boot, o log mostra o driver e, no s3, a configuração resolvida:

```
[storage] driver: s3 · bucket seu-bucket · região sa-east-1 · endereçamento por caminho
```

Se aparecer `disk` em produção **sem** volume montado, o aviso de disco
efêmero vem logo abaixo — trate como pendência, não como ruído.

Depois de configurar, o teste real é: envie uma imagem em **Armazenamento**,
recarregue e confirme que ela ainda aparece; depois faça um deploy e confirme
de novo. Se sobreviveu ao deploy, está resolvido.

## Erros comuns no S3

| Sintoma | Causa provável |
| --- | --- |
| `S3 PUT 403 SignatureDoesNotMatch` | `S3_REGION` diferente da região real do bucket, ou secret com espaço/quebra de linha ao colar |
| `S3 PUT 403 AccessDenied` | A política do IAM não cobre `PutObject` **em `arn:...:::bucket/*`** (o `/*` é obrigatório) |
| `S3 PUT 404 NoSuchBucket` | Nome do bucket errado, ou endpoint de outra região |
| Upload passa, mas a imagem não abre | `MEDIA_PUBLIC_BASE` apontando para bucket privado — remova a variável ou publique via CloudFront |
