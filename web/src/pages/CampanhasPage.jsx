import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, MonitorPlay, Megaphone, Plus, Search, Archive, ArchiveRestore, Pencil, Trash2, Layers, X } from 'lucide-react';
import { Panel } from '../components/ui/Panel.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Spinner, EmptyState } from '../components/ui/Feedback.jsx';
import { DesignThumb } from '../components/content/DesignThumb.jsx';
import { ResultadoCampanha } from '../components/criar/ResultadoCampanha.jsx';
import { PorPraRodar } from '../components/criar/PorPraRodar.jsx';
import { criar, devices } from '../api.js';
import { confirmar, perguntar } from '../lib/confirmar.js';
import { aviso } from '../lib/avisos.js';
import { cn } from '../lib/cn.js';

/*
 * CAMPANHAS (EXECUTOR §2c, item 29): a campanha do Criar como UNIDADE.
 *
 * Antes ela virava uma pasta em Meus Designs, e cada geração com o mesmo nome
 * empilhava as peças na mesma pasta: "Promoção da semana · 15 peças" eram três
 * gerações misturadas, e publicar por lá decidia a zona pelo formato, não pelo
 * que o cliente pediu. Aqui cada campanha aparece uma vez, com o estado (no
 * ar, pausada, pronta) e as TVs; abrir leva ao mesmo resultado do Criar, com
 * Pôr pra rodar, Pausar e Ajustar.
 *
 * EM PASTAS (D10): cada campanha é um cartão-pasta — capa, estado, TVs e
 * quantas peças tem dentro — que se renomeia, arquiva e exclui ali mesmo. A
 * lista não corta mais em 20 calada: busca pelo nome, páginas com "Ver mais"
 * e as arquivadas à parte.
 */

const ESTADO = {
  no_ar: { rotulo: 'No ar', classe: 'bg-ok/15 text-ok' },
  pausada: { rotulo: 'Pausada', classe: 'bg-warn/15 text-warn' },
  pronta: { rotulo: 'Pronta', classe: 'bg-surface-2 text-ink-2' },
};
const quando = (ms) => {
  if (!ms) return '';
  const d = new Date(ms);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }) + ', ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
};

function Acao({ titulo, icone: Icone, onClick, perigo }) {
  return (
    <button type="button" title={titulo} aria-label={titulo} onClick={onClick}
      className={cn('rounded-md p-1.5 text-ink-3 transition hover:bg-surface-2', perigo ? 'hover:text-danger' : 'hover:text-ink')}>
      <Icone size={14} />
    </button>
  );
}

