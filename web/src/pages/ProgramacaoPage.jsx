import React, { useEffect, useState } from 'react';
import { MonitorPlay, Pencil, Wand2, Plus, Megaphone } from 'lucide-react';
import { Panel } from '../components/ui/Panel.jsx';
import { Button } from '../components/ui/Button.jsx';
import { StatusDot } from '../components/ui/Badge.jsx';
import { Spinner, EmptyState } from '../components/ui/Feedback.jsx';
import { MapaDaTela } from '../components/tela/MapaDaTela.jsx';
import { devices, deviceConfig } from '../api.js';
import { deviceStatus } from '../lib/deviceStatus.js';
import { campanhasDaConfig, pecasDaFaixa } from '../lib/tela.js';
import '../lib/screenConfig.js';

/*
 * PROGRAMAÇÃO (EXECUTOR §2d, item 40). O dono: "conteúdo merece uma aba
 * própria, dentro de Telas está muito escondido". Telas fica com o APARELHO
 * (parear, online, horário); aqui fica o que PASSA: cada TV desenhada com as
 * zonas, o que há em cada uma e as campanhas no ar. Tocar na TV — ou numa
 * zona dela — abre o editor.
 */
function resumoDaZona(cfg) {
  return (z) => {
    const d = (cfg && cfg.zonas && cfg.zonas[z.id]) || {};
    if (z.type === 'header') { const n = pecasDaFaixa(d).length; return n ? n + (n === 1 ? ' peça' : ' estilos') : 'nome e hora'; }
    if (z.type === 'ticker') {
      const n = pecasDaFaixa(d).length;
      const msgs = (d.messages || []).filter((m) => m && String(m).trim()).length;
      return n ? n + (n === 1 ? ' peça' : ' peças') : msgs ? msgs + (msgs === 1 ? ' aviso' : ' avisos') : 'esperando';
    }
    const n = (d.items || []).length;
    return n ? n + (n === 1 ? ' conteúdo' : ' conteúdos') : 'esperando';
  };
}

export function ProgramacaoPage({ onIr }) {
  const [telas, setTelas] = useState(null);
  const [cfgs, setCfgs] = useState({});

  useEffect(() => {
    devices.list().then((r) => {
      const lista = (r && r.devices) || [];
      setTelas(lista);
      for (const d of lista) {
        deviceConfig.get(d.id).then((c) => setCfgs((m) => ({ ...m, [d.id]: c || null }))).catch(() => setCfgs((m) => ({ ...m, [d.id]: null })));
      }
    }).catch(() => setTelas([]));
  }, []);

  const editar = (d) => onIr && onIr('content', { device: d });

  return (
    <div className="max-w-6xl">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-ink">Programação</h1>
          <p className="mt-1 text-sm text-ink-2">O que está passando em cada TV. Toque numa TV, ou numa parte dela, para mudar.</p>
        </div>
        <Button variant="primary" icon={Wand2} onClick={() => onIr && onIr('criar')}>Criar</Button>
      </div>

      {telas === null ? <div className="flex justify-center py-16"><Spinner size={20} /></div> : telas.length === 0 ? (
        <Panel>
          <EmptyState icon={MonitorPlay} title="Nenhuma TV ainda" description="Pareie a primeira TV e a programação dela aparece aqui."
            action={<Button variant="primary" icon={Plus} onClick={() => onIr && onIr('screens', { abrirParear: true })}>Parear uma TV</Button>} />
        </Panel>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {telas.map((d) => {
            const cfg = cfgs[d.id];
            const layout = cfg && globalThis.MT_getLayout ? globalThis.MT_getLayout(cfg.settings && cfg.settings.layoutId) : null;
            const st = deviceStatus(d.lastSeen);
            const campanhas = cfg ? campanhasDaConfig(cfg) : [];
            return (
              <div key={d.id} className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-3">
                <div className="flex items-center gap-2">
                  <MonitorPlay size={16} className="shrink-0 text-ink-3" />
                  <div className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">{d.name || 'TV'}</div>
                  <span className="flex shrink-0 items-center gap-1.5 text-2xs text-ink-3"><StatusDot tone={st.tone} pulse={st.pulse} /> {st.label}</span>
                </div>
                {cfg === undefined ? <div className="flex h-40 items-center justify-center"><Spinner size={16} /></div>
                  : layout ? <MapaDaTela layout={layout} onEscolher={() => editar(d)} resumo={resumoDaZona(cfg)} />
                    : (
                      <button type="button" onClick={() => editar(d)}
                        className="flex h-40 items-center justify-center rounded-lg border border-dashed border-line text-sm text-ink-3 hover:border-accent/60">
                        Nada publicado ainda
                      </button>
                    )}
                <div className="min-h-[1.25rem] text-xs text-ink-3">
                  {campanhas.length
                    ? <span className="flex flex-wrap items-center gap-1.5"><Megaphone size={13} className="text-accent" /> {campanhas.map((c) => c.nome).join(' · ')}</span>
                    : 'Sem campanha no ar'}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Button size="sm" variant="primary" icon={Pencil} onClick={() => editar(d)}>Editar programação</Button>
                  <Button size="sm" icon={Wand2} onClick={() => onIr && onIr('criar', { tela: d.id })}>Criar para esta TV</Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
