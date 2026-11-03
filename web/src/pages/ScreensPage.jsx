import React, { useState } from 'react';
import { MonitorPlay, Plus, Pencil, Trash2, RadioTower, LayoutTemplate, Archive, Download, Upload, Copy, Check, Music, RefreshCw, Bell, BellOff, RotateCw, Eye, MoreHorizontal } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader.jsx';
import { Panel, PanelHeader, PanelFooter } from '../components/ui/Panel.jsx';
import { Table, THead, TBody, TH, TR, TD } from '../components/ui/Table.jsx';
import { Badge } from '../components/ui/Badge.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Field, Input, Select } from '../components/ui/Field.jsx';
import { Dialog } from '../components/ui/Dialog.jsx';
import { SkeletonRows, ErrorState, EmptyState } from '../components/ui/Feedback.jsx';
import { StatusDot } from '../components/ui/Badge.jsx';
import { useAsync } from '../lib/useAsync.js';
import { devices, deviceConfig, criar, brand } from '../api.js';
import { porCampanhaNaTela, gravarEmLote } from '../lib/rodar.js';
import { carregarTelasProntas, telaParaComecar, aplicarTelaPronta, marcaDaConta, tvEmPe } from '../lib/telasProntas.js';
import { paraGente, codigoDaTv } from '../lib/erros.js';
import { DesignThumb } from '../components/content/DesignThumb.jsx';
import { deviceStatus } from '../lib/deviceStatus.js';
import { SoundRemote } from '../components/content/SoundRemote.jsx';
import { VerTelaAgora } from '../components/content/VerTelaAgora.jsx';
import { MiniaturaDaTela } from '../components/tela/MiniaturaDaTela.jsx';
import { esquecerParear } from '../lib/parearPendente.js';
import { aviso } from '../lib/avisos.js';
import { confirmar } from '../lib/confirmar.js';
import { CamposDoHorario } from '../components/tela/HorarioDaTela.jsx';
import '../../../js/aparelho.js';
import { usePerfil, perfilAtual } from '../lib/perfil.js';
import { EscolherArquivo } from '../components/ui/EscolherArquivo.jsx';

