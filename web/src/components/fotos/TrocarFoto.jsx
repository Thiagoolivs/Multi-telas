import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Smartphone, Images, Sparkles, Camera, ImageUp, Check, ArrowLeft, Search, Crosshair } from 'lucide-react';
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
 * Props:
 *   papel     'produto' | 'ambiente' | 'pessoa' | 'textura'
 *   ramo      o tipo de negócio da conta (js/paletas.js, RAMOS)
 *   valor     a foto de agora: "/media/…" ou { src, foco }
 *   formato   a forma do espaço: '16/9', um número, [w, h] ou { w, h } (em pixel da TV)
 *   titulo    o título da peça, para o pedido à IA
 *   onTrocar  ({ src, foco }, { credito, fundo }) — `fundo` é a miniatura
 *             que vira o fundo desfocado (item.espacos[nome].fundo)
 *   onFechar  fechar sem trocar
 */
const ABAS = [['celular', 'Do celular', Smartphone], ['banco', 'Banco de fotos', Images], ['ia', 'Gerar com IA', Sparkles]];
const ACEITA = 'image/png,image/jpeg,image/webp';
const ehFoto = (m) => /^image\/(png|jpeg|webp)$/.test((m && m.mime) || '');

export function TrocarFoto({ papel = 'produto', ramo = '', valor, onTrocar, formato = '16/9', titulo = '', onFechar }) {
  const atual = lerValor(valor);
  const [fase, setFase] = useState('escolher');
  const [aba, setAba] = useState('celular');
  const [escolhida, setEscolhida] = useState(null);   // { src, credito, fundo }
  const [foco, setFoco] = useState(null);
  const [fundo, setFundo] = useState('');
  const [decisao, setDecisao] = useState(null);
  const fechar = onFechar || (() => {});

  function escolher(f) {
    setEscolhida({ src: f.src, credito: f.credito || '', fundo: f.fundo || '' });
    setFoco(f.foco || null);
    setFundo(f.fundo || '');
    setDecisao(null);
    setFase('foco');
  }

  function usar() {
    if (!escolhida) return;
    onTrocar({ src: escolhida.src, ...(foco ? { foco } : {}) }, { credito: escolhida.credito || '', fundo: escolhida.fundo || fundo || '' });
  }

  return (
    <Dialog open onClose={fechar} className="max-w-2xl" title="Trocar foto"
      description={fase === 'escolher'
        ? 'Espaço para foto de ' + (NOME_DO_PAPEL[papel] || 'produto') + '. Escolha de onde vem a foto.'
        : 'Toque no que é mais importante na foto. Esse ponto nunca fica fora da TV.'}
      footer={<>
        {fase === 'foco'
          ? <Button variant="ghost" icon={ArrowLeft} className="mr-auto" onClick={() => setFase('escolher')}>Escolher outra</Button>
          : <Button variant="ghost" onClick={fechar}>Cancelar</Button>}
        <Button variant="primary" icon={Check} disabled={fase !== 'foco' || !escolhida} onClick={usar}>Usar esta foto</Button>
      </>}>
      {fase === 'escolher' ? (
        <div className="space-y-3">
          {atual.src && (
            <div className="flex items-center gap-2.5 rounded-lg border border-line p-2">
              <img src={atual.src} alt="" className="h-12 w-12 shrink-0 rounded-md object-cover" />
              <span className="min-w-0 flex-1 text-xs text-ink-2">Foto de agora</span>
              <Button size="sm" variant="ghost" icon={Crosshair} onClick={() => escolher({ src: atual.src, foco: atual.foco })}>Ajustar o ponto</Button>
            </div>
          )}
          <div className="flex gap-1 rounded-lg border border-line bg-surface-2 p-1" role="tablist" aria-label="De onde vem a foto">
            {ABAS.map(([id, nome, Icone]) => (
              <button key={id} type="button" role="tab" id={'aba-foto-' + id} aria-selected={aba === id} aria-controls={'painel-foto-' + id} onClick={() => setAba(id)}
                className={'flex min-h-12 min-w-0 flex-1 basis-0 flex-col items-center justify-center gap-0.5 rounded-md px-1 text-xs font-medium transition sm:min-h-9 sm:flex-row sm:gap-1.5 '
                  + (aba === id ? 'bg-surface text-ink shadow-xs' : 'text-ink-3 hover:text-ink-2')}>
                <Icone size={15} className="shrink-0" /> <span className="max-w-full truncate">{nome}</span>
              </button>
            ))}
          </div>
          <div role="tabpanel" id={'painel-foto-' + aba} aria-labelledby={'aba-foto-' + aba}>
            {aba === 'celular' && <DoCelular onEscolher={escolher} />}
            {aba === 'banco' && <DoBanco ramo={ramo} papel={papel} onEscolher={escolher} />}
            {aba === 'ia' && <ComIA papel={papel} ramo={ramo} titulo={titulo} formato={formato} onEscolher={escolher} />}
          </div>
        </div>
      ) : escolhida && (
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <div className="mb-1.5 text-xs font-medium text-ink-2">A foto · toque no que importa</div>
            <EscolherFoco src={escolhida.src} foco={foco} onFoco={setFoco} onCarregou={(img) => {
              if (escolhida.fundo) return;
              carregarDesenhista().then((R) => setFundo(R.miniaturaDaFoto(img) || '')).catch(() => {});
            }} />
            {escolhida.credito && <p className="mt-1 text-2xs text-ink-3">{escolhida.credito}</p>}
          </div>
          <div>
            <div className="mb-1.5 text-xs font-medium text-ink-2">Assim fica no espaço da peça</div>
            <PreviaDoEspaco src={escolhida.src} foco={foco} papel={papel} fundo={escolhida.fundo || fundo} formato={formato} onDecisao={setDecisao} />
            {decisao && decisao.modo === 'conter' && (
              <p className="mt-1.5 text-xs leading-snug text-ink-3">{decisao.motivo === 'pequena'
                ? 'A foto é pequena para este espaço: ela aparece inteira, no meio, com o fundo desfocado, para não ficar borrada.'
                : 'O formato da foto é diferente do espaço: ela aparece inteira, com o fundo desfocado, sem cortar nada importante.'}</p>
            )}
            {!foco && <p className="mt-1.5 text-xs text-ink-3">Sem toque, a foto fica centralizada.</p>}
          </div>
        </div>
      )}
    </Dialog>
  );
}

