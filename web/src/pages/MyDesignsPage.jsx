import React, { useState, useEffect, Suspense, lazy, useMemo } from 'react';
import {
  Plus, Wand2, ImagePlus, Upload, Pencil, Download, Send, Trash2, Sparkles, Check,
  MonitorPlay, Search, FolderOpen, Copy, Type, CalendarClock, ShieldCheck, Rocket, MessagesSquare,
} from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader.jsx';
import { Panel, PanelHeader } from '../components/ui/Panel.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Field, Input, Textarea, Select } from '../components/ui/Field.jsx';
import { Dialog } from '../components/ui/Dialog.jsx';
import { Spinner, EmptyState } from '../components/ui/Feedback.jsx';
import { useAsync } from '../lib/useAsync.js';
import { ai, library, devices, deviceConfig, media } from '../api.js';
import { primaryZoneKey, defaultConfig, CONTENT_TYPES } from '../lib/contentTypes.js';
import { downloadComposition } from '../lib/exportPng.js';
import { DesignThumb } from '../components/content/DesignThumb.jsx';
import { BriefingChat } from '../components/content/BriefingChat.jsx';

const CompositionEditor = lazy(() => import('../components/content/CompositionEditor.jsx').then((m) => ({ default: m.CompositionEditor })));

// Formatos que fazem sentido numa TV deitada. Não sabemos a orientação de cada
// tela pareada, então este é só o PADRÃO da seleção — o usuário destrava os
// verticais quando a tela dele for de retrato.
const DEITADOS = ['16/9', '21/9'];

