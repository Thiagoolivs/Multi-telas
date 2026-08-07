/*
 * server/qr.js — gerador de QR Code próprio (byte mode, correção M, versões 1–10).
 *
 * Por que escrever isto em vez de usar uma API pronta: o QR do mural leva o
 * endereço para onde as pessoas mandam FOTO. Pedir esse desenho a um servidor
 * de terceiros significa contar a ele, a cada carregamento, qual empresa está
 * com qual mural aberto — e ficar sem QR quando aquele serviço cair. O player
 * também roda em TV com rede ruim: um domínio a menos é uma falha a menos.
 *
 * Cobre versões 1 a 10 no nível M, ou seja, até 213 bytes. Uma URL de mural tem
 * uns 40. Se um dia não couber, `svg()` avisa em vez de desenhar errado.
 */

/* ---------------- Aritmética de Galois GF(256) ---------------- */
const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
(function tabelas() {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;          // polinômio primitivo do padrão
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
})();
function mul(a, b) { return (a === 0 || b === 0) ? 0 : EXP[LOG[a] + LOG[b]]; }

// Polinômio gerador de grau n: ∏(x − α^i).
function gerador(n) {
  let g = [1];
  for (let i = 0; i < n; i++) {
    const ng = new Array(g.length + 1).fill(0);
    for (let j = 0; j < g.length; j++) {
      ng[j] ^= g[j];
      ng[j + 1] ^= mul(g[j], EXP[i]);
    }
    g = ng;
  }
  return g;
}

// Reed-Solomon: resto da divisão dos dados pelo gerador.
function corrigir(dados, n) {
  const g = gerador(n);
  const r = dados.slice().concat(new Array(n).fill(0));
  for (let i = 0; i < dados.length; i++) {
    const c = r[i];
    if (!c) continue;
    for (let j = 0; j < g.length; j++) r[i + j] ^= mul(g[j], c);
  }
  return r.slice(dados.length);
}

/*
 * Estrutura de cada versão no nível M:
 * [total de codewords, correção por bloco, blocos G1, dados G1, blocos G2, dados G2]
 */
const VERSOES = {
  1: [26, 10, 1, 16, 0, 0],
  2: [44, 16, 1, 28, 0, 0],
  3: [70, 26, 1, 44, 0, 0],
  4: [100, 18, 2, 32, 0, 0],
  5: [134, 24, 2, 43, 0, 0],
  6: [172, 16, 4, 27, 0, 0],
  7: [196, 18, 4, 31, 0, 0],
  8: [242, 22, 2, 38, 2, 39],
  9: [292, 22, 3, 36, 2, 37],
  10: [346, 26, 4, 43, 1, 44],
};
const ALINHAMENTO = {
  1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30],
  6: [6, 34], 7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50],
};
// Bits soltos no fim da área de dados, que não formam codeword.
const RESTO = { 1: 0, 2: 7, 3: 7, 4: 7, 5: 7, 6: 7, 7: 0, 8: 0, 9: 0, 10: 0 };

function dadosDaVersao(v) {
  const [total, ec, b1, d1, b2, d2] = VERSOES[v];
  return { total, ec, b1, d1, b2, d2, codewords: b1 * d1 + b2 * d2 };
}
// Quantos bytes cabem: sobra dos codewords de dados menos o cabeçalho.
function capacidade(v) {
  const { codewords } = dadosDaVersao(v);
  const contador = v < 10 ? 8 : 16;      // indicador de tamanho em byte mode
  return Math.floor((codewords * 8 - 4 - contador) / 8);
}
function versaoPara(n) {
  for (let v = 1; v <= 10; v++) if (capacidade(v) >= n) return v;
  return 0;
}

/* ---------------- Bits de dados ---------------- */
function codewords(bytes, v) {
  const { codewords: alvo, ec, b1, d1, b2, d2 } = dadosDaVersao(v);
  const bits = [];
  const push = (valor, n) => { for (let i = n - 1; i >= 0; i--) bits.push((valor >> i) & 1); };

  push(0b0100, 4);                        // modo byte
  push(bytes.length, v < 10 ? 8 : 16);
  for (const b of bytes) push(b, 8);
  push(0, Math.min(4, alvo * 8 - bits.length));   // terminador
  while (bits.length % 8) bits.push(0);

  const dados = [];
  for (let i = 0; i < bits.length; i += 8) {
    let b = 0;
    for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j];
    dados.push(b);
  }
  // Preenchimento fixo do padrão, alternado, até fechar a capacidade.
  for (let i = 0; dados.length < alvo; i++) dados.push(i % 2 ? 0x11 : 0xec);

  // Divide em blocos, calcula a correção de cada um e intercala.
  const blocos = [];
  let p = 0;
  for (let i = 0; i < b1; i++) { blocos.push(dados.slice(p, p + d1)); p += d1; }
  for (let i = 0; i < b2; i++) { blocos.push(dados.slice(p, p + d2)); p += d2; }
  const paridade = blocos.map((b) => corrigir(b, ec));

  const saida = [];
  const maiorDado = Math.max(d1, d2);
  for (let i = 0; i < maiorDado; i++) {
    for (const b of blocos) if (i < b.length) saida.push(b[i]);
  }
  for (let i = 0; i < ec; i++) for (const b of paridade) saida.push(b[i]);
  return saida;
}

