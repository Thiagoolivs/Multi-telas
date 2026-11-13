import React, { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { LayoutTemplate, Share2, Search, Plus } from 'lucide-react';
import { Panel } from '../components/ui/Panel.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Spinner, EmptyState, ErrorState } from '../components/ui/Feedback.jsx';
import { DesignThumb } from '../components/content/DesignThumb.jsx';
import { PecaHtml } from '../components/content/PecaHtml.jsx';
import { Palco } from '../components/content/VerTelaAgora.jsx';
import { devices, brand } from '../api.js';
import { carregarModelos, itemDoModelo, ordenarPorPerfil, daFrente, separarPorRamo } from '../lib/modelosOuro.js';
import { carregarTelasProntas, estadoDaPrevia, emPe, marcaDaConta } from '../lib/telasProntas.js';
import { telasDaConta, montar, SemTelasProntas, PersonalizarTela } from './TelasProntasPage.jsx';
import { usePerfil } from '../lib/perfil.js';
import { PorNaTV } from '../components/tela/PorNaTV.jsx';
import { aviso } from '../lib/avisos.js';
import { cn } from '../lib/cn.js';

/*
 * O editor e as redes só quando se usa (reteste 2): eram 24 KB no 4G lento
 * antes de a grade aparecer. Com a grade na tela, eles vêm em segundo plano
 * (o "Usar" abre sem esperar).
 */
const carregarEditor = () => import('../components/content/EditarPeca.jsx');
const carregarRedes = () => import('../components/content/RedesSociais.jsx');
const EditarPeca = lazy(() => carregarEditor().then((m) => ({ default: m.EditarPeca })));
const RedesSociais = lazy(() => carregarRedes().then((m) => ({ default: m.RedesSociais })));

/*
 * BIBLIOTECA › PRONTOS PARA VOCÊ: o que o MultiTelas deixa pronto, já na
 * marca da conta — a tela inteira (cabeçalho, principal, lateral e rodapé) e
 * a peça solta (os modelos das peças-ouro). Toque em Usar, troque o texto e
 * ponha na TV.
 *
 * Fase 10 (reteste do bloco 8): eram 4 níveis até a peça (Biblioteca ›
 * Prontos › Peças soltas › TV deitada). Agora é uma grade só, com um filtro:
 * Tudo, Telas inteiras, TV deitada, TV em pé, Cabeçalho e rodapé. E cada
 * coisa mora num lugar só: as peças das campanhas ficam na campanha
 * (Biblioteca › Campanhas), as que a pessoa guardou em Peças guardadas.
 * Aqui só o pronto; um link leva aos outros dois.
 */
const FILTROS = [
  ['tudo', 'Tudo'], ['telas', 'Telas inteiras'], ['deitada', 'TV deitada'], ['empe', 'TV em pé'], ['faixas', 'Cabeçalho e rodapé'],
];
const ONDE = { cabecalho: 'cabeçalho', rodape: 'rodapé' };

function ondeCabe(p) {
  if (p.papel === 'cabecalho' || p.papel === 'rodape') return ONDE[p.papel];
  return String(p.formato || '').startsWith('9/') ? 'TV em pé' : p.formato === '1/1' ? 'quadrada' : 'TV deitada';
}

// Cada filtro vale para os dois tipos: a tela inteira em pé entra em "TV em pé", como a peça em pé.
function passaNoFiltro(p, filtro) {
  if (p.tela) return filtro === 'tudo' || filtro === 'telas' || (filtro === 'empe' && p.emPe) || (filtro === 'deitada' && !p.emPe);
  const faixa = p.papel === 'cabecalho' || p.papel === 'rodape';
  const emPe = String(p.formato || '').startsWith('9/');
  if (filtro === 'telas') return false;
  if (filtro === 'faixas') return faixa;
  if (filtro === 'empe') return !faixa && emPe;
  if (filtro === 'deitada') return !faixa && !emPe;
  return true;
}

export function PecasProntasPage({ onIr, filtroInicial, telaAlvo }) {
  const perfil = usePerfil();
  // Os modelos prontos (D16) e as telas inteiras (D18): o que o MultiTelas deixa pronto.
  const [modelos, setModelos] = useState(null);
  const [dados, setDados] = useState(null);
  const [marca, setMarca] = useState(null);
  const [erroPecas, setErroPecas] = useState('');
  const [tentativa, setTentativa] = useState(0);
  const [telas, setTelas] = useState([]);   // as TVs da conta
  const [filtro, setFiltroAgora] = useState(FILTROS.some(([id]) => id === filtroInicial) ? filtroInicial : 'tudo');
  const [q, setQ] = useState('');
  // Fase 9: primeiro o tipo de negócio da conta; o botão mostra os de outros negócios também.
  const [deOutros, setDeOutros] = useState(false);
  // Fase 8, o celular: de 12 em 12 (eram 15 mil pixels de rolagem, BLOCO-8 §2.2).
  const [qt, setQt] = useState(POR_VEZ);
  const [usando, setUsando] = useState(null);       // o modelo aberto no editor de texto
  const [telaEscolhida, setTelaEscolhida] = useState(null);   // a tela inteira, para trocar os textos
  // A peça a pôr no ar: o fim igual de todo caminho (fase 7, components/tela/PorNaTV.jsx — onde, quando, Desfazer).
  const [porNaTv, setPorNaTv] = useState(null);
  const [redesDe, setRedesDe] = useState(null);

  useEffect(() => {
    setErroPecas(''); setModelos(null); setDados(null);
    // Erro de rede não vira "nada pronto" (D3): a falha aparece, com tentar de novo.
    Promise.all([carregarModelos(), carregarTelasProntas()])
      .then(([m, d]) => { setModelos(m); setDados(d); setTimeout(() => { carregarEditor().catch(() => {}); carregarRedes().catch(() => {}); }, 1500); })
      .catch((e) => setErroPecas(e.message || 'Não deu para carregar as peças.'));
    devices.list().then((r) => setTelas((r && r.devices) || [])).catch(() => setTelas([]));
    // O ramo que a Marca deduziu (fase 10): a padaria vê primeiro o que é de padaria.
    brand.get().then((r) => setMarca(marcaDaConta(r))).catch(() => setMarca({}));
  }, [tentativa]);

  const setFiltro = (f) => { setFiltroAgora(f); setQt(POR_VEZ); };

  /*
   * Os modelos na marca da conta. Fase 10: pela frente E pelo ramo —
   * primeiro os do negócio da conta, depois os que servem a qualquer um. Os
   * de outro negócio (óculos de sol na padaria) só com "Ver também os de
   * outros negócios".
   */
  const grupos = useMemo(() => {
    if (!modelos || !marca) return { meus: [], outros: [] };
    const daMinhaFrente = ordenarPorPerfil(daFrente(modelos, perfil.id), perfil.id);
    const { meus, outros } = separarPorRamo(daMinhaFrente, marca.ramo, perfil.id);
    return { meus, outros: outros.concat(ordenarPorPerfil(modelos.filter((m) => !daMinhaFrente.includes(m)), perfil.id)) };
  }, [modelos, marca, perfil.id]);
  // As telas inteiras, com a mesma regra: as do negócio da conta primeiro (TelasProntasPage.jsx, telasDaConta).
  const telasProntas = useMemo(() => {
    if (!dados || !marca) return { meus: [], outros: [] };
    const meus = telasDaConta(dados, marca, perfil.id, telas, false);
    return { meus, outros: telasDaConta(dados, marca, perfil.id, telas, true).filter((t) => !meus.includes(t)) };
  }, [dados, marca, perfil.id, telas]);
  const quantosDeOutros = grupos.outros.length + telasProntas.outros.length;

  // Uma grade só: o do negócio da conta antes (telas, depois peças); os de outros negócios no fim.
  const visiveis = useMemo(() => {
    if (!modelos || !dados || !marca) return [];
    const daTela = (t) => ({ id: 'tela-' + t.id, tela: t, emPe: emPe(t.layout), label: t.nome, origem: t.descricao || '' });
    const doModelo = (m) => {
      const item = itemDoModelo(m, marca, perfil.id);
      return { id: 'modelo-' + m.id, item, papel: item.papel, formato: item.formato, label: m.nome, origem: m.familia || '', modelo: true };
    };
    const lista = telasProntas.meus.map(daTela).concat(grupos.meus.map(doModelo),
      deOutros ? telasProntas.outros.map(daTela).concat(grupos.outros.map(doModelo)) : []);
    const t = q.trim().toLowerCase();
    return lista.filter((p) => passaNoFiltro(p, filtro) && (!t || ((p.label || '') + ' ' + (p.origem || '')).toLowerCase().includes(t)));
  }, [modelos, dados, marca, perfil.id, grupos, telasProntas, deOutros, filtro, q]);

  // A tela inteira montada na marca só quando o cartão aparece (são até 53 telas).
  const montadas = useMemo(() => new Map(), [dados, marca]);
  const montada = (t) => {
    if (!montadas.has(t.id)) montadas.set(t.id, montar(t, dados, marca));
    return montadas.get(t.id);
  };

  if (telaEscolhida) {
    return <PersonalizarTela inicial={telaEscolhida} dados={dados} tvs={telas} telaAlvo={telaAlvo} onIr={onIr}
      onVoltar={() => setTelaEscolhida(null)} voltarPara="Prontos para você" />;
  }

  const carregando = modelos === null || dados === null || marca === null;

  return (
    <div className="max-w-6xl">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-ink">Prontos para você</h1>
          <p className="mt-1 text-sm text-ink-2">Telas inteiras e peças com a sua marca. Toque em Usar, troque o texto e ponha na TV.</p>
        </div>
        {/* No celular o Criar já está no meio da barra de baixo. */}
        <Button variant="secondary" icon={Plus} className="max-sm:hidden" onClick={() => onIr && onIr('criar')}>Criar novas</Button>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="rolagem-lateral flex max-w-full gap-1 overflow-x-auto rounded-lg border border-line bg-surface-2 p-1" role="group" aria-label="Mostrar">
          {FILTROS.map(([id, nome]) => (
            <button key={id} type="button" onClick={() => setFiltro(id)} aria-pressed={filtro === id}
              className={cn('whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition max-sm:min-h-11', filtro === id ? 'bg-surface text-ink shadow-xs' : 'text-ink-3 hover:text-ink-2')}>{nome}</button>
          ))}
        </div>
        <div className="relative w-full sm:ml-auto sm:w-64">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-3" />
          <input value={q} onChange={(e) => { setQ(e.target.value); setQt(POR_VEZ); }} placeholder="Buscar nas peças…" aria-label="Buscar nas peças"
            className="w-full rounded-md border border-line bg-surface py-1.5 pl-8 pr-2 text-sm text-ink placeholder:text-ink-3" />
        </div>
      </div>

      <div className="mb-4 flex flex-col items-start text-sm text-ink-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-4">
        {quantosDeOutros > 0 && (
          <button type="button" onClick={() => { setDeOutros(!deOutros); setQt(POR_VEZ); }} aria-pressed={deOutros}
            className="self-start text-left font-medium text-accent hover:underline">
            {deOutros ? 'Ver só os do meu tipo de negócio' : 'Ver também os de outros negócios'}
            {!deOutros && <span className="text-ink-3"> ({quantosDeOutros})</span>}
          </button>
        )}
        {/* Um lugar para cada coisa: o que é da conta mora nas abas dela, e daqui se vai até lá. */}
        <p className="text-xs text-ink-3">
          As suas peças ficam em{' '}
          <button type="button" className="font-medium text-accent hover:underline" onClick={() => onIr && onIr('campanhas')}>Campanhas</button>
          {' '}e em{' '}
          <button type="button" className="font-medium text-accent hover:underline" onClick={() => onIr && onIr('designs')}>Peças guardadas</button>.
        </p>
      </div>

      {erroPecas ? (
        <ErrorState description={erroPecas} onRetry={() => setTentativa((n) => n + 1)} />
      ) : carregando ? (
        /*
         * Carregando é carregando (QA de lançamento, 03/11): na rede lenta, a
         * página dizia que não havia nada pronto, por cima de 43 modelos que
         * chegavam logo depois.
         */
        <div role="status" className="flex flex-col items-center gap-2 py-16 text-sm text-ink-3"><Spinner size={20} />Carregando as peças…</div>
      ) : visiveis.length === 0 ? (
        filtro === 'telas' && !q.trim() ? (
          <SemTelasProntas temOutras={!deOutros && telasProntas.outros.length > 0} onVerOutras={() => setDeOutros(true)} onVerPecas={() => setFiltro('tudo')} />
        ) : (
          <Panel>
            <EmptyState icon={LayoutTemplate} title="Nada neste filtro" description="Troque o filtro ou a busca." />
          </Panel>
        )
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visiveis.slice(0, qt).map((p) => {
            if (p.tela) {
              const m = montada(p.tela);
              return (
                <div key={p.id} className="flex flex-col overflow-hidden rounded-lg border border-line bg-surface">
                  <div className="flex h-44 items-center justify-center bg-surface-2 p-2">
                    <Palco estado={estadoDaPrevia(m)} alturaMaxima={160} />
                  </div>
                  <div className="flex flex-1 flex-col gap-2 p-3">
                    <div className="min-w-0">
                      <h2 className="truncate text-sm font-medium text-ink">{p.label}</h2>
                      <div className="truncate text-2xs text-ink-3">Tela inteira · {p.emPe ? 'TV em pé' : 'TV deitada'}</div>
                      {/* A descrição de cliente (lib/telasProntas.js, paraOCliente), nunca a nota interna do manifesto. */}
                      {p.origem && <p className="mt-0.5 line-clamp-2 text-xs text-ink-3">{p.origem}</p>}
                    </div>
                    <div className="mt-auto flex flex-wrap gap-1.5">
                      <Button size="sm" variant="secondary" className="border-accent/50 font-semibold"
                        onClick={() => { setTelaEscolhida(m); window.scrollTo({ top: 0 }); }}>Usar</Button>
                    </div>
                  </div>
                </div>
              );
            }
            const faixa = p.papel === 'cabecalho' || p.papel === 'rodape';
            return (
              <div key={p.id} className="flex flex-col overflow-hidden rounded-lg border border-line bg-surface">
                <div className="flex h-44 items-center justify-center bg-surface-2 p-2">
                  {faixa ? <div className="w-full"><PecaHtml item={p.item} formato={p.papel} /></div> : <DesignThumb item={p.item} fitHeight />}
                </div>
                <div className="flex flex-1 flex-col gap-2 p-3">
                  <div className="min-w-0">
                    <h2 className="truncate text-sm font-medium text-ink">{p.label}</h2>
                    <div className="truncate text-2xs text-ink-3">{ondeCabe(p)}{p.origem ? ' · ' + p.origem : ''}</div>
                  </div>
                  <div className="mt-auto flex flex-wrap gap-1.5">
                    {/* Fase 8: um violeta por tela; nos cartões, o botão é o de contorno. */}
                    <Button size="sm" variant="secondary" className="border-accent/50 font-semibold" onClick={() => setUsando(p)}>Usar</Button>
                    {!faixa && <Button size="sm" icon={Share2} onClick={() => setRedesDe(p)}>Redes</Button>}
                  </div>
                </div>
              </div>
            );
          })}
          <MostrarMais total={visiveis.length} mostrando={qt} onMais={() => setQt((n) => n + POR_VEZ)} />
        </div>
      )}

      <Suspense fallback={null}>
      {/* Usar um modelo: troca o texto e, ao salvar, escolhe as TVs. */}
      {usando && (
        <EditarPeca item={usando.item} label={usando.label} onFechar={() => setUsando(null)}
          onSalvar={async (item) => {
            const pronta = { ...usando, item: { ...usando.item, ...item, papel: usando.papel, formato: usando.formato } };
            setUsando(null);
            if (telas.length) setPorNaTv(pronta);
            else aviso.ok('Pronto. Ligue uma TV em Telas para pôr esta peça no ar.');
          }} />
      )}

      {porNaTv && (
        <PorNaTV peca={porNaTv} telas={telas} onFechar={() => setPorNaTv(null)}
          descricao={'Entra ' + (porNaTv.papel === 'cabecalho' || porNaTv.papel === 'rodape' ? 'no ' + ONDE[porNaTv.papel] : 'na parte da TV que combina com ela (' + ondeCabe(porNaTv) + ')') + ', no fim do que já está lá.'} />
      )}
      {redesDe && <RedesSociais item={redesDe.item} label={redesDe.label} onFechar={() => setRedesDe(null)} />}
      </Suspense>
    </div>
  );
}

const POR_VEZ = 12;
// "Mostrar mais" no fim da grade: a lista longa vem aos poucos (fase 8, celular).
function MostrarMais({ total, mostrando, onMais }) {
  if (total <= mostrando) return null;
  return (
    <div className="col-span-full flex justify-center pt-1">
      <Button variant="secondary" onClick={onMais}>Mostrar mais ({total - mostrando})</Button>
    </div>
  );
}
