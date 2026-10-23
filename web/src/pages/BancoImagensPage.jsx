import React, { useEffect, useState } from 'react';
import { Images, Search, Download, Check, FolderPlus, Library, ExternalLink } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader.jsx';
import { Panel, PanelHeader } from '../components/ui/Panel.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Dialog } from '../components/ui/Dialog.jsx';
import { Field, Input, Select } from '../components/ui/Field.jsx';
import { Skeleton, ErrorState, EmptyState } from '../components/ui/Feedback.jsx';
import { bancoImagens, pixabay } from '../api.js';
import { aviso } from '../lib/avisos.js';

/*
 * O Banco de Imagens MultiTelas — a prateleira que a conta encontra cheia.
 *
 * O que esta página resolve não é técnico: uma plataforma de arte que abre
 * vazia não tem gosto nenhum. O primeiro cliente entra, vê um formulário em
 * branco e conclui, com razão, que o trabalho é dele.
 *
 * Dois acervos numa busca só (pedido do dono, 23/10 — "pesquisei no banco de
 * imagens e não respondeu nada": a página só olhava o acervo comum, ainda
 * vazio, e a Pixabay morava escondida na troca de foto da peça):
 *   - o ACERVO COMUM: imagens que outros clientes geraram e liberaram, e as
 *     fotos da Pixabay que o operador escolheu para cada segmento;
 *   - a PIXABAY ao vivo: "Pôr nas Mídias" baixa a foto para a conta, com o
 *     crédito do autor; o operador também pode pôr no acervo comum.
 *
 * Usar uma imagem daqui NÃO gasta crédito de IA. As regras moram em
 * server/banco.js.
 */

const FORMATOS = [
  { id: '', rotulo: 'Todos' },
  { id: '16/9', rotulo: 'TV deitada' },
  { id: '9/16', rotulo: 'TV em pé' },
  { id: '1/1', rotulo: 'Quadrada' },
  { id: '21/9', rotulo: 'Barra larga' },
];

const chip = (ativo) => 'rounded-md border px-2.5 py-1.5 text-xs transition ' + (ativo
  ? 'border-accent bg-accent/10 text-accent'
  : 'border-line bg-surface-2 text-ink-2 hover:text-ink');

