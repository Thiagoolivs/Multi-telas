import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Smartphone, Images, Camera, ImageUp, Check, ArrowLeft, Search, Crosshair, Video, Play } from 'lucide-react';
import { Dialog } from '../ui/Dialog.jsx';
import { Button } from '../ui/Button.jsx';
import { Field, Textarea } from '../ui/Field.jsx';
import { Spinner } from '../ui/Feedback.jsx';
import { EscolherArquivo } from '../ui/EscolherArquivo.jsx';
import { BancoDeImagens } from '../content/FotoDoProduto.jsx';
import { media, ia, pixabay } from '../../api.js';
import { prepararFoto } from '../../lib/subir.js';
import { carregarDesenhista } from '../../lib/pecaHtml.js';
import { lerValor, tamanhoNaTv, proporcaoDe, formatoParaIA, fotosDoBanco, pedidoDaFoto, carregarBanco, NOME_DO_PAPEL } from '../../lib/espacos.js';
import { ACEITA_VIDEO, LIMITES_FOTO_VIVA, ehVideoSrc, posterDe, lerVideo, problemaDoVideo, subirFotoViva, carregarBancoDeVideos } from '../../lib/fotoViva.js';

/*
 * TROCAR FOTO: o que enche um espaço de imagem de uma peça.
 *
 * Três jeitos de ter a foto, um por aba:
 *   Do celular      a câmera ou a galeria (e as que a conta já enviou);
 *   Banco de fotos  as fotos livres escolhidas para o tipo de negócio da
 *                   conta (`ramo`) e para o papel do espaço
 *                   (pecas-ouro/fotos/banco.json);
 *   Gerar com IA    um pedido já escrito a partir do título da peça e do
 *                   papel; a foto sai no formato do espaço.
 *
 * Escolhida a foto, a pessoa toca no que importa nela (o FOCO) e vê, ao
 * lado, como ela fica no espaço — com o MESMO encaixe da TV
 * (js/peca-render.js, encaixarFoto): cortada em volta do foco, ou inteira
 * com o fundo desfocado quando o formato não combina.
 *
 * FOTO VIVA: todo espaço de foto aceita também um VÍDEO curto e mudo, que
 * fica em laço na TV (lib/fotoViva.js). Do celular: até 15 s e 30 MB. No
 * banco: o filtro "Vídeos" (pecas-ouro/videos/banco.json). O ponto que
 * importa é tocado no primeiro quadro (o poster), e a prévia toca o vídeo.
 *
 * Props:
 *   papel     'produto' | 'ambiente' | 'pessoa' | 'textura'
 *   ramo      o tipo de negócio da conta (js/paletas.js, RAMOS)
 *   valor     a foto de agora: "/media/…" ou { src, foco } (vídeo: "….mp4", com `poster`)
 *   formato   a forma do espaço: '16/9', um número, [w, h] ou { w, h } (em pixel da TV)
 *   titulo    o título da peça, para o pedido à IA
 *   onTrocar  ({ src, foco, poster }, { credito, fundo, poster }) — `fundo` é
 *             a miniatura que vira o fundo desfocado (item.espacos[nome].fundo);
 *             `poster`, o primeiro quadro do vídeo (só na foto viva)
 *   onFechar  fechar sem trocar
 *   abaInicial  a aba que abre ('celular', 'banco' ou 'ia'; padrão 'celular')
 *   umToque   a foto escolhida já vale, sem o passo do ponto que importa
 *             ("Sua primeira TV em 5 minutos", reteste 2: eram 4 toques para
 *             pôr uma foto). As do banco já vêm com o ponto escolhido, e
 *             "Ajustar o ponto" (na foto de agora) ainda abre o passo do ponto.
 */
const ABAS = [['celular', 'Do celular', Smartphone], ['banco', 'Banco de fotos', Images], ['ia', 'Gerar com IA', null]];
const ACEITA = 'image/png,image/jpeg,image/webp';
const ehFoto = (m) => /^image\/(png|jpeg|webp)$/.test((m && m.mime) || '') && (m.origem || '') !== 'poster';
const segundos = (n) => (n > 0 ? Math.round(n) + ' s' : '');

