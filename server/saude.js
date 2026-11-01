/*
 * server/saude.js — "o servidor está de pé?", para o Railway e para gente.
 *
 * O QA de 26/10 viu quatro merges direto em produção num dia e um deploy que
 * falhou em silêncio ("só foi visto porque alguém olhou"). Duas peças aqui:
 *
 *   1. GET /saude — responde 200 quando o processo atende E o banco responde;
 *      503 quando o banco não responde. O railway.json manda o Railway esperar
 *      esta rota antes de trocar a versão: um deploy que sobe mas não fala com
 *      o banco não substitui o que está no ar, e o Railway marca a falha.
 *   2. O aviso de "versão no ar" — no mesmo webhook dos erros
 *      (ALERTA_WEBHOOK_URL), uma vez por processo. Um deploy que não manda
 *      este aviso em alguns minutos é um deploy que não subiu; um que manda
 *      vários seguidos é um processo reiniciando em laço.
 *
 * A resposta não diz nada de dentro: nem versão de banco, nem caminho, nem
 * contagem. É pública porque o Railway não manda cookie.
 */
'use strict';

const { log } = require('./log.js');

const PRAZO_MS = 3000;

function comPrazo(promessa, ms) {
  let t;
  return Promise.race([
    promessa,
    new Promise((_, rej) => { t = setTimeout(() => rej(new Error('prazo')), ms); }),
  ]).finally(() => clearTimeout(t));
}

async function verificar(db) {
  try {
    // A consulta mais barata que passa pelo banco de verdade (tenant que não existe).
    await comPrazo(Promise.resolve(db.countDevices('__saude__')), PRAZO_MS);
    return { status: 200, corpo: { ok: true, banco: 'ok' } };
  } catch (e) {
    return { status: 503, corpo: { ok: false, banco: 'sem resposta' } };
  }
}

function versao(env) {
  const e = env || process.env;
  const sha = e.RAILWAY_GIT_COMMIT_SHA || e.SOURCE_COMMIT || '';
  return sha ? sha.slice(0, 7) : 'local';
}

/* "MultiTelas no ar: versão abc1234 (us-east4)" — só em produção e só com o webhook definido. */
async function avisarNoAr(env) {
  const e = env || process.env;
  const url = e.ALERTA_WEBHOOK_URL;
  // As duas: o Railway novo define RAILWAY_ENVIRONMENT_NAME; o antigo, RAILWAY_ENVIRONMENT (como em server/billing.js).
  const ambiente = e.RAILWAY_ENVIRONMENT_NAME || e.RAILWAY_ENVIRONMENT;
  if (!url || !ambiente) return false;
  const regiao = e.RAILWAY_REPLICA_REGION || '';
  const texto = '🟢 MultiTelas no ar: versão ' + versao(e) + (regiao ? ' (' + regiao + ')' : '')
    + (ambiente !== 'production' ? ' · ambiente ' + ambiente : '');
  try {
    const ac = new AbortController();
    const corta = setTimeout(() => ac.abort(), 5000);
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: texto, deploy: { versao: versao(e), regiao, ambiente } }),
      signal: ac.signal,
    }).finally(() => clearTimeout(corta));
    return true;
  } catch (err) {
    log.aviso('alerta.no-ar-falhou', { motivo: err.message });
    return false;
  }
}

module.exports = { verificar, versao, avisarNoAr };
