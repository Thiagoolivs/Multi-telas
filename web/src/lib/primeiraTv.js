/*
 * "SUA PRIMEIRA TV EM 5 MINUTOS" no painel: o que cada passo mostra e o que
 * ele grava. Os passos, os negócios e o progresso guardado são de
 * js/primeira-tv.js (o mesmo arquivo que o servidor usa para conferir); a
 * página é pages/PrimeiraTvPage.jsx.
 *
 * Nada aqui inventa caminho para a TV: a tela vai pelo envio em lote de
 * sempre (lib/rodar.js, gravarEmLote) e o horário pela rota de sempre
 * (devices.expediente). Com a aprovação ligada, o envio do membro vira
 * pedido — e o fim do fluxo diz isso, em vez de "está na TV".
 */
import '../../../js/primeira-tv.js';
import '../../../js/templates.js';
import { montarTela, emPe, perfilDaTela, aplicarTelaPronta, tvEmPe } from './telasProntas.js';
import { MARCAS_DO_RAMO } from './modelosOuro.js';
import { gravarEmLote } from './rodar.js';
import { devices } from '../api.js';

const P = globalThis.MTPrimeiraTv;

export const PASSOS = P.PASSOS;
export const NOME_DO_PASSO = P.NOME_DO_PASSO;
export const NEGOCIOS = P.NEGOCIOS;
export const HORARIOS = P.HORARIOS;
export const HORARIO_PADRAO = P.HORARIO_PADRAO;
export const negocioPeloId = P.negocio;
export const normalizar = P.normalizar;
export const inicial = P.inicial;
export const passoParaRetomar = P.passoParaRetomar;
export const concluir = P.concluir;
export const pular = P.pular;
export const voltar = P.voltar;
export const terminar = P.terminar;
export const deNovo = P.deNovo;

// "Passo 3 de 7".
export const numeroDoPasso = (p) => PASSOS.indexOf(p) + 1;

/*
 * Os negócios na ordem da frente da conta: os dela primeiro (a padaria não
 * procura a padaria no meio da clínica e da indústria), "Outro" no fim.
 */
export function negociosDaFrente(frente) {
  const outro = NEGOCIOS.filter((n) => n.id === 'outro');
  const resto = NEGOCIOS.filter((n) => n.id !== 'outro');
  return resto.filter((n) => n.frente === frente).concat(resto.filter((n) => n.frente !== frente), outro);
}

// A frente que vale para as peças: a do negócio, ou a da conta ("Outro").
export const frenteDe = (neg, frenteDaConta) => (neg && neg.frente) || frenteDaConta || 'comercio';

/* ======================= O passo 4: as telas ======================= */

// A forma da TV: em pé, quadrada ou deitada (sem saber, deitada — o caso comum).
export function formaDaTv(d) {
  const i = d && d.info;
  if (!(i && i.w > 0 && i.h > 0)) return 'deitada';
  if (Math.abs(i.w - i.h) / Math.max(i.w, i.h) < 0.1) return 'quadrada';
  return tvEmPe(d) ? 'empe' : 'deitada';
}
const formaDoLayout = (id) => (emPe(id) ? 'empe' : /^square/.test(id || '') ? 'quadrada' : 'deitada');

/*
 * Quão perto do negócio está uma tela aprovada (menor = mais perto):
 *   0  a tela do próprio negócio
 *   1  do mesmo ramo (a da clínica serve ao dentista)
 *   2  a que serve a qualquer negócio da frente (lote 1, sem negócio)
 *   3  de outro negócio da mesma frente (a "aprovada mais próxima")
 *   9  de outra frente: nunca (a metalúrgica não estreia com óculos de sol, QA de 03/11)
 */
export function proximidade(t, neg, frente) {
  if (perfilDaTela(t) !== frente) return 9;
  if (neg && neg.id !== 'outro') {
    if (t.negocio === neg.id || (!t.negocio && t.marca === neg.id)) return 0;
    if (neg.ramo && ((t.ramos || []).includes(neg.ramo) || (!t.negocio && (MARCAS_DO_RAMO[neg.ramo] || []).includes(t.marca)))) return 1;
  }
  if (t.perfil && !t.negocio) return 2;
  return 3;
}

/*
 * A MOLDURA da tela montada: quando o negócio ainda não tem três telas
 * aprovadas, a tela é montada SÓ COM PEÇAS APROVADAS (pecas-ouro), na
 * estrutura de sempre — o cabeçalho com a marca, o destaque do negócio, a
 * lateral com o horário (que o passo 6 preenche) e o rodapé.
 */
