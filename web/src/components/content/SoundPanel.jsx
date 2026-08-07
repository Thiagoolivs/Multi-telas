import React, { useRef, useState } from 'react';
import { Music, Upload, Trash2, ArrowUp, ArrowDown } from 'lucide-react';
import { media } from '../../api.js';
import { Checkbox } from '../ui/Field.jsx';
import { Button, IconButton } from '../ui/Button.jsx';
import { SoundRemote } from './SoundRemote.jsx';

const VAZIO = { ativo: false, faixas: [], volume: 60, aleatorio: false, abaixarComVideo: true };

/*
 * Som da tela: a playlist (que é configuração, e vai junto ao salvar) e o
 * controle ao vivo (que é ação, e vai direto para a TV por SSE).
 *
 * Os dois moram juntos porque na cabeça de quem usa isso é uma coisa só — "o
 * som desta tela" —, mas percorrem caminhos diferentes de propósito: mexer no
 * volume no meio de um evento não pode exigir salvar e reconstruir o palco.
 */
export function SoundPanel({ audio, onChange, deviceId }) {
  const a = { ...VAZIO, ...(audio || {}) };
  const set = (patch) => onChange({ ...a, ...patch });
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  const inputRef = useRef(null);

  async function enviar(e) {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (!files.length) return;
    setEnviando(true); setErro('');
    const novas = [];
    for (const f of files) {
      try {
        const r = await media.upload(f);
        novas.push({ url: r.url, nome: (f.name || '').replace(/\.[^.]+$/, '').slice(0, 120) });
      } catch (err) { setErro(err.message || 'falha no envio'); }
    }
    if (novas.length) {
      // Primeira música que entra já liga a trilha: ninguém sobe um MP3 para
      // deixá-lo desligado.
      set({ faixas: [...a.faixas, ...novas], ativo: a.ativo || a.faixas.length === 0 });
    }
    setEnviando(false);
  }

  const mover = (i, d) => {
    const f = a.faixas.slice();
    const j = i + d;
    if (j < 0 || j >= f.length) return;
    const t = f[i]; f[i] = f[j]; f[j] = t;
    set({ faixas: f });
  };
  const remover = (i) => {
    const f = a.faixas.filter((_, k) => k !== i);
    set({ faixas: f, ativo: f.length ? a.ativo : false });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-ink"><Music size={15} /> Música de fundo</h3>
          <p className="mt-0.5 text-xs text-ink-3">
            Toca por baixo de tudo o que passa na tela, sem interromper a programação.
          </p>
        </div>
        <Checkbox
          label={a.ativo ? 'Ligada' : 'Desligada'}
          checked={a.ativo}
          disabled={!a.faixas.length}
          onChange={(e) => set({ ativo: e.target.checked })}
        />
      </div>

      {/*
        O controle ao vivo vem ANTES da playlist. Quem abre isto durante um
        evento quer abaixar o volume, não reordenar as músicas — e antes ele
        ficava no fim de um diálogo comprido, atrás de uma rolagem.
      */}
      {deviceId && a.ativo && (
        <div className="rounded-lg border border-line bg-surface p-3">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-3">Controle ao vivo</div>
          <SoundRemote deviceId={deviceId} />
        </div>
      )}

      {/* Playlist */}
      <div className="space-y-2">
        {a.faixas.map((f, i) => (
          <div key={f.url + i} className="flex items-center gap-2 rounded-md border border-line bg-surface-2 px-2.5 py-2">
            <span className="w-5 shrink-0 text-center text-xs tabular-nums text-ink-3">{i + 1}</span>
            <span className="min-w-0 flex-1 truncate text-sm text-ink">{f.nome || f.url.split('/').pop()}</span>
            <IconButton icon={ArrowUp} label="Subir" onClick={() => mover(i, -1)} />
            <IconButton icon={ArrowDown} label="Descer" onClick={() => mover(i, 1)} />
            <IconButton icon={Trash2} label="Remover" onClick={() => remover(i)} />
          </div>
        ))}
        {!a.faixas.length && (
          <p className="rounded-md border border-dashed border-line px-3 py-4 text-center text-xs text-ink-3">
            Nenhuma música ainda. Envie MP3, M4A, OGG ou WAV.
          </p>
        )}
      </div>

      <input ref={inputRef} type="file" accept="audio/*" multiple className="hidden" onChange={enviar} />
      <Button size="sm" icon={Upload} onClick={() => inputRef.current && inputRef.current.click()} disabled={enviando}>
        {enviando ? 'Enviando…' : 'Enviar música'}
      </Button>
      {erro && <p className="text-xs text-danger">{erro}</p>}

      {/* Volume e comportamento */}
      <div className="space-y-3 border-t border-line pt-3">
        <label className="block">
          <span className="mb-1 flex items-center justify-between text-xs font-medium text-ink-2">
            <span>Volume</span><span className="tabular-nums text-ink-3">{a.volume}%</span>
          </span>
          <input
            type="range" min="0" max="100" value={a.volume}
            onChange={(e) => set({ volume: Number(e.target.value) })}
            className="w-full accent-accent"
          />
        </label>
        <Checkbox
          label="Ordem aleatória"
          checked={a.aleatorio}
          onChange={(e) => set({ aleatorio: e.target.checked })}
        />
        <div>
          <Checkbox
            label="Abaixar quando entrar vídeo"
            checked={a.abaixarComVideo}
            onChange={(e) => set({ abaixarComVideo: e.target.checked })}
          />
          <p className="mt-1 pl-6 text-xs text-ink-3">
            O vídeo passa a tocar com som e a música cai para um fundo baixo, voltando quando ele acaba.
          </p>
        </div>
      </div>

    </div>
  );
}
