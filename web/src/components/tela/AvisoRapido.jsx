import React, { useEffect, useMemo, useState } from 'react';
import { Megaphone, Sparkles, MonitorPlay } from 'lucide-react';
import { Dialog } from '../ui/Dialog.jsx';
import { Button } from '../ui/Button.jsx';
import { PecaHtml } from '../content/PecaHtml.jsx';
import { avisoRapido, devices, brand } from '../../api.js';
import { carregarModelos } from '../../lib/modelosOuro.js';
import { gravarEmLote, avisarComDesfazer } from '../../lib/rodar.js';
import { pecaDoAviso, aplicarAviso, telasDoAviso } from '../../lib/aviso.js';
import { aviso as avisos } from '../../lib/avisos.js';
import { cn } from '../../lib/cn.js';

/*
 * AVISO RÁPIDO (EXECUTOR D27). "Adicione aviso da peça quebrada no
 * banheiro": a IA arruma o aviso (título, detalhe, até quando, prioridade,
 * TVs), o painel monta a peça e mostra a prévia, a pessoa ajusta se quiser
 * e, com o ok, a frota recebe num envio só, com Desfazer.
 */
const campo = 'w-full rounded-md border border-line bg-surface px-2 py-1.5 text-sm text-ink';

export function AvisoRapido({ onFechar }) {
  const [texto, setTexto] = useState('');
  const [montando, setMontando] = useState(false);
  const [aviso, setAviso] = useState(null);
  const [tvs, setTvs] = useState([]);
  const [modelos, setModelos] = useState(null);
  const [marca, setMarca] = useState(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    devices.list().then((r) => setTvs((r && r.devices) || [])).catch(() => setTvs([]));
    carregarModelos().then((m) => setModelos(new Map(m.map((x) => [x.id, x])))).catch(() => setModelos(new Map()));
    brand.get().then((r) => {
      const k = (r && r.kit) || {};
      setMarca({ cores: k.cores || [], fonteTitulo: k.fonteTitulo || '', fonteApoio: k.fonteApoio || '', nome: (k.nome && k.nome !== 'Marca principal' ? k.nome : (r && r.empresa)) || '' });
    }).catch(() => setMarca({}));
  }, []);

  const grupos = useMemo(() => [...new Set(tvs.map((t) => t.grupo).filter(Boolean))], [tvs]);
  const item = useMemo(() => (aviso && modelos && marca ? pecaDoAviso(aviso, modelos, marca) : null), [aviso, modelos, marca]);
  const alvos = aviso ? telasDoAviso(aviso, tvs) : [];
  const set = (k, v) => setAviso((a) => ({ ...a, [k]: v }));

  async function montar() {
    setMontando(true);
    try { setAviso((await avisoRapido.montar(texto)).aviso); }
    catch (e) { avisos.erro('aviso', e.message || 'Não deu para montar agora.'); }
    finally { setMontando(false); }
  }

  async function enviar() {
    setEnviando(true);
    try {
      const id = 'avs_' + Date.now().toString(36);
      const r = await gravarEmLote(alvos, (cfg) => aplicarAviso(cfg, item, aviso, id), 'Aviso: ' + aviso.titulo);
      avisarComDesfazer('Aviso no ar em ' + alvos.length + (alvos.length === 1 ? ' TV.' : ' TVs.'), r.lote);
      onFechar();
    } catch (e) { avisos.erro('aviso', e.message || 'Não deu para pôr nas TVs.'); }
    finally { setEnviando(false); }
  }

  return (
    <Dialog open onClose={onFechar} className="max-w-2xl" title="Aviso rápido"
      description="Escreva como você falaria. A IA arruma, você vê como fica e manda para as TVs."
      footer={aviso ? <>
        <Button variant="ghost" onClick={() => setAviso(null)}>Escrever de novo</Button>
        <Button variant="primary" icon={MonitorPlay} disabled={!alvos.length || enviando || !item || !aviso.titulo} onClick={enviar}>
          {enviando ? 'Enviando…' : alvos.length === 1 ? 'Pôr na TV' : 'Pôr em ' + alvos.length + ' TVs'}
        </Button>
      </> : <>
        <Button variant="ghost" onClick={onFechar}>Cancelar</Button>
        <Button variant="primary" icon={Sparkles} disabled={!texto.trim() || montando} onClick={montar}>{montando ? 'Montando…' : 'Montar o aviso'}</Button>
      </>}>
      {!aviso ? (
        <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={3} maxLength={500} autoFocus aria-label="O aviso"
          placeholder={'Ex.: banheiro do 2º andar interditado até amanhã, use o do térreo'} className={campo} />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
          <div>{item ? <PecaHtml item={item} formato="16/9" /> : <div className="text-xs text-ink-3">Montando a prévia…</div>}</div>
          <div className="space-y-2">
            <label className="block text-xs font-medium text-ink-2">Aviso
              <input value={aviso.titulo} maxLength={70} onChange={(e) => set('titulo', e.target.value)} className={cn(campo, 'mt-1')} />
            </label>
            <label className="block text-xs font-medium text-ink-2">Detalhe
              <input value={aviso.detalhe || ''} maxLength={160} onChange={(e) => set('detalhe', e.target.value)} className={cn(campo, 'mt-1')} placeholder="O que fazer (opcional)" />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block text-xs font-medium text-ink-2">Até quando
                <input type="date" value={aviso.ate || ''} onChange={(e) => set('ate', e.target.value)} className={cn(campo, 'mt-1')} />
              </label>
              <label className="block text-xs font-medium text-ink-2">Prioridade
                <select value={aviso.prioridade} onChange={(e) => set('prioridade', e.target.value)} className={cn(campo, 'mt-1')}>
                  <option value="alta">Alta (passa mais vezes)</option>
                  <option value="urgente">Urgente (toma a tela)</option>
                </select>
              </label>
            </div>
            <label className="block text-xs font-medium text-ink-2">Onde
              <select value={aviso.alvo && aviso.alvo.tipo === 'grupo' ? aviso.alvo.nome : ''} className={cn(campo, 'mt-1')}
                onChange={(e) => set('alvo', e.target.value ? { tipo: 'grupo', nome: e.target.value } : { tipo: 'todas' })}>
                <option value="">Todas as TVs ({tvs.length})</option>
                {grupos.map((g) => <option key={g} value={g}>O grupo {g} ({tvs.filter((t) => t.grupo === g).length})</option>)}
              </select>
            </label>
            <p className="flex items-start gap-1.5 text-2xs text-ink-3">
              <Megaphone size={13} className="mt-px shrink-0" />
              Entra na frente da zona principal{aviso.ate ? ' até o fim do dia ' + aviso.ate.split('-').reverse().slice(0, 2).join('/') : ', até você tirar'}.
            </p>
            {!tvs.length && <p className="text-2xs text-warn">Você ainda não tem TV conectada.</p>}
          </div>
        </div>
      )}
    </Dialog>
  );
}
