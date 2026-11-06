import React, { useEffect, useState } from 'react';
import { MonitorPlay, Pencil, Wand2, Plus, Megaphone } from 'lucide-react';
import { Panel } from '../components/ui/Panel.jsx';
import { Button } from '../components/ui/Button.jsx';
import { StatusDot } from '../components/ui/Badge.jsx';
import { Spinner, EmptyState, ErrorState } from '../components/ui/Feedback.jsx';
import { MapaDaTela } from '../components/tela/MapaDaTela.jsx';
import { UltimosEnvios } from '../components/tela/UltimosEnvios.jsx';
import { devices, deviceConfig } from '../api.js';
import { deviceStatus } from '../lib/deviceStatus.js';
import { campanhasDaConfig, pecasDaFaixa } from '../lib/tela.js';
import { precisaDeNomes } from '../lib/nomesDasMidias.js';
import { useNomesDasMidias } from '../lib/useNomesDasMidias.js';
import '../lib/screenConfig.js';

/*
 * PROGRAMAÇÃO (EXECUTOR §2d, item 40). O dono: "conteúdo merece uma aba
 * própria, dentro de Telas está muito escondido". Telas fica com o APARELHO
 * (parear, online, horário); aqui fica o que PASSA: cada TV desenhada com as
 * zonas, o que há em cada uma e as campanhas no ar. Tocar na TV — ou numa
 * zona dela — abre o editor.
 *
 * PEDIR À IA (D51): um lugar só para pedir mudanças — aviso, aparência de
 * uma TV ou algo novo. O aviso rápido mora dentro dele.
 */
function resumoDaZona(cfg) {
  return (z) => {
    const d = (cfg && cfg.zonas && cfg.zonas[z.id]) || {};
    if (z.type === 'header') { const n = pecasDaFaixa(d).length; return n ? n + (n === 1 ? ' peça' : ' estilos') : 'nome e hora'; }
    if (z.type === 'ticker') {
      const n = pecasDaFaixa(d).length;
      const msgs = (d.messages || []).filter((m) => m && String(m).trim()).length;
      return n ? n + (n === 1 ? ' peça' : ' peças') : msgs ? msgs + (msgs === 1 ? ' aviso' : ' avisos') : 'esperando';
    }
    const n = (d.items || []).length;
    return n ? n + (n === 1 ? ' conteúdo' : ' conteúdos') : 'esperando';
  };
}

