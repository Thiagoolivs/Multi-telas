import React, { useEffect, useState } from 'react';
import { CreditCard, Check, MonitorPlay, Sparkles, ExternalLink, HardDrive, Image as ImageIcon, ShieldCheck, CalendarCheck } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader.jsx';
import { Panel, PanelHeader } from '../components/ui/Panel.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Badge } from '../components/ui/Badge.jsx';
import { Progress, Skeleton, ErrorState } from '../components/ui/Feedback.jsx';
import { useAsync } from '../lib/useAsync.js';
import { billing } from '../api.js';

/*
 * PLANO E COBRANÇA — em português de lojista (EXECUTOR, item 11).
 *
 * O cliente vê CRIAÇÕES, e não créditos, franquia ou ciclo ("faltam 32
 * criações este mês"). Os números vêm todos do servidor (server/plans.js):
 * esta página não refaz conta de preço, só mostra.
 */
function brl(cents) {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0, maximumFractionDigits: 2 });
}
const data = (ms) => new Date(ms).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
const plural = (n, um, varios) => n + ' ' + (n === 1 ? um : varios);

// Banner de retorno do checkout (?billing=success|cancel), limpo da URL após ler.
function useBillingFlash() {
  const [flash, setFlash] = useState(() => new URLSearchParams(window.location.search).get('billing'));
  useEffect(() => {
    if (flash) {
      const url = new URL(window.location.href);
      url.searchParams.delete('billing');
      window.history.replaceState(window.history.state, '', url.pathname + url.search);
    }
  }, [flash]);
  return [flash, () => setFlash(null)];
}

