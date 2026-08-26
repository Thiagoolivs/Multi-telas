import React, { useState } from 'react';
import {
  MonitorPlay, Building2, Users, Sparkles, HardDrive, MessageSquareWarning,
  Clock, Layers, Check, ShieldCheck, Trash2, Plus, Bug, CheckCircle2,
  Search, Gauge as GaugeIcon, Radio, ChevronRight, X, Images,
} from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader.jsx';
import { Panel, PanelHeader } from '../components/ui/Panel.jsx';
import { Stat } from '../components/ui/Stat.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Field, Input, Select, Textarea } from '../components/ui/Field.jsx';
import { Spinner, EmptyState, ErrorState } from '../components/ui/Feedback.jsx';
import { Badge } from '../components/ui/Badge.jsx';
import { useAsync } from '../lib/useAsync.js';
import { plataforma } from '../api.js';
import { formatBytes, formatNumber, relativeTime } from '../lib/format.js';
import { aviso } from '../lib/avisos.js';

/*
 * O painel de quem opera a plataforma — não de quem usa uma conta.
 *
 * A separação importa: "Estado do sistema" responde "a MINHA conta está bem
 * configurada?"; esta página responde "o MultiTelas está de pé, sendo usado, e
 * alguém está reclamando?". São perguntas de pessoas diferentes, e misturá-las
 * numa tela só é o jeito mais rápido de nenhuma das duas ser respondida.
 *
 * O menu que traz para cá só aparece para operador, mas isso é aparência: a
 * porta de verdade é a rota, que pergunta de novo. Esconder o menu sem fechar
 * a rota seria segurança de fachada.
 */
const JANELAS = [
  { id: 7, label: '7 dias' },
  { id: 30, label: '30 dias' },
  { id: 90, label: '90 dias' },
];