export function TrocarFoto({ papel = 'produto', ramo = '', valor, onTrocar, formato = '16/9', titulo = '', onFechar, abaInicial = 'celular', umToque = false }) {
  const atual = lerValor(valor);
  const [fase, setFase] = useState('escolher');
  const [aba, setAba] = useState(abaInicial);
  const [escolhida, setEscolhida] = useState(null);   // { src, credito, fundo, poster, video }
  const [foco, setFoco] = useState(null);
  const [fundo, setFundo] = useState('');
  const [decisao, setDecisao] = useState(null);
  const fechar = onFechar || (() => {});

  function escolher(f, { ajustar = false } = {}) {
    const video = ehVideoSrc(f.src);
    // Um toque: a foto vale já (o ponto, o do banco ou o meio); "Ajustar o ponto" ainda abre o passo do ponto.
    if (umToque && !ajustar) {
      const poster = video ? { poster: f.poster || posterDe(f.src) } : {};
      onTrocar({ src: f.src, ...(f.foco ? { foco: f.foco } : {}), ...poster }, { credito: f.credito || '', fundo: f.fundo || '', ...poster });
      return;
    }
    setEscolhida({ src: f.src, credito: f.credito || '', fundo: f.fundo || '', video, poster: video ? f.poster || posterDe(f.src) : '' });
    setFoco(f.foco || null);
    setFundo(f.fundo || '');
    setDecisao(null);
    setFase('foco');
  }

  function usar() {
    if (!escolhida) return;
    const poster = escolhida.video ? { poster: escolhida.poster } : {};
    onTrocar({ src: escolhida.src, ...(foco ? { foco } : {}), ...poster }, { credito: escolhida.credito || '', fundo: escolhida.fundo || fundo || '', ...poster });
  }

  return (
    <Dialog open onClose={fechar} className="max-w-2xl" title="Trocar foto"
      description={fase === 'escolher'
        ? 'Espaço para foto de ' + (NOME_DO_PAPEL[papel] || 'produto') + ' — ou um vídeo curto, sem som, que fica em laço. Escolha de onde vem.'
        : 'Toque no que é mais importante ' + (escolhida && escolhida.video ? 'no vídeo' : 'na foto') + '. Esse ponto nunca fica fora da TV.'}
      footer={<>
        {fase === 'foco'
          ? <Button variant="ghost" icon={ArrowLeft} className="mr-auto" onClick={() => setFase('escolher')}>Escolher outra</Button>
          : <Button variant="ghost" onClick={fechar}>Cancelar</Button>}
        {/* Um toque: na escolha, a foto tocada já vale; o botão só aparece no passo do ponto. */}
        {!(umToque && fase !== 'foco') && (
          <Button variant="primary" icon={Check} disabled={fase !== 'foco' || !escolhida} onClick={usar}>{escolhida && escolhida.video ? 'Usar este vídeo' : 'Usar esta foto'}</Button>
        )}
      </>}>
      {fase === 'escolher' ? (
        <div className="space-y-3">
          {atual.src && (
            <div className="flex items-center gap-2.5 rounded-lg border border-line p-2">
              <Miniatura src={ehVideoSrc(atual.src) ? atual.poster || posterDe(atual.src) : atual.src} video={ehVideoSrc(atual.src)} className="h-12 w-12 shrink-0 rounded-md" />
              <span className="min-w-0 flex-1 text-xs text-ink-2">{ehVideoSrc(atual.src) ? 'Vídeo de agora' : 'Foto de agora'}</span>
              <Button size="sm" variant="ghost" icon={Crosshair} onClick={() => escolher({ src: atual.src, foco: atual.foco, poster: atual.poster }, { ajustar: true })}>Ajustar o ponto</Button>
            </div>
          )}
          <div className="flex gap-1 rounded-lg border border-line bg-surface-2 p-1" role="tablist" aria-label="De onde vem a foto">
            {ABAS.map(([id, nome, Icone]) => (
              <button key={id} type="button" role="tab" id={'aba-foto-' + id} aria-selected={aba === id} aria-controls={'painel-foto-' + id} onClick={() => setAba(id)}
                className={'flex min-h-12 min-w-0 flex-1 basis-0 flex-col items-center justify-center gap-0.5 rounded-md px-1 text-xs font-medium transition sm:min-h-9 sm:flex-row sm:gap-1.5 '
                  + (aba === id ? 'bg-surface text-ink shadow-xs' : 'text-ink-3 hover:text-ink-2')}>
                {Icone && <Icone size={15} className="shrink-0" />} <span className="max-w-full truncate">{nome}</span>
              </button>
            ))}
          </div>
          <div role="tabpanel" id={'painel-foto-' + aba} aria-labelledby={'aba-foto-' + aba}>
            {aba === 'celular' && <DoCelular onEscolher={escolher} />}
            {aba === 'banco' && <DoBanco ramo={ramo} papel={papel} onEscolher={escolher} umToque={umToque} />}
            {aba === 'ia' && <ComIA papel={papel} ramo={ramo} titulo={titulo} formato={formato} onEscolher={escolher} />}
          </div>
        </div>
      ) : escolhida && (
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <div className="mb-1.5 text-xs font-medium text-ink-2">{escolhida.video ? 'O primeiro quadro · toque no que importa' : 'A foto · toque no que importa'}</div>
            <EscolherFoco src={escolhida.video ? escolhida.poster : escolhida.src} foco={foco} onFoco={setFoco} onCarregou={(img) => {
              if (escolhida.fundo) return;
              carregarDesenhista().then((R) => setFundo(R.miniaturaDaFoto(img) || '')).catch(() => {});
            }} />
            {escolhida.credito && <p className="mt-1 text-2xs text-ink-3">{escolhida.credito}</p>}
          </div>
          <div>
            <div className="mb-1.5 text-xs font-medium text-ink-2">Assim fica no espaço da peça</div>
            <PreviaDoEspaco src={escolhida.src} video={escolhida.video} poster={escolhida.poster} foco={foco} papel={papel} fundo={escolhida.fundo || fundo} formato={formato} onDecisao={setDecisao} />
            {decisao && decisao.modo === 'conter' && (
              <p className="mt-1.5 text-xs leading-snug text-ink-3">{decisao.motivo === 'pequena'
                ? (escolhida.video ? 'O vídeo é pequeno para este espaço: ele aparece inteiro' : 'A foto é pequena para este espaço: ela aparece inteira') + ', no meio, com o fundo desfocado, para não ficar borrad' + (escolhida.video ? 'o.' : 'a.')
                : 'O formato é diferente do espaço: ' + (escolhida.video ? 'o vídeo aparece inteiro' : 'a foto aparece inteira') + ', com o fundo desfocado, sem cortar nada importante.'}</p>
            )}
            {!foco && <p className="mt-1.5 text-xs text-ink-3">Sem toque, {escolhida.video ? 'o vídeo fica centralizado' : 'a foto fica centralizada'}.</p>}
            {escolhida.video && <p className="mt-1.5 text-xs text-ink-3">Na TV ele toca sem som, em laço. Em TV fraca aparece o primeiro quadro, parado.</p>}
          </div>
        </div>
      )}
    </Dialog>
  );
}