const MOLDURA = {
  comercio: { cabecalho: 'cabecalho-status', lateral: 'servico-horario', rodape: 'rodape-pagamento' },
  saude: { cabecalho: 'cabecalho-status', lateral: 'servico-horario', rodape: 'rodape-relogio' },
  empresa: { cabecalho: 'cabecalho-minimo', lateral: 'servico-horario', rodape: 'rodape-relogio' },
};
const MODO = { cabecalho: 'marca', principal: 'escuro', lateral: 'claro', rodape: 'marca' };
const TITULO_DO_HORARIO = {
  comercio: { kicker: 'Funcionamento', titulo: 'Nosso horário', titulo2: '', nota: '' },
  saude: { kicker: 'Atendimento', titulo: 'Horário', titulo2: 'de atendimento', nota: '' },
  empresa: { kicker: 'Expediente', titulo: 'Horário', titulo2: 'de funcionamento', nota: '' },
};
// O nome da tela montada, em palavras de quem tem loja (o nome da peça fala de "lateral" e "destaque").
const NOME_DA_MONTADA = {
  'cardapio-dia-foto': 'Prato do dia, com foto', 'lateral-chamada': 'Chamada do dia', 'cardapio-combo': 'Combo com preço',
  'institucional-lancamento': 'Novidade da casa', 'cardapio-categorias': 'Cardápio', 'oferta-foto': 'Oferta com foto',
  'institucional-foto': 'Foto da casa', 'oferta-lista': 'Três ofertas', 'oferta-selo': 'Oferta com desconto',
  'servico-agenda': 'Serviço da semana', 'servico-passos': 'Como funciona', 'servico-alerta': 'Aviso',
  'servico-comunicado': 'Comunicado', 'institucional-valores': 'O que a gente promete', 'gente-comunicado': 'Comunicado da equipe',
  'gente-boas-vindas': 'Boas-vindas',
};
// O destaque de cada negócio, o com foto primeiro. Dentista: nada de preço nem desconto (o conselho veta, js/perfil.js).
const DESTAQUES = {
  padaria: ['cardapio-dia-foto', 'lateral-chamada', 'cardapio-combo'],
  restaurante: ['cardapio-dia-foto', 'institucional-lancamento', 'cardapio-categorias'],
  lanchonete: ['cardapio-dia-foto', 'institucional-lancamento', 'cardapio-categorias'],
  otica: ['oferta-foto', 'institucional-foto', 'oferta-lista'],
  salao: ['oferta-selo', 'servico-agenda', 'servico-passos'],
  farmacia: ['institucional-foto', 'servico-alerta', 'servico-comunicado'],
  clinica: ['institucional-foto', 'servico-alerta', 'servico-comunicado'],
  dentista: ['institucional-foto', 'servico-passos', 'institucional-valores'],
  escritorio: ['institucional-foto', 'gente-comunicado', 'gente-boas-vindas'],
  industria: ['institucional-foto', 'servico-alerta', 'gente-comunicado'],
};
const DESTAQUES_DA_FRENTE = {
  comercio: ['oferta-foto', 'oferta-selo', 'institucional-foto'],
  saude: ['institucional-foto', 'servico-alerta', 'servico-comunicado'],
  empresa: ['institucional-foto', 'gente-comunicado', 'servico-alerta'],
};

const serveAFrente = (m, frente) => !Array.isArray(m.frentes) || !m.frentes.length || m.frentes.includes(frente);
// O texto de exemplo na língua da frente, quando a peça é de outra marca de exemplo (a da padaria, na clínica).
const textosDaFrente = (m, neg, frente) => ((neg && (neg.marcas || []).includes(m.marca)) ? {} : ((m.textos && m.textos[frente]) || {}));

// Os destaques do negócio que existem (aprovados) e servem à frente; sem a lista, os do negócio pelas marcas de exemplo.
export function destaquesDoNegocio(modelos, neg, frente) {
  const lista = (neg && DESTAQUES[neg.id]) || DESTAQUES_DA_FRENTE[frente] || DESTAQUES_DA_FRENTE.comercio;
  const ok = (m) => m && (m.papeis || []).includes('destaque') && serveAFrente(m, frente);
  const escolhidos = lista.map((id) => modelos.get(id)).filter(ok);
  const marcas = (neg && neg.marcas) || [];
  for (const m of modelos.values()) {
    if (escolhidos.length >= 3) break;
    if (ok(m) && marcas.includes(m.marca) && !escolhidos.includes(m)) escolhidos.push(m);
  }
  return escolhidos.slice(0, 3);
}

