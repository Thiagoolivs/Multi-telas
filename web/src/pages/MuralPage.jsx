import React, { useEffect, useState } from 'react';
import { QrCode, Printer, ShieldAlert, EyeOff, Eye, Trash2, Plus, RefreshCw } from 'lucide-react';
import { murais as api } from '../api.js';
import { aviso } from '../lib/avisos.js';
import { Panel, PanelHeader, PanelBody } from '../components/ui/Panel.jsx';
import { Button, IconButton } from '../components/ui/Button.jsx';
import { Input } from '../components/ui/Field.jsx';
import { Badge } from '../components/ui/Badge.jsx';
import { EmptyState, ErrorState, Spinner } from '../components/ui/Feedback.jsx';
import { Dialog } from '../components/ui/Dialog.jsx';

/*
 * Mural: o painel de quem está no evento com o celular na mão.
 *
 * A tela inteira é desenhada para o pior momento, não para o melhor: alguém
 * mandou uma foto que não podia entrar e a TV está no meio do salão. Por isso o
 * botão de pânico fica sempre visível, nunca escondido atrás de um menu, e o
 * que ele faz está escrito antes de ser apertado.
 */
export function MuralPage() {
  const [lista, setLista] = useState(null);
  const [base, setBase] = useState('');
  const [erro, setErro] = useState('');
  const [ativo, setAtivo] = useState('');

  useEffect(() => { carregar(); }, []);

  async function carregar() {
    try {
      const r = await api.list();
      setLista(r.murais || []);
      setBase(r.base || window.location.origin);
      setAtivo((a) => a || (r.murais && r.murais[0] ? r.murais[0].id : ''));
      setErro('');
    } catch (e) { setErro(e.message); }
  }

  // Um clique, um mural: o segundo clique antes da resposta criava outro (D3).
  const [criando, setCriando] = useState(false);
  async function criar() {
    if (criando) return;
    setCriando(true);
    try {
      const m = await api.create('Mural de fotos');
      await carregar();
      setAtivo(m.id);
    } catch (e) { aviso.erro('mural', e.message || 'Não deu para criar o mural.'); }
    finally { setCriando(false); }
  }

  if (erro && lista === null) return <ErrorState description={erro} onRetry={carregar} />;
  if (lista === null) return <div className="flex justify-center py-16"><Spinner size={20} /></div>;

  if (!lista.length) {
    return (
      <EmptyState
        icon={QrCode}
        title="Nenhum mural ainda"
        description="Um mural gera um QR. Quem apontar a câmera manda uma foto — e ela aparece na TV em segundos. Serve para evento de Dia dos Pais, confraternização, festa junina, aniversário da empresa."
        action={<Button variant="primary" icon={Plus} onClick={criar} disabled={criando}>{criando ? 'Criando…' : 'Criar meu primeiro mural'}</Button>}
      />
    );
  }

  const mural = lista.find((m) => m.id === ativo) || lista[0];
  return (
    <div className="space-y-4">
      {lista.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {lista.map((m) => (
            <button
              key={m.id}
              onClick={() => setAtivo(m.id)}
              className={
                'rounded-md border px-3 py-1.5 text-sm transition ' +
                (m.id === mural.id ? 'border-accent bg-accent/10 text-ink' : 'border-line text-ink-2 hover:text-ink')
              }
            >
              {m.titulo}
              {!m.aceitando && <span className="ml-1.5 text-xs text-ink-3">fechado</span>}
            </button>
          ))}
        </div>
      )}
      <MuralDetalhe mural={mural} base={base} onMudou={carregar} onCriar={criar} />
    </div>
  );
}