export function MyDesignsPage() {
  const { data, loading, reload } = useAsync(library.list);
  const { data: devData } = useAsync(devices.list);
  const screens = (devData && devData.devices) || [];
  const saved = (data && data.items) || [];

  const collections = useMemo(() => Array.from(new Set(saved.map((i) => i.campaign))).filter(Boolean), [saved]);

  const [q, setQ] = useState('');
  const [editing, setEditing] = useState(null);   // { id?, item } no editor
  const [saveItem, setSaveItem] = useState(null);  // { item } aguardando nome/coleção
  const [coll, setColl] = useState('');
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  /*
   * Publicar aceita uma peça só ou uma campanha inteira — o mesmo diálogo, para
   * o usuário não aprender dois fluxos. `pecas` é sempre uma lista.
   */
  const [pub, setPub] = useState(null); // { titulo, pecas: [{item, formato, label}] }
  const [alvos, setAlvos] = useState([]);         // ids de tela
  const [fmts, setFmts] = useState(DEITADOS);     // formatos incluídos
  const [substituir, setSubstituir] = useState(false);

  // Criar campanha com IA (diretor)
  const [aiOpen, setAiOpen] = useState(false);
  const [brief, setBrief] = useState('');
  const [empresa, setEmpresa] = useState('');
  const [publico, setPublico] = useState('');
  const [tom, setTom] = useState('');
  const [oferta, setOferta] = useState('');
  const [gen, setGen] = useState(null);
  const [aiColl, setAiColl] = useState('');
  const [etapa, setEtapa] = useState(null); // progresso do trabalho em andamento
  const [conversando, setConversando] = useState(false); // chat de briefing aberto
  const [emAndamento, setEmAndamento] = useState(false); // campanha rodando no servidor

  // Gerar imagem
  const [imgOpen, setImgOpen] = useState(false);
  const [iPrompt, setIPrompt] = useState('');
  const [iFormato, setIFormato] = useState('16/9');
  const [iEstilo, setIEstilo] = useState('fotográfico');

  function novoNaMao() { setEditing({ item: CONTENT_TYPES.composicao.make() }); }

  // Editor salvou: peça existente atualiza; nova vai para o diálogo de salvar.
  function onEditorSave(item) {
    if (editing && editing.id) {
      setBusy(true);
      library.update(editing.id, item, editing.label || '').then(() => { reload(); setMsg('Design atualizado.'); }).finally(() => setBusy(false));
      setEditing(null);
    } else {
      setEditing(null);
      setSaveItem({ item }); setColl(collections[0] || 'Meus Designs'); setLabel('');
    }
  }

  async function salvarDesign() {
    if (!saveItem) return;
    setBusy(true); setMsg('');
    try {
      const it = saveItem.item;
      await library.save(coll.trim() || 'Meus Designs', [{ formato: it.formato || '16/9', label: label.trim() || 'Design', item: it }]);
      setSaveItem(null); setMsg('Salvo em “' + (coll.trim() || 'Meus Designs') + '”.'); reload();
    } catch (e) { setMsg(e.message || 'Falha ao salvar'); }
    setBusy(false);
  }

  /* ---------------- Publicar (peça ou campanha) ---------------- */

  function abrirPublicar(titulo, pecas) {
    setPub({ titulo, pecas });
    setAlvos(screens.length === 1 ? [screens[0].id] : []);
    // Se a seleção padrão não cobrir nada, abre com tudo marcado — melhor que
    // um diálogo que parece quebrado por não ter nenhuma peça elegível.
    const disponiveis = Array.from(new Set(pecas.map((p) => p.formato || '16/9')));
    const padrao = disponiveis.filter((f) => DEITADOS.includes(f));
    setFmts(padrao.length ? padrao : disponiveis);
    setSubstituir(false);
  }

  const pecasElegiveis = pub ? pub.pecas.filter((p) => fmts.includes(p.formato || '16/9')) : [];

  async function publicar() {
    if (!pub || !alvos.length || !pecasElegiveis.length) return;
    setBusy(true); setMsg('');
    try {
      for (const id of alvos) {
        const dev = screens.find((s) => s.id === id);
        let cfg = null;
        try { cfg = await deviceConfig.get(id); } catch (e) { /* tela sem config ainda */ }
        if (!cfg) cfg = defaultConfig(dev ? dev.name : 'Tela');
        const zk = primaryZoneKey(cfg);
        if (!cfg.zonas) cfg.zonas = {};
        if (!cfg.zonas[zk] || !Array.isArray(cfg.zonas[zk].items)) cfg.zonas[zk] = { items: [] };
        // Marca a origem: é o que permite o resumo da tela dizer "isto veio da
        // campanha X" em vez de deixar o conteúdo parecer que apareceu sozinho.
        const novos = pecasElegiveis.map((p) => ({ ...p.item, _campanha: pub.titulo }));
        cfg.zonas[zk].items = substituir ? novos : cfg.zonas[zk].items.concat(novos);
        await deviceConfig.save(id, cfg);
      }
      const nTelas = alvos.length;
      setMsg(`${pecasElegiveis.length} peça(s) ${substituir ? 'substituíram a playlist de' : 'publicadas em'} ${nTelas} tela(s).`);
      setPub(null);
    } catch (e) { setMsg(e.message || 'Falha ao publicar'); }
    setBusy(false);
  }

  /* ---------------- Campanha com IA ---------------- */

  /*
   * A campanha roda no servidor. Fechar o diálogo, ir mexer noutra tela ou
   * recarregar o navegador NÃO cancela nada — antes o resultado se perdia e
   * parecia que o trabalho tinha sido abortado.
   *
   * Aqui o acompanhamento é destacado da janela: `emAndamento` fica na página
   * inteira, e se o usuário voltar depois a página retoma sozinha.
   */
  async function acompanhar(id) {
    setEmAndamento(true); setMsg('');
    try {
      const out = await ai.directorAcompanhar(id, setEtapa);
      if (!out) return;
      setGen(out);
      setAiColl(out.campanha || empresa || 'Campanha');
      setAiOpen(true); // traz o resultado de volta mesmo se a janela foi fechada
    } catch (e) { setMsg(e.message || 'Falha ao gerar'); }
    finally { setEmAndamento(false); setEtapa(null); }
  }

  // Ao abrir a página: se ficou uma campanha rodando, volta a acompanhar.
  useEffect(() => {
    const pend = ai.jobPendente();
    if (pend) acompanhar(pend.id);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function gerarCampanha(briefingPronto) {
    if (!brief.trim()) return;
    setConversando(false);
    setMsg(''); setEtapa({ etapa: 'começando', detalhe: '', segundos: 0 });
    try {
      const id = await ai.directorStart({
        brief: (briefingPronto && briefingPronto.briefing) || brief,
        empresa, publico, tom,
        oferta: (briefingPronto && briefingPronto.oferta) || oferta,
        briefingPronto: briefingPronto || null,
      });
      await acompanhar(id);
    } catch (e) { setMsg(e.message || 'Falha ao gerar'); setEtapa(null); }
  }

  function pecasDoGen() {
    if (!gen) return [];
    return gen.pecas.map((p) => ({ formato: p.formato, canal: p.canal, label: p.label, item: p.item }));
  }

  async function salvarCampanha(depoisPublicar) {
    if (!gen) return;
    setBusy(true);
    try {
      const nome = aiColl.trim() || 'Campanha';
      const pecas = pecasDoGen();
      await library.save(nome, pecas);
      setAiOpen(false); setBrief(''); reload();
      if (depoisPublicar) { setGen(null); abrirPublicar(nome, pecas); }
      else { setGen(null); setMsg('Campanha “' + nome + '” salva.'); }
    } catch (e) { setMsg(e.message || 'Falha ao salvar'); }
    setBusy(false);
  }

  /* ---------------- Ações de campanha inteira ---------------- */

  async function renomearCampanha(nome) {
    const novo = window.prompt('Novo nome da campanha:', nome);
    if (!novo || novo.trim() === nome) return;
    setBusy(true);
    try { await library.renameCampaign(nome, novo.trim()); reload(); setMsg('Campanha renomeada.'); }
    catch (e) { setMsg(e.message || 'Falha ao renomear'); }
    setBusy(false);
  }

  async function duplicarCampanha(nome) {
    setBusy(true);
    try { const r = await library.duplicateCampaign(nome); reload(); setMsg('Criada “' + r.campanha + '”.'); }
    catch (e) { setMsg(e.message || 'Falha ao duplicar'); }
    setBusy(false);
  }

  async function excluirCampanha(nome, quantas) {
    if (!window.confirm(`Excluir a campanha “${nome}” e suas ${quantas} peça(s)? Isso não pode ser desfeito.`)) return;
    setBusy(true);
    try { await library.removeCampaign(nome); reload(); setMsg('Campanha excluída.'); }
    catch (e) { setMsg(e.message || 'Falha ao excluir'); }
    setBusy(false);
  }

  /* ---------------- Imagem e importação ---------------- */

  async function gerarImagem() {
    if (!iPrompt.trim()) return;
    setBusy(true); setMsg('');
    try {
      const out = await ai.image({ prompt: iPrompt, formato: iFormato, estilo: iEstilo });
      const item = { type: 'composicao', formato: out.formato || iFormato, duracao: 12, bg: { kind: 'imagem', src: out.url }, elementos: [] };
      setImgOpen(false); setIPrompt('');
      setSaveItem({ item }); setColl(collections[0] || 'Imagens IA'); setLabel('Imagem IA');
    } catch (e) { setMsg(e.message || 'Falha ao gerar'); }
    setBusy(false);
  }

  async function onImport(e) {
    const f = (e.target.files || [])[0]; e.target.value = '';
    if (!f) return;
    setBusy(true); setMsg('');
    try {
      const up = await media.upload(f);
      const isPdf = /pdf$/i.test(f.type) || /\.pdf$/i.test(f.name);
      const item = isPdf
        ? { type: 'pptx', src: up.url, duracao: 20 }
        : { type: 'composicao', formato: '16/9', duracao: 12, bg: { kind: 'imagem', src: up.url }, elementos: [] };
      setSaveItem({ item }); setColl(collections[0] || 'Importados'); setLabel(f.name.replace(/\.[^.]+$/, '').slice(0, 40) || 'Importado');
    } catch (err) { setMsg(err.message || 'Falha ao importar'); }
    setBusy(false);
  }

  // Agrupa por coleção e aplica busca.
  const groups = {};
  for (const it of saved) {
    if (q && !((it.label || '') + ' ' + (it.campaign || '')).toLowerCase().includes(q.toLowerCase())) continue;
    (groups[it.campaign] = groups[it.campaign] || []).push(it);
  }
  const groupNames = Object.keys(groups);

  const CREATE = [
    { key: 'ia', title: 'Criar campanha com IA', desc: 'Uma frase vira a campanha inteira: peças, legendas e quando postar.', icon: Wand2, on: () => setAiOpen(true), accent: 'text-violet-400', destaque: true },
    { key: 'mao', title: 'Criar na mão', desc: 'Editor visual: fundo, texto, formas, ícones e imagens.', icon: Plus, on: novoNaMao, accent: 'text-accent' },
    { key: 'img', title: 'Gerar imagem IA', desc: 'Crie uma imagem por prompt e use como arte ou fundo.', icon: ImagePlus, on: () => setImgOpen(true), accent: 'text-sky-400' },
    { key: 'imp', title: 'Importar arquivo', desc: 'Suba um design do Canva (PNG/JPG) ou um PDF.', icon: Upload, on: null, accent: 'text-emerald-400' },
  ];

  return (
    <div>
      <PageHeader title="Meus Designs" subtitle="Crie na mão, com IA, gere imagens ou importe — tudo fica aqui, pronto para reaproveitar e publicar." />

      {/* Formas de criar — espaçoso no desktop */}
      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {CREATE.map((c) => {
          const Icon = c.icon;
          const inner = (
            <>
              <div className={'flex h-11 w-11 items-center justify-center rounded-xl ' + (c.destaque ? 'bg-accent-soft' : 'bg-surface-2')}><Icon size={22} className={c.accent} /></div>
              <div className="mt-3 text-sm font-semibold text-ink">{c.title}</div>
              <div className="mt-1 text-xs leading-snug text-ink-3">{c.desc}</div>
            </>
          );
          const base = 'rounded-xl border p-5 text-left transition hover:bg-surface-2 ' + (c.destaque ? 'border-accent/40 bg-surface hover:border-accent' : 'border-line bg-surface hover:border-accent/50');
          return c.on ? (
            <button key={c.key} onClick={c.on} className={base}>{inner}</button>
          ) : (
            <label key={c.key} className={'cursor-pointer ' + base}>
              {inner}
              <input type="file" accept="image/png,image/jpeg,image/webp,application/pdf" className="hidden" onChange={onImport} />
            </label>
          );
        })}
      </div>

      {/*
        Fica na PÁGINA, não na janela: é o que permite fechar o diálogo e ir
        mexer noutra coisa sabendo que a campanha continua sendo feita.
      */}
      {emAndamento && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-accent/40 bg-accent-soft/40 px-4 py-3">
          <Spinner size={16} />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-ink">
              Criando sua campanha{etapa && etapa.etapa ? ' · ' + etapa.etapa : ''}
            </div>
            <div className="truncate text-xs text-ink-3">
              {etapa && etapa.detalhe ? etapa.detalhe + ' · ' : ''}
              pode fechar e mexer em outra coisa — ela continua e aparece aqui quando ficar pronta
            </div>
          </div>
          {etapa && etapa.segundos != null && <span className="tnum text-xs text-ink-3">{etapa.segundos}s</span>}
        </div>
      )}

      {msg && <div className="mb-4 rounded-md border border-line bg-surface-2 px-3 py-2 text-sm text-ink-2">{msg}</div>}

      {/* Acervo */}
      <Panel>
        <PanelHeader title="Suas campanhas" description={saved.length ? `${saved.length} peça(s) em ${collections.length} campanha(s)` : undefined}
          actions={saved.length ? (
            <div className="relative">
              <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-3" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar…" className="w-44 rounded-md border border-line bg-surface py-1.5 pl-8 pr-2 text-sm text-ink placeholder:text-ink-3" />
            </div>
          ) : undefined} />
        {loading ? (
          <div className="p-6"><Spinner size={20} /></div>
        ) : saved.length === 0 ? (
          <EmptyState icon={Sparkles} title="Nada por aqui ainda"
            description="Comece por “Criar campanha com IA”: uma frase e você tem as peças prontas para colocar na TV." />
        ) : groupNames.length === 0 ? (
          <EmptyState icon={Search} title="Nenhum resultado" description="Tente outro termo de busca." />
        ) : (
          <div className="space-y-5 p-4">
            {groupNames.map((camp) => {
              const doGrupo = groups[camp];
              return (
                <div key={camp} className="rounded-xl border border-line">
                  {/* Cabeçalho da pasta: a campanha inteira é gerenciada aqui */}
                  <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
                    <FolderOpen size={15} className="text-ink-3" />
                    <span className="text-sm font-semibold text-ink">{camp}</span>
                    <span className="tnum text-2xs text-ink-3">{doGrupo.length} peça(s)</span>
                    <div className="flex-1" />
                    <button onClick={() => abrirPublicar(camp, doGrupo.map((it) => ({ item: it.item, formato: it.formato || '16/9', label: it.label })))}
                      className="flex items-center gap-1 rounded-md bg-accent px-2.5 py-1.5 text-2xs font-semibold text-white transition hover:opacity-90">
                      <Rocket size={12} /> Publicar campanha
                    </button>
                    <button title="Renomear" className="rounded-md border border-line p-1.5 text-ink-2 hover:bg-surface-2 hover:text-ink" onClick={() => renomearCampanha(camp)}><Type size={13} /></button>
                    <button title="Duplicar campanha" className="rounded-md border border-line p-1.5 text-ink-2 hover:bg-surface-2 hover:text-ink" onClick={() => duplicarCampanha(camp)}><Copy size={13} /></button>
                    <button title="Excluir campanha" className="rounded-md border border-line p-1.5 text-ink-2 hover:bg-surface-2 hover:text-danger" onClick={() => excluirCampanha(camp, doGrupo.length)}><Trash2 size={13} /></button>
                  </div>

                  <div className="grid grid-cols-2 gap-3 p-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                    {doGrupo.map((it) => (
                      <div key={it.id} className="space-y-2 rounded-lg border border-line bg-surface p-2">
                        <DesignThumb item={it.item} />
                        <div className="truncate px-0.5 text-2xs font-medium text-ink-2">{it.label}</div>
                        <div className="flex items-center gap-1">
                          <button onClick={() => abrirPublicar(it.label || camp, [{ item: it.item, formato: it.formato || '16/9', label: it.label }])}
                            className="flex flex-1 items-center justify-center gap-1 rounded-md bg-surface-2 px-2 py-1.5 text-2xs font-semibold text-ink-2 transition hover:bg-accent hover:text-white">
                            <Send size={12} /> Publicar
                          </button>
                          <button title="Editar" className="rounded-md border border-line p-1.5 text-ink-2 hover:bg-surface-2 hover:text-ink" onClick={() => setEditing({ id: it.id, item: it.item, label: it.label })}><Pencil size={13} /></button>
                          <button title="Baixar PNG" className="rounded-md border border-line p-1.5 text-ink-2 hover:bg-surface-2 hover:text-ink" onClick={() => downloadComposition(it.item, it.formato, it.label)}><Download size={13} /></button>
                          <button title="Excluir" className="rounded-md border border-line p-1.5 text-ink-2 hover:bg-surface-2 hover:text-danger" onClick={async () => { if (window.confirm('Excluir este design?')) { await library.remove(it.id); reload(); } }}><Trash2 size={13} /></button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Panel>

      {/* Editor de composição */}
      {editing && (
        <Suspense fallback={<div className="fixed inset-0 z-50 flex items-center justify-center bg-canvas/90"><Spinner size={22} /></div>}>
          <CompositionEditor value={editing.item} onClose={() => setEditing(null)} onSave={onEditorSave} />
        </Suspense>
      )}

      {/* Salvar design (nome + coleção) */}
      <Dialog open={!!saveItem} onClose={() => setSaveItem(null)} title="Salvar design" description="Escolha um nome e a campanha onde ele fica."
        footer={<><Button variant="ghost" onClick={() => setSaveItem(null)}>Cancelar</Button>
          <Button variant="primary" icon={Check} disabled={busy} onClick={salvarDesign}>{busy ? 'Salvando…' : 'Salvar'}</Button></>}>
        {saveItem && <div className="mb-3"><DesignThumb item={saveItem.item} /></div>}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Nome"><Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Ex.: Promo de inverno" /></Field>
          <Field label="Campanha">
            <Input list="colls" value={coll} onChange={(e) => setColl(e.target.value)} placeholder="Ex.: Inverno 2026" />
            <datalist id="colls">{collections.map((c) => <option key={c} value={c} />)}</datalist>
          </Field>
        </div>
      </Dialog>

      {/* Publicar — uma peça ou a campanha inteira, em uma ou várias telas */}
      <Dialog open={!!pub} onClose={() => setPub(null)} className="max-w-3xl"
        title={pub && pub.pecas.length > 1 ? 'Publicar campanha' : 'Publicar na tela'}
        description={pub && pub.pecas.length > 1
          ? 'Escolha as telas e quais formatos entram. Uma peça vertical não deve ir para uma TV deitada.'
          : 'Escolha em qual tela este design entra ao vivo.'}
        footer={<><Button variant="ghost" onClick={() => setPub(null)}>Cancelar</Button>
          <Button variant="primary" icon={Rocket} disabled={busy || !alvos.length || !pecasElegiveis.length} onClick={publicar}>
            {busy ? 'Publicando…' : `Publicar ${pecasElegiveis.length} peça(s)`}
          </Button></>}>
        {pub && (
          <div className="grid gap-4 sm:grid-cols-[1.1fr_1fr]">
            <div className="space-y-3">
              {/* Formatos: só aparece quando há mais de um em jogo */}
              {Array.from(new Set(pub.pecas.map((p) => p.formato || '16/9'))).length > 1 && (
                <div>
                  <div className="mb-1.5 text-2xs font-semibold uppercase tracking-wide text-ink-3">Formatos a publicar</div>
                  <div className="flex flex-wrap gap-1.5">
                    {Array.from(new Set(pub.pecas.map((p) => p.formato || '16/9'))).map((f) => {
                      const on = fmts.includes(f);
                      return (
                        <button key={f} onClick={() => setFmts((a) => (on ? a.filter((x) => x !== f) : a.concat(f)))}
                          className={'rounded-md border px-2.5 py-1 text-2xs font-semibold transition ' + (on ? 'border-accent bg-accent-soft text-accent' : 'border-line text-ink-3 hover:text-ink')}>
                          {f}{on && ' ✓'}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              <div className="grid grid-cols-3 gap-2">
                {pecasElegiveis.slice(0, 6).map((p, i) => <DesignThumb key={i} item={p.item} />)}
              </div>
              <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-line p-2.5 text-xs text-ink-2">
                <input type="checkbox" checked={substituir} onChange={(e) => setSubstituir(e.target.checked)} className="mt-0.5" />
                <span>
                  <b className="text-ink">Substituir a playlist</b>
                  <span className="block text-ink-3">Apaga o que já estava na tela e deixa só esta campanha. Sem marcar, as peças entram no fim da lista.</span>
                </span>
              </label>
            </div>
            <div>
              {screens.length ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="text-2xs font-semibold uppercase tracking-wide text-ink-3">Telas</div>
                    <div className="flex-1" />
                    <button className="text-2xs text-accent hover:underline"
                      onClick={() => setAlvos(alvos.length === screens.length ? [] : screens.map((s) => s.id))}>
                      {alvos.length === screens.length ? 'limpar' : 'todas'}
                    </button>
                  </div>
                  <div className="max-h-72 space-y-1.5 overflow-y-auto pr-1">
                    {screens.map((s) => {
                      const on = alvos.includes(s.id);
                      return (
                        <button key={s.id} onClick={() => setAlvos((a) => (on ? a.filter((x) => x !== s.id) : a.concat(s.id)))}
                          className={'flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition ' + (on ? 'border-accent bg-accent-soft text-ink' : 'border-line text-ink-2 hover:bg-surface-2')}>
                          <MonitorPlay size={16} className={on ? 'text-accent' : 'text-ink-3'} />
                          <span className="flex-1 truncate">{s.name || s.code || s.id}</span>
                          {on && <Check size={15} className="text-accent" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-line p-4 text-sm text-ink-3">Nenhuma tela pareada. Pareie uma TV em <b>Telas</b> e volte aqui — a campanha continua salva.</div>
              )}
            </div>
          </div>
        )}
      </Dialog>

      {/* Criar campanha com IA — o diretor de arte */}
      <Dialog open={aiOpen} onClose={() => { setAiOpen(false); setGen(null); }} className="max-w-4xl"
        title="Criar campanha com IA"
        description="Descreva em uma frase. A IA lê a sua Marca, monta as peças, escreve as legendas e diz quando postar."
        footer={gen
          ? (<>
            <Button variant="ghost" onClick={() => setGen(null)}>Voltar</Button>
            <Button variant="secondary" icon={Check} disabled={busy} onClick={() => salvarCampanha(false)}>{busy ? 'Salvando…' : 'Só salvar'}</Button>
            <Button variant="primary" icon={Rocket} disabled={busy} onClick={() => salvarCampanha(true)}>Salvar e publicar</Button>
          </>)
          : conversando
            ? <Button variant="ghost" onClick={() => setConversando(false)}>Voltar</Button>
            : (<>
              <Button variant="ghost" onClick={() => setAiOpen(false)}>Cancelar</Button>
              {/*
                Duas saídas: conversar melhora a campanha, gerar direto é mais
                rápido. Nenhuma das duas é escondida — quem tem pressa não pode
                ser obrigado a passar pela conversa.
              */}
              <Button variant="secondary" icon={Wand2} disabled={emAndamento || !brief.trim()} onClick={() => gerarCampanha(null)}>
                {emAndamento ? 'Dirigindo…' : 'Gerar direto'}
              </Button>
              <Button variant="primary" icon={MessagesSquare} disabled={emAndamento || !brief.trim()} onClick={() => setConversando(true)}>
                Refinar conversando
              </Button>
            </>)}>
        {emAndamento && etapa ? (
          /*
           * A campanha leva minutos. Mostrar a etapa em texto é o que separa
           * "está pensando" de "travou" — e é honesto: são as etapas reais.
           */
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <Spinner size={26} />
            <div>
              <div className="text-sm font-semibold text-ink">{etapa.etapa || 'trabalhando'}</div>
              {etapa.detalhe && <div className="mt-0.5 text-xs text-ink-3">{etapa.detalhe}</div>}
            </div>
            <div className="tnum text-2xs text-ink-3">{etapa.segundos || 0}s · uma campanha completa leva um ou dois minutos</div>
          </div>
        ) : conversando ? (
          <BriefingChat
            empresa={empresa} segmento=""
            primeiraFala={brief}
            onPronto={(resumo) => gerarCampanha(resumo)}
            onPular={() => gerarCampanha(null)}
          />
        ) : !gen ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Field label="O que você quer anunciar?" hint="Uma frase basta. A IA transforma isso num briefing antes de desenhar.">
                <Textarea rows={2} value={brief} onChange={(e) => setBrief(e.target.value)} placeholder="Ex.: promoção de café da manhã até domingo" />
              </Field>
            </div>
            <Field label="Empresa"><Input value={empresa} onChange={(e) => setEmpresa(e.target.value)} placeholder="Sua empresa" /></Field>
            <Field label="Público-alvo"><Input value={publico} onChange={(e) => setPublico(e.target.value)} placeholder="Ex.: 25-45, classe A/B" /></Field>
            <Field label="Tom">
              <Select value={tom} onChange={(e) => setTom(e.target.value)}>
                <option value="">Usar o tom da minha Marca</option><option value="sofisticado">Sofisticado</option><option value="energético">Energético</option>
                <option value="corporativo">Corporativo</option><option value="divertido">Divertido</option><option value="minimalista">Minimalista</option>
              </Select>
            </Field>
            <Field label="Oferta / CTA"><Input value={oferta} onChange={(e) => setOferta(e.target.value)} placeholder="Ex.: 30% off até domingo" /></Field>
            <div className="sm:col-span-2 flex items-start gap-1.5 rounded-lg border border-line bg-surface-2 p-2.5 text-2xs leading-snug text-ink-3">
              <ShieldCheck size={13} className="mt-0.5 shrink-0 text-ink-3" />
              As cores, fontes, logo e fotos vêm da sua <b className="text-ink-2">Marca</b>. O que você preencher aqui tem prioridade sobre ela.
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <Field label="Nome da campanha"><Input value={aiColl} onChange={(e) => setAiColl(e.target.value)} /></Field>

            {gen.briefing && (gen.briefing.objetivo || gen.briefing.argumento) && (
              <div className="rounded-lg border border-line bg-surface-2 p-3 text-xs leading-relaxed text-ink-2">
                <div className="mb-1 text-2xs font-semibold uppercase tracking-wide text-ink-3">O que a IA entendeu</div>
                {gen.briefing.objetivo && <div><b className="text-ink">Objetivo:</b> {gen.briefing.objetivo}</div>}
                {gen.briefing.publico && <div><b className="text-ink">Público:</b> {gen.briefing.publico}</div>}
                {gen.briefing.argumento && <div><b className="text-ink">Argumento:</b> {gen.briefing.argumento}</div>}
              </div>
            )}

            <div>
              <div className="mb-1.5 flex items-center gap-2 text-2xs font-semibold uppercase tracking-wide text-ink-3">
                Peças
                {gen.revisao && gen.revisao.refeitas > 0 && (
                  <span className="rounded bg-surface-2 px-1.5 py-0.5 font-medium normal-case tracking-normal text-ink-3">
                    a IA refez {gen.revisao.refeitas} de {gen.revisao.avaliadas} para melhorar a leitura
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {gen.pecas.map((p, i) => (
                  <div key={i} className="space-y-1">
                    <DesignThumb item={p.item} />
                    <span className="block truncate text-2xs text-ink-3">{p.canal} · {p.formato}{p.usouAcervo ? ' · foto sua' : ''}</span>
                    {/*
                      O que a IA viu de errado e não conseguiu resolver. Mostrar
                      é o que permite ao usuário editar em vez de publicar torto
                      — esconder seria mentir sobre a qualidade da peça.
                    */}
                    {p.problemas && p.problemas.length > 0 && (
                      <div className="rounded border border-line bg-surface-2 px-1.5 py-1 text-2xs leading-snug text-ink-3">
                        <span className="font-semibold text-ink-2">revisar:</span> {p.problemas[0]}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {gen.social && (gen.social.instagram || gen.social.whatsapp) && (
              <div className="grid gap-2 sm:grid-cols-2">
                {['instagram', 'whatsapp', 'linkedin'].filter((k) => gen.social[k]).map((k) => (
                  <div key={k} className="rounded-lg border border-line p-2.5">
                    <div className="mb-1 flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wide text-ink-3">
                      {k}
                      <button className="ml-auto font-medium normal-case tracking-normal text-accent hover:underline"
                        onClick={() => navigator.clipboard && navigator.clipboard.writeText(gen.social[k])}>copiar</button>
                    </div>
                    <div className="max-h-24 overflow-y-auto whitespace-pre-wrap text-2xs leading-relaxed text-ink-2">{gen.social[k]}</div>
                  </div>
                ))}
              </div>
            )}

            {gen.agenda && gen.agenda.length > 0 && (
              <div className="rounded-lg border border-line p-2.5">
                <div className="mb-1.5 flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wide text-ink-3"><CalendarClock size={12} /> Quando postar</div>
                <ul className="space-y-1 text-2xs text-ink-2">
                  {gen.agenda.map((a, i) => (
                    <li key={i}><b className="text-ink">{a.quando}</b> · {a.canal} — <span className="text-ink-3">{a.motivo}</span></li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </Dialog>

      {/* Gerar imagem */}
      <Dialog open={imgOpen} onClose={() => setImgOpen(false)} title="Gerar imagem com IA" description="A imagem gerada vira um design (você nomeia e salva)."
        footer={<><Button variant="ghost" onClick={() => setImgOpen(false)}>Cancelar</Button><Button variant="primary" icon={ImagePlus} disabled={busy || !iPrompt.trim()} onClick={gerarImagem}>{busy ? 'Gerando…' : 'Gerar'}</Button></>}>
        <div className="grid gap-3">
          <Field label="Descrição"><Textarea rows={3} value={iPrompt} onChange={(e) => setIPrompt(e.target.value)} placeholder="Ex.: xícara de café fumegante, luz quente, fundo desfocado." /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Formato">
              <Select value={iFormato} onChange={(e) => setIFormato(e.target.value)}>
                <option value="16/9">TV paisagem (16:9)</option><option value="9/16">TV retrato (9:16)</option><option value="1/1">Quadrado (1:1)</option><option value="21/9">Banner (21:9)</option>
              </Select>
            </Field>
            <Field label="Estilo">
              <Select value={iEstilo} onChange={(e) => setIEstilo(e.target.value)}>
                {['fotográfico', 'ilustração', '3D', 'flat/vetorial', 'minimalista', 'vibrante'].map((s) => <option key={s} value={s}>{s}</option>)}
              </Select>
            </Field>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