export function BillingPage({ onFalarComVendas }) {
  const { data: d, loading, error, reload } = useAsync(billing.get);
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

  // Pacote de criações: vai para a fatura do Asaas; em modo simulado entra na hora.
  async function comprarPacote(id) {
    setBusy(id); setErr('');
    try {
      const r = await billing.pacote(id);
      if (r.url) { window.location.href = r.url; return; }
      reload(); setBusy('');
    } catch (e) {
      setErr(e.message || 'Não foi possível abrir a compra.');
      setBusy('');
    }
  }

  if (loading) {
    return (
      <div>
        <PageHeader title="Plano e cobrança" subtitle="O que você paga, o que está incluído e as suas criações." />
        <Skeleton className="mb-4 h-24 rounded-xl" />
        <div className="grid gap-3 sm:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-60 rounded-xl" />)}</div>
      </div>
    );
  }
  if (error) return <ErrorState description="Não foi possível carregar o plano." onRetry={reload} />;

  const { plan, usage, catalog, status, renewsAt, canManage, mode, creditos, cortesia, atraso, pacotes, teste, contrato, anual, ia } = d;
  const pago = plan.precoTelaCents > 0 || plan.sobConsulta;
  const frac = usage.limit ? usage.screens / usage.limit : 0;
  // Usar todas as telas do plano é o uso normal; vermelho só quando passa do limite.
  const tone = frac > 1 ? 'danger' : 'accent';
  /*
   * "Cortesia" tem selo próprio de propósito: a conta liberada tem plano Pro
   * DE VERDADE, e sem o rótulo a pessoa acharia que está pagando.
   */
  const statusLabel = cortesia
    ? 'Cortesia'
    : ({ active: 'Em dia', free: teste && !teste.ativo ? 'Versão gratuita' : 'Teste', canceled: 'Cancelado', past_due: 'Fatura em atraso', estornado: 'Estornado', chargeback: 'Contestado' }[status] || status);
  const anualMenor = anual && anual.anualCents < anual.mensalCents;

  return (
    <div>
      <PageHeader title="Plano e cobrança" subtitle="O que você paga, o que está incluído e as suas criações." />

      {flash === 'success' && (
        <div className="mb-4 flex items-center gap-2 rounded-md border border-ok/30 bg-ok-soft px-3 py-2 text-sm text-ok">
          <Check size={15} /> Assinatura atualizada. Bem-vindo ao novo plano!
        </div>
      )}
      {flash === 'cancel' && (
        <div className="mb-4 rounded-md border border-line bg-surface-2 px-3 py-2 text-sm text-ink-2">Checkout cancelado — nada foi cobrado.</div>
      )}
      {err && <div className="mb-4 rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">{err}</div>}

      {/*
        Fatura em atraso (PLANO §6.6). Avisa desde o primeiro dia, com o que
        acontece e quando. A primeira frase é sempre a mesma: a tela continua.
      */}
      {atraso && (
        <div className={'mb-4 rounded-md border px-3 py-2 text-sm ' + (atraso.bloqueado
          ? 'border-danger/30 bg-danger-soft text-danger'
          : 'border-warn/30 bg-warn-soft text-warn')}>
          <b>Há uma fatura em atraso{atraso.diasEmAtraso > 0 ? ' há ' + plural(atraso.diasEmAtraso, 'dia', 'dias') : ''}.</b> Suas telas continuam no ar.{' '}
          {atraso.bloqueado
            ? 'Criar com IA e ligar telas novas estão pausados até o pagamento, e as TVs mostram o selo do MultiTelas no canto.'
            : atraso.selo
              ? `As TVs estão mostrando um pequeno selo do MultiTelas no canto. Em ${plural(atraso.diasAteBloquear, 'dia', 'dias')}, criar com IA e ligar telas novas ficam pausados.`
              : `Em ${plural(atraso.diasAteSelo, 'dia', 'dias')}, as TVs passam a mostrar um pequeno selo do MultiTelas no canto; em ${plural(atraso.diasAteBloquear, 'dia', 'dias')}, criar com IA e ligar telas novas ficam pausados.`}
          {' '}Pagou, tudo volta na hora. A fatura está em "Sua assinatura", logo abaixo.
        </div>
      )}

      {/* O plano de hoje: quanto custa e quantas telas */}
      <Panel className="mb-5">
        <div className="flex flex-wrap items-center gap-4 p-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-line bg-surface-2 text-accent"><CreditCard size={18} /></div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-ink">{pago ? 'Plano ' + plan.name : 'Teste grátis'}</span>
              <Badge tone={cortesia ? 'accent' : status === 'active' ? 'ok' : status === 'canceled' || status === 'past_due' ? 'danger' : 'neutral'}>{statusLabel}</Badge>
              {pago && !plan.sobConsulta && !cortesia && <Badge tone="neutral">{contrato === 'anual' ? 'Contrato anual' : 'Mensal, sem contrato'}</Badge>}
            </div>
            <div className="mt-0.5 text-xs text-ink-3">
              {cortesia ? 'Acesso liberado para teste — sem cobrança e sem prazo'
                : plan.sobConsulta ? 'Contrato — preço combinado'
                : usage.mensalidadeCents > 0
                  ? `Você paga ${brl(usage.mensalidadeCents)} por mês · ${plural(Math.max(1, usage.screens), 'tela', 'telas')}${usage.screens > 1 ? ', ' + brl(usage.precoTelaCents) + ' cada em média' : ''}`
                  /* O plano grátis é o TESTE de 14 dias: dizer "sem custo" escondia o prazo. */
                  : teste && teste.ativo
                    ? `${teste.restam === 1 ? 'Último dia' : 'Faltam ' + teste.restam + ' dias'} de teste · sem cartão`
                    : teste
                      ? 'O teste acabou · a tela segue no ar com o selo "versão gratuita"'
                      : 'Sem custo'}
              {renewsAt ? ` · próxima cobrança em ${new Date(renewsAt).toLocaleDateString('pt-BR')}` : ''}
            </div>
          </div>
          <div className="w-full sm:w-56">
            <div className="flex items-baseline justify-between text-xs">
              <span className="text-ink-2"><b className="tnum text-ink">{usage.screens}</b> de {plural(usage.limit, 'tela', 'telas')}</span>
              {frac > 1
                ? <span className="font-medium text-danger">acima do limite</span>
                : frac === 1 && <span className="text-ink-3">todas em uso</span>}
            </div>
            <Progress value={Math.min(100, frac * 100)} tone={tone} className="mt-1.5 h-2" />
            {pago && usage.proximaTelaCents > 0 && (
              <div className="mt-1 text-2xs text-ink-3">Mais uma tela: + {brl(usage.proximaTelaCents)} por mês</div>
            )}
          </div>
        </div>
      </Panel>

      {/*
        CRIAÇÕES COM IA — quantas faltam, e para onde foram. A frase de baixo
        não é enfeite: quem esbarra no fim precisa ler, antes de tudo, que a
        loja continua de pé.
      */}
      {creditos && (
        <Panel className="mb-5">
          <PanelHeader title="Criações com IA"
            description="Uma criação é uma imagem feita pela IA: a foto, o fundo, a ilustração. Os textos e as peças sem foto não contam." />
          <div className="flex flex-wrap items-center gap-6 p-4">
            <div>
              <div className="tnum text-3xl font-bold text-ink">{creditos.saldo.total}</div>
              <div className="text-xs text-ink-2">
                {creditos.saldo.total === 1 ? 'criação disponível' : 'criações disponíveis'}{pago ? ' este mês' : teste && teste.ativo ? ' no teste' : ''}
              </div>
              {/*
                O balde que não vence tem pacote comprado E as boas-vindas das
                contas antigas (5, de antes do teste com 20 criações): "comprado"
                mentiria para quem nunca comprou. O que os dois têm em comum é
                não vencer, e é isso que a pessoa precisa saber.
              */}
              {!pago && teste && teste.ativo && creditos.saldo.franquia > 0 && (
                <div className="text-2xs text-ink-3">as do teste valem até {data(teste.terminaEm)}</div>
              )}
              {creditos.saldo.comprado > 0 && (
                <div className="text-2xs text-ink-3">{creditos.saldo.comprado} {creditos.saldo.comprado === 1 ? 'delas não vence' : 'delas não vencem'}</div>
              )}
            </div>
            <div>
              <div className="tnum text-3xl font-bold text-ink">{creditos.usoDoCiclo.creditos}</div>
              <div className="text-xs text-ink-2">{creditos.usoDoCiclo.creditos === 1 ? 'criação feita' : 'criações feitas'} {pago ? 'este mês' : 'até agora'}</div>
            </div>
            <div>
              {pago ? (
                <>
                  <div className="tnum text-3xl font-bold text-ink">{creditos.franquiaDoPlano}</div>
                  <div className="text-xs text-ink-2">por mês no seu plano</div>
                  <div className="text-2xs text-ink-3">renova em {data(creditos.renovaEm)}</div>
                </>
              ) : (
                <>
                  <div className="tnum text-3xl font-bold text-ink">{ia.criacoesDoPlano}</div>
                  <div className="text-xs text-ink-2">por mês, assinando</div>
                </>
              )}
            </div>
            <div className="max-w-xs text-xs text-ink-2 sm:ml-auto">
              <ImageIcon size={14} className="mr-1 inline text-ink-3" />
              Acabaram? Suas telas continuam no ar, e você segue com os modelos prontos,
              o banco de imagens e as suas fotos.
            </div>
          </div>
          {/* Pacotes avulsos: não vencem e só são usados depois das do mês —
              dito aqui, porque é a dúvida de quem vai pagar. */}
          {canManage && pacotes && pacotes.length > 0 && (
            <div className="border-t border-line p-4">
              <div className="mb-2 text-xs text-ink-2">
                Precisa de mais? Pacotes de criações <b>não vencem</b> e só são usados depois das do mês.
              </div>
              <div className="flex flex-wrap gap-2">
                {pacotes.map((p) => (
                  <Button key={p.id} size="sm" variant="secondary" disabled={!!busy || (atraso && atraso.bloqueado)}
                    onClick={() => comprarPacote(p.id)}>
                    {busy === p.id ? 'Abrindo…' : `+${p.creditos} criações · ${brl(p.precoCents)}`}
                  </Button>
                ))}
              </div>
            </div>
          )}
        </Panel>
      )}

      {/*
        MENSAL OU ANUAL (PLANO §6.1), para as telas DESTA conta. O anual nasce
        numa conversa (o termo do contrato é assinado com a equipe), por isso
        o botão é "falar com a gente" e não um checkout.
      */}
      {anual && !plan.sobConsulta && !cortesia && (
        <Panel className="mb-5">
          <PanelHeader title="Mensal ou anual"
            description={`Para ${plural(Math.max(1, usage.screens), 'tela', 'telas')}, por mês.`} />
          <div className="grid gap-3 p-4 sm:grid-cols-2">
            <div className={'rounded-xl border p-4 ' + (pago && contrato !== 'anual' ? 'border-accent bg-accent-soft/30' : 'border-line bg-surface-2')}>
              <div className="text-sm font-semibold text-ink">Mensal</div>
              <div className="mt-1 text-2xl font-bold tnum text-ink">{brl(anual.mensalCents)}<span className="text-sm font-medium text-ink-3">/mês</span></div>
              <p className="mt-1 text-xs text-ink-3">R$ 149 por tela. Sem contrato: cancela quando quiser.</p>
            </div>
            <div className={'rounded-xl border p-4 ' + (contrato === 'anual' ? 'border-accent bg-accent-soft/30' : 'border-line bg-surface-2')}>
              <div className="flex items-center gap-2 text-sm font-semibold text-ink">Anual <Badge tone="accent">contrato de {anual.meses} meses</Badge></div>
              <div className="mt-1 text-2xl font-bold tnum text-ink">
                {usage.screens >= anual.telasNegociadas ? <span className="text-lg">A combinar</span> : <>{brl(anual.anualCents)}<span className="text-sm font-medium text-ink-3">/mês</span></>}
              </div>
              {anualMenor && usage.screens < anual.telasNegociadas && (
                <p className="mt-1 text-xs font-medium text-ok">Economia de {brl(anual.mensalCents - anual.anualCents)} por mês ({brl((anual.mensalCents - anual.anualCents) * 12)} no ano)</p>
              )}
              <ul className="mt-2 space-y-0.5 text-xs text-ink-2">
                {anual.faixas.map((f) => (
                  <li key={f.de} className="flex justify-between gap-2">
                    <span>{f.ate == null ? `da ${f.de}ª tela em diante` : f.de === 1 ? `até ${f.ate} telas` : `da ${f.de}ª à ${f.ate}ª`}</span>
                    <b className="tnum text-ink">{f.negociado ? 'a combinar' : brl(f.precoTelaCents) + ' cada'}</b>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-2xs text-ink-3">
                Cancelar antes dos 12 meses tem multa: 30% do que falta pagar, ou o desconto que você recebeu, o que for maior.
              </p>
              {contrato !== 'anual' && (
                <Button size="sm" variant="secondary" className="mt-3 w-full justify-center" onClick={() => onFalarComVendas && onFalarComVendas()}>
                  Quero o anual — falar com a gente
                </Button>
              )}
            </div>
          </div>
        </Panel>
      )}

      {/* Os planos */}
      <Panel>
        <PanelHeader title="Planos" description={mode === 'dev' ? 'Cobrança em modo simulado — nada é cobrado de verdade (sem ASAAS_API_KEY).' : undefined} />
        <div className="grid gap-3 p-4 sm:grid-cols-3">
          {catalog.map((p) => {
            const isCurrent = p.id === plan.id;
            const isUpgrade = p.sobConsulta || (p.precoTelaCents || 0) > (plan.precoTelaCents || 0);
            const gratis = !p.sobConsulta && !p.precoTelaCents;
            return (
              <div key={p.id} className={`relative flex flex-col rounded-xl border p-4 ${isCurrent ? 'border-accent bg-accent-soft/30' : 'border-line bg-surface-2'}`}>
                {p.id === 'pro' && !isCurrent && (
                  <span className="absolute -top-2 right-3 inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-2xs font-semibold text-accent-fg"><Sparkles size={11} /> Popular</span>
                )}
                <div className="text-sm font-semibold text-ink">{gratis ? 'Teste' : p.name}</div>
                <div className="mt-1 text-2xl font-bold tnum text-ink">
                  {p.sobConsulta ? <span className="text-lg">A combinar</span>
                    : p.precoTelaCents > 0 ? brl(p.precoTelaCents) : (teste ? teste.dias : 14) + ' dias'}
                  {!p.sobConsulta && p.precoTelaCents > 0 && (
                    <span className="text-sm font-medium text-ink-3">/tela/mês</span>
                  )}
                </div>
                <p className="mt-1 text-xs text-ink-3">{gratis ? 'Grátis, sem cartão. Depois, a tela segue no ar com um selo.' : p.blurb}</p>
                <div className="mt-3 space-y-1.5 text-sm text-ink-2">
                  <div className="flex items-center gap-1.5">
                    <MonitorPlay size={15} className="shrink-0 text-ink-3" />
                    {p.sobConsulta ? 'Telas sem limite' : p.telasMax === 1 ? '1 tela' : <>Até <b className="text-ink">{p.telasMax}</b> telas</>}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Sparkles size={15} className="shrink-0 text-ink-3" />
                    {gratis
                      ? <><b className="text-ink">{teste ? teste.criacoes : 20}</b>&nbsp;criações com IA no teste</>
                      : <span><b className="text-ink">{ia.ate3Telas}</b> criações por mês até 3 telas, mais com mais telas (até {ia.maximo})</span>}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <HardDrive size={15} className="shrink-0 text-ink-3" />
                    <span><b className="text-ink">{String(p.gbPorTela).replace('.', ',')} GB</b> para fotos e vídeos{gratis ? '' : ', por tela'}</span>
                  </div>
                </div>
                <div className="mt-4 flex-1" />
                {isCurrent ? (
                  <Button variant="secondary" size="sm" disabled className="w-full justify-center">Seu plano</Button>
                ) : p.sobConsulta ? (
                  // Sem preço de tabela: o checkout recusaria. Preço "a combinar" se resolve conversando.
                  <Button variant="secondary" size="sm" className="w-full justify-center"
                    onClick={() => onFalarComVendas && onFalarComVendas()}>
                    Falar com a gente
                  </Button>
                ) : isUpgrade ? (
                  <Button variant="primary" size="sm" disabled={!canManage || busy === p.id} onClick={() => upgrade(p.id)} className="w-full justify-center">
                    {busy === p.id ? 'Abrindo…' : canManage ? 'Assinar (mensal)' : 'Só o dono assina'}
                  </Button>
                ) : (
                  <Button variant="ghost" size="sm" disabled className="w-full justify-center">Incluído</Button>
                )}
              </div>
            );
          })}
        </div>
      </Panel>

      {/* O que nunca muda, dito com todas as letras (PLANO §6.6 e §6.7). */}
      <Panel className="mt-5">
        <div className="grid gap-3 p-4 text-xs text-ink-2 sm:grid-cols-2">
          <div className="flex items-start gap-2">
            <ShieldCheck size={16} className="mt-0.5 shrink-0 text-ok" />
            <span><b className="text-ink">Nunca desligamos sua tela por causa de fatura.</b> Atrasou: avisamos com 3 dias;
              com 10, as TVs mostram um pequeno selo do MultiTelas no canto; com 20, criar com IA e ligar telas novas
              ficam pausados. Pagou, tudo volta na hora.</span>
          </div>
          <div className="flex items-start gap-2">
            <CalendarCheck size={16} className="mt-0.5 shrink-0 text-ink-3" />
            <span><b className="text-ink">A tela nova entra na próxima fatura.</b> Ligou ou tirou uma tela, o valor do
              mês seguinte acompanha sozinho — sem cobrança no meio do mês.</span>
          </div>
        </div>
      </Panel>

      {/*
        GESTÃO DA ASSINATURA — o Asaas não tem portal hospedado, então a
        gestão é nossa (cancelar tem que ser possível daqui: CDC).
      */}
      {plan.precoTelaCents > 0 && <GestaoDaAssinatura canManage={canManage} onMudou={reload} contrato={contrato} multa={anual && anual.multa} />}
    </div>
  );
}

function GestaoDaAssinatura({ canManage, onMudou, contrato, multa }) {
  const { data: d, loading, error } = useAsync(billing.assinatura);
  const [confirmando, setConfirmando] = useState(false);
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState('');

  if (loading || error || !d) return null;
  const { assinatura, fatura, simulado } = d;

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

        {/* "Paguei e não liberou" quase sempre é "gerei o boleto e não paguei": o link resolve. */}
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
            A confirmação diz o que ACONTECE, e não "tem certeza?": as telas
            continuam no ar até o fim do período pago. No anual, a multa vem
            em número, antes do clique.
          */
          <div className="rounded-md border border-line bg-surface-2 p-3">
            <p className="text-sm text-ink">
              Cancelar encerra a renovação. Suas telas continuam no ar até o fim do período já pago,
              e depois a conta volta para a versão gratuita, com o selo — nada é apagado.
            </p>
            {contrato === 'anual' && multa && multa.cents > 0 && (
              <p className="mt-2 text-sm text-ink">
                Seu contrato é anual e faltam {plural(multa.faltam, 'mês', 'meses')}: pelo contrato, a multa fica em <b>{brl(multa.cents)}</b>.
                A equipe confirma o valor com você antes de cobrar.
              </p>
            )}
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
