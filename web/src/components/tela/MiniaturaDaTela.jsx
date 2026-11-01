import React, { useEffect, useState } from 'react';
import { MonitorPlay } from 'lucide-react';
import { Palco } from '../content/VerTelaAgora.jsx';
import { telaAgora } from '../../api.js';

/*
 * A TV em miniatura, com o que ela está mostrando (QA de 26/10: "o que está
 * passando agora em cada TV"). Usa a mesma resposta do "Ver a tela agora":
 * lê a última que a TV mandou e, se a TV está no ar e a resposta é velha,
 * pede uma nova — a TV responde em ~1 s pelo tempo real.
 *
 * Sem resposta (TV nova, fora do ar, sem programação), mostra o recado e a
 * ação que resolve — nunca um quadro vazio sem explicação.
 */
const VELHA_MS = 5 * 60 * 1000;
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

export function MiniaturaDaTela({ d, online, vazia, acao }) {
  const [resposta, setResposta] = useState(null);

  useEffect(() => {
    let vivo = true;
    (async () => {
      let r = null;
      try { r = await telaAgora.ler(d.id); } catch (e) { r = null; }
      if (!vivo) return;
      if (r && r.estado) setResposta(r);
      if (!online || vazia || (r && r.estado && Date.now() - r.em < VELHA_MS)) return;
      try { await telaAgora.pedir(d.id); } catch (e) { return; }
      const antes = (r && r.em) || 0;
      for (let i = 0; i < 6 && vivo; i++) {
        await dormir(1200);
        let n = null;
        try { n = await telaAgora.ler(d.id); } catch (e) { n = null; }
        if (vivo && n && n.estado && n.em > antes) { setResposta(n); return; }
      }
    })();
    return () => { vivo = false; };
  }, [d.id, online, vazia, d.updatedAt]);

  if (resposta && resposta.estado && !vazia) {
    return (
      <div className="pointer-events-none w-full" aria-label={'O que a TV ' + (d.name || '') + ' está mostrando'}>
        <Palco estado={resposta.estado} alturaMaxima={220} />
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center gap-2 px-4 text-center">
      <MonitorPlay size={26} className={online ? 'text-accent' : 'text-ink-3'} />
      <span className="text-sm font-medium text-ink-2">
        {vazia ? 'Nada passando nesta TV ainda' : online ? 'Perguntando à TV o que está passando…' : 'Sem imagem: a TV está fora do ar'}
      </span>
      {acao}
    </div>
  );
}
