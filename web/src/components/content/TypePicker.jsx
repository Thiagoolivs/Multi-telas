import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Search, Plus, UtensilsCrossed, Wand2, Image as ImageIcon, Tag, Megaphone, Cake, Instagram, LayoutGrid, Layers, Upload, Film, MessageSquare } from 'lucide-react';
import { Dialog } from '../ui/Dialog.jsx';
import { CONTENT_TYPES, CONTENT_ORDER } from '../../lib/contentTypes.js';
import { DesignThumb } from './DesignThumb.jsx';
import { PecaHtml } from './PecaHtml.jsx';
import { library, criar, media } from '../../api.js';
import { cabeNaZona, papelDaZona } from '../../lib/tela.js';
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
 * As 6 entradas grandes do "O que você quer mostrar?" (PLANO §5.1). Desde o
 * item 32, "Criar com IA" e "Foto ou vídeo" têm lugar próprio (o botão do
 * topo e a aba Fotos e vídeos); as outras quatro são os tipos prontos que
 * quase todo mundo usa.
 */
const ENTRADAS = [
  { id: 'criar', label: 'Criar com IA', desc: 'Promoção, novidade, aviso… com a sua marca.', icon: MessageSquare },
  { id: 'midia', label: 'Foto ou vídeo', desc: 'Da galeria do celular ou do computador: entra inteira.', icon: ImageIcon },
  { id: 'promo', label: 'Promoção com preço', desc: 'Produto, preço e chamada, já na cor da marca.', icon: Tag },
  { id: 'announce', label: 'Aviso', desc: 'Horário, recado, comunicado.', icon: Megaphone },
  { id: 'birthdayauto', label: 'Aniversariantes', desc: 'Os aniversariantes do dia, sozinhos.', icon: Cake },
  { id: 'social', label: 'Instagram ou QR', desc: 'O perfil e o QR para seguir a loja.', icon: Instagram },
];

const NOME_PAPEL = { cabecalho: 'cabeçalho', rodape: 'rodapé', principal: 'principal', lateral: 'lateral' };

/*
 * ADICIONAR NUMA ZONA (EXECUTOR §2c, item 32).
 *
 * Começa pelo que JÁ EXISTE, na ordem em que o dono da loja pensa:
 *   1. Peças prontas que cabem nesta zona — das campanhas do Criar e da
 *      biblioteca. Em pé na lateral, deitada na principal; no cabeçalho e no
 *      rodapé, só as peças de faixa.
 *   2. Fotos e vídeos que a conta já tem, ou um novo do celular.
 *   3. Tipos prontos (promoção, aviso, aniversariantes…), e todos com busca.
 *   4. "Criar novo com a IA", no topo: abre o Criar com esta TV e esta zona.
 * No cabeçalho e no rodapé só existem as peças de faixa e o Criar: tipo de
 * zona grande ali ficaria espremido em 130 px.
 *
 * onPick(type) cria um tipo; onPickItem(item) põe uma peça pronta, uma foto
 * ou um vídeo; onCriar() vai ao Criar.
 */
