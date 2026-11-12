import React, { useEffect, useState } from 'react';
import { BellRing, Check, X, AlertTriangle, Users } from 'lucide-react';
import { Panel, PanelHeader } from '../components/ui/Panel.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Badge } from '../components/ui/Badge.jsx';
import { SkeletonRows, ErrorState, EmptyState, Spinner } from '../components/ui/Feedback.jsx';
import { TvAoVivo } from '../components/tela/TvAoVivo.jsx';
import { avisarMudanca } from '../components/layout/SinoAprovacoes.jsx';
import { useAsync } from '../lib/useAsync.js';
import { relativeTime } from '../lib/format.js';
import { itemSummary } from '../lib/contentTypes.js';
import { precisaDeNomes } from '../lib/nomesDasMidias.js';
import { useNomesDasMidias } from '../lib/useNomesDasMidias.js';
import { aviso } from '../lib/avisos.js';
import { perguntar, confirmar } from '../lib/confirmar.js';
import { aprovacoes } from '../api.js';
// Os layouts de js/templates.js (o tamanho da TV em pé ou deitada), como no resto do painel.
import '../lib/screenConfig.js';

/*
 * APROVAÇÕES (fase 13). Feita para o celular do dono: a lista do que a
 * equipe quer pôr na TV, cada pedido com o antes e o depois de cada TV, e
 * dois botões — Aprovar (vai ao ar sozinho) e Recusar (com o porquê, que a
 * pessoa vê). Um pedido aberto por vez: um botão violeta por tela.
 *
 * Para o membro, a mesma página mostra os pedidos dele: esperando, na TV ou
 * recusado (com o motivo).
 */
const ESTADO = {
  pendente: { rotulo: 'Esperando', tom: 'warn' },
  aplicando: { rotulo: 'Indo para a TV', tom: 'accent' },
  aprovada: { rotulo: 'Na TV', tom: 'ok' },
  recusada: { rotulo: 'Recusado', tom: 'danger' },
  cancelada: { rotulo: 'Você desistiu', tom: 'neutral' },
  substituida: { rotulo: 'Trocado por um mais novo', tom: 'neutral' },
};

const nomesDasTelas = (p) => (p.telas || []).map((t) => t.nome || 'TV').join(', ');

// O que passa na TV, em texto: no celular, o preço trocado se lê aqui, mesmo quando a miniatura é pequena.
// `nomesDasMidias`: o nome original da foto e do vídeo postos antes do nome ir junto (useNomesDasMidias).
function oQuePassa(cfg, nomesDasMidias) {
  const itens = Object.values((cfg && cfg.zonas) || {}).flatMap((z) => (z && Array.isArray(z.items) ? z.items : []));
  const nomes = [];
  for (const it of itens) {
    let nome = '';
    try { nome = String(itemSummary(it, nomesDasMidias) || '').trim(); } catch (e) { nome = ''; }
    if (nome && !nomes.includes(nome)) nomes.push(nome);
  }
  return nomes;
}

