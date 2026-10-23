import React, { useState } from 'react';
import { Gauge, Plus, Trash2, RefreshCw, KeyRound, MonitorPlay, Check, Copy, AlertTriangle, Download, Upload } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader.jsx';
import { Panel, PanelHeader } from '../components/ui/Panel.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Dialog } from '../components/ui/Dialog.jsx';
import { Field, Input, Select } from '../components/ui/Field.jsx';
import { EmptyState } from '../components/ui/Feedback.jsx';
import { useAsync } from '../lib/useAsync.js';
import { aviso } from '../lib/avisos.js';
import { confirmar } from '../lib/confirmar.js';
import { kpis, devices } from '../api.js';
import { gravarEmLote, avisarComDesfazer, zonasPorPapel } from '../lib/rodar.js';
import { AtalhosDeGrupo } from '../components/tela/AtalhosDeGrupo.jsx';

/*
 * INDICADORES (EXECUTOR D36). Os números da empresa na TV — vendas do dia,
 * produção, meta do mês — sempre atualizados. O dono: "conexão configurável
 * via endpoint também, para APIs como as do TOTVS Protheus". Dois jeitos:
 *   - RECEBER (push): o ERP manda para nós com um token. Serve para o
 *     Protheus da rede interna: um agendamento lá dentro chama o endereço.
 *   - BUSCAR (pull): nós buscamos um endereço que responde JSON, com a
 *     autenticação guardada cifrada, a cada N minutos.
 * Cada indicador vira um cartão ao vivo na TV ("Pôr na TV"): o número, a
 * variação e a barra da meta.
 */