/* ---------------- Matriz ---------------- */
function matriz(texto) {
  const bytes = Array.from(Buffer.from(String(texto), 'utf8'));
  const v = versaoPara(bytes.length);
  if (!v) throw new Error('texto longo demais para o QR (máximo ' + capacidade(10) + ' bytes)');

  const n = v * 4 + 17;
  const m = Array.from({ length: n }, () => new Array(n).fill(0));
  const fixo = Array.from({ length: n }, () => new Array(n).fill(false));
  const põe = (linha, col, escuro) => {
    if (linha < 0 || col < 0 || linha >= n || col >= n) return;
    m[linha][col] = escuro ? 1 : 0;
    fixo[linha][col] = true;
  };

  // Alvos dos cantos + faixa branca de separação.
  for (const [l0, c0] of [[0, 0], [0, n - 7], [n - 7, 0]]) {
    for (let dl = -1; dl <= 7; dl++) {
      for (let dc = -1; dc <= 7; dc++) {
        const borda = Math.max(Math.abs(dl - 3), Math.abs(dc - 3));
        põe(l0 + dl, c0 + dc, borda !== 2 && borda <= 3);
      }
    }
  }
  // Régua de sincronismo.
  for (let i = 8; i < n - 8; i++) { põe(6, i, i % 2 === 0); põe(i, 6, i % 2 === 0); }
  // Alinhamento, menos onde bateria nos alvos dos cantos.
  const pos = ALINHAMENTO[v];
  for (let i = 0; i < pos.length; i++) {
    for (let j = 0; j < pos.length; j++) {
      const canto = (i === 0 && j === 0) || (i === 0 && j === pos.length - 1) || (i === pos.length - 1 && j === 0);
      if (canto) continue;
      for (let dl = -2; dl <= 2; dl++) {
        for (let dc = -2; dc <= 2; dc++) {
          põe(pos[i] + dl, pos[j] + dc, Math.max(Math.abs(dl), Math.abs(dc)) !== 1);
        }
      }
    }
  }
  // Reserva das áreas de formato (preenchidas depois de escolher a máscara).
  // O índice 6 fica de fora: ali passa a régua de sincronismo, não o formato.
  for (let i = 0; i <= 8; i++) { if (i === 6) continue; põe(8, i, false); põe(i, 8, false); }
  for (let i = 0; i < 8; i++) { põe(8, n - 1 - i, false); põe(n - 1 - i, 8, false); }
  põe(n - 8, 8, true);                     // módulo sempre escuro

  // Número da versão, só a partir da 7.
  if (v >= 7) {
    let resto = v;
    for (let i = 0; i < 12; i++) resto = (resto << 1) ^ ((resto >>> 11) * 0x1f25);
    const bits = (v << 12) | resto;
    for (let i = 0; i < 18; i++) {
      const bit = (bits >> i) & 1;
      const a = n - 11 + (i % 3);
      const b = Math.floor(i / 3);
      põe(b, a, bit); põe(a, b, bit);
    }
  }

  // Dados em ziguezague, de baixo para cima, duas colunas por vez.
  const cw = codewords(bytes, v);
  const totalBits = cw.length * 8 + RESTO[v];
  let k = 0;
  for (let col = n - 1; col >= 1; col -= 2) {
    if (col === 6) col = 5;                // a coluna 6 é a régua: pula por cima
    for (let passo = 0; passo < n; passo++) {
      for (let j = 0; j < 2; j++) {
        const c = col - j;
        const subindo = ((col + 1) & 2) === 0;
        const l = subindo ? n - 1 - passo : passo;
        if (fixo[l][c] || k >= totalBits) continue;
        m[l][c] = k < cw.length * 8 ? (cw[k >> 3] >> (7 - (k & 7))) & 1 : 0;
        k++;
      }
    }
  }

  return { m, fixo, n, versao: v };
}

const MASCARAS = [
  (l, c) => (l + c) % 2 === 0,
  (l) => l % 2 === 0,
  (l, c) => c % 3 === 0,
  (l, c) => (l + c) % 3 === 0,
  (l, c) => (Math.floor(l / 2) + Math.floor(c / 3)) % 2 === 0,
  (l, c) => ((l * c) % 2) + ((l * c) % 3) === 0,
  (l, c) => (((l * c) % 2) + ((l * c) % 3)) % 2 === 0,
  (l, c) => (((l + c) % 2) + ((l * c) % 3)) % 2 === 0,
];

