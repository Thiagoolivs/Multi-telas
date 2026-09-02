import React, { useEffect, useState } from 'react';
import { Images, Search, Download, Check } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader.jsx';
import { Panel, PanelHeader } from '../components/ui/Panel.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Skeleton, ErrorState, EmptyState } from '../components/ui/Feedback.jsx';
import { bancoImagens } from '../api.js';

/*
 * O Banco de Imagens MultiTelas — a prateleira que a conta encontra cheia.
 *
 * O que esta página resolve não é técnico: uma plataforma de arte que abre
 * vazia não tem gosto nenhum. O primeiro cliente entra, vê um formulário em
 * branco e conclui, com razão, que o trabalho é dele.
 *
 * O que está aqui é o acervo comum: imagens que outros clientes geraram e
 * AUTORIZARAM a reuso, conferidas uma a uma antes de entrar. As regras moram
 * em server/banco.js.
 *
 * Usar uma imagem daqui NÃO gasta crédito de IA — ela já foi gerada e paga uma
 * vez. É a diferença entre a mesma foto de pão custar R$ 0,35 quarenta vezes e
 * custar uma.
 */

const FORMATOS = [
  { id: '', rotulo: 'Todos' },
  { id: '16/9', rotulo: 'TV deitada' },
  { id: '9/16', rotulo: 'TV em pé' },
  { id: '1/1', rotulo: 'Quadrada' },
  { id: '21/9', rotulo: 'Barra larga' },
];

export function BancoImagensPage({ onUsar }) {
  const [termo, setTermo] = useState('');
  const [busca, setBusca] = useState('');
  const [formato, setFormato] = useState('');
  const [itens, setItens] = useState(null);
  const [erro, setErro] = useState(null);
  const [usada, setUsada] = useState({});

  useEffect(() => {
    let vivo = true;
    setItens(null); setErro(null);
    bancoImagens.feed({ ...(busca ? { q: busca } : {}), ...(formato ? { formato } : {}) })
      .then((r) => { if (vivo) setItens(r.itens || []); })
      .catch((e) => { if (vivo) setErro(e); });
    return () => { vivo = false; };
  }, [busca, formato]);

  async function usar(item) {
    try {
      const r = await bancoImagens.usar(item.id);
      setUsada((a) => ({ ...a, [item.id]: true }));
      /*
       * `cor` é a cor da marca de ORIGEM. Vai junto porque é o que o duotone
       * precisa para repintar a foto na cor de quem está usando — sem isso a
       * imagem entra na peça denunciando que veio de outra empresa.
       */
      if (onUsar) onUsar({ url: r.item.url, formato: r.item.formato, corDeOrigem: r.item.cor });
      else await navigator.clipboard.writeText(new URL(r.item.url, window.location.origin).toString()).catch(() => {});
    } catch (e) {
      setErro(e);
    }
  }

  return (
    <div>
      <PageHeader
        title="Banco de Imagens"
        subtitle="Imagens que outros clientes geraram e liberaram para reuso. Usar daqui não gasta crédito de IA."
      />

      <Panel className="mb-4">
        <div className="flex flex-wrap items-center gap-2 p-3">
          <form className="relative flex-1 min-w-[200px]" onSubmit={(e) => { e.preventDefault(); setBusca(termo.trim()); }}>
            <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-3" />
            <input
              value={termo}
              onChange={(e) => setTermo(e.target.value)}
              placeholder="pão, óculos, café, fachada…"
              className="w-full rounded-md border border-line bg-surface-2 py-1.5 pl-8 pr-3 text-sm text-ink placeholder:text-ink-3"
            />
          </form>
          <div className="flex flex-wrap gap-1">
            {FORMATOS.map((f) => (
              <button key={f.id} type="button" onClick={() => setFormato(f.id)}
                className={'rounded-md border px-2.5 py-1.5 text-xs transition ' + (formato === f.id
                  ? 'border-accent bg-accent/10 text-accent'
                  : 'border-line bg-surface-2 text-ink-2 hover:text-ink')}>
                {f.rotulo}
              </button>
            ))}
          </div>
        </div>
      </Panel>

      <Panel>
        <PanelHeader title="Acervo" description={itens ? `${itens.length} imagem(ns)` : undefined} />
        {erro ? (
          <ErrorState description="Não foi possível carregar o banco." onRetry={() => setBusca((b) => b)} />
        ) : itens === null ? (
          <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="aspect-video rounded-lg" />)}
          </div>
        ) : itens.length === 0 ? (
          <EmptyState
            icon={Images}
            title={busca || formato ? 'Nada com esse filtro' : 'O banco ainda está enchendo'}
            description={busca || formato
              ? 'Tente outra palavra ou tire o filtro de formato.'
              : 'Toda imagem que a IA gera pode ser compartilhada aqui, em Armazenamento. Quanto mais gente compartilha, menos todo mundo gasta.'}
          />
        ) : (
          <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 lg:grid-cols-4">
            {itens.map((i) => (
              <div key={i.id} className="group overflow-hidden rounded-lg border border-line bg-surface-2">
                <div className="relative aspect-video bg-[#0a1128]">
                  {/*
                    Imagem quebrada some em vez de virar caixa cinza com texto
                    alternativo por cima. O arquivo do banco vive fora da conta
                    de quem está olhando — some por falha do bucket, não por
                    erro de quem abriu a página, e o card tem que continuar
                    apresentável.
                  */}
                  <img src={i.url} alt="" className="h-full w-full object-cover" loading="lazy"
                    onError={(ev) => { ev.currentTarget.style.display = 'none'; }} />
                  {i.minha && (
                    <span className="absolute left-1.5 top-1.5 rounded bg-ink/70 px-1.5 py-0.5 text-2xs text-white">sua</span>
                  )}
                </div>
                <div className="p-2">
                  <div className="truncate text-xs text-ink" title={i.descricao}>{i.descricao}</div>
                  <div className="mt-0.5 flex items-center justify-between text-2xs text-ink-3">
                    <span>{i.formato || '—'}</span>
                    <span className="tnum">{i.usos} uso(s)</span>
                  </div>
                  <Button size="sm" variant={usada[i.id] ? 'ghost' : 'secondary'} className="mt-1.5 w-full"
                    icon={usada[i.id] ? Check : Download} onClick={() => usar(i)}>
                    {usada[i.id] ? 'Usada' : (onUsar ? 'Usar nesta peça' : 'Copiar link')}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}
