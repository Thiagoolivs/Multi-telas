import React, { useEffect, useRef, useState } from 'react';
import { UploadCloud, Trash2, Film, HardDrive, Image as ImageIcon, Share2, Check, Clock, X } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader.jsx';
import { Panel, PanelHeader } from '../components/ui/Panel.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Progress, Skeleton, ErrorState, EmptyState } from '../components/ui/Feedback.jsx';
import { useAsync } from '../lib/useAsync.js';
import { media, bancoImagens } from '../api.js';
import { formatBytes, formatPercent, relativeTime } from '../lib/format.js';

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

export function StoragePage() {
  const { data, loading, error, reload } = useAsync(media.list);
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [confirmar, setConfirmar] = useState(null);

  const items = data ? data.items : [];
  const [noBanco, setNoBanco] = useEstadoNoBanco(items);
  const usage = data ? data.usage : { used: 0, quota: 1 };
  const frac = usage.quota ? usage.used / usage.quota : 0;
  const tone = frac > 0.9 ? 'danger' : frac > 0.8 ? 'warn' : 'accent';

  async function onFiles(e) {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (!files.length) return;
    setBusy(true); setMsg('');
    let ok = 0, fail = 0;
    for (const f of files) {
      try { await media.upload(f); ok++; } catch (err) { fail++; setMsg(err.message || 'Falha em um arquivo.'); }
    }
    setBusy(false);
    if (!fail) setMsg(`${ok} arquivo(s) enviados.`);
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
        title="Armazenamento"
        subtitle="Imagens e vídeos da sua conta, usados nas telas."
        actions={
          <>
            <input ref={inputRef} type="file" multiple accept="image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm" className="hidden" onChange={onFiles} />
            <Button variant="primary" icon={UploadCloud} disabled={busy} onClick={() => inputRef.current && inputRef.current.click()}>
              {busy ? 'Enviando…' : 'Enviar mídia'}
            </Button>
          </>
        }
      />

      <Panel className="mb-4">
        <div className="flex items-center gap-4 p-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-line bg-surface-2 text-ink-3"><HardDrive size={18} /></div>
          <div className="flex-1">
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-ink-2"><b className="tnum text-ink">{formatBytes(usage.used)}</b> de {formatBytes(usage.quota)}</span>
              <span className="tnum text-xs text-ink-3">{formatPercent(frac)}</span>
            </div>
            <Progress value={frac * 100} tone={tone} className="mt-2 h-2" />
          </div>
        </div>
      </Panel>

      {msg && <div className="mb-4 rounded-md border border-line bg-surface-2 px-3 py-2 text-sm text-ink-2">{msg}</div>}

      <Panel>
        <PanelHeader title="Biblioteca" description={items.length ? `${items.length} arquivo(s)` : undefined} />
        {loading ? (
          <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="aspect-video rounded-lg" />)}
          </div>
        ) : error ? (
          <ErrorState description="Não foi possível carregar a biblioteca." onRetry={reload} />
        ) : items.length === 0 ? (
          <EmptyState icon={ImageIcon} title="Sem mídia ainda" description="Envie imagens e vídeos para usar nas telas."
            action={<Button size="sm" variant="primary" icon={UploadCloud} onClick={() => inputRef.current && inputRef.current.click()}>Enviar mídia</Button>} />
        ) : (
          <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 lg:grid-cols-4">
            {items.map((m) => (
              <div key={m.id} className="group overflow-hidden rounded-lg border border-line bg-surface-2">
                <div className="relative aspect-video bg-[#0a1128]">
                  {String(m.mime).startsWith('video/')
                    ? <div className="flex h-full items-center justify-center text-white/70"><Film size={26} /></div>
                    : <img src={m.url} alt="" className="h-full w-full object-cover" />}
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
