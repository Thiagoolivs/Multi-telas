import React, { useEffect, useMemo, useState } from 'react';
import { Share2, Download, Copy, Check, Instagram, MessageCircle, Facebook, MapPin, CalendarClock, AlertTriangle, ExternalLink } from 'lucide-react';
import { Dialog } from '../ui/Dialog.jsx';
import { Button } from '../ui/Button.jsx';
import { Input } from '../ui/Field.jsx';
import { Spinner } from '../ui/Feedback.jsx';
import { redes, brand } from '../../api.js';
import { rasterizar } from '../../lib/rasterizar.js';
import { aviso } from '../../lib/avisos.js';
import { cn } from '../../lib/cn.js';
import { usePerfil } from '../../lib/perfil.js';

/*
 * Postar nas redes (docs/EXECUTOR.md, item 6).
 *
 * A mesma peça da TV vira o post do Instagram (4:5), o Story e o Status do
 * WhatsApp (9:16) e o post quadrado do Google — desenhada no navegador, pelo
 * mesmo desenhista da TV —, e cada canal recebe o texto escrito para ele.
 *
 * "Compartilhar" usa o compartilhar do celular com a imagem E o texto
 * juntos: abre o Instagram ou o WhatsApp com tudo pronto, sem API da Meta e
 * sem login de rede nenhuma. Onde o navegador não compartilha arquivo
 * (computador, quase sempre), ficam "Baixar" e "Copiar".
 */

const CANAIS = [
  { id: 'instagram', nome: 'Instagram', icone: Instagram },
  { id: 'whatsapp', nome: 'WhatsApp', icone: MessageCircle },
  { id: 'facebook', nome: 'Facebook', icone: Facebook },
  { id: 'google', nome: 'Google', icone: MapPin },
  { id: 'quando', nome: 'Quando postar', icone: CalendarClock },
];

// O texto da peça, lido dos campos que a peça declara.
function textosDaPeca(item, label) {
  const c = (item && item.campos) || {};
  const titulo = [c.titulo, c.titulo2].filter(Boolean).join(' ') || c.nome || c.manchete || label || '';
  return {
    titulo: titulo.trim(),
    apoio: c.apoio || c.texto || c.sub || '',
    chamada: c.cta || c.chamada || '',
    selo: c.kicker || c.selo || '',
    pedido: (item && item.origem && item.origem.pedido) || '',
  };
}

