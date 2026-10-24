import React, { useEffect, useState } from 'react';
import { Check, TriangleAlert } from 'lucide-react';
import { Dialog } from '../ui/Dialog.jsx';
import { Button } from '../ui/Button.jsx';
import { Spinner } from '../ui/Feedback.jsx';
import { PreviaDaTela } from './PreviaDaTela.jsx';
import { brand, devices, deviceConfig } from '../../api.js';
import { aplicarMudancas, descrever } from '../../lib/ajusteTela.js';
import { gravarEmLote, avisarComDesfazer } from '../../lib/rodar.js';
import { aviso } from '../../lib/avisos.js';

/*
 * MUDAR A APARÊNCIA DE UMA TV, CONFERINDO ANTES (D51; o Criar desde 24/10).
 *
 * A TV agora e como fica, lado a lado, e a lista do que muda. Nada muda na
 * TV sem o "Aplicar", e o envio tem Desfazer. Usado pelo "Pedir à IA" da
 * Programação e pelo assistente do Criar — o mesmo diálogo, a mesma regra.
 *
 *   tv: { id, nome }   mudancas: o que server/ajuste-tela.js entendeu   notas: avisos dele
 */
export function MudarAparencia({ tv, mudancas, notas, onFechar, onVoltar }) {
  const [estado, setEstado] = useState(null);   // { cfg, depois, linhas, alvo, coresMarca } | { erro }
  const [aplicando, setAplicando] = useState(false);

  useEffect(() => {
    let vivo = true;
    Promise.all([
      deviceConfig.get(tv.id),
      brand.get().then((r) => ((r && r.kit && r.kit.cores) || []).filter(Boolean)).catch(() => []),
      devices.list().then((r) => (r && r.devices) || []).catch(() => []),
    ]).then(([cfg, coresMarca, lista]) => {
      if (!vivo) return;
      if (!cfg) { setEstado({ erro: 'Esta TV ainda não tem programação para mudar. Ponha algo nela primeiro.' }); return; }
      setEstado({
        cfg, coresMarca, alvo: lista.find((t) => t.id === tv.id) || null,
        depois: aplicarMudancas(cfg, mudancas, { coresMarca }), linhas: descrever(cfg, mudancas, { coresMarca }),
      });
    }).catch((e) => { if (vivo) setEstado({ erro: e.message || 'Não deu para ler a TV agora.' }); });
    return () => { vivo = false; };
  }, [tv.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function aplicar() {
    if (!estado || !estado.alvo) return;
    setAplicando(true);
    try {
      const r = await gravarEmLote([estado.alvo], (cfg) => aplicarMudancas(cfg, mudancas, { coresMarca: estado.coresMarca }), 'IA na TV ' + (tv.nome || ''));
      avisarComDesfazer('Mudou na TV “' + (tv.nome || 'TV') + '”.', r.lote);
      onFechar();
    } catch (e) { aviso.erro('pedir', e.message || 'Não deu para aplicar na TV.'); }
    finally { setAplicando(false); }
  }

  return (
    <Dialog open onClose={onFechar} className="max-w-3xl" title={'Mudar a aparência: ' + (tv.nome || 'TV')}
      description="Confira antes: a TV agora e como fica. Muda na TV quando você aplicar (e dá para desfazer)."
      footer={<>
        <Button variant="ghost" onClick={onVoltar || onFechar}>{onVoltar ? 'Voltar' : 'Cancelar'}</Button>
        <Button variant="primary" icon={Check} disabled={aplicando || !estado || !!estado.erro || !estado.alvo} onClick={aplicar}>{aplicando ? 'Aplicando…' : 'Aplicar na TV'}</Button>
      </>}>
      {!estado ? <div className="flex justify-center py-8"><Spinner size={18} /></div>
        : estado.erro ? <p className="text-sm text-danger">{estado.erro}</p> : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <PreviaDaTela cfg={estado.cfg} rotulo="Agora" />
              <PreviaDaTela cfg={estado.depois} rotulo="Como fica" />
            </div>
            <ul className="mt-4 space-y-1 text-sm">
              {estado.linhas.map((l, i) => (
                <li key={i} className={l.aviso ? 'flex items-start gap-1.5 text-warn' : 'flex items-start gap-1.5 text-ink'}>
                  {l.aviso ? <TriangleAlert size={14} className="mt-0.5 shrink-0" /> : <Check size={14} className="mt-0.5 shrink-0 text-accent" />}{l.texto}
                </li>
              ))}
              {(notas || []).map((n, i) => <li key={'n' + i} className="pl-5 text-xs text-ink-3">{n}</li>)}
            </ul>
          </>
        )}
    </Dialog>
  );
}
