/*
 * tools/conferir-config.mjs — prova que a configuração FUNCIONA, não que existe.
 *
 * O diagnóstico do painel confere se as variáveis estão definidas. Isso não é
 * a mesma pergunta: chave revogada, domínio não verificado, token do webhook
 * diferente do que está cadastrado no Asaas e ambiente trocado passam todos
 * pela conferência de "está definida" e falham na hora H — no cadastro de um
 * cliente ou numa cobrança.
 *
 * Aqui as chaves são USADAS contra os serviços de verdade. Nada é criado nem
 * cobrado: só leitura, mais um e-mail de teste se você pedir.
 *
 *   node tools/conferir-config.mjs
 *   node tools/conferir-config.mjs --email seu@endereco.com
 *
 * As variáveis são lidas do ambiente. Para conferir a produção de fora dela:
 *   RESEND_API_KEY=... ASAAS_API_KEY=... node tools/conferir-config.mjs
 */

const env = process.env;
const alvoEmail = (() => {
  const i = process.argv.indexOf('--email');
  return i > 0 ? process.argv[i + 1] : '';
})();

const VERDE = '\x1b[32m', VERMELHO = '\x1b[31m', AMARELO = '\x1b[33m', CINZA = '\x1b[90m', FIM = '\x1b[0m';
let problemas = 0;

function ok(t, d) { console.log(`${VERDE}  ok${FIM}   ${t}${d ? CINZA + ' — ' + d + FIM : ''}`); }
function erro(t, d) { problemas++; console.log(`${VERMELHO}  ERRO${FIM} ${t}${d ? '\n       ' + d : ''}`); }
function aviso(t, d) { console.log(`${AMARELO}  !${FIM}    ${t}${d ? '\n       ' + d : ''}`); }
function titulo(t) { console.log(`\n${t}`); }

/*
 * Um pedaço do corpo, quando o status sozinho não explica.
 *
 * "HTTP 422" não diz nada a quem está configurando; a mensagem do provedor
 * quase sempre diz. Curto de propósito: isto vai para o terminal de alguém
 * que quer uma linha, não um dump.
 */
async function corpoCurto(r) {
  try { return (await r.text()).replace(/\s+/g, ' ').slice(0, 200); } catch (_) { return ''; }
}

// Prazo em tudo: serviço fora do ar não pode pendurar a conferência.
async function buscar(url, opcoes) {
  return fetch(url, { ...opcoes, signal: AbortSignal.timeout(20000) });
}