const nomeArquivo = (label, sufixo) => (String(label || 'peca').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').toLowerCase().slice(0, 40) || 'peca') + '-' + sufixo + '.png';

function baixar(blob, nome) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nome;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

/*
 * POSTAR NO COMPUTADOR (EXECUTOR D38): o dono — "já deixa no esquema, ou
 * pelo menos direciona para o link de postagem das redes". Onde o navegador
 * não compartilha arquivo, um clique abre a página de postar da rede (o
 * WhatsApp já com o texto escrito), baixa a imagem e copia o texto: é só
 * escolher a imagem e colar. Sem API da Meta e sem login de rede guardado
 * aqui.
 */
const POSTAR = {
  instagram: { nome: 'Instagram', url: () => 'https://www.instagram.com/', dica: 'No Instagram: toque em Criar, escolha a imagem baixada e cole o texto.' },
  whatsapp: { nome: 'WhatsApp', url: (t) => 'https://wa.me/?text=' + encodeURIComponent(t || ''), dica: 'No WhatsApp o texto já vai escrito: escolha o contato e anexe a imagem baixada.' },
  facebook: { nome: 'Facebook', url: () => 'https://business.facebook.com/latest/composer', dica: 'No Facebook: o criador de post da sua página abre; escolha a imagem baixada e cole o texto.' },
  google: { nome: 'Google', url: () => 'https://business.google.com/', dica: 'No Perfil da Empresa no Google: Adicionar atualização, escolha a imagem baixada e cole o texto.' },
};

async function copiar(texto) {
  try { await navigator.clipboard.writeText(texto); aviso.ok('Texto copiado.'); }
  catch (e) { aviso.erro('copiar', 'Não deu para copiar.', 'Segure o dedo no texto e copie à mão.'); }
}

/*
 * Compartilhar imagem + texto. O Instagram ignora o texto que vem junto (só
 * o WhatsApp o usa), então o texto vai TAMBÉM para a área de transferência:
 * no Instagram é só colar na legenda.
 */
async function compartilhar(blob, nome, texto) {
  const arquivo = new File([blob], nome, { type: blob.type || 'image/png' });
  if (texto) { try { await navigator.clipboard.writeText(texto); } catch (e) { /* segue */ } }
  if (navigator.canShare && navigator.canShare({ files: [arquivo] })) {
    try { await navigator.share({ files: [arquivo], text: texto }); return true; }
    catch (e) { if (e && e.name === 'AbortError') return true; }
  }
  return false;
}

/*
 * O iPhone (WebKit) pode recusar ler o canvas depois de desenhar o SVG com
 * HTML dentro — o toBlob dá SecurityError (alerta do consultor, 21/10). Aí a
 * imagem não sai neste aparelho: o texto continua, e a tela diz onde a
 * imagem sai, em vez de girar para sempre.
 */
const SEM_IMAGEM = 'A imagem não sai neste aparelho. Ela sai pelo computador ou por um Android — o texto, sim, dá para usar daqui.';

function Imagem({ blob, rotulo, proporcao, erro }) {
  const url = useMemo(() => (blob ? URL.createObjectURL(blob) : ''), [blob]);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  return (
    <figure className="space-y-1">
      <div className="overflow-hidden rounded-lg border border-line bg-surface-2" style={{ aspectRatio: proporcao }}>
        {url ? <img src={url} alt={rotulo} className="h-full w-full object-cover" />
          : erro ? <div className="flex h-full items-center justify-center p-3 text-center text-2xs leading-snug text-ink-3">{SEM_IMAGEM}</div>
            : <div className="flex h-full items-center justify-center"><Spinner size={18} /></div>}
      </div>
      <figcaption className="text-center text-2xs text-ink-3">{rotulo}</figcaption>
    </figure>
  );
}

function Texto({ children }) {
  return <div className="max-h-56 overflow-y-auto whitespace-pre-wrap break-words rounded-lg border border-line bg-surface-2 p-3 text-sm leading-relaxed text-ink [overflow-wrap:anywhere]">{children}</div>;
}

export function RedesSociais({ item, label, onFechar }) {
  const perfil = usePerfil();
  const [aba, setAba] = useState('instagram');
  const [textos, setTextos] = useState(null);
  const [erro, setErro] = useState('');
  const [imgs, setImgs] = useState({});
  const [local, setLocal] = useState(null);
  const [salvandoLocal, setSalvandoLocal] = useState(false);
  /*
   * Perguntar onde fica a loja é decidido UMA vez, quando os textos chegam.
   * Derivado do que está sendo digitado, o formulário sumia na primeira
   * letra do bairro.
   */
  const [perguntarLocal, setPerguntarLocal] = useState(false);
  const pecaHtml = item && item.type === 'peca-html';

  async function escrever() {
    setErro('');
    try {
      const r = await redes.textos(textosDaPeca(item, label));
      setTextos(r);
      setLocal((l) => l || r.local || { endereco: '', bairro: '', cidade: '', link: '' });
      if (!r.local || (!r.local.bairro && !r.local.cidade)) setPerguntarLocal(true);
    } catch (e) { setErro(e.message || 'Não deu para escrever os textos agora.'); }
  }

  useEffect(() => { escrever(); }, [item]); // eslint-disable-line react-hooks/exhaustive-deps

  // As imagens, uma de cada vez: três peças em tamanho real ao mesmo tempo pesam no celular.
  useEffect(() => {
    if (!pecaHtml) return undefined;
    let vivo = true;
    (async () => {
      for (const [k, f] of [['post', '4/5'], ['story', '9/16'], ['quadrado', '1/1']]) {
        try {
          const b = await rasterizar(item, f, 'image/png');
          if (vivo) setImgs((x) => ({ ...x, [k]: b }));
        } catch (e) {
          // Recusa de segurança vale para as três: nem tenta as outras.
          if (vivo) setImgs((x) => ({ ...x, postErro: true, storyErro: true, quadradoErro: true }));
          break;
        }
      }
    })();
    return () => { vivo = false; };
  }, [item, pecaHtml]);

  const semLocal = perguntarLocal && local;
  async function salvarLocal() {
    setSalvandoLocal(true);
    try {
      const atual = await brand.get();
      const k = (atual && atual.kit) || {};
      await brand.save({ nome: k.nome, cores: k.cores, fonteTitulo: k.fonteTitulo, fonteApoio: k.fonteApoio,
        direcao: k.direcao, tom: k.tom, observacoes: k.observacoes, local });
      setPerguntarLocal(false);
      await escrever();
      aviso.ok('Guardado na Marca. As hashtags já falam do seu bairro.');
    } catch (e) { aviso.erro('local', e.message || 'Não deu para guardar.'); }
    finally { setSalvandoLocal(false); }
  }

  const ig = textos && textos.instagram;
  const legendaIg = ig ? ig.legenda + '\n\n' + ig.hashtags.join(' ') : '';
  const nome = label || 'peça';

  function Acoes({ blob, sufixo, texto, erro, rede }) {
    const postar = POSTAR[rede];
    // A janela abre primeiro, ainda no clique (senão o navegador bloqueia); depois baixa e copia.
    const abrirRede = () => {
      window.open(postar.url(texto), '_blank', 'noopener');
      if (blob) baixar(blob, nomeArquivo(nome, sufixo));
      if (texto) navigator.clipboard.writeText(texto).catch(() => {});
      aviso.ok((blob ? 'Imagem baixada' : 'Pronto') + (texto ? ' e texto copiado. ' : '. ') + postar.dica);
    };
    // Sem a imagem neste aparelho: compartilha só o texto (ou copia), sem botão morto.
    if (!blob && erro) {
      return (
        <div className="flex flex-wrap gap-2">
          {texto && <Button variant="primary" icon={Share2} onClick={async () => {
            if (navigator.share) { try { await navigator.share({ text: texto }); return; } catch (e) { if (e && e.name === 'AbortError') return; } }
            copiar(texto);
          }}>Compartilhar o texto</Button>}
          {postar && texto && <Button variant="secondary" icon={ExternalLink} onClick={abrirRede}>Abrir o {postar.nome}</Button>}
          {texto && <Button variant="secondary" icon={Copy} onClick={() => copiar(texto)}>Copiar texto</Button>}
        </div>
      );
    }
    return (
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" icon={Share2} disabled={!blob} onClick={async () => {
          const ok = await compartilhar(blob, nomeArquivo(nome, sufixo), texto);
          if (!ok) { baixar(blob, nomeArquivo(nome, sufixo)); aviso.ok('Imagem baixada e texto copiado: é só postar.'); }
        }}>Compartilhar</Button>
        {postar && <Button variant="secondary" icon={ExternalLink} onClick={abrirRede}>Abrir o {postar.nome}</Button>}
        <Button variant="secondary" icon={Download} disabled={!blob} onClick={() => baixar(blob, nomeArquivo(nome, sufixo))}>Baixar</Button>
        {texto && <Button variant="secondary" icon={Copy} onClick={() => copiar(texto)}>Copiar texto</Button>}
      </div>
    );
  }

  return (
    <Dialog open onClose={onFechar} className="max-w-3xl" title={'Postar nas redes · ' + nome}
      description="A mesma peça da TV, no tamanho de cada rede, com o texto escrito para ela.">
      <div className="mb-3 flex gap-1 overflow-x-auto">
        {CANAIS.map((c) => {
          const Icone = c.icone;
          return (
            <button key={c.id} type="button" onClick={() => setAba(c.id)} aria-pressed={aba === c.id}
              className={cn('flex shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium',
                aba === c.id ? 'border-accent bg-accent/10 text-ink' : 'border-line text-ink-2 hover:text-ink')}>
              <Icone size={14} /> {c.nome}
            </button>
          );
        })}
      </div>

      {!pecaHtml && (
        <p className="mb-3 flex items-start gap-1.5 rounded-md border border-warn/40 bg-warn/10 p-2 text-xs text-ink-2">
          <AlertTriangle size={13} className="mt-px shrink-0 text-warn" /> Esta peça foi feita no editor antigo: os textos saem, a imagem para as redes não. Baixe a arte pelo editor.
        </p>
      )}

      {semLocal && (
        <div className="mb-3 rounded-lg border border-line p-3">
          <div className="mb-2 text-xs font-medium text-ink">Onde fica a {perfil.lugar}? <span className="font-normal text-ink-3">Vai para as hashtags e para a mensagem. Pergunto uma vez só.</span></div>
          <div className="grid gap-2 sm:grid-cols-2">
            <Input value={local.bairro} onChange={(e) => setLocal({ ...local, bairro: e.target.value })} placeholder="Bairro (ex.: Mooca)" />
            <Input value={local.cidade} onChange={(e) => setLocal({ ...local, cidade: e.target.value })} placeholder="Cidade (ex.: São Paulo)" />
            <Input value={local.endereco} onChange={(e) => setLocal({ ...local, endereco: e.target.value })} placeholder="Endereço (ex.: Rua das Flores, 120)" />
            <Input value={local.link} onChange={(e) => setLocal({ ...local, link: e.target.value })} placeholder="WhatsApp ou site (ex.: wa.me/55119…)" />
          </div>
          <Button size="sm" variant="secondary" className="mt-2" disabled={salvandoLocal || (!local.bairro && !local.cidade)} onClick={salvarLocal}>
            {salvandoLocal ? 'Guardando…' : 'Guardar e refazer os textos'}
          </Button>
        </div>
      )}

      {erro && <p className="mb-3 text-sm text-danger">{erro}</p>}
      {!textos && !erro ? (
        <div className="flex items-center gap-2 py-8 text-sm text-ink-3"><Spinner size={16} /> Escrevendo os textos de cada rede…</div>
      ) : textos && aba === 'instagram' ? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Imagem blob={imgs.post} erro={imgs.postErro} rotulo="Post 4:5 (1080×1350)" proporcao="4 / 5" />
            <Imagem blob={imgs.story} erro={imgs.storyErro} rotulo="Story 9:16 (1080×1920)" proporcao="9 / 16" />
          </div>
          <Texto>{legendaIg}</Texto>
          <Acoes blob={imgs.post} erro={imgs.postErro} sufixo="post" texto={legendaIg} rede="instagram" />
          {!imgs.storyErro && (
            <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3 text-xs text-ink-3">
              Story: <Button size="sm" variant="secondary" icon={Share2} disabled={!imgs.story}
                onClick={async () => { if (!(await compartilhar(imgs.story, nomeArquivo(nome, 'story'), ''))) baixar(imgs.story, nomeArquivo(nome, 'story')); }}>Compartilhar o Story</Button>
            </div>
          )}
        </div>
      ) : textos && aba === 'whatsapp' ? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Imagem blob={imgs.story} erro={imgs.storyErro} rotulo="Status 9:16 (1080×1920)" proporcao="9 / 16" />
            <div className="space-y-2">
              <div className="text-xs font-medium text-ink-2">Mensagem para a lista de transmissão</div>
              <Texto>{textos.whatsapp.mensagem}</Texto>
            </div>
          </div>
          <Acoes blob={imgs.story} erro={imgs.storyErro} sufixo="status" texto={textos.whatsapp.mensagem} rede="whatsapp" />
        </div>
      ) : textos && aba === 'facebook' ? (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-[minmax(0,14rem)_1fr]">
            <Imagem blob={imgs.post} erro={imgs.postErro} rotulo="Post 4:5" proporcao="4 / 5" />
            <Texto>{textos.facebook.texto}</Texto>
          </div>
          <Acoes blob={imgs.post} erro={imgs.postErro} sufixo="facebook" texto={textos.facebook.texto} rede="facebook" />
        </div>
      ) : textos && aba === 'google' ? (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-[minmax(0,14rem)_1fr]">
            <Imagem blob={imgs.quadrado} erro={imgs.quadradoErro} rotulo="Quadrado 1080×1080" proporcao="1 / 1" />
            <div className="space-y-2">
              <Texto>{textos.google.texto}</Texto>
              <p className="text-xs text-ink-3">Botão sugerido: <b className="text-ink">{textos.google.botao}</b>. No Perfil da Empresa: Adicionar atualização → Oferta ou Novidade.</p>
            </div>
          </div>
          <Acoes blob={imgs.quadrado} erro={imgs.quadradoErro} sufixo="google" texto={textos.google.texto} rede="google" />
        </div>
      ) : textos ? (
        <ul className="divide-y divide-line rounded-lg border border-line">
          {textos.quando.map((q) => (
            <li key={q.canal} className="flex flex-wrap items-baseline justify-between gap-2 px-3 py-2.5 text-sm">
              <span className="font-medium text-ink">{q.canal}</span>
              <span className="text-ink-2"><b className="text-ink">{q.dia} ({q.data}), {q.hora}</b> · <span className="text-xs text-ink-3">{q.motivo}</span></span>
            </li>
          ))}
        </ul>
      ) : null}
      {textos && <p className="mt-3 flex items-center gap-1 text-2xs text-ink-3"><Check size={11} /> {textos.motor === 'ia' ? 'Textos escritos pela IA para cada rede.' : 'Textos montados a partir da sua peça (IA fora do ar).'}</p>}
    </Dialog>
  );
}
