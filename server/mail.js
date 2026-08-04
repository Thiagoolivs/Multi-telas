/*
 * server/mail.js — envio de e-mail transacional, sem dependências.
 *
 * Providers (escolhidos por variável de ambiente, nesta ordem):
 *   - 'resend'   → RESEND_API_KEY        (https://resend.com)
 *   - 'brevo'    → BREVO_API_KEY         (https://brevo.com)
 *   - 'dev'      → nenhum configurado: escreve o e-mail no log do servidor.
 *
 * MAIL_FROM define o remetente ("MultiTelas <no-reply@seu-dominio.com>"). Sem
 * domínio verificado, os providers só entregam para o seu próprio e-mail.
 */
const RESEND_KEY = process.env.RESEND_API_KEY || '';
const BREVO_KEY = process.env.BREVO_API_KEY || '';
const FROM = process.env.MAIL_FROM || 'MultiTelas <onboarding@resend.dev>';

function provider() {
  const forced = (process.env.MAIL_PROVIDER || '').toLowerCase();
  if (forced) return forced;
  if (RESEND_KEY) return 'resend';
  if (BREVO_KEY) return 'brevo';
  return 'dev';
}
// O painel usa isto para saber se dá para prometer "enviamos um e-mail".
function configured() { return provider() !== 'dev'; }

// Separa "Nome <email>" em partes (o Brevo pede os campos separados).
function parseFrom(s) {
  const m = String(s).match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  return m ? { name: m[1] || 'MultiTelas', email: m[2] } : { name: 'MultiTelas', email: String(s).trim() };
}

async function send({ to, subject, html, text }) {
  const p = provider();
  if (p === 'resend') {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: 'Bearer ' + RESEND_KEY, 'content-type': 'application/json' },
      body: JSON.stringify({ from: FROM, to: [to], subject, html, text }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => null);
      throw new Error((d && (d.message || d.error)) || 'Resend HTTP ' + res.status);
    }
    return { ok: true, provider: p };
  }
  if (p === 'brevo') {
    const from = parseFrom(FROM);
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': BREVO_KEY, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ sender: from, to: [{ email: to }], subject, htmlContent: html, textContent: text }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => null);
      throw new Error((d && d.message) || 'Brevo HTTP ' + res.status);
    }
    return { ok: true, provider: p };
  }
  // Sem provider: registra no log para dar para seguir em dev/demo.
  console.log('\n[mail:dev] Para: ' + to + '\n[mail:dev] Assunto: ' + subject + '\n[mail:dev] ' + (text || '').trim() + '\n');
  return { ok: true, provider: 'dev' };
}

// Modelo do e-mail de recuperação de senha.
function resetEmail(link) {
  const text = 'Você pediu para redefinir sua senha no MultiTelas.\n\nAbra este link (vale por 1 hora):\n' + link +
    '\n\nSe não foi você, ignore esta mensagem — sua senha continua a mesma.';
  const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#0f172a">
  <h1 style="font-size:18px;margin:0 0 12px">Redefinir sua senha</h1>
  <p style="font-size:14px;line-height:1.6;margin:0 0 20px;color:#334155">Você pediu para redefinir sua senha no MultiTelas. O link vale por 1 hora.</p>
  <p style="margin:0 0 24px"><a href="${link}" style="display:inline-block;background:#2f6feb;color:#fff;text-decoration:none;font-size:14px;font-weight:600;padding:11px 20px;border-radius:8px">Criar nova senha</a></p>
  <p style="font-size:12px;line-height:1.6;color:#64748b;margin:0">Se o botão não funcionar, copie e cole no navegador:<br><span style="word-break:break-all">${link}</span></p>
  <p style="font-size:12px;line-height:1.6;color:#64748b;margin:16px 0 0">Se não foi você, ignore esta mensagem — sua senha continua a mesma.</p>
</div>`;
  return { subject: 'Redefinir sua senha · MultiTelas', html, text };
}

module.exports = { send, provider, configured, resetEmail };