/* ---------------- Resend ---------------- */
async function conferirResend() {
  titulo('E-mail (Resend)');
  const chave = env.RESEND_API_KEY || '';
  if (!chave) {
    if (env.BREVO_API_KEY) { aviso('Usando Brevo, não Resend.', 'Esta conferência cobre só o Resend por enquanto.'); return; }
    erro('RESEND_API_KEY não definida.', 'Sem provedor, o link de confirmação só vai para o log e ninguém termina o cadastro.');
    return;
  }
  if (!chave.startsWith('re_')) aviso('A chave não começa com "re_".', 'Chave do Resend normalmente começa assim — confira se não colou a errada.');

  let r;
  try { r = await buscar('https://api.resend.com/domains', { headers: { authorization: 'Bearer ' + chave } }); }
  catch (e) { erro('Não consegui falar com o Resend.', e.message); return; }

  if (r.status === 401 || r.status === 403) {
    erro('O Resend recusou a chave (HTTP ' + r.status + ').',
      'Chave inválida, revogada, ou sem permissão. Se você está rodando isto de dentro de uma rede '
      + 'com proxy de saída, confira antes se o proxy não é quem está recusando.');
    return;
  }
  if (!r.ok) { erro('Resend respondeu HTTP ' + r.status + '.', await corpoCurto(r)); return; }
  ok('A chave é aceita pelo Resend.');

  const dados = await r.json().catch(() => ({}));
  const dominios = dados.data || [];
  const verificados = dominios.filter((d) => d.status === 'verified');

  if (!dominios.length) {
    erro('Nenhum domínio cadastrado no Resend.',
      'Sem domínio verificado, o Resend só entrega para o e-mail da SUA conta — dá para testar, não dá para lançar.');
  } else if (!verificados.length) {
    erro('Nenhum domínio VERIFICADO: ' + dominios.map((d) => d.name + ' (' + d.status + ')').join(', '),
      'Falta terminar o DNS. Enquanto isso, só chega no seu próprio e-mail.');
  } else {
    ok('Domínio verificado: ' + verificados.map((d) => d.name).join(', '));
  }

  /*
   * O remetente tem que ser DO domínio verificado. É o erro mais comum e o
   * mais silencioso: o provedor recusa a mensagem e a pessoa fica esperando.
   */
  const de = env.MAIL_FROM || '';
  if (!de) {
    erro('MAIL_FROM não definida.', 'O Resend recusa a mensagem por falta de remetente.');
  } else {
    const endereco = (de.match(/<([^>]+)>/) || [null, de])[1].trim();
    const dominioDoFrom = endereco.split('@')[1] || '';
    if (verificados.length && !verificados.some((d) => dominioDoFrom.endsWith(d.name))) {
      erro('MAIL_FROM usa "' + dominioDoFrom + '", que não é um domínio verificado.',
        'Verificados: ' + verificados.map((d) => d.name).join(', ') + '. O envio vai ser recusado.');
    } else {
      ok('MAIL_FROM confere com o domínio.', endereco);
    }
  }

  if (alvoEmail) {
    let envio;
    try {
      envio = await buscar('https://api.resend.com/emails', {
        method: 'POST',
        headers: { authorization: 'Bearer ' + chave, 'content-type': 'application/json' },
        body: JSON.stringify({
          from: de, to: [alvoEmail],
          subject: 'MultiTelas — teste de configuração',
          text: 'Se você está lendo isto, o envio de e-mail do MultiTelas está funcionando.',
        }),
      });
    } catch (e) { erro('Falha ao enviar o e-mail de teste.', e.message); return; }
    if (envio.ok) ok('E-mail de teste enviado para ' + alvoEmail + '.', 'Confira a caixa, e o spam.');
    else {
      const d = await envio.json().catch(() => ({}));
      erro('O Resend recusou o envio (HTTP ' + envio.status + ').', d.message || d.error || '');
    }
  } else {
    aviso('Nenhum e-mail de teste enviado.', 'Rode com --email seu@endereco.com para provar a entrega de ponta a ponta.');
  }
}

