const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '../test/cortesia.test.js');
let code = fs.readFileSync(file, 'utf8');

code = code.replace(
  "const SERVER = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');",
  "const SERVER = fs.readFileSync(path.join(__dirname, '..', 'server', 'routes', 'auth.js'), 'utf8');"
);

fs.writeFileSync(file, code);
console.log('Fixed cortesia.test.js');
