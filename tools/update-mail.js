const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '../server/mail.js');
let code = fs.readFileSync(file, 'utf8');

const verifyCode = `
function verifyEmail(link) {
  const text = 'Bem-vindo ao MultiTelas! Confirme seu e-mail clicando neste link:\\n\\n' + link +
    '\\n\\nSe não foi você, ignore esta mensagem.';
  const html = '<div style="font-family:system-ui,-apple-system,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#0f172a">' +
  '<h1 style="font-size:18px;margin:0 0 12px">Confirme seu e-mail</h1>' +
  '<p style="font-size:14px;line-height:1.6;margin:0 0 20px;color:#334155">Falta só um clique para começar a usar o MultiTelas.</p>' +
  '<p style="margin:0 0 24px"><a href="' + link + '" style="display:inline-block;background:#2f6feb;color:#fff;text-decoration:none;font-size:14px;font-weight:600;padding:11px 20px;border-radius:8px">Verificar e-mail</a></p>' +
  '<p style="font-size:12px;line-height:1.6;color:#64748b;margin:0">Ou copie e cole no navegador:<br><span style="word-break:break-all">' + link + '</span></p>' +
  '</div>';
  return { subject: 'Confirme seu e-mail - MultiTelas', html, text };
}
`;

code = code.replace('module.exports = {', verifyCode + '\nmodule.exports = {');
code = code.replace('resetEmail };', 'resetEmail, verifyEmail };');
fs.writeFileSync(file, code);
console.log('mail.js updated');
