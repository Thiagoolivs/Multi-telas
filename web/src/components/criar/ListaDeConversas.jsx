import React, { useEffect, useRef, useState } from 'react';
import { Search, X, MessageSquare, Plus, Pencil, Archive, ArchiveRestore, CheckCircle2, Trash2 } from 'lucide-react';
import { Spinner } from '../ui/Feedback.jsx';
import { criar } from '../../api.js';
import { perguntar, confirmar } from '../../lib/confirmar.js';
import { aviso } from '../../lib/avisos.js';
import { cn } from '../../lib/cn.js';

/*
 * AS CONVERSAS DO CRIAR (EXECUTOR D47/D49).
 *
 * O dono: "os chats antigos não estão acessíveis". Eram as 5 últimas, e só
 * na tela de começo — no meio de uma conversa, as outras sumiam. Aqui ficam
 * todas: as em andamento (que ainda não geraram) e as que viraram campanha,
 * com busca, arquivadas à parte, renomear e "ver mais". No computador, a
 * coluna fica sempre ao lado da conversa; no celular, abre por um botão.
 */

export const ESTADO_DA_CONVERSA = {
  conversando: { rotulo: 'conversando', classe: 'text-ink-3' },
  entendido: { rotulo: 'pronta para gerar', classe: 'text-accent' },
  gerado: { rotulo: 'criada', classe: 'text-ok' },
};
const estadoDe = (c) => ESTADO_DA_CONVERSA[c.estado] || ESTADO_DA_CONVERSA.conversando;

const quando = (ms) => {
  if (!ms) return '';
  const d = new Date(ms);
  const hoje = new Date();
  if (d.toDateString() === hoje.toDateString()) return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
};

