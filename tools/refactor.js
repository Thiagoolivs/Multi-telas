const fs = require('fs');
const path = require('path');

let code = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');

const helpers = `
module.exports = function(ctx) {
  const { 
    db, auth, storage, midia, reconectar, usoIA, creditos, security, log, erros, diagnostico, mail, plans, billing, ai, director, site, operadores, cortesia, limites, passes, metricas, ds, jobs, legal, seasons, schema, briefing, memory, muralLib, qrcode,
    baseUrl, sendJson, readBody, emTrabalho, validEmail, reqOrigin, readRawBody, brl, googleEnabled, canManageTeam, normBirthday, lerImagens, avisarTelas, clientIp, rateLimit, crypto
  } = ctx;
  
  return async function(req, res, parts, query, sess) {
`;

function extract(startStr, endStr, routeName) {
  const startIdx = code.indexOf(startStr);
  const endIdx = code.indexOf(endStr, startIdx);
  if (startIdx === -1 || endIdx === -1) {
    console.log('Could not find bounds for ' + routeName);
    return;
  }
  
  const block = code.substring(startIdx, endIdx);
  const out = helpers + '    ' + block.trim().replace(/\n/g, '\n    ') + '\n    return true;\n  };\n};\n';
  
  fs.writeFileSync(path.join(__dirname, '../server/routes/' + routeName + '.js'), out);
  
  code = code.substring(0, startIdx) + 
         `    if (await ctx.routes.${routeName}(req, res, parts, query, sess)) return;\n\n    ` + 
         code.substring(endIdx);
}

// 1. Auth
extract('/* ----- Auth ----- */', '/* ----- Equipe (multi-usuário + permissões) ----- */', 'auth');
// 2. Team
extract('/* ----- Equipe (multi-usuário + permissões) ----- */', '/* ----- Billing / planos ----- */', 'team');

const ctxStr = `
  const ctx = {
    db, auth, storage, midia, reconectar, usoIA, creditos, security, log, erros, diagnostico, mail, plans, billing, ai, director, site, operadores, cortesia, limites, passes, metricas, ds, jobs, legal, seasons, schema, briefing, memory, muralLib, qrcode,
    baseUrl, sendJson, readBody, emTrabalho, validEmail, reqOrigin, readRawBody, brl, googleEnabled, canManageTeam, normBirthday, lerImagens, avisarTelas, clientIp, rateLimit, crypto
  };
  ctx.routes = {
    auth: require('./server/routes/auth')(ctx),
    team: require('./server/routes/team')(ctx)
  };
`;

code = code.replace('async function handleApi(req, res, pathname, query) {', 'async function handleApi(req, res, pathname, query) {' + ctxStr);

fs.writeFileSync(path.join(__dirname, '../server.js'), code);
console.log('Refactoring done.');
