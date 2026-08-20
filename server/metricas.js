/*
 * server/metricas.js — as contas do painel da plataforma.
 *
 * Fica separado do banco porque é DECISÃO, não consulta: o que conta como uma
 * sessão, o que conta como uma conta ativa, o que é uma estimativa e o que é
 * um número exato. Misturar isso com SQL esconde a decisão dentro de um
 * `GROUP BY` e ninguém mais revê.
 */

/*
 * "Tempo de uso" — o que dá para saber, e o que não dá.
 *
 * Ninguém mede tempo de tela sem um batimento vindo do navegador, e um
 * batimento contínuo é rastreamento: fica sabendo que a pessoa deixou a aba
 * aberta durante o almoço. Não vale a pena.
 *
 * O que dá para saber com honestidade é o intervalo entre AÇÕES da mesma
 * pessoa. Ações separadas por menos de 30 minutos são a mesma sessão; a
 * duração da sessão é do primeiro ao último evento dela. Sessão de uma ação só
 * dura zero — e é isso mesmo: alguém que abriu, clicou uma vez e saiu não
 * passou tempo nenhum trabalhando.
 *
 * O número resultante SUBESTIMA, sempre: o tempo lendo a tela antes do
 * primeiro clique e depois do último não entra. Por isso a tela chama a coisa
 * pelo nome — "tempo estimado" — em vez de fingir precisão que não existe.
 */
const CORTE_DE_SESSAO_MS = 30 * 60 * 1000;

function sessoesDe(eventos, corteMs) {
  const corte = corteMs || CORTE_DE_SESSAO_MS;
  const porPessoa = new Map();
  for (const e of eventos || []) {
    if (!e || !e.userId) continue;
    if (!porPessoa.has(e.userId)) porPessoa.set(e.userId, []);
    porPessoa.get(e.userId).push(Number(e.em) || 0);
  }

  let sessoes = 0;
  let totalMs = 0;
  for (const marcas of porPessoa.values()) {
    marcas.sort((a, b) => a - b);
    let inicio = marcas[0];
    let ultimo = marcas[0];
    for (let i = 1; i < marcas.length; i++) {
      if (marcas[i] - ultimo > corte) {
        sessoes++; totalMs += ultimo - inicio;
        inicio = marcas[i];
      }
      ultimo = marcas[i];
    }
    sessoes++; totalMs += ultimo - inicio;
  }

  return {
    sessoes,
    totalMinutos: Math.round(totalMs / 60000),
    // A média por sessão é o número que diz se o produto está sendo usado ou
    // só visitado. Duas horas totais em cem sessões de um minuto é outra
    // coisa completamente diferente de duas horas em cinco sessões.
    mediaMinutos: sessoes ? Math.round(totalMs / 60000 / sessoes) : 0,
    pessoas: porPessoa.size,
  };
}

/*
 * As ações, em português, para a tela não mostrar "ia.composicao" a ninguém.
 *
 * O que não está aqui aparece com o próprio nome: é melhor mostrar um código
 * cru do que esconder uma função nova só porque ninguém traduziu.
 */
const NOME_DA_ACAO = {
  'peca.salvar': 'Salvar design',
  'peca.publicar': 'Publicar na tela',
  'peca.editor': 'Abrir o editor',
  'peca.modelo': 'Começar de um modelo',
  'ia.campanha': 'Campanha com IA',
  'ia.imagem': 'Gerar imagem com IA',
  'ia.composicao': 'IA dentro do editor',
  'ia.briefing': 'Conversa de briefing',
  'tela.parear': 'Parear uma tela',
  'tela.config': 'Configurar tela',
  'mural.foto': 'Foto no mural',
  'mural.criar': 'Criar mural',
  'marca.salvar': 'Salvar a marca',
  'marca.site': 'Ler o site da marca',
  'midia.upload': 'Enviar mídia',
  'equipe.convite': 'Convidar alguém',
  'reclamacao': 'Falar com o suporte',
};

function nomear(acao) {
  return NOME_DA_ACAO[acao] || acao;
}

/*
 * A lista de funções mais usadas, já com nome e participação.
 *
 * A participação (%) é o que transforma a lista em informação: "editor: 400"
 * não diz nada sozinho, "editor: 40% de tudo" diz onde o produto vive.
 */
function funcoesMaisUsadas(porAcao) {
  const lista = (porAcao || []).filter((x) => x && x.acao);
  const total = lista.reduce((s, x) => s + Number(x.n || 0), 0);
  return lista.map((x) => ({
    acao: x.acao,
    nome: nomear(x.acao),
    n: Number(x.n || 0),
    parte: total ? Math.round((Number(x.n || 0) / total) * 1000) / 10 : 0,
  }));
}

/*
 * Uma tela "funcionando" é uma tela que deu sinal nos últimos 10 minutos.
 *
 * O player bate ponto sozinho; sem esta janela, "quantas telas estão no ar"
 * viraria "quantas telas já foram pareadas alguma vez" — número que só cresce
 * e nunca conta a verdade sobre uma TV que foi desligada há seis meses.
 */
const JANELA_TELA_VIVA_MS = 10 * 60 * 1000;

module.exports = {
  sessoesDe, funcoesMaisUsadas, nomear, NOME_DA_ACAO,
  CORTE_DE_SESSAO_MS, JANELA_TELA_VIVA_MS,
};
