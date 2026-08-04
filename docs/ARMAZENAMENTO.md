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

Funciona com **Cloudflare R2**, AWS S3, Backblaze B2 e MinIO. A assinatura
SigV4 é feita no próprio código (`server/storage.js`), sem dependências.

```
STORAGE=s3
S3_ENDPOINT=https://<conta>.r2.cloudflarestorage.com
S3_BUCKET=multitelas-midia
S3_REGION=auto                # na AWS, use a região real (ex.: sa-east-1)
S3_ACCESS_KEY_ID=...
S3_SECRET_ACCESS_KEY=...
```

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

No boot, o log mostra o driver ativo:

```
[storage] driver: s3
```

Se aparecer `disk` em produção **sem** volume montado, o aviso de disco
efêmero vem logo abaixo — trate como pendência, não como ruído.
