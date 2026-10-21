import React, { useEffect, useState } from 'react';
import { Rocket, Pause, Play, MonitorPlay, LayoutTemplate } from 'lucide-react';
import { Button } from '../ui/Button.jsx';
import { Spinner } from '../ui/Feedback.jsx';
import { criar } from '../../api.js';
import { planoDeRodar, rodarCampanha, pausarCampanha, nomeDoLayout } from '../../lib/rodar.js';
import { aviso } from '../../lib/avisos.js';

/*
 * "PÔR PRA RODAR" (EXECUTOR §2b, item 25). A campanha já está salva; aqui ela
 * vai para as TVs, cada peça na zona que o cliente escolheu. Antes de mexer,
 * diz o que vai acontecer: que TV recebe e qual troca de layout para ter as
 * zonas pedidas — trocar o layout de alguém sem avisar seria mudar a TV dele
 * por trás. Depois, "Pausar" tira só o que é da campanha.
 */
export function PorPraRodar({ campanha, telas, onMudou }) {
  const [plano, setPlano] = useState(null);
  const [trocar, setTrocar] = useState(true);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState('');
  const r = campanha.resultado || {};
  const nome = r.nome || campanha.nome;

  useEffect(() => {
    let vivo = true;
    if (!telas.length) { setPlano([]); return undefined; }
    planoDeRodar(r, telas).then((p) => { if (vivo) setPlano(p); }).catch(() => { if (vivo) setPlano([]); });
    return () => { vivo = false; };
  }, [campanha.id, telas.length]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!telas.length) return null;
  const noAr = campanha.estado === 'no_ar';
  const pausada = campanha.estado === 'pausada';
  const trocam = (plano || []).filter((p) => p.faltam.length);

  async function rodar() {
    setOcupado(true); setErro('');
    try {
      const ids = await rodarCampanha(plano, nome, { trocarLayout: trocar });
      const k = await criar.marcar(campanha.id, 'no_ar', ids);
      onMudou(k.campanha);
      aviso.ok('No ar em ' + ids.length + (ids.length === 1 ? ' TV.' : ' TVs.'));
      // O plano de novo: a TV que trocou de layout já tem as zonas, e a linha não pode seguir dizendo que vai trocar.
      planoDeRodar(r, telas).then(setPlano).catch(() => {});
    } catch (e) {
      setErro(e.offline ? 'Sem conexão: nada foi enviado. As TVs continuam como estavam.' : (e.message || 'Não deu para pôr no ar.'));
    } finally { setOcupado(false); }
  }

  async function pausar() {
    setOcupado(true); setErro('');
    try {
      await pausarCampanha(r, nome, telas, campanha.telas);
      const k = await criar.marcar(campanha.id, 'pausada', campanha.telas);
      onMudou(k.campanha);
      aviso.ok('Pausada. O resto das TVs continua igual.');
      planoDeRodar(r, telas).then(setPlano).catch(() => {});
    } catch (e) { setErro(e.message || 'Não deu para pausar.'); }
    finally { setOcupado(false); }
  }

  return (
    <section className="space-y-2.5 rounded-lg border border-accent/40 bg-surface p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-ink">
          <Rocket size={15} className="text-accent" />
          {noAr ? 'No ar em ' + campanha.telas.length + (campanha.telas.length === 1 ? ' TV' : ' TVs') : pausada ? 'Pausada' : 'Pôr pra rodar'}
        </h3>
        {noAr && <span className="rounded-full bg-ok/15 px-2 py-0.5 text-2xs font-semibold text-ok">rodando</span>}
      </div>

      {plano === null ? <Spinner size={16} /> : plano.length === 0 ? (
        <p className="text-xs text-ink-2">Nenhuma das TVs desta campanha está ligada. Ligue a TV, ou escolha outra no cartão.</p>
      ) : (
        <ul className="space-y-1">
          {plano.map((p) => (
            <li key={p.tela.id} className="flex items-start gap-2 text-xs text-ink-2">
              <MonitorPlay size={13} className="mt-0.5 shrink-0 text-ink-3" />
              <span className="min-w-0">
                <b className="font-semibold text-ink">{p.tela.name || 'TV'}</b>
                {p.faltam.length > 0 && trocar && <span> · passa para <b className="font-medium">{nomeDoLayout(p.layoutNovo)}</b>, para ter {p.faltam.join(', ')}</span>}
                {p.faltam.length > 0 && !trocar && <span> · fica no layout de hoje: {p.faltam.join(', ')} não aparece</span>}
              </span>
            </li>
          ))}
        </ul>
      )}

      {trocam.length > 0 && !noAr && (
        <label className="flex items-center gap-2 text-xs text-ink-2">
          <input type="checkbox" checked={trocar} onChange={(e) => setTrocar(e.target.checked)} />
          <LayoutTemplate size={13} className="text-ink-3" /> Trocar o layout quando faltar zona
        </label>
      )}

      {erro && <p className="text-xs text-danger" role="alert">{erro}</p>}

      <div className="flex flex-wrap gap-2">
        {!noAr && (
          <Button variant="primary" size="lg" icon={pausada ? Play : Rocket} disabled={ocupado || !plano || !plano.length} onClick={rodar}>
            {ocupado ? 'Enviando…' : pausada ? 'Retomar' : 'Pôr pra rodar'}
          </Button>
        )}
        {noAr && (
          <>
            <Button icon={Pause} disabled={ocupado} onClick={pausar}>{ocupado ? 'Pausando…' : 'Pausar'}</Button>
            <Button variant="ghost" icon={Rocket} disabled={ocupado || !plano || !plano.length} onClick={rodar}>Mandar de novo</Button>
          </>
        )}
      </div>
    </section>
  );
}
