/*
 * O navegador em duas palavras: "Chrome 153 · Windows", "Safari 17 · iPhone".
 *
 * QA de lançamento, 03/11: a página de Suporte mostrava o user-agent inteiro
 * ("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 …") e o papel em
 * inglês ("owner"). Para o cliente, isso é ruído de programador; para o
 * suporte, "Chrome 153 no Windows" já responde quase tudo. O texto completo
 * continua indo no e-mail, para o caso raro em que ele importa.
 */
export function navegadorCurto(ua) {
  const s = String(ua || '');
  if (!s) return '';
  const versao = (re) => { const m = s.match(re); return m ? m[1].split('.')[0] : ''; };
  let nome = '';
  if (/Edg\//.test(s)) nome = 'Edge ' + versao(/Edg\/([\d.]+)/);
  else if (/OPR\//.test(s)) nome = 'Opera ' + versao(/OPR\/([\d.]+)/);
  else if (/SamsungBrowser\//.test(s)) nome = 'Samsung Internet ' + versao(/SamsungBrowser\/([\d.]+)/);
  else if (/Firefox\//.test(s)) nome = 'Firefox ' + versao(/Firefox\/([\d.]+)/);
  else if (/(Chrome|CriOS)\//.test(s)) nome = 'Chrome ' + versao(/(?:Chrome|CriOS)\/([\d.]+)/);
  else if (/Safari\//.test(s) && /Version\//.test(s)) nome = 'Safari ' + versao(/Version\/([\d.]+)/);
  else nome = 'Navegador';
  const sistema = /iPhone/.test(s) ? 'iPhone' : /iPad/.test(s) ? 'iPad' : /Android/.test(s) ? 'Android'
    : /Windows/.test(s) ? 'Windows' : /Mac OS X|Macintosh/.test(s) ? 'Mac' : /CrOS/.test(s) ? 'Chromebook' : /Linux/.test(s) ? 'Linux' : '';
  return nome.trim() + (sistema ? ' · ' + sistema : '');
}
