# Prontidão para lançar

Atualizado em **29/09/2026**. Este documento já passou meses dizendo que
faltava o que existia (CI, landing, cabeçalhos de segurança) e mandando
configurar Stripe depois da troca para o Asaas. Documento de lançamento que
mente é pior que documento nenhum: quem lê gasta a semana no que já está
feito. Se algo aqui ficar velho, conserte junto com o código.

Legenda: 🔴 impede vender · 🟡 resolver logo depois · 🟢 maturidade.

---

## O que falta, e quem faz

Nada disto é código. O passo a passo inteiro, pronto para o Cowork executar
no seu navegador, está em [`PROMPT-COWORK.md`](PROMPT-COWORK.md).

| | O que | Por que trava |
|---|---|---|
| 🔴 | **Revisão jurídica dos Termos** e depois `LEGAL_REVISADO=true` + `LEGAL_NOME` | Enquanto não, toda página legal mostra aviso de rascunho. Vender com Termos marcados como rascunho é vender sem Termos. |
| 🔴 | **`STORAGE=s3` + as chaves do R2** | Sem isso a mídia grava no disco do contêiner e **some no próximo deploy**. |
| 🔴 | **`RESEND_API_KEY` + `MAIL_FROM` do domínio verificado** | O cadastro só termina no link do e-mail. Sem provedor, ninguém entra. O alerta de tela caída também depende dele. |
| 🔴 | **`ASAAS_API_KEY`, `ASAAS_WEBHOOK_TOKEN`** e o webhook com os **7 eventos** (`PAYMENT_RECEIVED`, `PAYMENT_CONFIRMED`, `PAYMENT_OVERDUE`, `PAYMENT_REFUNDED`, `PAYMENT_CHARGEBACK_REQUESTED`, `PAYMENT_CHARGEBACK_DISPUTE`, `SUBSCRIPTION_DELETED`) | Sem chave o checkout é simulado; sem os eventos, pagamento não libera plano e estorno não tira. Testar antes com `ASAAS_AMBIENTE=sandbox`. |
| 🔴 | **`ADMIN_EMAILS`**, **`APP_URL`** (https, domínio próprio) | Sem o primeiro não existe painel da plataforma; sem o segundo o link do e-mail pode sair errado atrás do proxy. |
| 🔴 | **`GEMINI_API_KEY`** com faturamento no projeto Google | Sem ela a IA roda em modo demonstração. |
| 🟡 | `SUPPORT_EMAIL` e `WHATSAPP_NUMERO` | Contato nas páginas legais e na página Suporte do painel, e o botão de WhatsApp da landing e do Suporte (sem número, o botão não aparece). |
| 🟡 | **Backup do Postgres ligado e uma restauração testada** | Backup que nunca foi restaurado é backup que talvez não exista. |
| 🟡 | Login com Google (`GOOGLE_CLIENT_ID`/`SECRET`) | Opcional. |

Depois de configurar: `/sistema` mostra o diagnóstico, e
`node tools/conferir-config.mjs --email voce@dominio` prova que as chaves
**funcionam** (não só que existem).

### Nunca testado de verdade

- **Ler o site de um cliente** (`server/site.js`) só rodou contra servidores
  locais — o ambiente de desenvolvimento bloqueia HTTP externo.
- **Os caminhos de sucesso do Asaas e do Resend** (`tools/conferir-config.mjs`,
  checkout, atualização de valor da assinatura, cobrança de pacote) foram
  exercitados com respostas simuladas. O primeiro pagamento real em sandbox é
  o teste de verdade.

---

## O que está pronto

**Conta e acesso.** Cadastro com confirmação de e-mail, login, Google,
recuperação de senha, equipe com papéis. Multi-tenant por `tenant_id`.

**Cobrança (Asaas).** Um plano pago (Pro, por tela, com desconto por faixa) e
o Enterprise sob consulta. Teste de 14 dias.
- A assinatura **acompanha o número de telas**: parear e remover atualizam o
  valor; uma conciliação a cada 6h acerta o que falhou.
- **Atraso**: 7 dias de carência; depois param IA e tela nova. A tela não para.
- **Estorno e chargeback** tiram o plano.
- **Pacotes avulsos** de crédito (25/100/500), creditados uma vez só por
  pagamento.
- **Teste acabado sem assinatura**: a tela segue no ar com um selo discreto
  "versão gratuita".
- Cancelamento pelo painel.

**TV.** Pareamento por código ou QR, tempo real (SSE) com rede de segurança
pelo pulso, offline-first — inclusive **ligando sem internet** (mantém a última
programação e reconecta sozinha). Recarregar remoto pelo painel, e a TV conta
resolução e aparelho. Alerta de queda por e-mail respeitando o **horário de
funcionamento** de cada tela.

**IA, editor, marca, mural, som, LGPD, observabilidade** — ver
[`ESTADO-DO-PROJETO.md`](ESTADO-DO-PROJETO.md).

**CI.** Testes, eval em modo dev, `lint:nomes` (nome indefinido no servidor)
e build do painel, a cada push.

---

## Depois de publicar

- 🟡 **App Android de quiosque** para TV Box (abre sozinho ao ligar, tela
  sempre acesa, reabre se travar). Ver "TV Box" em
  [`ESTADO-DO-PROJETO.md`](ESTADO-DO-PROJETO.md).
- 🟢 **Relatório de exibição (proof-of-play)** — saiu do plano Pro até existir.
- 🟢 **Grupos de telas**, orientação da tela no pareamento.
- 🟢 **SSE, limites e comandos em Redis** — hoje em memória, o que prende o
  produto a uma instância.
- 🟢 Continuar tirando rotas do `server.js` (cobrança e telas já saíram).
