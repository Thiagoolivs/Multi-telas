import React, { useCallback, useEffect, useRef, useState } from 'react';
import { RotateCcw, Hash, Eraser, Minus, Plus, Tv, Check } from 'lucide-react';
import { senhas as api } from '../api.js';
import { aviso } from '../lib/avisos.js';
import { confirmar } from '../lib/confirmar.js';
import { PageHeader } from '../components/layout/PageHeader.jsx';
import { Panel, PanelHeader, PanelBody } from '../components/ui/Panel.jsx';
import { Button, IconButton } from '../components/ui/Button.jsx';
import { Field, Input, Select } from '../components/ui/Field.jsx';
import { ErrorState, Spinner } from '../components/ui/Feedback.jsx';
import { cn } from '../lib/cn.js';

/*
 * CHAMADA DE SENHA (fase 12 do plano de ação). A recepção chama a próxima
 * pelo celular ou pelo computador, e a TV da sala de espera mostra a senha
 * gigante e onde ir (server/routes/senha.js, js/senha.js). Nunca o nome do
 * paciente: o lugar é escolhido de uma lista, com número.
 *
 * Feita para o celular na mão da recepcionista: um botão grande, o único
 * violeta da tela, e o resto à mão embaixo. Onde ela atende e a letra ficam
 * guardados NESTE aparelho (cada recepção tem o seu guichê).
 */

const TIPOS = [
  ['guiche', 'Guichê'], ['consultorio', 'Consultório'], ['sala', 'Sala'],
  ['triagem', 'Triagem'], ['caixa', 'Caixa'], ['mesa', 'Mesa'],
];
const LETRAS = ['', 'A', 'B', 'C', 'D', 'E', 'N', 'P', 'R', 'X'];

// Um valor guardado neste aparelho (localStorage pode não existir: aba anônima, app velho).
function useGuardado(chave, inicial) {
  const [valor, setValor] = useState(() => {
    try { const v = localStorage.getItem(chave); return v === null ? inicial : JSON.parse(v); } catch (e) { return inicial; }
  });
  const mudar = (v) => { setValor(v); try { localStorage.setItem(chave, JSON.stringify(v)); } catch (e) { /* sem espaço: vale só nesta visita */ } };
  return [valor, mudar];
}

const textoSenha = (letra, n) => (letra ? letra + ' ' : '') + String(n).padStart(3, '0');
const nomeDoLocal = (tipo, n) => {
  const t = (TIPOS.find((x) => x[0] === tipo) || TIPOS[0])[1];
  return n ? t + ' ' + n : t;
};
const hora = (ms) => { try { return new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; } };

