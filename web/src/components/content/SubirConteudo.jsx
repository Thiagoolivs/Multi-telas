import React, { useEffect, useRef, useState } from 'react';
import { Images, Camera, Check, MonitorPlay, UploadCloud, AlertTriangle, RefreshCw } from 'lucide-react';
import { Dialog } from '../ui/Dialog.jsx';
import { Button } from '../ui/Button.jsx';
import { devices } from '../../api.js';
import { publicarPecas } from '../../lib/publicar.js';
import { aviso } from '../../lib/avisos.js';
import { cn } from '../../lib/cn.js';
import {
  ehVideo, ehImagem, prepararFoto, prepararVideo, avaliarVideo, enviarComProgresso, itemDaMidia, EVENTO_SUBIR, lerCompartilhados,
} from '../../lib/subir.js';

/*
 * Subir foto ou vídeo direto para a TV (docs/EXECUTOR.md, item 4).
 *
 * Mora no casco do painel, não numa página: abre do Início ("Pôr foto ou
 * vídeo na TV"), de qualquer lugar arrastando um arquivo no computador, e —
 * no item 5 — do "compartilhar" do celular. Sem a grade de 99 tipos: é foto
 * ou vídeo, a tela já marcada, e um botão.
 *
 * Toques no celular: "Pôr foto ou vídeo na TV" (1) → escolher na galeria
 * (2) → "Pôr na TV" (3). O envio começa assim que a foto é escolhida, então
 * quando o polegar chega no botão ele quase sempre já terminou.
 */

const ACEITA = 'image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm';

function Barra({ fracao }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuenow={Math.round(fracao * 100)} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: Math.round(fracao * 100) + '%' }} />
    </div>
  );
}

