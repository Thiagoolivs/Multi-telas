import React, { useEffect, useMemo, useRef, useState } from 'react';
import { confirmar } from '../../lib/confirmar.js';
import { aviso } from '../../lib/avisos.js';
import { Check, AlertTriangle } from 'lucide-react';
import { Dialog } from '../ui/Dialog.jsx';
import { Button } from '../ui/Button.jsx';
import { Field, Input } from '../ui/Field.jsx';
import { PecaHtml } from './PecaHtml.jsx';
import { FotoDoProduto } from './FotoDoProduto.jsx';
import { carregarDesenhista, conferirNosFormatos, NOME_DO_FORMATO } from '../../lib/pecaHtml.js';
import { ai, brand } from '../../api.js';

/*
 * Editar os textos e a foto de uma peça em HTML (PLANO §4.5, "Campos"; PR 14).
 *
 * O cliente não vê código: a peça diz quais são os campos (`data-campo`) e
 * o formulário é só isso. A cada mudança a peça é conferida nos três formatos
 * com o detector da bancada — texto que sai da borda ou cobre outro é avisado
 * NA HORA, com o formato e o campo, antes de ir para a TV.
 *
 * O limite de caracteres sai do texto que a peça trazia: o desenho foi feito
 * para aquele tamanho. Uma vez e meia dá folga sem deixar virar parágrafo.
 */
const ROTULO = {
  kicker: 'Chamada pequena (acima do título)', titulo: 'Título', titulo2: 'Título — 2ª linha', apoio: 'Texto de apoio',
  cta: 'Chamada', chamada: 'Chamada', preco: 'Preço', centavos: 'Centavos', marca: 'Nome da empresa', selo: 'Selo',
  quando: 'Quando', endereco: 'Endereço', oferta: 'Oferta', nota: 'Observação', acompanha: 'Acompanha', link: 'Link do QR',
};
export function rotulo(nome) {
  if (ROTULO[nome]) return ROTULO[nome];
  const m = nome.match(/^(\w+?)(\d+)(?:-(\w+))?$/);
  if (m) return m[1].charAt(0).toUpperCase() + m[1].slice(1) + ' ' + m[2] + (m[3] ? ' · ' + m[3] : '');
  return nome.charAt(0).toUpperCase() + nome.slice(1).replace(/-/g, ' ');
}
/*
 * Estilo e marca (§4.15: "trocar marca ou modo reestiliza a peça sem gerar de
 * novo"). A peça só usa as variáveis --mt-*; trocar o modo ou a marca troca
 * os tokens e o mesmo HTML se redesenha — nada vai para a IA, nada é cobrado.
 */
export const ESTILOS = [
  { id: 'escuro', nome: 'Escuro' }, { id: 'claro', nome: 'Claro' }, { id: 'marca', nome: 'Cor da marca' },
];
export const marcaDaPeca = (m) => (m && m.cores && m.cores.length
  ? { cores: m.cores, fonteTitulo: m.fonteTitulo || '', fonteApoio: m.fonteApoio || '' } : null);
const mesmaMarca = (a, b) => !!a && !!b && JSON.stringify(a.cores) === JSON.stringify(b.cores)
  && (a.fonteTitulo || '') === (b.fonteTitulo || '');

const limite = (exemplo) => Math.max(12, Math.ceil(String(exemplo || '').length * 1.5));

// "TV em pé: "Título" passa da borda" — o que o detector achou, na língua de quem usa.
export function avisosDaConferencia(conferencia) {
  return Object.entries(conferencia || {}).flatMap(([f, r]) => [
    ...r.fora.map((n) => NOME_DO_FORMATO[f] + ': "' + rotulo(n) + '" passa da borda'),
    ...r.juntos.map((par) => NOME_DO_FORMATO[f] + ': ' + par.split(' × ').map(rotulo).join(' e ') + ' ficam um sobre o outro'),
  ]);
}

/*
 * A barreira na revisão da campanha (§4.10): a peça que a IA entregou é
 * conferida nos três formatos ANTES de a pessoa salvar ou publicar. É o
 * defeito que o dono achou nas notas do experimento ("Pet Feliz" por cima de
 * "pacote de cuidados") — visto aqui, a peça já vem marcada para revisar.
 */
/*
 * E o conserto: a peça que não coube volta para a IA com a medida (`auto`,
 * uma vez, sozinha) e a nova entra no lugar por `onTrocar`. Se ainda não
 * couber, fica o "revisar:" com o botão — gastar sem parar, não.
 */