export function ListaDeConversas({ atual, onAbrir, onNova, onExcluiu, versao, className }) {
  const [filtro, setFiltro] = useState('andamento');   // andamento | criadas
  const [arquivadas, setArquivadas] = useState(false);
  const [busca, setBusca] = useState('');
  const [lista, setLista] = useState(null);
  const [mais, setMais] = useState(false);
  const [carregandoMais, setCarregandoMais] = useState(false);
  const pedido = useRef(0);

  // Toda busca nova descarta a resposta de uma anterior que chegue atrasada.
  function carregar(pular) {
    const n = ++pedido.current;
    if (!pular) setLista(null);
    return criar.conversas({ q: busca.trim(), estado: arquivadas ? '' : filtro, arquivadas, pular })
      .then((r) => {
        if (n !== pedido.current) return;
        const novas = (r && r.conversas) || [];
        setLista((l) => (pular ? (l || []).concat(novas) : novas));
        setMais(!!(r && r.mais));
      })
      .catch(() => { if (n === pedido.current) setLista((l) => l || []); });
  }

  useEffect(() => {
    const t = setTimeout(() => carregar(0), busca ? 300 : 0);
    return () => clearTimeout(t);
  }, [busca, filtro, arquivadas, versao]); // eslint-disable-line react-hooks/exhaustive-deps

  async function verMais() {
    setCarregandoMais(true);
    try { await carregar((lista || []).length); } finally { setCarregandoMais(false); }
  }

  async function renomear(c) {
    const titulo = await perguntar({ titulo: 'Renomear a conversa', rotulo: 'Nome', valor: c.titulo || '', botao: 'Renomear' });
    if (titulo === null || !titulo.trim() || titulo.trim() === c.titulo) return;
    try {
      const r = await criar.renomearConversa(c.id, titulo.trim());
      setLista((l) => (l || []).map((x) => (x.id === c.id ? { ...x, titulo: r.conversa.titulo } : x)));
    } catch (e) { aviso.erro('conversas', 'Não deu para renomear: ' + (e.message || 'falha de conexão') + '.'); }
  }

  /*
   * Excluir com confirmação (pedido do dono, 24/10: "tem que ter confirmação
   * para não apagar sem querer"). A caixa diz o nome da conversa, que não dá
   * para desfazer, e o que NÃO some (a campanha que ela criou).
   */
  async function excluir(c) {
    const nome = c.titulo || 'esta conversa';
    const ok = await confirmar({
      titulo: 'Excluir a conversa?',
      texto: '"' + nome + '" e tudo o que foi combinado nela vão ser apagados. Não dá para desfazer.'
        + (c.estado === 'gerado' ? ' A campanha que ela criou continua em Criados.' : ' Se quiser só tirar da lista, use Arquivar.'),
      botao: 'Excluir', perigo: true,
    });
    if (!ok) return;
    try {
      await criar.excluirConversa(c.id);
      setLista((l) => (l || []).filter((x) => x.id !== c.id));
      aviso.ok('Conversa excluída.');
      if (onExcluiu) onExcluiu(c.id);
    } catch (e) { aviso.erro('conversas', 'Não deu para excluir: ' + (e.message || 'falha de conexão') + '.'); }
  }

  async function arquivar(c, sim) {
    try {
      await criar.arquivarConversa(c.id, sim);
      setLista((l) => (l || []).filter((x) => x.id !== c.id));
      aviso.ok(sim ? 'Conversa arquivada.' : 'A conversa voltou.');
    } catch (e) { aviso.erro('conversas', 'Não deu para ' + (sim ? 'arquivar' : 'desarquivar') + ': ' + (e.message || 'falha de conexão') + '.'); }
  }

  return (
    <div className={cn('flex min-h-0 flex-col gap-2', className)}>
      {onNova && (
        <button type="button" onClick={onNova}
          className="flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-line px-3 py-2 text-sm font-medium text-ink-2 transition hover:border-accent hover:text-accent">
          <Plus size={15} /> Nova conversa
        </button>
      )}

      <label className="relative">
        <span className="sr-only">Buscar conversa</span>
        <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-3" />
        <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar conversa"
          className="h-9 w-full rounded-md border border-line bg-surface pl-8 pr-8 text-sm text-ink outline-none placeholder:text-ink-3 focus:border-accent" />
        {busca && (
          <button type="button" aria-label="Limpar a busca" onClick={() => setBusca('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-3 hover:text-ink"><X size={14} /></button>
        )}
      </label>

      {!arquivadas && (
        <div className="grid grid-cols-2 gap-1 rounded-lg border border-line bg-surface-2 p-1" role="tablist" aria-label="Quais conversas">
          {[['andamento', 'Em andamento'], ['criadas', 'Viraram campanha']].map(([id, rotulo]) => (
            <button key={id} type="button" role="tab" aria-selected={filtro === id} onClick={() => setFiltro(id)}
              className={cn('rounded-md px-2 py-1 text-xs font-medium transition', filtro === id ? 'bg-surface text-ink shadow-xs' : 'text-ink-3 hover:text-ink-2')}>
              {rotulo}
            </button>
          ))}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {lista === null ? <div className="flex justify-center py-6"><Spinner size={16} /></div> : lista.length === 0 ? (
          <p className="px-1 py-4 text-center text-xs text-ink-3">
            {busca.trim() ? 'Nenhuma conversa com “' + busca.trim() + '”.'
              : arquivadas ? 'Nenhuma conversa arquivada.'
                : filtro === 'criadas' ? 'Nenhuma conversa virou campanha ainda.' : 'Nenhuma conversa em andamento.'}
          </p>
        ) : (
          <ul className="space-y-0.5">
            {lista.map((c) => {
              const e = estadoDe(c);
              return (
                <li key={c.id} className={cn('group flex items-center gap-1 rounded-md pr-1 transition', c.id === atual ? 'bg-accent-soft' : 'hover:bg-surface-2')}>
                  <button type="button" onClick={() => onAbrir(c)} aria-current={c.id === atual ? 'true' : undefined}
                    className="flex min-w-0 flex-1 items-start gap-2 px-2 py-1.5 text-left">
                    {c.estado === 'gerado'
                      ? <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-ok" aria-hidden />
                      : <MessageSquare size={14} className="mt-0.5 shrink-0 text-ink-3" aria-hidden />}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-ink">{c.titulo || 'Sem título'}</span>
                      <span className="block truncate text-2xs"><span className={e.classe}>{e.rotulo}</span><span className="text-ink-3"> · {quando(c.atualizadoEm)}</span></span>
                    </span>
                  </button>
                  <span className="flex shrink-0 opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                    <button type="button" title="Renomear" aria-label={'Renomear ' + (c.titulo || 'a conversa')} onClick={() => renomear(c)}
                      className="rounded p-1 text-ink-3 hover:bg-surface hover:text-ink"><Pencil size={12} /></button>
                    <button type="button" title={arquivadas ? 'Desarquivar' : 'Arquivar'} aria-label={(arquivadas ? 'Desarquivar ' : 'Arquivar ') + (c.titulo || 'a conversa')}
                      onClick={() => arquivar(c, !arquivadas)} className="rounded p-1 text-ink-3 hover:bg-surface hover:text-ink">
                      {arquivadas ? <ArchiveRestore size={12} /> : <Archive size={12} />}
                    </button>
                    <button type="button" title="Excluir" aria-label={'Excluir ' + (c.titulo || 'a conversa')} onClick={() => excluir(c)}
                      className="rounded p-1 text-ink-3 hover:bg-danger/10 hover:text-danger"><Trash2 size={12} /></button>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        {mais && (
          <button type="button" disabled={carregandoMais} onClick={verMais} className="mt-1 w-full rounded-md py-1.5 text-xs font-medium text-accent hover:bg-surface-2">
            {carregandoMais ? 'Carregando…' : 'Ver mais'}
          </button>
        )}
      </div>

      <button type="button" aria-pressed={arquivadas} onClick={() => setArquivadas((v) => !v)}
        className="flex items-center gap-1.5 self-start rounded px-1 py-1 text-xs text-ink-3 hover:text-ink-2">
        <Archive size={12} /> {arquivadas ? 'Voltar às conversas' : 'Arquivadas'}
      </button>
    </div>
  );
}