export function ScreensPage({ onEditContent, onCriar, parear, abrirParear, onIrParaPlano, papel }) {
  // Membro não liga TV nova nem remove (entra/sai da mensalidade): o servidor recusa; aqui nem aparece.
  const podeGerir = papel !== 'member';
  const { data, loading, error, reload } = useAsync(devices.list);
  const todas = data ? data.devices || [] : [];
  /*
   * Grupos ("Loja Centro", "Loja Sul"): um rótulo por tela. O filtro só
   * aparece quando existe grupo — conta de uma tela não precisa dele.
   */
  const grupos = Array.from(new Set(todas.map((d) => d.grupo).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const [filtroGrupo, setFiltroGrupo] = useState('');
  const [renomeandoGrupo, setRenomeandoGrupo] = useState(null);
  const list = filtroGrupo === '' ? todas
    : filtroGrupo === '__sem' ? todas.filter((d) => !d.grupo)
    : todas.filter((d) => d.grupo === filtroGrupo);

  // Vindo do QR da TV, o diálogo já abre com o código.
  // Do Início ou do Criar ("Ligar a TV"), o pareamento já abre.
  const [pairOpen, setPairOpen] = useState(!!parear || (!!abrirParear && podeGerir));
  React.useEffect(() => {
    if (!parear) return;
    const u = new URL(window.location.href);
    if (u.searchParams.has('parear')) { u.searchParams.delete('parear'); u.searchParams.set('ir', 'screens'); window.history.replaceState(window.history.state, '', u.pathname + u.search); }
  }, [parear]);
  // Som ao vivo: atalho a partir da frota. Durante um evento, mexer no volume
  // não pode custar entrar na tela, abrir ajustes e rolar até o fim.
  const [somTarget, setSomTarget] = useState(null);
  const [renameTarget, setRenameTarget] = useState(null);
  const [removeTarget, setRemoveTarget] = useState(null);
  const [reconnectTarget, setReconnectTarget] = useState(null);
  const [backupTarget, setBackupTarget] = useState(null);
  const [alertaTarget, setAlertaTarget] = useState(null);
  const [verTarget, setVerTarget] = useState(null);

  return (
    <div>
      <PageHeader
        title="Telas"
        subtitle="As TVs ligadas à sua conta."
        actions={todas.length > 0 && <>
          {/* Abre uma TV nova NESTE aparelho (útil num computador ligado à TV,
              ou para testar). No celular só confundia: virava uma "tela" a mais. */}
          <Button variant="secondary" icon={MonitorPlay} className="hidden sm:inline-flex"
            title="Abre a tela da TV numa aba nova deste computador"
            onClick={() => window.open('/player.html?cloud=1&pid=' + Math.random().toString(36).slice(2, 9), '_blank', 'noopener')}>Usar este computador como TV</Button>
          {podeGerir && <Button variant="primary" icon={Plus} onClick={() => setPairOpen(true)}>Parear tela</Button>}
        </>}
      />

      <Panel>
        <PanelHeader title="Suas telas" description="Cada tela recebe as publicações na hora que você salva." />
        {grupos.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 border-b border-line px-4 py-2.5">
            {[['', 'Todas', todas.length], ...grupos.map((g) => [g, g, todas.filter((d) => d.grupo === g).length]),
              ['__sem', 'Sem grupo', todas.filter((d) => !d.grupo).length]].map(([v, rot, n]) => (
              <button key={v || 'todas'} type="button" onClick={() => setFiltroGrupo(v)}
                className={'rounded-full border px-2.5 py-0.5 text-xs transition ' + (filtroGrupo === v ? 'border-accent bg-accent-soft text-ink' : 'border-line text-ink-3 hover:text-ink')}>
                {rot} <span className="tnum text-ink-3">{n}</span>
              </button>
            ))}
            {filtroGrupo && filtroGrupo !== '__sem' && (
              <button type="button" className="ml-auto text-xs text-accent hover:underline"
                onClick={() => setRenomeandoGrupo(filtroGrupo)}>Renomear grupo</button>
            )}
          </div>
        )}

        {loading && <SkeletonRows rows={5} cols={4} />}
        {error && <ErrorState description="Não foi possível carregar as telas." onRetry={reload} />}
        {/* Filtro sem resultado não é conta sem TV ("Sem grupo" com zero mostrava "Ligar a primeira"). */}
        {!loading && !error && todas.length > 0 && list.length === 0 && (
          <p className="p-6 text-center text-sm text-ink-3">Nenhuma TV neste grupo.</p>
        )}
        {!loading && !error && todas.length === 0 && (
          <EmptyState
            icon={MonitorPlay}
            title="Nenhuma TV ainda"
            description={podeGerir
              ? 'Ligue a TV no app MultiTelas TV (ou abra o endereço no navegador dela). Ela mostra um código e um QR: aponte o celular para o QR, ou toque abaixo e digite o código.'
              : 'Quem liga uma TV nova é o dono ou um administrador da conta (ela entra na mensalidade). Peça a eles; depois ela aparece aqui.'}
            action={podeGerir && <div className="flex flex-col items-center gap-2">
              {/* Um caminho só na conta sem TV: o topo não repete o botão (D2). */}
              <Button size="sm" variant="primary" icon={Plus} onClick={() => setPairOpen(true)}>Ligar a primeira TV</Button>
              <button type="button" className="hidden text-xs text-accent hover:underline sm:block"
                onClick={() => window.open('/player.html?cloud=1&pid=' + Math.random().toString(36).slice(2, 9), '_blank', 'noopener')}>ou usar este computador como TV</button>
            </div>}
          />
        )}

        {!loading && !error && list.length > 0 && (
          <>
            <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">
              {list.map((d) => (
                <FleetCard key={d.id} d={d}
                  onSom={() => setSomTarget(d)}
                  onVer={() => setVerTarget(d)}
                  onContent={() => onEditContent(d)}
                  onRename={() => setRenameTarget(d)}
                  onReconnect={() => setReconnectTarget(d)}
                  onBackup={() => setBackupTarget(d)}
                  onAlerta={() => setAlertaTarget(d)}
                  onRemove={podeGerir ? () => setRemoveTarget(d) : null} />
              ))}
            </div>
            <PanelFooter><span>{list.length} {list.length === 1 ? 'tela' : 'telas'}</span></PanelFooter>
          </>
        )}
      </Panel>

      <PairDialog open={pairOpen} codigoInicial={parear} onClose={() => setPairOpen(false)} onDone={reload}
        onConteudo={(dev) => { setPairOpen(false); onEditContent(dev); }}
        onCriar={onCriar && ((dev) => { setPairOpen(false); onCriar(dev); })} onIrParaPlano={onIrParaPlano} />
      <RenomearGrupoDialog grupo={renomeandoGrupo} onClose={() => setRenomeandoGrupo(null)}
        onDone={(para) => { setFiltroGrupo(para); reload(); }} />
      <RenameDialog target={renameTarget} grupos={grupos} onClose={() => setRenameTarget(null)} onDone={reload} />
      <Dialog
        open={!!somTarget}
        onClose={() => setSomTarget(null)}
        title={'Som · ' + ((somTarget && somTarget.name) || 'Tela')}
        description="Age na TV na hora. A playlist fica em Conteúdo › Ajustes da tela."
      >
        {somTarget && <SoundRemote deviceId={somTarget.id} />}
      </Dialog>
      <VerTelaAgora target={verTarget} onClose={() => setVerTarget(null)} />
      <ReconnectDialog target={reconnectTarget} onClose={() => setReconnectTarget(null)} onDone={reload} />
      <RemoveDialog target={removeTarget} onClose={() => setRemoveTarget(null)} onDone={reload} />
      <ExpedienteDialog target={alertaTarget} onClose={() => setAlertaTarget(null)} onDone={reload} />
      <BackupDialog target={backupTarget} screens={todas} onClose={() => setBackupTarget(null)} onDone={reload} />
    </div>
  );
}

/*
 * O cartão de uma TV. Pensado para o dono da loja, no celular (QA de 26/10:
 * "o cartão da TV tem seis ícones sem rótulo; ninguém sabe o que é o sino").
 *
 *   - Em cima, a TV em miniatura com o que ela está mostrando agora.
 *   - O estado em palavras: "No ar", "Fora do ar há 2 h" — e, fora do ar, o
 *     que fazer, com o botão que resolve.
 *   - Duas ações com nome: mudar o que passa e ver a TV agora. O resto
 *     (nome, recarregar, som, horário, backup, remover) mora em "Mais
 *     opções", cada uma com o nome escrito.
 */
function FleetCard({ d, onSom, onVer, onContent, onRename, onReconnect, onBackup, onAlerta, onRemove }) {
  const st = deviceStatus(d.lastSeen);
  const online = st.tone === 'ok';
  const [mais, setMais] = useState(false);
  /*
   * Recarregar a TV daqui: o "desliga e liga" que resolve metade dos
   * chamados, sem ninguém ir até ela. Chega na hora pelo tempo real, ou em
   * até 30s pelo pulso se o tempo real estiver caído.
   */
  const [recarregando, setRecarregando] = useState('');
  async function recarregar() {
    setRecarregando('enviando');
    try { await devices.comando(d.id, 'recarregar'); setRecarregando('ok'); }
    catch (e) { setRecarregando('erro'); }
    setTimeout(() => setRecarregando(''), 4000);
  }
  const fechar = (fn) => () => { setMais(false); fn(); };
  const semAlerta = d.expediente && d.expediente.alerta === false;
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface transition hover:border-line-strong">
      <div className="relative flex aspect-video items-center justify-center overflow-hidden border-b border-line bg-gradient-to-br from-surface-2 to-accent-soft/40">
        <MiniaturaDaTela d={d} online={online} vazia={!d.hasConfig} />
        <div className="absolute left-2 top-2 inline-flex items-center gap-1.5 rounded-full bg-surface/90 px-2 py-0.5 text-xs font-medium backdrop-blur">
          <StatusDot tone={st.tone} pulse={st.pulse} /><span className="text-ink">{st.label}</span>
        </div>
      </div>
      <div className="space-y-2.5 p-3">
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="truncate text-base font-semibold text-ink">{d.name || 'Tela sem nome'}</span>
            {d.grupo && <span className="shrink-0 rounded-full bg-surface-2 px-2 py-0.5 text-xs text-ink-3">{d.grupo}</span>}
          </div>
          <div className="truncate text-xs text-ink-3">
            {recarregando === 'ok' ? 'Recarregando a TV…' : recarregando === 'erro' ? 'Não consegui mandar o comando'
              : <>{online ? 'Deu sinal ' + (st.seen || 'agora') : st.seen ? 'Último sinal ' + st.seen : 'Ainda não deu sinal'}{descreverAparelho(d.info)}</>}
          </div>
          {/* D41: a casca Android está atrás da publicada. A de antes do D41 não se atualiza: reinstala uma vez. */}
          {d.appNovo && (
            <div className="truncate text-xs text-warn" title={'App ' + d.appNovo + ' publicado'}>
              {d.info && d.info.appCodigo
                ? 'App novo (' + d.appNovo + '): aperte OK no controle da TV'
                : 'App novo (' + d.appNovo + '): instale uma vez pelo pendrive'}
            </div>
          )}
        </div>
        {/*
          * Tela fora do ar quase sempre é a TV que voltou sem o vínculo — o
          * navegador dela limpou o armazenamento ao fechar. O caminho de
          * volta fica aqui, onde o cliente vê o problema, com o que fazer
          * escrito, e não escondido atrás de um ícone.
          */}
        {!online && d.lastSeen && (
          <div className="rounded-lg border border-warn-soft bg-warn-soft px-3 py-2 text-xs text-ink-2">
            Confira se a TV está ligada e com internet. Se ela estiver mostrando um código, toque em <b>Reconectar</b>.
            <div className="mt-2"><Button size="sm" variant="secondary" icon={RefreshCw} onClick={onReconnect}>Reconectar</Button></div>
          </div>
        )}
        <div className="grid grid-cols-2 gap-2">
          <Button variant="primary" icon={LayoutTemplate} onClick={onContent} className="col-span-2">{d.hasConfig ? 'Mudar o que passa' : 'Pôr conteúdo nesta TV'}</Button>
          <Button variant="secondary" icon={Eye} onClick={onVer} title="Ver a tela agora">Ver agora</Button>
          <Button variant="secondary" icon={MoreHorizontal} onClick={() => setMais(true)} aria-label={'Mais opções da TV ' + (d.name || '')}>Mais opções</Button>
        </div>
      </div>

      <Dialog open={mais} onClose={() => setMais(false)} title={d.name || 'Tela sem nome'}
        description={'Código da TV: ' + (d.code || '—') + (d.grupo ? ' · Grupo ' + d.grupo : '')}>
        <div className="-mx-1 flex flex-col">
          <OpcaoDaTela icon={Pencil} titulo="Nome e grupo" texto="Ex.: Recepção, Loja Centro." onClick={fechar(onRename)} />
          <OpcaoDaTela icon={RotateCw} titulo="Recarregar a TV" texto="O “desliga e liga”, sem ir até ela." onClick={fechar(recarregar)} disabled={!!recarregando} />
          <OpcaoDaTela icon={Music} titulo="Som ao vivo" texto="Volume e música, na hora." onClick={fechar(onSom)} />
          <OpcaoDaTela icon={semAlerta ? BellOff : Bell} titulo="Horário e aviso de queda"
            texto={semAlerta ? 'O aviso por e-mail está desligado.' : 'Quando a loja abre e o e-mail se a TV cair.'} onClick={fechar(onAlerta)} />
          <OpcaoDaTela icon={Archive} titulo="Backup e cópia" texto="Guardar, restaurar ou copiar de outra TV." onClick={fechar(onBackup)} />
          {/* Sempre à mão (QA de 03/11): a TV que perdeu o vínculo mostra o código na hora, e o painel só a diz "fora do ar" depois de 90 s. */}
          <OpcaoDaTela icon={RefreshCw} titulo="Reconectar" texto="A TV voltou mostrando um código." onClick={fechar(onReconnect)} />
          {onRemove && <OpcaoDaTela icon={Trash2} titulo="Remover a TV" texto="Desliga esta TV da sua conta." perigo onClick={fechar(onRemove)} />}
        </div>
      </Dialog>
    </div>
  );
}