export function PlatformPage() {
  const [dias, setDias] = useState(30);
  const { data, loading, error, reload } = useAsync(() => plataforma.metricas(dias), [dias]);

  if (loading && !data) return <div className="p-10 text-center"><Spinner size={22} /></div>;
  if (error) return <ErrorState description={error.message} onRetry={reload} />;
  if (!data) return null;

  const pagantes = (data.porPlano || []).filter((p) => p.plano !== 'free').reduce((s, p) => s + p.n, 0);
  const horas = Math.round((data.uso.totalMinutos || 0) / 6) / 10;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Plataforma"
        subtitle="Os números do MultiTelas inteiro — todas as contas."
        actions={
          <div className="flex gap-1">
            {JANELAS.map((j) => (
              <button key={j.id} onClick={() => setDias(j.id)} aria-pressed={dias === j.id}
                className={'rounded-md border px-2.5 py-1.5 text-xs transition '
                  + (dias === j.id ? 'border-accent bg-accent/10 text-accent' : 'border-line text-ink-2 hover:text-ink')}>
                {j.label}
              </button>
            ))}
          </div>
        }
      />

      {/* O que está NO AR agora */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {/*
          "Telas no ar" é a única que conta a verdade sobre o produto: uma TV
          pareada há seis meses e desligada desde então continua na tabela,
          mas não está mostrando nada para ninguém.
        */}
        <Stat label="Telas no ar agora" value={formatNumber(data.telasVivas)} icon={MonitorPlay}
          hint={`de ${formatNumber(data.telas)} pareadas`} />
        <Stat label="Contas" value={formatNumber(data.contas)} icon={Building2}
          hint={`${formatNumber(data.contasNovas)} novas em ${data.dias} dias`} />
        <Stat label="Pagantes" value={formatNumber(pagantes)} icon={ShieldCheck}
          hint={data.contas ? Math.round((pagantes / data.contas) * 100) + '% das contas' : ''} />
        <Stat label="Pessoas" value={formatNumber(data.pessoas)} icon={Users}
          hint={`${formatNumber(data.ativas.pessoas)} ativas na janela`} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {/*
          Tempo ESTIMADO, e a tela diz isso. Medir tempo de tela de verdade
          exigiria um batimento contínuo do navegador — que é rastreamento, e
          ficaria sabendo que a pessoa deixou a aba aberta durante o almoço.
          O que dá para saber com honestidade é o intervalo entre ações.
        */}
        <Stat label="Tempo de uso (estimado)" value={horas} unit="h" icon={Clock}
          hint={`${formatNumber(data.uso.sessoes)} sessões · ${data.uso.mediaMinutos} min em média`} />
        <Stat label="Contas ativas" value={formatNumber(data.ativas.contas)} icon={Building2}
          hint={data.contas ? Math.round((data.ativas.contas / data.contas) * 100) + '% do total' : ''} />
        <Stat label="Chamadas de IA" value={formatNumber(data.ia.chamadas)} icon={Sparkles}
          hint={'custo R$ ' + (data.ia.custoCentavos / 100).toFixed(2)} />
        <Stat label="Mídia guardada" value={formatBytes(data.midiaBytes)} icon={HardDrive}
          hint={`${formatNumber(data.pecas)} peças salvas`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <FuncoesMaisUsadas funcoes={data.funcoes} />
        <UsoPorDia dias={data.porDia} />
      </div>

      <Freios />

      <Contas dias={dias} />

      <Erros />

      <div className="grid gap-4 lg:grid-cols-2">
        <MaioresContas contas={data.maiores} />
        <Reclamacoes resumo={data.reclamacoes} />
      </div>

      <FilaDoBanco />

      <Operadores souRaiz={data.raiz} />
    </div>
  );
}

/*
 * A lista de funções, com PARTICIPAÇÃO e não só contagem.
 *
 * "Editor: 400" não diz nada sozinho. "Editor: 40% de tudo" diz onde o produto
 * vive — e, por tabela, o que dá para mexer sem quebrar a casa de ninguém.
 */
function FuncoesMaisUsadas({ funcoes }) {
  const lista = (funcoes || []).slice(0, 10);
  const maior = lista.length ? lista[0].n : 1;
  return (
    <Panel>
      <PanelHeader title="Funções mais usadas" description="O que as pessoas realmente fazem aqui dentro." />
      <div className="p-4">
        {!lista.length && <EmptyState icon={Layers} title="Sem uso registrado na janela"
          description="Os eventos começam a ser gravados a partir deste deploy — janelas antigas ficam vazias." />}
        {lista.map((f) => (
          <div key={f.acao} className="mb-2.5 last:mb-0">
            <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
              <span className="truncate text-ink">{f.nome}</span>
              <span className="tnum shrink-0 text-ink-3">{formatNumber(f.n)} · {f.parte}%</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-line">
              <div className="h-full rounded-full bg-accent" style={{ width: Math.max(2, (f.n / maior) * 100) + '%' }} />
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function UsoPorDia({ dias }) {
  const lista = dias || [];
  const maior = lista.reduce((m, d) => Math.max(m, d.n), 1);
  return (
    <Panel>
      <PanelHeader title="Uso por dia" description="Ações registradas a cada dia da janela." />
      <div className="p-4">
        {!lista.length && <EmptyState icon={Clock} title="Ainda sem histórico" description="Volte depois de alguns dias de uso." />}
        {!!lista.length && (
          /*
            `maxWidth` por barra existe por um caso concreto: com UM dia de
            histórico, `flex-1` fazia a barra ocupar a largura inteira e o
            gráfico virava um retângulo sólido — que não se lê como gráfico
            nenhum. Com teto, um dia é uma barra e continua parecendo um dia.
          */
          <div className="flex h-32 items-end gap-0.5">
            {lista.map((d) => (
              <div key={d.dia} title={d.dia + ': ' + d.n}
                className="flex-1 rounded-t bg-accent/70 transition hover:bg-accent"
                style={{ height: Math.max(3, (d.n / maior) * 100) + '%', maxWidth: 28 }} />
            ))}
          </div>
        )}
      </div>
    </Panel>
  );
}

function MaioresContas({ contas }) {
  return (
    <Panel>
      <PanelHeader title="Maiores contas" description="Por telas pareadas." />
      <div className="max-h-80 overflow-y-auto">
        {/*
          Nome, plano e tamanho — nada de dentro da conta. Operar a plataforma
          não é motivo para ler a peça que o cliente desenhou.
        */}
        {(contas || []).map((c) => (
          <div key={c.id} className="flex items-center gap-3 border-b border-line px-4 py-2 last:border-0">
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm text-ink">{c.nome || '(sem nome)'}</div>
              <div className="text-2xs text-ink-3">desde {relativeTime(c.createdAt)}</div>
            </div>
            <span className={'rounded px-1.5 py-0.5 text-2xs ' + (c.plano === 'free' ? 'bg-line text-ink-3' : 'bg-accent/15 text-accent')}>
              {c.plano}
            </span>
            <span className="tnum w-20 text-right text-xs text-ink-2">{c.telas} tela(s)</span>
          </div>
        ))}
      </div>
    </Panel>
  );
}

/*
 * Os freios, e quem está esbarrando neles.
 *
 * Freio sem medidor é freio que ninguém sabe se está pegando: o primeiro sinal
 * seria um cliente ligando para dizer que o painel dele "dá erro". Aqui dá para
 * ver antes — e distinguir a conta em laço da conta que só está trabalhando
 * muito, que é a diferença entre ligar para ajudar e ligar para acusar.
 */
function Freios() {
  const { data, loading } = useAsync(plataforma.limites);
  if (loading || !data) return null;
  const c = data.conexoes;
  const cheio = c.teto ? c.total / c.teto : 0;

  return (
    <Panel>
      <PanelHeader title="Freios e conexões"
        description="Tetos por conta, e o que está esbarrando neles agora." />
      <div className="grid gap-3 p-4 sm:grid-cols-3">
        <div>
          <div className="text-2xs uppercase tracking-wide text-ink-3">Conexões ao vivo</div>
          <div className={'tnum text-lg font-semibold ' + (cheio > 0.8 ? 'text-danger' : 'text-ink')}>
            {formatNumber(c.total)} <span className="text-xs font-normal text-ink-3">de {formatNumber(c.teto)}</span>
          </div>
          <div className="text-2xs text-ink-3">{c.telas} tela(s) · {c.contas} conta(s)</div>
        </div>
        <div className="sm:col-span-2">
          <div className="mb-1 text-2xs uppercase tracking-wide text-ink-3">Contas com mais conexões abertas</div>
          {!c.maiores.length && <div className="text-xs text-ink-3">Nenhuma conexão aberta agora.</div>}
          {c.maiores.map((m) => (
            <div key={m.tenantId} className="flex items-center gap-2 text-xs text-ink-2">
              <Radio size={12} className="shrink-0 text-ok" />
              <span className="truncate font-mono text-2xs">{m.tenantId}</span>
              <span className="ml-auto tnum">{m.abertas}</span>
            </div>
          ))}
        </div>
      </div>

      {/*
        A lista de excessos é a que importa quando algo está errado. Ela fica
        vazia na maior parte do tempo, e isso é o estado saudável — por isso o
        vazio diz o que significa, em vez de sumir.
      */}
      <div className="border-t border-line">
        {!data.excessos.length ? (
          <div className="px-4 py-3 text-xs text-ink-3">
            Nenhuma conta esbarrou nos tetos nas últimas 24 h.
          </div>
        ) : data.excessos.map((e) => (
          <div key={e.tenantId} className="flex items-center gap-2 border-b border-line px-4 py-2 text-xs last:border-0">
            <GaugeIcon size={13} className="shrink-0 text-warn" />
            <span className="truncate font-mono text-2xs text-ink-2">{e.tenantId}</span>
            <span className="text-ink-3">
              {e.classes.map((c2) => c2.classe + ' ×' + formatNumber(c2.vezes)).join(' · ')}
            </span>
            <span className="ml-auto shrink-0 text-2xs text-ink-3">{relativeTime(e.ultimo)}</span>
          </div>
        ))}
      </div>
    </Panel>
  );
}

/*
 * SUPERVISÃO POR CONTA.
 *
 * "Maiores contas" ordena por número de telas: diz quem é grande e não diz
 * quem está com problema. Quando um cliente liga dizendo "não está
 * funcionando", o que se precisa é procurar pelo e-mail dele e ver tudo numa
 * tela — plano, telas e quando cada uma apareceu por último, uso de IA, o que
 * já gastou, e se está esbarrando em algum teto.
 */
function Contas({ dias }) {
  const [termo, setTermo] = useState('');
  const [busca, setBusca] = useState('');
  const [aberta, setAberta] = useState(null);
  const { data, loading } = useAsync(() => plataforma.contas(busca, dias), [busca, dias]);
  const itens = (data && data.itens) || [];

  return (
    <Panel>
      <PanelHeader title="Contas" description="Procure por nome, e-mail ou id e abra a ficha." />
      <div className="flex gap-2 border-b border-line p-3">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-3" />
          <Input value={termo} onChange={(e) => setTermo(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') setBusca(termo); }}
            placeholder="nome da empresa, e-mail do dono ou id…" className="pl-8" />
        </div>
        <Button size="sm" variant="secondary" onClick={() => setBusca(termo)}>Procurar</Button>
      </div>

      <div className="max-h-96 overflow-y-auto">
        {loading && <div className="p-6 text-center"><Spinner /></div>}
        {!loading && !itens.length && (
          <EmptyState icon={Building2} title="Nenhuma conta"
            description={busca ? 'Nada bate com essa busca.' : 'Ainda não há contas.'} />
        )}
        {itens.map((c) => (
          <button key={c.id} type="button" onClick={() => setAberta(c.id)}
            className="flex w-full items-center gap-2 border-b border-line px-4 py-2.5 text-left last:border-0 hover:bg-surface-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="truncate text-xs font-medium text-ink">{c.nome || 'sem nome'}</span>
                {c.planoStatus === 'cortesia' && <Badge tone="accent">Cortesia</Badge>}
              </div>
              <div className="truncate text-2xs text-ink-3">{c.dono}</div>
            </div>
            {/* Telas NO AR sobre pareadas: é a única contagem que diz se a
                conta está de fato usando o produto. */}
            <div className="shrink-0 text-right text-2xs text-ink-3">
              <div className="tnum text-ink-2">{c.vivas}/{c.telas} no ar</div>
              <div>{c.plano}</div>
            </div>
            {!!Object.keys(c.excessos || {}).length && (
              <GaugeIcon size={13} className="shrink-0 text-warn" title="esbarrou em algum teto" />
            )}
            <ChevronRight size={14} className="shrink-0 text-ink-3" />
          </button>
        ))}
      </div>

      {aberta && <FichaDaConta id={aberta} dias={dias} onFechar={() => setAberta(null)} />}
    </Panel>
  );
}

/* A ficha de uma conta, em cima da lista. */
function FichaDaConta({ id, dias, onFechar }) {
  const { data, loading } = useAsync(() => plataforma.conta(id, dias), [id, dias]);

  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:p-8"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onFechar(); }}>
      <div className="w-full max-w-2xl rounded-lg border border-line bg-surface shadow-lg">
        <div className="flex items-center gap-2 border-b border-line px-4 py-3">
          <Building2 size={16} className="text-accent" />
          <span className="truncate text-sm font-semibold text-ink">{(data && data.nome) || 'Conta'}</span>
          <button type="button" onClick={onFechar} className="ml-auto text-ink-3 hover:text-ink"><X size={16} /></button>
        </div>

        {loading && <div className="p-8 text-center"><Spinner /></div>}
        {data && (
          <div className="space-y-4 p-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Campo rotulo="Plano" valor={data.plano + (data.cortesia ? ' (cortesia)' : '')} />
              <Campo rotulo="Telas no ar" valor={data.telas.filter((t) => Date.now() - t.ultimaVez < 5 * 60 * 1000).length + '/' + data.telas.length} />
              <Campo rotulo="Mídia" valor={formatBytes(data.midiaBytes)} />
              <Campo rotulo="Conexões agora" valor={formatNumber(data.conexoes)} />
              <Campo rotulo="Peças salvas" valor={formatNumber(data.pecas)} />
              <Campo rotulo={'Ações em ' + data.dias + 'd'} valor={formatNumber(data.acoes)} />
              <Campo rotulo="Crédito de IA" valor={formatNumber(data.creditos.franquia + data.creditos.comprados)} />
              <Campo rotulo="Nasceu" valor={relativeTime(data.criadaEm)} />
            </div>

            {!!Object.keys(data.excessos || {}).length && (
              <div className="rounded-md border border-warn/40 bg-warn/5 px-3 py-2 text-xs text-ink-2">
                <b>Esbarrou nos tetos:</b>{' '}
                {Object.entries(data.excessos).map(([k, v]) => k + ' ×' + v.vezes).join(' · ')}
              </div>
            )}

            <Secao titulo={'Telas (' + data.telas.length + ')'}>
              {!data.telas.length && <div className="text-xs text-ink-3">Nenhuma tela pareada.</div>}
              {data.telas.slice(0, 12).map((t) => (
                <div key={t.id} className="flex items-center gap-2 text-xs">
                  <MonitorPlay size={12} className={Date.now() - t.ultimaVez < 5 * 60 * 1000 ? 'text-ok' : 'text-ink-3'} />
                  <span className="truncate text-ink-2">{t.nome || t.id}</span>
                  <span className="ml-auto shrink-0 text-2xs text-ink-3">
                    {t.ultimaVez ? relativeTime(t.ultimaVez) : 'nunca apareceu'}
                  </span>
                </div>
              ))}
            </Secao>

            <Secao titulo={'Pessoas (' + data.pessoas.length + ')'}>
              {data.pessoas.map((u) => (
                <div key={u.id} className="flex items-center gap-2 text-xs">
                  <Users size={12} className="text-ink-3" />
                  <span className="truncate text-ink-2">{u.email}</span>
                  <span className="ml-auto shrink-0 text-2xs text-ink-3">{u.papel}</span>
                </div>
              ))}
            </Secao>

            {!!data.trabalhos.length && (
              <Secao titulo="Trabalhos de IA recentes">
                {data.trabalhos.map((j) => (
                  <div key={j.id} className="flex items-center gap-2 text-xs">
                    <Sparkles size={12} className="text-ink-3" />
                    <span className="truncate text-ink-2">{j.tipo}</span>
                    <span className="text-2xs text-ink-3">{j.estado}</span>
                    <span className="ml-auto shrink-0 text-2xs text-ink-3">{relativeTime(j.criadoEm)}</span>
                  </div>
                ))}
              </Secao>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Campo({ rotulo, valor }) {
  return (
    <div>
      <div className="text-2xs uppercase tracking-wide text-ink-3">{rotulo}</div>
      <div className="tnum truncate text-sm font-medium text-ink">{valor}</div>
    </div>
  );
}

function Secao({ titulo, children }) {
  return (
    <div>
      <div className="mb-1.5 text-2xs font-semibold uppercase tracking-wide text-ink-3">{titulo}</div>
      <div className="space-y-1 rounded-md border border-line bg-surface-2 p-2.5">{children}</div>
    </div>
  );
}

/*
 * O que quebrou, agrupado por assinatura.
 *
 * Fica em linha inteira e ACIMA das reclamações de propósito: quando as duas
 * listas têm coisa, a de erros costuma ser a CAUSA da outra. Ver a reclamação
 * primeiro leva a responder o cliente; ver o erro primeiro leva a consertar.
 *
 * A contagem importa mais que a lista. Um erro que aconteceu 400 vezes numa
 * hora e um que aconteceu uma vez ocupam a mesma linha e não são o mesmo
 * problema — por isso "vezes" vem em destaque, e não escondido no fim.
 */
function Erros() {
  const { data, loading, reload } = useAsync(plataforma.erros);
  const [aberto, setAberto] = useState(null);
  const itens = (data && data.itens) || [];

  async function limpar() {
    await plataforma.limparErros();
    aviso.ok('Lista zerada. O que continuar quebrando aparece de novo sozinho.');
    reload();
  }

  return (
    <Panel>
      <PanelHeader
        title="O que quebrou"
        description={
          data && data.grupos
            ? `${data.grupos} tipo(s) · ${formatNumber(data.total)} ocorrência(s) · ${formatNumber(data.naUltimaHora)} na última hora`
            : 'Erros do servidor, agrupados. Vivem na memória do processo e somem no próximo deploy.'
        }
        actions={itens.length ? <Button size="sm" variant="ghost" icon={Check} onClick={limpar}>Zerar</Button> : null}
      />
      <div className="max-h-96 overflow-y-auto">
        {loading && <div className="p-6 text-center"><Spinner /></div>}
        {!loading && !itens.length && (
          <EmptyState icon={CheckCircle2} title="Nada quebrou"
            description="Nenhum erro desde que o servidor subiu." />
        )}
        {itens.map((g) => (
          <div key={g.id} className="border-b border-line px-4 py-3 last:border-0">
            <button type="button" className="flex w-full items-start gap-2 text-left"
              onClick={() => setAberto(aberto === g.id ? null : g.id)}>
              <Bug size={14} className="mt-0.5 shrink-0 text-danger" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs text-ink-1">{g.mensagem || g.tipo}</div>
                <div className="mt-0.5 text-2xs text-ink-3">{g.tipo} · {g.origem}</div>
              </div>
              <div className="shrink-0 text-right">
                <div className={'text-xs font-semibold ' + (g.vezes > 10 ? 'text-danger' : 'text-ink-2')}>
                  {formatNumber(g.vezes)}×
                </div>
                <div className="text-2xs text-ink-3">{relativeTime(g.ultima)}</div>
              </div>
            </button>
            {aberto === g.id && (
              <div className="mt-2 space-y-2">
                {g.pilha && (
                  <pre className="overflow-x-auto rounded border border-line bg-surface-2 p-2 text-2xs leading-relaxed text-ink-2">
                    {g.pilha.split(' | ').join('\n')}
                  </pre>
                )}
                {/* Onde aconteceu vale mais que quantas vezes: é o que permite reproduzir. */}
                {!!(g.exemplos || []).length && (
                  <div className="space-y-1">
                    {g.exemplos.map((e, i) => (
                      <div key={i} className="text-2xs text-ink-3">
                        {relativeTime(e.em)} · {[e.metodo, e.rota, e.onde].filter(Boolean).join(' ')}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </Panel>
  );
}

/*
 * A fila do Banco de Imagens.
 *
 * Nada entra no acervo de todo mundo sem alguém olhar. O volume no começo é
 * minúsculo e conferir custa quase nada; o custo de UMA imagem errada
 * aparecendo na parede de trinta clientes não é. As regras estão em
 * server/banco.js — aqui é só o par de botões.
 */
function FilaDoBanco() {
  const [estado, setEstado] = useState('pendente');
  const { data, loading, reload } = useAsync(() => plataforma.bancoFila(estado), [estado]);
  const itens = (data && data.itens) || [];

  async function decidir(item, novo) {
    try {
      await plataforma.bancoDecidir(item.id, novo);
      aviso.ok(novo === 'aprovada' ? 'No banco.' : 'Recusada.');
      reload();
    } catch (e) { aviso.erro('banco:' + item.id, 'Não deu para decidir.', e.message || ''); }
  }

  return (
    <Panel>
      <PanelHeader title="Banco de Imagens" description="O que os clientes ofereceram para o acervo comum."
        actions={
          <div className="flex gap-1">
            {[['pendente', 'Na fila'], ['aprovada', 'No banco'], ['recusada', 'Recusadas']].map(([id, rotulo]) => (
              <button key={id} onClick={() => setEstado(id)} aria-pressed={estado === id}
                className={'rounded-md border px-2.5 py-1.5 text-xs transition '
                  + (estado === id ? 'border-accent bg-accent/10 text-accent' : 'border-line text-ink-2 hover:text-ink')}>
                {rotulo}
              </button>
            ))}
          </div>
        } />
      {loading && <div className="p-6 text-center"><Spinner /></div>}
      {!loading && !itens.length && (
        <EmptyState icon={Images} title={estado === 'pendente' ? 'Fila vazia' : 'Nada aqui'}
          description={estado === 'pendente' ? 'Nenhuma imagem esperando conferência.' : undefined} />
      )}
      {!loading && !!itens.length && (
        <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 lg:grid-cols-4">
          {itens.map((i) => (
            <div key={i.id} className="overflow-hidden rounded-lg border border-line bg-surface-2">
              <div className="aspect-video bg-[#0a1128]">
                <img src={i.url} alt="" className="h-full w-full object-cover" loading="lazy"
                  onError={(ev) => { ev.currentTarget.style.display = 'none'; }} />
              </div>
              <div className="p-2">
                <div className="truncate text-xs text-ink" title={i.descricao}>{i.descricao}</div>
                <div className="mt-0.5 flex items-center justify-between text-2xs text-ink-3">
                  <span>{i.segmento || '—'}</span>
                  <span>{i.formato || '—'}</span>
                </div>
                {estado === 'pendente' && (
                  <div className="mt-1.5 flex gap-1">
                    <Button size="sm" variant="secondary" className="flex-1" icon={Check}
                      onClick={() => decidir(i, 'aprovada')}>Aceitar</Button>
                    <Button size="sm" variant="ghost" icon={X} onClick={() => decidir(i, 'recusada')}>Não</Button>
                  </div>
                )}
                {estado === 'aprovada' && (
                  <div className="mt-1.5 flex items-center justify-between">
                    <span className="tnum text-2xs text-ink-3">{i.usos} uso(s)</span>
                    <Button size="sm" variant="ghost" icon={X} onClick={() => decidir(i, 'recusada')}>Tirar</Button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

function Reclamacoes({ resumo }) {
  const { data, loading, reload } = useAsync(plataforma.reclamacoes);
  const [respondendo, setRespondendo] = useState(null);
  const [texto, setTexto] = useState('');
  const itens = (data && data.itens) || [];

  async function resolver(r) {
    await plataforma.resolver(r.id, 'resolvida', texto);
    setRespondendo(null); setTexto('');
    aviso.ok('Marcada como resolvida.');
    reload();
  }

  return (
    <Panel>
      <PanelHeader title="Reclamações e pedidos"
        description={`${(resumo && resumo.aberta) || 0} aberta(s) na janela · ${(resumo && resumo.resolvida) || 0} resolvida(s)`} />
      <div className="max-h-80 overflow-y-auto">
        {loading && <div className="p-6 text-center"><Spinner /></div>}
        {!loading && !itens.length && (
          <EmptyState icon={MessageSquareWarning} title="Ninguém escreveu ainda"
            description="O canal fica na página de Suporte de cada conta." />
        )}
        {itens.map((r) => (
          <div key={r.id} className="border-b border-line px-4 py-3 last:border-0">
            <div className="mb-1 flex items-center gap-2 text-2xs">
              <span className={'rounded px-1.5 py-0.5 ' + (r.status === 'aberta' ? 'bg-warn/15 text-warn' : 'bg-ok/15 text-ok')}>
                {r.status}
              </span>
              <span className="text-ink-3">{r.tipo}</span>
              <span className="ml-auto text-ink-3">{relativeTime(r.createdAt)}</span>
            </div>
            <div className="text-xs text-ink-2">{r.texto}</div>
            <div className="mt-1 text-2xs text-ink-3">{r.email}</div>
            {r.resposta && <div className="mt-1.5 rounded border border-line bg-surface-2 p-2 text-2xs text-ink-2">{r.resposta}</div>}
            {r.status === 'aberta' && (respondendo === r.id ? (
              <div className="mt-2 space-y-1.5">
                <Textarea rows={2} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="O que foi feito (fica visível para quem escreveu)…" />
                <div className="flex gap-1.5">
                  <Button size="sm" variant="primary" icon={Check} onClick={() => resolver(r)}>Resolver</Button>
                  <Button size="sm" variant="ghost" onClick={() => { setRespondendo(null); setTexto(''); }}>Cancelar</Button>
                </div>
              </div>
            ) : (
              <Button size="sm" variant="secondary" className="mt-2" onClick={() => setRespondendo(r.id)}>Responder</Button>
            ))}
          </div>
        ))}
      </div>
    </Panel>
  );
}

/*
 * Quem mais opera a plataforma.
 *
 * A lista da variável de ambiente aparece MARCADA e sem botão de remover: ela
 * não sai daqui, sai do deploy. Mostrar um botão que não funciona seria pior
 * do que não mostrar nada.
 */
function Operadores({ souRaiz }) {
  const { data, loading, reload } = useAsync(plataforma.operadores);
  const [email, setEmail] = useState('');
  const [nome, setNome] = useState('');
  const [erro, setErro] = useState('');

  async function convidar() {
    setErro('');
    try { await plataforma.addOperador(email.trim(), nome.trim()); setEmail(''); setNome(''); reload(); }
    catch (e) { setErro(e.message || 'Não foi possível convidar.'); }
  }

  if (loading) return null;
  const raiz = (data && data.raiz) || [];
  const convidados = (data && data.convidados) || [];

  return (
    <Panel>
      <PanelHeader title="Quem opera a plataforma"
        description="Enxergam os números de todas as contas." />
      <div className="p-4">
        <div className="mb-3 space-y-1">
          {raiz.map((e) => (
            <div key={e} className="flex items-center gap-2 text-sm">
              <ShieldCheck size={14} className="text-accent" />
              <span className="text-ink">{e}</span>
              <span className="text-2xs text-ink-3">definido no deploy (ADMIN_EMAILS) — não sai por aqui</span>
            </div>
          ))}
          {convidados.map((o) => (
            <div key={o.email} className="flex items-center gap-2 text-sm">
              <Users size={14} className="text-ink-3" />
              <span className="text-ink">{o.email}</span>
              {o.nome && <span className="text-2xs text-ink-3">{o.nome}</span>}
              {souRaiz && (
                <button className="ml-auto text-ink-3 hover:text-danger" title={'Tirar acesso de ' + o.email}
                  onClick={async () => { await plataforma.removerOperador(o.email); reload(); }}>
                  <Trash2 size={13} />
                </button>
              )}
            </div>
          ))}
        </div>

        {souRaiz ? (
          <div className="flex flex-wrap items-end gap-2 border-t border-line pt-3">
            <div className="min-w-[14rem] flex-1">
              <Field label="E-mail"><Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="pessoa@empresa.com" /></Field>
            </div>
            <div className="w-40">
              <Field label="Nome (opcional)"><Input value={nome} onChange={(e) => setNome(e.target.value)} /></Field>
            </div>
            <Button variant="secondary" icon={Plus} disabled={!email.trim()} onClick={convidar}>Dar acesso</Button>
            {erro && <span className="text-sm text-danger">{erro}</span>}
          </div>
        ) : (
          <p className="border-t border-line pt-3 text-2xs text-ink-3">
            Só quem está em ADMIN_EMAILS pode dar ou tirar acesso. Sem isso, um convite errado se
            multiplicaria sozinho e não haveria como cortar de volta.
          </p>
        )}
      </div>
    </Panel>
  );
}
