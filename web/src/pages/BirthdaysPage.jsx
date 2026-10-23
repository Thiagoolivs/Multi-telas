import React, { useMemo, useRef, useState } from 'react';
import { confirmar } from '../lib/confirmar.js';
import { UploadCloud, Trash2, Users, FileSpreadsheet, ImagePlus, Check, Plus, Pencil, Camera, Search } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader.jsx';
import { Panel, PanelHeader } from '../components/ui/Panel.jsx';
import { Button, IconButton } from '../components/ui/Button.jsx';
import { Dialog } from '../components/ui/Dialog.jsx';
import { Field, Input } from '../components/ui/Field.jsx';
import { Skeleton, ErrorState, EmptyState } from '../components/ui/Feedback.jsx';
import { useAsync } from '../lib/useAsync.js';
import { aviso } from '../lib/avisos.js';
import { lerPlanilha } from '../lib/planilha.js';
import { birthdays, media } from '../api.js';
import { MostrarNasTVs } from '../components/tela/MostrarNasTVs.jsx';
import { FotosPeloQR } from '../components/pessoas/FotosPeloQR.jsx';
import { ResumoDasPessoas } from '../components/pessoas/ResumoDasPessoas.jsx';
import '../../../js/pessoas.js';

/*
 * PESSOAS (EXECUTOR D30). Era "Aniversariantes": um CSV que, a cada
 * importação, apagava a lista inteira e regravava. Agora:
 *   - a planilha do RH em Excel (.xlsx) ou CSV, com setor separado do cargo;
 *   - antes de gravar, o que vai acontecer (novas, atualizadas, quem sai,
 *     quem fica) — pela mesma regra do servidor (js/pessoas.js);
 *   - importar de novo SINCRONIZA só o que veio da planilha: quem chegou
 *     pelo QR ou foi posto à mão fica, e a foto de quem continua não some;
 *   - a foto ligada a cada pessoa (trocar na linha, ou em lote pelo nome do
 *     arquivo), e pôr, editar ou tirar uma pessoa só.
 */
