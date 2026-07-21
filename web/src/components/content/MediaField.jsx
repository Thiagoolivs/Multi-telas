import React, { useRef, useState } from 'react';
import { UploadCloud, X, Film } from 'lucide-react';
import { Input } from '../ui/Field.jsx';
import { Button } from '../ui/Button.jsx';
import { media } from '../../api.js';

// Campo de mídia: envia arquivo (para o storage) OU aceita uma URL colada.
// O upload devolve uma URL estável — nada de base64 no config.
export function MediaField({ value, onChange, accept = 'image' }) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function onFile(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = ''; // permite reenviar o mesmo arquivo
    if (!file) return;
    setBusy(true); setError('');
    try {
      const res = await media.upload(file);
      onChange(res.url);
    } catch (err) {
      setError(err.message || 'Falha no upload.');
    } finally { setBusy(false); }
  }

  const isVideo = accept === 'video';
  return (
    <div className="space-y-2">
      {value ? (
        <div className="relative overflow-hidden rounded-lg border border-line bg-surface-2">
          {isVideo ? (
            <div className="flex items-center gap-2 p-3 text-sm text-ink-2"><Film size={16} /> Vídeo enviado</div>
          ) : (
            <img src={value} alt="" className="max-h-40 w-full object-contain" onError={(e) => { e.currentTarget.style.opacity = 0.3; }} />
          )}
          <button type="button" onClick={() => onChange('')} aria-label="Remover"
            className="absolute right-1.5 top-1.5 rounded-md bg-ink/60 p-1 text-white transition hover:bg-ink/80">
            <X size={14} />
          </button>
        </div>
      ) : null}

      <div className="flex items-center gap-2">
        <input ref={inputRef} type="file" accept={isVideo ? 'video/mp4,video/webm' : 'image/png,image/jpeg,image/webp,image/gif'} className="hidden" onChange={onFile} />
        <Button type="button" size="sm" variant="secondary" icon={UploadCloud} onClick={() => inputRef.current && inputRef.current.click()} disabled={busy}>
          {busy ? 'Enviando…' : value ? 'Trocar arquivo' : 'Enviar arquivo'}
        </Button>
        <Input value={value || ''} onChange={(e) => onChange(e.target.value)} placeholder="ou cole uma URL" className="flex-1" />
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
