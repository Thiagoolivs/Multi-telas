import React, { useEffect, useMemo, useState } from 'react';
import { Layers, MonitorPlay, Share2, Wand2, Search, Check, Plus } from 'lucide-react';
import { Panel } from '../components/ui/Panel.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Dialog } from '../components/ui/Dialog.jsx';
import { Spinner, EmptyState, ErrorState } from '../components/ui/Feedback.jsx';
import { DesignThumb } from '../components/content/DesignThumb.jsx';
import { PecaHtml } from '../components/content/PecaHtml.jsx';
import { RedesSociais } from '../components/content/RedesSociais.jsx';
import { criar, library, devices, brand } from '../api.js';
import { EditarPeca } from '../components/content/EditarPeca.jsx';
import { carregarModelos, itemDoModelo, ordenarPorPerfil } from '../lib/modelosOuro.js';
import { usePerfil } from '../lib/perfil.js';
import { porPecaNasTelas, avisarComDesfazer } from '../lib/rodar.js';
import { AtalhosDeGrupo } from '../components/tela/AtalhosDeGrupo.jsx';
import { aviso } from '../lib/avisos.js';
import { cn } from '../lib/cn.js';

/*
 * MÍDIAS › PEÇAS PRONTAS (EXECUTOR §2c, item 34; decisão do dono: "uma aba
 * dedicada a peças prontas e publicáveis", dentro de Mídias).
 *
 * Mídias passa a ser "tudo o que eu tenho". Aqui fica o que já está PRONTO
 * para a TV: as peças das campanhas do Criar e as da biblioteca, cada uma
 * com o lugar em que cabe (TV deitada, em pé, cabeçalho, rodapé). Daqui ela
 * vai para uma ou mais TVs na zona certa, ou para as redes.
 */
const FILTROS = [
  ['todas', 'Todas'], ['deitada', 'TV deitada'], ['empe', 'TV em pé'], ['faixas', 'Cabeçalho e rodapé'],
];
const ONDE = { cabecalho: 'cabeçalho', rodape: 'rodapé' };

function ondeCabe(p) {
  if (p.papel === 'cabecalho' || p.papel === 'rodape') return ONDE[p.papel];
  return String(p.formato || '').startsWith('9/') ? 'TV em pé' : p.formato === '1/1' ? 'quadrada' : 'TV deitada';
}