export function AprovacoesPage({ me, onIr }) {
  const { data, loading, error, reload } = useAsync(aprovacoes.listar);
  const [aberto, setAberto] = useState(null);
  const revisor = !!(data && data.souRevisor);

  // O membro abriu: as respostas ficam vistas e o sino zera.
  useEffect(() => {
    if (data && !data.souRevisor && (data.minhas || []).some((p) => (p.estado === 'aprovada' || p.estado === 'recusada') && !p.vistoEm)) {
      aprovacoes.vistas().then(avisarMudanca).catch(() => {});
    }
  }, [data]);

  const depoisDeDecidir = () => { setAberto(null); reload(); avisarMudanca(); };

  return (
    <div>
      <header className="mb-5">
        <h1 className="text-xl font-semibold tracking-tight text-ink">{revisor || !data ? 'Aprovações' : 'Seus pedidos'}</h1>
        <p className="mt-1 text-sm text-ink-2">
          {revisor
            ? 'O que a equipe quer pôr na TV. Veja o antes e o depois e decida: aprovado, vai para a TV sozinho.'
            : 'O que você mandou para a TV espera o OK do dono. Aqui você vê a resposta.'}
        </p>
      </header>

      {loading && <Panel><SkeletonRows rows={3} cols={2} /></Panel>}
      {error && <ErrorState description="Não deu para carregar os pedidos." onRetry={reload} />}

      {data && revisor && (
        <>
          {!data.ligada && (
            <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-line bg-surface-2 px-3 py-2.5 text-sm text-ink-2">
              <span className="min-w-0 flex-1">A aprovação está desligada: a equipe põe na TV direto. Ligue em Equipe.</span>
              <Button size="sm" variant="secondary" icon={Users} onClick={() => onIr && onIr('team')}>Abrir Equipe</Button>
            </div>
          )}
          <Panel>
            <PanelHeader title="Esperando você" description={data.pendentes.length ? data.pendentes.length + (data.pendentes.length === 1 ? ' pedido' : ' pedidos') : undefined} />
            {!data.pendentes.length ? (
              <EmptyState icon={BellRing} title="Nada esperando" description="Quando alguém da equipe puser algo na TV, o pedido aparece aqui e no sino." />
            ) : (
              <ul className="divide-y divide-line">
                {data.pendentes.map((p) => (
                  <li key={p.id} className="px-4 py-3">
                    <Resumo p={p} />
                    {aberto === p.id
                      ? <Detalhe id={p.id} onFechar={() => setAberto(null)} onDecidido={depoisDeDecidir} />
                      : <Button size="sm" variant="secondary" className="mt-2" onClick={() => setAberto(p.id)}>Ver o antes e o depois</Button>}
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          {data.decididas && data.decididas.length > 0 && (
            <Panel className="mt-4">
              <PanelHeader title="Decididos há pouco" />
              <ul className="divide-y divide-line">
                {data.decididas.map((p) => (
                  <li key={p.id} className="px-4 py-3"><Resumo p={p} mostrarEstado /></li>
                ))}
              </ul>
            </Panel>
          )}
        </>
      )}

      {data && !revisor && <MeusPedidos data={data} onMudou={reload} />}
    </div>
  );
}

function Resumo({ p, mostrarEstado }) {
  const e = ESTADO[p.estado] || ESTADO.pendente;
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-2">
        <span className="break-words text-sm font-semibold text-ink">{p.descricao || 'Mudança na TV'}</span>
        {mostrarEstado && <Badge tone={e.tom}>{e.rotulo}</Badge>}
      </div>
      <p className="mt-0.5 break-words text-sm text-ink-2">
        {(p.autorNome || 'Alguém da equipe') + ' · ' + relativeTime(p.criadoEm) + ' · ' + nomesDasTelas(p)}
      </p>
      {mostrarEstado && p.estado === 'recusada' && p.motivo && <p className="mt-1 break-words text-sm text-ink-2">Por quê: {p.motivo}</p>}
      {mostrarEstado && p.revisorNome && (p.estado === 'aprovada' || p.estado === 'recusada') && (
        <p className="mt-0.5 text-sm text-ink-3">{(p.estado === 'aprovada' ? 'Aprovado por ' : 'Recusado por ') + p.revisorNome}</p>
      )}
    </div>
  );
}

/* O pedido aberto: o antes e o depois de cada TV, e a decisão. */
function Detalhe({ id, onFechar, onDecidido }) {
  const { data, loading, error, reload } = useAsync(() => aprovacoes.ver(id), [id]);
  const [ocupado, setOcupado] = useState(false);
  const [conflito, setConflito] = useState('');
  const nomesDasMidias = useNomesDasMidias(((data && data.telas) || []).some((t) => precisaDeNomes(t.antes) || precisaDeNomes(t.depois)));

  async function aprovar(porCima) {
    if (porCima && !(await confirmar({
      titulo: 'Pôr por cima?',
      texto: 'A TV mudou depois deste pedido. Aprovando assim, o que mudou depois sai da TV e fica o que a pessoa pediu.',
      botao: 'Pôr por cima', perigo: true,
    }))) return;
    setOcupado(true); setConflito('');
    try {
      await aprovacoes.aprovar(id, porCima);
      aviso.ok('Aprovado: já está indo para a TV.');
      onDecidido();
    } catch (e) {
      if (e.codigo === 'config-mudou') { setConflito(e.message); reload(); }
      else aviso.erro('aprovacao', 'Não deu para aprovar.', e.message || '');
      if (e.codigo === 'ja-decidido') onDecidido();
    } finally { setOcupado(false); }
  }
  async function recusar() {
    const motivo = await perguntar({
      titulo: 'Recusar o pedido', texto: 'A pessoa vê o motivo, para poder ajustar.', rotulo: 'Por quê?',
      placeholder: 'Ex.: o preço está errado', botao: 'Recusar',
    });
    if (motivo == null) return;
    setOcupado(true);
    try {
      await aprovacoes.recusar(id, motivo);
      aviso.ok('Recusado. A pessoa vê o motivo.');
      onDecidido();
    } catch (e) {
      aviso.erro('aprovacao', 'Não deu para recusar.', e.message || '');
      if (e.codigo === 'ja-decidido') onDecidido();
    } finally { setOcupado(false); }
  }

  if (loading) return <div className="flex justify-center py-6"><Spinner size={18} /></div>;
  if (error) return <ErrorState description="Não deu para abrir este pedido." onRetry={reload} />;
  const telas = (data && data.telas) || [];
  const mudou = telas.some((t) => t.mudouDepois);
  return (
    <div className="mt-3 space-y-4">
      {telas.map((t) => (
        <section key={t.id} aria-label={'TV ' + t.nome}>
          <h3 className="text-sm font-semibold text-ink">{t.nome}{t.grupo ? <span className="font-normal text-ink-3"> · {t.grupo}</span> : null}</h3>
          {!t.existe && <p className="mt-1 text-sm text-danger">Esta TV saiu da conta.</p>}
          {t.mudouDepois && (
            <p className="mt-1 flex items-start gap-1.5 text-sm text-warn"><AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden="true" />Esta TV mudou depois do pedido.</p>
          )}
          <div className="mt-2 grid grid-cols-2 gap-2 sm:gap-4">
            {t.antes ? <ATv cfg={t.antes} rotulo="Antes (agora na TV)" /> : <SemPrevia rotulo="Antes (agora na TV)" texto="A TV ainda não tinha nada." />}
            {t.depois ? <ATv cfg={t.depois} rotulo="Depois (se aprovar)" /> : <SemPrevia rotulo="Depois (se aprovar)" texto="Sem prévia." />}
            <ListaDoQuePassa nomes={oQuePassa(t.antes, nomesDasMidias)} />
            <ListaDoQuePassa nomes={oQuePassa(t.depois, nomesDasMidias)} antes={oQuePassa(t.antes, nomesDasMidias)} />
          </div>
        </section>
      ))}
      {conflito && <p role="alert" className="rounded-md border border-warn-soft bg-warn-soft px-3 py-2 text-sm text-ink">{conflito}</p>}
      <div className="flex flex-wrap items-center gap-2">
        {conflito || mudou
          ? <Button variant="primary" icon={Check} disabled={ocupado} onClick={() => aprovar(true)}>Aprovar por cima</Button>
          : <Button variant="primary" icon={Check} disabled={ocupado} onClick={() => aprovar(false)}>Aprovar e pôr na TV</Button>}
        <Button variant="danger" icon={X} disabled={ocupado} onClick={recusar}>Recusar</Button>
        <Button variant="ghost" disabled={ocupado} onClick={onFechar}>Fechar</Button>
      </div>
    </div>
  );
}

function ListaDoQuePassa({ nomes, antes }) {
  if (!nomes.length) return <p className="text-sm text-ink-3">Nada na lista.</p>;
  return (
    <ul className="min-w-0 space-y-0.5 text-sm text-ink-2">
      {nomes.slice(0, 6).map((n) => {
        const novo = antes && !antes.includes(n);
        return <li key={n} className={novo ? 'break-words font-semibold text-ink' : 'break-words'}>{n}{novo ? ' (novo)' : ''}</li>;
      })}
      {nomes.length > 6 && <li className="text-ink-3">e mais {nomes.length - 6}</li>}
    </ul>
  );
}

/*
 * O antes e o depois com a TV de verdade (reteste 2: o desenho saía vazio,
 * só a moldura): o próprio player num quadro, como "Na TV agora" na página
 * da TV. O antes é a programação que está na TV; o depois, a do pedido.
 */
function ATv({ cfg, rotulo }) {
  return (
    <figure className="m-0 min-w-0">
      <figcaption className="mb-1 text-2xs font-semibold uppercase tracking-wide text-ink-3">{rotulo}</figcaption>
      <TvAoVivo cfg={cfg} alturaMaxima={260} rotulo={rotulo} />
    </figure>
  );
}

function SemPrevia({ rotulo, texto }) {
  return (
    <figure className="m-0">
      <figcaption className="mb-1 text-2xs font-semibold uppercase tracking-wide text-ink-3">{rotulo}</figcaption>
      <div className="flex aspect-video items-center justify-center rounded-lg border border-dashed border-line px-2 text-center text-xs text-ink-3">{texto}</div>
    </figure>
  );
}

function MeusPedidos({ data, onMudou }) {
  const lista = data.minhas || [];
  async function desistir(p) {
    if (!(await confirmar({ titulo: 'Desistir do pedido?', texto: 'Ele sai da fila do dono. A TV continua como está.', botao: 'Desistir' }))) return;
    try { await aprovacoes.desistir(p.id); onMudou(); avisarMudanca(); }
    catch (e) { aviso.erro('aprovacao', 'Não deu para desistir.', e.message || ''); }
  }
  return (
    <Panel>
      <PanelHeader title="Os últimos pedidos" description={data.ligada ? 'A aprovação está ligada nesta conta.' : 'A aprovação está desligada: o que você põe vai direto para a TV.'} />
      {!lista.length ? (
        <EmptyState icon={BellRing} title="Nenhum pedido ainda" description="Quando você puser algo na TV, o pedido aparece aqui até o dono responder." />
      ) : (
        <ul className="divide-y divide-line">
          {lista.map((p) => (
            <li key={p.id} className="flex flex-wrap items-start gap-3 px-4 py-3">
              <div className="min-w-0 flex-1"><Resumo p={p} mostrarEstado /></div>
              {p.estado === 'pendente' && <Button size="sm" variant="ghost" onClick={() => desistir(p)}>Desistir</Button>}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
