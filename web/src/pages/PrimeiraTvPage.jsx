import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, X } from 'lucide-react';
import { IconButton } from '../components/ui/Button.jsx';
import { Spinner } from '../components/ui/Feedback.jsx';
import { Erro } from '../components/primeira-tv/MolduraDoPasso.jsx';
import { PassoNegocio } from '../components/primeira-tv/PassoNegocio.jsx';
import { PassoMarca } from '../components/primeira-tv/PassoMarca.jsx';
import { PassoTv } from '../components/primeira-tv/PassoTv.jsx';
import { PassoTela } from '../components/primeira-tv/PassoTela.jsx';
import { PassoFotos } from '../components/primeira-tv/PassoFotos.jsx';
import { PassoHorario } from '../components/primeira-tv/PassoHorario.jsx';
import { PassoPronto } from '../components/primeira-tv/PassoPronto.jsx';
import { primeiraTv, brand, devices, aprovacoes } from '../api.js';
import { usePerfil } from '../lib/perfil.js';
import { carregarTelasProntas, marcaDaConta } from '../lib/telasProntas.js';
import {
  PASSOS, NOME_DO_PASSO, HORARIO_PADRAO, normalizar, passoParaRetomar, concluir, pular, voltar, terminar, deNovo,
  numeroDoPasso, negocioPeloId, frenteDe, formaDaTv, opcoesDeTela, opcaoPeloId, camposQueImportam, aplicarCampos, porNaTv,
} from '../lib/primeiraTv.js';

/*
 * "SUA PRIMEIRA TV EM 5 MINUTOS" (o dono, 06/11): quem abre o produto monta
 * a TV em uns cinco minutos. Sete passos, uma decisão por tela, um botão
 * violeta por tela, voltar e pular sempre, e o progresso guardado na conta
 * (server/routes/primeira-tv.js) — quem para no meio volta de onde parou,
 * no celular ou no computador.
 *
 * Abre sozinho na conta nova (App.jsx) e fica no Início como "Montar a TV
 * de novo". Mora fora da moldura do painel: sem menu, sem distração — só o
 * passo, o "Voltar" e o "Sair".
 */
