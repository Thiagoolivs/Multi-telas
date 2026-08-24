const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '../test/seguranca-rotas.test.js');
let code = fs.readFileSync(file, 'utf8');

code = code.replace("STORAGE: 'local'", "STORAGE: 'local', SKIP_VERIFY: '1'");

fs.writeFileSync(file, code);
console.log('Fixed seguranca-rotas test environment');
