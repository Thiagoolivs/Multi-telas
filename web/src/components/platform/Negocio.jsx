import React, { useState } from 'react';
import { RotateCw } from 'lucide-react';
import {
  MonitorPlay, MonitorOff, Moon, Wallet, AlertTriangle, CalendarClock, TrendingDown,
  Filter, DatabaseBackup, Bug, Cpu, Radio, Target,
} from 'lucide-react';
import { Panel, PanelHeader } from '../ui/Panel.jsx';
import { Stat } from '../ui/Stat.jsx';
import { Badge } from '../ui/Badge.jsx';
import { Progress, Spinner, ErrorState } from '../ui/Feedback.jsx';
import { Table, THead, TBody, TH, TR, TD } from '../ui/Table.jsx';
import { useAsync } from '../../lib/useAsync.js';
import { plataforma } from '../../api.js';
import { formatNumber, relativeTime } from '../../lib/format.js';
import { aviso } from '../../lib/avisos.js';

/*
 * O NEGÓCIO, no painel do operador (PLANO §7.2, EXECUTOR item 13).
 *
 * A pergunta de todo dia: alguma tela de cliente está apagada, alguém está
 * devendo, e o negócio está crescendo? Na ordem do que importa: frota,
 * clientes, receita, funil, custo de IA, saúde. Os números vêm prontos do
 * servidor (server/admin.js); aqui só se desenha.
 */
