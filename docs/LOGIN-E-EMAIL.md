# Login com Google, recuperação de senha e backup de tela

Guia rápido do que precisa estar configurado no Railway (ou onde a instalação
estiver rodando). Tudo é opcional: sem as variáveis, o sistema continua
funcionando com login por e-mail e senha.

## Variáveis de ambiente

| Variável | Para quê | Obrigatória? |
| --- | --- | --- |
| `APP_URL` | URL pública (ex.: `https://multitelas.up.railway.app`). Usada nos links do e-mail e no redirect do Google. | Recomendada |
| `GOOGLE_CLIENT_ID` | Login com Google | Só para o Google |
| `GOOGLE_CLIENT_SECRET` | Login com Google | Só para o Google |
| `RESEND_API_KEY` | Envio do e-mail de recuperação (via [Resend](https://resend.com)) | Só para o e-mail |
| `BREVO_API_KEY` | Alternativa ao Resend (via [Brevo](https://brevo.com)) | Só para o e-mail |
| `MAIL_FROM` | Remetente, ex.: `MultiTelas <no-reply@seudominio.com>` | Recomendada com e-mail |
| `MAIL_PROVIDER` | Força o provider (`resend`, `brevo`, `dev`) | Não |

Sem `APP_URL`, o servidor monta a URL a partir do request (respeitando os
headers de proxy do Railway). Funciona, mas fixar é mais seguro.

## Login com Google

1. No [Google Cloud Console](https://console.cloud.google.com/apis/credentials),
   crie uma credencial **OAuth client ID** do tipo *Web application*.
2. Em **Authorized redirect URIs**, adicione exatamente:
   `https://SEU-DOMINIO/api/auth/google/callback`
3. Copie o *Client ID* e o *Client secret* para `GOOGLE_CLIENT_ID` e
   `GOOGLE_CLIENT_SECRET`.

O botão "Continuar com Google" só aparece no painel quando as duas variáveis
estão definidas (`GET /api/auth/config` informa isso ao front).

Comportamento:
- E-mail do Google que já existe na base → vincula à conta existente.
- E-mail novo → cria a empresa e o usuário entra como **dono**, sem senha.
  Para definir uma senha depois, use "Esqueci minha senha".
- E-mail não verificado no Google é recusado.

## Recuperação de senha

Fluxo: **Esqueci minha senha** → e-mail com link → `/app/?reset=<token>` →
nova senha → entra já logado.

- O token vale **1 hora** e é de **uso único**.
- Pedir um novo link invalida o anterior.
- A resposta é sempre a mesma, exista ou não a conta (não revela e-mails).

**Sem provider de e-mail configurado** (`MAIL_PROVIDER=dev` ou nenhuma chave),
o link aparece na própria tela e no log do servidor — útil em desenvolvimento,
mas configure o Resend/Brevo antes de usar com cliente.

> Atenção: os providers só entregam para qualquer destinatário depois que o
> domínio do `MAIL_FROM` estiver verificado. Antes disso, costumam entregar
> apenas para o e-mail dono da conta.

## Backup e restauração de tela

Em **Telas**, o ícone de arquivo em cada tela abre **Backup e restauração**:

- **Baixar JSON** — salva layout, tema e todo o conteúdo da tela.
- **Restaurar de um arquivo** — recria a exibição a partir de um backup.
- **Copiar de outra tela** — clona a exibição de uma tela que já funciona.

Serve para quando a TV é apagada ou precisa ser trocada por outra: pareie a TV
nova e restaure o backup — a exibição volta inteira.

O backup guarda **a exibição, não o pareamento**. A TV nova precisa ser
pareada antes (ela tem código próprio).

## A TV "volta" sempre a mesma tela?

O player guarda o par id+token da TV no `localStorage` do navegador para
sobreviver a recargas. O efeito colateral era abrir outro player e receber a
**mesma** tela (parecia cache do navegador).

Saídas:
- Na página inicial, use **Player — tela nova** (`/tv?new=1`).
- Na tela de pareamento, o botão **Gerar outro código (tela nova)**.

Os dois esquecem a TV salva naquele navegador e criam outra, com código novo.
`player.html` e `sw.js` agora são servidos com `no-store`, e o cache do
service worker é versionado — ao mudar o player, suba `SHELL_CACHE` em `sw.js`.
