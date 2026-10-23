import React, { useEffect, useMemo, useState } from 'react';
import { CalendarDays, Sparkles, Trash2, Pencil, Check, X, MonitorPlay } from 'lucide-react';
import { Panel, PanelHeader } from '../components/ui/Panel.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Badge } from '../components/ui/Badge.jsx';
import { Spinner, EmptyState, ErrorState } from '../components/ui/Feedback.jsx';
import { calendario, devices, brand } from '../api.js';
import { carregarModelos } from '../lib/modelosOuro.js';
import { gravarEmLote } from '../lib/rodar.js';
import { pecaDoEvento, aplicarCalendario, tirarDoCalendario, telasDoEvento, periodoDoEvento, partesDaData, NOME_DO_TIPO } from '../lib/calendario.js';
import { aviso } from '../lib/avisos.js';
import { confirmar } from '../lib/confirmar.js';
import { cn } from '../lib/cn.js';

/*
 * PROGRAMAÇÃO › CALENDÁRIO (EXECUTOR D23).
 *
 * O dono: "a empresa poderá adicionar um calendário da empresa, importando
 * texto, e a IA cria todo o conteúdo e o cronograma de avisos, programado e
 * editável". Cola o texto → a IA lê as datas → a pessoa revisa → cada data
 * vira um aviso (modelo pronto, com a marca) que entra na TV N dias antes e
 * sai depois do dia. Editar ou apagar a data muda a TV junto.
 */
const TIPOS = Object.keys(NOME_DO_TIPO);
const EXEMPLO = '10/11 SIPAT — palestras às 15h no refeitório\n15/11 Feriado — não haverá expediente\n28/11 Confraternização às 18h';
const hojeIso = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const campo = 'rounded-md border border-line bg-surface px-2 py-1.5 text-sm text-ink';

function LinhaEditavel({ ev, onChange }) {
  const set = (k, v) => onChange({ ...ev, [k]: v });
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-[9rem_minmax(0,1fr)_9rem]">
      <input type="date" value={ev.data} onChange={(e) => set('data', e.target.value)} className={campo} aria-label="Data" />
      <div className="space-y-1.5">
        <input value={ev.titulo} maxLength={80} onChange={(e) => set('titulo', e.target.value)} className={cn(campo, 'w-full')} aria-label="O que é" placeholder="O que é" />
        <input value={ev.detalhe || ''} maxLength={200} onChange={(e) => set('detalhe', e.target.value)} className={cn(campo, 'w-full')} aria-label="Detalhe" placeholder="Hora, local, o que fazer (opcional)" />
      </div>
      <div className="space-y-1.5">
        <select value={ev.tipo} onChange={(e) => set('tipo', e.target.value)} className={cn(campo, 'w-full')} aria-label="Tipo">
          {TIPOS.map((t) => <option key={t} value={t}>{NOME_DO_TIPO[t]}</option>)}
        </select>
        <label className="flex items-center gap-1.5 text-xs text-ink-2">
          <input type="number" min={0} max={60} value={ev.antecedencia} onChange={(e) => set('antecedencia', Number(e.target.value))} className={cn(campo, 'w-14 px-1.5 py-1')} aria-label="Dias antes" />
          dias antes
        </label>
        {/* D24/D25: a mesma prioridade das peças — alta passa mais vezes; urgente toma a tela. */}
        <select value={ev.prioridade || 'normal'} onChange={(e) => set('prioridade', e.target.value)} className={cn(campo, 'w-full')} aria-label="Prioridade">
          <option value="normal">Prioridade normal</option>
          <option value="alta">Prioridade alta</option>
          <option value="urgente">Urgente (toma a tela)</option>
        </select>
      </div>
    </div>
  );
}