/* ---------------- Do celular ---------------- */

function DoCelular({ onEscolher }) {
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');
  const [minhas, setMinhas] = useState(null);

  useEffect(() => {
    let vivo = true;
    media.list().then((r) => { if (vivo) setMinhas(((r && r.items) || []).filter(ehFoto).slice(0, 9)); }).catch(() => { if (vivo) setMinhas([]); });
    return () => { vivo = false; };
  }, []);

  async function enviar(e) {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!f) return;
    if (!/^image\/(png|jpeg|webp)$/.test(f.type)) { setErro('Use uma foto em JPG, PNG ou WEBP.'); return; }
    setEnviando(true); setErro('');
    try {
      // A foto do celular encolhe antes de subir, e a miniatura borrada já sai daqui (lib/subir.js).
      const p = await prepararFoto(f);
      const up = await media.upload(p.envio);
      URL.revokeObjectURL(p.previa);
      onEscolher({ src: up.url, fundo: p.fundo });
    } catch (err) {
      setErro(err.message || 'A foto não subiu. Tente de novo.');
    } finally { setEnviando(false); }
  }

  const botao = 'flex min-h-24 w-full flex-col items-center justify-center gap-1.5 rounded-lg border border-line bg-surface-2 p-3 text-sm font-medium text-ink transition hover:border-accent';
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <EscolherArquivo accept={ACEITA} capture="environment" onChange={enviar} disabled={enviando} className={botao}>
          <Camera size={22} className="text-ink-2" /> Tirar foto
        </EscolherArquivo>
        <EscolherArquivo accept={ACEITA} onChange={enviar} disabled={enviando} className={botao}>
          <ImageUp size={22} className="text-ink-2" /> Escolher da galeria
        </EscolherArquivo>
      </div>
      {enviando && <p className="flex items-center gap-1.5 text-xs text-ink-3"><Spinner size={14} /> Enviando a foto…</p>}
      {erro && <p className="text-xs text-danger" role="alert">{erro}</p>}
      {minhas && minhas.length > 0 && (
        <div>
          <div className="mb-1.5 text-xs font-medium text-ink-2">Ou uma que você já enviou</div>
          <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-5">
            {minhas.map((m) => (
              <button key={m.id} type="button" onClick={() => onEscolher({ src: m.url })} aria-label={'Usar ' + (m.name || 'esta foto')}
                className="aspect-square overflow-hidden rounded-md border border-line transition hover:border-accent">
                <img src={m.url} alt="" loading="lazy" className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------- Banco de fotos ---------------- */

function DoBanco({ ramo, papel, onEscolher }) {
  const [lista, setLista] = useState(null);
  const [mais, setMais] = useState(false);
  const [pixabayLigada, setPixabayLigada] = useState(false);

  useEffect(() => { let vivo = true; carregarBanco().then((l) => { if (vivo) setLista(l); }); return () => { vivo = false; }; }, []);
  useEffect(() => {
    if (!mais) return undefined;
    let vivo = true;
    pixabay.estado().then((r) => { if (vivo) setPixabayLigada(!!(r && r.configurado)); }).catch(() => {});
    return () => { vivo = false; };
  }, [mais]);

  const fotos = useMemo(() => fotosDoBanco(lista, ramo, papel), [lista, ramo, papel]);
  const doNegocio = fotos.filter((f) => f.doRamo);
  const outras = fotos.filter((f) => !f.doRamo);
  const grade = (l) => (
    <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
      {l.map((f) => (
        <button key={f.id} type="button" title={(f.descricao ? f.descricao + ' · ' : '') + (f.credito || '')}
          aria-label={'Usar ' + (f.descricao || 'esta foto do banco')}
          onClick={() => onEscolher({ src: f.arquivo, foco: f.foco || null, credito: f.credito ? 'Foto: ' + f.credito : '' })}
          className="aspect-square overflow-hidden rounded-md border border-line transition hover:border-accent">
          <img src={f.arquivo} alt="" loading="lazy" className="h-full w-full object-cover"
            style={f.foco ? { objectPosition: Math.round(f.foco.x * 100) + '% ' + Math.round(f.foco.y * 100) + '%' } : undefined} />
        </button>
      ))}
    </div>
  );

  return (
    <div className="space-y-3">
      {lista === null ? <p className="flex items-center gap-1.5 text-xs text-ink-3"><Spinner size={14} /> Abrindo o banco de fotos…</p>
        : !fotos.length ? <p className="text-xs text-ink-3">O banco ainda não tem fotos para este espaço. Use uma do celular ou gere com a IA.</p>
          : <>
            {doNegocio.length > 0 && <div><div className="mb-1.5 text-xs font-medium text-ink-2">Para o seu negócio</div>{grade(doNegocio)}</div>}
            {outras.length > 0 && <div><div className="mb-1.5 text-xs font-medium text-ink-2">{doNegocio.length ? 'Outras' : 'Fotos do banco'}</div>{grade(outras)}</div>}
            <p className="text-2xs text-ink-3">Fotos livres para usar na sua TV.</p>
          </>}
      {!mais
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
      <Button variant="secondary" icon={Sparkles} disabled={!pedido.trim() || gerando} onClick={gerar}>{gerando ? 'Gerando…' : 'Gerar foto'}</Button>
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
function PreviaDoEspaco({ src, foco, papel, fundo, formato, onDecisao }) {
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
    if (!el || !el.complete || !el.naturalWidth) return;
    carregarDesenhista().then((R) => { if (img.current === el) onDecisao(R.encaixarFoto(el, { papel, foco, fundo })); }).catch(() => {});
  }
  useEffect(aplicar, [src, foco && foco.x, foco && foco.y, papel, fundo, w, h]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div ref={caixa} className="relative mx-auto overflow-hidden rounded-md bg-[#1a1a1a] ring-1 ring-line"
      style={{ aspectRatio: w + ' / ' + h, width: 'min(100%, ' + Math.round(200 * r) + 'px)' }}>
      <div style={{ position: 'absolute', left: 0, top: 0, width: w, height: h, transformOrigin: '0 0', transform: 'scale(' + escala + ')', visibility: escala ? 'visible' : 'hidden' }}>
        <img ref={img} src={src} alt="" onLoad={aplicar} style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover' }} />
      </div>
    </div>
  );
}
