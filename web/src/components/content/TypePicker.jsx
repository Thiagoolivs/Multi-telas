import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Search, Palette, Plus, UtensilsCrossed, Wand2, Image as ImageIcon, Tag, Megaphone, Cake, Instagram, LayoutGrid } from 'lucide-react';
import { Dialog } from '../ui/Dialog.jsx';
import { CONTENT_TYPES, CONTENT_ORDER } from '../../lib/contentTypes.js';
import { DesignThumb } from './DesignThumb.jsx';
import { library } from '../../api.js';
import { cn } from '../../lib/cn.js';
import { prepararFoto, prepararVideo, avaliarVideo, enviarComProgresso, itemDaMidia, ehVideo, ehImagem } from '../../lib/subir.js';

// Descrição curta por tipo — deixa a escolha óbvia para quem chega agora.
const DESC = {
  text: 'Título e texto simples.',
  announce: 'Aviso com etiqueta e destaque.',
  poster: 'Arte pronta com a cor da marca.',
  quote: 'Frase com autor.',
  promo: 'Produto, preço e chamada.',
  precos: 'Cardápio ou lista de preços: cole as linhas e a TV organiza em colunas.',
  kpi: 'Número grande com variação.',
  composicao: 'Editor livre: formas, texto e imagens.',
  social: 'Perfil e QR das redes.',
  image: 'Foto ou arte da sua mídia.',
  video: 'Vídeo MP4 em loop.',
  pptx: 'Slides PPTX ou PDF.',
  screen: 'Espelha uma janela do computador.',
  livesource: 'Entrada HDMI / USB ao vivo.',
  youtube: 'Vídeo ou live do YouTube.',
  web: 'Página da web em tempo real.',
  qrcode: 'QR code com legenda.',
  mural: 'O público manda foto pelo QR e ela aparece aqui na hora.',
  weatherpro: 'Painel do clima da cidade.',
  birthdayauto: 'Aniversariantes automáticos.',
};

/*
 * Atalhos para um MODELO pronto (js/modelos.js) com cara de tipo próprio.
 *
 * O cardápio é uma composição, e morava dentro de "Composição (editor
 * livre)" › galeria — onde o dono da padaria nunca procuraria. Aqui ele
 * aparece com o nome que a pessoa usa, junto do que é comercial.
 */
const ATALHOS = {
  'modelo:cardapio': { label: 'Cardápio em arte', icon: UtensilsCrossed, group: 'Comercial',
    desc: 'Modelo pronto no editor visual, na cor da sua marca — para até oito itens.' },
};

/*
 * As 6 entradas grandes do "O que você quer mostrar?" (PLANO §5.1): o que o
 * dono da loja quer quase sempre. Criar com IA leva ao Criar com esta tela
 * marcada (a tela recebe e organiza; cria-se em Criar); as outras já põem o
 * tipo na tela, para preencher ali mesmo.
 */
const ENTRADAS = [
  { id: 'criar', label: 'Criar com IA', desc: 'Promoção, novidade, aviso… com a sua marca.', icon: Wand2 },
  { id: 'midia', label: 'Foto ou vídeo', desc: 'Da galeria do celular ou do computador: entra inteira.', icon: ImageIcon },
  { id: 'promo', label: 'Promoção com preço', desc: 'Produto, preço e chamada, já na cor da marca.', icon: Tag },
  { id: 'announce', label: 'Aviso', desc: 'Horário, recado, comunicado.', icon: Megaphone },
  { id: 'birthdayauto', label: 'Aniversariantes', desc: 'Os aniversariantes do dia, sozinhos.', icon: Cake },
  { id: 'social', label: 'Instagram ou QR', desc: 'O perfil e o QR para seguir a loja.', icon: Instagram },
];

/*
 * Adicionar conteúdo pergunta ANTES de mostrar a grade (PLANO §5.1): "O que
 * você quer mostrar?", com as 6 entradas. Reaproveitar um design salvo fica
 * em "Minha biblioteca" (com busca); todos os tipos prontos (clima, vídeo do
 * YouTube, página da web…) em "Mais tipos", também com busca. onPick(type)
 * cria um tipo; onPickItem(item) insere um design salvo; onCriar() vai ao
 * Criar.
 */
