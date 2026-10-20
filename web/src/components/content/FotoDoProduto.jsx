import React, { useRef, useState } from 'react';
import { UploadCloud, X } from 'lucide-react';
import { Button } from '../ui/Button.jsx';
import { useAsync } from '../../lib/useAsync.js';
import { media } from '../../api.js';

/*
 * A foto REAL do produto (PLANO §4.11): a imagem gerada parte dela e mantém o
 * produto igual — quem vende aquele vestido não quer um parecido.
 *
 * Só aparecem as fotos que a conta subiu. Imagem gerada por IA não é produto
 * de ninguém, e partir dela seria inventar em cima do inventado. Subir uma
 * foto nova aqui já a guarda em Mídias, como qualquer upload.
 */
const ACEITA = /^image\/(png|jpeg|webp)$/;
const MAX_BYTES = 5 * 1024 * 1024; // o mesmo teto que o servidor lê

export function FotoDoProduto({ onEscolher, onFechar }) {
  const { data, loading } = useAsync(media.list);
  const fotos = ((data && data.items) || []).filter((m) => ACEITA.test(m.mime) && m.origem !== 'ia' && (!m.size || m.size <= MAX_BYTES)).slice(0, 24);
  const entrada = useRef(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');

  async function enviar(e) {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!f) return;
    if (!ACEITA.test(f.type)) { setErro('Use uma foto PNG, JPG ou WEBP.'); return; }
    if (f.size > MAX_BYTES) { setErro('A foto precisa ter até 5 MB.'); return; }
    setEnviando(true); setErro('');
    try {
      const up = await media.upload(f);
      onEscolher(up.url);
    } catch (err) {
      setErro(err.message || 'A foto não subiu.');
    } finally { setEnviando(false); }
  }

  return (
    <div className="mt-2 rounded-lg border border-line bg-surface p-2.5">
      <div className="mb-2 flex items-start justify-between gap-2">
        <span className="text-xs text-ink-2">Escolha a foto do produto. A IA cria a cena com <b className="text-ink">o seu produto, igual</b>.</span>
        <button type="button" onClick={onFechar} aria-label="Fechar"
          className="rounded p-0.5 text-ink-3 transition hover:text-ink"><X size={14} /></button>
      </div>
      {loading
        ? <p className="text-xs text-ink-3">Carregando suas fotos…</p>
        : fotos.length
          ? (
            <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-6">
              {fotos.map((m) => (
                <button key={m.id} type="button" onClick={() => onEscolher(m.url)} title={m.name || ''}
                  className="aspect-square overflow-hidden rounded-md border border-line transition hover:border-accent">
                  <img src={m.url} alt={m.name || ''} loading="lazy" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          )
          : <p className="text-xs text-ink-3">Nenhuma foto sua em Mídias ainda.</p>}
      <div className="mt-2">
        <input ref={entrada} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={enviar} />
        <Button type="button" size="sm" variant="secondary" icon={UploadCloud} disabled={enviando}
          onClick={() => entrada.current && entrada.current.click()}>
          {enviando ? 'Enviando…' : 'Enviar foto do produto'}
        </Button>
      </div>
      {erro && <p className="mt-1.5 text-xs text-danger">{erro}</p>}
    </div>
  );
}