// Uma linha do "Mais opções": ícone, nome e o que faz. Alta o bastante para o dedo (44 px).
function OpcaoDaTela({ icon: Icon, titulo, texto, onClick, perigo, disabled }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      className={'flex min-h-[52px] w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition hover:bg-surface-2 disabled:opacity-50 ' + (perigo ? 'text-danger' : 'text-ink')}>
      <Icon size={18} className="shrink-0" />
      <span className="min-w-0">
        <span className="block text-sm font-medium">{titulo}</span>
        <span className="block text-xs text-ink-3">{texto}</span>
      </span>
    </button>
  );
}

/*
 * "1920×1080 · Android" a partir do que a TV contou no último pulso. Só o
 * essencial para o suporte; o texto inteiro do navegador fica no title.
 */
function descreverAparelho(info) {
  // A regra mora em js/aparelho.js: a frota do operador descreve igual.
  const d = globalThis.MTAparelho.descrever(info);
  return d ? ' · ' + d : '';
}

/*
 * Reconectar: esta tela do painel volta a ser aquela TV ali.
 *
 * A TV guarda a própria identidade no navegador dela, e o navegador da
 * Samsung limpa isso ao fechar. Quando isso acontece, a TV volta como tela
 * NOVA, com código novo, e a tela antiga fica aqui para sempre — offline, sem
 * receber publicação e ocupando vaga do plano. Antes daqui, o único caminho
 * era apagar a tela e refazer a programação do zero.
 */
