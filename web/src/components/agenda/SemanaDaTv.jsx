import React, { useEffect, useMemo, useState } from 'react';
import { Clock, Plus, Megaphone, CalendarDays, AlertTriangle } from 'lucide-react';
import '../../../../js/templates.js';
import '../../../../js/rodizio.js';
import { Panel, PanelHeader } from '../ui/Panel.jsx';
import { Spinner } from '../ui/Feedback.jsx';
import { Select } from '../ui/Field.jsx';
import { devices, deviceConfig } from '../../api.js';
import { semanaDaTv } from '../../lib/semana.js';
import { itemSummary } from '../../lib/contentTypes.js';
import { cn } from '../../lib/cn.js';

/*
 * A SEMANA, VISUAL (fase 8; BLOCO-8, wireframe D): os próximos 7 dias por
 * faixa do dia, com o que passa em cada uma e os buracos à vista — "vazio:
 * a TV mostra o relógio", com o atalho para pôr algo ali. Tocar numa peça
 * abre a TV nela. O que é de cada célula vem de lib/semana.js, com o mesmo
 * `naJanela` da TV.
 */
const curta = (iso) => { const [, m, d] = String(iso).split('-'); return d + '/' + m; };

export function SemanaDaTv({ onIr }) {
  const [tvs, setTvs] = useState(null);
  const [id, setId] = useState('');
  const [cfg, setCfg] = useState(undefined);
  const [erro, setErro] = useState('');
  // No celular, um dia por vez (os sete lado a lado não cabem a 390 px).
  const [diaCel, setDiaCel] = useState(0);

  useEffect(() => {
    devices.list().then((r) => {
      const lista = (r && r.devices) || [];
      setTvs(lista);
      if (lista.length) setId(lista[0].id);
    }).catch((e) => { setTvs([]); setErro(e.message || 'Não deu para ler as TVs.'); });
  }, []);

  useEffect(() => {
    if (!id) return;
    setCfg(undefined); setErro('');
    deviceConfig.ler(id).then((r) => setCfg((r && r.config) || null)).catch((e) => { setCfg(null); setErro(e.message || 'Não deu para ler a programação.'); });
  }, [id]);

  const tv = (tvs || []).find((t) => t.id === id);
  const layout = useMemo(() => (cfg && globalThis.MT_getLayout ? globalThis.MT_getLayout(cfg.settings && cfg.settings.layoutId) : null), [cfg]);
  const s = useMemo(() => (cfg && layout ? semanaDaTv(cfg, layout, { expediente: tv && tv.expediente, nome: itemSummary }) : null), [cfg, layout, tv]);

  if (tvs === null) return <Panel><div className="flex justify-center py-10"><Spinner size={18} /></div></Panel>;
  if (!tvs.length) return null;

  const abrir = (zona) => onIr && tv && onIr('content', { device: tv, zona });

  return (
    <Panel>
      <PanelHeader title="A semana na TV"
        description={!s ? 'O que passa em cada dia e hora.' : s.buracos
          ? s.buracos + (s.buracos === 1 ? ' horário com a loja aberta só com o relógio.' : ' horários com a loja aberta só com o relógio.') + ' Toque em “Pôr algo” para encher.'
          : 'Sem buraco: em todo horário aberto a TV tem o que mostrar.'}
        actions={tvs.length > 1 && (
          <div className="w-48"><Select aria-label="Qual TV" value={id} onChange={(e) => setId(e.target.value)}>
            {tvs.map((t) => <option key={t.id} value={t.id}>{t.name || 'TV'}</option>)}
          </Select></div>
        )} />
      {erro ? <p className="p-4 text-sm text-danger">{erro}</p> : cfg === undefined ? (
        <div className="flex justify-center py-10"><Spinner size={18} /></div>
      ) : !s || s.partes.length === 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-2 p-4 text-sm text-ink-2">
          <span>Esta TV ainda não tem nada para passar.</span>
          {onIr && <button type="button" onClick={() => onIr('criar', { tela: id })} className="inline-flex items-center gap-1 font-semibold text-accent hover:underline"><Plus size={14} /> Pôr algo nela</button>}
        </div>
      ) : (
        <>
        {/* Celular: escolhe o dia, e as quatro horas dele uma embaixo da outra. */}
        <div className="sm:hidden">
          <div className="rolagem-lateral flex gap-1 overflow-x-auto border-b border-line p-2" role="radiogroup" aria-label="Qual dia">
            {s.dias.map((d, i) => (
              <button key={d.iso} type="button" role="radio" aria-checked={diaCel === i} onClick={() => setDiaCel(i)}
                className={cn('shrink-0 rounded-full border px-3 text-sm', diaCel === i ? 'border-line-strong bg-surface-2 font-semibold text-ink' : 'border-transparent text-ink-2',
                  s.linhas.some((l) => l.celulas[i].vazio) && 'underline decoration-warn decoration-2 underline-offset-4')}>
                {d.hoje ? 'Hoje' : d.rotulo}
              </button>
            ))}
          </div>
          <ul className="divide-y divide-line">
            {s.linhas.map((l) => (
              <li key={l.faixa} className="flex gap-3 p-3">
                <div className="w-20 shrink-0 text-sm font-semibold text-ink-2">{l.rotulo}<span className="block text-xs font-normal text-ink-3">{l.hm.replace(':', 'h')}</span></div>
                <div className="min-w-0 flex-1"><Celula c={l.celulas[diaCel]} onAbrir={abrir} onPor={() => onIr && onIr('criar', { tela: id })} /></div>
              </li>
            ))}
          </ul>
        </div>
        {/* Computador: a semana inteira. */}
        <div className="hidden overflow-x-auto sm:block">
          <table className="w-full min-w-[720px] table-fixed border-collapse text-left">
            <caption className="sr-only">O que passa em {tv ? tv.name : 'esta TV'} nos próximos 7 dias, por hora do dia</caption>
            <thead>
              <tr>
                <th scope="col" className="w-24 p-2"><span className="sr-only">Hora do dia</span></th>
                {s.dias.map((d) => (
                  <th key={d.iso} scope="col" className={cn('p-2 text-xs font-semibold', d.hoje ? 'text-accent' : 'text-ink-2')}>
                    {d.hoje ? 'Hoje' : d.rotulo}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {s.linhas.map((l) => (
                <tr key={l.faixa} className="border-t border-line">
                  <th scope="row" className="p-2 align-top text-xs font-semibold text-ink-2">{l.rotulo}<span className="block font-normal text-ink-3">{l.hm.replace(':', 'h')}</span></th>
                  {l.celulas.map((c, i) => (
                    <td key={i} className="p-1 align-top">
                      <Celula c={c} onAbrir={abrir} onPor={() => onIr && onIr('criar', { tela: id })} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      )}
    </Panel>
  );
}

function Celula({ c, onAbrir, onPor }) {
  if (c.fechado) return <div className="flex h-full min-h-16 items-center justify-center rounded-md bg-surface-2/60 text-2xs text-ink-3">fechado</div>;
  /*
   * O mesmo nome uma vez só, com quantas são (reteste da fase 10: "Imagem,
   * Imagem, +8 outras" não dizia nada). Duas linhas por célula, e o resto
   * contado.
   */
  const unicas = [];
  c.pecas.forEach((p) => { const ja = unicas.find((u) => u.titulo === p.titulo); if (ja) ja.vezes++; else unicas.push({ ...p, vezes: 1 }); });
  const mostra = unicas.slice(0, 2);
  const resto = unicas.length - mostra.length;
  return (
    <div className={cn('min-h-16 space-y-1 rounded-md border p-1', c.vazio ? 'border-warn/40 bg-warn-soft' : 'border-line bg-surface')}>
      {mostra.map((p, j) => (
        <button key={j} type="button" onClick={() => onAbrir(p.zona)} title={p.titulo + (p.ate ? ' · até ' + curta(p.ate) : '')}
          className={cn('flex w-full min-w-0 items-start gap-1 rounded px-1.5 py-1 text-left text-xs leading-tight transition hover:bg-surface-2',
            p.urgente ? 'text-danger' : 'text-ink')}>
          {p.urgente ? <AlertTriangle size={11} className="mt-px shrink-0 self-start" /> : p.campanha ? <Megaphone size={11} className="mt-px shrink-0 self-start text-accent" /> : p.calendario ? <CalendarDays size={11} className="mt-px shrink-0 self-start text-accent" /> : null}
          <span className="min-w-0">
            <span className="line-clamp-2">{p.titulo}{p.vezes > 1 ? ' (' + p.vezes + ')' : ''}</span>
            {p.ate && <span className="block text-ink-3">até {curta(p.ate)}</span>}
          </span>
        </button>
      ))}
      {resto > 0 && <div className="px-1.5 text-2xs text-ink-3">+{resto} {resto === 1 ? 'outra' : 'outras'}</div>}
      {c.vazio && (
        <div className="px-1 text-2xs text-ink-2">
          <span className="flex items-center gap-1 font-semibold text-warn"><Clock size={11} /> {c.semNada.length && c.pecas.length ? c.semNada.join(', ') + ': só o relógio' : 'Vazio: só o relógio'}</span>
          <button type="button" onClick={onPor} className="mt-0.5 inline-flex items-center gap-0.5 font-semibold text-accent hover:underline"><Plus size={11} /> Pôr algo</button>
        </div>
      )}
    </div>
  );
}
