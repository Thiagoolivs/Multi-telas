import React, { useEffect, useMemo, useState } from 'react';
import { CalendarDays, CalendarPlus, Sparkles, Trash2, Pencil, Check, X, MonitorPlay } from 'lucide-react';
import { Panel, PanelHeader } from '../components/ui/Panel.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Badge } from '../components/ui/Badge.jsx';
import { Spinner, EmptyState, ErrorState } from '../components/ui/Feedback.jsx';
import { calendario, devices, brand } from '../api.js';
import { carregarModelos } from '../lib/modelosOuro.js';
import { gravarEmLote } from '../lib/rodar.js';
import { pecaDoEvento, aplicarCalendario, tirarDoCalendario, telasDoEvento, partesDaData, situacaoDaData, NOME_DO_TIPO } from '../lib/calendario.js';
import { aviso, avisarPedidoDeAprovacao } from '../lib/avisos.js';
import { confirmar } from '../lib/confirmar.js';
import { cn } from '../lib/cn.js';
import { usePerfil } from '../lib/perfil.js';
import { SemanaDaTv } from '../components/agenda/SemanaDaTv.jsx';
import '../../../js/datas-br.js';
import '../../../js/datas-frente.js';

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
/*
 * Fase 11: as datas prontas da frente (js/datas-frente.js) — Dia das Mães,
 * Black Friday e Natal no Comércio; o calendário das cores da saúde na
 * Saúde; SIPAT, CIPA e confraternização na Empresas. Cada uma vai para a
 * programação com um toque, pelo mesmo caminho do "Colar o calendário".
 */
const DatasFrente = globalThis.MTDatasFrente;
const semAcento = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
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
        <select value={ev.prioridade || 'normal'} onChange={(e) => set('prioridade', e.target.value)} className={cn(campo, 'w-full')} aria-label="Importância">
          <option value="normal">Importância normal</option>
          <option value="alta">Importância alta</option>
          <option value="urgente">Urgente (toma a tela)</option>
        </select>
      </div>
    </div>
  );
}