function ReconnectDialog({ target, onClose, onDone }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  React.useEffect(() => { setCode(''); setError(''); }, [target]);

  async function submit(e) {
    if (e && e.preventDefault) e.preventDefault();
    if (busy || code.length < 4) return;
    setBusy(true); setError('');
    try {
      await devices.reconectar(target.id, code);
      onDone(); onClose();
    } catch (err) { setError(paraGente(err, 'parear')); }
    finally { setBusy(false); }
  }

  return (
    <Dialog
      open={!!target}
      onClose={onClose}
      title={'Reconectar · ' + ((target && target.name) || 'Tela')}
      description="Use quando a TV voltou mostrando um código de pareamento em vez do conteúdo."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button type="submit" form="form-reconectar" variant="primary" icon={RefreshCw} disabled={busy || code.length < 4}>
            {busy ? 'Reconectando…' : 'Reconectar'}
          </Button>
        </>
      }
    >
      {/* Mesmo cuidado do Parear (QA de 03/11): Enter envia, espaço e traço não contam, erro anunciado. */}
      <form id="form-reconectar" onSubmit={submit} className="space-y-3.5">
        <p className="text-sm text-ink-2">
          A TV perdeu o vínculo quando o navegador dela foi fechado — acontece com
          alguns modelos. Digite o código que ela está mostrando agora: o nome e a
          programação desta tela passam para ela, sem gastar outra vaga do plano.
        </p>
        <Field label="Código que aparece na TV">
          <Input value={code} onChange={(e) => setCode(codigoDaTv(e.target.value))} placeholder="CÓDIGO" maxLength={12} autoComplete="off" spellCheck={false} className="tracking-[0.3em]" autoFocus />
        </Field>
        <div role="alert" aria-live="assertive">
          {error && <div className="rounded-md border border-danger-soft bg-danger-soft px-3 py-2 text-sm text-danger">{error}</div>}
        </div>
      </form>
    </Dialog>
  );
}

/*
 * Parear termina num PRÓXIMO PASSO, e não num diálogo que some.
 *
 * Antes, parear fechava tudo e deixava a pessoa olhando uma TV "aguardando
 * conteúdo" sem saber o que fazer. Agora o sucesso diz que deu certo e
 * oferece o que vem depois: colocar conteúdo nesta tela.
 *
 * E o erro de cobrança (teste acabou, limite do plano, fatura em atraso)
 * vem com o botão que resolve — só o texto mandava a pessoa procurar.
 */
