import React, { useRef, useState } from 'react';
import { UploadCloud, X, Film, FileText } from 'lucide-react';
import { Input } from '../ui/Field.jsx';
import { Button } from '../ui/Button.jsx';
import { media } from '../../api.js';
import { avaliarVideo } from '../../lib/subir.js';

// Campo de mídia: envia arquivo (para o storage) OU aceita uma URL colada.
// O upload devolve uma URL estável — nada de base64 no config.
export function MediaField({ value, onChange, accept = 'image' }) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // Vídeo que pode engasgar no TV Box: avisa, não proíbe (js/video.js).
  const [aviso, setAviso] = useState('');

  async function onFile(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = ''; // permite reenviar o mesmo arquivo
    if (!file) return;
    setBusy(true); setError(''); setAviso('');
    try {
      if (accept === 'video') {
        const av = await avaliarVideo(file).catch(() => null);
        if (av) setAviso(av.aviso);
      }
      const res = await media.upload(file);
      onChange(res.url);
    } catch (err) {
      setError(err.message || 'Falha no upload.');
    } finally { setBusy(false); }
  }

  const interno = /^\/(media|pecas-ouro)\//.test(String(value || ''));
  const isVideo = accept === 'video';
  const isImage = accept === 'image';
  const isDoc = !isVideo && !isImage; // pptx/pdf etc.
  const inputAccept = isVideo ? 'video/mp4,video/webm' : isImage ? 'image/png,image/jpeg,image/webp,image/gif' : accept;
  return (
    <div className="space-y-2">
      {value ? (
        <div className="relative overflow-hidden rounded-lg border border-line bg-surface-2">
          {isVideo ? (
            <div className="flex items-center gap-2 p-3 text-sm text-ink-2"><Film size={16} /> Vídeo enviado</div>
          ) : isDoc ? (
            <div className="flex items-center gap-2 p-3 text-sm text-ink-2"><FileText size={16} /> Arquivo enviado</div>
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
        <input ref={inputRef} type="file" accept={inputAccept} className="hidden" onChange={onFile} />
        <Button type="button" size="sm" variant="secondary" icon={UploadCloud} onClick={() => inputRef.current && inputRef.current.click()} disabled={busy}>
          {busy ? 'Enviando…' : value ? (isImage ? 'Trocar a foto' : 'Trocar arquivo') : (isImage ? 'Escolher a foto' : 'Enviar arquivo')}
        </Button>
        {/* O endereço interno ("/media/ten_…") não diz nada ao cliente (reteste da fase 10): o campo fica para colar um da internet. */}
        <Input value={interno ? '' : (value || '')} onChange={(e) => onChange(e.target.value)} placeholder="ou cole o endereço de uma da internet" className="flex-1" aria-label="Endereço na internet" />
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
      {aviso && <p className="text-xs text-warn">{aviso}</p>}
    </div>
  );
}