const brl = (c) => (c == null ? '—' : (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }));
const data = (ms) => (ms ? new Date(ms).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—');
// A meta do PLANO §7.2: 100 telas no ar até o meio de 2027.
const META_TELAS = 100;

export function Negocio({ dias }) {
  const { data: d, loading, error, reload } = useAsync(() => plataforma.negocio(dias), [dias]);
  if (loading && !d) return <Panel><div className="p-8 text-center"><Spinner size={20} /></div></Panel>;
  if (error) return <ErrorState description={error.message} onRetry={reload} />;
  if (!d) return null;
  return (
    <div className="space-y-4">
      <Frota frota={d.frota} />
      <Clientes clientes={d.clientes} />
      <Receita receita={d.receita} dias={d.dias} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Funil funil={d.funil} />
        <Saude saude={d.saude} />
      </div>
      <CustoIa itens={d.custoIa} />
    </div>
  );
}

function Frota({ frota }) {
  const [todas, setTodas] = useState(false);
  const noAr = frota.filter((t) => t.online).length;
  const apagadas = frota.filter((t) => !t.online && !t.foraDoExpediente);
  const dormindo = frota.filter((t) => !t.online && t.foraDoExpediente).length;
  const lista = todas ? frota : frota.slice(0, 25);
  return (
    <Panel>
      <PanelHeader title="Frota" description="Todas as telas, da que está apagada há mais tempo para a que está no ar." />
      <div className="grid gap-3 border-b border-line p-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Apagadas agora" value={formatNumber(apagadas.length)} icon={MonitorOff}
          hint={apagadas.length ? 'a mais antiga ' + (apagadas[0].ultimoSinal ? relativeTime(apagadas[0].ultimoSinal) : 'nunca deu sinal') : 'nenhuma'} />
        <Stat label="No ar" value={formatNumber(noAr)} icon={MonitorPlay} hint={`de ${formatNumber(frota.length)} pareadas`} />
        <Stat label="Fora do expediente" value={formatNumber(dormindo)} icon={Moon} hint="TV desligada no horário escolhido pelo dono" />
        <Stat label="Meta: telas no ar" value={formatNumber(noAr)} unit={'/ ' + META_TELAS} icon={Target}
          footer={<Progress value={Math.min(100, (noAr / META_TELAS) * 100)} className="h-1.5" />} hint="até o meio de 2027" />
      </div>
      <Table>
        <THead><TH>Tela</TH><TH>Conta</TH><TH>Último sinal</TH><TH>Aparelho</TH><TH>Situação</TH><TH /></THead>
        <TBody>
          {lista.map((t) => (
            <TR key={t.id}>
              <TD className="font-medium text-ink">{t.nome}</TD>
              <TD>{t.conta}</TD>
              <TD className="whitespace-nowrap">{t.ultimoSinal ? relativeTime(t.ultimoSinal) : 'nunca deu sinal'}</TD>
              <TD className="whitespace-nowrap text-ink-3">{t.aparelho || '—'}</TD>
              <TD>
                {t.online ? <Badge tone="ok">no ar</Badge>
                  : t.foraDoExpediente ? <Badge tone="neutral">fora do expediente</Badge>
                    : <Badge tone="danger">apagada</Badge>}
              </TD>
              <TD><Recarregar id={t.id} /></TD>
            </TR>
          ))}
        </TBody>
      </Table>
      {frota.length > 25 && (
        <div className="border-t border-line p-3 text-center">
          <button type="button" className="text-xs font-medium text-accent hover:underline" onClick={() => setTodas(!todas)}>
            {todas ? 'Mostrar só as 25 primeiras' : `Mostrar todas as ${frota.length}`}
          </button>
        </div>
      )}
    </Panel>
  );
}

/*
 * Recarregar a TV de qualquer conta: o mesmo comando do botão do cliente.
 * TV sem o tempo real recebe no próximo pulso (até 30 s); desligada, quando
 * voltar.
 */
function Recarregar({ id }) {
  const [estado, setEstado] = useState('');
  async function ir() {
    setEstado('indo');
    try {
      const r = await plataforma.recarregarTela(id);
      setEstado('ok');
      aviso.ok(r.aoVivo ? 'A TV recebeu o comando agora.' : 'A TV recebe o comando no próximo pulso.');
    } catch (e) { setEstado(''); aviso.erro('recarregar', e.message || 'Não deu para mandar.'); }
  }
  return (
    <button type="button" onClick={ir} disabled={estado === 'indo'} title="Recarregar a TV" aria-label="Recarregar a TV"
      className={'rounded-md p-1 transition hover:bg-surface-2 ' + (estado === 'ok' ? 'text-ok' : 'text-ink-3 hover:text-ink')}>
      <RotateCw size={14} />
    </button>
  );
}

function Clientes({ clientes }) {
  return (
    <Panel>
      <PanelHeader title="Clientes" description="Quem não está no grátis: plano, telas, contrato e pagamento." />
      {clientes.length === 0 ? <p className="p-4 text-sm text-ink-3">Nenhuma conta paga ainda.</p> : (
        <Table>
          <THead><TH>Conta</TH><TH>Plano</TH><TH align="right">Telas</TH><TH>Contrato</TH><TH>Pagamento</TH><TH align="right">Por mês</TH></THead>
          <TBody>
            {clientes.map((c) => (
              <TR key={c.id}>
                <TD><div className="font-medium text-ink">{c.nome}</div><div className="text-2xs text-ink-3">{c.email}</div></TD>
                <TD className="capitalize">{c.plano}</TD>
                <TD align="right" className="tnum">{c.telas}</TD>
                <TD className="whitespace-nowrap">
                  {c.contrato === 'anual'
                    ? <><div>Anual desde {data(c.contratoDesde)}</div>
                      <div className="text-2xs text-ink-3">fidelidade até {data(c.fidelidadeAte)} · multa hoje {brl(c.multaHojeCents)}</div></>
                    : 'Mensal'}
                </TD>
                <TD className="whitespace-nowrap">
                  {c.cortesia ? <Badge tone="accent">cortesia</Badge>
                    : c.atraso ? <Badge tone={c.atraso.bloqueado ? 'danger' : 'warn'}>{c.atraso.dias} {c.atraso.dias === 1 ? 'dia' : 'dias'} em atraso</Badge>
                      : c.status === 'active' ? <span className="text-xs text-ink-2">em dia{c.renovaEm ? ' · vence ' + data(c.renovaEm) : ''}</span>
                        : <Badge tone="neutral">{c.status || '—'}</Badge>}
                </TD>
                <TD align="right" className="tnum">{c.cortesia ? '—' : c.mensalidadeCents == null ? 'contrato' : brl(c.mensalidadeCents)}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </Panel>
  );
}

function Receita({ receita: r, dias }) {
  return (
    <Panel>
      <PanelHeader title="Receita" description="O que entra todo mês, quem está devendo e o que vence nesta semana." />
      <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Receita recorrente (MRR)" value={brl(r.mrrCents)} icon={Wallet}
          hint={`${r.pagantes} ${r.pagantes === 1 ? 'conta pagante' : 'contas pagantes'} · ${r.telasPagas} telas${r.anuais ? ' · ' + r.anuais + ' no anual' : ''}${r.enterprise ? ' · ' + r.enterprise + ' Enterprise à parte' : ''}`} />
        <Stat label="Inadimplentes" value={formatNumber(r.inadimplentes.length)} icon={AlertTriangle}
          hint={r.inadimplentes.length ? brl(r.devendoCents) + ' por mês em atraso' : 'ninguém devendo'} />
        <Stat label="Cancelamentos" value={formatNumber(r.cancelamentos)} icon={TrendingDown} hint={`nos últimos ${dias} dias`} />
        <Stat label="Vencem em 7 dias" value={formatNumber(r.proximosVencimentos.length)} icon={CalendarClock}
          hint={r.proximosVencimentos.length ? brl(r.proximosVencimentos.reduce((s, x) => s + (x.mensalidadeCents || 0), 0)) : '—'} />
      </div>
      {(r.inadimplentes.length > 0 || r.proximosVencimentos.length > 0) && (
        <div className="grid gap-4 border-t border-line p-4 text-sm sm:grid-cols-2">
          <div>
            <div className="mb-1 text-xs font-semibold text-ink-2">Em atraso</div>
            {r.inadimplentes.length === 0 ? <p className="text-xs text-ink-3">Ninguém.</p> : r.inadimplentes.map((x) => (
              <div key={x.id} className="flex justify-between gap-2 py-0.5"><span className="truncate">{x.nome}</span>
                <span className="tnum whitespace-nowrap text-ink-3">{x.dias} d · {brl(x.mensalidadeCents)}</span></div>
            ))}
          </div>
          <div>
            <div className="mb-1 text-xs font-semibold text-ink-2">Próximos vencimentos</div>
            {r.proximosVencimentos.length === 0 ? <p className="text-xs text-ink-3">Nada nesta semana.</p> : r.proximosVencimentos.map((x) => (
              <div key={x.id} className="flex justify-between gap-2 py-0.5"><span className="truncate">{x.nome}</span>
                <span className="tnum whitespace-nowrap text-ink-3">{data(x.em)} · {brl(x.mensalidadeCents)}</span></div>
            ))}
          </div>
        </div>
      )}
    </Panel>
  );
}

function Funil({ funil: f }) {
  const pct = (a, b) => (b ? Math.round((a / b) * 100) + '%' : '—');
  return (
    <Panel>
      <PanelHeader title="Funil" description="Por semana de cadastro, nas últimas 12: cadastrou → ligou uma TV → paga." />
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 border-b border-line px-4 py-3 text-sm">
        <span><Filter size={14} className="mr-1 inline text-ink-3" /><b className="tnum text-ink">{f.total.cadastros}</b> cadastros</span>
        <span><b className="tnum text-ink">{f.total.ligaramTela}</b> ligaram a TV ({pct(f.total.ligaramTela, f.total.cadastros)})</span>
        <span><b className="tnum text-ink">{f.total.pagos}</b> pagam</span>
        <span className="text-ink-2">do teste para cliente: <b className="text-ink">{Math.round(f.conversaoDoTeste * 100)}%</b></span>
      </div>
      <Table>
        <THead><TH>Semana</TH><TH align="right">Cadastros</TH><TH align="right">Ligaram a TV</TH><TH align="right">Pagam</TH></THead>
        <TBody>
          {f.porSemana.map((s) => (
            <TR key={s.semana}>
              <TD>de {new Date(s.semana).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'UTC' })}</TD>
              <TD align="right" className="tnum">{s.cadastros}</TD>
              <TD align="right" className="tnum">{s.ligaramTela} <span className="text-ink-3">({pct(s.ligaramTela, s.cadastros)})</span></TD>
              <TD align="right" className="tnum">{s.pagos}</TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </Panel>
  );
}

function Saude({ saude: s }) {
  const b = s.backup || {};
  return (
    <Panel>
      <PanelHeader title="Saúde" description="Backup, erros, trabalhos de IA e conexões das TVs." />
      <div className="space-y-3 p-4 text-sm">
        <Linha icon={DatabaseBackup} titulo="Último backup">
          {!b.disponivel ? <span className="text-ink-3">{b.motivo || 'sem informação'}</span>
            : b.erro && !b.dia ? <span className="text-danger">{b.erro}</span>
              : !b.dia ? <span className="text-warn">nenhum backup no bucket</span>
                : <span className={b.ok ? 'text-ok' : 'text-danger'}>
                    {b.dia} · {b.ok ? (b.restaurado ? 'feito e restaurado para conferir' : 'feito') : 'FALHOU' + (b.erro ? ': ' + b.erro : '')}
                  </span>}
        </Linha>
        <Linha icon={Bug} titulo="Erros nas últimas 24 h">
          <span className={s.erros24h.vezes ? 'text-warn' : 'text-ok'}>
            {s.erros24h.vezes ? `${s.erros24h.vezes} vezes, ${s.erros24h.grupos} ${s.erros24h.grupos === 1 ? 'tipo' : 'tipos'} (detalhe em "Erros", abaixo)` : 'nenhum'}
          </span>
        </Linha>
        <Linha icon={Cpu} titulo="Trabalhos de IA rodando">
          <span className="tnum">{s.trabalhos.rodando}</span>
        </Linha>
        <Linha icon={Radio} titulo="Conexões ao vivo das TVs">
          <span className="tnum">{formatNumber(s.conexoes.total)} de {formatNumber(s.conexoes.teto)}</span>
        </Linha>
      </div>
    </Panel>
  );
}

function Linha({ icon: Icon, titulo, children }) {
  return (
    <div className="flex items-start gap-2">
      <Icon size={15} className="mt-0.5 shrink-0 text-ink-3" />
      <span className="w-44 shrink-0 text-ink-2">{titulo}</span>
      <span className="min-w-0 flex-1">{children}</span>
    </div>
  );
}

function CustoIa({ itens }) {
  return (
    <Panel>
      <PanelHeader title="Custo de IA por conta" description="Últimos 30 dias, medido em cada chamada, contra o que a conta paga por mês." />
      {itens.length === 0 ? <p className="p-4 text-sm text-ink-3">Nenhum uso de IA na janela.</p> : (
        <Table>
          <THead><TH>Conta</TH><TH>Plano</TH><TH align="right">Criações</TH><TH align="right">Chamadas</TH><TH align="right">Custo</TH><TH align="right">Teto</TH><TH align="right">Paga</TH><TH align="right">Margem</TH></THead>
          <TBody>
            {itens.map((c) => (
              <TR key={c.id}>
                <TD className="font-medium text-ink">{c.nome}</TD>
                <TD className="capitalize">{c.cortesia ? 'cortesia' : c.plano}</TD>
                <TD align="right" className="tnum">{c.criacoes}</TD>
                <TD align="right" className="tnum">{formatNumber(c.chamadas)}</TD>
                <TD align="right" className="tnum">{(c.custoCents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</TD>
                <TD align="right" className="tnum text-ink-3">{c.tetoCents ? brl(c.tetoCents) : '—'}</TD>
                <TD align="right" className="tnum">{c.mensalidadeCents ? brl(c.mensalidadeCents) : '—'}</TD>
                <TD align="right" className={'tnum ' + (c.margemCents != null && c.margemCents < 0 ? 'text-danger' : '')}>
                  {c.mensalidadeCents ? brl(c.margemCents) : '—'}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </Panel>
  );
}