/* ---------------- Asaas ---------------- */
async function conferirAsaas() {
  titulo('Cobrança (Asaas)');
  const chave = env.ASAAS_API_KEY || '';
  const token = env.ASAAS_WEBHOOK_TOKEN || '';
  const sandbox = String(env.ASAAS_AMBIENTE || '').toLowerCase() === 'sandbox';
  const api = sandbox ? 'https://api-sandbox.asaas.com/v3' : 'https://api.asaas.com/v3';

  if (!chave) {
    erro('ASAAS_API_KEY não definida.',
      'O checkout roda em modo SIMULADO: quem clicar em assinar ganha o plano pago sem pagar.');
    return;
  }
  console.log(`${CINZA}       ambiente: ${sandbox ? 'SANDBOX (nada é cobrado)' : 'PRODUÇÃO'}${FIM}`);

  /*
   * A chave da sandbox e a de produção são diferentes, e usar uma na outra dá
   * 401 — que é exatamente o sintoma de "chave errada". Vale dizer qual foi.
   */
  let r;
  try { r = await buscar(api + '/myAccount', { headers: { access_token: chave, 'User-Agent': 'Multi-telas' } }); }
  catch (e) { erro('Não consegui falar com o Asaas.', e.message); return; }

  /*
   * 401 e 403 juntos de propósito: o Asaas usa os dois para credencial
   * recusada, e tratar só um deixaria o caso mais provável — chave de sandbox
   * usada em produção — cair no genérico, sem dizer o que fazer.
   */
  if (r.status === 401 || r.status === 403) {
    erro('O Asaas recusou a chave (HTTP ' + r.status + ').',
      (sandbox ? 'Você está apontando para a SANDBOX — a chave tem que ser a de sandbox.'
               : 'Você está apontando para PRODUÇÃO — chave de sandbox não vale aqui. Para testar, defina ASAAS_AMBIENTE=sandbox.')
      + ' Se você está atrás de um proxy de saída, confira antes se não é ele que está recusando.');
    return;
  }
  if (!r.ok) { erro('Asaas respondeu HTTP ' + r.status + '.', await corpoCurto(r)); return; }

  const conta = await r.json().catch(() => ({}));
  ok('A chave é aceita pelo Asaas.', [conta.name, conta.email].filter(Boolean).join(' · '));

  if (!token) {
    erro('ASAAS_WEBHOOK_TOKEN não definida.',
      'O cliente paga e o plano NUNCA é liberado: o aviso de pagamento chega e é recusado. Dinheiro entra, produto não.');
  }

  /*
   * O webhook é a metade que ninguém lembra de conferir. Sem ele, criar a
   * assinatura funciona, o cliente paga, e o plano não é liberado nunca — a
   * falha aparece só depois do dinheiro ter saído da conta de alguém.
   */
  let w;
  try { w = await buscar(api + '/webhooks', { headers: { access_token: chave, 'User-Agent': 'Multi-telas' } }); }
  catch (e) { aviso('Não consegui listar os webhooks.', e.message); return; }

  if (!w.ok) { aviso('Não consegui listar os webhooks (HTTP ' + w.status + ').'); return; }
  const hooks = (await w.json().catch(() => ({}))).data || [];
  const appUrl = (env.APP_URL || '').replace(/\/$/, '');
  const esperado = appUrl ? appUrl + '/api/billing/webhook' : '';

  if (!hooks.length) {
    erro('Nenhum webhook cadastrado no Asaas.',
      esperado ? 'Cadastre um apontando para ' + esperado
               : 'Cadastre um apontando para SEU_ENDERECO/api/billing/webhook (e defina APP_URL).');
  } else {
    const certo = esperado && hooks.find((h) => String(h.url || '').replace(/\/$/, '') === esperado);
    if (certo) {
      ok('Webhook apontando para o endereço certo.', certo.url);
      if (certo.enabled === false) erro('...mas está DESATIVADO no Asaas.', 'Nenhum aviso de pagamento chega.');
      // Estes quatro são os que o servidor trata. Sem eles, o plano não muda.
      const precisa = ['PAYMENT_RECEIVED', 'PAYMENT_CONFIRMED', 'PAYMENT_OVERDUE', 'SUBSCRIPTION_DELETED'];
      const tem = certo.events || [];
      const faltam = precisa.filter((e) => !tem.includes(e));
      if (faltam.length) {
        erro('Faltam eventos no webhook: ' + faltam.join(', '),
          'PAYMENT_RECEIVED e PAYMENT_CONFIRMED são os que LIBERAM o plano — sem eles ninguém recebe o que pagou.');
      } else {
        ok('Os quatro eventos que o servidor trata estão marcados.');
      }
    } else {
      erro('Nenhum webhook aponta para ' + (esperado || 'o endereço do app') + '.',
        'Cadastrados: ' + hooks.map((h) => h.url).join(', '));
    }
  }
}

/* ---------------- Endereço público ---------------- */
function conferirEndereco() {
  titulo('Endereço público');
  const url = env.APP_URL || '';
  if (!url) {
    erro('APP_URL não definida.',
      'É dela que sai o link do e-mail de confirmação. Sem ela o endereço é montado pelo cabeçalho da requisição, que atrás de proxy pode sair errado — e link errado é cadastro perdido.');
    return;
  }
  if (!url.startsWith('https://')) erro('APP_URL não começa com https://.', 'Cookie de sessão só viaja em conexão segura.');
  else ok('APP_URL definida.', url);
}

const inicio = Date.now();
console.log('Conferindo a configuração do MultiTelas contra os serviços de verdade.');
await conferirEndereco();
await conferirResend();
await conferirAsaas();

console.log('');
if (problemas === 0) console.log(`${VERDE}Tudo conferido, nada quebrado.${FIM} (${Date.now() - inicio}ms)`);
else console.log(`${VERMELHO}${problemas} problema(s).${FIM} Cada um está explicado acima, com a consequência.`);
process.exit(problemas ? 1 : 0);
