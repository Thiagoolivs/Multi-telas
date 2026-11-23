/*
 * O QR DO WI-FI SAI DA REDE E DA SENHA (reteste 4, 22/11).
 *
 * A peça do Wi-Fi tem a rede e a senha em letra grande e um QR que entra na
 * rede sem digitar. O QR era um campo à parte, em que a pessoa tinha de
 * escrever "WIFI:T:WPA;S:…;P:…;;" — ninguém escreve isso — e, trocada a
 * senha no texto, o QR continuava entrando na rede do exemplo. Agora o editor
 * monta o QR da rede e da senha que a pessoa escreveu.
 *
 * Enquanto a rede ou a senha forem as do desenho (o texto neutro "Nome da
 * rede", "Senha da rede") ou estiverem vazias, não há QR: um QR para uma
 * rede que não existe é pior que nenhum, e a TV tira a coluna dele.
 *
 * Os caracteres especiais do formato (\ ; , : ") vão escapados, como o
 * leitor de QR do celular espera.
 */
const escapar = (s) => String(s).replace(/([\\;,:"])/g, '\\$1');

export function qrDoWifi(rede, senha, doDesenho) {
  const r = String(rede == null ? '' : rede).trim();
  const s = String(senha == null ? '' : senha).trim();
  const d = doDesenho || {};
  if (!r || !s) return '';
  if (r === String(d.rede || '').trim() || s === String(d.senha || '').trim()) return '';
  return 'WIFI:T:WPA;S:' + escapar(r) + ';P:' + escapar(s) + ';;';
}

// A peça tem o QR do Wi-Fi montado da rede e da senha? (os três campos, pelo nome)
export const temQrDeWifi = (definicao) => {
  const nomes = new Set((definicao || []).map((c) => c.tipo + ':' + c.nome));
  return nomes.has('qr:wifi') && nomes.has('texto:rede') && nomes.has('texto:senha');
};
