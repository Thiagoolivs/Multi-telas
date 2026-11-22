import React, { useState } from 'react';
import { PlugZap, Plus, Trash2, KeyRound, Copy, Check, AlertTriangle, FolderOpen, Sheet, Rss, Megaphone, RefreshCw, History, Ban, Download, Code2, Settings2 } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader.jsx';
import { Panel, PanelHeader } from '../components/ui/Panel.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Badge } from '../components/ui/Badge.jsx';
import { Dialog } from '../components/ui/Dialog.jsx';
import { Field, Input, Select, Checkbox } from '../components/ui/Field.jsx';
import { EmptyState, ErrorState, SkeletonRows } from '../components/ui/Feedback.jsx';
import { useAsync } from '../lib/useAsync.js';
import { aviso } from '../lib/avisos.js';
import { confirmar } from '../lib/confirmar.js';
import { integracoes, devices } from '../api.js';

/*
 * INTEGRAÇÕES (docs/INTEGRACOES.md). O servidor do MultiTelas está na nuvem
 * e não alcança a rede da empresa: a pasta onde o RH guarda os avisos, a
 * planilha do cardápio, a intranet. O Conector MultiTelas, um programa
 * pequeno num PC lá dentro, manda tudo para cá sozinho. Aqui o dono decide o
 * que existe (as pastas, as planilhas, os feeds), para quais TVs cada coisa
 * vai, e se precisa de aprovação — o Conector só manda o conteúdo.
 *
 * Feito para a pessoa do RH: o estado de cada coisa em palavras ("na TV há
 * 5 min", "esperando aprovação", "não deu: …"), e o técnico (o token, o
 * curl) só nas caixas de instalar e da intranet.
 */

