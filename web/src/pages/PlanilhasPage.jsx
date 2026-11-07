import React, { useState } from 'react';
import { Sheet, Plus, Trash2, RefreshCw, MonitorPlay, AlertTriangle, Upload, Link2, Check } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader.jsx';
import { Panel } from '../components/ui/Panel.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Dialog } from '../components/ui/Dialog.jsx';
import { Field, Input, Select } from '../components/ui/Field.jsx';
import { Partes } from '../components/ui/Partes.jsx';
import { EscolherArquivo } from '../components/ui/EscolherArquivo.jsx';
import { EmptyState, ErrorState, Spinner } from '../components/ui/Feedback.jsx';
import { useAsync } from '../lib/useAsync.js';
import { aviso } from '../lib/avisos.js';
import { confirmar } from '../lib/confirmar.js';
import { planilhas, devices, brand } from '../api.js';
import { gravarEmLote, avisarComDesfazer, zonasPorPapel } from '../lib/rodar.js';
import { carregarModelos, itemDoModelo } from '../lib/modelosOuro.js';
import { AtalhosDeGrupo } from '../components/tela/AtalhosDeGrupo.jsx';
import { usePerfil } from '../lib/perfil.js';
import '../../../js/precos.js';

/*
 * PREÇOS DA PLANILHA (fase 11, "dados vivos"). O dono já tem a planilha dos
 * preços: cola o link do Google Planilhas (ou manda o CSV) e a TV passa a
 * ler de lá. Mudou o preço na planilha, a TV muda em até 5 minutos, com
 * "Atualizado às 14:05" na tela. Planilha com erro não quebra nada: a TV
 * fica com os últimos preços bons, e aqui aparece o que deu errado, em
 * palavras. O servidor lê só do Google (server/planilha.js).
 */
const P = globalThis.MTPrecos;