function MuralDetalhe({ mural, base, onMudou, onCriar }) {
  const [fotos, setFotos] = useState(null);
  const [titulo, setTitulo] = useState(mural.titulo);
  const [confirmar, setConfirmar] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const link = base + '/m/' + mural.codigo;

  useEffect(() => { setTitulo(mural.titulo); setFotos(null); carregar(); }, [mural.id]);
  // Sem recarregar, a moderação chega tarde: aqui o atraso é o problema.
  useEffect(() => {
    const t = setInterval(carregar, 8000);
    return () => clearInterval(t);
  }, [mural.id]);

  /*
   * Toda ação do mural diz quando falha (EXECUTOR D3). Antes: o pânico ficava
   * preso em "Tirando…" sem aviso — no pior momento, nada acontecia; "tirar
   * da tela" marcava a foto como fora antes da resposta e não desfazia; e a
   * lista que não carregava ficava em "carregando…" para sempre.
   */
  const [erroFotos, setErroFotos] = useState('');
  async function carregar() {
    try { const r = await api.fotos(mural.id); setFotos(r.fotos || []); setErroFotos(''); }
    catch (e) { setErroFotos(e.message || 'Não deu para carregar as fotos.'); setFotos((f) => f || []); }
  }

  async function alternarAceite() {
    setOcupado(true);
    try { await api.update(mural.id, titulo, !mural.aceitando); await onMudou(); }
    catch (e) { aviso.erro('mural', e.message || 'Não deu para mudar o mural.'); }
    finally { setOcupado(false); }
  }
  async function salvarTitulo() {
    if (titulo === mural.titulo) return;
    try { await api.update(mural.id, titulo, mural.aceitando); onMudou(); }
    catch (e) { aviso.erro('mural', e.message || 'Não deu para salvar o nome.'); setTitulo(mural.titulo); }
  }
  async function panico() {
    setOcupado(true);
    try {
      await api.limpar(mural.id);
      setConfirmar(false);
      await Promise.all([carregar(), onMudou()]);
    } catch (e) {
      // O pânico NÃO pode falhar calado: a pessoa precisa saber que a TV ainda mostra as fotos.
      aviso.erro('mural', 'As fotos NÃO saíram da TV: ' + (e.message || 'falha de conexão') + '. Tente de novo.');
    } finally { setOcupado(false); }
  }
  async function esconder(f) {
    // Otimista, mas desfaz se o servidor recusar: o painel não pode dizer "fora da tela" com a foto na TV.
    setFotos((atual) => atual.map((x) => (x.id === f.id ? { ...x, oculta: !x.oculta } : x)));
    try { if (f.oculta) await api.mostrarFoto(f.id); else await api.ocultarFoto(f.id); }
    catch (e) {
      setFotos((atual) => atual.map((x) => (x.id === f.id ? { ...x, oculta: f.oculta } : x)));
      aviso.erro('mural', 'A foto continua ' + (f.oculta ? 'fora da' : 'na') + ' TV: ' + (e.message || 'falha de conexão') + '.');
    }
    carregar();
  }

  const visiveis = (fotos || []).filter((f) => !f.oculta).length;

  return (
    <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
      <div className="space-y-4">
        <Panel>
          <PanelBody className="space-y-3 text-center">
            <img src={api.qr(link)} alt="QR do mural" className="mx-auto w-full max-w-[220px] rounded-lg bg-white p-3" />
            <div className="text-sm font-medium text-ink">{link.replace(/^https?:\/\//, '')}</div>
            <div className="text-2xl font-bold tracking-[.2em] text-ink">{mural.codigo}</div>
            <p className="text-xs text-ink-3">
              Imprima e deixe nas mesas. Quem não conseguir ler o QR pode digitar o endereço com esse código.
            </p>
            <div className="flex gap-2">
              <Button size="sm" icon={Printer} className="flex-1" onClick={() => imprimir(mural, link)}>Imprimir cartaz</Button>
              <Button size="sm" className="flex-1" onClick={() => navigator.clipboard && navigator.clipboard.writeText(link)}>Copiar link</Button>
            </div>
          </PanelBody>
        </Panel>

        <Panel>
          <PanelBody className="space-y-3">
            <label className="block text-xs font-medium text-ink-2">Nome do mural</label>
            <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} onBlur={salvarTitulo} />
            <div className="flex items-center justify-between rounded-md border border-line bg-surface-2 px-3 py-2">
              <div className="text-sm">
                <div className="font-medium text-ink">{mural.aceitando ? 'Aberto' : 'Fechado'}</div>
                <div className="text-xs text-ink-3">
                  {mural.aceitando ? 'está recebendo fotos agora' : 'ninguém consegue enviar'}
                </div>
              </div>
              <Button size="sm" onClick={alternarAceite} disabled={ocupado}>
                {mural.aceitando ? 'Fechar' : 'Abrir'}
              </Button>
            </div>

            {/*
              O botão de pânico. Fica à vista e diz o que faz — inclusive que
              nada é apagado, porque saber disso é o que permite apertar sem
              medo no momento em que ele é necessário.
            */}
            <Button
              variant="danger"
              icon={ShieldAlert}
              className="w-full"
              onClick={() => setConfirmar(true)}
              disabled={ocupado || !visiveis}
            >
              Tirar tudo da tela agora
            </Button>
            <p className="text-xs text-ink-3">
              Some da TV na hora e fecha o mural. Nada é apagado — as fotos continuam aqui embaixo,
              e você devolve as que quiser uma a uma.
            </p>
          </PanelBody>
        </Panel>
      </div>

      <Panel>
        <PanelHeader
          title="Fotos recebidas"
          description={erroFotos ? erroFotos : fotos === null ? 'carregando…' : `${visiveis} na tela · ${fotos.length} no total`}
          actions={
            <div className="flex gap-2">
              <IconButton icon={RefreshCw} label="Atualizar" onClick={carregar} />
              <Button size="sm" icon={Plus} onClick={onCriar}>Novo mural</Button>
            </div>
          }
        />
        <PanelBody>
          {fotos === null ? (
            <div className="flex justify-center py-10"><Spinner size={18} /></div>
          ) : !fotos.length ? (
            <EmptyState
              icon={QrCode}
              title="Ainda não chegou nenhuma foto"
              description={mural.aceitando
                ? 'Deixe o QR à vista. A primeira foto costuma puxar as outras.'
                : 'O mural está fechado — abra ao lado para começar a receber.'}
            />
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
              {fotos.map((f) => (
                <figure key={f.id} className="overflow-hidden rounded-lg border border-line bg-surface-2">
                  <div className="relative aspect-square">
                    <img src={f.url} alt="" className={'h-full w-full object-cover ' + (f.oculta ? 'opacity-30 grayscale' : '')} />
                    {f.oculta && (
                      <span className="absolute left-2 top-2"><Badge tone="neutral">fora da tela</Badge></span>
                    )}
                  </div>
                  <figcaption className="space-y-1.5 p-2">
                    {f.mensagem && <p className="line-clamp-2 text-xs text-ink-2">{f.mensagem}</p>}
                    <p className="text-[11px] text-ink-3">{f.autor || 'sem nome'} · {hora(f.createdAt)}</p>
                    <Button size="sm" className="w-full" icon={f.oculta ? Eye : EyeOff} onClick={() => esconder(f)}>
                      {f.oculta ? 'Devolver à tela' : 'Tirar da tela'}
                    </Button>
                  </figcaption>
                </figure>
              ))}
            </div>
          )}
        </PanelBody>
      </Panel>

      <Dialog
        open={confirmar}
        onClose={() => setConfirmar(false)}
        title="Tirar tudo da tela?"
        description={`As ${visiveis} fotos somem da TV agora e o mural para de receber novas. Nada é apagado — dá para devolver depois.`}
        footer={
          <>
            <Button onClick={() => setConfirmar(false)}>Cancelar</Button>
            <Button variant="danger" icon={ShieldAlert} onClick={panico} disabled={ocupado}>
              {ocupado ? 'Tirando…' : 'Tirar tudo agora'}
            </Button>
          </>
        }
      />
    </div>
  );
}

function hora(ts) {
  if (!ts) return '';
  return new Date(Number(ts)).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

/*
 * Cartaz para imprimir. Uma janela com HTML próprio em vez de estilos de
 * impressão na página: o que vai para a mesa do evento é só o QR grande e a
 * instrução — nada de menu, cabeçalho ou lista de fotos.
 */
function imprimir(mural, link) {
  const w = window.open('', '_blank', 'width=800,height=1000');
  if (!w) return;
  const esc = (s) => String(s || '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  w.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<title>${esc(mural.titulo)}</title><style>
  @page { margin: 14mm; }
  body { margin:0; font:16px/1.4 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif; color:#111;
    display:flex; flex-direction:column; align-items:center; justify-content:center;
    min-height:100vh; text-align:center; }
  h1 { font-size:44px; margin:0 0 6px; letter-spacing:-.02em; }
  p.sub { font-size:22px; color:#444; margin:0 0 26px; }
  img { width:min(74vw, 420px); height:auto; }
  .cod { font-size:30px; font-weight:700; letter-spacing:.24em; margin-top:14px; }
  .url { font-size:18px; color:#555; margin-top:4px; }
  .fim { font-size:14px; color:#777; margin-top:30px; max-width:440px; }
</style></head><body>
  <h1>${esc(mural.titulo)}</h1>
  <p class="sub">Aponte a câmera do celular e mande a sua foto</p>
  <img src="/api/qr.svg?d=${encodeURIComponent(link)}" alt="">
  <div class="cod">${esc(mural.codigo)}</div>
  <div class="url">${esc(link.replace(/^https?:\/\//, ''))}</div>
  <p class="fim">Ela aparece na tela em segundos. Não envie foto de outra pessoa sem a autorização dela.</p>
<script>window.onload = function(){ setTimeout(function(){ window.print(); }, 300); };<\/script>
</body></html>`);
  w.document.close();
}
