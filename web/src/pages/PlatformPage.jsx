import React, { useState } from 'react';
import {
  MonitorPlay, Building2, Users, Sparkles, HardDrive, MessageSquareWarning,
  Clock, Layers, Check, ShieldCheck, Trash2, Plus,
} from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader.jsx';
import { Panel, PanelHeader } from '../components/ui/Panel.jsx';
import { Stat } from '../components/ui/Stat.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Field, Input, Select, Textarea } from '../components/ui/Field.jsx';
import { Spinner, EmptyState, ErrorState } from '../components/ui/Feedback.jsx';
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

      <div className="grid gap-4 lg:grid-cols-2">
        <MaioresContas contas={data.maiores} />
        <Reclamacoes resumo={data.reclamacoes} />
      </div>

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