function formatar(v, u) {
  if (v == null || !isFinite(v)) return '—';
  const abs = Math.abs(v);
  const txt = abs >= 1e6 ? (v / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' mi' : v.toLocaleString('pt-BR', { maximumFractionDigits: abs < 100 ? 2 : 0 });
  const un = String(u || '').trim();
  if (!un) return txt;
  if (/^(R\$|US\$|\$|€)$/i.test(un)) return un + ' ' + txt;
  return un === '%' ? txt + '%' : txt + ' ' + un;
}
function haQuanto(t) {
  if (!t) return 'nunca';
  const min = Math.round((Date.now() - t) / 60000);
  if (min < 1) return 'agora';
  if (min < 60) return 'há ' + min + ' min';
  const h = Math.round(min / 60);
  return h < 24 ? 'há ' + h + ' h' : 'há ' + Math.round(h / 24) + ' dias';
}

function Copiar({ texto, rotulo }) {
  return (
    <Button size="sm" variant="ghost" icon={Copy} onClick={() => { navigator.clipboard.writeText(texto).then(() => aviso.ok('Copiado.'), () => {}); }}>{rotulo || 'Copiar'}</Button>
  );
}

function ExemploPush({ entrada, token }) {
  const corpo = '{"indicadores":[{"chave":"vendas-dia","nome":"Vendas do dia","valor":12300,"unidade":"R$","meta":20000}]}';
  const curl = 'curl -X POST ' + entrada + ' -H "Authorization: Bearer ' + (token || 'SEU_TOKEN') + '" -H "Content-Type: application/json" -d \'' + corpo + '\'';
  return (
    <div className="space-y-2 text-xs text-ink-2">
      <div>O sistema da empresa (o agendamento do Protheus, uma planilha com script, qualquer programa) chama este endereço com os números:</div>
      <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-md bg-surface-2 p-2 font-mono text-[11px] text-ink">{curl}</pre>
      <Copiar texto={curl} rotulo="Copiar o exemplo" />
      <div>Também vale um objeto simples: <code>{'{"Vendas do dia": 12300, "Pedidos": 42}'}</code>. Até 50 indicadores, no máximo 4 envios por minuto.</div>
    </div>
  );
}

function EditarConector({ c, segredosProntos, onFechar, onSalvo }) {
  const pull = c.modo === 'pull';
  const [f, setF] = useState({ nome: c.nome || '', url: c.url || '', authTipo: c.authTipo || 'nenhum', authNome: c.authNome || '', segredo: '', intervaloMin: c.intervaloMin || 15, mapa: Object.assign({ lista: '', chave: '', nome: '', valor: '', unidade: '', meta: '' }, c.mapa || {}) });
  const [salvando, setSalvando] = useState(false);
  const [teste, setTeste] = useState(null);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const setMapa = (k) => (e) => setF((x) => ({ ...x, mapa: { ...x.mapa, [k]: e.target.value } }));
  async function salvar(depois) {
    setSalvando(true);
    try {
      const corpo = { nome: f.nome };
      if (pull) Object.assign(corpo, { url: f.url, authTipo: f.authTipo, authNome: f.authNome, intervaloMin: Number(f.intervaloMin), mapa: f.mapa }, f.segredo ? { segredo: f.segredo } : {});
      await kpis.atualizar(c.id, corpo);
      if (depois) await depois();
      else { aviso.ok('Salvo.'); onSalvo(); }
    } catch (e) { aviso.erro('kpis', e.message || 'Não deu para salvar.'); }
    finally { setSalvando(false); }
  }
  const testar = () => salvar(async () => {
    try { const r = await kpis.testar(c.id); setTeste({ lista: r.indicadores }); }
    catch (e) { setTeste({ erro: e.message || 'Não deu certo.' }); }
  });
  return (
    <Dialog open onClose={onFechar} title={(pull ? 'Buscar de um endereço' : 'Receber do sistema da empresa') + ': ' + (c.nome || '')} className="max-w-2xl"
      footer={<>
        {pull && <Button variant="secondary" icon={RefreshCw} disabled={salvando || !f.url} onClick={testar}>Salvar e testar agora</Button>}
        <Button variant="primary" icon={Check} disabled={salvando} onClick={() => salvar()}>{salvando ? 'Salvando…' : 'Salvar'}</Button>
      </>}>
      <div className="space-y-3">
        <Field label="Nome"><Input value={f.nome} onChange={set('nome')} maxLength={60} placeholder="Ex.: Protheus — vendas" /></Field>
        {pull && (
          <>
            <Field label="Endereço (responde JSON)" hint="https://… — a API REST do Protheus ou de outro sistema, acessível da internet."><Input value={f.url} onChange={set('url')} maxLength={500} placeholder="https://erp.suaempresa.com.br/rest/indicadores" /></Field>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Autenticação">
                <Select value={f.authTipo} onChange={set('authTipo')}>
                  <option value="nenhum">Nenhuma</option>
                  <option value="bearer">Token (Bearer)</option>
                  <option value="basic">Usuário e senha (Basic)</option>
                  <option value="cabecalho">Cabeçalho próprio</option>
                </Select>
              </Field>
              {f.authTipo === 'cabecalho' && <Field label="Nome do cabeçalho"><Input value={f.authNome} onChange={set('authNome')} maxLength={40} placeholder="X-Api-Key" /></Field>}
              {f.authTipo !== 'nenhum' && (
                <Field label={f.authTipo === 'basic' ? 'usuario:senha' : 'Segredo'} hint={c.temSegredo ? 'Guardado cifrado. Escreva só para trocar.' : 'Fica guardado cifrado.'}>
                  <Input type="password" autoComplete="new-password" value={f.segredo} onChange={set('segredo')} placeholder={c.temSegredo ? '•••••••• (guardado)' : ''} disabled={!segredosProntos} />
                </Field>
              )}
            </div>
            {!segredosProntos && f.authTipo !== 'nenhum' && <p className="text-xs text-warn">O cofre de senhas não está ligado neste servidor: fale com o suporte para usar autenticação.</p>}
            <div>
              <div className="mb-1 text-xs font-semibold text-ink">Onde estão os números na resposta</div>
              <p className="mb-2 text-2xs text-ink-3">Deixe "lista" vazio se a resposta for a lista direto, ou um objeto simples ({'{"Vendas": 1200}'}). Use pontos para entrar: <code>dados.itens</code>.</p>
              <div className="grid gap-2 sm:grid-cols-3">
                {[['lista', 'Lista'], ['chave', 'Campo da chave'], ['nome', 'Campo do nome'], ['valor', 'Campo do valor'], ['unidade', 'Campo da unidade'], ['meta', 'Campo da meta']].map(([k, r]) => (
                  <Field key={k} label={r}><Input value={f.mapa[k]} onChange={setMapa(k)} maxLength={80} placeholder={k === 'lista' ? 'dados.itens' : k} /></Field>
                ))}
              </div>
            </div>
            <Field label="Buscar a cada (minutos)" className="max-w-[12rem]"><Input type="number" min={5} max={1440} value={f.intervaloMin} onChange={set('intervaloMin')} /></Field>
            {teste && (teste.erro
              ? <p className="flex items-start gap-1.5 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-ink"><AlertTriangle size={14} className="mt-0.5 shrink-0 text-danger" />{teste.erro}</p>
              : <div className="rounded-md border border-ok/40 bg-ok-soft px-3 py-2 text-xs text-ink">Veio {teste.lista.length === 1 ? '1 indicador' : teste.lista.length + ' indicadores'}: {teste.lista.slice(0, 6).map((i) => i.nome + ' = ' + formatar(i.valor, i.unidade)).join(' · ')}</div>)}
          </>
        )}
      </div>
    </Dialog>
  );
}

function PorNaTv({ indicador, onFechar }) {
  const { data } = useAsync(devices.list);
  const telas = (data && data.devices) || [];
  const [alvos, setAlvos] = useState(null);
  const marcados = alvos || telas.map((t) => t.id);
  const [enviando, setEnviando] = useState(false);
  async function enviar() {
    setEnviando(true);
    try {
      const escolhidas = telas.filter((t) => marcados.includes(t.id));
      const item = { type: 'kpi', indicador: indicador.chave, rotulo: indicador.nome, duracao: 12 };
      const r = await gravarEmLote(escolhidas, (cfg) => {
        const next = JSON.parse(JSON.stringify(cfg || {}));
        next.zonas = next.zonas || {};
        const z = zonasPorPapel(next).principal || 'principal';
        const zona = next.zonas[z] && Array.isArray(next.zonas[z].items) ? next.zonas[z] : { items: [] };
        next.zonas[z] = Object.assign({}, zona, { items: zona.items.filter((i) => !(i && i.type === 'kpi' && i.indicador === indicador.chave)).concat(item) });
        return next;
      }, 'Indicador: ' + indicador.nome);
      avisarComDesfazer(indicador.nome + ' na TV' + (escolhidas.length === 1 ? '.' : 's (' + escolhidas.length + ').'), r.lote);
      onFechar();
    } catch (e) { aviso.erro('kpis', e.message || 'Não deu para pôr na TV.'); }
    finally { setEnviando(false); }
  }
  return (
    <Dialog open onClose={onFechar} title={'Pôr na TV: ' + indicador.nome} className="max-w-md"
      description="Um cartão ao vivo entra na área principal: o número, a variação e a meta."
      footer={<Button variant="primary" icon={MonitorPlay} disabled={!marcados.length || enviando} onClick={enviar}>{enviando ? 'Enviando…' : marcados.length === 1 ? 'Pôr na TV' : 'Pôr em ' + marcados.length + ' TVs'}</Button>}>
      <AtalhosDeGrupo telas={telas} alvos={marcados} onEscolher={setAlvos} />
      <ul className="space-y-1">
        {telas.map((t) => (
          <li key={t.id}><label className="flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" checked={marcados.includes(t.id)} onChange={(e) => setAlvos(e.target.checked ? marcados.concat(t.id) : marcados.filter((x) => x !== t.id))} /> {t.name || 'TV'}
          </label></li>
        ))}
      </ul>
    </Dialog>
  );
}

export function IndicadoresPage() {
  const { data, reload } = useAsync(kpis.list);
  const [editando, setEditando] = useState(null);
  const [novoToken, setNovoToken] = useState(null);
  const [naTv, setNaTv] = useState(null);
  const conectores = (data && data.conectores) || [];
  const indicadores = (data && data.indicadores) || [];
  const nomeDo = (id) => (conectores.find((c) => c.id === id) || {}).nome || '';

  async function criar(modo) {
    try {
      const r = await kpis.criar({ modo, nome: modo === 'pull' ? 'Buscar do sistema' : 'Sistema da empresa' });
      reload();
      if (r.token) setNovoToken({ conector: r.conector, token: r.token });
      else setEditando(r.conector);
    } catch (e) { aviso.erro('kpis', e.message || 'Não deu para criar.'); }
  }
  async function trocarToken(c) {
    if (!(await confirmar({ titulo: 'Gerar um token novo?', texto: 'O token de agora para de funcionar: o sistema da empresa precisa do novo.', botao: 'Gerar' }))) return;
    try { const r = await kpis.token(c.id); setNovoToken({ conector: c, token: r.token }); }
    catch (e) { aviso.erro('kpis', e.message || 'Não deu certo.'); }
  }
  async function apagar(c) {
    if (!(await confirmar({ titulo: 'Apagar o conector ' + c.nome + '?', texto: 'Os indicadores dele saem também, e os cartões na TV ficam sem número.', botao: 'Apagar', perigo: true }))) return;
    await kpis.remover(c.id); reload();
  }

  return (
    <div>
      <PageHeader title="Indicadores" subtitle="Os números da empresa na TV, sempre atualizados — do Protheus ou de qualquer sistema."
        actions={<>
          <Button variant="secondary" icon={Upload} onClick={() => criar('push')}>Receber do sistema</Button>
          <Button variant="secondary" icon={Download} onClick={() => criar('pull')}>Buscar de um endereço</Button>
        </>} />

      <Panel className="mb-4">
        <PanelHeader title="Os números" description={indicadores.length ? 'O último valor de cada um. Na TV, o cartão mostra o número, a variação e a meta.' : undefined} />
        {indicadores.length === 0 ? (
          <EmptyState icon={Gauge} title="Nenhum número ainda" description="Crie um conector acima: o sistema da empresa manda os números, ou o MultiTelas busca num endereço." />
        ) : (
          <ul className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
            {indicadores.map((i) => {
              const pct = i.meta ? Math.round(i.valor / i.meta * 100) : null;
              return (
                <li key={i.id} className="flex flex-col rounded-lg border border-line p-3">
                  <div className="truncate text-xs text-ink-3">{i.nome} · {nomeDo(i.conectorId)}</div>
                  <div className="tnum mt-1 text-2xl font-bold text-ink">{formatar(i.valor, i.unidade)}</div>
                  {pct != null && (
                    <div className="mt-1.5">
                      <div className="h-1.5 overflow-hidden rounded-full bg-surface-2"><div className={'h-full rounded-full ' + (pct >= 100 ? 'bg-ok' : 'bg-accent')} style={{ width: Math.min(100, pct) + '%' }} /></div>
                      <div className="mt-1 text-2xs text-ink-2">{pct >= 100 ? 'Meta batida: ' : ''}{pct}% da meta de {formatar(i.meta, i.unidade)}</div>
                    </div>
                  )}
                  <div className="mt-2 flex items-center justify-between gap-2 text-2xs text-ink-3">
                    <span>Atualizado {haQuanto(i.atualizadoEm)}</span>
                    <Button size="sm" variant="ghost" icon={MonitorPlay} onClick={() => setNaTv(i)}>Pôr na TV</Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      <Panel>
        <PanelHeader title="Conectores" description="De onde os números vêm. Receber: o sistema da empresa manda (bom para o Protheus da rede interna). Buscar: o MultiTelas pega num endereço." />
        {conectores.length === 0 ? (
          <p className="p-4 text-sm text-ink-3">Nenhum conector. Use os botões acima.</p>
        ) : (
          <ul className="divide-y divide-line/60">
            {conectores.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium text-ink">{c.nome}</span>
                    <span className="rounded-full bg-surface-2 px-2 py-0.5 text-2xs text-ink-2">{c.modo === 'pull' ? 'Busca a cada ' + c.intervaloMin + ' min' : 'Recebe'}</span>
                  </div>
                  <div className={'truncate text-xs ' + (c.ultimoErro ? 'text-danger' : 'text-ink-3')}>
                    {c.ultimoErro ? 'Erro: ' + c.ultimoErro : 'Último número ' + haQuanto(c.ultimoOk)}{c.modo === 'pull' && c.url ? ' · ' + c.url : ''}
                  </div>
                </div>
                {c.modo === 'push'
                  ? <Button size="sm" variant="ghost" icon={KeyRound} onClick={() => trocarToken(c)}>Token novo</Button>
                  : <Button size="sm" variant="secondary" onClick={() => setEditando(c)}>Configurar</Button>}
                {c.modo === 'push' && <Button size="sm" variant="ghost" onClick={() => setEditando(c)}>Renomear</Button>}
                <Button size="sm" variant="ghost" icon={Trash2} onClick={() => apagar(c)}>Apagar</Button>
              </li>
            ))}
          </ul>
        )}
        {conectores.some((c) => c.modo === 'push') && data && (
          <div className="border-t border-line p-4"><ExemploPush entrada={data.entrada} /></div>
        )}
      </Panel>

      {editando && <EditarConector c={editando} segredosProntos={!!(data && data.segredosProntos)} onFechar={() => setEditando(null)} onSalvo={() => { setEditando(null); reload(); }} />}
      {naTv && <PorNaTv indicador={naTv} onFechar={() => setNaTv(null)} />}
      {novoToken && (
        <Dialog open onClose={() => { setNovoToken(null); reload(); }} title={'Token de ' + novoToken.conector.nome} className="max-w-xl"
          description="Copie agora: por segurança, ele não aparece de novo (dá para gerar outro)."
          footer={<Button variant="primary" onClick={() => { setNovoToken(null); reload(); }}>Pronto, copiei</Button>}>
          <div className="space-y-3">
            <div className="flex items-center gap-2 rounded-md border border-line bg-surface-2 p-2">
              <code className="min-w-0 flex-1 break-all text-xs text-ink">{novoToken.token}</code>
              <Copiar texto={novoToken.token} />
            </div>
            {data && <ExemploPush entrada={data.entrada} token={novoToken.token} />}
          </div>
        </Dialog>
      )}
    </div>
  );
}