export function CalendarioPage({ onIr }) {
  const [eventos, setEventos] = useState(null);
  const [erro, setErro] = useState('');
  const [tentativa, setTentativa] = useState(0);
  const [tvs, setTvs] = useState([]);
  const [modelos, setModelos] = useState(null);
  const [marca, setMarca] = useState(null);
  const [texto, setTexto] = useState('');
  const [lendo, setLendo] = useState(false);
  const [lidos, setLidos] = useState(null);
  const [onde, setOnde] = useState('todas');
  const [aplicando, setAplicando] = useState(false);
  const [editando, setEditando] = useState(null);

  useEffect(() => {
    setErro(''); setEventos(null);
    calendario.listar().then((r) => setEventos((r && r.eventos) || [])).catch((e) => setErro(e.message || 'Não deu para abrir o calendário.'));
    devices.list().then((r) => setTvs((r && r.devices) || [])).catch(() => setTvs([]));
    carregarModelos().then((m) => setModelos(new Map(m.map((x) => [x.id, x])))).catch(() => setModelos(new Map()));
    brand.get().then((r) => {
      const k = (r && r.kit) || {};
      setMarca({ cores: k.cores || [], fonteTitulo: k.fonteTitulo || '', fonteApoio: k.fonteApoio || '', nome: (k.nome && k.nome !== 'Marca principal' ? k.nome : (r && r.empresa)) || '' });
    }).catch(() => setMarca({}));
  }, [tentativa]);

  const grupos = useMemo(() => [...new Set(tvs.map((t) => t.grupo).filter(Boolean))], [tvs]);
  const alvo = onde === 'todas' ? { tipo: 'todas' } : { tipo: 'grupo', nome: onde };
  const hoje = hojeIso();
  const proximos = (eventos || []).filter((e) => e.data >= hoje);
  const passados = (eventos || []).filter((e) => e.data < hoje);

  async function ler() {
    setLendo(true);
    try {
      const r = await calendario.ler(texto);
      const lista = ((r && r.eventos) || []).map((e) => ({ ...e, incluir: e.data >= hoje }));
      if (!lista.length) aviso.erro('calendario', 'Não achei nenhuma data no texto. Escreva uma por linha, como "15/11 Feriado".');
      setLidos(lista);
    } catch (e) { aviso.erro('calendario', e.message || 'Não deu para ler agora.'); }
    finally { setLendo(false); }
  }

  /*
   * Grava os eventos (com a peça de cada um) e põe na TV: cada TV recebe os
   * dela e perde os que não são mais dela. Depois marca onde entrou.
   */
  async function porNaProgramacao(lista) {
    if (!modelos || !marca) return;
    setAplicando(true);
    try {
      const comPeca = lista.map((e) => ({ ...e, item: pecaDoEvento(e, modelos, marca) }));
      const salvos = ((await calendario.salvar(comPeca)) || {}).eventos || [];
      // D26: todas as TVs de uma vez (tudo ou nada); cada uma com as datas dela.
      const dela = (tv) => salvos.filter((e) => telasDoEvento(e, tvs).some((t) => t.id === tv.id));
      const fora = (tv) => salvos.filter((e) => !dela(tv).includes(e) && (e.telas || []).includes(tv.id)).map((e) => e.id);
      await gravarEmLote(tvs.filter((tv) => dela(tv).length || fora(tv).length), (cfg, tv) => aplicarCalendario(cfg, dela(tv), fora(tv)), 'Calendário');
      for (const e of salvos) await calendario.atualizar(e.id, { ...e, telas: telasDoEvento(e, tvs).map((t) => t.id), aplicado: true });
      aviso.ok(salvos.length === 1 ? '“' + salvos[0].titulo + '” está na programação.' : salvos.length + ' datas na programação.');
      setLidos(null); setTexto(''); setEditando(null);
      setTentativa((n) => n + 1);
    } catch (e) { aviso.erro('calendario', e.message || 'Não deu para pôr na TV.'); }
    finally { setAplicando(false); }
  }

  async function apagar(ev) {
    if (!(await confirmar({ titulo: 'Tirar “' + ev.titulo + '”?', texto: 'Sai do calendário e das TVs em que estava.', botao: 'Tirar' }))) return;
    try {
      await gravarEmLote((ev.telas || []).map((id) => tvs.find((t) => t.id === id)).filter(Boolean), (cfg) => tirarDoCalendario(cfg, ev.id), 'Tirar: ' + ev.titulo);
      await calendario.apagar(ev.id);
      setTentativa((n) => n + 1);
    } catch (e) { aviso.erro('calendario', e.message || 'Não deu para tirar.'); }
  }

  if (erro) return <ErrorState title="Não deu para abrir o calendário" description={erro} onRetry={() => setTentativa((n) => n + 1)} />;
  if (!eventos) return <div className="flex justify-center py-16"><Spinner size={22} /></div>;

  const incluidos = (lidos || []).filter((e) => e.incluir);

  function Linha({ ev }) {
    const d = partesDaData(ev.data);
    const p = periodoDoEvento(ev);
    const naTv = (ev.telas || []).length;
    if (editando && editando.id === ev.id) {
      return (
        <li className="space-y-2 p-3">
          <LinhaEditavel ev={editando} onChange={setEditando} />
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" icon={X} onClick={() => setEditando(null)}>Cancelar</Button>
            <Button size="sm" variant="primary" icon={Check} disabled={aplicando || !editando.titulo || !editando.data} onClick={() => porNaProgramacao([editando])}>
              {aplicando ? 'Atualizando…' : 'Salvar e atualizar a TV'}
            </Button>
          </div>
        </li>
      );
    }
    return (
      <li className="flex items-center gap-3 p-3">
        <div className="w-12 shrink-0 rounded-lg bg-surface-2 py-1 text-center">
          <div className="text-lg font-bold leading-none text-ink">{d.dia}</div>
          <div className="text-2xs uppercase text-ink-3">{d.mes.slice(0, 3)}</div>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="truncate text-sm font-semibold text-ink">{ev.titulo}</span>
            <Badge>{NOME_DO_TIPO[ev.tipo] || 'Evento'}</Badge>
            {ev.prioridade !== 'normal' && <Badge tone="warn">{ev.prioridade === 'urgente' ? 'Urgente' : 'Alta'}</Badge>}
          </div>
          <div className="text-2xs text-ink-3">
            {naTv ? 'Na TV de ' + partesDaData(p.dataInicio).curta + ' a ' + d.curta + ' · ' + (naTv === 1 ? '1 TV' : naTv + ' TVs') : 'Fora da TV'}
            {ev.detalhe ? ' · ' + ev.detalhe : ''}
          </div>
        </div>
        <button type="button" onClick={() => setEditando({ ...ev })} aria-label={'Editar ' + ev.titulo} className="rounded p-1.5 text-ink-3 hover:bg-surface-2 hover:text-ink"><Pencil size={15} /></button>
        <button type="button" onClick={() => apagar(ev)} aria-label={'Tirar ' + ev.titulo} className="rounded p-1.5 text-ink-3 hover:bg-surface-2 hover:text-danger"><Trash2 size={15} /></button>
      </li>
    );
  }

  return (
    <div className="max-w-4xl space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-ink">Calendário da empresa</h1>
        <p className="mt-1 text-sm text-ink-2">Cole as datas (a lista do RH, um e-mail, a agenda). Cada uma vira um aviso com a sua marca, que aparece na TV alguns dias antes e sai depois do dia.</p>
      </div>

      <Panel>
        <PanelHeader title="Colar o calendário" description="A IA lê as datas; nada vai para a TV antes de você revisar." />
        <div className="space-y-2 p-4">
          <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={5} maxLength={8000} aria-label="Calendário em texto"
            placeholder={EXEMPLO} className={cn(campo, 'w-full font-mono text-xs leading-relaxed')} />
          <div className="flex justify-end">
            <Button variant="primary" icon={Sparkles} disabled={!texto.trim() || lendo} onClick={ler}>{lendo ? 'Lendo…' : 'Ler as datas'}</Button>
          </div>
        </div>
      </Panel>

      {lidos && lidos.length > 0 && (
        <Panel>
          <PanelHeader title="Revise antes de pôr na TV" description={lidos.length === 1 ? '1 data encontrada.' : lidos.length + ' datas encontradas. Desmarque o que não quer.'} />
          <ul className="divide-y divide-line">
            {lidos.map((ev, i) => (
              <li key={i} className={cn('flex gap-3 p-3', !ev.incluir && 'opacity-50')}>
                <input type="checkbox" checked={ev.incluir} onChange={() => setLidos((l) => l.map((x, j) => (j === i ? { ...x, incluir: !x.incluir } : x)))}
                  aria-label={'Incluir ' + ev.titulo} className="mt-2" />
                <div className="min-w-0 flex-1">
                  <LinhaEditavel ev={ev} onChange={(novo) => setLidos((l) => l.map((x, j) => (j === i ? novo : x)))} />
                  {ev.data < hoje && <p className="mt-1 text-2xs text-warn">Essa data já passou.</p>}
                </div>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line p-3">
            <label className="flex items-center gap-2 text-sm text-ink-2">
              <MonitorPlay size={15} /> Em
              <select value={onde} onChange={(e) => setOnde(e.target.value)} className={campo} aria-label="Em quais TVs">
                <option value="todas">todas as TVs</option>
                {grupos.map((g) => <option key={g} value={g}>o grupo {g}</option>)}
              </select>
            </label>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setLidos(null)}>Descartar</Button>
              <Button variant="primary" icon={CalendarDays} disabled={!incluidos.length || aplicando || !modelos || !marca}
                onClick={() => porNaProgramacao(incluidos.map(({ incluir, ...e }) => ({ ...e, alvo })))}> {/* eslint-disable-line no-unused-vars */}
                {aplicando ? 'Pondo…' : incluidos.length === 1 ? 'Pôr 1 data na programação' : 'Pôr ' + incluidos.length + ' datas na programação'}
              </Button>
            </div>
          </div>
          {!tvs.length && <p className="px-3 pb-3 text-xs text-ink-3">Você ainda não tem TV conectada: as datas ficam guardadas e entram na TV quando ela chegar.</p>}
        </Panel>
      )}

      <Panel>
        <PanelHeader title="Próximas datas" description={proximos.length ? undefined : 'Nenhuma data por vir.'} />
        {proximos.length ? (
          <ul className="divide-y divide-line">{proximos.map((ev) => <Linha key={ev.id} ev={ev} />)}</ul>
        ) : (
          <EmptyState icon={CalendarDays} title="Nenhuma data ainda"
            description="Cole o calendário acima: feriados, eventos, campanhas e avisos viram peças na TV, cada uma no seu período." />
        )}
      </Panel>
      {passados.length > 0 && (
        <details className="rounded-xl border border-line bg-surface">
          <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-ink-2">Já passaram ({passados.length})</summary>
          <ul className="divide-y divide-line">{passados.map((ev) => <Linha key={ev.id} ev={ev} />)}</ul>
        </details>
      )}
      {onIr && <p className="text-center text-2xs text-ink-3">As peças do calendário aparecem também na <button type="button" className="font-semibold text-accent hover:underline" onClick={() => onIr('programacao')}>Programação</button>, com o período de cada uma.</p>}
    </div>
  );
}