export function SenhaPage({ onIr }) {
  const [fila, setFila] = useState(null);
  const [erro, setErro] = useState('');
  const [grupo, setGrupo] = useGuardado('mt.senha.grupo', '');
  const [letra, setLetra] = useGuardado('mt.senha.letra', 'A');
  const [tipo, setTipo] = useGuardado('mt.senha.tipo', 'guiche');
  const [numLocal, setNumLocal] = useGuardado('mt.senha.numero', 1);
  const [ocupado, setOcupado] = useState('');
  const [abrirNumero, setAbrirNumero] = useState(false);
  const [numero, setNumero] = useState('');
  const ultimo = useRef(0);

  const carregar = useCallback(async (g) => {
    const pedido = ++ultimo.current;
    try {
      const r = await api.fila(g);
      if (pedido !== ultimo.current) return;   // uma resposta velha não passa por cima da nova
      setFila(r);
      setErro('');
    } catch (e) { if (pedido === ultimo.current) setErro(e.message); }
  }, []);

  useEffect(() => { carregar(grupo); }, [grupo, carregar]);
  // Outra recepção chamou: a lista se atualiza sozinha (a cada 5 s, só com a página à vista).
  useEffect(() => {
    const t = setInterval(() => { if (!document.hidden && !ocupado) carregar(grupo); }, 5000);
    return () => clearInterval(t);
  }, [grupo, ocupado, carregar]);

  // O grupo guardado sumiu das TVs (renomearam): volta para "todas as TVs".
  useEffect(() => {
    if (fila && grupo && !(fila.grupos || []).includes(grupo)) setGrupo('');
  }, [fila]); // eslint-disable-line react-hooks/exhaustive-deps

  const local = { tipo, numero: tipo === 'triagem' ? Number(numLocal) || 0 : Math.max(1, Number(numLocal) || 1) };

  async function fazer(qual, pedido) {
    if (ocupado) return;
    setOcupado(qual);
    try {
      const r = await pedido();
      ultimo.current++;
      setFila(r);
      return r;
    } catch (e) {
      aviso.erro('senha', 'A chamada não saiu.', e.message);
      return null;
    } finally { setOcupado(''); }
  }

  const proxima = () => fazer('proxima', () => api.proxima({ grupo, prefixo: letra, local }));
  const rechamar = () => fazer('rechamar', () => api.rechamar(grupo));
  async function chamarNumero(ev) {
    if (ev) ev.preventDefault();
    const n = Number(numero);
    if (!Number.isInteger(n) || n < 1 || n > 999) { aviso.erro('senha', 'Digite um número de 1 a 999.'); return; }
    const r = await fazer('numero', () => api.chamar({ grupo, prefixo: letra, numero: n, local }));
    if (r) { setNumero(''); setAbrirNumero(false); }
  }
  async function zerar() {
    const ok = await confirmar({
      titulo: 'Zerar as senhas de hoje?',
      texto: 'A próxima volta a ser a ' + textoSenha(letra, 1) + ' e a TV deixa de mostrar as chamadas de hoje.',
      botao: 'Zerar', perigo: true,
    });
    if (!ok) return;
    const r = await fazer('zerar', () => api.zerar(grupo));
    if (r) aviso.ok('Senhas zeradas. A próxima é a ' + textoSenha(letra, 1) + '.');
  }

  if (erro && !fila) return <ErrorState description={erro} onRetry={() => carregar(grupo)} />;
  if (!fila) return <div className="flex justify-center py-16"><Spinner size={20} /></div>;

  const atual = fila.atual;
  const proximo = (fila.proximos && fila.proximos[letra]) || 1;
  const historico = [atual, ...(fila.anteriores || [])].filter(Boolean);
  const telas = fila.telas || { total: 0, ligadas: 0 };

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Chamada de senha" subtitle="A TV da sala de espera mostra a senha e onde ir. Nunca o nome do paciente." />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="space-y-4">
          <Panel>
            <PanelBody className="space-y-4">
              {/* O que está na TV agora: grande, para conferir de relance. */}
              <div aria-live="polite" className="rounded-lg border border-line bg-surface-2 px-4 py-4 text-center">
                <div className="text-sm font-medium text-ink-2">Agora na TV</div>
                {atual ? (
                  <>
                    <div className="mt-1 text-5xl font-bold tracking-tight text-ink tabular-nums sm:text-6xl">{atual.senha}</div>
                    <div className="mt-1 text-lg font-semibold text-ink">{atual.local}</div>
                  </>
                ) : (
                  <div className="mt-2 text-lg font-semibold text-ink">Nenhuma senha chamada hoje</div>
                )}
              </div>

              {/* O botão do dia inteiro: grande no celular e no computador (o Button da casa é compacto no computador). */}
              <button type="button" onClick={proxima} disabled={!!ocupado}
                className="flex h-16 w-full items-center justify-center rounded-lg border border-transparent bg-accent px-4 text-lg font-semibold text-accent-fg shadow-xs transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:pointer-events-none disabled:opacity-60">
                {ocupado === 'proxima' ? 'Chamando…' : 'Chamar a próxima · ' + textoSenha(letra, proximo)}
              </button>
              <p className="-mt-2 text-center text-sm text-ink-2">
                Vai aparecer como <b className="text-ink">{nomeDoLocal(tipo, local.numero)}</b>.
              </p>

              <div className="grid grid-cols-1 gap-2 min-[400px]:grid-cols-2">
                <Button icon={RotateCcw} onClick={rechamar} disabled={!!ocupado || !atual}>{ocupado === 'rechamar' ? 'Chamando…' : 'Chamar de novo'}</Button>
                <Button icon={Hash} onClick={() => setAbrirNumero((a) => !a)} aria-expanded={abrirNumero}>Chamar um número</Button>
              </div>

              {abrirNumero && (
                <form onSubmit={chamarNumero} className="flex items-end gap-2 rounded-lg border border-line p-3">
                  <Field label={'Qual número' + (letra ? ' (letra ' + letra + ')' : '')} className="flex-1" hint="A sequência da próxima não muda.">
                    <Input type="number" inputMode="numeric" min={1} max={999} value={numero} autoFocus
                      onChange={(e) => setNumero(e.target.value)} placeholder="Ex.: 42" />
                  </Field>
                  <Button type="submit" disabled={!numero || !!ocupado} className="mb-[1.375rem]">{ocupado === 'numero' ? 'Chamando…' : 'Chamar'}</Button>
                </form>
              )}
            </PanelBody>
          </Panel>

          <Panel>
            <PanelHeader title="Onde você atende" description="Fica guardado neste aparelho: cada recepção escolhe o seu." />
            <PanelBody className="space-y-4">
              <div role="radiogroup" aria-label="Onde você atende" className="grid grid-cols-3 gap-2">
                {TIPOS.map(([id, nome]) => (
                  <button key={id} type="button" role="radio" aria-checked={tipo === id} onClick={() => setTipo(id)}
                    className={cn('flex min-h-11 items-center justify-center gap-1 rounded-md border px-2 text-sm font-medium transition',
                      tipo === id ? 'border-ink bg-surface-2 font-semibold text-ink' : 'border-line text-ink-2 hover:border-line-strong hover:text-ink')}>
                    {tipo === id && <Check size={14} aria-hidden="true" />}{nome}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap items-end gap-4">
                <div>
                  <span id="senha-num-local" className="mb-1.5 block text-xs font-medium text-ink-2">Número {tipo === 'triagem' ? '(opcional)' : ''}</span>
                  <div className="flex items-center gap-1">
                    <IconButton icon={Minus} label="Diminuir o número" onClick={() => setNumLocal(Math.max(tipo === 'triagem' ? 0 : 1, (Number(numLocal) || 0) - 1))} className="border border-line" />
                    <Input aria-labelledby="senha-num-local" type="number" inputMode="numeric" min={0} max={99} value={local.numero || (tipo === 'triagem' ? '' : 1)}
                      onChange={(e) => setNumLocal(Math.max(0, Math.min(99, Number(e.target.value) || 0)))} className="w-16 text-center max-sm:h-11" />
                    <IconButton icon={Plus} label="Aumentar o número" onClick={() => setNumLocal(Math.min(99, (Number(numLocal) || 0) + 1))} className="border border-line" />
                  </div>
                </div>
                <Field label="Letra da senha" className="w-36">
                  <Select value={letra} onChange={(e) => setLetra(e.target.value)} className="max-sm:h-11">
                    {LETRAS.map((l) => <option key={l || 'nenhuma'} value={l}>{l ? 'Letra ' + l : 'Sem letra'}</option>)}
                  </Select>
                </Field>
                {(fila.grupos || []).length > 0 && (
                  <Field label="Quais TVs mostram" className="min-w-[10rem] flex-1">
                    <Select value={grupo} onChange={(e) => setGrupo(e.target.value)} className="max-sm:h-11">
                      <option value="">Todas as TVs</option>
                      {fila.grupos.map((g) => <option key={g} value={g}>Grupo {g}</option>)}
                    </Select>
                  </Field>
                )}
              </div>
            </PanelBody>
          </Panel>
        </div>

        <div className="space-y-4">
          <Panel>
            {/* Zerar fica longe do botão grande: é o que não se aperta sem querer. */}
            <PanelHeader title="Últimas chamadas"
              actions={<Button variant="danger" size="sm" icon={Eraser} onClick={zerar} disabled={!!ocupado}>Zerar o dia</Button>} />
            <PanelBody>
              {historico.length ? (
                <ul className="divide-y divide-line">
                  {historico.map((c, i) => (
                    <li key={c.id} className="flex items-baseline justify-between gap-3 py-2 text-sm">
                      <span className={cn('font-semibold tabular-nums text-ink', i === 0 && 'text-base')}>{c.senha}</span>
                      <span className="min-w-0 flex-1 truncate text-ink-2">{c.local}{c.rechamada ? ' · de novo' : ''}</span>
                      <span className="tabular-nums text-ink-3">{hora(c.em)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-ink-2">As chamadas de hoje aparecem aqui. A cada dia a senha volta a 001 sozinha.</p>
              )}
            </PanelBody>
          </Panel>

          <Panel>
            <PanelBody className="flex items-start gap-3">
              <Tv size={18} className="mt-0.5 shrink-0 text-ink-3" aria-hidden="true" />
              <div className="text-sm text-ink-2">
                {telas.total === 0 ? (
                  <>Nenhuma TV {grupo ? 'neste grupo' : 'na conta'} ainda. <button type="button" className="font-semibold text-ink underline" onClick={() => onIr && onIr('screens')}>Ligar uma TV</button></>
                ) : telas.ligadas === 0 ? (
                  <>Nenhuma das {telas.total} TVs está ligada agora. A chamada fica guardada e aparece quando a TV ligar.</>
                ) : (
                  <>{telas.ligadas === 1 ? 'Uma TV ligada mostra' : telas.ligadas + ' TVs ligadas mostram'} estas chamadas, na hora.</>
                )}
                <p className="mt-2 text-ink-3">Para tirar o som ou deixar a senha sempre à vista numa TV, abra a TV em Telas › Ajustes.</p>
              </div>
            </PanelBody>
          </Panel>
        </div>
      </div>
    </div>
  );
}
