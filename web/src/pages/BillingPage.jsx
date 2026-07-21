import React, { useEffect, useState } from 'react';
import { CreditCard, Check, MonitorPlay, Sparkles, ExternalLink } from 'lucide-react';
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

export function BillingPage() {
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
      window.location.href = url; // vai pro checkout (Stripe ou simulado)
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

  const { plan, usage, catalog, status, renewsAt, canManage, mode } = data;
  const frac = usage.limit ? usage.screens / usage.limit : 0;
  const tone = frac >= 1 ? 'danger' : frac > 0.8 ? 'warn' : 'accent';
  const statusLabel = { active: 'Ativo', free: 'Grátis', canceled: 'Cancelado', past_due: 'Pagamento pendente' }[status] || status;

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
              <Badge tone={status === 'active' ? 'ok' : status === 'canceled' || status === 'past_due' ? 'danger' : 'neutral'}>{statusLabel}</Badge>
            </div>
            <div className="mt-0.5 text-xs text-ink-3">
              {plan.priceCents > 0 ? `${brl(plan.priceCents)}/mês` : 'Sem custo'}
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

      {/* Catálogo de planos */}
      <Panel>
        <PanelHeader title="Planos" description={mode === 'dev' ? 'Cobrança em modo simulado (sem Stripe configurado).' : undefined} />
        <div className="grid gap-3 p-4 sm:grid-cols-3">
          {catalog.map((p) => {
            const isCurrent = p.id === plan.id;
            const isUpgrade = p.priceCents > plan.priceCents;
            return (
              <div key={p.id} className={`relative flex flex-col rounded-xl border p-4 ${isCurrent ? 'border-accent bg-accent-soft/30' : 'border-line bg-surface-2'}`}>
                {p.id === 'pro' && !isCurrent && (
                  <span className="absolute -top-2 right-3 inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-2xs font-semibold text-accent-fg"><Sparkles size={11} /> Popular</span>
                )}
                <div className="text-sm font-semibold text-ink">{p.name}</div>
                <div className="mt-1 text-2xl font-bold tnum text-ink">
                  {p.priceCents > 0 ? brl(p.priceCents) : 'Grátis'}
                  {p.priceCents > 0 && <span className="text-sm font-medium text-ink-3">/mês</span>}
                </div>
                <p className="mt-1 text-xs text-ink-3">{p.blurb}</p>
                <div className="mt-3 flex items-center gap-1.5 text-sm text-ink-2">
                  <MonitorPlay size={15} className="text-ink-3" />
                  Até <b className="text-ink">{p.screens}</b> {p.screens === 1 ? 'tela' : 'telas'}
                </div>
                <div className="mt-4 flex-1" />
                {isCurrent ? (
                  <Button variant="secondary" size="sm" disabled className="w-full justify-center">Plano atual</Button>
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
        {plan.priceCents > 0 && canManage && mode === 'stripe' && (
          <div className="border-t border-line px-4 py-3">
            <button onClick={() => billing.portal().then(({ url }) => (window.location.href = url)).catch(() => {})}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-2 hover:text-ink">
              Gerenciar assinatura (cartão, cancelamento) <ExternalLink size={12} />
            </button>
          </div>
        )}
      </Panel>
    </div>
  );
}
