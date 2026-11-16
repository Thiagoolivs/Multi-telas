import { useEffect, useState } from 'react';
import { aprovacoes } from '../api.js';

/*
 * O "PÔR NA TV" QUE VIRA PEDIDO (reteste 3, 14/11). Com a aprovação ligada
 * na conta, o que um membro põe na TV não vai para a TV: vira um pedido que
 * o dono aprova (server/aprovacao.js). A gerente tocava em "Pôr na TV" e só
 * o aviso de depois dizia que não tinha ido: o botão tem de dizer antes.
 *
 * Quem decide é o servidor (server/permissoes.js: membro e conta com a
 * aprovação ligada). O painel lê a mesma regra na contagem do sino
 * (GET /api/aprovacoes/contagem → { ligada, souRevisor }): o dono e o admin
 * são os revisores e nunca pedem. Sem resposta, fica o "Pôr na TV" de
 * sempre; se o envio virar pedido mesmo assim (202), o botão passa a dizer.
 */
export const pedeAprovacao = (r) => !!(r && r.ligada && !r.souRevisor);

/*
 * Uma leitura serve por 30 s: a página da TV e o "Pôr na TV" abrem juntos, e
 * o painel tem teto de pedidos por conta (server/limites.js). Quando a regra
 * muda ('mt:aprovacoes-mudou'), lê de novo na hora.
 */
let lida = null;
function lerContagem(deNovo) {
  if (!deNovo && lida && Date.now() - lida.em < 30000) return lida.p;
  const p = aprovacoes.contagem();
  lida = { p, em: Date.now() };
  p.catch(() => { if (lida && lida.p === p) lida = null; });
  return p;
}

export function usePedeAprovacao() {
  const [pede, setPede] = useState(false);
  useEffect(() => {
    let vivo = true;
    const ler = (e) => lerContagem(!!e).then((r) => { if (vivo) setPede(pedeAprovacao(r)); }).catch(() => {});
    const virouPedido = () => { if (vivo) setPede(true); };
    ler();
    // O dono pode ligar ou desligar a aprovação com a página aberta (Equipe avisa por 'mt:aprovacoes-mudou').
    window.addEventListener('mt:aprovacoes-mudou', ler);
    window.addEventListener('mt:aprovacao', virouPedido);
    return () => {
      vivo = false;
      window.removeEventListener('mt:aprovacoes-mudou', ler);
      window.removeEventListener('mt:aprovacao', virouPedido);
    };
  }, []);
  return pede;
}