function PairDialog({ open, onClose, onDone, codigoInicial, onConteudo, onCriar, onIrParaPlano }) {
  const perfil = usePerfil();
  const [code, setCode] = useState(codigoDaTv(codigoInicial));
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const campoCodigo = React.useRef(null);
  const [error, setError] = useState('');
  const [erroDePlano, setErroDePlano] = useState(false);
  const [pareada, setPareada] = useState(null);
  /*
   * Pareou: a campanha que a conta já fez vai para a TV com um toque, INTEIRA
   * — cabeçalho, principal, lateral e rodapé (EXECUTOR §2d, item 38). Antes
   * ia a última peça da biblioteca, sozinha: uma peça qualquer numa zona, e o
   * resto da TV com o desenho de exemplo. A campanha no ar vem primeiro.
   */
  const [campanha, setCampanha] = useState(null);
  const [mandada, setMandada] = useState('');
  // A tela pronta com que a TV nova começou (nome), para o diálogo contar.
  const [comecou, setComecou] = useState('');
  React.useEffect(() => { if (open) { setPareada(null); setError(''); setErroDePlano(false); setMandada(''); setComecou(''); } }, [open]);
  React.useEffect(() => {
    if (!pareada) return;
    criar.campanhas().then((r) => {
      // A campanha com texto barrado (estado "revisar", QA de 03/11) não é oferecida para a TV nova.
      const lista = ((r && r.campanhas) || []).filter((c) => c.capa && c.estado !== 'revisar');
      setCampanha(lista.find((c) => c.estado === 'no_ar') || lista[0] || null);
    }).catch(() => setCampanha(null));
  }, [pareada]);

  async function mandarCampanha() {
    setMandada('indo');
    try {
      const k = await criar.campanha(campanha.id);
      const c = k && k.campanha;
      await porCampanhaNaTela(c && c.resultado, c.nome, pareada);
      await criar.marcar(c.id, 'no_ar', [...new Set([...(c.telas || []), pareada.id])]);
      setMandada('ok');
      onDone();
    } catch (e) { setMandada(''); setError(e.message || 'Não deu para pôr a campanha na TV.'); }
  }

  /*
   * "É a TV X que caiu?" (QA de 03/11): o servidor reconhece a TV que voltou
   * com código novo (o mesmo aparelho de uma tela que parou de dar sinal) e
   * pergunta, em vez de criar uma segunda tela cobrada. `talvez` são as telas.
   */
  const [talvez, setTalvez] = useState(null);
  React.useEffect(() => { if (open) setTalvez(null); }, [open]);

  // Do formulário (Enter ou o botão Parear) vem o evento; de "Sim, é a TV X", o pedido de reconectar.
  async function submit(arg) {
    const ehEvento = !!(arg && arg.preventDefault);
    if (ehEvento) arg.preventDefault();
    const extra = ehEvento ? undefined : arg;
    // Enter num campo vazio não manda nada (o botão também fica apagado).
    if (busy || code.length < 4) return;
    setBusy(true); setError(''); setErroDePlano(false);
    try {
      const dev = await devices.pair(code, name, extra);
      setTalvez(null);
      // Reconectou: a TV já leva a programação da tela antiga; não põe tela pronta por cima.
      if (dev && dev.reconectada) { esquecerParear(); setCode(''); setName(''); setPareada(dev); onDone(); return; }
      esquecerParear(); // o código guardado do QR já foi usado
      setCode(''); setName('');
      /*
       * TV sem nada para mostrar: começa com uma tela pronta do ramo, com a
       * marca da conta (QA de 26/10). Se falhar, a TV fica na espera como
       * antes — parear já deu certo, e isto é bônus.
       */
      if (dev && dev.semConteudo) {
        try {
          /*
           * A orientação de verdade (QA de lançamento, 03/11): a TV em pé
           * recebia uma tela deitada espremida, porque aqui ia sempre null.
           * A TV conta largura e altura no sinal (info.w/h); se ainda não
           * contou, null — e aí vai deitada, o caso comum.
           */
          const [dados, r, lista] = await Promise.all([carregarTelasProntas(), brand.get(), devices.list().catch(() => null)]);
          const daLista = ((lista && lista.devices) || []).find((x) => x.id === dev.id);
          const tela = telaParaComecar(dados, marcaDaConta(r), perfilAtual(), tvEmPe(daLista));
          if (tela) {
            await gravarEmLote([{ id: dev.id, name: dev.name }], (cfg) => aplicarTelaPronta(cfg, tela), 'Tela pronta: ' + tela.nome);
            setComecou(tela.nome);
          }
        } catch (e) { /* segue na espera */ }
      }
      setPareada(dev);
      onDone();
    } catch (err) {
      // Com o que fazer (QA de 03/11): "código não encontrado" vira "Não achamos esse código. Confira na TV…".
      setError(paraGente(err, 'parear'));
      setErroDePlano(err.status === 402);
      setTalvez(err.telas && err.telas.length ? { telas: err.telas, pergunta: err.codigo === 'parece-reconectar' } : null);
      if (campoCodigo.current && err.status !== 402) campoCodigo.current.focus();
    }
    finally { setBusy(false); }
  }

  if (pareada) {
    return (
      <Dialog open={open} onClose={onClose} title="Tela conectada"
        footer={mandada === 'ok' ? <Button variant="primary" onClick={onClose}>Pronto</Button> : <>
          <Button variant="ghost" onClick={onClose}>Depois</Button>
          {onCriar && <Button variant={campanha ? 'secondary' : 'primary'} icon={Plus} onClick={() => onCriar(pareada)}>Criar para esta TV</Button>}
          {campanha
            ? <Button variant="primary" icon={Check} disabled={mandada === 'indo'} onClick={mandarCampanha}>{mandada === 'indo' ? 'Pondo…' : 'Pôr a campanha'}</Button>
            : !onCriar && <Button variant="primary" icon={LayoutTemplate} onClick={() => onConteudo && onConteudo(pareada)}>Colocar conteúdo agora</Button>}
        </>}>
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ok-soft text-ok"><Check size={20} /></div>
          <div className="text-sm text-ink-2">
            {pareada.reconectada
              ? <><b className="text-ink">{pareada.name || 'A TV'}</b> voltou: está com o nome, a programação, o grupo e o horário de antes, sem ocupar outra vaga.</>
              : comecou
              ? <><b className="text-ink">{pareada.name || 'A TV'}</b> já é sua e está mostrando “{comecou}”, uma tela pronta com a sua marca. Troque quando quiser: o que você publicar aparece nela na hora.</>
              : <><b className="text-ink">{pareada.name || 'A TV'}</b> já é sua: ela mostra "Tudo certo" e fica esperando.
                O que você publicar aparece nela na hora — um modelo pronto, uma data comemorativa ou uma campanha feita pela IA.</>}
            {mandada === 'ok' && <div className="mt-2 font-medium text-ok">A campanha foi para a TV, com cabeçalho e rodapé. Olhe para ela!</div>}
            {error && <div className="mt-2 text-danger">{error}</div>}
          </div>
        </div>
        {campanha && mandada !== 'ok' && (
          <div className="mt-4 flex items-center gap-3 rounded-lg border border-line bg-surface-2 p-2.5">
            <div className="w-24 shrink-0 overflow-hidden rounded">{campanha.capa && campanha.capa.item && <DesignThumb item={{ ...campanha.capa.item, formato: campanha.capa.formato || campanha.capa.item.formato }} />}</div>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-ink">{campanha.nome || 'Campanha'}</div>
              <div className="text-xs text-ink-3">{campanha.estado === 'no_ar' ? 'No ar nas outras TVs. ' : 'A sua campanha mais recente. '}Vai inteira: todas as partes da tela.</div>
            </div>
          </div>
        )}
      </Dialog>
    );
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Parear uma tela"
      description={codigoInicial
        ? 'O código veio da TV. Dê um nome para ela e toque em Parear.'
        : 'Ligue a TV no MultiTelas e digite aqui o código que ela mostrar — ou aponte o celular para o QR dela.'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          {/* type=submit do formulário de cima: Enter em qualquer campo pareia (QA de 03/11). */}
          <Button type="submit" form="form-parear" variant="primary" icon={RadioTower} disabled={busy || code.length < 4}>
            {busy ? 'Pareando…' : 'Parear'}
          </Button>
        </>
      }
    >
      <form id="form-parear" onSubmit={submit} className="space-y-3.5">
        {/* Veio do QR: a TV já está com o código na tela; o passo 1 só confundiria. */}
        {!codigoInicial && <EnderecoDaTv />}
        {/*
          O código como a pessoa fala: "BWC DQZ", "bwc-dqz" (QA de lançamento,
          03/11). O limite de 6 contava o espaço e cortava a última letra; agora
          espaço e traço saem antes, e o campo aceita o que se cola.
        */}
        <Field label="Código que aparece na TV" hint="6 letras e números. Espaços e traços não contam.">
          <Input ref={campoCodigo} value={code} onChange={(e) => setCode(codigoDaTv(e.target.value))} placeholder="CÓDIGO" maxLength={12} autoFocus={!codigoInicial}
            autoComplete="off" autoCapitalize="characters" spellCheck={false} className="tracking-[0.3em]"
            aria-invalid={error && !erroDePlano ? 'true' : undefined} />
        </Field>
        <Field label="Nome da tela" hint={'Ex.: ' + perfil.textos.nomesDeTv + '.'}>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Recepção" autoFocus={!!codigoInicial} />
        </Field>
        {/* A região existe antes do erro, para o leitor de tela anunciar quando ele chega. */}
        <div role="alert" aria-live="assertive">
          {error && (
            <div className="rounded-md border border-danger-soft bg-danger-soft px-3 py-2 text-sm text-danger">
              {error}
              {talvez && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {talvez.telas.slice(0, 3).map((t) => (
                    <Button key={t.id} type="button" size="sm" variant="primary" icon={RefreshCw} disabled={busy} onClick={() => submit({ reconectar: t.id })}>
                      {'Sim, é a ' + t.nome}
                    </Button>
                  ))}
                  {talvez.pergunta && <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => submit({ nova: true })}>Não, é outra TV</Button>}
                </div>
              )}
              {erroDePlano && onIrParaPlano && (
                <div className="mt-2"><Button type="button" size="sm" variant="primary" onClick={() => { onClose(); onIrParaPlano(); }}>Ver planos</Button></div>
              )}
            </div>
          )}
        </div>
      </form>
    </Dialog>
  );
}

