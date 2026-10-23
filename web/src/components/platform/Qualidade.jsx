import React from 'react';
import { Wand2 } from 'lucide-react';
import { Panel, PanelHeader } from '../ui/Panel.jsx';
import { EmptyState, Spinner } from '../ui/Feedback.jsx';
import { useAsync } from '../../lib/useAsync.js';
import { plataforma } from '../../api.js';
import { formatNumber } from '../../lib/format.js';

/*
 * A qualidade das gerações (D43), para o dono ver onde a IA entrega fraco
 * sem abrir o banco de ninguém: o que volta para a IA porque não coube, o que
 * o cliente corrige à mão depois e o que ele mais pede. Só contagens
 * (server/qualidade.js) — nem conta, nem pessoa, nem texto.
 */
const DEFEITO = {
  vaza: 'passa da borda', sobrepoe: 'texto sobre texto', letra: 'letra pequena', margem: 'colado na borda',
  foto: 'texto sobre a foto', contraste: 'cor some no fundo', qr: 'QR pequeno', hierarquia: 'preço não é o maior', outro: 'outro',
};
const PAPEL = { destaque: 'destaque', lateral: 'lateral', cabecalho: 'cabeçalho', rodape: 'rodapé' };
const PEDIDO = {
  texto: 'trocar texto', 'foto-nova': 'foto nova', 'foto-minha': 'usar a minha foto', 'sem-foto': 'tirar a foto',
  redesenhar: 'redesenhar', tirar: 'tirar peça', acrescentar: 'mais peças', redes: 'redes sociais', letreiro: 'letreiro',
  contagem: 'contagem', pergunta: 'a IA precisou perguntar', nada: 'não mudou nada',
};
const ONDE = { ajustar: 'Ajustar', editar: 'Editar com a IA' };
const peca = (base) => (base === 'ia' ? 'composta pela IA' : base);

function Lista({ titulo, itens, rotulo, vazio }) {
  const lista = (itens || []).slice(0, 8);
  const maior = lista.length ? lista[0].n : 1;
  return (
    <div>
      <div className="mb-2 text-2xs font-semibold uppercase tracking-wider text-ink-3">{titulo}</div>
      {!lista.length && <p className="text-xs text-ink-3">{vazio}</p>}
      {lista.map((x, i) => (
        <div key={i} className="mb-2 last:mb-0">
          <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
            <span className="min-w-0 truncate text-ink">{rotulo(x)}</span>
            <span className="tnum shrink-0 text-ink-3">{formatNumber(x.n)} · {x.parte}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-line">
            <div className="h-full rounded-full bg-accent" style={{ width: Math.max(2, (x.n / maior) * 100) + '%' }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function Qualidade({ dias }) {
  const { data, loading } = useAsync(() => plataforma.qualidade(dias), [dias]);
  const nada = data && !data.refazer.length && !data.editado.length && !data.pedido.length;
  return (
    <Panel>
      <PanelHeader title="Qualidade das gerações"
        description="O que volta para a IA, o que o cliente corrige à mão e o que mais pede. Só contagens: nem conta, nem pessoa, nem texto." />
      <div className="p-4">
        {loading && !data && <div className="py-6 text-center"><Spinner size={18} /></div>}
        {nada && <EmptyState icon={Wand2} title="Nada contado na janela"
          description="A contagem começa a partir deste deploy: refazer de peça, edição à mão e pedidos no Ajustar e no Editar com a IA." />}
        {data && !nada && (
          <div className="grid gap-5 lg:grid-cols-3">
            <Lista titulo="Peças refeitas pela IA" itens={data.refazer} vazio="Nenhuma peça voltou para a IA."
              rotulo={(x) => peca(x.base) + ' · ' + (PAPEL[x.papel] || x.papel) + ' · ' + (DEFEITO[x.defeito] || x.defeito)} />
            <Lista titulo="Campos corrigidos à mão" itens={data.editado} vazio="Ninguém corrigiu peça à mão."
              rotulo={(x) => x.campo + ' · ' + peca(x.base)} />
            <Lista titulo="O que mais pedem" itens={data.pedido} vazio="Nenhum pedido no Ajustar ou no Editar."
              rotulo={(x) => (PEDIDO[x.tipo] || x.tipo) + ' · ' + (ONDE[x.onde] || x.onde)} />
          </div>
        )}
      </div>
    </Panel>
  );
}
