import React, { useEffect, useRef, useState } from 'react';
import { UploadCloud, Trash2, Film, Image as ImageIcon, Share2, Check, Clock, X, Music, FileText, Sparkles } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader.jsx';
import { Panel, PanelHeader } from '../components/ui/Panel.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Skeleton, ErrorState, EmptyState } from '../components/ui/Feedback.jsx';
import { useAsync } from '../lib/useAsync.js';
import { media, bancoImagens } from '../api.js';
import { formatBytes, formatPercent, relativeTime } from '../lib/format.js';
import { avaliarVideo, ehVideo } from '../lib/subir.js';

/*
 * O estado de cada imagem no Banco de Imagens, indexado por id de mídia.
 *
 * Vem numa chamada só, e não uma por card: a página já mostra dezenas de
 * arquivos e uma requisição por miniatura transformaria abrir o Armazenamento
 * numa rajada contra o próprio servidor.
 */
function useEstadoNoBanco(itens) {
  const [porMedia, setPorMedia] = useState({});
  useEffect(() => {
    let vivo = true;
    bancoImagens.minhas()
      .then((r) => { if (vivo) setPorMedia(Object.fromEntries((r.itens || []).map((i) => [i.mediaId, i]))); })
      .catch(() => {});
    return () => { vivo = false; };
  }, [itens.length]);
  return [porMedia, setPorMedia];
}

const ROTULO = {
  pendente: { texto: 'Em conferência', Icone: Clock, classe: 'text-warn' },
  aprovada: { texto: 'No banco', Icone: Check, classe: 'text-ok' },
  recusada: { texto: 'Não aceita', Icone: X, classe: 'text-ink-3' },
};

/*
 * MÍDIAS POR PROPÓSITO (EXECUTOR §2c, item 34).
 *
 * Era "Armazenamento": o uso do disco em destaque e tudo misturado — a foto
 * do produto, a foto que a IA gerou, o vídeo, a música. O dono procura pelo
 * que quer FAZER, então a mesma página mostra um recorte por vez, cada um
 * com o seu envio, e o disco vira uma linha discreta.
 */
const RECORTES = {
  fotos: {
    titulo: 'Fotos e vídeos', vazio: 'Sem fotos nem vídeos ainda', enviar: 'Enviar fotos ou vídeos',
    subtitulo: 'O que você enviou: fotos, vídeos e apresentações para pôr nas TVs.',
    accept: 'image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm,application/pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation',
    pertence: (m) => m.origem !== 'ia' && !/^audio\//.test(m.mime || ''),
  },
  musicas: {
    titulo: 'Músicas', vazio: 'Sem músicas ainda', enviar: 'Enviar música',
    subtitulo: 'Para a música de fundo das TVs: escolha em Ajustes da tela › Som.',
    accept: 'audio/mpeg,audio/mp4,audio/ogg,audio/wav,.mp3,.m4a,.ogg,.wav',
    pertence: (m) => /^audio\//.test(m.mime || ''),
  },
  ia: {
    titulo: 'Da IA', vazio: 'A IA ainda não gerou fotos', enviar: null,
    subtitulo: 'As fotos que a IA gerou para as suas campanhas. Dá para compartilhar no Banco de Imagens.',
    accept: null,
    pertence: (m) => m.origem === 'ia',
  },
};

