/*
 * server/senha.js — a chamada de senha da Saúde (fase 12 do plano de ação).
 *
 * A recepção chama a próxima senha pelo celular ou pelo computador e a TV da
 * sala de espera mostra a senha em tamanho gigante, o guichê ou consultório
 * e as três chamadas anteriores. NUNCA o nome do paciente.
 *
 * Por isso o lugar não é texto livre: é um tipo da lista abaixo e um número
 * ("Consultório 3"). Um campo de texto convidaria a digitar "Dona Maria" e
 * a TV escreveria o nome na parede da recepção. Com tipo e número, não há
 * onde pôr um nome — nem no banco.
 *
 * Aqui só a regra, sem banco e sem rede (server/routes/senha.js usa; os
 * testes também).
 */
'use strict';

// O que a recepção escolhe. `curto` é o da lista de chamadas anteriores, que é estreita.
const LOCAIS = {
  guiche: { nome: 'Guichê', curto: 'Guichê' },
  consultorio: { nome: 'Consultório', curto: 'Cons.' },
  sala: { nome: 'Sala', curto: 'Sala' },
  triagem: { nome: 'Triagem', curto: 'Triagem' },
  caixa: { nome: 'Caixa', curto: 'Caixa' },
  mesa: { nome: 'Mesa', curto: 'Mesa' },
};
const NUMERO_MAX = 999;
const LOCAL_MAX = 99;
// Quantas chamadas anteriores a TV mostra.
const ANTERIORES = 3;
const FUSO_PADRAO = 'America/Sao_Paulo';

/* "Consultório 3": tipo da lista e número de 0 a 99 (0 = sem número, como "Triagem"). Fora disso, null. */
function localDe(l) {
  if (!l || typeof l !== 'object') return null;
  const tipo = String(l.tipo || '');
  if (!Object.prototype.hasOwnProperty.call(LOCAIS, tipo)) return null;
  const n = l.numero === undefined || l.numero === null || l.numero === '' ? 0 : Number(l.numero);
  if (!Number.isInteger(n) || n < 0 || n > LOCAL_MAX) return null;
  const L = LOCAIS[tipo];
  return { tipo, numero: n, nome: n ? L.nome + ' ' + n : L.nome, curto: n ? L.curto + ' ' + n : L.curto };
}

// Uma letra de A a Z, ou nenhuma. "p" vira "P".
function prefixoDe(p) {
  const s = String(p == null ? '' : p).trim().toUpperCase();
  if (!s) return '';
  return /^[A-Z]$/.test(s) ? s : null;
}

function numeroDe(n) {
  const v = Number(n);
  return Number.isInteger(v) && v >= 1 && v <= NUMERO_MAX ? v : null;
}

// "A 042": a letra, um espaço e o número com três dígitos (como no papel da senha).
function senhaTexto(prefixo, numero) {
  const n = String(numero).padStart(3, '0');
  return prefixo ? prefixo + ' ' + n : n;
}

// O grupo de TVs, com a mesma limpeza do servidor ao gravar o grupo da TV (server/routes/telas.js).
function grupoDe(g) {
  return String(g == null ? '' : g).replace(/\s+/g, ' ').trim().slice(0, 60);
}

/*
 * O dia NA LOJA ("2026-11-06"). O servidor roda em UTC: às 22h de São Paulo
 * já é amanhã em UTC, e a senha do fim do expediente voltaria a 001.
 */
const formatadores = {};
function diaNaLoja(ms, fuso) {
  let f = formatadores[fuso || FUSO_PADRAO];
  if (!f) {
    try { f = new Intl.DateTimeFormat('en-CA', { timeZone: fuso || FUSO_PADRAO, year: 'numeric', month: '2-digit', day: '2-digit' }); }
    catch (e) { f = new Intl.DateTimeFormat('en-CA', { timeZone: FUSO_PADRAO, year: 'numeric', month: '2-digit', day: '2-digit' }); }
    formatadores[fuso || FUSO_PADRAO] = f;
  }
  return f.format(new Date(ms));
}

// O fuso da loja: o do horário de alguma TV da conta (js/expediente.js), ou o de São Paulo.
function fusoDasTelas(telas) {
  for (const d of telas || []) {
    let e = d && d.expediente;
    if (typeof e === 'string') { try { e = JSON.parse(e); } catch (x) { e = null; } }
    if (e && typeof e.fuso === 'string' && e.fuso) {
      try { new Intl.DateTimeFormat('en-US', { timeZone: e.fuso }); return e.fuso; } catch (x) { /* fuso inválido: o próximo */ }
    }
  }
  return FUSO_PADRAO;
}

// Uma chamada como a TV e o painel leem. Sem nada além de senha, lugar e hora.
function publico(c) {
  if (!c) return null;
  const local = localDe({ tipo: c.local_tipo, numero: c.local_num }) || { nome: '', curto: '' };
  return {
    id: c.id,
    senha: senhaTexto(c.prefixo || '', c.numero),
    prefixo: c.prefixo || '',
    numero: Number(c.numero),
    local: local.nome,
    localCurto: local.curto,
    grupo: c.grupo || '',
    rechamada: c.tipo === 'rechamada',
    em: Number(c.em),
  };
}

/*
 * O que a TV mostra, das chamadas do dia (a mais nova primeiro): a atual e
 * as três anteriores. A senha chamada de novo não aparece duas vezes — nem
 * como atual e anterior, nem duas vezes nas anteriores.
 */
function estadoDe(chamadas, agora) {
  const lista = (chamadas || []).slice().sort((a, b) => Number(b.em) - Number(a.em)).map(publico);
  const atual = lista[0] || null;
  const vistas = new Set(atual ? [atual.senha] : []);
  const anteriores = [];
  for (let i = 1; i < lista.length && anteriores.length < ANTERIORES; i++) {
    if (vistas.has(lista[i].senha)) continue;
    vistas.add(lista[i].senha);
    anteriores.push(lista[i]);
  }
  return { atual, anteriores, agora: Number(agora) || Date.now() };
}

module.exports = {
  LOCAIS, NUMERO_MAX, LOCAL_MAX, ANTERIORES, FUSO_PADRAO,
  localDe, prefixoDe, numeroDe, senhaTexto, grupoDe, diaNaLoja, fusoDasTelas, publico, estadoDe,
};
