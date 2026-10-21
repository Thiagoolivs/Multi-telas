import React, { useEffect, useState } from 'react';
import {
  Tag, Sparkles, Megaphone, Camera, Cake, QrCode, ArrowLeft, Check, Rocket, SlidersHorizontal, MonitorPlay, RefreshCw, ImagePlus, Share2,
} from 'lucide-react';
import { Panel } from '../components/ui/Panel.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Textarea } from '../components/ui/Field.jsx';
import { Spinner } from '../components/ui/Feedback.jsx';
import { PecaHtml } from '../components/content/PecaHtml.jsx';
import { DesignThumb } from '../components/content/DesignThumb.jsx';
import { RedesSociais } from '../components/content/RedesSociais.jsx';
import { TAMANHO_REAL } from '../lib/pecaHtml.js';
import { ai, devices, library, media, brand } from '../api.js';
import { ProximoPasso } from '../components/layout/ProximoPasso.jsx';
import { publicarPecas } from '../lib/publicar.js';
import { aviso } from '../lib/avisos.js';
import { cn } from '../lib/cn.js';

/*
 * CRIAÇÃO RÁPIDA. Era o Criar até 21/10. Desde o item 24 (EXECUTOR §2b), o
 * Criar é a conversa (CriarPage.jsx), e estes quatro passos continuam para
 * quem já sabe o que quer, em Meus Designs › Mais (esconder antes de apagar).
 *
 * Criar em quatro passos (docs/EXECUTOR.md, item 3; PLANO §5.1).
 *
 * Criar era confuso e espalhado: Meus Designs com quatro cartões, a página da
 * tela com outros botões, e um formulário longo que perguntava empresa, tom e
 * público — coisas que a Marca já sabe. Aqui é uma entrada só:
 *
 *   1. o que quer mostrar      seis opções grandes
 *   2. uma frase               com exemplos para tocar
 *   3. o rascunho              a peça com o texto real, sem gastar nada
 *   4. publicar                na tela, já marcada
 *
 * Formato e quantidade têm padrão (TV deitada, uma peça) e ficam em
 * "ajustar". O passo 1 também mora no Início: quem abre o app e toca numa
 * opção cai direto no passo 2 — é o que põe "criar com IA e publicar" em
 * três toques (opção → ver rascunho → publicar).
 */

export const OPCOES = [
  { id: 'promocao', titulo: 'Promoção com preço', icone: Tag, pedido: 'Promoção com preço',
    dica: 'O produto, o preço e até quando.',
    exemplos: ['Café + pão na chapa por R$ 9', 'Óculos de sol com 30% até sábado', 'Corte + barba por R$ 50 às quartas'] },
  { id: 'novidade', titulo: 'Novidade', icone: Sparkles, pedido: 'Novidade na loja',
    dica: 'O que chegou ou começou.',
    exemplos: ['Chegou a coleção de verão', 'Agora temos açaí no copo', 'Novo horário de atendimento aos sábados'] },
  { id: 'aviso', titulo: 'Aviso ou horário', icone: Megaphone, pedido: 'Aviso para os clientes',
    dica: 'O aviso, curto, como você falaria no balcão.',
    exemplos: ['Fechado no feriado de quinta', 'Aberto de segunda a sábado, das 8h às 19h', 'Aceitamos Pix e cartão'] },
  { id: 'foto', titulo: 'Foto do produto', icone: Camera, pedido: 'Destaque do produto da foto', foto: true,
    dica: 'Tire ou escolha a foto e diga o que é.',
    exemplos: ['Bolo de cenoura com cobertura', 'Armação nova, linha importada', 'Kit de presente para o Dia dos Pais'] },
  { id: 'aniversario', titulo: 'Aniversariantes', icone: Cake, pedido: 'Parabéns aos aniversariantes',
    dica: 'Quem faz aniversário, e quando.',
    exemplos: ['Parabéns, Ana! Dia 12', 'Aniversariantes de outubro: João, Marta e Pedro', 'Feliz aniversário, equipe da manhã'] },
  { id: 'instagram', titulo: 'Instagram ou QR', icone: QrCode, pedido: 'Convite para seguir no Instagram',
    dica: 'O @ ou o link que o QR deve abrir.',
    exemplos: ['Siga @padariadobairro', 'Peça pelo WhatsApp: wa.me/5511999999999', 'Avalie a gente no Google'] },
];

const ONDE = [
  { id: '16/9', nome: 'TV deitada' },
  { id: '9/16', nome: 'TV em pé' },
];