const P = globalThis.MTPessoas;
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const ORIGEM = { planilha: 'Planilha', qr: 'QR', manual: 'À mão' };
const MARCAS = new RegExp('[' + String.fromCharCode(0x300) + '-' + String.fromCharCode(0x36f) + ']', 'g');
const slug = (s) => String(s || '').normalize('NFD').replace(MARCAS, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
// Matrícula sem zeros à esquerda (1023 = 01023).
const semZeros = (s) => { const t = String(s || '').trim(); return t.replace(/^0+(?=.)/, ''); };
const data = (p) => String(p.dia).padStart(2, '0') + '/' + String(p.mes).padStart(2, '0');
const iniciais = (nome) => String(nome || '?').split(/\s+/).map((x) => x[0]).join('').slice(0, 2).toUpperCase();

function Rosto({ p, tamanho = 'h-9 w-9' }) {
  return p.foto
    ? <img src={p.foto} alt="" className={tamanho + ' rounded-full object-cover'} />
    : <span className={tamanho + ' flex items-center justify-center rounded-full bg-surface-2 text-2xs font-semibold text-ink-3'}>{iniciais(p.nome)}</span>;
}

function EditarPessoa({ pessoa, onFechar, onSalvo }) {
  const nova = !pessoa.id;
  const [f, setF] = useState({ nome: pessoa.nome || '', setor: pessoa.setor || '', cargo: pessoa.cargo || '', nascimento: pessoa.dia ? data(pessoa) : '', matricula: pessoa.matricula || '', email: pessoa.email || '' });
  const [salvando, setSalvando] = useState(false);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const valida = !!P.normalizar(f);
  async function salvar() {
    setSalvando(true);
    try {
      if (nova) await birthdays.criar(f); else await birthdays.atualizar(pessoa.id, f);
      aviso.ok(nova ? 'Pessoa na lista.' : 'Salvo.');
      onSalvo();
    } catch (e) { aviso.erro('pessoa', e.message || 'Não deu para salvar.'); }
    finally { setSalvando(false); }
  }
  return (
    <Dialog open onClose={onFechar} title={nova ? 'Pôr uma pessoa' : 'Editar ' + pessoa.nome} className="max-w-lg"
      footer={<>
        <Button variant="ghost" onClick={onFechar}>Cancelar</Button>
        <Button variant="primary" icon={Check} disabled={!valida || salvando} onClick={salvar}>{salvando ? 'Salvando…' : 'Salvar'}</Button>
      </>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nome" className="sm:col-span-2"><Input value={f.nome} onChange={set('nome')} maxLength={80} autoFocus /></Field>
        <Field label="Aniversário" hint="Dia e mês (DD/MM). O ano não é guardado."><Input value={f.nascimento} onChange={set('nascimento')} placeholder="15/03" maxLength={10} /></Field>
        <Field label="Setor"><Input value={f.setor} onChange={set('setor')} maxLength={60} placeholder="Ex.: Produção" /></Field>
        <Field label="Cargo"><Input value={f.cargo} onChange={set('cargo')} maxLength={80} /></Field>
        <Field label="Matrícula"><Input value={f.matricula} onChange={set('matricula')} maxLength={40} /></Field>
        <Field label="E-mail" hint="Opcional. Serve para a pessoa mandar a própria foto pelo QR." className="sm:col-span-2"><Input type="email" value={f.email} onChange={set('email')} maxLength={120} /></Field>
      </div>
    </Dialog>
  );
}

export function BirthdaysPage() {
  const { data: dados, loading, error, reload } = useAsync(birthdays.list);
  const planilhaRef = useRef(null);
  const fotosRef = useRef(null);
  const fotoDaLinhaRef = useRef(null);
  const [linhas, setLinhas] = useState(null);   // a planilha lida, antes de gravar
  const [fotos, setFotos] = useState({});        // chave do arquivo → url
  const [busy, setBusy] = useState('');
  const [editando, setEditando] = useState(null);
  const [fotoPara, setFotoPara] = useState(null);
  const [busca, setBusca] = useState('');
  // D34: quem está sem foto ou sem e-mail, num toque.
  const [filtro, setFiltro] = useState('todos');

  const lista = (dados && dados.birthdays) || [];

  // A foto de cada linha: pelo nome do arquivo = matrícula ou = nome da pessoa.
  const comFotos = useMemo(() => (linhas || []).map((l) => {
    const url = fotos['m:' + semZeros(l.matricula)] || fotos['n:' + slug(l.nome)];
    return url ? { ...l, foto: url } : l;
  }), [linhas, fotos]);
  const plano = useMemo(() => (linhas ? P.planoDeImportacao(lista, comFotos) : null), [linhas, comFotos, lista]);
  const saem = plano ? lista.filter((p) => plano.saem.includes(p.id)) : [];
  const casadas = linhas ? comFotos.filter((l, i) => l.foto && l.foto !== linhas[i].foto).length : 0;

  async function abrirPlanilha(e) {
    const f = (e.target.files || [])[0]; e.target.value = '';
    if (!f) return;
    try {
      const l = P.linhasDaPlanilha(await lerPlanilha(f));
      if (!l.length) { aviso.erro('planilha', 'Não achei pessoas nesta planilha: precisa de uma coluna "nome" e da data de nascimento.'); return; }
      setLinhas(l); setFotos({});
    } catch (err) { aviso.erro('planilha', err.message || 'Não deu para ler a planilha.'); }
  }

  async function abrirFotos(e) {
    const files = Array.from(e.target.files || []); e.target.value = '';
    if (!files.length) return;
    setBusy('fotos');
    const mapa = { ...fotos };
    let falhas = 0;
    for (const f of files) {
      const nome = (f.name || '').replace(/\.[^.]+$/, '');
      try {
        const up = await media.upload(f);
        if (/^\d+$/.test(nome.trim())) mapa['m:' + semZeros(nome)] = up.url;
        else mapa['n:' + slug(nome)] = up.url;
      } catch (err) { falhas++; }
    }
    setFotos(mapa);
    setBusy('');
    if (falhas) aviso.erro('fotos', falhas + ' foto(s) não subiram.');
  }

  async function importar() {
    setBusy('importar');
    try {
      const r = await birthdays.import(comFotos);
      aviso.ok('Lista atualizada: ' + [[r.entram, 'nova', 'novas'], [r.atualizam, 'atualizada', 'atualizadas'], [r.saem, 'saiu', 'saíram']].filter((x) => x[0]).map((x) => x[0] + ' ' + (x[0] === 1 ? x[1] : x[2])).join(', ') + '.');
      setLinhas(null); setFotos({});
      reload();
    } catch (err) { aviso.erro('importar', err.message || 'Não deu para importar.'); }
    finally { setBusy(''); }
  }

  async function trocarFoto(e) {
    const f = (e.target.files || [])[0]; e.target.value = '';
    const p = fotoPara; setFotoPara(null);
    if (!f || !p) return;
    setBusy('foto:' + p.id);
    try {
      const up = await media.upload(f);
      await birthdays.atualizar(p.id, { foto: up.url });
      reload();
    } catch (err) { aviso.erro('foto', err.message || 'Não deu para trocar a foto.'); }
    finally { setBusy(''); }
  }

  async function tirar(p) {
    if (!(await confirmar({ titulo: 'Tirar ' + p.nome + ' da lista?', texto: 'Sai do painel e da TV. Se estiver na planilha, volta na próxima importação.', botao: 'Tirar', perigo: true }))) return;
    try { await birthdays.remover(p.id); reload(); }
    catch (err) { aviso.erro('pessoa', err.message || 'Não deu para tirar.'); }
  }

  async function limparTudo() {
    if (!(await confirmar({ titulo: 'Apagar toda a lista?', texto: 'Todas as pessoas saem do painel e da TV, inclusive as que vieram pelo QR.', botao: 'Apagar a lista', perigo: true }))) return;
    await birthdays.clear();
    reload();
  }

  const q = slug(busca);
  const FILTROS = { todos: () => true, semFoto: (p) => !p.foto, semEmail: (p) => !p.email };
  const visiveis = lista.filter(FILTROS[filtro] || FILTROS.todos).filter((p) => !q || slug(p.nome + ' ' + p.setor + ' ' + p.cargo).includes(q));
  const irPara = (onde) => {
    if (onde === 'semFoto') setFiltro('semFoto');
    const alvo = document.getElementById(onde === 'fotos' ? 'fotos-pelo-qr' : 'lista-pessoas');
    if (alvo) alvo.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div>
      <PageHeader
        title="Pessoas"
        subtitle="A equipe: setor, foto e o aniversário de cada um, que a TV mostra sozinha."
        actions={<>
          <Button variant="secondary" icon={Plus} onClick={() => setEditando({})}>Pôr uma pessoa</Button>
          {lista.length ? <Button variant="ghost" icon={Trash2} onClick={limparTudo}>Limpar</Button> : null}
        </>}
      />

      {/* D34: o RH vê tudo de uma vez — pessoas, fotos para aprovar e os próximos aniversários. */}
      <ResumoDasPessoas onIr={irPara} recarregar={dados} />

      {/* Na TV, sozinho (D15): na semana do aniversário o cartão entra no rodízio; no dia, vira destaque. */}
      <div className="mb-4">
        <MostrarNasTVs qual="aniversarios" titulo="Mostrar nas TVs, na semana do aniversário"
          explicacao="Na semana, um cartão com os aniversariantes entra no rodízio da área principal; no dia, vira o destaque. Semana sem aniversário: nada aparece. As datas comemorativas continuam e se intercalam." />
      </div>

      {/* D31: a pessoa manda a própria foto pelo QR; o RH aprova aqui. */}
      <div id="fotos-pelo-qr" className="scroll-mt-20"><FotosPeloQR onAprovou={reload} /></div>

      <Panel className="mb-4">
        <PanelHeader title="Importar a planilha do RH"
          description="Excel (.xlsx) ou CSV com nome e nascimento; setor, cargo, matrícula, e-mail e foto, se tiver. Importar de novo atualiza: quem saiu da planilha sai, quem chegou pelo QR ou foi posto à mão fica." />
        <div className="p-4">
          <input ref={planilhaRef} type="file" accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden" onChange={abrirPlanilha} />
          <input ref={fotosRef} type="file" multiple accept="image/png,image/jpeg,image/webp" className="hidden" onChange={abrirFotos} />
          {!plano ? (
            <Button variant="secondary" icon={FileSpreadsheet} onClick={() => planilhaRef.current && planilhaRef.current.click()}>Escolher a planilha</Button>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2 text-xs" role="status">
                {[[plano.entram.length, ['nova', 'novas'], 'bg-ok-soft text-ok'], [plano.atualizam.length, ['atualizada', 'atualizadas'], 'bg-accent-soft text-accent'],
                  [plano.saem.length, ['sai da lista', 'saem da lista'], 'bg-warn-soft text-warn'], [plano.ficam, ['do QR ou à mão fica', 'do QR ou à mão ficam'], 'bg-surface-2 text-ink-2'],
                  [plano.ignoradas, ['linha sem nome ou data', 'linhas sem nome ou data'], 'bg-surface-2 text-ink-3']].filter(([n]) => n > 0).map(([n, t, c]) => (
                  <span key={t[0]} className={'rounded-full px-2.5 py-1 font-medium ' + c}>{n} {n === 1 ? t[0] : t[1]}</span>
                ))}
              </div>
              {saem.length > 0 && (
                <p className="text-xs text-ink-2">Não estão mais na planilha e saem: {saem.slice(0, 8).map((p) => p.nome).join(', ')}{saem.length > 8 ? ' e mais ' + (saem.length - 8) : ''}.</p>
              )}
              <div className="flex flex-wrap items-center gap-2 rounded-md border border-line bg-surface-2 p-3">
                <ImagePlus size={16} className="text-accent" />
                <span className="text-xs text-ink-2">Fotos (opcional): o nome do arquivo é a matrícula ou o nome da pessoa — <code>1023.jpg</code>, <code>ana-souza.jpg</code>.</span>
                <Button size="sm" variant="secondary" icon={UploadCloud} disabled={busy === 'fotos'} onClick={() => fotosRef.current && fotosRef.current.click()}>{busy === 'fotos' ? 'Enviando…' : 'Escolher fotos'}</Button>
                {Object.keys(fotos).length > 0 && <span className="text-xs text-ink-2"><Check size={12} className="mr-1 inline text-ok" />{casadas} de {Object.keys(fotos).length} casaram com alguém</span>}
              </div>
              <div className="flex gap-2">
                <Button variant="primary" icon={Check} disabled={busy === 'importar' || (!plano.entram.length && !plano.atualizam.length)} onClick={importar}>{busy === 'importar' ? 'Importando…' : 'Importar'}</Button>
                <Button variant="ghost" onClick={() => { setLinhas(null); setFotos({}); }}>Cancelar</Button>
              </div>
            </div>
          )}
        </div>
      </Panel>

      <Panel className="scroll-mt-20" id="lista-pessoas">
        <PanelHeader title="Quem está na lista" description={lista.length ? lista.length + (lista.length === 1 ? ' pessoa' : ' pessoas') : undefined}
          actions={lista.length > 12 ? (
            <label className="flex items-center gap-1.5 rounded-md border border-line bg-surface px-2 py-1 text-sm">
              <Search size={14} className="text-ink-3" />
              <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar nome ou setor" aria-label="Buscar pessoa" className="w-40 bg-transparent text-ink outline-none placeholder:text-ink-3" />
            </label>
          ) : null} />
        <input ref={fotoDaLinhaRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={trocarFoto} />
        {lista.length > 0 && (
          <div className="flex flex-wrap gap-1.5 border-b border-line px-4 py-2" role="group" aria-label="Filtrar a lista">
            {[['todos', 'Todos', lista.length], ['semFoto', 'Sem foto', lista.filter((p) => !p.foto).length], ['semEmail', 'Sem e-mail', lista.filter((p) => !p.email).length]].map(([id, nome, n]) => (
              <button key={id} type="button" aria-pressed={filtro === id} onClick={() => setFiltro(id)}
                className={'rounded-full border px-2.5 py-1 text-xs ' + (filtro === id ? 'border-accent bg-accent/10 font-semibold text-ink' : 'border-line text-ink-2 hover:border-ink-3')}>{nome} ({n})</button>
            ))}
          </div>
        )}
        {loading ? (
          <div className="space-y-2 p-4">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 rounded-md" />)}</div>
        ) : error ? (
          <ErrorState description="Não foi possível carregar." onRetry={reload} />
        ) : lista.length === 0 ? (
          <EmptyState icon={Users} title="Ninguém na lista ainda" description="Importe a planilha do RH ou ponha uma pessoa à mão." />
        ) : (
          <ul className="divide-y divide-line/60">
            {visiveis.map((p) => (
              <li key={p.id} className="flex items-center gap-3 px-4 py-2">
                <button type="button" onClick={() => { setFotoPara(p); fotoDaLinhaRef.current && fotoDaLinhaRef.current.click(); }}
                  className="group relative shrink-0 rounded-full" aria-label={'Trocar a foto de ' + p.nome} disabled={busy === 'foto:' + p.id}>
                  <Rosto p={p} />
                  <span className="absolute inset-0 hidden items-center justify-center rounded-full bg-black/50 text-white group-hover:flex"><Camera size={14} /></span>
                </button>
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate text-sm font-medium text-ink">{p.nome}</span>
                    {/* A planilha é o caminho de sempre; o selo marca só quem chegou por outro (e fica na próxima importação). */}
                    {p.origem && p.origem !== 'planilha' && <span className="shrink-0 rounded-full bg-accent-soft px-1.5 py-px text-2xs font-medium text-accent">{ORIGEM[p.origem]}</span>}
                  </div>
                  <div className="truncate text-xs text-ink-3">{[p.setor, p.cargo].filter(Boolean).join(' · ') || '—'}</div>
                </div>
                <span className="tnum shrink-0 text-sm text-ink-2">{data(p)} <span className="text-ink-3">({MESES[(p.mes || 1) - 1]})</span></span>
                <IconButton icon={Pencil} label={'Editar ' + p.nome} size={15} onClick={() => setEditando(p)} />
                <IconButton icon={Trash2} label={'Tirar ' + p.nome} size={15} className="hover:text-danger" onClick={() => tirar(p)} />
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {editando && <EditarPessoa pessoa={editando} onFechar={() => setEditando(null)} onSalvo={() => { setEditando(null); reload(); }} />}
    </div>
  );
}
