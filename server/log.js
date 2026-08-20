/*
 * server/log.js — uma linha por acontecimento, no formato que a máquina lê.
 *
 * O QUE ISTO CONSERTA
 *
 * O sistema falava por `console.warn('[api]', e.message)` espalhado em quinze
 * lugares. Três problemas nisso, e os três só aparecem quando um cliente
 * liga reclamando:
 *
 *   1. Perdia a pilha. `e.message` é "Cannot read properties of undefined" —
 *      informação suficiente para saber que quebrou, nenhuma para saber onde.
 *   2. Perdia o contexto. Qual rota? Qual conta? Qual tela? Sem isso não dá
 *      para reproduzir, e o que não se reproduz não se conserta.
 *   3. Não dava para filtrar. Texto solto no log do Railway não responde
 *      "quantas vezes isso aconteceu hoje" nem "só na conta tal".
 *
 * O FORMATO MUDA COM O LUGAR, de propósito. Na nuvem sai JSON, uma linha por
 * evento, porque é o que a plataforma de log indexa e filtra. Na máquina de
 * quem desenvolve sai texto colorido e curto, porque JSON de uma linha é
 * ilegível para olho humano e desenvolvedor que não lê o log não conserta nada.
 *
 * DADO PESSOAL NÃO ENTRA. Log vive anos, é copiado para backup, aparece no
 * painel do provedor e é lido por quem der suporte. Um e-mail inteiro no log é
 * dado pessoal fora do controle do titular — o oposto do que a LGPD pede, e
 * o oposto do que este sistema promete em Termos. Por isso e-mail sai
 * mascarado e qualquer campo com cara de segredo sai como '[oculto]'.
 */

const NIVEIS = { debug: 10, info: 20, aviso: 30, erro: 40 };

function naNuvem() {
  return !!(process.env.RAILWAY_ENVIRONMENT || process.env.DYNO || process.env.RENDER);
}

/*
 * JSON na nuvem, texto na mesa. `LOG_FORMATO` existe para poder testar o
 * formato de produção sem fingir ser o Railway.
 */
function formato() {
  const f = String(process.env.LOG_FORMATO || '').toLowerCase();
  if (f === 'json' || f === 'texto') return f;
  return naNuvem() ? 'json' : 'texto';
}

function nivelMinimo() {
  const n = String(process.env.LOG_NIVEL || '').toLowerCase();
  return NIVEIS[n] || NIVEIS.info;
}

/*
 * Campos que nunca saem por inteiro. A lista é por SUBSTRING do nome, não por
 * nome exato: `token`, `deviceToken`, `refresh_token` e `tokenDeSessao` são o
 * mesmo risco, e quem inventar o próximo nome não vai lembrar de vir aqui.
 */
const SEGREDOS = ['senha', 'password', 'token', 'secret', 'chave', 'key', 'authorization', 'cookie', 'passe', 'pin'];

function ehSegredo(nome) {
  const n = String(nome).toLowerCase();
  return SEGREDOS.some((s) => n.includes(s));
}

/*
 * E-mail vira 'th***@gmail.com': o bastante para o suporte casar duas linhas
 * do mesmo cliente, longe do bastante para o log virar lista de contatos.
 * O domínio fica porque é o que ajuda a reconhecer conta corporativa, e não
 * identifica ninguém sozinho.
 */
function mascararEmail(v) {
  const m = /^([^@\s]+)@([^@\s]+)$/.exec(String(v));
  if (!m) return v;
  const [, usuario, dominio] = m;
  return usuario.slice(0, 2) + '***@' + dominio;
}

function limpar(valor, profundidade) {
  if (valor == null) return valor;
  if (typeof valor === 'string') return valor.includes('@') ? mascararEmail(valor) : valor;
  if (typeof valor !== 'object') return valor;
  if (profundidade > 4) return '[fundo demais]';
  if (Array.isArray(valor)) return valor.slice(0, 20).map((v) => limpar(v, profundidade + 1));
  const out = {};
  for (const [k, v] of Object.entries(valor)) {
    out[k] = ehSegredo(k) ? '[oculto]' : limpar(v, profundidade + 1);
  }
  return out;
}

/*
 * A pilha é cortada nas 6 primeiras linhas e as de node:internal saem fora.
 * Uma pilha inteira de Node tem 30 linhas e as últimas 24 são sempre as
 * mesmas — ruído que empurra a linha útil para fora da tela de quem lê.
 */
function pilha(err) {
  if (!err || !err.stack) return undefined;
  return String(err.stack)
    .split('\n')
    .filter((l) => !l.includes('node:internal'))
    .slice(0, 6)
    .map((l) => l.trim())
    .join(' | ');
}

const CORES = { debug: '\x1b[90m', info: '\x1b[36m', aviso: '\x1b[33m', erro: '\x1b[31m' };

function escrever(nivel, evento, dados) {
  if (NIVEIS[nivel] < nivelMinimo()) return;
  const linha = { t: new Date().toISOString(), nivel, evento, ...limpar(dados || {}, 0) };
  const saida = nivel === 'erro' ? console.error : nivel === 'aviso' ? console.warn : console.log;

  if (formato() === 'json') {
    // Uma linha, sempre: log multi-linha é o que quebra o parser da plataforma.
    saida(JSON.stringify(linha));
    return;
  }
  const { t, nivel: _n, evento: _e, ...resto } = linha;
  const extra = Object.keys(resto).length ? ' ' + JSON.stringify(resto) : '';
  saida(`${CORES[nivel] || ''}${t.slice(11, 19)} ${nivel.padEnd(5)} ${evento}\x1b[0m${extra}`);
}

const log = {
  debug: (evento, dados) => escrever('debug', evento, dados),
  info: (evento, dados) => escrever('info', evento, dados),
  aviso: (evento, dados) => escrever('aviso', evento, dados),
  /*
   * Erro sempre recebe o objeto Error, não a mensagem. É a diferença entre
   * "algo quebrou" e "quebrou nesta linha deste arquivo" — e a razão de este
   * módulo existir.
   */
  erro: (evento, err, dados) => escrever('erro', evento, {
    ...dados,
    erro: err && (err.message || String(err)),
    tipo: err && err.constructor && err.constructor.name,
    pilha: pilha(err),
  }),
};

module.exports = { log, mascararEmail, pilha, formato, ehSegredo, limpar };