/*
 * O endereço que se digita NA TV.
 *
 * Antes daqui a instrução era "abra o player com ?cloud=1" — linguagem de
 * quem escreveu o código, dita a quem está de pé com um controle de TV na
 * mão. `/tv` já existia no servidor e ninguém sabia: o caminho curto estava
 * pronto e a instrução continuava mandando digitar um parâmetro de consulta.
 *
 * O endereço é montado a partir de onde o painel está sendo servido, então
 * vale tanto no domínio do cliente quanto numa máquina de teste.
 */
function EnderecoDaTv() {
  const endereco = (typeof window !== 'undefined' ? window.location.origin : '') + '/tv';
  const [copiado, setCopiado] = React.useState(false);
  const copiar = () => {
    if (!navigator.clipboard) return;
    navigator.clipboard.writeText(endereco).then(() => {
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    }).catch(() => {});
  };
  return (
    <div className="rounded-md border border-line bg-surface-2 p-3">
      <div className="text-2xs font-semibold uppercase tracking-wide text-ink-3">1 · Na TV, abra o app MultiTelas TV — ou, no navegador dela, o endereço</div>
      <div className="mt-1.5 flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded border border-line bg-surface px-2 py-1.5 text-sm text-ink">{endereco}</code>
        <Button size="sm" variant="secondary" icon={copiado ? Check : Copy} onClick={copiar}>
          {copiado ? 'Copiado' : 'Copiar'}
        </Button>
      </div>
      <div className="mt-1.5 text-xs text-ink-3">
        A TV vai mostrar um código de 6 letras e números e um QR. Deixe essa tela aberta enquanto você pareia aqui.
      </div>
    </div>
  );
}

/*
 * Horário de funcionamento e alerta de queda.
 *
 * Sem isto, a loja que desliga a TV à noite recebia "tela fora do ar" toda
 * noite, e em uma semana mandava o aviso para o lixo — levando junto o aviso
 * de verdade. O servidor só conta tempo fora do ar DENTRO deste horário, e só
 * avisa durante ele (server/vigia.js).
 */
