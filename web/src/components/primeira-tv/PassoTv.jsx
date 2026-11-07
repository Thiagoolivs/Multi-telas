import React, { useState } from 'react';
import { MonitorPlay, Tv, RefreshCw, Plus } from 'lucide-react';
import { TituloDoPasso, RodapeDoPasso, Escolha, Erro } from './MolduraDoPasso.jsx';
import { EnderecoDaTv } from '../tela/EnderecoDaTv.jsx';
import { devices } from '../../api.js';
import { paraGente, codigoDaTv } from '../../lib/erros.js';
import { esquecerParear } from '../../lib/parearPendente.js';
import { deviceStatus } from '../../lib/deviceStatus.js';

/*
 * O formulário de ligar a TV — o mesmo pedido de Telas › Ligar uma TV
 * (devices.pair, as frases de lib/erros.js, o "é a TV que caiu?"), em
 * letra grande. Usado no passo 3 e no fim, quando a TV ficou para depois.
 */
export function LigarTv({ codigoInicial, onLigada, onIrParaPlano, rotulo = 'Ligar a TV', secundario }) {
  const [code, setCode] = useState(codigoDaTv(codigoInicial));
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState('');
  const [dePlano, setDePlano] = useState(false);
  const [talvez, setTalvez] = useState(null);

  async function ligar(extra) {
    if (busy || code.length < 4) return;
    setBusy(true); setErro(''); setDePlano(false);
    try {
      const dev = await devices.pair(code, '', extra);
      esquecerParear(); // o código guardado do QR já foi usado
      setTalvez(null);
      await onLigada(dev);
    } catch (e) {
      setErro(paraGente(e, 'parear'));
      setDePlano(e.status === 402);
      setTalvez(e.telas && e.telas.length ? { telas: e.telas, pergunta: e.codigo === 'parece-reconectar' } : null);
    } finally { setBusy(false); }
  }

  return (
    <>
      <ol className="space-y-3 text-base text-ink-2">
        <li><EnderecoDaTv /></li>
        <li className="rounded-md border border-line bg-surface-2 p-3">
          <div className="text-2xs font-semibold uppercase tracking-wide text-ink-3">2 · Digite o código que aparece na TV</div>
          <input value={code} onChange={(e) => setCode(codigoDaTv(e.target.value))} onKeyDown={(e) => { if (e.key === 'Enter') ligar(); }}
            placeholder="CÓDIGO" maxLength={12} autoComplete="off" autoCapitalize="characters" spellCheck={false} aria-label="Código que aparece na TV"
            className="mt-2 h-14 w-full rounded-lg border border-line bg-surface px-3 text-center text-2xl font-semibold tracking-[0.35em] text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent" />
          <p className="mt-1.5 text-xs text-ink-3">Ou aponte a câmera do celular para o QR da TV: o código vem sozinho.</p>
        </li>
      </ol>
      <Erro>{erro}</Erro>
      {talvez && (
        <div className="mt-2 flex flex-wrap gap-2">
          {talvez.telas.slice(0, 3).map((t) => (
            <button key={t.id} type="button" disabled={busy} onClick={() => ligar({ reconectar: t.id })}
              className="inline-flex h-11 items-center gap-1.5 rounded-lg border border-line-strong bg-surface px-3 text-sm font-semibold text-ink hover:bg-surface-2">
              <RefreshCw size={15} /> {'Sim, é a ' + t.nome}
            </button>
          ))}
          {talvez.pergunta && (
            <button type="button" disabled={busy} onClick={() => ligar({ nova: true })}
              className="inline-flex h-11 items-center rounded-lg border border-line-strong bg-surface px-3 text-sm font-semibold text-ink hover:bg-surface-2">Não, é outra TV</button>
          )}
        </div>
      )}
      {dePlano && onIrParaPlano && (
        <button type="button" onClick={onIrParaPlano} className="mt-2 text-sm font-semibold text-accent hover:underline">Ver os planos</button>
      )}
      <RodapeDoPasso principal={{ rotulo, icone: MonitorPlay, onClick: () => ligar(), disabled: code.length < 4, ocupado: busy }} secundario={secundario} />
    </>
  );
}

/*
 * Passo 3 · Ligar a TV (≈30 s). Conta que já tem TV: um toque escolhe qual
 * (ou "Ligar outra TV"). Sem TV: o código da TV. E sempre o "Fazer isso
 * depois" — o resto dá para preparar sem a TV. O membro não liga TV nova
 * (entra na mensalidade): escolhe uma das dele, ou segue sem.
 */
export function PassoTv({ estado, tvs, podeLigar, codigoInicial, onEscolher, onPular, onIrParaPlano }) {
  const [ligando, setLigando] = useState(!tvs.length || !!codigoInicial);
  const depois = { rotulo: 'Fazer isso depois', onClick: onPular };

  if (tvs.length && !ligando) {
    return (
      <>
        <TituloDoPasso titulo="Em qual TV?" frase="A tela que você montar agora vai para ela." />
        <div className="space-y-2.5">
          {tvs.map((d) => {
            const st = deviceStatus(d.lastSeen);
            return <Escolha key={d.id} icone={Tv} titulo={d.name || 'TV'} detalhe={st.label} escolhida={estado.tv === d.id} onClick={() => onEscolher(d)} />;
          })}
          {podeLigar && <Escolha icone={Plus} titulo="Ligar outra TV" detalhe="Com o código que aparece nela" onClick={() => setLigando(true)} />}
        </div>
        <RodapeDoPasso secundario={depois} />
      </>
    );
  }

  if (!podeLigar) {
    return (
      <>
        <TituloDoPasso titulo="Ligar a TV" frase="Quem liga uma TV nova é o dono da conta (ela entra na mensalidade). Dá para preparar tudo agora: quando a TV estiver ligada, a tela vai para ela." />
        <RodapeDoPasso principal={{ rotulo: 'Continuar sem a TV', onClick: onPular }} />
      </>
    );
  }

  return (
    <>
      <TituloDoPasso titulo="Ligue a TV" frase="Leva meio minuto. Se a TV não estiver por perto, faça isso depois." />
      <LigarTv codigoInicial={codigoInicial} onIrParaPlano={onIrParaPlano} onLigada={(dev) => onEscolher(dev, true)}
        secundario={tvs.length ? { rotulo: 'Voltar para as minhas TVs', onClick: () => setLigando(false) } : depois} />
    </>
  );
}