export function BancoImagensPage({ onUsar, operador }) {
  const [termo, setTermo] = useState('');
  const [busca, setBusca] = useState('');
  const [formato, setFormato] = useState('');
  const [segmento, setSegmento] = useState(null); // null: ainda não sabe o da conta
  const [segmentos, setSegmentos] = useState([]);
  const [itens, setItens] = useState(null);
  const [erro, setErro] = useState(null);
  const [usada, setUsada] = useState({});
  /*
   * "Tentar de novo" gravava o mesmo valor da busca e nada recarregava: o
   * botão estava morto. Um contador de tentativas força a nova leitura (D3).
   */
  const [tentativa, setTentativa] = useState(0);

  useEffect(() => {
    let vivo = true;
    setItens(null); setErro(null);
    bancoImagens.feed({ ...(busca ? { q: busca } : {}), ...(formato ? { formato } : {}), ...(segmento ? { segmento } : {}) })
      .then((r) => {
        if (!vivo) return;
        setItens(r.itens || []);
        if (r.segmentos) setSegmentos(r.segmentos);
        // A primeira abertura vai para o segmento da conta (a padaria abre nas fotos de padaria).
        if (segmento === null) setSegmento(r.daConta || '');
      })
      .catch((e) => { if (vivo) setErro(e); });
    return () => { vivo = false; };
  }, [busca, formato, segmento, tentativa]);

  async function usar(item) {
    try {
      // Fora de uma peça, "usar" é pôr uma cópia nas Mídias — de lá a foto vai para qualquer peça ou campanha.
      if (!onUsar) {
        await bancoImagens.paraMidias(item.id);
        setUsada((a) => ({ ...a, [item.id]: true }));
        aviso.ok('Está nas suas Mídias' + (item.credito ? ', com o crédito do autor.' : '.'));
        return;
      }
      const r = await bancoImagens.usar(item.id);
      setUsada((a) => ({ ...a, [item.id]: true }));
      /*
       * `cor` é a cor da marca de ORIGEM. Vai junto porque é o que o duotone
       * precisa para repintar a foto na cor de quem está usando — sem isso a
       * imagem entra na peça denunciando que veio de outra empresa.
       */
      onUsar({ url: r.item.url, formato: r.item.formato, corDeOrigem: r.item.cor, credito: r.item.credito });
    } catch (e) {
      // Falha ao USAR uma imagem não é falha do banco: a galeria fica, e o aviso diz o que houve.
      aviso.erro('banco', e.message || 'Não deu para usar esta imagem.');
    }
  }

  const doSegmento = segmentos.find((s) => s.id === segmento);
  const procurar = (t) => { setTermo(t); setBusca(t.trim()); };

  return (
    <div>
      <PageHeader
        title="Banco de Imagens"
        subtitle="O acervo comum do MultiTelas e as fotos da Pixabay, numa busca só. Usar daqui não gasta criação com IA."
      />

      <Panel className="mb-4">
        <div className="space-y-2.5 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <form className="relative min-w-[200px] flex-1" onSubmit={(e) => { e.preventDefault(); setBusca(termo.trim()); }}>
              <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-3" />
              <input
                value={termo}
                onChange={(e) => setTermo(e.target.value)}
                placeholder="pão, óculos, café, fachada…"
                aria-label="Procurar imagens"
                className="w-full rounded-md border border-line bg-surface-2 py-1.5 pl-8 pr-3 text-sm text-ink placeholder:text-ink-3"
              />
            </form>
            <div className="flex flex-wrap gap-1">
              {FORMATOS.map((f) => (
                <button key={f.id} type="button" onClick={() => setFormato(f.id)} className={chip(formato === f.id)}>{f.rotulo}</button>
              ))}
            </div>
          </div>
          {segmentos.length > 0 && (
            <div className="flex flex-wrap gap-1" role="group" aria-label="Segmento">
              <button type="button" onClick={() => setSegmento('')} className={chip(!segmento)}>Todos os segmentos</button>
              {segmentos.map((s) => (
                <button key={s.id} type="button" onClick={() => setSegmento(s.id)} className={chip(segmento === s.id)}>{s.nome}</button>
              ))}
            </div>
          )}
          {/* Os termos prontos do segmento: um clique e a busca vai no acervo e na Pixabay. */}
          {doSegmento && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-2xs text-ink-3">Procurar:</span>
              {doSegmento.termos.map((t) => (
                <button key={t} type="button" onClick={() => procurar(t)}
                  className={'rounded-full border px-2.5 py-1 text-2xs transition ' + (busca === t ? 'border-accent text-accent' : 'border-line text-ink-2 hover:border-accent hover:text-ink')}>
                  {t}
                </button>
              ))}
            </div>
          )}
        </div>
      </Panel>

      <Panel className="mb-4">
        <PanelHeader title="Acervo comum" description={itens ? `${itens.length} imagem(ns)${doSegmento ? ' · ' + doSegmento.nome : ''}` : undefined} />
        {erro ? (
          <ErrorState description="Não foi possível carregar o banco." onRetry={() => setTentativa((n) => n + 1)} />
        ) : itens === null ? (
          <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="aspect-video rounded-lg" />)}
          </div>
        ) : itens.length === 0 ? (
          <EmptyState
            icon={Images}
            title={busca || formato || segmento ? 'Nada no acervo com esse filtro' : 'O acervo ainda está enchendo'}
            description={busca
              ? 'Veja as fotos da Pixabay logo abaixo.'
              : 'Procure uma palavra (ou toque num termo pronto) para ver as fotos da Pixabay.'}
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
                  {i.credito && <div className="truncate text-2xs text-ink-3" title={i.credito}>{i.credito}</div>}
                  <div className="mt-0.5 flex items-center justify-between text-2xs text-ink-3">
                    <span>{i.formato || '—'}</span>
                    <span className="tnum">{i.usos} uso(s)</span>
                  </div>
                  <Button size="sm" variant={usada[i.id] ? 'ghost' : 'secondary'} className="mt-1.5 w-full"
                    icon={usada[i.id] ? Check : (onUsar ? Download : FolderPlus)} onClick={() => usar(i)}>
                    {usada[i.id] ? (onUsar ? 'Usada' : 'Nas Mídias') : (onUsar ? 'Usar nesta peça' : 'Pôr nas Mídias')}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <DaPixabay busca={busca} operador={operador} segmentos={segmentos} segmento={segmento}
        onCurou={() => setTentativa((n) => n + 1)} />
    </div>
  );
}