// Penalidade do padrão: quanto menor, mais fácil o leitor acertar.
function penalidade(m, n) {
  let p = 0;
  const linha = (fn) => {
    for (let a = 0; a < n; a++) {
      let cor = -1, corrida = 0;
      for (let b = 0; b < n; b++) {
        const v = fn(a, b);
        if (v === cor) { corrida++; if (corrida === 5) p += 3; else if (corrida > 5) p += 1; }
        else { cor = v; corrida = 1; }
      }
    }
  };
  linha((a, b) => m[a][b]);
  linha((a, b) => m[b][a]);

  for (let l = 0; l < n - 1; l++) {
    for (let c = 0; c < n - 1; c++) {
      const v = m[l][c];
      if (v === m[l][c + 1] && v === m[l + 1][c] && v === m[l + 1][c + 1]) p += 3;
    }
  }

  const ALVO = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0];
  const bate = (fn, a, b, inverso) => {
    for (let i = 0; i < 11; i++) if (fn(a, b + i) !== ALVO[inverso ? 10 - i : i]) return false;
    return true;
  };
  for (let a = 0; a < n; a++) {
    for (let b = 0; b + 11 <= n; b++) {
      if (bate((x, y) => m[x][y], a, b, false) || bate((x, y) => m[x][y], a, b, true)) p += 40;
      if (bate((x, y) => m[y][x], a, b, false) || bate((x, y) => m[y][x], a, b, true)) p += 40;
    }
  }

  let escuros = 0;
  for (let l = 0; l < n; l++) for (let c = 0; c < n; c++) escuros += m[l][c];
  p += Math.floor(Math.abs((escuros * 100) / (n * n) - 50) / 5) * 10;
  return p;
}

function formato(mascara) {
  const dados = (0 << 3) | mascara;        // nível M = 0
  let resto = dados;
  for (let i = 0; i < 10; i++) resto = (resto << 1) ^ ((resto >>> 9) * 0x537);
  return ((dados << 10) | resto) ^ 0x5412;
}

function desenhar(texto) {
  const base = matriz(texto);
  const { fixo, n } = base;

  let melhor = null;
  for (let k = 0; k < 8; k++) {
    const m = base.m.map((l) => l.slice());
    for (let l = 0; l < n; l++) {
      for (let c = 0; c < n; c++) if (!fixo[l][c] && MASCARAS[k](l, c)) m[l][c] ^= 1;
    }
    // O formato entra antes de pontuar: ele também é parte do desenho final.
    const bits = formato(k);
    const põe = (l, c, b) => { m[l][c] = b; };
    for (let i = 0; i <= 5; i++) põe(i, 8, (bits >> i) & 1);
    põe(7, 8, (bits >> 6) & 1);
    põe(8, 8, (bits >> 7) & 1);
    põe(8, 7, (bits >> 8) & 1);
    for (let i = 9; i < 15; i++) põe(8, 14 - i, (bits >> i) & 1);
    for (let i = 0; i < 8; i++) põe(8, n - 1 - i, (bits >> i) & 1);
    for (let i = 8; i < 15; i++) põe(n - 15 + i, 8, (bits >> i) & 1);
    põe(n - 8, 8, 1);

    const p = penalidade(m, n);
    if (!melhor || p < melhor.p) melhor = { m, p, mascara: k };
  }
  return { modulos: melhor.m, tamanho: n, versao: base.versao, mascara: melhor.mascara };
}

/*
 * SVG em vez de PNG: um QR é geometria, não fotografia. Assim ele imprime
 * nítido em A3 na parede do evento e continua leve na tela do painel.
 */
function svg(texto, opts) {
  const o = opts || {};
  const margem = o.margem == null ? 4 : o.margem;    // "zona quieta" do padrão
  const { modulos, tamanho } = desenhar(texto);
  const lado = tamanho + margem * 2;
  const claro = o.claro || '#ffffff';
  const escuro = o.escuro || '#000000';

  // Um único <path> com todos os módulos: arquivo pequeno e sem emenda entre
  // retângulos vizinhos, que apareceria como linha branca ao imprimir.
  let d = '';
  for (let l = 0; l < tamanho; l++) {
    for (let c = 0; c < tamanho; c++) {
      if (modulos[l][c]) d += 'M' + (c + margem) + ' ' + (l + margem) + 'h1v1h-1z';
    }
  }
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + lado + ' ' + lado + '"'
    + ' shape-rendering="crispEdges" role="img" aria-label="QR Code">'
    + '<rect width="' + lado + '" height="' + lado + '" fill="' + claro + '"/>'
    + '<path fill="' + escuro + '" d="' + d + '"/></svg>';
}

module.exports = { svg, desenhar, capacidade, MAX_BYTES: capacidade(10) };
