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

/*
 * Teto de pedidos à TV (revisão do PR #305). Cada pedido é um comando para a
 * TV e várias leituras; uma conta com 50 TVs abrindo Telas e Início
 * algumas vezes estouraria o teto do painel (600 por 5 min, que bloqueia).
 * A mesma TV não é perguntada de novo em 2 minutos, e no máximo 8 TVs por
 * minuto na aba inteira; as outras mostram a última resposta que a TV deu.
 */
const JA_PEDIU_MS = 2 * 60 * 1000;
const MAX_POR_MINUTO = 8;
const pedidos = new Map();
let janela = [];
export function podePedir(id, agora = Date.now()) {
  if (agora - (pedidos.get(id) || 0) < JA_PEDIU_MS) return false;
  janela = janela.filter((t) => agora - t < 60 * 1000);
  if (janela.length >= MAX_POR_MINUTO) return false;
  janela.push(agora);
  pedidos.set(id, agora);
  return true;
}

export function MiniaturaDaTela({ d, online, vazia, acao }) {
  const [resposta, setResposta] = useState(null);
  // Começa "perguntando": até a primeira leitura voltar, a TV no ar está sendo consultada.
  const [perguntando, setPerguntando] = useState(online && !vazia);

  useEffect(() => {
    let vivo = true;
    (async () => {
      let r = null;
      try { r = await telaAgora.ler(d.id); } catch (e) { r = null; }
      if (!vivo) return;
      if (r && r.estado) setResposta(r);
      if (!online || vazia || (r && r.estado && Date.now() - r.em < VELHA_MS) || !podePedir(d.id)) { setPerguntando(false); return; }
      setPerguntando(true);
      try { await telaAgora.pedir(d.id); } catch (e) { if (vivo) setPerguntando(false); return; }
      const antes = (r && r.em) || 0;
      for (let i = 0; i < 4 && vivo; i++) {
        await dormir(1500);
        let n = null;
        try { n = await telaAgora.ler(d.id); } catch (e) { n = null; }
        if (vivo && n && n.estado && n.em > antes) { setResposta(n); break; }
      }
      if (vivo) setPerguntando(false);
    })();
    return () => { vivo = false; };
  }, [d.id, online, vazia, d.updatedAt]);

  if (resposta && resposta.estado && !vazia) {
    /*
     * Imagem que não é de agora diz de quando é, em vez de passar por "agora":
     * fora do ar, apagada e com "Última imagem"; no ar mas velha (a TV não foi
     * perguntada de novo por causa do teto), com "Visto às".
     */
    const quando = resposta.em ? new Date(resposta.em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
    const velha = !resposta.em || Date.now() - resposta.em > VELHA_MS;
    const selo = !online ? 'Última imagem · ' + quando : velha && quando ? 'Visto em ' + quando : '';
    return (
      <div className="pointer-events-none relative w-full" aria-label={(selo ? selo + ' · ' : 'O que está passando agora · ') + (d.name || '')}>
        <div className={!online ? 'opacity-50 grayscale' : ''}><Palco estado={resposta.estado} alturaMaxima={220} /></div>
        {selo && <span className="absolute bottom-2 right-2 rounded-full bg-black/70 px-2 py-0.5 text-xs font-medium text-white">{selo}</span>}
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center gap-2 px-4 text-center">
      <MonitorPlay size={26} className={online ? 'text-accent' : 'text-ink-3'} />
      <span className="text-sm font-medium text-ink-2">
        {vazia ? 'Nada passando nesta TV ainda' : !online ? 'Sem imagem: a TV está fora do ar'
          : perguntando ? 'Perguntando à TV o que está passando…' : 'Ainda sem imagem desta TV'}
      </span>
      {acao}
    </div>
  );
}
