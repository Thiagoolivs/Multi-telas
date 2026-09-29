/*
 * O código do servidor inteiro, como texto: server.js mais as rotas que
 * saíram dele para server/routes/. Os testes que conferem "a rota X existe e
 * faz Y" pelo texto leem daqui — senão, cada extração de rota quebraria um
 * teste que não mudou de assunto, só de arquivo.
 */
const fs = require('node:fs');
const path = require('node:path');

const RAIZ = path.join(__dirname, '..');

function fonteDoServidor() {
  const rotas = path.join(RAIZ, 'server', 'routes');
  const partes = [fs.readFileSync(path.join(RAIZ, 'server.js'), 'utf8')];
  for (const f of fs.readdirSync(rotas).sort()) {
    if (f.endsWith('.js')) partes.push(fs.readFileSync(path.join(rotas, f), 'utf8'));
  }
  return partes.join('\n');
}

module.exports = { fonteDoServidor };