export function CampanhasPage({ campanhaInicial, onIr }) {
  const [lista, setLista] = useState(null);
  const [mais, setMais] = useState(false);
  const [carregandoMais, setCarregandoMais] = useState(false);
  const [busca, setBusca] = useState('');
  const [arquivadas, setArquivadas] = useState(false);
  const [telas, setTelas] = useState([]);
  const [aberta, setAberta] = useState(null);
  const [abrindo, setAbrindo] = useState(false);
  const [erro, setErro] = useState('');
  const pedido = useRef(0);

  // Toda busca nova descarta a resposta de uma busca anterior que chegue atrasada.
  function carregar(o) {
    const n = ++pedido.current;
    const pular = (o && o.pular) || 0;
    if (!pular) setLista(null);
    return criar.campanhas({ q: busca.trim(), arquivadas, pular })
      .then((r) => {
        if (n !== pedido.current) return;
        const novas = (r && r.campanhas) || [];
        setLista((l) => (pular ? (l || []).concat(novas) : novas));
        setMais(!!(r && r.mais));
      })
      .catch((e) => { if (n === pedido.current) { setErro(e.message || 'Não deu para carregar.'); setLista((l) => l || []); } });
  }

  useEffect(() => {
    devices.list().then((r) => setTelas((r && r.devices) || [])).catch(() => setTelas([]));
    if (campanhaInicial) abrir(campanhaInicial);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // A busca espera a pessoa parar de digitar.
  useEffect(() => {
    const t = setTimeout(() => carregar(), busca ? 300 : 0);
    return () => clearTimeout(t);
  }, [busca, arquivadas]); // eslint-disable-line react-hooks/exhaustive-deps

  async function verMais() {
    setCarregandoMais(true);
    try { await carregar({ pular: (lista || []).length }); } finally { setCarregandoMais(false); }
  }

  async function abrir(id) {
    setAbrindo(true); setErro('');
    try { const r = await criar.campanha(id); setAberta(r.campanha); }
    catch (e) { setErro(e.message || 'Campanha não encontrada.'); }
    finally { setAbrindo(false); }
  }

  function mudou(c) {
    setAberta(c);
    setLista((l) => (l || []).map((x) => (x.id === c.id ? { ...x, estado: c.estado, telas: c.telas, nome: c.nome, capa: c.capa || x.capa } : x)));
  }

  async function renomear(c) {
    const nome = await perguntar({ titulo: 'Renomear a campanha', rotulo: 'Nome', valor: c.nome || '', botao: 'Renomear' });
    if (nome === null || !nome.trim() || nome.trim() === c.nome) return;
    try {
      const r = await criar.renomearCampanha(c.id, nome.trim());
      setLista((l) => (l || []).map((x) => (x.id === c.id ? { ...x, nome: r.campanha.nome } : x)));
    } catch (e) { aviso.erro('campanhas', 'Não deu para renomear: ' + (e.message || 'falha de conexão') + '.'); }
  }

  async function arquivar(c, sim) {
    try {
      await criar.arquivarCampanha(c.id, sim);
      setLista((l) => (l || []).filter((x) => x.id !== c.id));
      aviso.ok(sim ? '“' + (c.nome || 'Campanha') + '” foi para as arquivadas.' : '“' + (c.nome || 'Campanha') + '” voltou para as campanhas.');
    } catch (e) { aviso.erro('campanhas', 'Não deu para ' + (sim ? 'arquivar' : 'desarquivar') + ': ' + (e.message || 'falha de conexão') + '.'); }
  }

  async function excluir(c) {
    if (!(await confirmar({ titulo: 'Excluir “' + (c.nome || 'Campanha') + '”?', texto: 'A campanha e as peças dela somem daqui. Não dá para desfazer. Se quiser só tirar da frente, arquive.', botao: 'Excluir', perigo: true }))) return;
    try { await criar.excluirCampanha(c.id); }
    catch (e) {
      if (e.codigo !== 'campanha-no-ar') { aviso.erro('campanhas', 'Não deu para excluir: ' + (e.message || 'falha de conexão') + '.'); return; }
      // No ar: as peças continuam nas TVs. Quem exclui precisa saber disso antes.
      if (!(await confirmar({ titulo: 'Esta campanha está no ar', texto: 'As peças dela continuam nas TVs até você trocar a programação. Excluir mesmo assim?', botao: 'Excluir mesmo assim', perigo: true }))) return;
      try { await criar.excluirCampanha(c.id, true); }
      catch (e2) { aviso.erro('campanhas', 'Não deu para excluir: ' + (e2.message || 'falha de conexão') + '.'); return; }
    }
    setLista((l) => (l || []).filter((x) => x.id !== c.id));
    aviso.ok('Campanha excluída.');
  }

  const nomesDasTelas = (ids) => (ids || []).map((id) => (telas.find((t) => t.id === id) || {}).name).filter(Boolean);

  if (abrindo) return <div className="flex justify-center py-20"><Spinner size={22} /></div>;

  if (aberta) {
    return (
      <div className="max-w-3xl space-y-3">
        <button type="button" onClick={() => { setAberta(null); carregar(); }} className="flex items-center gap-1.5 text-sm text-ink-2 hover:text-ink">
          <ArrowLeft size={16} /> Todas as campanhas
        </button>
        <ResultadoCampanha campanha={aberta} telas={telas} onIr={onIr} onMudou={mudou}
          acoes={<PorPraRodar campanha={aberta} telas={telas} onMudou={mudou} />} />
      </div>
    );
  }

  const procurando = !!busca.trim();

  return (
    <div className="max-w-6xl">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-ink">{arquivadas ? 'Campanhas arquivadas' : 'Campanhas'}</h1>
          <p className="mt-1 text-sm text-ink-2">{arquivadas ? 'Fora da frente, mas guardadas. Desarquive para voltar.' : 'Cada campanha é uma pasta: as peças, as TVs e o que está no ar.'}</p>
        </div>
        <Button variant="primary" icon={Plus} onClick={() => onIr && onIr('criar')}>Criar campanha</Button>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <label className="relative min-w-[12rem] flex-1 sm:max-w-xs">
          <span className="sr-only">Buscar campanha</span>
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-3" />
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar pelo nome"
            className="h-9 w-full rounded-md border border-line bg-surface pl-8 pr-8 text-sm text-ink outline-none placeholder:text-ink-3 focus:border-accent" />
          {busca && (
            <button type="button" aria-label="Limpar a busca" onClick={() => setBusca('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-3 hover:text-ink"><X size={14} /></button>
          )}
        </label>
        <button type="button" aria-pressed={arquivadas} onClick={() => setArquivadas((v) => !v)}
          className={cn('flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm transition',
            arquivadas ? 'border-accent bg-accent/10 font-medium text-ink' : 'border-line text-ink-2 hover:border-accent/50')}>
          <Archive size={14} /> {arquivadas ? 'Ver as ativas' : 'Arquivadas'}
        </button>
      </div>

      {erro && <div className="mb-3 rounded-md border border-danger-soft bg-danger-soft px-3 py-2 text-sm text-danger" role="alert">{erro}</div>}
      {lista === null ? <div className="flex justify-center py-16"><Spinner size={20} /></div> : lista.length === 0 ? (
        <Panel>
          {procurando || arquivadas ? (
            <EmptyState icon={procurando ? Search : Archive}
              title={procurando ? 'Nenhuma campanha com “' + busca.trim() + '”' : 'Nenhuma campanha arquivada'}
              description={procurando ? 'Confira o nome, ou procure nas ' + (arquivadas ? 'ativas' : 'arquivadas') + '.' : 'Arquive uma campanha para tirá-la da frente sem perder nada.'} />
          ) : (
            <EmptyState icon={Megaphone} title="Nenhuma campanha ainda"
              description="Conte no Criar o que você quer mostrar: a IA monta as TVs, a programação e as redes, e a campanha aparece aqui."
              action={<Button variant="primary" icon={Plus} onClick={() => onIr && onIr('criar')}>Criar a primeira</Button>} />
          )}
        </Panel>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {lista.map((c) => {
              const e = ESTADO[c.estado] || ESTADO.pronta;
              const nomes = nomesDasTelas(c.telas);
              const n = c.capa && c.capa.n;
              return (
                <div key={c.id} className="group flex flex-col overflow-hidden rounded-lg border border-line bg-surface transition hover:border-accent/60">
                  <button type="button" onClick={() => abrir(c.id)} className="relative block bg-surface-2 p-2 text-left" aria-label={'Abrir ' + (c.nome || 'a campanha')}>
                    {c.capa && c.capa.item ? <DesignThumb item={{ ...c.capa.item, formato: c.capa.formato || c.capa.item.formato }} />
                      : <div className="flex aspect-video items-center justify-center text-ink-3"><Megaphone size={22} /></div>}
                    {n > 0 && (
                      <span className="absolute bottom-3 right-3 flex items-center gap-1 rounded-full bg-ink/70 px-2 py-0.5 text-2xs font-semibold text-white">
                        <Layers size={11} /> {n} {n === 1 ? 'peça' : 'peças'}
                      </span>
                    )}
                  </button>
                  <div className="flex flex-1 flex-col gap-1.5 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <button type="button" onClick={() => abrir(c.id)} className="min-w-0 truncate text-left text-sm font-semibold text-ink hover:underline">{c.nome || 'Campanha'}</button>
                      <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-2xs font-semibold', e.classe)}>{e.rotulo}</span>
                    </div>
                    <span className="flex items-center gap-1 truncate text-xs text-ink-3">
                      <MonitorPlay size={12} className="shrink-0" />
                      {c.estado === 'no_ar' && nomes.length ? nomes.join(', ') : c.estado === 'no_ar' ? (c.telas || []).length + ' TV(s)' : 'em nenhuma TV agora'}
                    </span>
                    <div className="mt-auto flex items-center justify-between gap-2">
                      <span className="text-2xs text-ink-3">{quando(c.atualizadoEm)}</span>
                      <span className="flex items-center">
                        <Acao titulo="Renomear" icone={Pencil} onClick={() => renomear(c)} />
                        {arquivadas
                          ? <Acao titulo="Desarquivar" icone={ArchiveRestore} onClick={() => arquivar(c, false)} />
                          : <Acao titulo="Arquivar" icone={Archive} onClick={() => arquivar(c, true)} />}
                        <Acao titulo="Excluir" icone={Trash2} perigo onClick={() => excluir(c)} />
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          {mais && (
            <div className="mt-4 flex justify-center">
              <Button variant="secondary" disabled={carregandoMais} onClick={verMais}>{carregandoMais ? 'Carregando…' : 'Ver mais campanhas'}</Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
