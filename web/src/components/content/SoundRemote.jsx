import React, { useEffect, useState } from 'react';
import { Play, Pause, SkipForward, SkipBack, Volume2, VolumeX } from 'lucide-react';
import { som as somApi } from '../../api.js';
import { IconButton } from '../ui/Button.jsx';

/*
 * O controle remoto do som de uma tela.
 *
 * Não mexe na configuração: manda a ordem por SSE e mostra o que a TV
 * respondeu estar tocando. É deliberadamente pequeno para caber tanto no
 * cartão da tela quanto dentro dos ajustes — abaixar o volume no meio de um
 * evento não pode custar quatro cliques e uma rolagem.
 */
export function SoundRemote({ deviceId, compacto }) {
  const [info, setInfo] = useState(null);
  const [ocupado, setOcupado] = useState(false);

  async function ler() {
    try { setInfo(await somApi.estado(deviceId)); } catch (e) { setInfo(null); }
  }
  useEffect(() => {
    ler();
    const t = setInterval(ler, 4000);
    return () => clearInterval(t);
  }, [deviceId]);

  async function mandar(acao, valor) {
    setOcupado(true);
    try { await somApi.comando(deviceId, acao, valor); } catch (e) {}
    // A TV responde em menos de um segundo; reler antes disso mostraria o
    // estado velho e o botão pareceria não ter funcionado.
    setTimeout(() => { ler(); setOcupado(false); }, 900);
  }

  const e = (info && info.estado) || null;
  const online = info && info.online;

  if (!online) {
    return (
      <p className="text-xs text-ink-3">
        A tela está offline. Os comandos só chegam com ela ligada — a playlist salva continua valendo e volta a tocar sozinha.
      </p>
    );
  }
  if (info && info.conhecido && e && !e.ativo) {
    return <p className="text-xs text-ink-3">Esta tela está sem música de fundo configurada.</p>;
  }

  return (
    <div className={compacto ? 'space-y-2' : 'space-y-2.5'}>
      <div className="flex items-center gap-2">
        <IconButton icon={SkipBack} label="Anterior" onClick={() => mandar('anterior')} disabled={ocupado} />
        <IconButton
          icon={e && e.tocando ? Pause : Play}
          label={e && e.tocando ? 'Pausar' : 'Tocar'}
          onClick={() => mandar(e && e.tocando ? 'pausar' : 'tocar')}
          disabled={ocupado}
        />
        <IconButton icon={SkipForward} label="Próxima" onClick={() => mandar('proxima')} disabled={ocupado} />
        <div className="ml-1 flex flex-1 items-center gap-2">
          {e && e.volume === 0 ? <VolumeX size={14} className="text-ink-3" /> : <Volume2 size={14} className="text-ink-3" />}
          <input
            type="range" min="0" max="100"
            value={e ? e.volume : 60}
            onChange={(ev) => mandar('volume', Number(ev.target.value))}
            className="w-full accent-accent"
            aria-label="Volume"
          />
        </div>
      </div>

      <div className="text-xs text-ink-2">
        {!info.conhecido ? 'Sem notícia da tela ainda.'
          : e && e.bloqueado ? (
            <span className="text-warn">
              A TV está com o som travado pelo navegador. Toque uma vez na tela dela para liberar — depois disso tudo aqui funciona.
            </span>
          ) : e && e.tocando ? (
            <>Tocando <b className="text-ink">{e.faixa}</b>{e.total > 1 ? ` (${e.indice + 1} de ${e.total})` : ''}</>
          ) : e && e.pausado ? 'Pausada por você.'
          : 'Parada.'}
      </div>
    </div>
  );
}