export function CalendarioPage({ onIr }) {
  /*
   * O exemplo e o texto são da frente (QA de lançamento, 03/11): SIPAT no
   * refeitório e "a lista do RH" apareciam na padaria e na clínica.
   */
  const perfil = usePerfil();
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
  const [verTodas, setVerTodas] = useState(false);
  const [diasEscolhidos, setDiasEscolhidos] = useState({});
  // Fase 13: o membro de uma loja só vê e põe datas nas TVs das lojas dele (o servidor manda a lista e confere).
  const [lojas, setLojas] = useState(null);

  useEffect(() => {
    setErro(''); setEventos(null);
    calendario.listar().then((r) => { setEventos((r && r.eventos) || []); setLojas(Array.isArray(r && r.lojas) ? r.lojas : null); }).catch((e) => setErro(e.message || 'Não deu para abrir o calendário.'));
    devices.list().then((r) => setTvs((r && r.devices) || [])).catch(() => setTvs([]));
    carregarModelos().then((m) => setModelos(new Map(m.map((x) => [x.id, x])))).catch(() => setModelos(new Map()));
    brand.get().then((r) => {
      const k = (r && r.kit) || {};
      setMarca({ cores: k.cores || [], fonteTitulo: k.fonteTitulo || '', fonteApoio: k.fonteApoio || '', clima: k.clima || '', nome: (k.nome && k.nome !== 'Marca principal' ? k.nome : (r && r.empresa)) || '' });
    }).catch(() => setMarca({}));
  }, [tentativa]);

  const grupos = useMemo(() => [...new Set(tvs.map((t) => t.grupo).filter(Boolean))], [tvs]);
  const alvo = onde === 'todas' ? { tipo: 'todas' } : { tipo: 'grupo', nome: onde };
  const hoje = hojeIso();
  const proximos = (eventos || []).filter((e) => e.data >= hoje);
  const passados = (eventos || []).filter((e) => e.data < hoje);
  // As datas prontas que ainda não estão na Agenda (o mesmo nome no mesmo ano).
  const sugeridas = useMemo(() => {
    if (!DatasFrente || !eventos) return [];
    const ja = new Set(eventos.map((e) => semAcento(e.titulo) + '|' + String(e.data).slice(0, 4)));
    const jaSemDia = new Set(eventos.filter((e) => e.data >= hojeIso()).map((e) => semAcento(e.titulo)));
    return DatasFrente.proximas(perfil.id, new Date()).filter((d) => (d.data ? !ja.has(semAcento(d.titulo) + '|' + d.data.slice(0, 4)) : !jaSemDia.has(semAcento(d.titulo))));
  }, [eventos, perfil.id]);

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
      /*
       * Com a aprovação ligada, o servidor não marca a data como posta: ela
       * espera junto com o pedido (202) e a lista diz "Esperando aprovação".
       */
      let esperando = false;
      for (const e of salvos) {
        const r = await calendario.atualizar(e.id, { ...e, telas: telasDoEvento(e, tvs).map((t) => t.id), aplicado: true });
        if (r && r.esperandoAprovacao) esperando = true;
      }
      if (esperando) avisarPedidoDeAprovacao();
      else aviso.ok(salvos.length === 1 ? '“' + salvos[0].titulo + '” está na programação.' : salvos.length + ' datas na programação.');
      setLidos(null); setTexto(''); setEditando(null);
      setTentativa((n) => n + 1);
    } catch (e) { aviso.erro('calendario', e.message || 'Não deu para pôr na TV.'); }
    finally { setAplicando(false); }
  }

  async function apagar(ev) {
    if (!(await confirmar({ titulo: 'Tirar “' + ev.titulo + '”?', texto: 'Sai do calendário e das TVs em que estava.', botao: 'Tirar' }))) return;
    try {
      await gravarEmLote((ev.telas || []).map((id) => tvs.find((t) => t.id === id)).filter(Boolean), (cfg) => tirarDoCalendario(cfg, ev.id), 'Tirar: ' + ev.titulo);
      // Com a aprovação ligada, a data que está na TV fica "saindo" até o dono aprovar (o servidor responde 202).
      const r = await calendario.apagar(ev.id);
      if (r && r.esperandoAprovacao) avisarPedidoDeAprovacao();
      setTentativa((n) => n + 1);
    } catch (e) { aviso.erro('calendario', e.message || 'Não deu para tirar.'); }
  }

  if (erro) return <ErrorState title="Não deu para abrir o calendário" description={erro} onRetry={() => setTentativa((n) => n + 1)} />;
  if (!eventos) return <div className="flex justify-center py-16"><Spinner size={22} /></div>;

  const incluidos = (lidos || []).filter((e) => e.incluir);

  function Linha({ ev }) {
    const d = partesDaData(ev.data);
    // Na TV, esperando aprovação ou fora (com o porquê): o estado que o servidor manda (lib/calendario.js).
    const sit = situacaoDaData(ev);
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
            {sit.estado === 'esperando' && <Badge tone="warn">Esperando aprovação</Badge>}
          </div>
          <div className="text-2xs text-ink-3">
            {sit.estado === 'saindo' ? <span className="font-medium text-warn">{sit.texto}</span> : sit.texto}
            {ev.detalhe ? ' · ' + ev.detalhe : ''}
          </div>
          {(sit.nota || sit.pedido) && (
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-2xs">
              {sit.nota && <span className={sit.estado === 'fora' ? 'text-danger' : 'text-ink-2'}>{sit.nota}</span>}
              {sit.pedido && onIr && (
                <button type="button" onClick={() => onIr('aprovacoes')} className="font-semibold text-accent hover:underline">Ver em Aprovações</button>
              )}
            </div>
          )}
        </div>
        {ev.podeMudar === false ? <span className="shrink-0 text-2xs text-ink-3">Também em outras lojas</span> : (<>
          <button type="button" onClick={() => setEditando({ ...ev })} aria-label={'Editar ' + ev.titulo} className="rounded p-1.5 text-ink-3 hover:bg-surface-2 hover:text-ink"><Pencil size={15} /></button>
          {/* Saindo: já há um pedido para tirar; outro "Tirar" só trocaria o pedido. */}
          {sit.estado !== 'saindo' && <button type="button" onClick={() => apagar(ev)} aria-label={'Tirar ' + ev.titulo} className="rounded p-1.5 text-ink-3 hover:bg-surface-2 hover:text-danger"><Trash2 size={15} /></button>}
        </>)}
      </li>
    );
  }

  return (
    <div className="max-w-6xl space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-ink">Agenda</h1>
        <p className="mt-1 text-sm text-ink-2">O que passa na TV em cada dia e hora, e as datas {perfil.lugarDe}. Cole as datas ({perfil.textos.deOndeVemAsDatas}): cada uma vira um aviso com a sua marca, que entra na TV alguns dias antes e sai depois do dia.</p>
      </div>

      {/* Fase 8: a semana visual, com os buracos do dia à vista (BLOCO-8, wireframe D). */}
      <SemanaDaTv onIr={onIr} />

      <Panel>
        <PanelHeader title="Colar o calendário" description="A IA lê as datas; nada vai para a TV antes de você revisar." />
        <div className="space-y-2 p-4">
          <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={5} maxLength={8000} aria-label="Calendário em texto"
            placeholder={perfil.textos.datas} className={cn(campo, 'w-full font-mono text-xs leading-relaxed')} />
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
                <option value="todas">{!lojas ? 'todas as TVs' : lojas.length === 1 ? 'as TVs da sua loja' : 'as TVs das suas lojas'}</option>
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
        <PanelHeader title="Datas que vêm" description={proximos.length ? undefined : 'Nenhuma data sua por vir.'} />
        {proximos.length ? (
          <ul className="divide-y divide-line">{proximos.map((ev) => <Linha key={ev.id} ev={ev} />)}</ul>
        ) : !sugeridas.length && (
          <EmptyState icon={CalendarDays} title="Nenhuma data ainda" exemplo={['27/11', 'Black Friday', 'entra e sai da TV sozinha']}
            description="Cole o calendário acima: feriados, eventos, campanhas e avisos viram peças na TV, cada uma no seu período." />
        )}
        {sugeridas.length > 0 && (
          <div className="border-t border-line">
            <div className="px-4 pt-3 text-sm font-semibold text-ink">Datas prontas {perfil.lugarDe}</div>
            <p className="px-4 pb-1 text-sm text-ink-2">Um toque põe a data na programação: o aviso com a sua marca entra na TV alguns dias antes e sai depois do dia.</p>
            <ul className="divide-y divide-line">
              {(verTodas ? sugeridas : sugeridas.slice(0, 6)).map((d) => {
                const dia = d.semDia ? (diasEscolhidos[d.id] || '') : d.data;
                const p = dia ? partesDaData(dia) : null;
                return (
                  <li key={d.id} className="flex flex-wrap items-center gap-3 p-3">
                    <div className="w-12 shrink-0 rounded-lg bg-surface-2 py-1 text-center">
                      <div className="text-lg font-bold leading-none text-ink">{p ? (d.mesInteiro ? '01' : p.dia) : '?'}</div>
                      <div className="text-2xs uppercase text-ink-3">{p ? p.mes.slice(0, 3) : 'dia'}</div>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="truncate text-sm font-semibold text-ink">{d.titulo}</span>
                        <Badge>{NOME_DO_TIPO[d.tipo] || 'Evento'}</Badge>
                      </div>
                      <div className="text-sm text-ink-3">
                        {d.semDia ? 'Vocês escolhem o dia' : d.mesInteiro ? 'Na TV o mês todo' : 'Entra na TV ' + d.antecedencia + ' dias antes · ' + p.semana}
                        {d.detalhe ? ' · ' + d.detalhe : ''}
                      </div>
                    </div>
                    {d.semDia && (
                      <input type="date" value={dia} min={hoje} onChange={(e) => setDiasEscolhidos((x) => ({ ...x, [d.id]: e.target.value }))}
                        className={campo} aria-label={'Dia de ' + d.titulo} />
                    )}
                    <Button size="sm" variant="secondary" icon={CalendarPlus} disabled={!dia || aplicando || !modelos || !marca}
                      onClick={() => porNaProgramacao([{ data: dia, titulo: d.titulo, tipo: d.tipo, detalhe: d.detalhe, antecedencia: d.antecedencia, prioridade: 'normal', alvo }])}>
                      Pôr na programação
                    </Button>
                  </li>
                );
              })}
            </ul>
            {sugeridas.length > 6 && (
              <button type="button" onClick={() => setVerTodas((v) => !v)} className="w-full border-t border-line px-4 py-2.5 text-left text-sm font-medium text-accent hover:bg-surface-2">
                {verTodas ? 'Ver menos' : 'Ver todas as datas (' + sugeridas.length + ')'}
              </button>
            )}
          </div>
        )}
      </Panel>
      {passados.length > 0 && (
        <details className="rounded-xl border border-line bg-surface">
          <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-ink-2">Já passaram ({passados.length})</summary>
          <ul className="divide-y divide-line">{passados.map((ev) => <Linha key={ev.id} ev={ev} />)}</ul>
        </details>
      )}
    </div>
  );
}
