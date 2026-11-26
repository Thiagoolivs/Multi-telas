import React, { useState } from 'react';
import { MonitorPlay, Tv, Plus } from 'lucide-react';
import { TituloDoPasso, RodapeDoPasso, Escolha, Erro } from './MolduraDoPasso.jsx';
import { EnderecoDaTv } from '../tela/EnderecoDaTv.jsx';
import { PareceSerATv } from '../tela/PareceSerATv.jsx';
import { devices } from '../../api.js';
import { paraGente, codigoDaTv } from '../../lib/erros.js';
import { esquecerParear } from '../../lib/parearPendente.js';
import { deviceStatus } from '../../lib/deviceStatus.js';
import { proximoNomeDeTv, sugestoesDeNome } from '../../lib/nomeDaTv.js';
import { usePerfil } from '../../lib/perfil.js';

/*
 * O formulário de ligar a TV — o mesmo pedido de Telas › Ligar uma TV
 * (devices.pair, as frases de lib/erros.js, o "é a TV que caiu?"), em
 * letra grande. Usado no passo 3 e no fim, quando a TV ficou para depois.
 *
 * Reteste 4: o NOME, na hora (lib/nomeDaTv.js). A primeira TV virava
 * "TV 1"; com 8 TVs, quem instala dá o nome de cada uma aqui. `tvs`: as
 * TVs da conta (o próximo "TV N" e as sugestões que ainda não foram usadas).
 */
export function LigarTv({ codigoInicial, onLigada, onIrParaPlano, rotulo = 'Ligar a TV', secundario, tvs = [] }) {
  const perfil = usePerfil();
  const [code, setCode] = useState(codigoDaTv(codigoInicial));
  // null: o sugerido ("TV N"), que acompanha a lista de TVs enquanto a pessoa não escreve.
  const [escrito, setNome] = useState(null);
  const nome = escrito == null ? proximoNomeDeTv(tvs) : escrito;
  const sugestoes = sugestoesDeNome(perfil.textos && perfil.textos.nomesDeTv, tvs).slice(0, 4);
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState('');
  const [dePlano, setDePlano] = useState(false);
  const [talvez, setTalvez] = useState(null);

  async function ligar(extra) {
    if (busy || code.length < 4) return;
    setBusy(true); setErro(''); setDePlano(false);
    try {
      // Apagou o nome: vai o próximo "TV N" (nunca uma TV sem nome na lista).
      const dev = await devices.pair(code, nome.trim() || proximoNomeDeTv(tvs), extra);
      esquecerParear(); // o código guardado do QR já foi usado
      setTalvez(null);
      await onLigada(dev);
    } catch (e) {
      // "Parece ser a X?" não é erro: é a pergunta, no bloco dela (components/tela/PareceSerATv.jsx).
      setErro(e.codigo === 'parece-reconectar' ? '' : paraGente(e, 'parear'));
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
        <li className="rounded-md border border-line bg-surface-2 p-3">
          <label htmlFor="nome-da-tv" className="text-2xs font-semibold uppercase tracking-wide text-ink-3">3 · O nome desta TV</label>
          <input id="nome-da-tv" value={nome} onChange={(e) => setNome(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') ligar(); }}
            maxLength={60} autoComplete="off" onFocus={(e) => e.target.select()}
            className="mt-2 h-12 w-full rounded-lg border border-line bg-surface px-3 text-lg font-semibold text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent" />
          {sugestoes.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Sugestões de nome">
              {sugestoes.map((s) => (
                <button key={s} type="button" onClick={() => setNome(s)} aria-pressed={nome === s}
                  className={'inline-flex h-9 items-center rounded-full border px-3 text-sm ' + (nome === s ? 'border-accent bg-accent/10 font-semibold text-ink' : 'border-line text-ink-2 hover:border-accent/50')}>{s}</button>
              ))}
            </div>
          )}
          <p className="mt-1.5 text-xs text-ink-3">Onde ela fica. Com várias TVs, é por ele que você acha cada uma no painel.</p>
        </li>
      </ol>
      <Erro>{erro}</Erro>
      {talvez && <PareceSerATv talvez={talvez} busy={busy} grande onReconectar={(id) => ligar({ reconectar: id })} onNova={() => ligar({ nova: true })} />}
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
      <LigarTv codigoInicial={codigoInicial} tvs={tvs} onIrParaPlano={onIrParaPlano} onLigada={(dev) => onEscolher(dev, true)}
        secundario={tvs.length ? { rotulo: 'Voltar para as minhas TVs', onClick: () => setLigando(false) } : depois} />
    </>
  );
}