function ExpedienteDialog({ target, onClose, onDone }) {
  const perfil = usePerfil();
  const [exp, setExp] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  React.useEffect(() => {
    setError('');
    setExp(target ? { alerta: true, dias: [1, 2, 3, 4, 5, 6], inicio: '07:00', fim: '22:00', foraDoHorario: 'ligada', ...(target.expediente || {}) } : null);
  }, [target]);
  if (!exp) return null;

  async function salvar() {
    setBusy(true); setError('');
    try { await devices.expediente(target.id, exp); onDone(); onClose(); }
    catch (err) { setError(err.message || 'Não foi possível salvar.'); }
    finally { setBusy(false); }
  }

  return (
    <Dialog
      open={!!target}
      onClose={onClose}
      title={'Horário e alerta · ' + ((target && target.name) || 'Tela')}
      description={'O horário ' + perfil.lugarDe + ' vale para duas coisas: o que a TV mostra fora dele e o aviso de queda por e-mail.'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" onClick={salvar} disabled={busy || !exp.dias.length}>{busy ? 'Salvando…' : 'Salvar'}</Button>
        </>
      }
    >
      <div className="space-y-4">
        {/*
          O horário deixou de ser só do alerta (item 8 do EXECUTOR): ele
          também diz o que a TV mostra quando a loja fecha. Por isso fica
          sempre editável, e o alerta é uma escolha à parte, embaixo.
        */}
        <CamposDoHorario exp={exp} setExp={setExp} />
        {error && <div className="rounded-md border border-danger-soft bg-danger-soft px-3 py-2 text-sm text-danger">{error}</div>}
      </div>
    </Dialog>
  );
}

function RenomearGrupoDialog({ grupo, onClose, onDone }) {
  const [para, setPara] = useState('');
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState('');
  React.useEffect(() => { setPara(grupo || ''); setErro(''); }, [grupo]);
  async function salvar() {
    setBusy(true); setErro('');
    try {
      const r = await devices.renomearGrupo(grupo, para);
      // O nome que VALE é o que o servidor gravou (espaços juntados, 60 letras).
      onDone((r && r.grupo) || ''); onClose();
    } catch (e) { setErro(e.message || 'Não foi possível renomear.'); }
    finally { setBusy(false); }
  }
  return (
    <Dialog open={grupo != null} onClose={onClose} title="Renomear grupo"
      description="Vale para todas as telas do grupo. Deixe vazio para desfazer o grupo (as telas continuam, só sem grupo)."
      footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button>
        <Button variant="primary" onClick={salvar} disabled={busy}>Salvar</Button></>}>
      <Field label="Nome do grupo"><Input value={para} onChange={(e) => setPara(e.target.value)} autoFocus /></Field>
      {erro && <div className="mt-2 rounded-md border border-danger-soft bg-danger-soft px-3 py-2 text-sm text-danger">{erro}</div>}
    </Dialog>
  );
}

function RenameDialog({ target, grupos, onClose, onDone }) {
  const [name, setName] = useState('');
  const [grupo, setGrupo] = useState('');
  const [busy, setBusy] = useState(false);
  React.useEffect(() => {
    setName(target ? target.name || '' : '');
    setGrupo(target ? target.grupo || '' : '');
  }, [target]);

  async function submit() {
    setBusy(true);
    try {
      await devices.rename(target.id, name);
      if ((target.grupo || '') !== grupo.trim()) await devices.grupo(target.id, grupo.trim());
      onDone(); onClose();
    } catch (e) { aviso.erro('telas', e.message || 'Não deu para salvar o nome.'); }
    finally { setBusy(false); }
  }

  return (
    <Dialog
      open={!!target}
      onClose={onClose}
      title="Nome e grupo"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" onClick={submit} disabled={busy || !name.trim()}>Salvar</Button>
        </>
      }
    >
      <div className="space-y-3.5">
        <Field label="Nome da tela">
          <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </Field>
        <Field label="Grupo" hint="Ex.: Loja Centro. Na hora de publicar, dá para marcar o grupo inteiro de uma vez.">
          <Input value={grupo} onChange={(e) => setGrupo(e.target.value)} list="grupos-de-telas" placeholder="Sem grupo" />
          <datalist id="grupos-de-telas">{(grupos || []).map((g) => <option key={g} value={g} />)}</datalist>
        </Field>
      </div>
    </Dialog>
  );
}

function RemoveDialog({ target, onClose, onDone }) {
  const [busy, setBusy] = useState(false);
  async function submit() {
    setBusy(true);
    try { await devices.remove(target.id); onDone(); onClose(); }
    catch (e) { aviso.erro('telas', e.message || 'Não deu para remover a TV.'); }
    finally { setBusy(false); }
  }
  return (
    <Dialog
      open={!!target}
      onClose={onClose}
      title="Remover tela"
      description={target ? `A tela "${target.name || 'sem nome'}" será desvinculada da sua conta.` : ''}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="danger" icon={Trash2} onClick={submit} disabled={busy}>{busy ? 'Removendo…' : 'Remover'}</Button>
        </>
      }
    >
      <p className="text-sm text-ink-2">Essa ação não pode ser desfeita. A TV precisará ser pareada de novo para voltar a ser controlada.</p>
    </Dialog>
  );
}

/*
 * Backup da tela: baixa a configuração inteira (layout, tema e conteúdo) em
 * JSON, restaura de arquivo ou copia de outra tela. Serve para quando a TV
 * some, é apagada ou precisa ser trocada por outra que conecte.
 */