export function ProgramacaoPage({ onIr }) {
  const [telas, setTelas] = useState(null);
  // D27: o aviso numa frase, para todas as TVs (ou um grupo) de uma vez.
  const [cfgs, setCfgs] = useState({});
  /*
   * Erro de rede não é "nenhuma TV" (D3): a lista que falhava virava "Nenhuma
   * TV ainda — Parear uma TV", e a programação que não carregava virava "Nada
   * publicado". A pessoa podia parear de novo uma TV que já tinha.
   */
  const [erro, setErro] = useState('');
  const [tentativa, setTentativa] = useState(0);
  // O vídeo posto antes do nome ir junto: o nome original vem das Mídias (um pedido para todas as TVs, guardado).
  const nomes = useNomesDasMidias(Object.values(cfgs).some(precisaDeNomes));

  useEffect(() => {
    setErro(''); setTelas(null);
    /*
     * A programação de todas as TVs num pedido só (reteste da fase 10): eram
     * 25 pedidos numa conta de 25 TVs, 4,2 s no 4G lento, e duas pessoas no
     * painel batiam no freio da conta. Vem junto com a lista, ao mesmo tempo.
     */
    const todas = deviceConfig.todas().then((m) => ({ ok: m }), () => ({ falhou: true }));
    devices.list().then(async (r) => {
      const lista = (r && r.devices) || [];
      setTelas(lista);
      const t = await todas;
      const m = {};
      for (const d of lista) m[d.id] = t.falhou ? 'erro' : ((t.ok[d.id] && t.ok[d.id].config) || null);
      setCfgs(m);
    }).catch((e) => setErro(e.message || 'Não deu para carregar as TVs.'));
  }, [tentativa]);

  const editar = (d, zona) => onIr && onIr('content', { device: d, ...(zona ? { zona } : {}) });

  return (
    <div className="max-w-6xl">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-ink">Programação</h1>
          <p className="mt-1 text-sm text-ink-2">O que está passando em cada TV. Toque numa TV, ou numa parte dela, para mudar.</p>
        </div>
        {/*
          Fase 7, um só Criar: o "Pedir à IA" daqui (aviso rápido e mudar a tela)
          é a mesma conversa do Criar, que faz as duas coisas (AcaoDaIA). O
          PedirIA fica no código, sem botão, por 30 dias.
        */}
        {/* Sem TV, o violeta é o "Ligar uma TV" do vazio; o Criar fica de contorno (um violeta por tela). */}
        <Button variant={telas && telas.length === 0 ? 'secondary' : 'primary'} icon={Plus} onClick={() => onIr && onIr('criar')}>Criar</Button>
      </div>

      {erro ? (
        <Panel><ErrorState description={erro} onRetry={() => setTentativa((n) => n + 1)} /></Panel>
      ) : telas === null ? <div className="flex justify-center py-16"><Spinner size={20} /></div> : telas.length === 0 ? (
        <Panel>
          <EmptyState icon={MonitorPlay} exemplo title="Nenhuma TV ainda" description="Ligue a primeira TV e a programação dela aparece aqui."
            action={<Button variant="primary" icon={Plus} onClick={() => onIr && onIr('screens', { abrirParear: true })}>Ligar uma TV</Button>} />
        </Panel>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {telas.map((d) => {
            const falhou = cfgs[d.id] === 'erro';
            const cfg = falhou ? null : cfgs[d.id];
            const layout = cfg && globalThis.MT_getLayout ? globalThis.MT_getLayout(cfg.settings && cfg.settings.layoutId) : null;
            const st = deviceStatus(d.lastSeen);
            const campanhas = cfg ? campanhasDaConfig(cfg) : [];
            return (
              <div key={d.id} className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-3">
                <div className="flex items-center gap-2">
                  <MonitorPlay size={16} className="shrink-0 text-ink-3" />
                  <div className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">{d.name || 'TV'}</div>
                  <span className="flex shrink-0 items-center gap-1.5 text-2xs text-ink-3"><StatusDot tone={st.tone} pulse={st.pulse} /> {st.label}</span>
                </div>
                {cfg === undefined ? <div className="flex h-40 items-center justify-center"><Spinner size={16} /></div>
                  : falhou ? (
                    <button type="button" onClick={() => setTentativa((n) => n + 1)}
                      className="flex h-40 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-warn/50 text-sm text-ink-2">
                      Não deu para ler o que está nesta TV.<span className="text-xs text-accent">Tentar de novo</span>
                    </button>
                  ) : layout ? <MapaDaTela layout={layout} onEscolher={(z) => editar(d, z && z.id)} resumo={resumoDaZona(cfg)} cfg={cfg} nomes={nomes} />
                    : (
                      <button type="button" onClick={() => editar(d)}
                        className="flex h-40 items-center justify-center rounded-lg border border-dashed border-line text-sm text-ink-3 hover:border-accent/60">
                        Nada publicado ainda
                      </button>
                    )}
                <div className="min-h-[1.25rem] text-xs text-ink-3">
                  {campanhas.length
                    ? <span className="flex flex-wrap items-center gap-1.5"><Megaphone size={13} className="text-accent" /> {campanhas.map((c) => c.nome).join(' · ')}</span>
                    : 'Sem campanha no ar'}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {/* De contorno: o violeta da página é o Criar lá em cima (reteste da fase 10: eram 25, um por TV). */}
                  <Button size="sm" variant="secondary" icon={Pencil} onClick={() => editar(d)}>Editar programação</Button>
                  <Button size="sm" icon={Plus} onClick={() => onIr && onIr('criar', { tela: d.id })}>Criar para esta TV</Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {/* O Desfazer de depois que o aviso de 9 s some (QA de lançamento, 03/11). */}
      {telas && telas.length > 0 && <UltimosEnvios onDesfeito={() => setTentativa((n) => n + 1)} />}
    </div>
  );
}