export function TypePicker({ open, onClose, onPick, onPickItem, onCriar }) {
  const [tab, setTab] = useState('inicio');
  const [q, setQ] = useState('');
  const [saved, setSaved] = useState(null); // null = carregando
  // Foto ou vídeo: escolhe, sobe e já entra na tela (o mesmo caminho do "Pôr na TV", lib/subir.js).
  const arquivo = useRef(null);
  const [envio, setEnvio] = useState(null);

  useEffect(() => {
    if (!open) return;
    setQ('');
    setEnvio(null);
    // Abre sempre na pergunta: a grade de tudo é o segundo passo, não o primeiro.
    setTab('inicio');
    library.list().then((r) => setSaved((r && r.items) || [])).catch(() => setSaved([]));
  }, [open]);

  const results = useMemo(() => {
    const all = saved || [];
    if (!q.trim()) return all;
    const t = q.toLowerCase();
    return all.filter((i) => ((i.label || '') + ' ' + (i.campaign || '')).toLowerCase().includes(t));
  }, [saved, q]);

  const groups = {};
  const termo = q.trim().toLowerCase();
  const bate = (t) => {
    if (!termo) return true;
    const info = CONTENT_TYPES[t] || ATALHOS[t] || {};
    return ((info.label || '') + ' ' + (DESC[t] || info.desc || '')).toLowerCase().includes(termo);
  };
  CONTENT_ORDER.filter(bate).forEach((t) => {
    const g = CONTENT_TYPES[t].group;
    (groups[g] = groups[g] || []).push(t);
  });
  Object.keys(ATALHOS).filter(bate).forEach((t) => { (groups[ATALHOS[t].group] = groups[ATALHOS[t].group] || []).unshift(t); });

  const TABS = [['inicio', 'O que mostrar', LayoutGrid], ['lib', 'Minha biblioteca', Palette], ['new', 'Mais tipos', Plus]];
  function escolher(id) {
    if (id === 'midia') { if (arquivo.current) arquivo.current.click(); return; }
    onClose();
    if (id === 'criar') { if (onCriar) onCriar(); return; }
    onPick(id);
  }
  async function subir(f) {
    if (!f || !(ehImagem(f) || ehVideo(f))) { setEnvio({ erro: 'Escolha uma foto (JPG, PNG, WEBP) ou um vídeo (MP4, WEBM).' }); return; }
    const video = ehVideo(f);
    setEnvio({ progresso: 0, nome: f.name });
    try {
      const prep = video ? await prepararVideo(f) : await prepararFoto(f);
      const av = video ? await avaliarVideo(f, prep).catch(() => null) : null;
      const r = await enviarComProgresso(prep.envio, (p) => setEnvio((e) => ({ ...e, progresso: p })));
      onPickItem(itemDaMidia({ url: r.url, fundo: prep.fundo, video }));
      if (av && av.pesado) { setEnvio({ pronto: true, aviso: av.aviso }); return; }
      onClose();
    } catch (e) {
      setEnvio({ erro: e.message || 'Não deu para enviar.' });
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="Adicionar conteúdo"
      description="Escolha o que mostrar, reaproveite um design salvo ou procure um tipo pronto." className="max-w-5xl">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="inline-flex max-w-full gap-1 overflow-x-auto whitespace-nowrap rounded-lg border border-line bg-surface-2 p-1">
          {TABS.map(([id, label, Icon]) => (
            <button key={id} onClick={() => setTab(id)}
              className={cn('inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition',
                tab === id ? 'bg-surface text-ink shadow-xs' : 'text-ink-3 hover:text-ink-2')}>
              <Icon size={15} /> {label}
            </button>
          ))}
        </div>
        {tab !== 'inicio' && (
          <div className="relative sm:w-64">
            <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-3" />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={tab === 'lib' ? 'Buscar na biblioteca…' : 'Buscar um tipo: clima, vídeo, QR…'}
              className="w-full rounded-md border border-line bg-surface py-1.5 pl-8 pr-2 text-sm text-ink placeholder:text-ink-3" />
          </div>
        )}
      </div>

      {tab === 'inicio' ? (
        <div>
          <input ref={arquivo} type="file" accept="image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm" className="hidden"
            onChange={(e) => { const f = e.target.files && e.target.files[0]; e.target.value = ''; subir(f); }} />
          {envio && (
            <div className={'mb-3 rounded-md border px-3 py-2 text-xs ' + (envio.erro ? 'border-danger/30 bg-danger-soft text-danger' : 'border-line bg-surface-2 text-ink-2')}>
              {envio.erro ? envio.erro
                : envio.pronto ? <>Entrou na tela. {envio.aviso} <button type="button" className="ml-1 font-semibold text-accent hover:underline" onClick={onClose}>Fechar</button></>
                  : 'Enviando ' + (envio.nome || '') + '… ' + Math.round((envio.progresso || 0) * 100) + '%'}
            </div>
          )}
          <p className="mb-3 text-sm font-semibold text-ink">O que você quer mostrar?</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {ENTRADAS.filter((e) => e.id !== 'criar' || onCriar).map((e) => {
              const Icon = e.icon;
              return (
                <button key={e.id} type="button" onClick={() => escolher(e.id)} disabled={!!(envio && !envio.erro && !envio.pronto)}
                  className={cn('flex min-h-[7.5rem] flex-col items-start gap-2 rounded-xl border p-4 text-left transition hover:border-accent/60',
                    e.id === 'criar' ? 'border-accent/40 bg-accent-soft/40' : 'border-line bg-surface hover:bg-surface-2')}>
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent-soft"><Icon size={20} className="text-accent" /></span>
                  <span className="text-sm font-semibold leading-snug text-ink">{e.label}</span>
                  <span className="text-2xs leading-snug text-ink-3">{e.desc}</span>
                </button>
              );
            })}
          </div>
          <button type="button" onClick={() => setTab('new')} className="mt-4 text-xs font-medium text-accent hover:underline">
            Ver todos os tipos ({CONTENT_ORDER.length + Object.keys(ATALHOS).length}), com busca
          </button>
        </div>
      ) : tab === 'lib' ? (
        saved === null ? (
          <div className="py-10 text-center text-sm text-ink-3">Carregando…</div>
        ) : results.length === 0 ? (
          <div className="py-10 text-center">
            <p className="text-sm text-ink-2">{saved.length ? 'Nenhum design encontrado.' : 'Sua biblioteca está vazia.'}</p>
            <p className="mt-1 text-xs text-ink-3">{saved.length ? 'Tente outro termo.' : 'O que você criar aparece aqui para reaproveitar.'}</p>
            <button onClick={() => setTab('new')} className="mt-3 text-xs font-medium text-accent hover:underline">Ver os tipos prontos</button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {results.map((it) => (
              <button key={it.id} type="button" onClick={() => { onPickItem(it.item); onClose(); }}
                className="space-y-1.5 rounded-xl border border-line bg-surface p-2 text-left transition hover:border-accent/60 hover:bg-surface-2">
                <div className="flex h-24 items-center justify-center overflow-hidden rounded-md bg-surface-2">
                  <DesignThumb item={it.item} fitHeight />
                </div>
                <span className="block truncate text-2xs font-medium text-ink-2">{it.label}</span>
                <span className="block truncate text-2xs text-ink-3">{it.campaign}</span>
              </button>
            ))}
          </div>
        )
      ) : (
        <div className="space-y-5">
          {!Object.keys(groups).length && <p className="py-8 text-center text-sm text-ink-3">Nenhum tipo com esse nome.</p>}
          {Object.entries(groups).map(([group, types]) => (
            <div key={group}>
              <div className="mb-2 text-2xs font-semibold uppercase tracking-wide text-ink-3">{group}</div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                {types.map((t) => {
                  const { label, icon: Icon } = CONTENT_TYPES[t] || ATALHOS[t];
                  const descricao = DESC[t] || (ATALHOS[t] && ATALHOS[t].desc);
                  return (
                    <button key={t} type="button" onClick={() => { onPick(t); onClose(); }}
                      className="flex flex-col items-start gap-2 rounded-xl border border-line bg-surface p-4 text-left transition hover:border-accent/50 hover:bg-surface-2">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-surface-2"><Icon size={18} className="text-accent" strokeWidth={2} /></div>
                      <span className="text-sm font-semibold leading-snug text-ink">{label}</span>
                      {descricao && <span className="text-2xs leading-snug text-ink-3">{descricao}</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </Dialog>
  );
}
