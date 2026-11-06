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

/*
 * A MOLDURA DE TODO E-MAIL (reteste da fase 10): cada aviso saía com um
 * desenho próprio, sem logo nem rodapé, e o do código da foto saía cru, em
 * Times. Agora todo e-mail transacional passa por aqui: a marca em cima, o
 * cartão branco com o conteúdo, e embaixo quem manda (o que estiver
 * configurado no ambiente, como em server/legal.js: razão social, CNPJ,
 * endereço, contato).
 *
 * Feita de tabela e estilo na linha, que é o que os leitores de e-mail
 * entendem. A logo é imagem só quando há um endereço absoluto do app (e-mail
 * não lê caminho relativo); sem ele, fica o nome escrito. Nada de link
 * relativo no rodapé pelo mesmo motivo.
 *
 * `opcoes.base`: o endereço do app (ou um link dele, de onde sai a origem).
 * `opcoes.motivo`: por que a pessoa recebe (o padrão é ter conta).
 */
const esc = (v) => String(v == null ? '' : v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const LETRA = "system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif";
function origemDe(v) { try { return v ? new URL(v).origin : ''; } catch (e) { return ''; } }
/*
 * Quem manda: as mesmas variáveis de server/legal.js (fornecedor), lidas aqui
 * direto porque a imagem do backup (backup/Dockerfile) leva o mail.js sem o
 * legal.js. Só o que estiver configurado aparece.
 */
function fornecedor() {
  const v = (k) => String(process.env[k] || '').trim();
  const email = v('SUPPORT_EMAIL');
  return { marca: v('LEGAL_NOME') || 'MultiTelas', razaoSocial: v('RAZAO_SOCIAL'), cnpj: v('CNPJ'), endereco: v('ENDERECO'), contato: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '' };
}
function moldura(corpo, opcoes) {
  const o = opcoes || {};
  const base = origemDe(o.base);
  const quem = fornecedor();
  const ident = [quem.razaoSocial, quem.cnpj && 'CNPJ ' + quem.cnpj, quem.endereco].filter(Boolean).map(esc).join(' · ');
  const logo = base ? '<img src="' + esc(base) + '/icons/icone-192.png" width="28" height="28" alt="" style="display:inline-block;vertical-align:middle;border:0;border-radius:7px;margin-right:8px">' : '';
  const linhas = [
    '<strong style="color:#0e0b1f">' + esc(quem.marca || 'MultiTelas') + '</strong> · as TVs da sua empresa, com a sua marca',
    ident,
    quem.contato ? 'Dúvidas: <a href="mailto:' + esc(quem.contato) + '" style="color:#5B2EFF">' + esc(quem.contato) + '</a>' : '',
    base ? '<a href="' + esc(base) + '/app/" style="color:#5B2EFF">' + esc(base.replace(/^https?:\/\//, '')) + '</a>' : '',
    esc(o.motivo || 'Você recebe este e-mail porque tem uma conta no MultiTelas.'),
  ].filter(Boolean);
  return '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>' +
    '<body style="margin:0;padding:0;background:#f5f7fa">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f5f7fa"><tr><td align="center" style="padding:24px 12px">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px">' +
    '<tr><td style="padding:0 4px 14px;font-family:' + LETRA + ';font-size:18px;font-weight:700;color:#0e0b1f">' + logo + '<span style="vertical-align:middle">MultiTelas</span></td></tr>' +
    '<tr><td style="background:#ffffff;border:1px solid #e3e7ed;border-radius:12px;padding:28px 24px;font-family:' + LETRA + ';color:#0f172a">' + corpo + '</td></tr>' +
    '<tr><td style="padding:16px 8px 0;font-family:' + LETRA + ';font-size:12px;line-height:1.6;color:#64748b;text-align:center">' + linhas.join('<br>') + '</td></tr>' +
    '</table></td></tr></table></body></html>';
}

// Modelo do e-mail de recuperação de senha.
function resetEmail(link) {
  const text = 'Você pediu para redefinir sua senha no MultiTelas.\n\nAbra este link (vale por 1 hora):\n' + link +
    '\n\nSe não foi você, ignore esta mensagem — sua senha continua a mesma.';
  const html = moldura(`
  <h1 style="font-size:18px;margin:0 0 12px">Redefinir sua senha</h1>
  <p style="font-size:14px;line-height:1.6;margin:0 0 20px;color:#334155">Você pediu para redefinir sua senha no MultiTelas. O link vale por 1 hora.</p>
  <p style="margin:0 0 24px"><a href="${link}" style="display:inline-block;background:#5B2EFF;color:#fff;text-decoration:none;font-size:14px;font-weight:600;padding:11px 20px;border-radius:8px">Criar nova senha</a></p>
  <p style="font-size:12px;line-height:1.6;color:#64748b;margin:0">Se o botão não funcionar, copie e cole no navegador:<br><span style="word-break:break-all">${link}</span></p>
  <p style="font-size:12px;line-height:1.6;color:#64748b;margin:16px 0 0">Se não foi você, ignore esta mensagem — sua senha continua a mesma.</p>
`, { base: link });
  return { subject: 'Redefinir sua senha · MultiTelas', html, text };
}


function verifyEmail(link) {
  const text = 'Bem-vindo ao MultiTelas! Confirme seu e-mail clicando neste link:\n\n' + link +
    '\n\nSe não foi você, ignore esta mensagem.';
  const html = moldura(
  '<h1 style="font-size:18px;margin:0 0 12px">Confirme seu e-mail</h1>' +
  '<p style="font-size:14px;line-height:1.6;margin:0 0 20px;color:#334155">Falta só um clique para começar a usar o MultiTelas.</p>' +
  '<p style="margin:0 0 24px"><a href="' + link + '" style="display:inline-block;background:#5B2EFF;color:#fff;text-decoration:none;font-size:14px;font-weight:600;padding:11px 20px;border-radius:8px">Confirmar e-mail</a></p>' +
  '<p style="font-size:12px;line-height:1.6;color:#64748b;margin:0">Ou copie e cole no navegador:<br><span style="word-break:break-all">' + link + '</span></p>',
  { base: link });
  // QA de 03/11: o mesmo separador dos outros assuntos ("Redefinir sua senha · MultiTelas").
  return { subject: 'Confirme seu e-mail · MultiTelas', html, text };
}

module.exports = { send, provider, configured, resetEmail, verifyEmail, moldura };