export function SubirConteudo() {
  const [aberto, setAberto] = useState(false);
  const [envios, setEnvios] = useState([]);   // [{ id, nome, video, previa, fundo, progresso, url, erro, aviso }]
  const [telas, setTelas] = useState(null);
  const [alvos, setAlvos] = useState([]);
  const [publicando, setPublicando] = useState(false);
  const [feito, setFeito] = useState(null);
  const [arrastando, setArrastando] = useState(false);
  const seq = useRef(0);

  function abrir(arquivos) {
    setAberto(true); setFeito(null);
    if (telas === null) {
      devices.list().then((r) => {
        const lista = (r && r.devices) || [];
        setTelas(lista);
        setAlvos(lista.map((t) => t.id)); // já marcadas: a maioria tem uma ou duas
      }).catch(() => setTelas([]));
    }
    if (arquivos && arquivos.length) adicionar(arquivos);
  }

  function fechar() {
    if (publicando) return;
    setAberto(false); setEnvios([]); setFeito(null);
  }

  const atualizar = (id, campos) => setEnvios((xs) => xs.map((x) => (x.id === id ? { ...x, ...campos } : x)));

  async function adicionar(lista) {
    const arquivos = Array.from(lista || []).filter((f) => ehImagem(f) || ehVideo(f)).slice(0, 10);
    if (!arquivos.length) { aviso.erro('subir', 'Só dá para pôr foto (JPG, PNG, WEBP, GIF) ou vídeo (MP4, WEBM) na TV.'); return; }
    for (const f of arquivos) {
      const id = ++seq.current;
      const video = ehVideo(f);
      setEnvios((xs) => [...xs, { id, nome: f.name, video, progresso: 0 }]);
      try {
        const prep = video ? await prepararVideo(f) : await prepararFoto(f);
        /*
         * Vídeo pesado para o box: avisa, com o motivo, e não proíbe. A
         * normalização no servidor (item 12) precisa de ffmpeg, que é infra;
         * até lá, quem sobe um 4K em HEVC fica sabendo antes de a TV engasgar.
         */
        const av = video ? await avaliarVideo(f, prep) : null;
        atualizar(id, { previa: prep.previa, fundo: prep.fundo, aviso: av ? av.aviso : '' });
        const r = await enviarComProgresso(prep.envio, (p) => atualizar(id, { progresso: p }));
        atualizar(id, { url: r.url, progresso: 1 });
      } catch (e) {
        atualizar(id, { erro: e.message || 'Não deu para enviar.' });
      }
    }
  }

  /*
   * Chegou pelo "compartilhar" da galeria (?compartilhado=N, ver
   * web/public/sw.js) ou pelo atalho do ícone instalado (?subir=1). O
   * endereço é limpo logo: recarregar a página não pode abrir o envio de novo.
   */
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const compartilhado = q.get('compartilhado');
    const atalho = q.get('subir');
    if (compartilhado == null && !atalho) return;
    try {
      const u = new URL(window.location.href);
      u.searchParams.delete('compartilhado'); u.searchParams.delete('subir');
      window.history.replaceState(window.history.state, '', u.pathname + u.search + u.hash);
    } catch (e) { /* segue */ }
    if (atalho) { abrir([]); return; }
    lerCompartilhados().then((arquivos) => {
      if (arquivos.length) abrir(arquivos);
      else {
        abrir([]);
        aviso.erro('compartilhar', 'O arquivo não chegou.', 'Abra o MultiTelas uma vez pelo ícone e compartilhe de novo.');
      }
    }).catch(() => abrir([]));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Quem chama: o botão do Início, o arrastar-e-soltar e o compartilhar do celular.
  useEffect(() => {
    const on = (e) => abrir((e.detail && e.detail.arquivos) || []);
    window.addEventListener(EVENTO_SUBIR, on);
    return () => window.removeEventListener(EVENTO_SUBIR, on);
  }); // sem deps: `abrir` precisa ver o estado atual de `telas`

  /*
   * Arrastar e soltar em QUALQUER lugar do painel (desktop). Só arquivo, e só
   * quando nenhuma janela está aberta: o editor de peça e a camada de
   * imagens têm o próprio soltar, e roubar dali seria pior que não ter.
   */
  useEffect(() => {
    const temArquivo = (e) => Array.from((e.dataTransfer && e.dataTransfer.types) || []).includes('Files');
    const livre = () => !document.querySelector('[role="dialog"]');
    const sobre = (e) => { if (temArquivo(e) && livre()) { e.preventDefault(); setArrastando(true); } };
    const saiu = (e) => { if (!e.relatedTarget) setArrastando(false); };
    const soltou = (e) => {
      setArrastando(false);
      if (!temArquivo(e) || e.defaultPrevented || !livre()) return;
      e.preventDefault();
      abrir(e.dataTransfer.files);
    };
    window.addEventListener('dragover', sobre);
    window.addEventListener('dragleave', saiu);
    window.addEventListener('drop', soltou);
    return () => { window.removeEventListener('dragover', sobre); window.removeEventListener('dragleave', saiu); window.removeEventListener('drop', soltou); };
  });

  const prontos = envios.filter((x) => x.url && !x.erro);
  const enviando = envios.some((x) => !x.url && !x.erro);

  async function publicar() {
    if (!prontos.length) return;
    setPublicando(true);
    try {
      /*
       * Cada envio é uma origem própria: subir outra foto SOMA na tela, não
       * troca a anterior. Sempre na zona deitada (formato 16/9): a foto em pé
       * entra inteira, com o fundo borrado, em vez de ir para a lateral estreita.
       */
      const titulo = 'Enviado ' + new Date().toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
      const pecas = prontos.map((x) => ({ formato: '16/9', item: itemDaMidia({ url: x.url, fundo: x.fundo, video: x.video }) }));
      if (alvos.length) await publicarPecas({ alvos, pecas, titulo, telas });
      setFeito({ n: prontos.length, telas: alvos.length });
      aviso.ok(alvos.length ? 'Na TV: ' + prontos.length + (prontos.length === 1 ? ' arquivo.' : ' arquivos.') : 'Guardado em Mídias.');
    } catch (e) { aviso.erro('subir', e.message || 'Não deu para pôr na TV.'); }
    finally { setPublicando(false); }
  }

  return (
    <>
      {arrastando && (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-accent/15 backdrop-blur-[1px]">
          <div className="flex items-center gap-3 rounded-xl border-2 border-dashed border-accent bg-surface px-6 py-5 text-sm font-semibold text-ink shadow-pop">
            <UploadCloud size={22} className="text-accent" /> Solte para pôr na TV
          </div>
        </div>
      )}
      <Dialog open={aberto} onClose={fechar} title={feito ? 'Pronto!' : 'Pôr foto ou vídeo na TV'}
        description={feito ? undefined : 'Da galeria ou da câmera. A foto entra inteira; o que sobrar da tela vira a própria foto, borrada.'}
        className="max-w-xl"
        footer={feito
          ? <>
            <Button variant="ghost" onClick={fechar}>Fechar</Button>
            <Button variant="primary" icon={RefreshCw} onClick={() => { setFeito(null); setEnvios([]); }}>Pôr outra</Button>
          </>
          : <>
            <Button variant="ghost" onClick={fechar} disabled={publicando}>Cancelar</Button>
            <Button variant="primary" icon={Check} disabled={!prontos.length || enviando || publicando} onClick={publicar}>
              {publicando ? 'Pondo na TV…' : enviando ? 'Enviando…' : alvos.length ? 'Pôr na TV' : 'Guardar'}
            </Button>
          </>}>
        {feito ? (
          <div className="flex items-center gap-2 py-2 text-sm text-ink">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-ok/15 text-ok"><Check size={16} /></span>
            {feito.telas ? feito.n + (feito.n === 1 ? ' arquivo no ar em ' : ' arquivos no ar em ') + feito.telas + (feito.telas === 1 ? ' tela.' : ' telas.') : 'Guardado. Conecte uma TV para mostrar.'}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <label className="flex cursor-pointer flex-col items-center gap-1.5 rounded-xl border border-line p-4 text-center text-sm font-semibold text-ink transition hover:border-accent/60 hover:bg-surface-2">
                <Images size={22} className="text-accent" /> Galeria
                <input type="file" accept={ACEITA} multiple className="hidden" onChange={(e) => { adicionar(e.target.files); e.target.value = ''; }} />
              </label>
              <label className="flex cursor-pointer flex-col items-center gap-1.5 rounded-xl border border-line p-4 text-center text-sm font-semibold text-ink transition hover:border-accent/60 hover:bg-surface-2">
                <Camera size={22} className="text-accent" /> Câmera
                <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { adicionar(e.target.files); e.target.value = ''; }} />
              </label>
            </div>
            <p className="hidden text-center text-2xs text-ink-3 sm:block">ou arraste os arquivos para qualquer lugar do painel</p>

            {envios.length > 0 && (
              <ul className="space-y-2">
                {envios.map((x) => (
                  <li key={x.id} className="flex items-center gap-3 rounded-lg border border-line p-2">
                    <span className="relative flex h-14 w-24 shrink-0 items-center justify-center overflow-hidden rounded-md bg-black"
                      style={x.fundo ? { backgroundImage: 'url("' + x.fundo + '")', backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}>
                      {x.previa && (x.video
                        ? <video src={x.previa} muted playsInline className="relative h-full w-full object-contain" />
                        : <img src={x.previa} alt="" className="relative h-full w-full object-contain" />)}
                    </span>
                    <span className="min-w-0 flex-1 space-y-1">
                      <span className="block truncate text-xs font-medium text-ink">{x.nome}</span>
                      {x.erro
                        ? <span className="block text-2xs text-danger">{x.erro}</span>
                        : x.url
                          ? <span className="flex items-center gap-1 text-2xs text-ok"><Check size={12} /> Enviado</span>
                          : <Barra fracao={x.progresso || 0} />}
                      {x.aviso && <span className="flex items-start gap-1 text-2xs text-warn"><AlertTriangle size={12} className="mt-px shrink-0" />{x.aviso}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            {telas && telas.length > 0 && (
              <div>
                <div className="mb-1.5 text-xs font-medium text-ink-2">Em qual TV</div>
                <div className="flex flex-wrap gap-1.5">
                  {telas.map((t) => {
                    const ativo = alvos.includes(t.id);
                    return (
                      <button key={t.id} type="button" aria-pressed={ativo}
                        onClick={() => setAlvos((a) => (ativo ? a.filter((y) => y !== t.id) : [...a, t.id]))}
                        className={cn('flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs',
                          ativo ? 'border-accent bg-accent/10 font-semibold text-ink' : 'border-line text-ink-2')}>
                        {ativo ? <Check size={12} className="text-accent" /> : <MonitorPlay size={12} />} {t.name || 'Tela'}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            {telas && telas.length === 0 && (
              <p className="text-xs text-ink-3">Nenhuma TV conectada ainda: o arquivo fica guardado em Mídias.</p>
            )}
          </div>
        )}
      </Dialog>
    </>
  );
}
