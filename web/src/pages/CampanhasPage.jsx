import React, { useEffect, useState } from 'react';
import { ArrowLeft, Wand2, MonitorPlay, Megaphone, Plus } from 'lucide-react';
import { Panel } from '../components/ui/Panel.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Spinner, EmptyState } from '../components/ui/Feedback.jsx';
import { DesignThumb } from '../components/content/DesignThumb.jsx';
import { ResultadoCampanha } from '../components/criar/ResultadoCampanha.jsx';
import { PorPraRodar } from '../components/criar/PorPraRodar.jsx';
import { criar, devices } from '../api.js';
import { cn } from '../lib/cn.js';

/*
 * CAMPANHAS (EXECUTOR §2c, item 29): a campanha do Criar como UNIDADE.
 *
 * Antes ela virava uma pasta em Meus Designs, e cada geração com o mesmo nome
 * empilhava as peças na mesma pasta: "Promoção da semana · 15 peças" eram três
 * gerações misturadas, e publicar por lá decidia a zona pelo formato, não pelo
 * que o cliente pediu. Aqui cada campanha aparece uma vez, com o estado (no
 * ar, pausada, pronta) e as TVs; abrir leva ao mesmo resultado do Criar, com
 * Pôr pra rodar, Pausar e Ajustar.
 */

const ESTADO = {
  no_ar: { rotulo: 'No ar', classe: 'bg-ok/15 text-ok' },
  pausada: { rotulo: 'Pausada', classe: 'bg-warn/15 text-warn' },
  pronta: { rotulo: 'Pronta', classe: 'bg-surface-2 text-ink-2' },
};
const quando = (ms) => {
  if (!ms) return '';
  const d = new Date(ms);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }) + ', ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
};

export function CampanhasPage({ campanhaInicial, onIr }) {
  const [lista, setLista] = useState(null);
  const [telas, setTelas] = useState([]);
  const [aberta, setAberta] = useState(null);
  const [abrindo, setAbrindo] = useState(false);
  const [erro, setErro] = useState('');

  function carregar() {
    criar.campanhas().then((r) => setLista((r && r.campanhas) || [])).catch((e) => { setErro(e.message || 'Não deu para carregar.'); setLista([]); });
  }
  useEffect(() => {
    carregar();
    devices.list().then((r) => setTelas((r && r.devices) || [])).catch(() => setTelas([]));
    if (campanhaInicial) abrir(campanhaInicial);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function abrir(id) {
    setAbrindo(true); setErro('');
    try { const r = await criar.campanha(id); setAberta(r.campanha); }
    catch (e) { setErro(e.message || 'Campanha não encontrada.'); }
    finally { setAbrindo(false); }
  }

  function mudou(c) {
    setAberta(c);
    setLista((l) => (l || []).map((x) => (x.id === c.id ? { ...x, estado: c.estado, telas: c.telas, nome: c.nome, capa: c.capa || x.capa } : x)));
  }

  const nomesDasTelas = (ids) => (ids || []).map((id) => (telas.find((t) => t.id === id) || {}).name).filter(Boolean);

  if (abrindo) return <div className="flex justify-center py-20"><Spinner size={22} /></div>;

  if (aberta) {
    return (
      <div className="max-w-3xl space-y-3">
        <button type="button" onClick={() => { setAberta(null); carregar(); }} className="flex items-center gap-1.5 text-sm text-ink-2 hover:text-ink">
          <ArrowLeft size={16} /> Todas as campanhas
        </button>
        <ResultadoCampanha campanha={aberta} telas={telas} onIr={onIr} onMudou={mudou}
          acoes={<PorPraRodar campanha={aberta} telas={telas} onMudou={mudou} />} />
      </div>
    );
  }

  return (
    <div className="max-w-6xl">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-ink">Campanhas</h1>
          <p className="mt-1 text-sm text-ink-2">O que o Criar fez, com o que está no ar em cada TV.</p>
        </div>
        <Button variant="primary" icon={Plus} onClick={() => onIr && onIr('criar')}>Criar campanha</Button>
      </div>
      {erro && <div className="mb-3 rounded-md border border-danger-soft bg-danger-soft px-3 py-2 text-sm text-danger" role="alert">{erro}</div>}
      {lista === null ? <div className="flex justify-center py-16"><Spinner size={20} /></div> : lista.length === 0 ? (
        <Panel>
          <EmptyState icon={Megaphone} title="Nenhuma campanha ainda"
            description="Conte no Criar o que você quer mostrar: a IA monta as TVs, a programação e as redes, e a campanha aparece aqui."
            action={<Button variant="primary" icon={Plus} onClick={() => onIr && onIr('criar')}>Criar a primeira</Button>} />
        </Panel>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {lista.map((c) => {
            const e = ESTADO[c.estado] || ESTADO.pronta;
            const nomes = nomesDasTelas(c.telas);
            return (
              <button key={c.id} type="button" onClick={() => abrir(c.id)}
                className="group flex flex-col overflow-hidden rounded-lg border border-line bg-surface text-left transition hover:border-accent/60">
                <div className="bg-surface-2 p-2">
                  {c.capa && c.capa.item ? <DesignThumb item={{ ...c.capa.item, formato: c.capa.formato || c.capa.item.formato }} />
                    : <div className="flex aspect-video items-center justify-center text-ink-3"><Megaphone size={22} /></div>}
                </div>
                <div className="flex flex-1 flex-col gap-1.5 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <span className="min-w-0 truncate text-sm font-semibold text-ink">{c.nome || 'Campanha'}</span>
                    <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-2xs font-semibold', e.classe)}>{e.rotulo}</span>
                  </div>
                  <span className="flex items-center gap-1 truncate text-xs text-ink-3">
                    <MonitorPlay size={12} className="shrink-0" />
                    {c.estado === 'no_ar' && nomes.length ? nomes.join(', ') : c.estado === 'no_ar' ? (c.telas || []).length + ' TV(s)' : 'em nenhuma TV agora'}
                  </span>
                  <span className="text-2xs text-ink-3">{quando(c.atualizadoEm)}</span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
