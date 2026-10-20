import React, { useEffect, useMemo, useState } from 'react';
import { Check, AlertTriangle } from 'lucide-react';
import { Dialog } from '../ui/Dialog.jsx';
import { Button } from '../ui/Button.jsx';
import { Field, Input } from '../ui/Field.jsx';
import { PecaHtml } from './PecaHtml.jsx';
import { FotoDoProduto } from './FotoDoProduto.jsx';
import { carregarDesenhista, conferirNosFormatos, NOME_DO_FORMATO } from '../../lib/pecaHtml.js';

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
export function AvisoDeEncaixe({ item }) {
  const [avisos, setAvisos] = useState(null);
  useEffect(() => {
    let vivo = true;
    conferirNosFormatos(item).then((r) => { if (vivo) setAvisos(avisosDaConferencia(r)); }).catch(() => {});
    return () => { vivo = false; };
  }, [item]);
  if (!avisos || !avisos.length) return null;
  return (
    <div className="rounded border border-warn/40 bg-warn/10 px-1.5 py-1 text-2xs leading-snug text-ink">
      <span className="font-semibold">revisar:</span> {avisos[0]}{avisos.length > 1 ? ' (+' + (avisos.length - 1) + ')' : ''}
    </div>
  );
}

export function EditarPeca({ item, label, onFechar, onSalvar }) {
  const [definicao, setDefinicao] = useState(null);
  const [campos, setCampos] = useState(() => ({ ...(item.campos || {}) }));
  const [fotoAberta, setFotoAberta] = useState(null);
  const [conferencia, setConferencia] = useState(null);
  const [salvando, setSalvando] = useState(false);

  // Os campos que a peça declara: lidos pela MESMA porta da TV.
  useEffect(() => {
    carregarDesenhista().then(() => setDefinicao(window.MTPecaHtml.higienizar({ html: item.html, css: item.css }).campos));
  }, [item]);

  const atual = useMemo(() => ({ ...item, campos }), [item, campos]);

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
    if (problemas.length && !window.confirm('O texto não cabe em todos os formatos:\n\n' + problemas.slice(0, 4).join('\n') + '\n\nSalvar assim mesmo?')) return;
    setSalvando(true);
    try { await onSalvar(atual); } finally { setSalvando(false); }
  }

  const textos = (definicao || []).filter((c) => c.tipo === 'texto' || c.tipo === 'qr');
  const fotos = (definicao || []).filter((c) => c.tipo === 'img');

  return (
    <Dialog open onClose={onFechar} className="max-w-3xl" title={'Editar · ' + (label || 'peça')}
      description="Troque os textos e a foto. A peça é conferida na TV deitada, em pé e na quadrada enquanto você digita."
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
