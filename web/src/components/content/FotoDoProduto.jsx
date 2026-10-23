import React, { useEffect, useRef, useState } from 'react';
import { UploadCloud, X, Search } from 'lucide-react';
import { Button } from '../ui/Button.jsx';
import { useAsync } from '../../lib/useAsync.js';
import { media, pixabay, bancoImagens } from '../../api.js';

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

/*
 * Também é o seletor de foto do editor de textos da peça (`aviso`, `botao`,
 * `incluirIa`): lá a foto não é referência de produto, então a gerada vale.
 */
export function FotoDoProduto({ onEscolher, onFechar, aviso, botao, incluirIa }) {
  const { data, loading } = useAsync(media.list);
  const fotos = ((data && data.items) || []).filter((m) => ACEITA.test(m.mime) && (incluirIa || m.origem !== 'ia') && (!m.size || m.size <= MAX_BYTES)).slice(0, 24);
  const entrada = useRef(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');
  const [aba, setAba] = useState('minhas');
  const { data: banco } = useAsync(pixabay.estado);
  const bancoLigado = !!(banco && banco.configurado);

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
        <span className="text-xs text-ink-2">{aviso || <>Escolha a foto do produto. A IA cria a cena com <b className="text-ink">o seu produto, igual</b>.</>}</span>
        <button type="button" onClick={onFechar} aria-label="Fechar"
          className="rounded p-0.5 text-ink-3 transition hover:text-ink"><X size={14} /></button>
      </div>
      {/* D37: fora da foto de produto (que tem de ser o produto de verdade), o banco de imagens. */}
      {/* O acervo comum do segmento vale mesmo sem a Pixabay ligada; a busca na Pixabay só com ela. */}
      {incluirIa && (
        <div className="mb-2 flex gap-1" role="tablist" aria-label="De onde vem a foto">
          {[['minhas', 'Minhas fotos'], ['banco', 'Banco de imagens']].map(([id, nome]) => (
            <button key={id} type="button" role="tab" aria-selected={aba === id} onClick={() => setAba(id)}
              className={'rounded-md px-2.5 py-1 text-xs font-medium ' + (aba === id ? 'bg-accent-soft text-accent' : 'text-ink-2 hover:bg-surface-2')}>{nome}</button>
          ))}
        </div>
      )}
      {aba === 'banco' ? <BancoDeImagens onEscolher={onEscolher} pixabayLigada={bancoLigado} /> : loading
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
      {aba !== 'banco' && <div className="mt-2">
        <input ref={entrada} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={enviar} />
        <Button type="button" size="sm" variant="secondary" icon={UploadCloud} disabled={enviando}
          onClick={() => entrada.current && entrada.current.click()}>
          {enviando ? 'Enviando…' : (botao || 'Enviar foto do produto')}
        </Button>
      </div>}
      {erro && <p className="mt-1.5 text-xs text-danger">{erro}</p>}
    </div>
  );
}

/*
 * O BANCO DE IMAGENS. Primeiro o ACERVO COMUM do segmento da conta (as fotos
 * que o operador escolheu para padaria, ótica…): sem procurar nada, já
 * aparece o que serve. Depois a busca na Pixabay pelo servidor (EXECUTOR
 * D37), que procura também no acervo. "Usar" uma da Pixabay baixa a foto
 * para as suas Mídias e devolve o crédito, que vai junto da peça e aparece
 * discreto no canto da TV.
 */
function BancoDeImagens({ onEscolher, pixabayLigada }) {
  const [termo, setTermo] = useState('');
  const [busca, setBusca] = useState(null);
  const [buscando, setBuscando] = useState(false);
  const [usando, setUsando] = useState(null);
  const [erro, setErro] = useState('');
  const [acervo, setAcervo] = useState(null);

  useEffect(() => {
    let vivo = true;
    bancoImagens.feed({ limite: 12 })
      .then((r) => (r.daConta ? bancoImagens.feed({ segmento: r.daConta, limite: 12 }) : r))
      .then((r) => { if (vivo) setAcervo(r.itens || []); })
      .catch(() => { if (vivo) setAcervo([]); });
    return () => { vivo = false; };
  }, []);

  async function procurar(e) {
    if (e) e.preventDefault();
    const t = termo.trim();
    if (!t) return;
    setBuscando(true); setErro('');
    bancoImagens.feed({ q: t, limite: 12 }).then((r) => setAcervo(r.itens || [])).catch(() => {});
    try { if (pixabayLigada) setBusca(await pixabay.buscar(t)); }
    catch (err) { setErro(err.message || 'A busca não respondeu.'); }
    finally { setBuscando(false); }
  }
  async function doAcervo(i) {
    setUsando(i.id); setErro('');
    try { const r = await bancoImagens.usar(i.id); onEscolher(r.item.url, r.item.credito ? { credito: r.item.credito } : undefined); }
    catch (err) { setErro(err.message || 'Não deu para usar esta foto.'); }
    finally { setUsando(null); }
  }
  async function usar(f) {
    setUsando(f.id); setErro('');
    try { const r = await pixabay.usar(f.id); onEscolher(r.url, { credito: r.credito }); }
    catch (err) { setErro(err.message || 'Não deu para usar esta foto.'); }
    finally { setUsando(null); }
  }
  return (
    <div>
      {acervo && acervo.length > 0 && (
        <div className="mb-2.5">
          <div className="mb-1 text-2xs font-semibold uppercase tracking-wider text-ink-3">Do acervo MultiTelas</div>
          <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-6">
            {acervo.map((i) => (
              <button key={i.id} type="button" onClick={() => doAcervo(i)} disabled={!!usando} title={i.descricao + (i.credito ? ' · ' + i.credito : '')}
                className="relative aspect-square overflow-hidden rounded-md border border-line transition hover:border-accent disabled:opacity-60">
                <img src={i.url} alt="" loading="lazy" className="h-full w-full object-cover" />
                {usando === i.id && <span className="absolute inset-0 flex items-center justify-center bg-black/50 text-[10px] font-semibold text-white">Usando…</span>}
              </button>
            ))}
          </div>
        </div>
      )}
      <form onSubmit={procurar} className="mb-2 flex gap-2">
        <input value={termo} onChange={(e) => setTermo(e.target.value)} placeholder="Ex.: café, equipe, fábrica, Natal" aria-label="Procurar no banco de imagens"
          className="min-w-0 flex-1 rounded-md border border-line bg-surface px-2.5 py-1.5 text-sm text-ink outline-none placeholder:text-ink-3 focus:border-accent" />
        <Button type="submit" size="sm" icon={Search} disabled={!termo.trim() || buscando}>{buscando ? 'Procurando…' : 'Procurar'}</Button>
      </form>
      {busca && (busca.fotos.length ? (
        <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-5">
          {busca.fotos.map((f) => (
            <button key={f.id} type="button" onClick={() => usar(f)} disabled={!!usando} title={'Foto: ' + f.autor + ' / Pixabay'}
              className="relative aspect-square overflow-hidden rounded-md border border-line transition hover:border-accent disabled:opacity-60">
              <img src={f.previa} alt={f.tags} loading="lazy" className="h-full w-full object-cover" />
              {usando === f.id && <span className="absolute inset-0 flex items-center justify-center bg-black/50 text-[10px] font-semibold text-white">Baixando…</span>}
            </button>
          ))}
        </div>
      ) : <p className="text-xs text-ink-3">Nada encontrado. Tente outra palavra.</p>)}
      <p className="mt-2 text-2xs text-ink-3">{pixabayLigada
        ? 'Fotos do acervo e da Pixabay, livres para uso. A da Pixabay vai para as suas Mídias, com o crédito do autor.'
        : 'Fotos do acervo MultiTelas, livres para uso.'}</p>
      {erro && <p className="mt-1.5 text-xs text-danger">{erro}</p>}
    </div>
  );
}