function haQuanto(t) {
  if (!t) return 'nunca';
  const min = Math.round((Date.now() - t) / 60000);
  if (min < 1) return 'agora há pouco';
  if (min < 60) return 'há ' + min + ' min';
  const h = Math.round(min / 60);
  return h < 24 ? 'há ' + h + ' h' : 'há ' + Math.round(h / 24) + ' dias';
}
const hora = (t) => (t ? new Date(t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '');
const secoesDa = (p) => [...new Set((p.itens || []).map((i) => i.secao).filter(Boolean))];

function ComoLigar() {
  return (
    <div className="space-y-2 rounded-lg border border-line bg-surface-2 p-3 text-sm text-ink-2">
      <div className="font-medium text-ink">No Google Planilhas</div>
      <ol className="list-decimal space-y-0.5 pl-5">
        <li>Toque em <b>Compartilhar</b>.</li>
        <li>Em “Acesso geral”, escolha <b>Qualquer pessoa com o link</b> (Leitor).</li>
        <li>Toque em <b>Copiar link</b> e cole aqui.</li>
      </ol>
      <div className="text-xs text-ink-3">Uma linha por item: <b>Item</b> | <b>Preço</b> | Seção (opcional) | Descrição (opcional). A primeira linha pode ter os nomes das colunas.</div>
    </div>
  );
}

// Ligar uma planilha nova, ou trocar o link/arquivo de uma que já existe.
function LigarPlanilha({ atual, onFechar, onPronto }) {
  const perfil = usePerfil();
  const [jeito, setJeito] = useState(atual && atual.origem === 'csv' ? 'csv' : 'link');
  const [nome, setNome] = useState(atual ? atual.nome : (perfil.id === 'saude' ? 'Exames e serviços' : 'Preços'));
  const [link, setLink] = useState(atual ? atual.link : '');
  const [arquivo, setArquivo] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');

  function lerArquivo(e) {
    const f = e.target.files && e.target.files[0];
    setErro('');
    if (!f) return setArquivo(null);
    if (f.size > 512 * 1024) { setArquivo(null); return setErro('O arquivo passou de 512 KB. Deixe só os itens que vão para a TV.'); }
    const leitor = new FileReader();
    leitor.onload = () => setArquivo({ nome: f.name, texto: String(leitor.result || '') });
    leitor.onerror = () => setErro('Não deu para abrir o arquivo.');
    leitor.readAsText(f, 'utf-8');
  }

  async function salvar() {
    setEnviando(true); setErro('');
    try {
      const corpo = { nome, ...(jeito === 'csv' ? { csv: arquivo ? arquivo.texto : '' } : { link }) };
      const r = atual ? await planilhas.atualizar(atual.id, corpo) : await planilhas.criar(corpo);
      if (r.erro) aviso.erro('planilha', 'A planilha foi ligada, mas não deu para ler: ' + r.erro + '.');
      else aviso.ok((r.planilha.itens || []).length + ' itens lidos da planilha.');
      onPronto();
    } catch (e) { setErro(e.message || 'Não deu certo.'); }
    finally { setEnviando(false); }
  }
  const pronto = nome.trim() && (jeito === 'csv' ? !!arquivo : !!link.trim());
  return (
    <Dialog open onClose={onFechar} title={atual ? 'Trocar a planilha: ' + atual.nome : 'Ligar uma planilha'} className="max-w-xl"
      description="Os preços passam a vir da planilha. Mudou lá, a TV muda em até 5 minutos."
      footer={<Button variant="primary" icon={Check} disabled={!pronto || enviando} onClick={salvar}>{enviando ? 'Lendo a planilha…' : atual ? 'Salvar e ler agora' : 'Ligar a planilha'}</Button>}>
      <div className="space-y-3">
        <Field label="Nome"><Input value={nome} onChange={(e) => setNome(e.target.value)} maxLength={60} placeholder="Ex.: Cardápio do café" /></Field>
        <Partes rotulo="De onde vêm os preços" valor={jeito} onChange={setJeito} opcoes={[['link', 'Link do Google Planilhas'], ['csv', 'Arquivo CSV']]} />
        {jeito === 'link' ? (
          <>
            <Field label="Link da planilha"><Input value={link} onChange={(e) => setLink(e.target.value)} maxLength={500} placeholder="https://docs.google.com/spreadsheets/d/…" /></Field>
            <ComoLigar />
          </>
        ) : (
          <Field label="Arquivo CSV" hint="No Excel ou no Google Planilhas: Arquivo › Salvar como (ou Fazer download) › CSV. Para mudar os preços, envie o arquivo de novo.">
            <EscolherArquivo accept=".csv,text/csv,text/plain" onChange={lerArquivo} rotulo="Escolher o arquivo CSV"
              className="flex w-full items-center gap-2 rounded-md border border-dashed border-line-strong px-3 py-3 text-left text-sm text-ink-2 hover:bg-surface-2">
              <Upload size={16} /> {arquivo ? arquivo.nome : 'Escolher o arquivo'}
            </EscolherArquivo>
          </Field>
        )}
        {erro && <p className="flex items-start gap-1.5 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-ink"><AlertTriangle size={15} className="mt-0.5 shrink-0 text-danger" />{erro}</p>}
      </div>
    </Dialog>
  );
}

/*
 * Pôr na TV: a tabela de preços (todos os itens, com as seções) ou o
 * cardápio pronto (a peça com a marca). Os dois guardam uma cópia dos
 * preços de agora: a TV que liga sem rede mostra essa cópia até ler a
 * planilha.
 */
function PorNaTv({ planilha, onFechar }) {
  const perfil = usePerfil();
  const { data } = useAsync(devices.list);
  const telas = (data && data.devices) || [];
  const secoes = secoesDa(planilha);
  const [formato, setFormato] = useState('tabela');
  const [secao, setSecao] = useState('');
  const [titulo, setTitulo] = useState('');
  const [alvos, setAlvos] = useState(null);
  const marcados = alvos || telas.map((t) => t.id);
  const [enviando, setEnviando] = useState(false);
  const tituloFinal = (titulo.trim() || secao || planilha.nome).slice(0, 60);

  async function itemDoCardapio() {
    const [modelos, kit] = await Promise.all([carregarModelos(), brand.get().catch(() => null)]);
    // Com seções e sem filtro, o cardápio por seção; senão, a lista de itens.
    const id = !secao && secoes.length >= 2 ? 'cardapio-categorias' : 'cardapio-colunas';
    const modelo = modelos.find((m) => m.id === id);
    if (!modelo) throw new Error('O cardápio pronto não abriu agora. Tente a tabela de preços.');
    const k = (kit && kit.kit) || {};
    const marca = { cores: k.cores || [], fonteTitulo: k.fonteTitulo || '', fonteApoio: k.fonteApoio || '', clima: k.clima || '', nome: (k.nome && k.nome !== 'Marca principal' ? k.nome : (kit && kit.empresa)) || '' };
    const base = itemDoModelo(modelo, marca, perfil.id);
    const declarados = globalThis.MTPecaHtml.higienizar(modelo.arq).campos;
    const r = P.camposDaPeca(declarados.map((c) => c.nome), planilha.itens, secao);
    // Só o que veio da planilha, o título e a marca: o texto de exemplo do modelo não vai para a TV (fase 4).
    const campos = { ...r.campos, titulo: tituloFinal, ...(base.campos.marca ? { marca: base.campos.marca } : {}) };
    const ocultos = r.esconder.slice();
    for (const c of declarados) {
      if (c.tipo !== 'texto' || c.nome === 'marca' || campos[c.nome] !== undefined) continue;
      campos[c.nome] = ''; ocultos.push(c.nome);
    }
    return { ...base, campos, ocultos, origem: { ...base.origem, pedido: 'planilha: ' + planilha.nome } };
  }

  async function enviar() {
    setEnviando(true);
    try {
      const vivo = { planilha: planilha.id, ...(secao ? { planilhaSecao: secao } : {}) };
      const item = formato === 'cardapio'
        ? { ...(await itemDoCardapio()), ...vivo }
        : { type: 'precos', titulo: tituloFinal.toUpperCase(), colunas: 'auto', duracao: 20, rodape: '', linhas: P.textoDaPlanilha(planilha.itens, secao), ...vivo };
      const escolhidas = telas.filter((t) => marcados.includes(t.id));
      const mesma = (i) => i && i.planilha === planilha.id && i.type === item.type && (i.planilhaSecao || '') === (secao || '');
      const r = await gravarEmLote(escolhidas, (cfg) => {
        const next = JSON.parse(JSON.stringify(cfg || {}));
        next.zonas = next.zonas || {};
        const z = zonasPorPapel(next).principal || 'principal';
        const zona = next.zonas[z] && Array.isArray(next.zonas[z].items) ? next.zonas[z] : { items: [] };
        // Pôr de novo troca a que já estava (não duplica a mesma planilha na mesma TV).
        next.zonas[z] = { ...zona, items: zona.items.filter((i) => !mesma(i)).concat(item) };
        return next;
      }, 'Planilha: ' + planilha.nome);
      avisarComDesfazer(tituloFinal + ' na TV' + (escolhidas.length === 1 ? '.' : 's (' + escolhidas.length + ').'), r.lote);
      onFechar();
    } catch (e) { aviso.erro('planilha', e.message || 'Não deu para pôr na TV.'); }
    finally { setEnviando(false); }
  }

  return (
    <Dialog open onClose={onFechar} title={'Pôr na TV: ' + planilha.nome} className="max-w-md"
      description="Entra na área principal e se atualiza sozinho quando a planilha muda."
      footer={<Button variant="primary" icon={MonitorPlay} disabled={!marcados.length || enviando} onClick={enviar}>{enviando ? 'Enviando…' : marcados.length === 1 ? 'Pôr na TV' : 'Pôr em ' + marcados.length + ' TVs'}</Button>}>
      <div className="space-y-3">
        <Partes rotulo="Como aparece" valor={formato} onChange={setFormato} opcoes={[['tabela', 'Tabela de preços'], ['cardapio', 'Cardápio pronto']]} />
        <p className="-mt-2 text-xs text-ink-3">{formato === 'tabela' ? 'Todos os itens, com as seções. A letra se ajusta à quantidade.' : 'A peça com a sua marca: até 6 itens (ou 3 seções com 3 itens).'}</p>
        {secoes.length > 0 && (
          <Field label="Quais itens">
            <Select value={secao} onChange={(e) => setSecao(e.target.value)}>
              <option value="">Todos</option>
              {secoes.map((s) => <option key={s} value={s}>Só {s}</option>)}
            </Select>
          </Field>
        )}
        <Field label="Título"><Input value={titulo} onChange={(e) => setTitulo(e.target.value)} maxLength={60} placeholder={secao || planilha.nome} /></Field>
        <div>
          <div className="mb-1 text-sm font-medium text-ink">Em quais TVs</div>
          <AtalhosDeGrupo telas={telas} alvos={marcados} onEscolher={setAlvos} />
          <ul className="space-y-1">
            {telas.map((t) => (
              <li key={t.id}><label className="flex items-center gap-2 text-sm text-ink">
                <input type="checkbox" checked={marcados.includes(t.id)} onChange={(e) => setAlvos(e.target.checked ? marcados.concat(t.id) : marcados.filter((x) => x !== t.id))} /> {t.name || 'TV'}
              </label></li>
            ))}
          </ul>
          {!telas.length && <p className="text-sm text-ink-3">Você ainda não tem TV conectada.</p>}
        </div>
      </div>
    </Dialog>
  );
}

function Planilha({ p, onTrocar, onPorNaTv, onMudou }) {
  const [lendo, setLendo] = useState(false);
  const itens = p.itens || [];
  async function lerAgora() {
    setLendo(true);
    try {
      const r = await planilhas.lerAgora(p.id);
      if (r.erro) aviso.erro('planilha', 'Não deu para ler: ' + r.erro + '.');
      else aviso.ok('Planilha lida: ' + (r.planilha.itens || []).length + ' itens.');
      onMudou();
    } catch (e) { aviso.erro('planilha', e.message || 'Não deu certo.'); }
    finally { setLendo(false); }
  }
  async function apagar() {
    if (!(await confirmar({ titulo: 'Desligar a planilha ' + p.nome + '?', texto: 'Na TV, as peças dela ficam com os últimos preços lidos e param de se atualizar.', botao: 'Desligar', perigo: true }))) return;
    try { await planilhas.remover(p.id); onMudou(); } catch (e) { aviso.erro('planilha', e.message || 'Não deu certo.'); }
  }
  return (
    <Panel className="p-4">
      <div className="flex flex-wrap items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">{p.origem === 'csv' ? <Upload size={18} /> : <Sheet size={18} />}</span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-ink">{p.nome}</div>
          <div className="text-sm text-ink-3">
            {p.origem === 'csv' ? 'Arquivo CSV enviado' : 'Google Planilhas · a TV confere a cada 5 minutos'}
            {itens.length ? ' · ' + (itens.length === 1 ? '1 item' : itens.length + ' itens') : ''}
            {p.ultimoOk ? (p.ultimoErro ? ' · última leitura boa ' : ' · lida ') + haQuanto(p.ultimoOk) : ''}
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Button size="sm" variant="secondary" icon={MonitorPlay} disabled={!itens.length} onClick={onPorNaTv}>Pôr na TV</Button>
          {p.origem !== 'csv' && <Button size="sm" variant="ghost" icon={RefreshCw} disabled={lendo} onClick={lerAgora}>{lendo ? 'Lendo…' : 'Ler agora'}</Button>}
          <Button size="sm" variant="ghost" icon={p.origem === 'csv' ? Upload : Link2} onClick={onTrocar}>{p.origem === 'csv' ? 'Enviar de novo' : 'Trocar o link'}</Button>
          <Button size="sm" variant="ghost" icon={Trash2} onClick={apagar}>Desligar</Button>
        </div>
      </div>
      {p.ultimoErro && (
        <p className="mt-3 flex items-start gap-1.5 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-ink">
          <AlertTriangle size={15} className="mt-0.5 shrink-0 text-danger" />
          <span>Não deu para ler a planilha: {p.ultimoErro}.{itens.length ? ' A TV continua com os preços lidos às ' + hora(p.ultimoOk) + '.' : ''}</span>
        </p>
      )}
      {!p.ultimoErro && p.aviso && <p className="mt-3 rounded-md border border-warn/40 bg-warn/10 px-3 py-2 text-sm text-ink">Atenção: {p.aviso}.</p>}
      {itens.length > 0 && (
        <div className="mt-3 overflow-hidden rounded-lg border border-line">
          <table className="w-full text-sm">
            <tbody className="divide-y divide-line/60">
              {itens.slice(0, 8).map((i, n) => (
                <tr key={n}>
                  <td className="px-3 py-1.5 text-ink">{i.item}{i.descricao ? <span className="text-ink-3"> · {i.descricao}</span> : null}</td>
                  {secoesDa(p).length > 0 && <td className="px-3 py-1.5 text-ink-3">{i.secao}</td>}
                  <td className="tnum px-3 py-1.5 text-right font-medium text-ink">{i.preco != null ? P.formatarPreco(String(i.preco)) : (i.texto || '—')}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {itens.length > 8 && <div className="border-t border-line px-3 py-1.5 text-xs text-ink-3">e mais {itens.length - 8} itens</div>}
        </div>
      )}
    </Panel>
  );
}

export function PlanilhasPage() {
  const perfil = usePerfil();
  const { data, error, loading, reload } = useAsync(planilhas.list);
  const [ligando, setLigando] = useState(null);
  const [naTv, setNaTv] = useState(null);
  const lista = (data && data.planilhas) || [];

  if (error) return <ErrorState title="Não deu para abrir as planilhas" description={error.message} onRetry={reload} />;
  return (
    <div className="max-w-4xl">
      <PageHeader title="Preços da planilha" subtitle={'Você muda o preço na planilha ' + perfil.lugarDe + ' e a TV muda junto, em até 5 minutos.'}
        actions={<Button variant="primary" icon={Plus} onClick={() => setLigando({})}>Ligar uma planilha</Button>} />
      {loading && !data ? <div className="flex justify-center py-16"><Spinner size={22} /></div> : lista.length === 0 ? (
        <Panel className="p-4">
          <EmptyState icon={Sheet} title="Nenhuma planilha ligada" exemplo={['Café expresso', 'R$ 6,00', 'atualizado às 14:05']}
            description="Cole o link da planilha do Google Planilhas, ou envie um arquivo CSV. A TV mostra os preços e avisa a hora da última leitura." />
          <div className="mx-auto max-w-lg"><ComoLigar /></div>
        </Panel>
      ) : (
        <div className="space-y-3">
          {lista.map((p) => <Planilha key={p.id} p={p} onMudou={reload} onTrocar={() => setLigando(p)} onPorNaTv={() => setNaTv(p)} />)}
        </div>
      )}
      {ligando && <LigarPlanilha atual={ligando.id ? ligando : null} onFechar={() => setLigando(null)} onPronto={() => { setLigando(null); reload(); }} />}
      {naTv && <PorNaTv planilha={naTv} onFechar={() => setNaTv(null)} />}
    </div>
  );
}