export function TypePicker({ open, onClose, onPick, onPickItem, onCriar, zona }) {
  const papel = papelDaZona(zona);
  const faixa = papel === 'cabecalho' || papel === 'rodape';
  const [tab, setTab] = useState('prontas');
  const [q, setQ] = useState('');
  const [prontas, setProntas] = useState(null); // null = carregando
  const [todas, setTodas] = useState(false);
  const [midias, setMidias] = useState(null);
  const arquivo = useRef(null);
  const [envio, setEnvio] = useState(null);

  useEffect(() => {
    if (!open) return;
    setQ(''); setEnvio(null); setTodas(false);
    // Abre nas peças prontas: o que já existe vem antes de criar do zero.
    setTab('prontas');
    Promise.all([
      library.list().then((r) => (r && r.items) || []).catch(() => []),
      criar.pecasProntas().then((r) => (r && r.pecas) || []).catch(() => []),
    ]).then(([lib, camp]) => setProntas([
      ...camp.map((p) => ({ id: p.campanhaId + p.vaga, item: { ...p.item, formato: p.formato || p.item.formato }, papel: p.papel, formato: p.formato, label: p.label, origem: p.campanha })),
      ...lib.map((i) => ({ id: i.id, item: i.item, papel: i.item && i.item.papel, formato: i.formato || (i.item && i.item.formato), label: i.label, origem: i.campaign })),
    ]));
    if (!faixa) media.list().then((r) => setMidias(((r && r.items) || []).filter((m) => /^(image|video)\//.test(m.mime || '')))).catch(() => setMidias([]));
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const termo = q.trim().toLowerCase();
  const casa = (txt) => !termo || String(txt || '').toLowerCase().includes(termo);
  const prontasDaZona = useMemo(() => {
    // A mesma peça vinda da biblioteca antiga e da campanha aparece uma vez só.
    const vistas = new Set();
    const lista = (prontas || []).map((p) => ({ ...p, cabe: cabeNaZona(p, zona) })).filter((p) => {
      const chave = (p.item && (p.item.html || p.item.src || p.item.type)) + JSON.stringify((p.item && p.item.campos) || {});
      if (vistas.has(chave)) return false;
      vistas.add(chave);
      return p.cabe > 0 && casa(p.label + ' ' + p.origem);
    });
    return lista.sort((a, b) => b.cabe - a.cabe);
  }, [prontas, zona, termo]); // eslint-disable-line react-hooks/exhaustive-deps
  const visiveis = todas ? prontasDaZona : prontasDaZona.filter((p) => p.cabe === 2);

  const groups = {};
  const bate = (t) => {
    const info = CONTENT_TYPES[t] || ATALHOS[t] || {};
    return casa((info.label || '') + ' ' + (DESC[t] || info.desc || ''));
  };
  CONTENT_ORDER.filter(bate).forEach((t) => {
    const g = CONTENT_TYPES[t].group;
    (groups[g] = groups[g] || []).push(t);
  });
  Object.keys(ATALHOS).filter(bate).forEach((t) => { (groups[ATALHOS[t].group] = groups[ATALHOS[t].group] || []).unshift(t); });

  const TABS = faixa
    ? [['prontas', 'Peças de ' + NOME_PAPEL[papel], Layers]]
    : [['prontas', 'Peças prontas', Layers], ['midia', 'Fotos e vídeos', ImageIcon], ['inicio', 'Tipos prontos', LayoutGrid], ['new', 'Todos os tipos', Plus]];

  function pegar(item) { onPickItem(item); onClose(); }
  function escolher(id) {
    if (id === 'midia') { setTab('midia'); return; }
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

  const titulo = 'Adicionar ' + (zona ? 'em ' + NOME_PAPEL[papel] : 'conteúdo');
  return (
    <Dialog open={open} onClose={onClose} title={titulo}
      description={faixa ? 'As peças de faixa que você já tem, ou uma nova pelo Criar.' : 'Primeiro o que você já tem; depois os tipos prontos.'} className="max-w-5xl">
      {onCriar && (
        <button type="button" onClick={() => escolher('criar')}
          className="mb-4 flex w-full items-center gap-3 rounded-xl border border-accent/40 bg-accent-soft/40 p-3 text-left transition hover:border-accent">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-soft"><MessageSquare size={18} className="text-accent" /></span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-ink">Criar novo com a IA</span>
            <span className="block text-xs text-ink-3">Conte o que quer mostrar {zona ? 'no ' + NOME_PAPEL[papel] : ''}: a IA conversa e cria com a sua marca.</span>
          </span>
        </button>
      )}

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
        {(tab === 'prontas' || tab === 'new') && (
          <div className="relative sm:w-64">
            <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-3" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tab === 'prontas' ? 'Buscar nas peças…' : 'Buscar um tipo: clima, vídeo, QR…'}
              className="w-full rounded-md border border-line bg-surface py-1.5 pl-8 pr-2 text-sm text-ink placeholder:text-ink-3" />
          </div>
        )}
      </div>

      {tab === 'prontas' ? (
        prontas === null ? (
          <div className="py-10 text-center text-sm text-ink-3">Carregando…</div>
        ) : visiveis.length === 0 ? (
          <div className="py-8 text-center">
            <p className="text-sm text-ink-2">{faixa ? 'Ainda não há peça de ' + NOME_PAPEL[papel] + ' pronta.' : 'Nenhuma peça pronta para esta zona.'}</p>
            <p className="mt-1 text-xs text-ink-3">{faixa ? 'Uma campanha do Criar com ' + NOME_PAPEL[papel] + ' traz as dela.' : 'O que você criar aparece aqui para pôr em qualquer TV.'}</p>
            {!todas && prontasDaZona.length > 0 && <button type="button" onClick={() => setTodas(true)} className="mt-3 text-xs font-medium text-accent hover:underline">Ver também as que cabem menos</button>}
            {!faixa && <button type="button" onClick={() => setTab('inicio')} className="mt-3 block w-full text-xs font-medium text-accent hover:underline">Ver os tipos prontos</button>}
          </div>
        ) : (
          <>
            <div className={cn('grid gap-3', faixa ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5')}>
              {visiveis.map((p) => (
                <button key={p.id} type="button" onClick={() => pegar(p.item)}
                  className="space-y-1.5 rounded-xl border border-line bg-surface p-2 text-left transition hover:border-accent/60 hover:bg-surface-2">
                  {faixa
                    ? <PecaHtml item={p.item} formato={papel} />
                    : <div className="flex h-24 items-center justify-center overflow-hidden rounded-md bg-surface-2"><DesignThumb item={p.item} fitHeight /></div>}
                  <span className="block truncate text-2xs font-medium text-ink-2">{p.label}</span>
                  <span className="block truncate text-2xs text-ink-3">{p.origem}</span>
                </button>
              ))}
            </div>
            {!todas && prontasDaZona.length > visiveis.length && (
              <button type="button" onClick={() => setTodas(true)} className="mt-3 text-xs font-medium text-accent hover:underline">
                Ver também {prontasDaZona.length - visiveis.length} {prontasDaZona.length - visiveis.length === 1 ? 'que cabe' : 'que cabem'} menos (outra orientação)
              </button>
            )}
          </>
        )
      ) : tab === 'midia' ? (
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
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            <button type="button" onClick={() => arquivo.current && arquivo.current.click()} disabled={!!(envio && !envio.erro && !envio.pronto)}
              className="flex min-h-[7.5rem] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-accent/50 bg-accent-soft/30 p-3 text-center text-sm font-semibold text-accent hover:border-accent">
              <Upload size={20} /> Enviar do celular ou do computador
            </button>
            {(midias || []).map((m) => {
              const video = /^video\//.test(m.mime || '');
              return (
                <button key={m.id} type="button" onClick={() => pegar(itemDaMidia({ url: m.url, video }))}
                  className="space-y-1.5 rounded-xl border border-line bg-surface p-2 text-left transition hover:border-accent/60">
                  <div className="flex h-24 items-center justify-center overflow-hidden rounded-md bg-surface-2">
                    {video ? <Film size={22} className="text-ink-3" /> : <img src={m.url} alt="" className="h-full w-full object-cover" loading="lazy" />}
                  </div>
                  <span className="block truncate text-2xs text-ink-2">{m.name || (video ? 'Vídeo' : 'Foto')}</span>
                </button>
              );
            })}
          </div>
          {midias !== null && midias.length === 0 && <p className="mt-3 text-xs text-ink-3">Você ainda não tem fotos nem vídeos. Envie o primeiro acima.</p>}
        </div>
      ) : tab === 'inicio' ? (
        <div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {ENTRADAS.filter((e) => e.id !== 'criar' && e.id !== 'midia').map((e) => {
              const Icon = e.icon;
              return (
                <button key={e.id} type="button" onClick={() => escolher(e.id)}
                  className="flex min-h-[7.5rem] flex-col items-start gap-2 rounded-xl border border-line bg-surface p-4 text-left transition hover:border-accent/60 hover:bg-surface-2">
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