/*
 * A foto é escolha do cliente (EXECUTOR item 19). Antes era `acervo` fixo, e
 * conta sem foto própria nunca via foto na peça. O padrão é a IA gerar, com
 * a ordem de sempre: a foto da empresa vence quando serve. O custo aparece no
 * passo 3, antes de gastar.
 */
const FOTOS = [
  { id: 'gerar', nome: 'A IA gera' },
  { id: 'acervo', nome: 'Só as minhas' },
  { id: 'nenhuma', nome: 'Sem foto' },
];

// O passo 1: as seis opções grandes. Mora aqui e no Início.
export function OpcoesDeCriar({ onEscolher, compacto }) {
  return (
    <div className={cn('grid grid-cols-2 gap-2.5', compacto ? 'sm:grid-cols-3 lg:grid-cols-6' : 'sm:grid-cols-3')}>
      {OPCOES.map((o) => {
        const Icone = o.icone;
        return (
          <button key={o.id} type="button" onClick={() => onEscolher(o.id)}
            className="flex min-h-[5.5rem] flex-col items-start justify-between gap-2 rounded-xl border border-line bg-surface p-3 text-left transition hover:border-accent/60 hover:bg-surface-2 active:scale-[0.98]">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-soft"><Icone size={18} className="text-accent" /></span>
            <span className="text-sm font-semibold leading-tight text-ink">{o.titulo}</span>
          </button>
        );
      })}
    </div>
  );
}

function Passos({ atual }) {
  const nomes = ['O quê', 'A frase', 'Rascunho', 'Publicar'];
  return (
    <ol className="mb-4 flex items-center gap-1.5 text-2xs font-medium">
      {nomes.map((n, i) => {
        const k = i + 1;
        const feito = k < atual, agora = k === atual || (atual === 3 && k === 4);
        return (
          <li key={n} className="flex items-center gap-1.5">
            <span className={cn('flex h-5 w-5 items-center justify-center rounded-full',
              feito ? 'bg-accent text-accent-fg' : agora ? 'bg-accent-soft text-accent ring-1 ring-accent' : 'bg-surface-2 text-ink-3')}>
              {feito ? <Check size={11} /> : k}
            </span>
            <span className={cn('hidden sm:inline', agora ? 'text-ink' : 'text-ink-3')}>{n}</span>
            {k < 4 && <span className="h-px w-3 bg-line sm:w-6" />}
          </li>
        );
      })}
    </ol>
  );
}

