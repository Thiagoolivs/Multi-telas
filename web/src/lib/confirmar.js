/*
 * Confirmar e perguntar com a cara do painel, no lugar de window.confirm e
 * window.prompt.
 *
 * As caixas do navegador quebravam a experiência no pior momento — apagar,
 * descartar, renomear: aparência de sistema operacional, botões "OK" e
 * "Cancelar" sem dizer o que fazem, e no celular a caixa às vezes nem
 * aparece dentro do app instalado (EXECUTOR D2). Aqui o pedido vira uma
 * promessa; quem desenha é o <PedidosHost> (components/ui/PedidosHost.jsx),
 * montado uma vez no App.
 *
 *   if (!(await confirmar({ titulo, texto, botao: 'Apagar', perigo: true }))) return;
 *   const nome = await perguntar({ titulo, rotulo, valor });  // null = cancelou
 */
let ouvinte = null;
const fila = [];

function pedir(p) {
  return new Promise((resolve) => {
    fila.push({ ...p, resolve });
    // Só avisa o host quando este pedido é o da vez; os outros esperam na fila.
    if (ouvinte && fila.length === 1) ouvinte(fila[0]);
  });
}

// O host se inscreve e recebe o pedido da vez; responder passa ao próximo.
export function inscrever(fn) {
  ouvinte = fn;
  if (fila[0]) fn(fila[0]);
  return () => { if (ouvinte === fn) ouvinte = null; };
}
export function responder(valor) {
  const p = fila.shift();
  if (p) p.resolve(valor);
  if (ouvinte) ouvinte(fila[0] || null);
}

export function confirmar({ titulo, texto = '', botao = 'Confirmar', cancelar = 'Cancelar', perigo = false } = {}) {
  return pedir({ tipo: 'confirmar', titulo, texto, botao, cancelar, perigo }).then((v) => v === true);
}
export function perguntar({ titulo, texto = '', rotulo = '', valor = '', botao = 'Salvar', placeholder = '' } = {}) {
  return pedir({ tipo: 'perguntar', titulo, texto, rotulo, valor, botao, cancelar: 'Cancelar', placeholder })
    .then((v) => (typeof v === 'string' ? v : null));
}