export function PrimeiraTvPage({ me, parear, comecarDeNovo, onIr, onSair }) {
  const perfil = usePerfil();
  const papel = (me && me.role) || 'member';
  const souRevisor = papel === 'owner' || papel === 'admin';
  const [estado, setEstado] = useState(null);
  const [dadosDaMarca, setDadosDaMarca] = useState(null);
  const [tvs, setTvs] = useState([]);
  const [regra, setRegra] = useState(null);
  const [dados, setDados] = useState(null);
  const [erroTelas, setErroTelas] = useState('');
  const [erro, setErro] = useState('');
  const [naoGuardou, setNaoGuardou] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [ocupado, setOcupado] = useState(false);

  const recarregarMarca = () => brand.get().then(setDadosDaMarca).catch(() => {});
  const recarregarTvs = () => devices.list().then((r) => { const l = (r && r.devices) || []; setTvs(l); return l; }).catch(() => tvs);

  useEffect(() => {
    Promise.all([
      primeiraTv.ler(), brand.get().catch(() => null), devices.list().catch(() => null), aprovacoes.contagem().catch(() => null),
    ]).then(([r, b, d, a]) => {
      let e = normalizar(r && r.estado);
      if (comecarDeNovo) e = deNovo(e, Date.now());
      else e = { ...e, passo: passoParaRetomar(e) };
      // Veio do QR da TV no meio do passo a passo: o código cai no passo da TV.
      if (parear && !e.fim) e = { ...e, passo: 'tv' };
      if (!e.comecouEm) e = { ...e, comecouEm: Date.now() };
      setEstado(e);
      setDadosDaMarca(b);
      setTvs((d && d.devices) || []);
      setRegra(a);
      if (e.fim && !comecarDeNovo) setResultado({ pendente: e.fim.pendente });
      if (comecarDeNovo || !(r && r.comecou)) guardar(e);
    }).catch((er) => setErro(er.message || 'Não deu para abrir agora. Tente de novo.'));
    // As telas prontas carregam já: no passo 4 elas estão prontas.
    carregarTelasProntas().then(setDados).catch((er) => setErroTelas(er.message || 'Não deu para abrir as telas prontas.'));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { window.scrollTo({ top: 0 }); }, [estado && estado.passo, !!resultado]); // eslint-disable-line react-hooks/exhaustive-deps

  // Guarda na conta. Sem internet, a pessoa segue: o aviso pequeno diz que o progresso não foi guardado.
  function guardar(e) {
    setEstado(e);
    return primeiraTv.salvar(e).then(() => setNaoGuardou(false)).catch(() => setNaoGuardou(true));
  }

  const neg = estado ? negocioPeloId(estado.negocio) : null;
  const frente = frenteDe(neg, perfil.id);
  const marca = useMemo(() => {
    const m = marcaDaConta(dadosDaMarca);
    return { ...m, ramo: (neg && neg.ramo) || m.ramo };
  }, [dadosDaMarca, neg]);
  const tv = (estado && tvs.find((d) => d.id === estado.tv)) || null;
  const forma = formaDaTv(tv);
  const opcoes = useMemo(() => (dados && dadosDaMarca !== null && estado ? opcoesDeTela(dados, neg, frente, marca, forma) : null), [dados, dadosDaMarca, marca, neg, frente, forma, !!estado]); // eslint-disable-line react-hooks/exhaustive-deps
  const opcao = useMemo(() => {
    if (!estado || !dados) return null;
    return (estado.tela && opcaoPeloId(estado.tela, dados, neg, frente, marca, forma)) || (opcoes && opcoes[0]) || null;
  }, [estado && estado.tela, dados, opcoes, neg, frente, marca, forma]); // eslint-disable-line react-hooks/exhaustive-deps
  const campos = useMemo(() => (opcao ? camposQueImportam(opcao.montada, neg, dados.modelos) : { fotos: [], textos: [] }), [opcao, neg, dados]);
  const preenchida = useMemo(() => (opcao && estado ? { ...opcao, montada: aplicarCampos(opcao.montada, estado.campos) } : null), [opcao, estado && estado.campos]); // eslint-disable-line react-hooks/exhaustive-deps
  const precisaAprovar = !souRevisor && !!(regra && regra.ligada);

  if (erro) return <Tela><Erro>{erro}</Erro></Tela>;
  if (!estado) return <Tela><div className="flex justify-center py-24"><Spinner size={22} /></div></Tela>;

  const passo = estado.passo;
  const n = numeroDoPasso(passo);
  const feito = (p, extra) => guardar(concluir(estado, p, extra));
  const depois = (p) => () => guardar(pular(estado, p));

  async function sair() {
    await guardar({ ...estado, saiu: !estado.fim });
    onSair();
  }

  async function escolherNegocio(id) {
    setOcupado(true);
    // Trocou de negócio: a tela e os textos de antes eram do outro.
    const mudou = id !== estado.negocio;
    await guardar(concluir(estado, 'negocio', { negocio: id, ...(mudou ? { tela: '', campos: {} } : {}) }));
    setOcupado(false);
    recarregarMarca();
  }

  async function escolherTv(d, nova) {
    if (nova) await recarregarTvs();
    await feito('tv', { tv: d.id });
  }

  async function ligadaNoFim(d) {
    await recarregarTvs();
    await guardar({ ...estado, tv: d.id, feitos: estado.feitos.filter((p) => p !== 'tv').concat('tv'), pulados: estado.pulados.filter((p) => p !== 'tv') });
  }

  async function porNaTvAgora() {
    const r = await porNaTv({ tv, montada: preenchida.montada, horario: estado.horario || HORARIO_PADRAO, frente });
    setResultado(r);
    await guardar(terminar(estado, r.pendente, Date.now()));
  }

  let conteudo;
  if (passo === 'negocio') {
    conteudo = <PassoNegocio estado={estado} frente={perfil.id} ocupado={ocupado} onEscolher={escolherNegocio} onPular={depois('negocio')} />;
  } else if (passo === 'marca') {
    conteudo = dadosDaMarca === null ? <div className="flex justify-center py-24"><Spinner size={22} /></div>
      : <PassoMarca dadosDaMarca={dadosDaMarca} ramo={marca.ramo} frente={frente} onRecarregar={recarregarMarca}
        onConcluir={async () => { await recarregarMarca(); await feito('marca'); }} onPular={depois('marca')} />;
  } else if (passo === 'tv') {
    conteudo = <PassoTv estado={estado} tvs={tvs} podeLigar={souRevisor} codigoInicial={parear} onEscolher={escolherTv} onPular={depois('tv')} onIrParaPlano={() => onIr('billing')} />;
  } else if (passo === 'tela') {
    conteudo = <PassoTela estado={estado} opcoes={opcoes} erro={erroTelas} horario={estado.horario || HORARIO_PADRAO} frente={frente}
      onEscolher={(o) => feito('tela', { tela: o.id, ...(o.id !== estado.tela ? { campos: {} } : {}) })} onPular={depois('tela')} />;
  } else if (passo === 'fotos') {
    conteudo = !opcao ? <div className="flex justify-center py-24"><Spinner size={22} /></div>
      : <PassoFotos key={opcao.id} estado={estado} opcao={opcao} campos={campos} neg={neg} horario={estado.horario || HORARIO_PADRAO} frente={frente} onConcluir={(valores) => feito('fotos', { campos: valores, tela: estado.tela || opcao.id })} onPular={depois('fotos')} />;
  } else if (passo === 'horario') {
    conteudo = <PassoHorario estado={estado} onConcluir={(h) => feito('horario', { horario: h })} onPular={depois('horario')} />;
  } else {
    conteudo = <PassoPronto opcao={preenchida} horario={estado.horario || HORARIO_PADRAO} frente={frente} nomeDaConta={marca.nome} tv={tv}
      podeLigar={souRevisor} precisaAprovar={precisaAprovar} souRevisor={souRevisor} resultado={resultado}
      onLigada={ligadaNoFim} onPorNaTv={porNaTvAgora} onIr={onIr} onInicio={onSair} onIrParaPlano={() => onIr('billing')} />;
  }

  return (
    <Tela
      cabecalho={(
        <>
          <IconButton icon={ArrowLeft} label="Voltar" onClick={() => guardar(voltar(estado))}
            className={passo === 'negocio' || resultado ? 'invisible' : ''} />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-2 text-xs">
              <span className="truncate font-semibold text-ink">{NOME_DO_PASSO[passo]}</span>
              <span className="tnum shrink-0 text-ink-3">{n} de {PASSOS.length}</span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuemin={1} aria-valuemax={PASSOS.length} aria-valuenow={n} aria-label="Andamento">
              <div className="h-full rounded-full bg-accent transition-all" style={{ width: (n / PASSOS.length) * 100 + '%' }} />
            </div>
          </div>
          <IconButton icon={X} label="Sair (o que você fez fica guardado)" onClick={sair} />
        </>
      )}>
      {naoGuardou && <p className="mb-3 rounded-md bg-warn-soft px-3 py-2 text-xs text-ink">Sem conexão: o que você fez ainda não foi guardado. Tudo bem seguir.</p>}
      {conteudo}
    </Tela>
  );
}

// A moldura da página: o cabeçalho fino (voltar, andamento, sair) e a coluna do passo.
function Tela({ cabecalho, children }) {
  return (
    <div className="min-h-screen bg-canvas">
      <header className="sticky top-0 z-30 border-b border-line bg-surface/95 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-2xl items-center gap-2 px-2">
          {cabecalho || <span className="px-2 text-sm font-semibold text-ink">Sua primeira TV</span>}
        </div>
      </header>
      <main className="mx-auto w-full max-w-2xl px-4 pb-40 pt-5 sm:pb-12">{children}</main>
    </div>
  );
}