export function CriacaoRapidaPage({ opcaoInicial, telaInicial, onIr }) {
  const [opcao, setOpcao] = useState(opcaoInicial || null);
  const [frase, setFrase] = useState('');
  const [foto, setFoto] = useState(null);           // { url } já no acervo
  const [subindo, setSubindo] = useState(false);
  const [onde, setOnde] = useState(['16/9']);
  const [quantas, setQuantas] = useState(1);
  const [fotos, setFotos] = useState('gerar');
  const [ajustar, setAjustar] = useState(false);
  const [plano, setPlano] = useState(null);         // resposta do plano (com rascunhos)
  const [etapa, setEtapa] = useState(null);         // progresso do trabalho
  const [telas, setTelas] = useState(null);
  const [alvos, setAlvos] = useState([]);
  const [pronto, setPronto] = useState(null);       // { pecas, nTelas, titulo }
  const [erro, setErro] = useState('');
  const [redesAberto, setRedesAberto] = useState(false);

  const op = OPCOES.find((o) => o.id === opcao) || null;
  const passo = pronto ? 5 : plano ? 3 : op ? 2 : 1;

  /*
   * Telas da conta. A publicação já vem MARCADA: com uma tela, ela; vindo
   * de uma tela ("Criar novo" no Adicionar conteúdo), aquela; senão todas —
   * a maioria das lojas tem uma ou duas e quer a novidade em todas.
   */
  useEffect(() => {
    devices.list().then((r) => {
      const lista = (r && r.devices) || [];
      setTelas(lista);
      const inicial = telaInicial && lista.some((t) => t.id === telaInicial) ? [telaInicial] : lista.map((t) => t.id);
      setAlvos(inicial);
    }).catch(() => setTelas([]));
  }, [telaInicial]);

  function recomecar() {
    setOpcao(null); setFrase(''); setFoto(null); setPlano(null); setPronto(null); setErro(''); setEtapa(null);
  }

  async function escolherFoto(e) {
    const f = (e.target.files || [])[0]; e.target.value = '';
    if (!f) return;
    setSubindo(true); setErro('');
    try {
      const up = await media.upload(f);
      /*
       * A foto entra no acervo da marca (imagens base): é por lá que o diretor
       * usa foto da empresa, e assim ela fica para as próximas criações. O
       * rótulo é a frase — é por ele que a IA sabe o que a foto mostra.
       */
      await brand.addAsset('base', up.url, (frase || op.titulo).slice(0, 160));
      setFoto({ url: up.url });
    } catch (e2) { setErro(e2.message || 'Não consegui enviar a foto.'); }
    finally { setSubindo(false); }
  }

  const pedido = () => ({
    /*
     * A frase da pessoa na primeira linha, o tipo na segunda. "Promoção com
     * preço: pão na chapa…" numa linha só virava o TÍTULO da peça quando a IA
     * está fora do ar (o plano de reserva usa a primeira linha do pedido).
     */
    brief: frase.trim() + '\n(' + op.pedido + ')',
    formatos: onde,
    // A Marca já sabe empresa, tom e público: o servidor lê de lá.
    pedido: { formatos: onde, quantidade: quantas, imagens: fotos },
    fotoProduto: foto ? foto.url : undefined,
  });

  // Passo 3: o plano com o rascunho de cada peça. Uma chamada de texto, nenhum crédito.
  async function verRascunho() {
    if (!frase.trim()) return;
    setErro(''); setEtapa({ etapa: 'entendendo o pedido', segundos: 0 });
    try {
      const id = await ai.directorStart({ ...pedido(), apenasPlano: true });
      const r = await ai.directorAcompanhar(id, setEtapa);
      setPlano(r);
    } catch (e) { setErro(e.message || 'Não deu para montar o rascunho. Tente de novo.'); }
    finally { setEtapa(null); }
  }

  // Passo 4: gera a versão final, guarda em Meus Designs e publica nas telas marcadas.
  async function publicar() {
    setErro(''); setEtapa({ etapa: 'desenhando a peça', segundos: 0 });
    try {
      const id = await ai.directorStart({ ...pedido(), planoAprovado: plano.plano });
      const out = await ai.directorAcompanhar(id, setEtapa);
      const pecas = ((out && out.pecas) || []).map((p) => ({ formato: p.formato, canal: p.canal, label: p.label, item: p.item, faixa: p.faixa }));
      if (!pecas.length) throw new Error('A peça não saiu. Tente de novo em instantes.');
      /*
       * O nome é a frase, não o "Campanha" que o diretor devolve sem IA. Além
       * de ser a pasta em Meus Designs, ele é a ORIGEM na tela: publicar troca
       * o que veio da mesma origem — com um nome fixo, cada criação nova
       * tiraria a anterior do ar.
       */
      const titulo = frase.trim().split('\n')[0].slice(0, 60) || op.titulo;
      await library.save(titulo, pecas);
      if (alvos.length) await publicarPecas({ alvos, pecas, titulo, telas });
      setPronto({ pecas, nTelas: alvos.length, titulo });
      aviso.ok(alvos.length ? 'Publicado em ' + alvos.length + ' tela(s).' : 'Guardado em Meus Designs.');
    } catch (e) { setErro(e.message || 'Não deu para publicar. Tente de novo.'); }
    finally { setEtapa(null); }
  }

  const rascunhos = (plano && plano.rascunhos) || [];
  const pecasDoPlano = (plano && plano.plano && plano.plano.pecas) || [];
  const custo = (plano && plano.orcamento && plano.orcamento.creditos) || 0;

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-3 flex items-center gap-2">
        {passo > 1 && passo < 5 && (
          <button type="button" onClick={() => (plano ? setPlano(null) : recomecar())} aria-label="Voltar"
            className="rounded-md p-1.5 text-ink-2 hover:bg-surface-2 hover:text-ink"><ArrowLeft size={18} /></button>
        )}
        <h1 className="text-xl font-semibold tracking-tight text-ink">
          {passo === 1 ? 'O que você quer mostrar?' : passo === 2 ? op.titulo : passo === 3 ? 'Confira e publique' : 'Pronto!'}
        </h1>
      </div>
      {passo < 5 && <Passos atual={passo} />}

      {erro && <div className="mb-3 rounded-md border border-danger-soft bg-danger-soft px-3 py-2 text-sm text-danger" role="alert">{erro}</div>}

      {etapa ? (
        <Panel>
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <Spinner size={26} />
            <div className="text-sm font-semibold text-ink">{etapa.etapa || 'trabalhando'}</div>
            {etapa.detalhe && <div className="text-xs text-ink-3">{etapa.detalhe}</div>}
            <div className="tnum text-2xs text-ink-3">{etapa.segundos || 0}s</div>
          </div>
        </Panel>
      ) : passo === 1 ? (
        <>
          <OpcoesDeCriar onEscolher={setOpcao} />
          {/*
            O resto continua existindo, só fora do caminho: quem quer desenhar
            do zero, gerar uma imagem solta ou trazer um arquivo do Canva acha
            em "Mais", em Meus Designs.
          */}
          <p className="mt-4 text-xs text-ink-3">
            Quer desenhar do zero, gerar uma imagem ou trazer um arquivo? Está em{' '}
            <button type="button" className="font-medium text-accent hover:underline" onClick={() => onIr && onIr('designs')}>Meus Designs › Mais</button>.
          </p>
        </>
      ) : passo === 2 ? (
        <Panel>
          <div className="space-y-3 p-4">
            {op.foto && (
              <div className="flex items-center gap-3">
                {foto
                  ? <img src={foto.url} alt="" className="h-20 w-20 rounded-lg border border-line object-cover" />
                  : <span className="flex h-20 w-20 items-center justify-center rounded-lg border border-dashed border-line text-ink-3"><ImagePlus size={22} /></span>}
                <label className={cn('cursor-pointer rounded-md border border-line bg-surface px-3 py-2 text-sm font-medium text-ink-2 hover:bg-surface-2', subindo && 'pointer-events-none opacity-60')}>
                  {subindo ? 'Enviando…' : foto ? 'Trocar a foto' : 'Tirar ou escolher a foto'}
                  <input type="file" accept="image/png,image/jpeg,image/webp" capture="environment" className="hidden" onChange={escolherFoto} />
                </label>
              </div>
            )}
            <div>
              <label htmlFor="frase" className="mb-1 block text-xs font-medium text-ink-2">{op.dica}</label>
              <Textarea id="frase" autoFocus rows={2} value={frase} onChange={(e) => setFrase(e.target.value)} placeholder={op.exemplos[0]}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); verRascunho(); } }} />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {op.exemplos.map((x) => (
                <button key={x} type="button" onClick={() => setFrase(x)}
                  className="rounded-full border border-line px-2.5 py-1 text-xs text-ink-2 hover:border-accent/60 hover:text-ink">{x}</button>
              ))}
            </div>

            {/* O padrão serve quase sempre; quem quer mexer, mexe. */}
            <div className="rounded-lg border border-line">
              <button type="button" onClick={() => setAjustar((v) => !v)} aria-expanded={ajustar}
                className="flex w-full items-center justify-between px-3 py-2 text-xs text-ink-2 hover:text-ink">
                <span className="flex items-center gap-1.5"><SlidersHorizontal size={13} /> Ajustar</span>
                <span className="text-ink-3">{onde.map((f) => (ONDE.find((o) => o.id === f) || {}).nome).join(' e ')} · {quantas} {quantas === 1 ? 'peça' : 'peças'} · {fotos === 'nenhuma' ? 'sem foto' : 'com foto'}</span>
              </button>
              {ajustar && (
                <div className="space-y-2 border-t border-line p-3 text-xs">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="w-14 text-ink-3">Onde</span>
                    {ONDE.map((o) => {
                      const ativo = onde.includes(o.id);
                      return (
                        <button key={o.id} type="button" aria-pressed={ativo}
                          onClick={() => setOnde((x) => (ativo ? (x.length > 1 ? x.filter((y) => y !== o.id) : x) : [...x, o.id]))}
                          className={cn('rounded-md border px-2.5 py-1', ativo ? 'border-accent bg-accent/10 font-semibold text-ink' : 'border-line text-ink-2')}>{o.nome}</button>
                      );
                    })}
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="w-14 text-ink-3">Quantas</span>
                    {[1, 2, 3].map((n) => (
                      <button key={n} type="button" aria-pressed={quantas === n} onClick={() => setQuantas(n)}
                        className={cn('rounded-md border px-2.5 py-1', quantas === n ? 'border-accent bg-accent/10 font-semibold text-ink' : 'border-line text-ink-2')}>{n}</button>
                    ))}
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="w-14 text-ink-3">Foto</span>
                    {FOTOS.map((o) => (
                      <button key={o.id} type="button" aria-pressed={fotos === o.id} onClick={() => setFotos(o.id)}
                        className={cn('rounded-md border px-2.5 py-1', fotos === o.id ? 'border-accent bg-accent/10 font-semibold text-ink' : 'border-line text-ink-2')}>{o.nome}</button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end">
              <Button variant="primary" size="lg" disabled={!frase.trim() || (op.foto && !foto) || subindo} onClick={verRascunho}>
                Ver o rascunho
              </Button>
            </div>
          </div>
        </Panel>
      ) : passo === 3 ? (
        <div className="space-y-3">
          {/* 3 · o rascunho */}
          <Panel>
            <div className="space-y-3 p-4">
              {pecasDoPlano.map((p, i) => {
                const r = rascunhos[i];
                // Foto que ainda vai ser gerada não existe: aí o rascunho mostra a silhueta.
                const silhueta = !!(p.precisaImagem && p.promptImagem);
                return (
                  <div key={i} className="space-y-1.5">
                    {r ? (
                      <div className={p.formato === '9/16' ? 'mx-auto w-40' : ''}>
                        <PecaHtml item={r} formato={r.formato in TAMANHO_REAL ? r.formato : '16/9'} rascunho={silhueta} />
                      </div>
                    ) : (
                      <div className="rounded-lg border border-line bg-surface-2 p-4">
                        <div className="text-lg font-semibold text-ink">{p.headline}</div>
                        {p.sub && <div className="text-sm text-ink-2">{p.sub}</div>}
                      </div>
                    )}
                  </div>
                );
              })}
              <p className="text-xs text-ink-3">
                Rascunho com o seu texto e a sua marca. A arte final é desenhada ao publicar.{' '}
                <button type="button" className="font-medium text-accent hover:underline" onClick={() => setPlano(null)}>Mudar a frase</button>
              </p>
            </div>
          </Panel>

          {/* 4 · publicar, na tela já marcada */}
          <Panel>
            <div className="space-y-3 p-4">
              {telas === null ? <Spinner size={16} /> : telas.length ? (
                <div>
                  <div className="mb-1.5 text-xs font-medium text-ink-2">Publicar em</div>
                  <div className="flex flex-wrap gap-1.5">
                    {telas.map((t) => {
                      const ativo = alvos.includes(t.id);
                      return (
                        <button key={t.id} type="button" aria-pressed={ativo}
                          onClick={() => setAlvos((a) => (ativo ? a.filter((x) => x !== t.id) : [...a, t.id]))}
                          className={cn('flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs',
                            ativo ? 'border-accent bg-accent/10 font-semibold text-ink' : 'border-line text-ink-2')}>
                          {ativo ? <Check size={12} className="text-accent" /> : <MonitorPlay size={12} />} {t.name || 'Tela'}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-ink-2">
                  Você ainda não tem TV conectada. A peça fica guardada em Meus Designs e você publica depois.{' '}
                  <button type="button" className="font-medium text-accent hover:underline" onClick={() => onIr && onIr('screens')}>Conectar uma TV</button>
                </p>
              )}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs text-ink-3">{custo ? custo + (custo === 1 ? ' criação com foto' : ' criações com foto') : 'Sem foto gerada · não usa criação'}</span>
                <Button variant="primary" size="lg" icon={Rocket} onClick={publicar}>
                  {alvos.length ? 'Publicar' : 'Guardar'}
                </Button>
              </div>
            </div>
          </Panel>
        </div>
      ) : (
        <Panel>
          <div className="space-y-4 p-4">
            {/* Sem TV ainda: o próximo passo é ligar uma (PLANO §5.3) — e a peça vai junto no pareamento. */}
            {!pronto.nTelas && (
              <ProximoPasso feito="A peça está pronta." proximo="ligar a TV — ela já recebe esta peça." acao="Ligar a TV"
                onIr={() => onIr && onIr('screens', { abrirParear: true })} />
            )}
            <div className="flex items-center gap-2 text-sm text-ink">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-ok/15 text-ok"><Check size={16} /></span>
              {pronto.nTelas ? 'No ar em ' + pronto.nTelas + (pronto.nTelas === 1 ? ' tela.' : ' telas.') : 'Guardado em Meus Designs.'}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {pronto.pecas.map((p, i) => (
                <div key={i} className="overflow-hidden rounded-lg border border-line"><DesignThumb item={p.item} /></div>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              {/* A mesma peça, nas redes: post, Story, Status e o texto de cada uma. */}
              <Button variant="primary" icon={Share2} onClick={() => setRedesAberto(true)}>Postar nas redes</Button>
              <Button variant="secondary" icon={RefreshCw} onClick={recomecar}>Criar outra</Button>
              <Button variant="secondary" onClick={() => onIr && onIr('designs')}>Ver em Meus Designs</Button>
            </div>
          </div>
        </Panel>
      )}
      {redesAberto && pronto && <RedesSociais item={pronto.pecas[0].item} label={pronto.titulo} onFechar={() => setRedesAberto(false)} />}
    </div>
  );
}