export function AvisoDeEncaixe({ item, onTrocar, auto }) {
  const [estado, setEstado] = useState({ fase: 'conferindo', avisos: [] });
  const tentou = useRef(false);
  const trocou = useRef(false);

  async function refazer(avisos, vivo) {
    tentou.current = true;
    setEstado({ fase: 'refazendo', avisos });
    try {
      const out = await ai.refazerPeca(item, avisos);
      if (vivo() && out && out.item) { trocou.current = true; onTrocar(out.item); return; }
    } catch (e) { /* fica o revisar, com o botão */ }
    if (vivo()) setEstado({ fase: 'revisar', avisos });
  }

  useEffect(() => {
    let ativo = true;
    const vivo = () => ativo;
    setEstado({ fase: 'conferindo', avisos: [] });
    conferirNosFormatos(item).then((r) => {
      if (!ativo) return;
      const avisos = avisosDaConferencia(r);
      if (!avisos.length) setEstado({ fase: 'ok', avisos });
      else if (auto && onTrocar && !tentou.current) refazer(avisos, vivo);
      else setEstado({ fase: 'revisar', avisos });
    }).catch(() => {});
    return () => { ativo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item]);

  if (estado.fase === 'ok' && trocou.current) return <div className="text-2xs text-ok">✓ redesenhada para caber</div>;
  if (estado.fase === 'refazendo') return <div className="text-2xs text-ink-3">não coube ({estado.avisos[0]}) — redesenhando…</div>;
  if (estado.fase !== 'revisar') return null;
  return (
    <div className="rounded border border-warn/40 bg-warn/10 px-1.5 py-1 text-2xs leading-snug text-ink">
      <span className="font-semibold">revisar:</span> {estado.avisos[0]}{estado.avisos.length > 1 ? ' (+' + (estado.avisos.length - 1) + ')' : ''}
      {onTrocar && (
        <button type="button" onClick={() => refazer(estado.avisos, () => true)}
          className="ml-1 font-semibold text-accent hover:underline">Refazer</button>
      )}
    </div>
  );
}

export function EditarPeca({ item, label, onFechar, onSalvar }) {
  const [definicao, setDefinicao] = useState(null);
  const [campos, setCampos] = useState(() => ({ ...(item.campos || {}) }));
  const [fotoAberta, setFotoAberta] = useState(null);
  const [conferencia, setConferencia] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [modo, setModo] = useState(item.modo || 'escuro');
  const [marca, setMarca] = useState(item.marca || null);
  const [marcas, setMarcas] = useState([]);

  // As marcas da conta (até três): só aparece a escolha quando há mais de uma.
  useEffect(() => {
    brand.marcas().then((r) => setMarcas(((r && r.marcas) || []).filter((m) => marcaDaPeca(m)))).catch(() => {});
  }, []);

  // Os campos que a peça declara: lidos pela MESMA porta da TV.
  useEffect(() => {
    carregarDesenhista().then(() => setDefinicao(window.MTPecaHtml.higienizar({ html: item.html, css: item.css }).campos));
  }, [item]);

  const atual = useMemo(() => ({ ...item, campos, modo, marca }), [item, campos, modo, marca]);

  // Confere nos três formatos meio segundo depois da última tecla.
  useEffect(() => {
    let vivo = true;
    setConferencia(null);
    const t = setTimeout(() => {
      conferirNosFormatos(atual).then((r) => { if (vivo) setConferencia(r); }).catch(() => {});
    }, 500);
    return () => { vivo = false; clearTimeout(t); };
  }, [atual]);

  const problemas = avisosDaConferencia(conferencia);

  async function salvar() {
    if (problemas.length && !(await confirmar({ titulo: 'O texto não cabe em todos os formatos', texto: problemas.slice(0, 4).join('\n'), botao: 'Salvar assim mesmo' }))) return;
    setSalvando(true);
    // A falha vinha de quem chamou (Resultado, Meus Designs) e ninguém mostrava (D3).
    try { await onSalvar(atual); }
    catch (e) { aviso.erro('peca', 'Não salvou: ' + (e.message || 'falha de conexão') + '. A edição continua aberta.'); }
    finally { setSalvando(false); }
  }

  const textos = (definicao || []).filter((c) => c.tipo === 'texto' || c.tipo === 'qr');
  const fotos = (definicao || []).filter((c) => c.tipo === 'img');

  return (
    <Dialog open onClose={onFechar} className="max-w-3xl" title={'Editar · ' + (label || 'peça')}
      description="Troque os textos, a foto e o estilo. A peça é conferida na TV deitada, em pé e na quadrada enquanto você digita."
      footer={<>
        <Button variant="ghost" onClick={onFechar}>Cancelar</Button>
        <Button variant="primary" icon={Check} disabled={salvando || !definicao} onClick={salvar}>{salvando ? 'Salvando…' : 'Salvar'}</Button>
      </>}>
      <div className="grid gap-4 md:grid-cols-[1.4fr_1fr]">
        <div className="space-y-2">
          <PecaHtml item={atual} formato={item.formato || '16/9'} />
          {conferencia == null
            ? <p className="text-2xs text-ink-3">Conferindo nos três formatos…</p>
            : problemas.length
              ? (
                <div className="rounded-lg border border-warn/40 bg-warn/10 p-2 text-2xs leading-relaxed text-ink">
                  <div className="mb-1 flex items-center gap-1.5 font-semibold"><AlertTriangle size={13} /> Não cabe</div>
                  {problemas.slice(0, 6).map((p, i) => <div key={i}>{p}</div>)}
                  <div className="mt-1 text-ink-3">Encurte o texto até o aviso sumir.</div>
                </div>
              )
              : <p className="flex items-center gap-1.5 text-2xs text-ok"><Check size={13} /> Cabe na TV deitada, em pé e na quadrada.</p>}
        </div>
        <div className="space-y-3">
          <div>
            <span className="mb-1.5 block text-xs font-medium text-ink-2">Estilo</span>
            <div className="flex flex-wrap gap-1.5">
              {ESTILOS.map((e) => (
                <button key={e.id} type="button" onClick={() => setModo(e.id)} aria-pressed={modo === e.id}
                  className={'rounded-md border px-2.5 py-1 text-xs ' + (modo === e.id ? 'border-accent bg-accent/10 font-semibold text-ink' : 'border-line text-ink-2 hover:border-ink-3')}>
                  {e.nome}
                </button>
              ))}
            </div>
          </div>
          {marcas.length > 1 && (
            <div>
              <span className="mb-1.5 block text-xs font-medium text-ink-2">Marca</span>
              <div className="flex flex-wrap gap-1.5">
                {marcas.map((m) => {
                  const nova = marcaDaPeca(m);
                  const ativa = mesmaMarca(marca, nova);
                  return (
                    <button key={m.id} type="button" onClick={() => setMarca(nova)} aria-pressed={ativa}
                      className={'flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs ' + (ativa ? 'border-accent bg-accent/10 font-semibold text-ink' : 'border-line text-ink-2 hover:border-ink-3')}>
                      <span className="flex">{m.cores.slice(0, 2).map((c) => <span key={c} className="h-3 w-3 rounded-full border border-line" style={{ background: c }} />)}</span>
                      {m.nome}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {!definicao && <p className="text-xs text-ink-3">Lendo a peça…</p>}
          {textos.map((c) => {
            const valor = campos[c.nome] != null ? campos[c.nome] : c.exemplo;
            // O texto com que a peça CHEGOU também conta: a reserva preenchida já vem com título maior que o do exemplo.
            const inicial = (item.campos || {})[c.nome];
            const max = c.tipo === 'qr' ? 300 : limite(String(inicial || '').length > String(c.exemplo || '').length ? inicial : c.exemplo);
            return (
              <Field key={c.nome} label={rotulo(c.nome)} hint={c.tipo === 'qr' ? 'O endereço que o QR abre.' : String(valor || '').length + ' de ' + max}>
                <Input value={valor || ''} maxLength={max} onChange={(e) => setCampos((x) => ({ ...x, [c.nome]: e.target.value }))} />
              </Field>
            );
          })}
          {fotos.map((c) => (
            <div key={c.nome}>
              <span className="mb-1.5 block text-xs font-medium text-ink-2">{c.nome === 'foto' ? 'Foto' : rotulo(c.nome)}</span>
              <div className="flex items-center gap-2">
                {campos[c.nome] && <img src={campos[c.nome]} alt="" className="h-12 w-12 rounded-md border border-line object-cover" />}
                <Button size="sm" variant="secondary" onClick={() => setFotoAberta(fotoAberta === c.nome ? null : c.nome)}>
                  {campos[c.nome] ? 'Trocar foto' : 'Escolher foto'}
                </Button>
              </div>
              {fotoAberta === c.nome && (
                <FotoDoProduto incluirIa aviso="Escolha uma foto das suas Mídias ou envie outra." botao="Enviar foto"
                  onFechar={() => setFotoAberta(null)}
                  onEscolher={(url) => { setCampos((x) => ({ ...x, [c.nome]: url })); setFotoAberta(null); }} />
              )}
            </div>
          ))}
        </div>
      </div>
    </Dialog>
  );
}