/*
 * A Pixabay ao vivo, com a mesma palavra da busca. As miniaturas vêm da
 * Pixabay só para olhar (os termos deles permitem mostrar a busca assim);
 * usar é BAIXAR para o nosso armazenamento. O nome do autor fica à vista em
 * cada foto, como a Pixabay pede para quem mostra resultados da API.
 */
function DaPixabay({ busca, operador, segmentos, segmento, onCurou }) {
  const [ligado, setLigado] = useState(null);
  const [fotos, setFotos] = useState(null);
  const [pagina, setPagina] = useState(1);
  const [total, setTotal] = useState(0);
  const [erro, setErro] = useState('');
  const [fazendo, setFazendo] = useState(null);
  const [feitas, setFeitas] = useState({});
  const [curando, setCurando] = useState(null);

  useEffect(() => { pixabay.estado().then((r) => setLigado(!!r.configurado)).catch(() => setLigado(false)); }, []);

  useEffect(() => {
    if (!busca || !ligado) { setFotos(null); return; }
    let vivo = true;
    setFotos(null); setErro(''); setPagina(1);
    pixabay.buscar(busca)
      .then((r) => { if (vivo) { setFotos(r.fotos || []); setTotal(r.total || 0); } })
      .catch((e) => { if (vivo) { setErro(e.message || 'A Pixabay não respondeu agora.'); setFotos([]); } });
    return () => { vivo = false; };
  }, [busca, ligado]);

  async function mais() {
    const p = pagina + 1;
    try {
      const r = await pixabay.buscar(busca, { pagina: p });
      setFotos((a) => (a || []).concat(r.fotos || []));
      setPagina(p);
    } catch (e) { setErro(e.message || 'A Pixabay não respondeu agora.'); }
  }

  async function paraMidias(f) {
    setFazendo(f.id);
    try {
      await pixabay.usar(f.id);
      setFeitas((a) => ({ ...a, [f.id]: 'midias' }));
      aviso.ok('Está nas suas Mídias, com o crédito do autor.');
    } catch (e) { aviso.erro('pixabay', e.message || 'Não deu para baixar a foto.'); }
    finally { setFazendo(null); }
  }

  if (ligado === false) {
    return (
      <Panel>
        <PanelHeader title="Pixabay" />
        <p className="p-4 text-sm text-ink-2">A busca na Pixabay não está ligada neste servidor (falta a chave da Pixabay na configuração).</p>
      </Panel>
    );
  }
  if (!busca) return null;

  return (
    <Panel>
      <PanelHeader title="Da Pixabay" description={fotos ? `${total} foto(s) para "${busca}" · livres para uso, o crédito do autor vai junto` : 'Procurando…'} />
      {erro && <p className="px-4 pt-3 text-sm text-danger">{erro}</p>}
      {fotos === null ? (
        <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="aspect-video rounded-lg" />)}
        </div>
      ) : fotos.length === 0 ? (
        !erro && <p className="p-4 text-sm text-ink-3">Nada na Pixabay com essa palavra. Tente outra.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 lg:grid-cols-5">
            {fotos.map((f) => (
              <div key={f.id} className="overflow-hidden rounded-lg border border-line bg-surface-2">
                <div className="relative aspect-video bg-[#0a1128]">
                  <img src={f.previa} alt={f.tags} loading="lazy" className="h-full w-full object-cover" />
                  {fazendo === f.id && <span className="absolute inset-0 flex items-center justify-center bg-black/55 text-2xs font-semibold text-white">Baixando…</span>}
                </div>
                <div className="space-y-1 p-2">
                  <a href={f.pagina} target="_blank" rel="noreferrer" className="flex items-center gap-1 truncate text-2xs text-ink-3 hover:text-ink" title={'por ' + f.autor + ' · Pixabay'}>
                    por {f.autor} · Pixabay <ExternalLink size={10} className="shrink-0" />
                  </a>
                  <Button size="sm" variant={feitas[f.id] === 'midias' ? 'ghost' : 'secondary'} className="w-full" disabled={!!fazendo}
                    icon={feitas[f.id] === 'midias' ? Check : FolderPlus} onClick={() => paraMidias(f)}>
                    {feitas[f.id] === 'midias' ? 'Nas Mídias' : 'Pôr nas Mídias'}
                  </Button>
                  {operador && (
                    <Button size="sm" variant={feitas[f.id] === 'banco' ? 'ghost' : 'primary'} className="w-full" disabled={!!fazendo || feitas[f.id] === 'banco'}
                      icon={feitas[f.id] === 'banco' ? Check : Library} onClick={() => setCurando(f)}>
                      {feitas[f.id] === 'banco' ? 'No acervo' : 'Pôr no acervo comum'}
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
          {fotos.length < total && pagina < 10 && (
            <div className="px-4 pb-4"><Button size="sm" variant="ghost" onClick={mais}>Mais fotos</Button></div>
          )}
        </>
      )}
      {curando && (
        <Curadoria foto={curando} segmentos={segmentos} segmentoInicial={segmento} termo={busca}
          onFechar={() => setCurando(null)}
          onFeito={() => { setFeitas((a) => ({ ...a, [curando.id]: 'banco' })); setCurando(null); onCurou(); }} />
      )}
    </Panel>
  );
}

/*
 * Pôr no acervo comum (só o operador). Os termos da Pixabay pedem cuidado
 * com marca à vista e com pessoa reconhecível doente ou tomando remédio —
 * as duas confirmações são obrigatórias, e o servidor confere de novo.
 */
function Curadoria({ foto, segmentos, segmentoInicial, termo, onFechar, onFeito }) {
  const [segmento, setSegmento] = useState(segmentoInicial || '');
  const [descricao, setDescricao] = useState(termo || foto.tags || '');
  const [semMarca, setSemMarca] = useState(false);
  const [semPessoaDoente, setSemPessoaDoente] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');
  const pode = segmento && descricao.trim() && semMarca && semPessoaDoente && !enviando;

  async function enviar() {
    setEnviando(true); setErro('');
    try {
      await bancoImagens.curarPixabay({ id: foto.id, segmento, descricao: descricao.trim(), confirmou: { semMarca, semPessoaDoente } });
      aviso.ok('Foto no acervo comum de ' + ((segmentos.find((s) => s.id === segmento) || {}).nome || segmento) + '.');
      onFeito();
    } catch (e) { setErro(e.message || 'Não deu para pôr no acervo.'); }
    finally { setEnviando(false); }
  }

  return (
    <Dialog open onClose={onFechar} title="Pôr no acervo comum"
      description="A foto fica para todos os clientes do segmento, com o crédito do autor. Ela é baixada para o nosso servidor: a TV nunca depende da Pixabay."
      footer={<><Button variant="ghost" onClick={onFechar}>Cancelar</Button><Button variant="primary" icon={Library} disabled={!pode} onClick={enviar}>{enviando ? 'Guardando…' : 'Pôr no acervo'}</Button></>}>
      <div className="space-y-3">
        <img src={foto.previa} alt={foto.tags} className="mx-auto max-h-48 rounded-md" />
        <Field label="Segmento">
          <Select value={segmento} onChange={(e) => setSegmento(e.target.value)}>
            <option value="">Escolha…</option>
            {segmentos.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
          </Select>
        </Field>
        <Field label="Descrição (é o que a busca encontra)">
          <Input value={descricao} onChange={(e) => setDescricao(e.target.value)} maxLength={180} />
        </Field>
        <label className="flex items-start gap-2 text-sm text-ink">
          <input type="checkbox" className="mt-0.5" checked={semMarca} onChange={(e) => setSemMarca(e.target.checked)} />
          <span>Não tem logo, marca ou produto de marca à vista.</span>
        </label>
        <label className="flex items-start gap-2 text-sm text-ink">
          <input type="checkbox" className="mt-0.5" checked={semPessoaDoente} onChange={(e) => setSemPessoaDoente(e.target.checked)} />
          <span>Não mostra pessoa reconhecível doente ou tomando remédio.</span>
        </label>
        {erro && <p className="text-sm text-danger">{erro}</p>}
      </div>
    </Dialog>
  );
}