/*
 * A tela montada com o destaque `heroi`, no formato da tela do manifesto
 * (é ela que montarTela entende). O id diz como refazer: "montada:<negócio>:<peça>".
 */
export function telaMontada(heroi, modelos, neg, frente, forma) {
  const moldura = MOLDURA[frente] || MOLDURA.comercio;
  const entrada = (id, extra) => {
    const m = modelos.get(id);
    return m ? { id, campos: { ...textosDaFrente(m, neg, frente), ...(extra || {}) } } : null;
  };
  // A lateral fala do horário DA CONTA ("Pão quente o dia todo" e o refeitório da fábrica eram do exemplo).
  const horario = entrada(moldura.lateral, TITULO_DO_HORARIO[frente] || TITULO_DO_HORARIO.comercio);
  // "Vale-refeição" é de quem vende comida.
  const comida = neg && ['padaria', 'restaurante', 'lanchonete'].includes(neg.id);
  const rodape = entrada(moldura.rodape, moldura.rodape === 'rodape-pagamento' && !comida ? { pagamento4: '' } : {});
  // O "Desde 1987" é da padaria de exemplo: sai (o mesmo de DO_EXEMPLO, em lib/telasProntas.js).
  const cabecalho = entrada(moldura.cabecalho, moldura.cabecalho === 'cabecalho-status' ? { desde: '' } : {});
  const zonas = {
    cabecalho: { modo: MODO.cabecalho, pecas: [cabecalho].filter(Boolean) },
    principal: { modo: MODO.principal, pecas: [entrada(heroi.id)].filter(Boolean) },
    lateral: { modo: MODO.lateral, pecas: [horario].filter(Boolean) },
    rodape: { modo: MODO.rodape, pecas: [rodape].filter(Boolean) },
  };
  return {
    id: 'montada:' + ((neg && neg.id) || 'outro') + ':' + heroi.id, nome: NOME_DA_MONTADA[heroi.id] || heroi.nome, montada: true,
    layout: forma === 'empe' ? 'portrait-stack' : 'corporate', zonas, mensagens: [],
  };
}

// Só a primeira peça de cada parte: no passo a passo, a TV mostra o que a pessoa viu e preencheu.
function soAPrimeira(montada) {
  const grupos = {};
  for (const [g, pecas] of Object.entries(montada.grupos || {})) grupos[g] = (pecas || []).slice(0, 1);
  return { ...montada, grupos };
}

/*
 * As três telas do passo 4, das mais perto do negócio para as menos: as
 * aprovadas do negócio (e do ramo, e as de qualquer negócio da frente);
 * faltando, as montadas com as peças aprovadas do negócio; e só então a
 * aprovada de outro negócio da frente. De outra frente, nunca.
 *
 * `dados`: carregarTelasProntas(); `marca`: marcaDaConta(brand.get()).
 */
export function opcoesDeTela(dados, neg, frente, marca, forma = 'deitada', limite = 3) {
  if (!dados) return [];
  const cabe = (t) => formaDoLayout(t.layout) === forma;
  const perto = (dados.telas || []).filter(cabe).map((t) => ({ t, p: proximidade(t, neg, frente) })).filter((x) => x.p < 9)
    .sort((a, b) => a.p - b.p);
  const montar = (t) => soAPrimeira(montarTela(t, dados.modelos, marca || {}, dados.exemplos));
  const opcao = (t, aprovada) => ({ id: t.id, nome: nomeParaOCliente(t.nome, dados.exemplos), descricao: t.descricao || '', aprovada, montada: montar(t) });
  const saida = perto.filter((x) => x.p <= 2).map((x) => opcao(x.t, true));
  for (const m of destaquesDoNegocio(dados.modelos, neg, frente)) {
    if (saida.length >= limite) break;
    saida.push(opcao(telaMontada(m, dados.modelos, neg, frente, forma), false));
  }
  for (const x of perto.filter((y) => y.p === 3)) {
    if (saida.length >= limite) break;
    saida.push(opcao(x.t, true));
  }
  return saida.slice(0, limite);
}

// "Ótica Central · Semana do Sol" → "Semana do Sol": o nome da empresa de exemplo não chega ao cliente.
export function nomeParaOCliente(nome, exemplos) {
  const partes = String(nome || '').split(' · ');
  const deExemplo = (exemplos && exemplos.nomes) || [];
  return partes.length > 1 && deExemplo.some((n) => n.toLowerCase() === partes[0].trim().toLowerCase()) ? partes.slice(1).join(' · ') : String(nome || '');
}