export function PecasProntasPage({ onIr }) {
  const [pecas, setPecas] = useState(null);
  const [erroPecas, setErroPecas] = useState('');
  const [tentativa, setTentativa] = useState(0);
  const [telas, setTelas] = useState([]);
  const [filtro, setFiltro] = useState('todas');
  const [q, setQ] = useState('');
  const [porNaTv, setPorNaTv] = useState(null);
  const [alvos, setAlvos] = useState([]);
  const [enviando, setEnviando] = useState(false);
  const [redesDe, setRedesDe] = useState(null);
  /*
   * Os modelos prontos (D16): as peças-ouro já com a marca da conta. Cliente
   * novo deixa de ver "Nenhuma peça pronta ainda" com 43 modelos guardados.
   */
  const perfil = usePerfil();
  const [modelos, setModelos] = useState(null);
  const [marca, setMarca] = useState(null);
  const [usando, setUsando] = useState(null);   // o modelo aberto no editor de texto

  useEffect(() => {
    setErroPecas(''); setPecas(null);
    Promise.all([
      // Erro de rede não vira "Nenhuma peça pronta ainda" (D3): a falha aparece, com tentar de novo.
      criar.pecasProntas().then((r) => (r && r.pecas) || []),
      library.list().then((r) => (r && r.items) || []),
    ]).then(([camp, lib]) => {
      // A mesma peça vinda da biblioteca antiga e da campanha aparece uma vez só.
      const vistas = new Set();
      const todas = [
        ...camp.map((p) => ({ id: p.campanhaId + p.vaga, item: { ...p.item, formato: p.formato || p.item.formato }, papel: p.papel, formato: p.formato, label: p.label, origem: p.campanha, campanha: p.campanha, campanhaId: p.campanhaId })),
        ...lib.map((i) => ({ id: i.id, item: i.item, papel: i.item && i.item.papel, formato: i.formato || (i.item && i.item.formato), label: i.label, origem: i.campaign })),
      ].filter((p) => {
        const k = (p.item && (p.item.html || p.item.src || p.item.type)) + JSON.stringify((p.item && p.item.campos) || {});
        if (vistas.has(k)) return false;
        vistas.add(k);
        return true;
      });
      setPecas(todas);
    }).catch((e) => setErroPecas(e.message || 'Não deu para carregar as peças.'));
    devices.list().then((r) => setTelas((r && r.devices) || [])).catch(() => setTelas([]));
    brand.get().then((r) => {
      const k = (r && r.kit) || {};
      setMarca({ cores: k.cores || [], fonteTitulo: k.fonteTitulo || '', fonteApoio: k.fonteApoio || '', nome: (k.nome && k.nome !== 'Marca principal' ? k.nome : (r && r.empresa)) || '' });
    }).catch(() => setMarca({}));
    carregarModelos().then(setModelos).catch(() => setModelos([]));
  }, [tentativa]);

  // Os modelos na marca da conta, na ordem do tipo de negócio, com o mesmo filtro e a mesma busca.
  const modelosVisiveis = useMemo(() => {
    if (!modelos || !marca) return [];
    return ordenarPorPerfil(modelos, perfil.id).map((m) => {
      const item = itemDoModelo(m, marca);
      return { id: 'modelo-' + m.id, item, papel: item.papel, formato: item.formato, label: m.nome, origem: 'modelo · ' + m.familia, modelo: true };
    }).filter((p) => {
      const faixa = p.papel === 'cabecalho' || p.papel === 'rodape';
      if (filtro === 'faixas' && !faixa) return false;
      if (filtro === 'empe' && (faixa || !String(p.formato || '').startsWith('9/'))) return false;
      if (filtro === 'deitada' && (faixa || String(p.formato || '').startsWith('9/'))) return false;
      const t = q.trim().toLowerCase();
      return !t || ((p.label || '') + ' ' + (p.origem || '')).toLowerCase().includes(t);
    });
  }, [modelos, marca, perfil.id, filtro, q]);

  const visiveis = useMemo(() => (pecas || []).filter((p) => {
    const faixa = p.papel === 'cabecalho' || p.papel === 'rodape';
    if (filtro === 'faixas' && !faixa) return false;
    if (filtro === 'empe' && (faixa || !String(p.formato || '').startsWith('9/'))) return false;
    if (filtro === 'deitada' && (faixa || String(p.formato || '').startsWith('9/'))) return false;
    const t = q.trim().toLowerCase();
    return !t || ((p.label || '') + ' ' + (p.origem || '')).toLowerCase().includes(t);
  }), [pecas, filtro, q]);

  async function enviar() {
    setEnviando(true);
    try {
      const r = await porPecaNasTelas(porNaTv, alvos, telas);
      avisarComDesfazer('Na TV: ' + alvos.length + (alvos.length === 1 ? ' tela.' : ' telas.'), r.lote);
      setPorNaTv(null);
    } catch (e) { aviso.erro('peca', e.message || 'Não deu para pôr na TV.'); }
    finally { setEnviando(false); }
  }

  return (
    <div className="max-w-6xl">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-ink">Peças prontas</h1>
          <p className="mt-1 text-sm text-ink-2">O que já está pronto para a TV e para as redes: das suas campanhas, da biblioteca e os modelos com a sua marca.</p>
        </div>
        <Button variant="primary" icon={Plus} onClick={() => onIr && onIr('criar')}>Criar novas</Button>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex max-w-full gap-1 overflow-x-auto rounded-lg border border-line bg-surface-2 p-1">
          {FILTROS.map(([id, nome]) => (
            <button key={id} type="button" onClick={() => setFiltro(id)} aria-pressed={filtro === id}
              className={cn('whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition', filtro === id ? 'bg-surface text-ink shadow-xs' : 'text-ink-3 hover:text-ink-2')}>{nome}</button>
          ))}
        </div>
        <div className="relative w-full sm:ml-auto sm:w-64">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-3" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar nas peças…"
            className="w-full rounded-md border border-line bg-surface py-1.5 pl-8 pr-2 text-sm text-ink placeholder:text-ink-3" />
        </div>
      </div>

      {erroPecas ? (
        <ErrorState description={erroPecas} onRetry={() => setTentativa((n) => n + 1)} />
      ) : pecas === null ? <div className="flex justify-center py-16"><Spinner size={20} /></div> : visiveis.length === 0 && modelosVisiveis.length > 0 ? null : visiveis.length === 0 ? (
        <Panel>
          <EmptyState icon={Layers} title={pecas.length ? 'Nenhuma peça neste filtro' : 'Nenhuma peça pronta ainda'}
            description={pecas.length ? 'Troque o filtro ou a busca.' : 'As peças que o Criar faz aparecem aqui, prontas para qualquer TV.'}
            action={!pecas.length && <Button variant="primary" icon={Plus} onClick={() => onIr && onIr('criar')}>Criar</Button>} />
        </Panel>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visiveis.map((p) => {
            const faixa = p.papel === 'cabecalho' || p.papel === 'rodape';
            return (
              <div key={p.id} className="flex flex-col overflow-hidden rounded-lg border border-line bg-surface">
                <div className="flex h-44 items-center justify-center bg-surface-2 p-2">
                  {faixa ? <div className="w-full"><PecaHtml item={p.item} formato={p.papel} /></div> : <DesignThumb item={p.item} fitHeight />}
                </div>
                <div className="flex flex-1 flex-col gap-2 p-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-ink">{p.label || 'Peça'}</div>
                    <div className="truncate text-2xs text-ink-3">{ondeCabe(p)}{p.origem ? ' · ' + p.origem : ''}</div>
                  </div>
                  <div className="mt-auto flex flex-wrap gap-1.5">
                    <Button size="sm" variant="primary" icon={MonitorPlay} disabled={!telas.length}
                      onClick={() => { setPorNaTv(p); setAlvos(telas.map((t) => t.id)); }}>Pôr numa TV</Button>
                    {!faixa && <Button size="sm" icon={Share2} onClick={() => setRedesDe(p)}>Redes</Button>}
                    {p.campanhaId && <Button size="sm" variant="ghost" onClick={() => onIr && onIr('campanhas', { campanha: p.campanhaId })}>Campanha</Button>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Os modelos prontos, com a marca da conta (D16). */}
      {modelos === null || marca === null ? (
        pecas !== null && <div className="mt-6 flex justify-center py-6"><Spinner size={18} /></div>
      ) : modelosVisiveis.length > 0 && (
        <section className="mt-6 space-y-3">
          <div>
            <h2 className="text-base font-semibold text-ink">Modelos prontos, com a sua marca</h2>
            <p className="text-sm text-ink-2">Toque em Usar, troque o texto e ponha na TV. Já saem nas suas cores, com o seu nome e a sua logo.</p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {modelosVisiveis.map((p) => {
              const faixa = p.papel === 'cabecalho' || p.papel === 'rodape';
              return (
                <div key={p.id} className="flex flex-col overflow-hidden rounded-lg border border-line bg-surface">
                  <div className="flex h-44 items-center justify-center bg-surface-2 p-2">
                    {faixa ? <div className="w-full"><PecaHtml item={p.item} formato={p.papel} /></div> : <DesignThumb item={p.item} fitHeight />}
                  </div>
                  <div className="flex flex-1 flex-col gap-2 p-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-ink">{p.label}</div>
                      <div className="truncate text-2xs text-ink-3">{ondeCabe(p)} · {p.origem.replace('modelo · ', '')}</div>
                    </div>
                    <div className="mt-auto flex flex-wrap gap-1.5">
                      <Button size="sm" variant="primary" icon={Wand2} onClick={() => setUsando(p)}>Usar</Button>
                      {!faixa && <Button size="sm" icon={Share2} onClick={() => setRedesDe(p)}>Redes</Button>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Usar um modelo: troca o texto e, ao salvar, escolhe as TVs. */}
      {usando && (
        <EditarPeca item={usando.item} label={usando.label} onFechar={() => setUsando(null)}
          onSalvar={async (item) => {
            const pronta = { ...usando, item: { ...usando.item, ...item, papel: usando.papel, formato: usando.formato } };
            setUsando(null);
            if (telas.length) { setPorNaTv(pronta); setAlvos(telas.map((t) => t.id)); }
            else aviso.ok('Pronto. Ligue uma TV em Telas para pôr esta peça no ar.');
          }} />
      )}

      {porNaTv && (
        <Dialog open onClose={() => setPorNaTv(null)} title="Pôr numa TV"
          description={'Entra ' + (porNaTv.papel === 'cabecalho' || porNaTv.papel === 'rodape' ? 'no ' + ONDE[porNaTv.papel] : 'na zona que combina com ela (' + ondeCabe(porNaTv) + ')') + ', no fim do que já está lá.'}
          footer={<>
            <Button variant="ghost" onClick={() => setPorNaTv(null)}>Cancelar</Button>
            <Button variant="primary" icon={MonitorPlay} disabled={!alvos.length || enviando} onClick={enviar}>{enviando ? 'Enviando…' : 'Pôr na TV'}</Button>
          </>}>
          <AtalhosDeGrupo telas={telas} alvos={alvos} onEscolher={setAlvos} />
          <div className="space-y-1.5">
            {telas.map((t) => {
              const sel = alvos.includes(t.id);
              return (
                <button key={t.id} type="button" aria-pressed={sel} onClick={() => setAlvos((a) => (sel ? a.filter((x) => x !== t.id) : a.concat(t.id)))}
                  className={cn('flex w-full items-center gap-2 rounded-md border px-3 py-2 text-left text-sm', sel ? 'border-accent bg-accent-soft/40 text-ink' : 'border-line text-ink-2')}>
                  {sel ? <Check size={14} className="text-accent" /> : <MonitorPlay size={14} className="text-ink-3" />} {t.name || 'TV'}
                </button>
              );
            })}
          </div>
        </Dialog>
      )}
      {redesDe && <RedesSociais item={redesDe.item} label={redesDe.label} onFechar={() => setRedesDe(null)} />}
    </div>
  );
}
