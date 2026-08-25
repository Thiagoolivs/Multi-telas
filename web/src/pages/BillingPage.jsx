import React, { useEffect, useState } from 'react';
import { CreditCard, Check, MonitorPlay, Sparkles, ExternalLink, HardDrive, Image as ImageIcon } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader.jsx';
import { Panel, PanelHeader } from '../components/ui/Panel.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Badge } from '../components/ui/Badge.jsx';
import { Progress, Skeleton, ErrorState } from '../components/ui/Feedback.jsx';
import { useAsync } from '../lib/useAsync.js';
import { billing } from '../api.js';

function brl(cents) {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0 });
}

// Banner de retorno do checkout (?billing=success|cancel), limpo da URL após ler.
function useBillingFlash() {
  const [flash, setFlash] = useState(() => new URLSearchParams(window.location.search).get('billing'));
  useEffect(() => {
    if (flash) {
      const url = new URL(window.location.href);
      url.searchParams.delete('billing');
      window.history.replaceState({}, '', url.pathname + url.search);
    }
  }, [flash]);
  return [flash, () => setFlash(null)];
}

export function BillingPage({ onFalarComVendas }) {
  const { data, loading, error, reload } = useAsync(billing.get);
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [flash] = useBillingFlash();

  // Depois de voltar do checkout, recarrega para refletir o novo plano.
  useEffect(() => { if (flash === 'success') reload(); }, [flash]); // eslint-disable-line

  async function upgrade(planId) {
    setBusy(planId); setErr('');
    try {
      const { url } = await billing.checkout(planId);
      window.location.href = url; // fatura do Asaas, ou o checkout simulado
    } catch (e) {
      setErr(e.message || 'Não foi possível iniciar o checkout.');
      setBusy('');
    }
  }

  if (loading) {
    return (
      <div>
        <PageHeader title="Plano e cobrança" subtitle="Sua assinatura, uso e upgrades." />
        <Skeleton className="mb-4 h-24 rounded-xl" />
        <div className="grid gap-3 sm:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-60 rounded-xl" />)}</div>
      </div>
    );
  }
  if (error) return <ErrorState description="Não foi possível carregar o plano." onRetry={reload} />;

  const { plan, usage, catalog, status, renewsAt, canManage, mode, creditos, faixas, cortesia } = data;
  const frac = usage.limit ? usage.screens / usage.limit : 0;
  const tone = frac >= 1 ? 'danger' : frac > 0.8 ? 'warn' : 'accent';
  /*
   * "Cortesia" tem selo próprio de propósito.
   *
   * A conta liberada tem plano Pro DE VERDADE — mesmo limite de telas, mesmo
   * crédito. Sem este rótulo a tela diria "Pro · Ativo", a pessoa acharia que
   * está pagando, e quando a cortesia acabasse a conta encolheria sem que
   * nada tivesse avisado que aquilo era emprestado.
   */
  const statusLabel = cortesia
    ? 'Cortesia'
    : ({ active: 'Ativo', free: 'Grátis', canceled: 'Cancelado', past_due: 'Pagamento pendente' }[status] || status);

  return (
    <div>
      <PageHeader title="Plano e cobrança" subtitle="Sua assinatura, uso e upgrades." />

      {flash === 'success' && (
        <div className="mb-4 flex items-center gap-2 rounded-md border border-ok/30 bg-ok-soft px-3 py-2 text-sm text-ok">
          <Check size={15} /> Assinatura atualizada. Bem-vindo ao novo plano!
        </div>
      )}
      {flash === 'cancel' && (
        <div className="mb-4 rounded-md border border-line bg-surface-2 px-3 py-2 text-sm text-ink-2">Checkout cancelado — nada foi cobrado.</div>
      )}
      {err && <div className="mb-4 rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">{err}</div>}

      {/* Plano atual + uso */}
      <Panel className="mb-5">
        <div className="flex flex-wrap items-center gap-4 p-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-line bg-surface-2 text-accent"><CreditCard size={18} /></div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-ink">Plano {plan.name}</span>
              <Badge tone={cortesia ? 'accent' : status === 'active' ? 'ok' : status === 'canceled' || status === 'past_due' ? 'danger' : 'neutral'}>{statusLabel}</Badge>
            </div>
            <div className="mt-0.5 text-xs text-ink-3">
              {cortesia ? 'Acesso liberado para teste — sem cobrança e sem prazo'
                : plan.sobConsulta ? 'Contrato — preço combinado'
                : usage.mensalidadeCents > 0
                  ? `${brl(usage.mensalidadeCents)}/mês · ${brl(usage.precoTelaCents)} por tela`
                  : 'Sem custo'}
              {usage.descontoVolume > 0 ? ` · −${Math.round(usage.descontoVolume * 100)}% por volume` : ''}
              {renewsAt ? ` · renova em ${new Date(renewsAt).toLocaleDateString('pt-BR')}` : ''}
            </div>
          </div>
          <div className="w-full sm:w-56">
            <div className="flex items-baseline justify-between text-xs">
              <span className="text-ink-2"><b className="tnum text-ink">{usage.screens}</b> de {usage.limit} {usage.limit === 1 ? 'tela' : 'telas'}</span>
              {frac >= 1 && <span className="font-medium text-danger">no limite</span>}
            </div>
            <Progress value={Math.min(100, frac * 100)} tone={tone} className="mt-1.5 h-2" />
          </div>
        </div>
      </Panel>

      {/* Créditos de IA — o saldo e para onde ele foi.
          A frase de baixo não é enfeite: quem esbarra no limite precisa ler,
          antes de qualquer coisa, que a operação dele continua de pé. */}
      {creditos && (
        <Panel className="mb-5">
          <PanelHeader title="Créditos de IA" description="Um crédito é uma imagem gerada. Todo o texto por IA é livre." />
          <div className="flex flex-wrap items-center gap-5 p-4">
            <div>
              <div className="text-2xs font-semibold uppercase tracking-wide text-ink-3">Saldo</div>
              <div className="tnum text-2xl font-bold text-ink">{creditos.saldo.total}</div>
              <div className="text-xs text-ink-3">
                {creditos.saldo.franquia} da franquia
                {/*
                  "comprados" mentia para toda conta nova: os 5 de boas-vindas
                  entram nesse balde de propósito, para não sumirem na primeira
                  virada de ciclo — e a tela dizia "5 comprados" a quem nunca
                  comprou nada. O que os dois têm em comum de verdade é que não
                  expiram, e é isso que a pessoa precisa saber.
                */}
                {creditos.saldo.comprado > 0 ? ` · ${creditos.saldo.comprado} que não expiram` : ''}
              </div>
            </div>
            <div>
              <div className="text-2xs font-semibold uppercase tracking-wide text-ink-3">Franquia do plano</div>
              <div className="tnum text-2xl font-bold text-ink">{creditos.franquiaDoPlano}</div>
              {/*
                Dizia "para 0 telas" em conta sem tela pareada — e mostrava
                franquia de 10 logo acima, porque o cálculo usa `max(1, telas)`.
                O número e a legenda se contradiziam na mesma linha.
              */}
              <div className="text-xs text-ink-3">
                {creditos.telas === 0
                  ? 'por mês, já contando a primeira tela'
                  : `por mês, para ${creditos.telas} ${creditos.telas === 1 ? 'tela' : 'telas'}`}
              </div>
            </div>
            <div>
              <div className="text-2xs font-semibold uppercase tracking-wide text-ink-3">Usado neste ciclo</div>
              <div className="tnum text-2xl font-bold text-ink">{creditos.usoDoCiclo.creditos}</div>
              <div className="text-xs text-ink-3">{creditos.usoDoCiclo.chamadas} chamadas de IA</div>
            </div>
            <div className="ml-auto max-w-xs text-xs text-ink-2">
              <ImageIcon size={14} className="mr-1 inline text-ink-3" />
              Sem crédito, as telas continuam no ar e o editor continua inteiro — o que
              para é gerar imagem nova.
            </div>
          </div>
        </Panel>
      )}

      {/* Faixas de desconto por volume */}
      {/* As faixas aparecem inclusive no plano grátis: quem está avaliando
          precisa ver que crescer sai mais barato por tela. */}
      {faixas && (
        <Panel className="mb-5">
          <PanelHeader title="Desconto por volume" description="Automático, e só sobre as telas daquela faixa." />
          <div className="flex flex-wrap gap-2 p-4">
            {faixas.map((f, i) => {
              const de = i === 0 ? 1 : faixas[i - 1].ate + 1;
              const ativa = usage.screens >= de && (f.ate == null || usage.screens <= f.ate);
              return (
                <div key={i} className={'rounded-lg border px-3 py-2 text-xs ' + (ativa ? 'border-accent bg-accent-soft text-ink' : 'border-line text-ink-2')}>
                  <b className="text-ink">{f.ate == null ? `${de}+` : de === f.ate ? de : `${de}–${f.ate}`}</b> telas
                  <span className="ml-2">{f.desconto > 0 ? `−${Math.round(f.desconto * 100)}%` : 'preço cheio'}</span>
                </div>
              );
            })}
          </div>
        </Panel>
      )}

      {/* Catálogo de planos */}
      <Panel>
        <PanelHeader title="Planos" description={mode === 'dev' ? 'Cobrança em modo simulado — nada é cobrado de verdade (sem ASAAS_API_KEY).' : undefined} />
        <div className="grid gap-3 p-4 sm:grid-cols-3">
          {catalog.map((p) => {
            const isCurrent = p.id === plan.id;
            const isUpgrade = p.sobConsulta || (p.precoTelaCents || 0) > (plan.precoTelaCents || 0);
            return (
              <div key={p.id} className={`relative flex flex-col rounded-xl border p-4 ${isCurrent ? 'border-accent bg-accent-soft/30' : 'border-line bg-surface-2'}`}>
                {p.id === 'pro' && !isCurrent && (
                  <span className="absolute -top-2 right-3 inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-2xs font-semibold text-accent-fg"><Sparkles size={11} /> Popular</span>
                )}
                <div className="text-sm font-semibold text-ink">{p.name}</div>
                <div className="mt-1 text-2xl font-bold tnum text-ink">
                  {p.sobConsulta ? <span className="text-lg">A combinar</span>
                    : p.precoTelaCents > 0 ? brl(p.precoTelaCents) : 'Grátis'}
                  {!p.sobConsulta && p.precoTelaCents > 0 && (
                    <span className="text-sm font-medium text-ink-3">/tela/mês</span>
                  )}
                </div>
                <p className="mt-1 text-xs text-ink-3">{p.blurb}</p>
                <div className="mt-3 space-y-1.5 text-sm text-ink-2">
                  <div className="flex items-center gap-1.5">
                    <MonitorPlay size={15} className="text-ink-3" />
                    {p.sobConsulta ? 'Telas sem limite' : <>Até <b className="text-ink">{p.telasMax}</b> telas</>}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Sparkles size={15} className="text-ink-3" />
                    {p.creditosPorTela > 0
                      ? <><b className="text-ink">{p.creditosPorTela}</b> imagens de IA por tela/mês</>
                      : 'IA para experimentar'}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <HardDrive size={15} className="text-ink-3" />
                    <b className="text-ink">{p.gbPorTela} GB</b> por tela
                  </div>
                </div>
                <div className="mt-4 flex-1" />
                {isCurrent ? (
                  <Button variant="secondary" size="sm" disabled className="w-full justify-center">Plano atual</Button>
                ) : p.sobConsulta ? (
                  /*
                    O Enterprise mostrava "Fazer upgrade" e o clique levava a
                    erro: ele não tem preço de tabela, e o checkout recusa plano
                    sem preço. Preço "a combinar" se resolve conversando, e o
                    botão passa a dizer isso.
                  */
                  <Button variant="secondary" size="sm" className="w-full justify-center"
                    onClick={() => onFalarComVendas && onFalarComVendas()}>
                    Falar com a gente
                  </Button>
                ) : isUpgrade ? (
                  <Button variant="primary" size="sm" disabled={!canManage || busy === p.id} onClick={() => upgrade(p.id)} className="w-full justify-center">
                    {busy === p.id ? 'Redirecionando…' : canManage ? 'Fazer upgrade' : 'Só o dono'}
                  </Button>
                ) : (
                  <Button variant="ghost" size="sm" disabled className="w-full justify-center">Incluído</Button>
                )}
              </div>
            );
          })}
        </div>
      </Panel>

      {/*
        GESTÃO DA ASSINATURA — antes era um botão que não ia a lugar nenhum.

        Ele chamava um "portal" que devolvia `/app?billing=portal`, e o
        roteador manda qualquer `?billing=` de volta para esta mesma tela: a
        pessoa clicava em "Gerenciar assinatura (cartão, cancelamento)" e a
        página recarregava. Não havia como cancelar por lugar nenhum — o que,
        além de produto ruim, é exposição no CDC.

        O Asaas não tem portal hospedado, então a gestão é nossa.
      */}
      {plan.precoTelaCents > 0 && <GestaoDaAssinatura canManage={canManage} onMudou={reload} />}
    </div>
  );
}