// A tela guardada no progresso, de volta (o passo 5 depois de recarregar a página).
export function opcaoPeloId(id, dados, neg, frente, marca, forma = 'deitada') {
  if (!id || !dados) return null;
  const achada = opcoesDeTela(dados, neg, frente, marca, forma, 99).find((o) => o.id === id);
  if (achada) return achada;
  const m = /^montada:[a-z]+:([\w-]+)$/.exec(id);
  if (m && dados.modelos.get(m[1])) {
    const t = telaMontada(dados.modelos.get(m[1]), dados.modelos, neg, frente, forma);
    return { id: t.id, nome: t.nome, descricao: '', aprovada: false, montada: soAPrimeira(montarTela(t, dados.modelos, marca || {}, dados.exemplos)) };
  }
  const t = (dados.telas || []).find((x) => x.id === id);
  return t ? { id: t.id, nome: nomeParaOCliente(t.nome, dados.exemplos), descricao: t.descricao || '', aprovada: true, montada: soAPrimeira(montarTela(t, dados.modelos, marca || {}, dados.exemplos)) } : null;
}

/* ======================= O passo 5: fotos e textos ======================= */

// Os campos que a peça declara (a mesma porta da TV: js/peca-html.js).
function camposDaPeca(item) {
  const H = globalThis.MTPecaHtml;
  return item && H ? H.higienizar({ html: item.html, css: item.css }).campos : [];
}

const TITULOS = ['titulo', 'assunto', 'nome', 'cargo', 'frase', 'linha1'];
const PRECOS = ['preco', 'desconto', 'parcela'];
const TERCEIROS = ['quando', 'kicker', 'chamada', 'apoio', 'texto'];
const DA_LOJA = new Set(['oferta', 'cardápio']);
const ROTULO = {
  preco: 'Preço', desconto: 'Desconto (em %)', parcela: 'Valor de cada parcela',
  quando: 'Quando', kicker: 'Frase pequena, em cima', chamada: 'Chamada', apoio: 'Uma frase a mais', texto: 'O recado',
};

/*
 * O que o passo 5 pergunta, da peça do destaque: cada foto (um quadro
 * grande, "Ponha a foto do seu pão") e até três textos — o título, o preço
 * e o "quando" (ou a frase pequena). O resto da peça fica como o desenho.
 */
export function camposQueImportam(montada, neg, modelos) {
  const heroi = montada && montada.grupos && (montada.grupos.principal || [])[0];
  if (!heroi) return { fotos: [], textos: [] };
  const defs = camposDaPeca(heroi);
  const nomes = new Set(defs.map((d) => d.nome));
  const base = modelos && heroi.origem && modelos.get(heroi.origem.base);
  const familia = (base && base.familia) || '';
  const exemplo = (nome) => {
    const v = heroi.campos && heroi.campos[nome];
    if (v != null && v !== '') return String(v);
    const d = defs.find((x) => x.nome === nome);
    return (d && d.exemplo) || '';
  };
  const fotos = defs.filter((d) => d.tipo === 'img' && d.nome !== 'logo').map((d) => ({
    nome: d.nome,
    rotulo: 'Ponha a foto ' + (familia === 'gente' ? 'da pessoa' : (neg && neg.foto) || 'do seu produto'),
  }));
  const textos = [];
  const titulo = TITULOS.find((n) => nomes.has(n));
  if (titulo) textos.push({ nome: titulo, rotulo: DA_LOJA.has(familia) ? 'Nome do produto' : familia === 'serviço' && neg && neg.frente === 'comercio' ? 'Nome do serviço' : 'Título' });
  const preco = PRECOS.find((n) => nomes.has(n));
  if (preco) textos.push({ nome: preco, rotulo: ROTULO[preco], preco: preco === 'preco' || preco === 'parcela' });
  const terceiro = TERCEIROS.find((n) => nomes.has(n) && n !== titulo);
  if (terceiro && textos.length < 3) textos.push({ nome: terceiro, rotulo: ROTULO[terceiro] });
  for (const t of textos) {
    const ex = exemplo(t.nome) + (t.preco && nomes.has('centavos') ? exemplo('centavos') : '');
    t.exemplo = ex.replace(/\s+/g, ' ').trim();
    // O desenho foi feito para aquele tamanho: uma vez e meia dá folga (o mesmo de EditarPeca).
    t.limite = Math.max(12, Math.ceil(t.exemplo.length * 1.5));
  }
  return { fotos, textos };
}