/* ---------------- Do celular ---------------- */

/*
 * As fotos e os vídeos da foto viva que a conta já enviou. Vídeo só entra
 * quando tem o poster ao lado (origem 'poster', server/foto-viva.js): é o
 * sinal de que passou pela porta da foto viva — curto, mudo e leve.
 */
export function minhasDaConta(items) {
  const l = Array.isArray(items) ? items : [];
  const posters = new Set(l.filter((m) => m && m.origem === 'poster').map((m) => m.url));
  return l.filter((m) => m && (ehFoto(m) || (/^video\//.test(m.mime || '') && posters.has(posterDe(m.url)))))
    .map((m) => (/^video\//.test(m.mime || '') ? { ...m, video: true, poster: posterDe(m.url) } : m));
}

/*
 * Sobe uma foto do celular como o "Do celular" sobe: encolhida antes, com a
 * miniatura borrada do fundo (lib/subir.js). Devolve { src, fundo }. O
 * passo "Fotos e textos" da Primeira TV usa direto, no "Usar uma foto do
 * celular" (dois toques: o botão e a foto).
 */
export async function subirFotoDoCelular(f) {
  if (!f || !/^image\/(png|jpeg|webp)$/.test(f.type)) throw new Error('Use uma foto em JPG, PNG ou WEBP.');
  const p = await prepararFoto(f);
  const up = await media.upload(p.envio);
  URL.revokeObjectURL(p.previa);
  return { src: up.url, fundo: p.fundo };
}

function DoCelular({ onEscolher }) {
  const [enviando, setEnviando] = useState('');
  const [progresso, setProgresso] = useState(0);
  const [erro, setErro] = useState('');
  const [minhas, setMinhas] = useState(null);

  useEffect(() => {
    let vivo = true;
    media.list().then((r) => { if (vivo) setMinhas(minhasDaConta(r && r.items).slice(0, 9)); }).catch(() => { if (vivo) setMinhas([]); });
    return () => { vivo = false; };
  }, []);

  async function enviarVideo(f) {
    setEnviando('video'); setErro(''); setProgresso(0);
    let lido = null;
    try {
      if (f.size > LIMITES_FOTO_VIVA.mb * 1024 * 1024) throw new Error(problemaDoVideo(f, null));
      lido = await lerVideo(f);
      const p = problemaDoVideo(f, lido);
      if (p) throw new Error(p);
      const up = await subirFotoViva(f, lido, setProgresso);
      onEscolher({ src: up.url, poster: up.poster, fundo: lido.fundo || '' });
    } catch (err) {
      setErro(err.message || 'O vídeo não subiu. Tente de novo.');
    } finally {
      if (lido && lido.previa) URL.revokeObjectURL(lido.previa);
      setEnviando('');
    }
  }

  async function enviar(e) {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!f) return;
    if (/^video\//.test(f.type) || /\.(mp4|mov|webm)$/i.test(f.name || '')) { enviarVideo(f); return; }
    if (!/^image\/(png|jpeg|webp)$/.test(f.type)) { setErro('Use uma foto em JPG, PNG ou WEBP, ou um vídeo curto.'); return; }
    setEnviando('foto'); setErro('');
    try {
      // A foto do celular encolhe antes de subir, e a miniatura borrada já sai daqui (lib/subir.js).
      onEscolher(await subirFotoDoCelular(f));
    } catch (err) {
      setErro(err.message || 'A foto não subiu. Tente de novo.');
    } finally { setEnviando(''); }
  }

  const botao = 'flex min-h-24 w-full flex-col items-center justify-center gap-1.5 rounded-lg border border-line bg-surface-2 p-2 text-center text-sm font-medium leading-tight text-ink transition hover:border-accent';
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        <EscolherArquivo accept={ACEITA} capture="environment" onChange={enviar} disabled={!!enviando} className={botao}>
          <Camera size={22} className="text-ink-2" /> Tirar foto
        </EscolherArquivo>
        <EscolherArquivo accept={ACEITA_VIDEO} capture="environment" onChange={enviar} disabled={!!enviando} className={botao}>
          <Video size={22} className="text-ink-2" /> Gravar vídeo
        </EscolherArquivo>
        <EscolherArquivo accept={ACEITA + ',' + ACEITA_VIDEO} onChange={enviar} disabled={!!enviando} className={botao}>
          <ImageUp size={22} className="text-ink-2" /> Da galeria
        </EscolherArquivo>
      </div>
      <p className="text-2xs text-ink-3">Vídeo: até {LIMITES_FOTO_VIVA.segundos} segundos e {LIMITES_FOTO_VIVA.mb} MB. Na TV ele toca sem som, em laço.</p>
      {enviando === 'foto' && <p className="flex items-center gap-1.5 text-xs text-ink-3"><Spinner size={14} /> Enviando a foto…</p>}
      {enviando === 'video' && (
        <div className="space-y-1" role="status">
          <p className="flex items-center gap-1.5 text-xs text-ink-3"><Spinner size={14} /> {progresso < 1 ? 'Enviando o vídeo… ' + Math.round(progresso * 100) + '%' : 'Preparando o vídeo para a TV…'}</p>
          <div className="h-1.5 overflow-hidden rounded-full bg-surface-2"><div className="h-full bg-accent transition-[width]" style={{ width: Math.round(progresso * 100) + '%' }} /></div>
        </div>
      )}
      {erro && <p className="text-xs text-danger" role="alert">{erro}</p>}
      {minhas && minhas.length > 0 && (
        <div>
          <div className="mb-1.5 text-xs font-medium text-ink-2">Ou uma que você já enviou</div>
          <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-5">
            {minhas.map((m) => (
              <button key={m.id} type="button" onClick={() => onEscolher(m.video ? { src: m.url, poster: m.poster } : { src: m.url })}
                aria-label={'Usar ' + (m.name || (m.video ? 'este vídeo' : 'esta foto'))}
                className="aspect-square overflow-hidden rounded-md border border-line transition hover:border-accent">
                <Miniatura src={m.video ? m.poster : m.url} video={m.video} className="h-full w-full" />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// A miniatura de uma foto, ou do poster de um vídeo com o selo de "toca".
function Miniatura({ src, video, duracao, className = '', style }) {
  return (
    <span className={'relative block overflow-hidden ' + className}>
      <img src={src} alt="" loading="lazy" className="h-full w-full object-cover" style={style} />
      {video && (
        <span className="absolute bottom-1 left-1 inline-flex items-center gap-0.5 rounded-full bg-black/65 px-1.5 py-0.5 text-2xs font-medium text-white">
          <Play size={10} fill="currentColor" aria-hidden="true" />{duracao ? segundos(duracao) : <span className="sr-only">vídeo</span>}
        </span>
      )}
    </span>
  );
}

/* ---------------- Banco de fotos ---------------- */

function DoBanco({ ramo, papel, onEscolher, umToque }) {
  const [tipo, setTipo] = useState('fotos');
  const [lista, setLista] = useState(null);
  const [videos, setVideos] = useState(null);
  const [mais, setMais] = useState(false);
  const [pixabayLigada, setPixabayLigada] = useState(false);

  useEffect(() => { let vivo = true; carregarBanco().then((l) => { if (vivo) setLista(l); }); return () => { vivo = false; }; }, []);
  useEffect(() => {
    if (tipo !== 'videos' || videos) return undefined;
    let vivo = true;
    carregarBancoDeVideos().then((l) => { if (vivo) setVideos(l); });
    return () => { vivo = false; };
  }, [tipo, videos]);
  useEffect(() => {
    if (!mais) return undefined;
    let vivo = true;
    pixabay.estado().then((r) => { if (vivo) setPixabayLigada(!!(r && r.configurado)); }).catch(() => {});
    return () => { vivo = false; };
  }, [mais]);

  const ehVideos = tipo === 'videos';
  // O mesmo critério das fotos (o ramo e o papel primeiro) vale para os vídeos.
  const fotos = useMemo(() => (ehVideos ? fotosDoBanco(videos, ramo, papel) : fotosDoBanco(lista, ramo, papel)), [ehVideos, videos, lista, ramo, papel]);
  const doNegocio = fotos.filter((f) => f.doRamo);
  const outras = fotos.filter((f) => !f.doRamo);
  const grade = (l) => (
    <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
      {l.map((f) => (
        <button key={f.id} type="button" title={(f.descricao ? f.descricao + ' · ' : '') + (f.credito || '')}
          aria-label={'Usar ' + (f.descricao || (ehVideos ? 'este vídeo do banco' : 'esta foto do banco'))}
          onClick={() => onEscolher(ehVideos
            ? { src: f.arquivo, poster: f.poster, foco: f.foco || null, credito: f.credito ? 'Vídeo: ' + f.credito : '' }
            : { src: f.arquivo, foco: f.foco || null, credito: f.credito ? 'Foto: ' + f.credito : '' })}
          className="aspect-square overflow-hidden rounded-md border border-line transition hover:border-accent">
          <Miniatura src={ehVideos ? f.poster : f.arquivo} video={ehVideos} duracao={f.duracao} className="h-full w-full"
            style={f.foco ? { objectPosition: Math.round(f.foco.x * 100) + '% ' + Math.round(f.foco.y * 100) + '%' } : undefined} />
        </button>
      ))}
    </div>
  );
  const filtro = 'inline-flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-md px-3 text-xs font-medium transition sm:flex-none ';

  return (
    <div className="space-y-3">
      <div className="flex gap-1 rounded-lg border border-line bg-surface-2 p-1" role="group" aria-label="Mostrar do banco">
        {[['fotos', 'Fotos', Images], ['videos', 'Vídeos', Video]].map(([id, nome, Icone]) => (
          <button key={id} type="button" aria-pressed={tipo === id} onClick={() => setTipo(id)}
            className={filtro + (tipo === id ? 'bg-surface text-ink shadow-xs' : 'text-ink-3 hover:text-ink-2')}>
            <Icone size={14} aria-hidden="true" /> {nome}
          </button>
        ))}
      </div>
      {ehVideos ? (videos === null ? <p className="flex items-center gap-1.5 text-xs text-ink-3"><Spinner size={14} /> Abrindo o banco de vídeos…</p>
        : !fotos.length ? <p className="text-xs text-ink-3">O banco ainda não tem vídeos. Grave um no celular, de até {LIMITES_FOTO_VIVA.segundos} segundos.</p>
          : <>
            {doNegocio.length > 0 && <div><div className="mb-1.5 text-xs font-medium text-ink-2">Para o seu negócio</div>{grade(doNegocio)}</div>}
            {outras.length > 0 && <div><div className="mb-1.5 text-xs font-medium text-ink-2">{doNegocio.length ? 'Outros' : 'Vídeos do banco'}</div>{grade(outras)}</div>}
            <p className="text-2xs text-ink-3">Vídeos curtos e livres, sem som. Na TV ficam em laço; em TV fraca aparece o primeiro quadro.</p>
          </>)
      : lista === null ? <p className="flex items-center gap-1.5 text-xs text-ink-3"><Spinner size={14} /> Abrindo o banco de fotos…</p>
        : !fotos.length ? <p className="text-xs text-ink-3">O banco ainda não tem fotos para este espaço. Use uma do celular ou gere com a IA.</p>
          : <>
            {doNegocio.length > 0 && <div><div className="mb-1.5 text-xs font-medium text-ink-2">Para o seu negócio{umToque ? ' · toque numa para usar' : ''}</div>{grade(doNegocio)}</div>}
            {outras.length > 0 && <div><div className="mb-1.5 text-xs font-medium text-ink-2">{doNegocio.length ? 'Outras' : 'Fotos do banco'}</div>{grade(outras)}</div>}
            <p className="text-2xs text-ink-3">Fotos livres para usar na sua TV.</p>
          </>}
      {ehVideos ? null : !mais
        ? <Button size="sm" variant="ghost" icon={Search} onClick={() => setMais(true)}>Procurar mais fotos</Button>
        : <BancoDeImagens pixabayLigada={pixabayLigada} onEscolher={(url, extra) => onEscolher({ src: url, credito: (extra && extra.credito) || '' })} />}
    </div>
  );
}

/* ---------------- Gerar com IA ---------------- */

function ComIA({ papel, ramo, titulo, formato, onEscolher }) {
  const [pedido, setPedido] = useState(() => pedidoDaFoto({ titulo, papel, ramo }));
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState('');
  const forma = formatoParaIA(formato);

  async function gerar() {
    const t = pedido.trim();
    if (!t || gerando) return;
    setGerando(true); setErro('');
    try {
      const r = await ia.imagem({ prompt: t, formato: forma, papel });
      onEscolher({ src: r.item.url });
    } catch (e) {
      setErro(e.message || 'A IA não conseguiu fazer a foto agora. Tente de novo.');
    } finally { setGerando(false); }
  }

  return (
    <div className="space-y-2.5">
      <Field label="O que a foto deve mostrar" hint={'Usa 1 criação do mês. A foto sai ' + (forma === '9/16' ? 'em pé' : forma === '1/1' ? 'quadrada' : 'deitada') + ', no formato do espaço, e fica na sua Biblioteca.'}>
        <Textarea rows={3} maxLength={400} value={pedido} onChange={(e) => setPedido(e.target.value)} disabled={gerando} />
      </Field>
      <Button variant="secondary" disabled={!pedido.trim() || gerando} onClick={gerar}>{gerando ? 'Gerando…' : 'Gerar foto'}</Button>
      {gerando && <p className="flex items-center gap-1.5 text-xs text-ink-3"><Spinner size={14} /> Gerando a foto. Leva uns 20 segundos.</p>}
      {erro && <p className="text-xs text-danger" role="alert">{erro}</p>}
    </div>
  );
}

/* ---------------- O ponto que importa ---------------- */

const PASSO = 0.05;
const limitar = (n) => Math.round(Math.min(1, Math.max(0, n)) * 1000) / 1000;

function EscolherFoco({ src, foco, onFoco, onCarregou }) {
  const img = useRef(null);
  const f = foco || { x: 0.5, y: 0.5 };
  function tocar(e) {
    const r = img.current && img.current.getBoundingClientRect();
    if (!r || !r.width || !r.height) return;
    onFoco({ x: limitar((e.clientX - r.left) / r.width), y: limitar((e.clientY - r.top) / r.height) });
  }
  function teclas(e) {
    const d = { ArrowLeft: [-PASSO, 0], ArrowRight: [PASSO, 0], ArrowUp: [0, -PASSO], ArrowDown: [0, PASSO] }[e.key];
    if (!d) return;
    e.preventDefault();
    onFoco({ x: limitar(f.x + d[0]), y: limitar(f.y + d[1]) });
  }
  return (
    <div className="flex justify-center rounded-lg bg-surface-2 p-1.5">
      <div role="button" tabIndex={0} onClick={tocar} onKeyDown={teclas}
        aria-label={'Ponto mais importante da foto: ' + Math.round(f.x * 100) + '% da esquerda, ' + Math.round(f.y * 100) + '% do alto. Toque na foto ou use as setas para mudar.'}
        className="relative inline-block cursor-crosshair touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
        <img ref={img} src={src} alt="" draggable={false} onLoad={(e) => onCarregou && onCarregou(e.currentTarget)}
          className="block max-h-[30vh] max-w-full select-none rounded-md md:max-h-[50vh]" />
        <span aria-hidden="true" className="pointer-events-none absolute h-8 w-8 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-white shadow-[0_0_0_2px_rgba(0,0,0,.55)]"
          style={{ left: f.x * 100 + '%', top: f.y * 100 + '%' }} />
      </div>
    </div>
  );
}

/*
 * A forma do espaço com a foto dentro, encaixada pelo MESMO código da TV
 * (MTPecaRender.encaixarFoto). O espaço é desenhado no tamanho dele na TV e
 * reduzido, como as miniaturas das peças: "pequena demais" é decidido em
 * pixel da TV, não da tela do celular.
 */
function PreviaDoEspaco({ src, video, poster, foco, papel, fundo, formato, onDecisao }) {
  const caixa = useRef(null);
  const img = useRef(null);
  const [escala, setEscala] = useState(0);
  const [w, h] = tamanhoNaTv(formato);
  const r = proporcaoDe([w, h]);

  useEffect(() => {
    const el = caixa.current;
    if (!el) return undefined;
    const medir = () => setEscala(el.clientWidth / w);
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, [w]);

  function aplicar() {
    const el = img.current;
    // A foto já carregada, ou o vídeo com as medidas lidas (FOTO VIVA: o encaixe é o mesmo).
    if (!el || (video ? !el.videoWidth : !el.complete || !el.naturalWidth)) return;
    carregarDesenhista().then((R) => { if (img.current === el) onDecisao(R.encaixarFoto(el, { papel, foco, fundo })); }).catch(() => {});
  }
  useEffect(aplicar, [src, foco && foco.x, foco && foco.y, papel, fundo, w, h]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div ref={caixa} className="relative mx-auto overflow-hidden rounded-md bg-[#1a1a1a] ring-1 ring-line"
      style={{ aspectRatio: w + ' / ' + h, width: 'min(100%, ' + Math.round(200 * r) + 'px)' }}>
      <div style={{ position: 'absolute', left: 0, top: 0, width: w, height: h, transformOrigin: '0 0', transform: 'scale(' + escala + ')', visibility: escala ? 'visible' : 'hidden' }}>
        {video
          ? <video ref={img} src={src} poster={poster || undefined} muted loop autoPlay playsInline preload="auto" aria-hidden="true" onLoadedMetadata={aplicar}
            style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover' }} />
          : <img ref={img} src={src} alt="" onLoad={aplicar} style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover' }} />}
      </div>
    </div>
  );
}