function GestaoDaAssinatura({ canManage, onMudou }) {
  const { data, loading, error } = useAsync(billing.assinatura);
  const [confirmando, setConfirmando] = useState(false);
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState('');

  if (loading || error || !data) return null;
  const { assinatura, fatura, simulado } = data;

  async function cancelar() {
    setBusy(true); setErro('');
    try { await billing.cancelar(); setConfirmando(false); onMudou(); }
    catch (e) { setErro(e.message || 'Não foi possível cancelar agora.'); }
    finally { setBusy(false); }
  }

  return (
    <Panel className="mt-5">
      <PanelHeader title="Sua assinatura" description="Cobrança, próxima fatura e cancelamento." />
      <div className="space-y-3 p-4">
        {assinatura && (
          <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 text-sm text-ink-2">
            <span>Valor: <b className="text-ink">{brl(Math.round(assinatura.valor * 100))}</b>/mês</span>
            {assinatura.proximaEm && (
              <span>Próxima cobrança: <b className="text-ink">{new Date(assinatura.proximaEm + 'T12:00:00').toLocaleDateString('pt-BR')}</b></span>
            )}
          </div>
        )}

        {/*
          A fatura em aberto resolve sozinha o caso mais comum de suporte:
          "paguei e não liberou" quase sempre é "gerei o boleto e não paguei".
        */}
        {fatura && (
          <a href={fatura.url} target="_blank" rel="noreferrer"
            className="flex items-center gap-2 rounded-md border border-warn/40 bg-warn/5 px-3 py-2 text-sm text-ink">
            <ExternalLink size={14} className="text-warn" />
            Há uma fatura em aberto de <b>{brl(Math.round(fatura.valor * 100))}</b> — clique para pagar.
          </a>
        )}

        {simulado && (
          <p className="text-xs text-ink-3">Cobrança em modo simulado: não há assinatura de verdade para gerenciar.</p>
        )}

        {erro && <div className="rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">{erro}</div>}

        {!canManage ? (
          <p className="text-xs text-ink-3">Só o dono da conta pode cancelar.</p>
        ) : confirmando ? (
          /*
            A confirmação diz o que ACONTECE, e não "tem certeza?". O que a
            pessoa precisa saber antes de clicar é que as telas continuam no ar
            até o fim do período pago — sem isso, cancelar parece desligar tudo
            agora, e ela liga para o suporte em vez de decidir sozinha.
          */
          <div className="rounded-md border border-line bg-surface-2 p-3">
            <p className="text-sm text-ink">
              Cancelar encerra a renovação. Suas telas continuam no ar até o fim do período já pago,
              e depois a conta volta para o plano Grátis — nada é apagado.
            </p>
            <div className="mt-3 flex gap-2">
              <Button size="sm" variant="danger" disabled={busy} onClick={cancelar}>
                {busy ? 'Cancelando…' : 'Confirmar cancelamento'}
              </Button>
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => setConfirmando(false)}>Voltar</Button>
            </div>
          </div>
        ) : (
          <button onClick={() => setConfirmando(true)}
            className="text-xs font-medium text-ink-3 underline-offset-2 hover:text-ink hover:underline">
            Cancelar assinatura
          </button>
        )}
      </div>
    </Panel>
  );
}