// "R$ 12,90" → ["12", ",90"]; "12" → ["12", ",00"].
export function dividirPreco(v) {
  const s = String(v || '').replace(/r\$\s*/i, '').replace(/\s+/g, '').trim();
  const m = /^(\d{1,6}(?:\.\d{3})*)(?:[,.](\d{1,2}))?$/.exec(s);
  if (!m) return [s, ''];
  return [m[1], ',' + ((m[2] || '00') + '0').slice(0, 2)];
}

// O que sobra do exemplo quando a pessoa troca o título: descreve o produto de exemplo e sai da TV.
const SOBRAS = ['titulo2', 'acompanha', 'apoio', 'kicker', 'nota', 'oferta', 'parcelas', 'meta', 'legenda', 'quando', 'sub', 'linha2', 'linha3', 'assinatura', 'texto'];
// Sem o preço dela, o preço do exemplo também sai (um "R$ 32,90" que ninguém disse é pior que nenhum).
const DO_PRECO = ['preco', 'centavos', 'preco-rotulo', 'parcelas', 'oferta', 'desconto', 'off', 'parcela', 'vezes', 'de', 'total'];

/*
 * A tela com o que a pessoa pôs no passo 5 (`valores`: { campo: texto ou
 * endereço da foto }). Só a peça do destaque muda. Não modifica a recebida.
 */
export function aplicarCampos(montada, valores) {
  const m = JSON.parse(JSON.stringify(montada));
  const heroi = m.grupos && (m.grupos.principal || [])[0];
  if (!heroi) return m;
  const v = valores || {};
  const nomes = new Set(camposDaPeca(heroi).map((d) => d.nome));
  const campos = { ...(heroi.campos || {}) };
  const ocultos = new Set(heroi.ocultos || []);
  const esconder = (k) => { if (nomes.has(k) && !(k in v)) { campos[k] = ''; ocultos.add(k); } };
  for (const [k, val] of Object.entries(v)) {
    if (!val || !nomes.has(k)) continue;
    if ((k === 'preco' || k === 'parcela') && nomes.has('centavos')) {
      const [inteiro, centavos] = dividirPreco(val);
      campos[k] = inteiro;
      campos.centavos = centavos;
      ocultos.delete('centavos');
    } else campos[k] = String(val);
    ocultos.delete(k);
  }
  const trocouTitulo = TITULOS.some((k) => v[k]);
  if (trocouTitulo) {
    SOBRAS.forEach(esconder);
    if (!PRECOS.some((k) => v[k])) DO_PRECO.forEach(esconder);
  }
  heroi.campos = campos;
  if (ocultos.size) heroi.ocultos = [...ocultos];
  else delete heroi.ocultos;
  return m;
}

/* ======================= O passo 6: o horário ======================= */

const DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const SEMANA = [1, 2, 3, 4, 5, 6, 0]; // a semana começa na segunda
const maiuscula = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// [1,2,3,4,5] → "segunda a sexta"; [0,6] → "sábado e domingo"; todos → "todos os dias".
export function diasPorExtenso(dias) {
  const d = SEMANA.filter((x) => (dias || []).includes(x));
  if (d.length === 7) return 'todos os dias';
  if (!d.length) return '';
  const pos = d.map((x) => SEMANA.indexOf(x));
  const seguidos = pos.every((p, i) => i === 0 || p === pos[i - 1] + 1);
  if (seguidos && d.length >= 3) return DIAS[d[0]] + ' a ' + DIAS[d[d.length - 1]];
  const nomes = d.map((x) => DIAS[x]);
  return nomes.length === 1 ? nomes[0] : nomes.slice(0, -1).join(', ') + ' e ' + nomes[nomes.length - 1];
}
// "08:00" → "8h"; "07:30" → "7h30".
export const horaCurta = (h) => { const [hh, mm] = String(h || '00:00').split(':'); return Number(hh) + 'h' + (mm && mm !== '00' ? mm : ''); };
const dia24 = (h) => h.inicio === h.fim;

