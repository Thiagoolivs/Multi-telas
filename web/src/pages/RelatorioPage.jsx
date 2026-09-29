import React, { useCallback, useState } from 'react';
import { BarChart3, Download, MonitorPlay, PlayCircle, Clock } from 'lucide-react';
import { Panel, PanelHeader } from '../components/ui/Panel.jsx';
import { Table, THead, TBody, TH, TR, TD } from '../components/ui/Table.jsx';
import { Stat } from '../components/ui/Stat.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Select } from '../components/ui/Field.jsx';
import { SkeletonRows, ErrorState, EmptyState } from '../components/ui/Feedback.jsx';
import { useAsync } from '../lib/useAsync.js';
import { relatorio, devices } from '../api.js';

/*
 * Relatório de exibição: o que passou, quantas vezes, por quanto tempo e em
 * qual tela. Quem conta é a própria TV (js/exibicoes.js), agregando por hora
 * e enviando em lotes — então o número de hoje aparece com até uma hora de
 * atraso, e uma TV que ficou sem internet manda o que exibiu quando voltar.
 */
function horas(seg) {
  const h = seg / 3600;
  if (h < 1) return Math.round(seg / 60) + ' min';
  return h.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' h';
}
const nfmt = (n) => Number(n || 0).toLocaleString('pt-BR');

export function RelatorioPage({ onIrParaPlano }) {
  const [dias, setDias] = useState(7);
  const [tela, setTela] = useState('');
  const carregar = useCallback(() => relatorio.get(dias, tela), [dias, tela]);
  const { data, loading, error, reload } = useAsync(carregar, [dias, tela]);
  const lista = useAsync(devices.list);
  const telas = (lista.data && lista.data.devices) || [];

  const bloqueado = error && error.status === 402;

  return (
    <div>
      {/* Filtros numa linha só, acima de tudo que eles filtram. */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="w-44"><Select value={dias} onChange={(e) => setDias(Number(e.target.value))}>
          <option value={1}>Últimas 24 horas</option>
          <option value={7}>Últimos 7 dias</option>
          <option value={30}>Últimos 30 dias</option>
          <option value={90}>Últimos 90 dias</option>
        </Select></div>
        <div className="w-52"><Select value={tela} onChange={(e) => setTela(e.target.value)}>
          <option value="">Todas as telas</option>
          {telas.map((t) => <option key={t.id} value={t.id}>{t.name || 'Tela sem nome'}</option>)}
        </Select></div>
        <div className="ml-auto">
          <Button size="sm" variant="secondary" icon={Download} disabled={!data}
            onClick={() => { window.location.href = relatorio.csvUrl(dias, tela); }}>
            Baixar planilha (CSV)
          </Button>
        </div>
      </div>

      {loading && <SkeletonRows rows={6} cols={4} />}
      {bloqueado && (
        <EmptyState icon={BarChart3} title="Relatório de exibição é do plano Pro"
          description={error.message}
          action={onIrParaPlano && <Button size="sm" variant="primary" onClick={onIrParaPlano}>Ver planos</Button>} />
      )}
      {error && !bloqueado && <ErrorState description="Não foi possível carregar o relatório." onRetry={reload} />}

      {data && !loading && (data.totais.vezes === 0 ? (
        <Panel>
          <EmptyState icon={BarChart3} title="Nada exibido neste período"
            description="As TVs mandam o que exibiram a cada poucos minutos, agrupado por hora. Uma tela recém-pareada aparece aqui na hora seguinte." />
        </Panel>
      ) : (
        <>
          <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Exibições" value={nfmt(data.totais.vezes)} icon={PlayCircle} />
            <Stat label="Tempo no ar" value={horas(data.totais.segundos)} icon={Clock} hint="soma de todas as zonas" />
            <Stat label="Conteúdos diferentes" value={nfmt(data.totais.conteudos)} icon={BarChart3} />
            <Stat label="Telas" value={nfmt(data.totais.telas)} icon={MonitorPlay} />
          </div>

          {data.porDia.length > 1 && <PorDia dias={data.porDia} />}

          <Panel className="mb-5">
            <PanelHeader title="Por conteúdo" description="Do que ficou mais tempo no ar para o que ficou menos." />
            <Table>
              <THead><TH>Conteúdo</TH><TH align="right">Exibições</TH><TH align="right">Tempo no ar</TH><TH align="right">Telas</TH></THead>
              <TBody>
                {data.porConteudo.map((c) => (
                  <TR key={c.chave}>
                    <TD><div className="max-w-md truncate text-ink">{c.rotulo}</div>{c.tipo && <div className="text-2xs text-ink-3">{c.tipo}</div>}</TD>
                    <TD align="right" className="tnum">{nfmt(c.vezes)}</TD>
                    <TD align="right" className="tnum">{horas(c.segundos)}</TD>
                    <TD align="right" className="tnum">{c.telas}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </Panel>

          {!tela && (
            <Panel>
              <PanelHeader title="Por tela" />
              <Table>
                <THead><TH>Tela</TH><TH align="right">Exibições</TH><TH align="right">Tempo no ar</TH></THead>
                <TBody>
                  {data.porTela.map((t) => (
                    <TR key={t.id}><TD className="text-ink">{t.nome}</TD><TD align="right" className="tnum">{nfmt(t.vezes)}</TD><TD align="right" className="tnum">{horas(t.segundos)}</TD></TR>
                  ))}
                </TBody>
              </Table>
            </Panel>
          )}
        </>
      ))}
    </div>
  );
}

/*
 * Tempo no ar por dia: uma série só, então sem legenda (o título diz o que
 * é); barras finas, cor de destaque, topo arredondado no dado e base reta na
 * linha de zero. Cada barra tem o valor no title — a tabela acima é a visão
 * acessível completa.
 */
function PorDia({ dias }) {
  const max = Math.max(1, ...dias.map((d) => d.segundos));
  const rot = (dia) => { const [, m, d] = dia.split('-'); return d + '/' + m; };
  const passo = Math.ceil(dias.length / 10); // no máximo ~10 rótulos no eixo
  return (
    <Panel className="mb-5">
      <PanelHeader title="Tempo no ar por dia" description={'Pico: ' + horas(max)} />
      <div className="px-4 pb-4 pt-2">
        <div className="flex h-36 items-end gap-[2px] border-b border-line">
          {dias.map((d) => (
            <div key={d.dia} className="group relative flex h-full flex-1 items-end" title={rot(d.dia) + ': ' + horas(d.segundos) + ' · ' + nfmt(d.vezes) + ' exibições'}>
              <div className="mx-auto w-full max-w-[36px] rounded-t-[4px] bg-accent transition-opacity group-hover:opacity-80"
                style={{ height: Math.max(2, (d.segundos / max) * 100) + '%' }} />
            </div>
          ))}
        </div>
        <div className="mt-1 flex gap-[2px] text-2xs text-ink-3">
          {dias.map((d, i) => <div key={d.dia} className="flex-1 truncate text-center">{i % passo === 0 ? rot(d.dia) : ''}</div>)}
        </div>
      </div>
    </Panel>
  );
}