/*
 * O servidor usa settings.nome como nome da tela. Sem isto, restaurar ou
 * copiar uma config renomearia a tela de destino com o nome da origem.
 */
function comNomeDoDestino(cfg, target) {
  const nome = (target && target.name) || (cfg.settings && cfg.settings.nome) || 'Tela';
  return { ...cfg, settings: { ...(cfg.settings || {}), nome } };
}

function BackupDialog({ target, screens, onClose, onDone }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [from, setFrom] = useState('');

  const others = (screens || []).filter((s) => target && s.id !== target.id);

  async function baixar() {
    setBusy(true); setErr(''); setMsg('');
    try {
      const cfg = await deviceConfig.get(target.id);
      if (!cfg) { setErr('Esta tela ainda não tem configuração para salvar.'); return; }
      const backup = { kind: 'multitelas.screen', version: 1, exportedAt: new Date().toISOString(), name: target.name || '', config: cfg };
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'multitelas-' + (target.name || 'tela').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '.json';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      setMsg('Backup baixado.');
    } catch (e) { setErr(e.message || 'Falha ao baixar.'); }
    finally { setBusy(false); }
  }

  async function restaurar(e) {
    const f = (e.target.files || [])[0]; e.target.value = '';
    if (!f) return;
    setBusy(true); setErr(''); setMsg('');
    try {
      const parsed = JSON.parse(await f.text());
      // Aceita o arquivo do backup e também uma config "crua".
      const cfg = parsed && parsed.config ? parsed.config : parsed;
      if (!cfg || !cfg.zonas) { setErr('Arquivo não parece um backup do MultiTelas.'); return; }
      if (!(await confirmar({ titulo: 'Trocar a programação desta TV?', texto: 'Tudo o que está nela hoje é substituído pelo arquivo. Não dá para desfazer.', botao: 'Trocar', perigo: true }))) return;
      await deviceConfig.save(target.id, comNomeDoDestino(cfg, target));
      setMsg('Exibição restaurada nesta tela.');
      onDone();
    } catch (e2) { setErr(e2.message || 'Falha ao restaurar.'); }
    finally { setBusy(false); }
  }

  async function copiar() {
    if (!from) return;
    setBusy(true); setErr(''); setMsg('');
    try {
      const cfg = await deviceConfig.get(from);
      if (!cfg) { setErr('A tela escolhida não tem configuração.'); return; }
      if (!(await confirmar({ titulo: 'Copiar por cima desta TV?', texto: 'Tudo o que está nela hoje é substituído pela programação da outra. Não dá para desfazer.', botao: 'Copiar', perigo: true }))) return;
      await deviceConfig.save(target.id, comNomeDoDestino(cfg, target));
      setMsg('Exibição copiada para esta tela.');
      onDone();
    } catch (e) { setErr(e.message || 'Falha ao copiar.'); }
    finally { setBusy(false); }
  }

  return (
    <Dialog open={!!target} onClose={onClose} title="Backup e restauração"
      description={target ? `Salve ou recupere toda a exibição de "${target.name || 'sem nome'}".` : ''}
      className="max-w-xl"
      footer={<Button variant="primary" icon={Check} onClick={onClose}>Concluir</Button>}>
      <div className="space-y-4">
        <div className="rounded-lg border border-line p-3">
          <div className="text-sm font-semibold text-ink">Salvar backup</div>
          <p className="mt-0.5 text-xs text-ink-3">Baixa um arquivo com layout, tema e todo o conteúdo desta tela.</p>
          <Button className="mt-2" size="sm" variant="secondary" icon={Download} disabled={busy || !target} onClick={baixar}>Baixar JSON</Button>
        </div>

        <div className="rounded-lg border border-line p-3">
          <div className="text-sm font-semibold text-ink">Restaurar de um arquivo</div>
          <p className="mt-0.5 text-xs text-ink-3">Use o backup de uma tela antiga para reconstruir esta aqui.</p>
          <EscolherArquivo accept="application/json,.json" onChange={restaurar} disabled={busy}
            className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-line bg-surface px-3 py-1.5 text-sm text-ink-2 transition hover:bg-surface-2">
            <Upload size={14} /> Escolher arquivo
          </EscolherArquivo>
        </div>

        <div className="rounded-lg border border-line p-3">
          <div className="text-sm font-semibold text-ink">Copiar de outra tela</div>
          <p className="mt-0.5 text-xs text-ink-3">Clona a exibição de uma tela que já está funcionando.</p>
          {others.length ? (
            <div className="mt-2 flex items-end gap-2">
              <Field label="Tela de origem" className="flex-1">
                <Select value={from} onChange={(e) => setFrom(e.target.value)}>
                  <option value="">Escolha…</option>
                  {others.map((s) => <option key={s.id} value={s.id}>{s.name || s.code || s.id}</option>)}
                </Select>
              </Field>
              <Button size="sm" variant="secondary" icon={Copy} disabled={busy || !from} onClick={copiar}>Copiar</Button>
            </div>
          ) : <p className="mt-2 text-xs text-ink-3">Você só tem esta TV — ligue outra para poder copiar.</p>}
        </div>

        <p className="text-2xs text-ink-3">O backup guarda a exibição, não o pareamento: a TV nova precisa ser pareada primeiro.</p>
        {msg && <div className="rounded-md border border-line bg-surface-2 px-3 py-2 text-sm text-ink-2">{msg}</div>}
        {err && <div className="rounded-md border border-danger-soft bg-danger-soft px-3 py-2 text-sm text-danger">{err}</div>}
      </div>
    </Dialog>
  );
}