// "Aberto de segunda a sexta, das 8h às 18h" (a clínica atende, a empresa tem expediente).
export function fraseDoHorario(horario, frente) {
  const h = P.normalizarHorario(horario) || HORARIO_PADRAO;
  const prefixo = frente === 'saude' ? 'Atendimento' : frente === 'empresa' ? 'Expediente' : 'Aberto';
  const dias = diasPorExtenso(h.dias);
  const quando = dias === 'todos os dias' ? 'todos os dias' : 'de ' + dias;
  return prefixo + ' ' + quando + ', ' + (dia24(h) ? '24 horas' : 'das ' + horaCurta(h.inicio) + ' às ' + horaCurta(h.fim));
}

// O horário no formato da TV (server/vigia.js, normalizarExpediente): o aviso de queda fica ligado.
export function expedienteDoHorario(horario) {
  const h = P.normalizarHorario(horario) || HORARIO_PADRAO;
  return { alerta: true, dias: h.dias.slice(), inicio: h.inicio, fim: h.fim, foraDoHorario: h.foraDoHorario };
}

/*
 * A tela com o horário: a peça de horário (a lateral) diz os dias e as
 * horas, o cabeçalho diz "Aberto agora · Hoje até as 18h", e o letreiro do
 * rodapé diz o horário por extenso. As frases de exemplo do letreiro
 * ("10x sem juros", "@oticacentral") saem: a TV só diz o que a pessoa disse.
 */
export function aplicarHorario(montada, horario, frente) {
  const m = JSON.parse(JSON.stringify(montada));
  const h = P.normalizarHorario(horario) || HORARIO_PADRAO;
  const fechados = [0, 1, 2, 3, 4, 5, 6].filter((d) => !h.dias.includes(d));
  const horas = dia24(h) ? '24 horas' : horaCurta(h.inicio) + ' – ' + horaCurta(h.fim);
  for (const pecas of Object.values(m.grupos || {})) {
    for (const p of pecas || []) {
      const base = p.origem && p.origem.base;
      const ocultos = new Set(p.ocultos || []);
      if (base === 'servico-horario') {
        // A nota do exemplo ("Fornadas às 6h, 11h e 16h") falava do horário de exemplo: sai.
        p.campos.nota = '';
        const linhas = [[maiuscula(diasPorExtenso(h.dias)), horas]].concat(fechados.length ? [[maiuscula(diasPorExtenso(fechados)), 'Fechado']] : []);
        for (let i = 1; i <= 3; i++) {
          const [dia, hora] = linhas[i - 1] || ['', ''];
          p.campos['dia' + i] = dia;
          p.campos['hora' + i] = hora;
          if (dia) { ocultos.delete('dia' + i); ocultos.delete('hora' + i); } else { ocultos.add('dia' + i); ocultos.add('hora' + i); }
        }
      }
      if (base === 'cabecalho-status') {
        // Fora do horário a TV mostra o relógio (ou apaga): "Aberto agora" só é verdade se ela não ficar ligada.
        p.campos.status = h.foraDoHorario === 'ligada' && !dia24(h) ? 'Horário' : frente === 'saude' ? 'Atendendo agora' : 'Aberto agora';
        p.campos.horario = dia24(h) ? '24 horas' : 'Hoje até as ' + horaCurta(h.fim);
      }
      for (const k of Object.keys(p.campos || {})) if (p.campos[k] === '' && /^(titulo2|nota|kicker|desde|pagamento\d)$/.test(k)) ocultos.add(k);
      if (ocultos.size) p.ocultos = [...ocultos];
    }
  }
  m.mensagens = [fraseDoHorario(h, frente)];
  return m;
}

// A programação da TV com a tela (para a prévia "Como vai ficar"; o envio relê a da TV).
export function configDaTela(montada, nomeDaTv) {
  return aplicarTelaPronta({ settings: { nome: nomeDaTv || 'TV' }, zonas: {} }, montada);
}

/* ======================= O passo 7: pôr na TV ======================= */

/*
 * Põe a tela na TV pelos caminhos de sempre: primeiro o horário (a rota da
 * TV grava e avisa), depois a tela pelo envio em lote, com Desfazer. Com a
 * aprovação ligada, o envio do membro vira pedido: { pendente: true }.
 */
export async function porNaTv({ tv, montada, horario, frente }) {
  const final = aplicarHorario(montada, horario, frente);
  await devices.expediente(tv.id, expedienteDoHorario(horario));
  const r = await gravarEmLote([{ id: tv.id, name: tv.name }], (cfg) => aplicarTelaPronta(cfg, final), 'Tela pronta: ' + final.nome);
  return { pendente: !!r.pendente, mensagem: r.mensagem || '', lote: r.lote || null, montada: final };
}