export function StoragePage({ filtro = 'fotos' }) {
  const recorte = RECORTES[filtro] || RECORTES.fotos;
  const { data, loading, error, reload } = useAsync(media.list);
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [confirmar, setConfirmar] = useState(null);

  const todos = data ? data.items : [];
  const items = todos.filter(recorte.pertence);
  const [noBanco, setNoBanco] = useEstadoNoBanco(todos);
  const usage = data ? data.usage : { used: 0, quota: 1 };
  const frac = usage.quota ? usage.used / usage.quota : 0;

  async function onFiles(e) {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (!files.length) return;
    setBusy(true); setMsg('');
    let ok = 0, fail = 0;
    // Vídeo que pode engasgar no TV Box (js/video.js): avisa depois, com o nome.
    const avisos = [];
    for (const f of files) {
      if (ehVideo(f)) {
        const av = await avaliarVideo(f).catch(() => null);
        if (av && av.pesado) avisos.push(f.name + ': ' + av.aviso);
      }
      try { await media.upload(f); ok++; } catch (err) { fail++; setMsg(err.message || 'Falha em um arquivo.'); }
    }
    setBusy(false);
    if (!fail) setMsg(`${ok} arquivo(s) enviados.` + (avisos.length ? ' ' + avisos.join(' ') : ''));
    reload();
  }

  async function compartilhar(m) {
    setConfirmar(null);
    try {
      const r = await bancoImagens.compartilhar(m.id);
      setNoBanco((a) => ({ ...a, [m.id]: r.item }));
      setMsg('Enviada para conferência. Assim que for aprovada, entra no banco.');
    } catch (e) { setMsg(e.message || 'Não foi possível compartilhar.'); }
  }

  async function descompartilhar(m) {
    try {
      await bancoImagens.descompartilhar(m.id);
      setNoBanco((a) => ({ ...a, [m.id]: { ...(a[m.id] || {}), estado: 'revogada' } }));
      setMsg('Saiu do banco. Quem já estava usando continua com a peça no ar.');
    } catch (e) { setMsg(e.message || 'Não foi possível descompartilhar.'); }
  }

  async function remove(m) {
    if (!window.confirm(`Remover "${m.name}"? Telas que usam este arquivo ficarão sem ele.`)) return;
    await media.remove(m.id);
    reload();
  }

  return (
    <div>
      <PageHeader
        title={recorte.titulo}
        subtitle={recorte.subtitulo}
        actions={recorte.enviar && (
          <>
            <input ref={inputRef} type="file" multiple accept={recorte.accept} className="hidden" onChange={onFiles} />
            <Button variant="primary" icon={UploadCloud} disabled={busy} onClick={() => inputRef.current && inputRef.current.click()}>
              {busy ? 'Enviando…' : recorte.enviar}
            </Button>
          </>
        )}
      />

      {/* O disco: uma linha discreta, que só chama a atenção perto do limite. */}
      <p className={'mb-4 text-xs ' + (frac > 0.9 ? 'text-danger' : frac > 0.8 ? 'text-warn' : 'text-ink-3')}>
        <span className="tnum">{formatBytes(usage.used)}</span> de <span className="tnum">{formatBytes(usage.quota)}</span> usados ({formatPercent(frac)})
      </p>

      {msg && <div className="mb-4 rounded-md border border-line bg-surface-2 px-3 py-2 text-sm text-ink-2">{msg}</div>}

      <Panel>
        <PanelHeader title={recorte.titulo} description={items.length ? `${items.length} arquivo(s)` : undefined} />
        {loading ? (
          <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="aspect-video rounded-lg" />)}
          </div>
        ) : error ? (
          <ErrorState description="Não foi possível carregar a biblioteca." onRetry={reload} />
        ) : items.length === 0 ? (
          <EmptyState icon={filtro === 'musicas' ? Music : filtro === 'ia' ? Sparkles : ImageIcon} title={recorte.vazio} description={recorte.subtitulo}
            action={recorte.enviar && <Button size="sm" variant="primary" icon={UploadCloud} onClick={() => inputRef.current && inputRef.current.click()}>{recorte.enviar}</Button>} />
        ) : (
          <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 lg:grid-cols-4">
            {items.map((m) => (
              <div key={m.id} className="group overflow-hidden rounded-lg border border-line bg-surface-2">
                <div className="relative aspect-video bg-[#0a1128]">
                  {String(m.mime).startsWith('video/')
                    ? <div className="flex h-full items-center justify-center text-white/70"><Film size={26} /></div>
                    : String(m.mime).startsWith('audio/')
                      ? <div className="flex h-full items-center justify-center text-white/70"><Music size={26} /></div>
                      : String(m.mime).startsWith('image/')
                        ? <img src={m.url} alt="" className="h-full w-full object-cover" />
                        : <div className="flex h-full items-center justify-center text-white/70"><FileText size={26} /></div>}
                  <button type="button" onClick={() => remove(m)} aria-label="Remover"
                    className="absolute right-1.5 top-1.5 rounded-md bg-ink/60 p-1 text-white opacity-0 transition hover:bg-danger group-hover:opacity-100">
                    <Trash2 size={14} />
                  </button>
                </div>
                <div className="p-2">
                  <div className="truncate text-xs font-medium text-ink" title={m.name}>{m.name}</div>
                  <div className="mt-0.5 flex items-center justify-between text-2xs text-ink-3">
                    <span className="tnum">{formatBytes(m.size)}</span>
                    <span>{relativeTime(m.created_at)}</span>
                  </div>
                  {/*
                    Compartilhar só aparece no que a IA gerou. Arquivo enviado
                    pode ter pessoa, produto ou marca de terceiro — o servidor
                    recusa (server/banco.js), e oferecer um botão que sempre dá
                    erro é pior que não oferecer botão nenhum.
                  */}
                  {m.origem === 'ia' && String(m.mime).startsWith('image/') && (() => {
                    const estado = (noBanco[m.id] || {}).estado;
                    const r = ROTULO[estado];
                    if (r) {
                      const { Icone } = r;
                      return (
                        <div className="mt-1.5 flex items-center justify-between border-t border-line pt-1.5">
                          <span className={'flex items-center gap-1 text-2xs ' + r.classe}><Icone size={11} />{r.texto}</span>
                          {estado !== 'recusada' && (
                            <button type="button" className="text-2xs text-ink-3 underline hover:text-ink"
                              onClick={() => descompartilhar(m)}>Tirar</button>
                          )}
                        </div>
                      );
                    }
                    return (
                      <button type="button" onClick={() => setConfirmar(m)}
                        className="mt-1.5 flex w-full items-center justify-center gap-1 border-t border-line pt-1.5 text-2xs text-ink-3 hover:text-accent">
                        <Share2 size={11} /> Compartilhar no banco
                      </button>
                    );
                  })()}
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>

      {/*
        O aceite. Escrito por extenso de propósito: a frase que ninguém quer
        descobrir depois é "um concorrente seu pode usar", e ela precisa estar
        na tela ANTES do clique, não só nos Termos. O servidor exige
        `aceito: true` e grava quem aceitou com a versão vigente.
      */}
      {confirmar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-lg border border-line bg-surface p-5">
            <h2 className="text-base font-semibold text-ink">Compartilhar esta imagem?</h2>
            <div className="mt-3 overflow-hidden rounded-md border border-line">
              <img src={confirmar.url} alt="" className="h-32 w-full object-cover" />
            </div>
            <ul className="mt-4 space-y-2 text-sm text-ink-2">
              <li>Ela entra no <b className="text-ink">Banco de Imagens MultiTelas</b> e qualquer outro cliente pode usar — <b className="text-ink">inclusive concorrentes seus</b>.</li>
              <li>Passa antes por conferência nossa. Se for aprovada, aparece no banco.</li>
              <li>Você pode tirar quando quiser. Quem já tiver usado continua com a peça no ar.</li>
              <li>Depois de aprovada, ela fica no acervo mesmo se você apagar o arquivo ou encerrar a conta.</li>
            </ul>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setConfirmar(null)}>Cancelar</Button>
              <Button variant="primary" icon={Share2} onClick={() => compartilhar(confirmar)}>Concordo e compartilho</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