function haQuanto(t) {
  if (!t) return 'nunca';
  const min = Math.round((Date.now() - t) / 60000);
  if (min < 1) return 'agora';
  if (min < 60) return 'há ' + min + ' min';
  const h = Math.round(min / 60);
  return h < 24 ? 'há ' + h + ' h' : 'há ' + Math.round(h / 24) + ' dias';
}
const quando = (t) => (t ? new Date(t).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '');
const tamanho = (b) => (b >= 1048576 ? (b / 1048576).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB');

function Copiar({ texto, rotulo }) {
  return (
    <Button size="sm" variant="ghost" icon={Copy} onClick={() => { navigator.clipboard.writeText(texto).then(() => aviso.ok('Copiado.'), () => {}); }}>{rotulo || 'Copiar'}</Button>
  );
}
function Codigo({ texto }) {
  return <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-md bg-surface-2 p-2 font-mono text-[11px] text-ink">{texto}</pre>;
}

// "Todas as TVs", "2 TVs e o grupo Recepção", "Nenhuma TV escolhida".
function descreverAlvo(alvo, telas) {
  const a = alvo || {};
  if (a.todas) return 'Todas as TVs';
  const partes = [];
  const n = (a.telas || []).filter((id) => telas.some((t) => t.id === id)).length;
  if (n) partes.push(n === 1 ? '1 TV' : n + ' TVs');
  for (const g of a.grupos || []) partes.push('o grupo ' + g);
  return partes.length ? partes.join(' e ') : 'Nenhuma TV escolhida';
}

function EscolherTvs({ telas, alvo, onChange }) {
  const a = alvo || { todas: false, telas: [], grupos: [] };
  const grupos = [...new Set(telas.map((t) => t.grupo).filter(Boolean))];
  const alterna = (lista, x) => (lista.includes(x) ? lista.filter((y) => y !== x) : lista.concat(x));
  return (
    <div className="space-y-2 rounded-lg border border-line p-3">
      <div className="text-xs font-medium text-ink-2">Em quais TVs</div>
      <Checkbox label="Todas as TVs (as novas entram sozinhas)" checked={!!a.todas} onChange={(e) => onChange({ ...a, todas: e.target.checked })} />
      {!a.todas && (
        <>
          {grupos.length > 0 && (
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {grupos.map((g) => <Checkbox key={g} label={'Grupo ' + g} checked={(a.grupos || []).includes(g)} onChange={() => onChange({ ...a, grupos: alterna(a.grupos || [], g) })} />)}
            </div>
          )}
          <div className="grid gap-1 sm:grid-cols-2">
            {telas.map((t) => <Checkbox key={t.id} label={(t.name || 'TV') + (t.grupo ? ' · ' + t.grupo : '')} checked={(a.telas || []).includes(t.id)} onChange={() => onChange({ ...a, telas: alterna(a.telas || [], t.id) })} />)}
          </div>
          {!telas.length && <p className="text-xs text-ink-3">Nenhuma TV ligada ainda.</p>}
        </>
      )}
    </div>
  );
}

// Zona e aprovação: o que vale para a pasta e para os comunicados.
function OndeEAprovacao({ f, set }) {
  return (
    <>
      <Field label="Onde na tela" hint="Sem a lateral na TV, vai para a área principal.">
        <Select value={f.zona || 'principal'} onChange={(e) => set('zona', e.target.value)}>
          <option value="principal">Área principal</option>
          <option value="lateral">Lateral</option>
        </Select>
      </Field>
      <Checkbox label="Precisa de aprovação: cada mudança espera o dono aprovar (em Aprovações) antes de ir para a TV" checked={!!f.aprovacao} onChange={(e) => set('aprovacao', e.target.checked)} />
    </>
  );
}

const NOVO = { pasta: 'Ligar uma pasta', planilha: 'Ligar uma planilha', feed: 'Ligar um feed' };
function FonteDialog({ integ, fonte, tipo, telas, onFechar, onSalvo }) {
  const novo = !fonte;
  const t = fonte ? fonte.tipo : tipo;
  const c = (fonte && fonte.config) || {};
  const [f, setF] = useState({
    nome: (fonte && fonte.nome) || '', chave: (fonte && fonte.chave) || '',
    alvo: c.alvo || { todas: true, telas: [], grupos: [] }, zona: c.zona || 'principal', aprovacao: !!c.aprovacao,
    segundos: c.segundos || 10, ordem: c.ordem || 'nome', ajuste: c.ajuste || 'inteira', uso: c.uso || 'precos',
    url: c.url || '', formato: c.formato || 'rss', mapa: Object.assign({ lista: '', id: '', titulo: '', texto: '', imagem: '', link: '', inicio: '', fim: '' }, c.mapa || {}),
  });
  const [salvando, setSalvando] = useState(false);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  async function salvar() {
    setSalvando(true);
    try {
      const corpo = { nome: f.nome, chave: f.chave || undefined };
      if (t === 'pasta') Object.assign(corpo, { alvo: f.alvo, zona: f.zona, aprovacao: f.aprovacao, segundos: Number(f.segundos), ordem: f.ordem, ajuste: f.ajuste });
      if (t === 'planilha' && novo) corpo.uso = f.uso;
      if (t === 'feed') Object.assign(corpo, { url: f.url, formato: f.formato }, f.formato === 'json' ? { mapa: f.mapa } : {});
      if (novo) await integracoes.criarFonte(integ.id, Object.assign({ tipo: t }, corpo));
      else await integracoes.atualizarFonte(integ.id, fonte.id, corpo);
      aviso.ok(novo ? 'Pronto. O Conector pega a novidade no próximo minuto.' : 'Salvo.');
      onSalvo();
    } catch (e) { aviso.erro('integracoes', e.message || 'Não deu para salvar.'); }
    finally { setSalvando(false); }
  }
  return (
    <Dialog open onClose={onFechar} title={novo ? NOVO[t] : fonte.nome} className="max-w-2xl"
      description={t === 'pasta' ? 'Uma pasta do compartilhamento da rede. O que o RH salvar nela entra na TV sozinho; o que apagar, sai.'
        : t === 'planilha' ? 'Uma planilha da rede (Excel). Quando ela muda, a TV muda junto.'
          : 'Um feed da intranet (RSS ou JSON). Cada notícia vira um comunicado na TV.'}
      footer={<Button variant="primary" icon={Check} disabled={salvando || !f.nome.trim() || (t === 'feed' && !f.url.trim())} onClick={salvar}>{salvando ? 'Salvando…' : 'Salvar'}</Button>}>
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Nome"><Input value={f.nome} onChange={(e) => set('nome', e.target.value)} maxLength={60} placeholder={t === 'pasta' ? 'Ex.: Avisos do RH' : t === 'planilha' ? 'Ex.: Cardápio do refeitório' : 'Ex.: Notícias da intranet'} /></Field>
          {/* O nome curto não muda depois de criado: o conector.json e os comunicados apontam para ele. */}
          <Field label="Nome curto (o Conector usa)" hint={novo ? 'Letras, números e traço. Vazio: sai do nome. Não muda depois.' : 'Não muda depois de criado (o Conector usa).'}><Input value={f.chave} disabled={!novo} onChange={(e) => set('chave', e.target.value)} maxLength={40} placeholder={t === 'pasta' ? 'avisos-rh' : t === 'planilha' ? 'cardapio' : 'noticias'} /></Field>
        </div>
        {t === 'pasta' && (
          <>
            <EscolherTvs telas={telas} alvo={f.alvo} onChange={(a) => set('alvo', a)} />
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Cada foto fica (segundos)"><Input type="number" min={3} max={120} value={f.segundos} onChange={(e) => set('segundos', e.target.value)} /></Field>
              <Field label="Ordem">
                <Select value={f.ordem} onChange={(e) => set('ordem', e.target.value)}>
                  <option value="nome">Pelo nome do arquivo</option>
                  <option value="data">O mais novo primeiro</option>
                </Select>
              </Field>
              <Field label="A foto">
                <Select value={f.ajuste} onChange={(e) => set('ajuste', e.target.value)}>
                  <option value="inteira">Inteira (sem cortar)</option>
                  <option value="preencher">Preenchendo a tela (pode cortar)</option>
                </Select>
              </Field>
            </div>
            <OndeEAprovacao f={f} set={set} />
            <p className="text-xs text-ink-3">Entram fotos (JPG, PNG, WEBP) e vídeos MP4. Apresentação (PowerPoint ou PDF): o Conector salva cada slide como imagem, e eles passam juntos, na ordem.</p>
          </>
        )}
        {t === 'planilha' && novo && (
          <Field label="O que a planilha tem" hint="Escolhido uma vez. Os preços aparecem em Preços da planilha; os números, em Indicadores.">
            <Select value={f.uso} onChange={(e) => set('uso', e.target.value)}>
              <option value="precos">Preços ou cardápio (item; preço; seção)</option>
              <option value="indicadores">Indicadores (nome; valor; meta)</option>
            </Select>
          </Field>
        )}
        {t === 'planilha' && !novo && <p className="text-sm text-ink-2">{c.uso === 'indicadores' ? 'Os números aparecem em Indicadores, e vão para a TV por lá.' : 'Os preços aparecem em Preços da planilha, e vão para a TV por lá.'}</p>}
        {t === 'feed' && (
          <>
            <Field label="Endereço do feed na intranet" hint="Pode ser interno (http://intranet/…): quem lê é o Conector, dentro da empresa."><Input value={f.url} onChange={(e) => set('url', e.target.value)} maxLength={500} placeholder="http://intranet.empresa.local/noticias/rss" /></Field>
            <Field label="Formato" className="max-w-xs">
              <Select value={f.formato} onChange={(e) => set('formato', e.target.value)}>
                <option value="rss">RSS</option>
                <option value="json">JSON</option>
              </Select>
            </Field>
            {f.formato === 'json' && (
              <div>
                <div className="mb-1 text-xs font-semibold text-ink">Onde estão as notícias no JSON</div>
                <div className="grid gap-2 sm:grid-cols-4">
                  {[['lista', 'Lista'], ['id', 'Id'], ['titulo', 'Título'], ['texto', 'Texto'], ['imagem', 'Imagem'], ['link', 'Link'], ['inicio', 'Início'], ['fim', 'Fim']].map(([k, r]) => (
                    <Field key={k} label={r}><Input value={f.mapa[k]} onChange={(e) => set('mapa', { ...f.mapa, [k]: e.target.value })} maxLength={80} placeholder={k === 'lista' ? 'dados.itens' : k} /></Field>
                  ))}
                </div>
              </div>
            )}
            <p className="text-xs text-ink-3">As notícias vão para as TVs escolhidas em “Comunicados”, logo abaixo.</p>
          </>
        )}
      </div>
    </Dialog>
  );
}

function ComunicadosDialog({ integ, telas, onFechar, onSalvo }) {
  const c = (integ.comunicados && integ.comunicados.config) || {};
  const [f, setF] = useState({ alvo: c.alvo || { todas: true, telas: [], grupos: [] }, zona: c.zona || 'principal', aprovacao: !!c.aprovacao });
  const [salvando, setSalvando] = useState(false);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  async function salvar() {
    setSalvando(true);
    try { await integracoes.atualizar(integ.id, { comunicados: f }); aviso.ok('Salvo.'); onSalvo(); }
    catch (e) { aviso.erro('integracoes', e.message || 'Não deu para salvar.'); }
    finally { setSalvando(false); }
  }
  return (
    <Dialog open onClose={onFechar} title="Onde os comunicados aparecem" className="max-w-2xl"
      description="Os comunicados da intranet e dos feeds entram como Aviso, do início ao fim de cada um, e saem sozinhos depois do fim."
      footer={<Button variant="primary" icon={Check} disabled={salvando} onClick={salvar}>{salvando ? 'Salvando…' : 'Salvar'}</Button>}>
      <div className="space-y-3">
        <EscolherTvs telas={telas} alvo={f.alvo} onChange={(a) => set('alvo', a)} />
        <OndeEAprovacao f={f} set={set} />
      </div>
    </Dialog>
  );
}

function ArquivosDialog({ integ, fonte, onFechar }) {
  const { data, loading } = useAsync(() => integracoes.arquivos(integ.id, fonte.id), [fonte.id]);
  const lista = (data && data.arquivos) || [];
  return (
    <Dialog open onClose={onFechar} title={'Arquivos de ' + fonte.nome} className="max-w-xl" description="O que o Conector mandou desta pasta (o que está no compartilhamento agora).">
      {loading ? <SkeletonRows rows={4} cols={2} /> : lista.length === 0 ? <p className="text-sm text-ink-3">Nenhum arquivo ainda. Assim que alguém salvar na pasta, aparece aqui.</p> : (
        <ul className="divide-y divide-line/60">
          {lista.map((a) => (
            <li key={a.nome} className="py-2">
              <div className="flex items-center justify-between gap-2 text-sm"><span className="min-w-0 truncate text-ink">{a.nome}</span><span className="shrink-0 text-xs text-ink-3">{tamanho(a.tamanho)} · {quando(a.em)}</span></div>
              {a.aviso && <div className="mt-0.5 flex items-start gap-1 text-xs text-warn"><AlertTriangle size={13} className="mt-0.5 shrink-0" />{a.aviso}</div>}
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}

function RegistroDialog({ integ, onFechar }) {
  const { data, loading } = useAsync(() => integracoes.registro(integ.id), [integ.id]);
  const lista = (data && data.registro) || [];
  return (
    <Dialog open onClose={onFechar} title={'O que mudou: ' + integ.nome} className="max-w-2xl" description="Cada coisa que chegou, saiu ou mudou, com quem fez (o token pela ponta, ou a pessoa do painel).">
      {loading ? <SkeletonRows rows={5} cols={3} /> : lista.length === 0 ? <p className="text-sm text-ink-3">Nada ainda.</p> : (
        <ul className="max-h-[60vh] divide-y divide-line/60 overflow-y-auto">
          {lista.map((r, i) => (
            <li key={i} className="flex flex-wrap items-baseline gap-x-3 py-1.5 text-sm">
              <span className="w-24 shrink-0 text-xs text-ink-3">{quando(r.em)}</span>
              <span className="min-w-0 flex-1 text-ink">{r.detalhe || r.acao}</span>
              <span className="text-xs text-ink-3">{r.quem}</span>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}

function TokenDialog({ titulo, token, base, onFechar }) {
  return (
    <Dialog open onClose={onFechar} title={titulo} className="max-w-xl"
      description="Copie agora: por segurança, ele não aparece de novo (dá para gerar outro)."
      footer={<Button variant="primary" onClick={onFechar}>Pronto, copiei</Button>}>
      <div className="space-y-3">
        <div className="flex items-center gap-2 rounded-md border border-line bg-surface-2 p-2">
          <code className="min-w-0 flex-1 break-all text-xs text-ink">{token}</code>
          <Copiar texto={token} />
        </div>
        <div className="flex items-center gap-2 text-xs text-ink-2">Endereço da API: <code className="break-all">{base}</code><Copiar texto={base} /></div>
        <p className="text-xs text-ink-3">Cole o token no Conector MultiTelas (ou no sistema da intranet). Quem tem o token manda conteúdo para as TVs desta conta: guarde como uma senha.</p>
      </div>
    </Dialog>
  );
}

// O estado de uma fonte em palavras (e a cor dele).
function estadoDe(f) {
  const e = f.estado || {};
  if (f.pedido && f.pedido.estado === 'pendente') return { tom: 'warn', texto: 'Esperando aprovação (em Aprovações)' };
  if (f.pedido && f.pedido.estado === 'recusada') return { tom: 'danger', texto: 'A última mudança foi recusada' + (f.pedido.motivo ? ': ' + f.pedido.motivo : '') };
  if (e.ultimoErro && (!e.ultimoOk || (e.erroEm || 0) >= e.ultimoOk)) return { tom: 'danger', texto: 'Não deu: ' + e.ultimoErro };
  if (e.pendente) return { tom: 'accent', texto: 'Indo para as TVs…' };
  if (f.tipo === 'feed') return e.ultimoItemEm ? { tom: 'ok', texto: 'Última notícia ' + haQuanto(e.ultimoItemEm) } : { tom: 'neutral', texto: 'Nenhuma notícia ainda' };
  if (f.tipo === 'planilha') return e.ultimoOk ? { tom: 'ok', texto: (e.itens === 1 ? '1 item' : (e.itens || 0) + ' itens') + ' · lida ' + haQuanto(e.ultimoOk) } : { tom: 'neutral', texto: 'Ainda não chegou' };
  return e.ultimoOk ? { tom: 'ok', texto: 'Na TV · atualizada ' + haQuanto(e.ultimoOk) } : { tom: 'neutral', texto: 'Ainda não foi para a TV' };
}

const ICONE = { pasta: FolderOpen, planilha: Sheet, feed: Rss };
function LinhaDaFonte({ integ, f, telas, podeMexer, onEditar, onArquivos, onMudou }) {
  const Icone = ICONE[f.tipo] || FolderOpen;
  const e = estadoDe(f);
  const [indo, setIndo] = useState(false);
  const detalhe = f.tipo === 'pasta'
    ? [(f.arquivos ? (f.arquivos.n === 1 ? '1 arquivo' : f.arquivos.n + ' arquivos') : ''), descreverAlvo(f.config.alvo, telas), f.config.zona === 'lateral' ? 'lateral' : 'área principal', f.config.segundos + ' s por foto', f.config.ordem === 'data' ? 'mais novo primeiro' : 'pelo nome', f.config.aprovacao ? 'com aprovação' : ''].filter(Boolean).join(' · ')
    : f.tipo === 'planilha' ? (f.config.uso === 'indicadores' ? 'Indicadores' : 'Preços da planilha')
      : (f.config.formato === 'json' ? 'JSON' : 'RSS') + ' · ' + f.config.url + (f.arquivos && f.arquivos.n ? ' · ' + (f.arquivos.n === 1 ? '1 imagem' : f.arquivos.n + ' imagens') : '');
  async function porAgora() {
    setIndo(true);
    try { const r = await integracoes.sincronizar(integ.id, f.id); aviso.ok(r.pendente ? 'Mandado para aprovação.' : 'Pronto: a TV está com a pasta de agora.'); onMudou(); }
    catch (x) { aviso.erro('integracoes', x.message || 'Não deu para pôr nas TVs.'); }
    finally { setIndo(false); }
  }
  async function apagar() {
    const texto = f.tipo === 'pasta' ? 'O que veio desta pasta sai das TVs, e o Conector para de mandar.'
      : f.tipo === 'planilha' ? 'A planilha sai também de ' + (f.config.uso === 'indicadores' ? 'Indicadores' : 'Preços da planilha') + '; na TV, as peças dela ficam com o último texto.'
        : 'O Conector para de ler este feed. Os comunicados que já vieram dele ficam até o fim de cada um.';
    if (!(await confirmar({ titulo: 'Apagar ' + f.nome + '?', texto, botao: 'Apagar', perigo: true }))) return;
    try { await integracoes.removerFonte(integ.id, f.id); onMudou(); } catch (x) { aviso.erro('integracoes', x.message || 'Não deu para apagar.'); }
  }
  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent"><Icone size={17} /></span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate text-sm font-medium text-ink">{f.nome}</span>
          <code className="rounded bg-surface-2 px-1.5 text-2xs text-ink-2">{f.chave}</code>
          <Badge tone={e.tom}>{e.texto}</Badge>
          {f.avisos > 0 && <Badge tone="warn">{f.avisos === 1 ? '1 vídeo pesado' : f.avisos + ' vídeos pesados'}</Badge>}
        </div>
        <div className="truncate text-xs text-ink-3">{detalhe}</div>
      </div>
      {f.tipo === 'pasta' && <Button size="sm" variant="ghost" onClick={() => onArquivos(f)}>Arquivos</Button>}
      {podeMexer && f.tipo === 'pasta' && <Button size="sm" variant="ghost" icon={RefreshCw} disabled={indo} onClick={porAgora}>{indo ? 'Indo…' : 'Pôr nas TVs agora'}</Button>}
      {podeMexer && <Button size="sm" variant="secondary" icon={Settings2} onClick={() => onEditar(f)}>Configurar</Button>}
      {podeMexer && <Button size="sm" variant="ghost" icon={Trash2} onClick={apagar}>Apagar</Button>}
    </li>
  );
}

const SITUACAO = { 'no-ar': ['ok', 'Na TV'], agendado: ['accent', 'Agendado'], encerrado: ['neutral', 'Encerrado'] };
function Comunicados({ integ, telas, podeMexer, onConfigurar, onMudou }) {
  const com = integ.comunicados || {};
  const lista = com.lista || [];
  const e = estadoDe(Object.assign({ tipo: 'comunicados' }, com));
  async function tirar(c) {
    if (!(await confirmar({ titulo: 'Tirar "' + c.titulo + '"?', texto: 'Sai das TVs agora. Se a intranet mandar de novo com o mesmo id, ele volta.', botao: 'Tirar', perigo: true }))) return;
    try { await integracoes.tirarComunicado(integ.id, c.id); onMudou(); } catch (x) { aviso.erro('integracoes', x.message || 'Não deu certo.'); }
  }
  return (
    <div className="border-t border-line">
      <div className="flex flex-wrap items-center gap-3 px-4 py-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent"><Megaphone size={17} /></span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2"><span className="text-sm font-medium text-ink">Comunicados</span>{lista.length > 0 && <Badge tone={e.tom}>{e.texto}</Badge>}</div>
          <div className="truncate text-xs text-ink-3">{descreverAlvo(com.config && com.config.alvo, telas)} · {com.config && com.config.zona === 'lateral' ? 'lateral' : 'área principal'}{com.config && com.config.aprovacao ? ' · com aprovação' : ''} · {com.total || 0} guardados</div>
        </div>
        {podeMexer && <Button size="sm" variant="secondary" icon={Settings2} onClick={onConfigurar}>Configurar</Button>}
      </div>
      {lista.length > 0 && (
        <ul className="divide-y divide-line/60 border-t border-line/60">
          {lista.map((c) => {
            const [tom, rotulo] = SITUACAO[c.situacao] || SITUACAO['no-ar'];
            return (
              <li key={c.id} className="flex flex-wrap items-center gap-2 px-4 py-2 pl-16">
                <Badge tone={tom}>{rotulo}</Badge>
                <span className="min-w-0 flex-1 truncate text-sm text-ink">{c.destaque ? '★ ' : ''}{c.titulo}</span>
                <span className="text-xs text-ink-3">{c.inicio ? 'de ' + quando(c.inicio) + ' ' : ''}{c.fim ? 'até ' + quando(c.fim) : 'sem fim'}{c.feed ? ' · feed ' + c.feed : ''}</span>
                {podeMexer && c.situacao !== 'encerrado' && <Button size="sm" variant="ghost" icon={Ban} onClick={() => tirar(c)}>Tirar</Button>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function CartaoDaIntegracao({ integ, telas, podeMexer, onMudou, onToken, abrir }) {
  const conector = integ.revogada ? { tom: 'danger', texto: 'Token revogado' }
    : integ.conectorOnline ? { tom: 'ok', texto: 'Conector conectado' }
      : integ.vistoEm ? { tom: 'warn', texto: 'Conector sem falar desde ' + quando(integ.vistoEm) }
        : integ.chamadaEm ? { tom: 'ok', texto: 'Recebendo pela API' } : { tom: 'neutral', texto: 'Ainda não conectou' };
  async function tokenNovo() {
    if (!(await confirmar({ titulo: 'Gerar um token novo?', texto: 'O token de agora para de funcionar: o Conector (ou a intranet) precisa do novo.', botao: 'Gerar' }))) return;
    try { const r = await integracoes.token(integ.id); onToken({ titulo: 'Token novo de ' + integ.nome, token: r.token }); onMudou(); }
    catch (e) { aviso.erro('integracoes', e.message || 'Não deu certo.'); }
  }
  async function revogar() {
    if (!(await confirmar({ titulo: 'Revogar o token de ' + integ.nome + '?', texto: 'O Conector para de mandar na hora. O que já está nas TVs fica. Para voltar, gere um token novo.', botao: 'Revogar', perigo: true }))) return;
    try { await integracoes.revogar(integ.id); onMudou(); } catch (e) { aviso.erro('integracoes', e.message || 'Não deu certo.'); }
  }
  async function apagar() {
    if (!(await confirmar({ titulo: 'Apagar ' + integ.nome + '?', texto: 'Sai das TVs tudo o que ela pôs (as pastas e os comunicados), as planilhas dela saem do painel, e o token para de valer.', botao: 'Apagar tudo', perigo: true }))) return;
    try { await integracoes.remover(integ.id); onMudou(); } catch (e) { aviso.erro('integracoes', e.message || 'Não deu para apagar.'); }
  }
  return (
    <Panel className="mb-4">
      <PanelHeader title={integ.nome}
        description={[conector.texto, integ.versao ? 'versão ' + integ.versao : '', integ.maquina ? 'no computador ' + integ.maquina : '', integ.vistoEm ? 'visto ' + haQuanto(integ.vistoEm) : '', 'token …' + integ.tokenDica].filter(Boolean).join(' · ')}
        actions={podeMexer && (
          <div className="flex flex-wrap gap-1.5">
            <Button size="sm" variant="ghost" icon={KeyRound} onClick={tokenNovo}>Token novo</Button>
            {!integ.revogada && <Button size="sm" variant="ghost" icon={Ban} onClick={revogar}>Revogar</Button>}
            <Button size="sm" variant="ghost" icon={History} onClick={() => abrir({ registro: integ })}>O que mudou</Button>
            <Button size="sm" variant="ghost" icon={Trash2} onClick={apagar}>Apagar</Button>
          </div>
        )} />
      {podeMexer && (
        <div className="flex flex-wrap gap-1.5 px-4 pb-3">
          <Button size="sm" variant="secondary" icon={FolderOpen} onClick={() => abrir({ fonte: null, tipo: 'pasta', integ })}>Ligar uma pasta</Button>
          <Button size="sm" variant="secondary" icon={Sheet} onClick={() => abrir({ fonte: null, tipo: 'planilha', integ })}>Ligar uma planilha</Button>
          <Button size="sm" variant="secondary" icon={Rss} onClick={() => abrir({ fonte: null, tipo: 'feed', integ })}>Ligar um feed</Button>
        </div>
      )}
      {integ.fontes.length === 0 ? (
        <p className="border-t border-line px-4 py-3 text-sm text-ink-3">Nenhuma pasta, planilha ou feed ainda.{podeMexer ? ' Use os botões acima: o Conector pega a novidade no próximo minuto.' : ''}</p>
      ) : (
        <ul className="divide-y divide-line/60 border-t border-line">
          {integ.fontes.map((f) => (
            <LinhaDaFonte key={f.id} integ={integ} f={f} telas={telas} podeMexer={podeMexer} onMudou={onMudou}
              onEditar={(x) => abrir({ fonte: x, integ })} onArquivos={(x) => abrir({ arquivos: x, integ })} />
          ))}
        </ul>
      )}
      <Comunicados integ={integ} telas={telas} podeMexer={podeMexer} onMudou={onMudou} onConfigurar={() => abrir({ comunicados: integ })} />
    </Panel>
  );
}

function ComoInstalar({ download, versao, podeBaixar }) {
  return (
    <Panel className="mb-4 p-4">
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink"><Download size={16} className="text-accent" /> Como instalar o Conector</div>
      <ol className="list-decimal space-y-1 pl-5 text-sm text-ink-2">
        {/* O download é só do dono e do administrador (server.js): são eles que criam o token. */}
        <li>Num computador da empresa que fica ligado e enxerga a pasta da rede, {podeBaixar
          ? <>baixe o <a className="font-medium text-accent underline" href={download}>Conector MultiTelas{versao ? ' ' + versao.versao : ''}</a> e siga o LEIA-ME que vem nele.</>
          : <>o dono ou um administrador da conta baixa o Conector MultiTelas aqui mesmo.</>}</li>
        <li>Cole o token desta integração. Ele aparece uma vez só, quando você cria a integração ou toca em “Token novo” (aqui, em Integrações, no menu da sua conta).</li>
        <li>Pronto: o Conector mostra as pastas, planilhas e feeds daqui. Para cada pasta, aponte a pasta do compartilhamento.</li>
      </ol>
      <p className="mt-2 text-xs text-ink-3">O Conector só manda para o MultiTelas; nada da nuvem entra na rede da empresa. Ele confere tudo a cada minuto.</p>
    </Panel>
  );
}

function ApiDaIntranet({ base }) {
  const curl = 'curl -X PUT "' + base + '/comunicados/festa-2026" \\\n  -H "Authorization: Bearer SEU_TOKEN" \\\n  -H "Content-Type: application/json" \\\n  -d \'{"titulo":"Festa de fim de ano","texto":"Dia 20, às 18h, no pátio","fim":"2026-12-20T22:00:00-03:00"}\'';
  return (
    <Panel className="p-4">
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink"><Code2 size={16} className="text-accent" /> API para a intranet</div>
      <p className="mb-2 text-sm text-ink-2">Para quem desenvolve a intranet: crie uma integração só para ela, e publique cada comunicado com um id seu. O mesmo id troca o de antes; o fim tira da TV sozinho. Chame do servidor da intranet, não do navegador (o token é uma senha).</p>
      <Codigo texto={curl} />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Copiar texto={curl} rotulo="Copiar o exemplo" />
        <span className="text-xs text-ink-3">Para tirar: <code>DELETE {base}/comunicados/festa-2026</code></span>
      </div>
    </Panel>
  );
}

export function IntegracoesPage() {
  const { data, loading, error, reload } = useAsync(integracoes.list);
  const tv = useAsync(devices.list);
  const telas = (tv.data && tv.data.devices) || [];
  const [aberto, abrir] = useState(null);
  const [token, setToken] = useState(null);
  const [criando, setCriando] = useState(false);
  const lista = (data && data.integracoes) || [];
  const podeMexer = !!(data && data.podeMexer);
  const base = (data && data.api && data.api.base) || '/api/v1';
  const download = (data && data.api && data.api.download) || '/conector/MultiTelasConector.zip';
  const fechar = () => abrir(null);
  const salvo = () => { abrir(null); reload(); };

  async function criar() {
    setCriando(true);
    try {
      const r = await integracoes.criar(lista.length ? 'Intranet' : 'Conector do RH');
      setToken({ titulo: 'Token de ' + r.integracao.nome, token: r.token });
      reload();
    } catch (e) { aviso.erro('integracoes', e.message || 'Não deu para criar.'); }
    finally { setCriando(false); }
  }

  return (
    <div>
      <PageHeader title="Integrações" subtitle="A pasta da rede, a planilha e a intranet mandando para as TVs sozinhas."
        actions={podeMexer && <Button variant="primary" icon={Plus} disabled={criando} onClick={criar}>{criando ? 'Criando…' : 'Nova integração'}</Button>} />
      {loading && !data ? <Panel className="mb-4"><SkeletonRows rows={3} cols={3} /></Panel>
        : error ? <ErrorState description={error.message} onRetry={reload} />
          : lista.length === 0 ? (
            <Panel className="mb-4">
              <EmptyState icon={PlugZap} title="Nenhuma integração ainda" exemplo={['Pasta do RH', '12 avisos', 'na TV sozinho']}
                description="Crie uma integração, instale o Conector num computador da empresa e diga quais pastas vão para quais TVs."
                action={podeMexer && <Button variant="primary" icon={Plus} onClick={criar}>Nova integração</Button>} />
            </Panel>
          ) : lista.map((i) => <CartaoDaIntegracao key={i.id} integ={i} telas={telas} podeMexer={podeMexer} onMudou={reload} onToken={setToken} abrir={abrir} />)}

      <ComoInstalar download={download} versao={data && data.api && data.api.conector} podeBaixar={podeMexer} />
      <ApiDaIntranet base={base} />

      {aberto && aberto.integ && 'fonte' in aberto && (
        <FonteDialog integ={aberto.integ} fonte={aberto.fonte} tipo={aberto.tipo} telas={telas} onFechar={fechar} onSalvo={salvo} />
      )}
      {aberto && aberto.comunicados && <ComunicadosDialog integ={aberto.comunicados} telas={telas} onFechar={fechar} onSalvo={salvo} />}
      {aberto && aberto.arquivos && <ArquivosDialog integ={aberto.integ} fonte={aberto.arquivos} onFechar={fechar} />}
      {aberto && aberto.registro && <RegistroDialog integ={aberto.registro} onFechar={fechar} />}
      {token && <TokenDialog titulo={token.titulo} token={token.token} base={base} onFechar={() => { setToken(null); reload(); }} />}
    </div>
  );
}
