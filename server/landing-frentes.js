/*
 * server/landing-frentes.js — a landing de cada frente: /empresas, /saude e
 * /comercio (docs/FRENTES.md), e a página principal (/).
 *
 * Uma página só (landing/index.html), quatro versões. O que muda está marcado
 * no HTML com comentários `<!--frente:nome-->…<!--/frente-->` e é trocado
 * aqui. O que vale só para a principal fica entre `<!--so-raiz-->` e
 * `<!--/so-raiz-->`; o que vale só para as frentes, entre `<!--so-frente-->` e
 * `<!--/so-frente-->`. Assim uma correção na landing vale para as quatro
 * páginas, e cada frente fala com o seu público.
 *
 * QA de lançamento, 03/11 (docs/qa/13-20-landing-juridico.md):
 *   - 93% do texto era igual nas quatro páginas, e Empresas e Saúde liam
 *     "loja". Agora "como funciona", exemplos, "o que vem junto", perguntas e
 *     o simulador falam a língua de cada frente (e o Google vê quatro páginas).
 *   - DECISÃO DO DONO: cada frente tem o seu preço, e as frentes NÃO aparecem
 *     lado a lado. A principal não mostra tabela (leva cada um ao preço do seu
 *     negócio); cada frente mostra só o dela, já no herói, e busca o catálogo
 *     dela em /api/planos?frente=<id> (landing/landing.js).
 *   - Todo "Testar grátis" abre o CADASTRO já na frente
 *     (/app/?frente=saude&cadastro=1), inclusive "Começar o teste" e "Assinar".
 *
 * O texto não promete nada que o produto não faça: cada recurso citado existe
 * (o arquivo onde mora está no comentário ao lado, e test/landing.test.js
 * confere os principais).
 */
'use strict';

const Perfil = require('../js/perfil.js');
const legal = require('./legal.js');

const SITE = 'https://app.multitelas.net.br';

/*
 * O preço de cada frente, por TV, para quem abre a página SEM JavaScript (e
 * para o Google). Quem cobra é server/plans.js; com JavaScript, landing.js
 * troca estes números pelos de /api/planos?frente=<id>. Decisão do dono em
 * 03/11: Comércio R$ 79, Saúde R$ 139, Empresas R$ 159. O anual por faixa
 * guarda a proporção das faixas de antes (R$ 149 → 120 / 108 / 96).
 */
const PRECO_MENSAL_CENTS = { comercio: 7900, saude: 13900, empresas: 15900 };
const PROPORCAO_ANUAL = [120 / 149, 108 / 149, 96 / 149];
const FAIXAS = [{ de: 1, ate: 3 }, { de: 4, ate: 10 }, { de: 11, ate: 25 }];
function precosDe(slug) {
  const mensal = PRECO_MENSAL_CENTS[slug];
  if (!mensal) return null;
  return { mensal, anual: PROPORCAO_ANUAL.map((r) => Math.round((mensal * r) / 100) * 100) };
}
const reais = (cents) => 'R$ ' + (cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: cents % 100 ? 2 : 0, maximumFractionDigits: 2 });

/* ---------------- Pedaços de HTML (as mesmas classes de landing/index.html) ---------------- */

const ramos = (lista) => lista.map((r) => '\n        <span class="rounded-full border border-mt-linha bg-white px-3 py-1">' + r + '</span>').join('') + '\n      ';
const passos = (lista) => lista.map((p, i) => `
      <li class="surge rounded-2xl border border-mt-linha bg-white p-6 shadow-quente">
        <span class="titulo grid h-10 w-10 place-items-center rounded-full bg-mt-lima text-lg font-bold">${i + 1}</span>
        <h3 class="mt-4 text-lg font-semibold">${p[0]}</h3>
        <p class="mt-2 text-sm leading-relaxed text-mt-cinza">${p[1]}</p>
      </li>`).join('') + '\n    ';
const itens = (lista) => lista.map((c) => '\n      <div class="surge rounded-2xl border border-mt-linha bg-white p-5"><h3 class="font-semibold">' + c[0] + '</h3><p class="mt-1.5 text-sm text-mt-cinza">' + c[1] + '</p></div>').join('') + '\n    ';
const perguntas = (lista) => lista.map((q) => `
      <details class="rounded-xl border border-mt-linha bg-white p-5"><summary class="flex items-center justify-between gap-4 font-semibold">${q[0]}<span class="seta text-mt-violeta transition">+</span></summary>
        <p class="mt-3 text-sm leading-relaxed text-mt-cinza">${q[1]}</p></details>`).join('') + '\n    ';
const signage = (s) => `
  <h2 class="surge text-[clamp(1.8rem,4vw,2.6rem)] font-bold tracking-tight">${s.titulo}</h2>
  <p class="surge mt-3 max-w-2xl text-mt-cinza">${s.texto}</p>
  <div class="mt-10 grid gap-5 md:grid-cols-3">${s.cartoes.map((c) => `
    <div class="surge rounded-2xl border border-mt-linha bg-white p-6 shadow-quente">
      <h3 class="text-lg font-semibold">${c[0]}</h3>
      <p class="mt-2 text-sm leading-relaxed text-mt-cinza">${c[1]}</p>
    </div>`).join('')}
  </div>${s.nota ? '\n  <p class="surge mt-6 max-w-3xl text-sm text-mt-cinza">' + s.nota + '</p>' : ''}
`;
/*
 * Os exemplos: cada aba carrega o título, o texto e a descrição da imagem
 * (landing.js lê da aba). A imagem é uma peça de verdade do motor
 * (pecas-ouro/, desenhada na bancada), com marca fictícia.
 */
const abas = (lista) => lista.map((e, i) => '\n    <button class="aba rounded-full border border-mt-linha bg-white px-4 py-2 text-sm font-semibold" role="tab" aria-selected="' + (i === 0) + '" data-ramo="' + e.ramo + '" data-titulo="' + escAttr(e.titulo) + '" data-texto="' + escAttr(e.texto) + '" data-alt="' + escAttr(e.alt) + '">' + e.aba + '</button>').join('') + '\n  ';
const imagemDoExemplo = (e) => '\n        <img id="exemplo-img" src="vendor/galeria/' + e.ramo + '.webp" width="1200" height="675" loading="lazy" alt="' + escAttr(e.alt) + '" />\n      ';
const pilha = (lista) => lista.map((r) => '\n      <div class="tv"><img src="vendor/galeria/' + r + '.webp" width="1200" height="675" loading="lazy" alt="" /></div>').join('') + '\n    ';

/* ---------------- O texto de cada frente ---------------- */

const TEXTOS = {
  empresas: {
    titulo: 'TV de comunicação interna com IA | MultiTelas Empresas',
    descricao: 'TV corporativa para comunicação interna: avisos, RH, aniversariantes, segurança e metas nas TVs da equipe, com a marca da empresa. Teste 14 dias grátis.',
    kicker: 'MultiTelas Empresas · comunicação interna',
    h1: 'A comunicação interna <span class="grifo">na parede</span>, sem depender do e-mail.',
    // "podem vir do seu sistema": a conexão de indicadores (server/kpis.js) precisa de alguém de TI uma vez.
    texto: '\n        Você fala o que quer mostrar, tipo “o refeitório fecha mais cedo na sexta”. A IA monta a peça com a marca\n        da empresa e as TVs do refeitório, da fábrica e da recepção mudam na hora. Os aniversariantes entram sozinhos, e os\n        indicadores podem vir do seu sistema.\n      ',
    chips: ['Indústria', 'Escritório', 'Logística', 'Centro de distribuição', 'Call center', 'Construção'],
    heroi: { src: 'vendor/galeria/empresa.webp', alt: 'TV corporativa de uma empresa mostrando um comunicado do RH sobre vacinação' },
    legenda: 'Peça de exemplo feita pelo MultiTelas para uma empresa fictícia.',
    telasKicker: 'Uma unidade ou várias',
    telasTexto: 'Refeitório, portaria, produção e escritório: cada TV com o seu conteúdo, ou todas com o mesmo aviso. Publique do celular e veja de onde estiver o que está passando em cada uma.',
    pilha: ['empresa', 'empresa-aniversario', 'empresa-boas-vindas'],
    como: [
      ['Ligue as TVs', 'Na TV do refeitório ou da portaria, abra o MultiTelas pelo navegador, por um box Android ou por um computador. Aponte o celular para o QR e a TV entra na conta da empresa, com o nome que você der.'],
      // server/calendario.js: cola a agenda, a IA monta os avisos de cada data.
      ['Escreva o recado', '“Vacinação na sexta, no refeitório.” A IA monta o comunicado com as cores e a letra da empresa. Cole a agenda do mês e ela prepara os avisos de cada data.'],
      // server/aviso-rapido.js: o aviso tem "até quando vale" e as TVs.
      ['Publique onde precisa', 'Escolha as TVs e até quando o aviso vale. Ele entra na hora e sai sozinho quando vence.'],
    ],
    comoIntro: 'Três passos. O primeiro, uma vez por TV; o resto, do celular, sempre que tiver recado.',
    exemplosIntro: 'Peças de exemplo feitas pelo motor do MultiTelas para uma empresa fictícia. A empresa é inventada; as peças, não.',
    exemplos: [
      { ramo: 'empresa', aba: 'Comunicado', titulo: 'Comunicado do RH', texto: 'O recado para toda a equipe, na TV do refeitório: o que é, quando e onde.', alt: 'Comunicado interno de uma empresa sobre a vacinação contra a gripe' },
      { ramo: 'empresa-aniversario', aba: 'Aniversariante', titulo: 'Aniversariante', texto: 'Entra sozinho na semana do aniversário, com o setor e o tempo de casa.', alt: 'Peça de aniversariante do dia, com o nome, o setor e o tempo de casa' },
      { ramo: 'empresa-boas-vindas', aba: 'Boas-vindas', titulo: 'Boas-vindas', texto: 'Quem chegou ao time, o cargo e um assunto para puxar conversa.', alt: 'Peça de boas-vindas a um funcionário novo, com o cargo' },
    ],
    signage: {
      titulo: 'Comunicação interna <span class="grifo">que a equipe vê</span>',
      texto: 'Nem todo mundo lê e-mail ou grupo de mensagem. A TV no refeitório, na portaria e na produção fala com quem está no chão de fábrica, no turno da noite e no balcão.',
      cartoes: [
        ['Recados do RH e da diretoria', 'Comunicados, vagas internas, boas-vindas a quem chegou, agradecimentos e os valores da empresa.'],
        // js/quiz.js: a pergunta da IA entra como não conferida; a TV só mostra a conferida.
        ['Segurança do trabalho', 'Lembretes de EPI e de prevenção, e o quiz da SIPAT: cada pergunta só vai para a TV depois de uma pessoa conferir a resposta.'],
        // server/kpis.js: o sistema manda (push) ou o painel busca (pull).
        ['Metas e indicadores', 'Números da produção ou de vendas ao vivo na TV, enviados pelo seu sistema (um ERP como o Protheus, por exemplo) ou buscados pelo painel. Alguém de TI liga uma vez.'],
      ],
    },
    junto: [
      ['Funciona sem internet', 'A TV guarda o que recebeu e segue mostrando se a rede da empresa cair.'],
      ['Horário do expediente', 'Fora do expediente, a TV pode ficar preta ou mostrar só o relógio. Se uma TV cair no horário, você recebe um e-mail.'],
      ['Ver a tela agora', 'Do celular, veja o que está passando em cada TV, sem ir até o refeitório.'],
      ['Aniversariantes', 'Suba a lista uma vez; a TV mostra quem faz aniversário na semana.'],
      // server/foto-qr.js
      ['Foto da equipe pelo QR', 'A pessoa manda a própria foto pelo celular, com um código no e-mail, e o RH aprova antes de ir para a TV.'],
      ['Mural de fotos por QR', 'Na festa ou na SIPAT, a equipe manda fotos pelo celular; você tira qualquer uma da tela com um toque.'],
      ['Calendário da empresa', 'Cole a agenda do mês; a IA monta os avisos de cada data, com a antecedência certa.'],
      ['TV deitada ou em pé', 'O comunicado se ajusta à TV do corredor, em pé, ou à do refeitório, deitada.'],
      ['Relatório de exibição', 'Quantas vezes cada comunicado passou, e em quais TVs: para provar que o aviso foi dado.'],
    ],
    faq: [
      ['Serve para fábrica e turno da noite?', 'Serve. Cada TV pode ter a sua programação e o seu horário, e ela continua mostrando o que recebeu mesmo se a rede da fábrica cair.'],
      ['Os indicadores atualizam sozinhos?', 'Atualizam, depois de ligados: o seu sistema envia os números para o MultiTelas, ou o painel busca num endereço que você indicar. Alguém de TI configura uma vez.'],
      ['E os dados dos funcionários?', 'A empresa decide o que mostrar e responde por esses dados; nós guardamos e exibimos por ordem dela. A foto enviada pelo QR só vai para a TV depois de o RH aprovar, e sai sozinha se ninguém decidir em 30 dias. Veja a <a href="/privacidade" class="text-mt-violeta underline">política de privacidade</a>.'],
    ],
    lugar: 'na sua empresa',
    fale: 'Várias unidades, contrato anual, proposta para o setor de compras ou ajuda para instalar: chama que a gente responde.',
  },
  saude: {
    titulo: 'TV para sala de espera de clínica | MultiTelas Saúde',
    descricao: 'TV para sala de espera de clínicas e consultórios: orientação, prevenção, serviços e convênios na recepção, com a sua marca. Teste 14 dias grátis.',
    kicker: 'MultiTelas Saúde · sala de espera',
    h1: 'A sala de espera <span class="grifo">orientando</span> enquanto o paciente aguarda.',
    /*
     * Sem "sem promessa": a IA é ORIENTADA a evitar promessa de cura
     * (js/perfil.js, paraIA), mas o QA de 03/11 viu uma passar. O que é
     * verdade é que a clínica vê a peça antes de publicar.
     */
    texto: '\n        Você fala o que quer mostrar, tipo “a vacina da gripe chegou”. A IA monta a peça com a sua marca, em tom\n        acolhedor, e você confere antes de a TV da recepção mudar. Na TV ou no box que você já tem.\n      ',
    chips: ['Clínica', 'Consultório', 'Odontologia', 'Laboratório', 'Farmácia', 'Fisioterapia'],
    // QA de 03/11: o exemplo de antes era "pacote em parcelas" (preço em publicidade de saúde é área sensível).
    heroi: { src: 'vendor/galeria/saude-gripe.webp', alt: 'TV da sala de espera de uma clínica com um aviso para quem está com sintomas de gripe' },
    legenda: 'Peça de exemplo feita pelo MultiTelas para uma clínica fictícia.',
    telasKicker: 'Uma recepção ou várias unidades',
    telasTexto: 'Recepção, sala de espera e corredor: cada TV com o seu conteúdo, ou todas com o mesmo aviso. Publique do celular, entre um atendimento e outro.',
    pilha: ['saude-prevencao', 'saude-aviso', 'saude-gripe'],
    como: [
      ['Ligue a TV da recepção', 'Use a Smart TV da sala de espera (pelo navegador), um box Android ou um computador. Aponte o celular para o QR que aparece e a TV passa a ser da clínica.'],
      ['Diga o que o paciente precisa saber', 'Vacina que chegou, campanha do mês, especialidades, convênios aceitos. A IA escreve em tom acolhedor, com as cores da clínica.'],
      ['Confira e publique', 'Você vê a peça antes de ela ir para a TV. Escolha os horários e veja de onde estiver o que está passando.'],
    ],
    comoIntro: 'Três passos, e dá para fazer entre um paciente e outro.',
    exemplosIntro: 'Peças de exemplo feitas pelo motor do MultiTelas para uma clínica fictícia. A clínica é inventada; as peças, não.',
    exemplos: [
      { ramo: 'saude-gripe', aba: 'Orientação', titulo: 'Orientação na recepção', texto: 'O que o paciente precisa fazer, em letra grande, para ler de longe.', alt: 'Aviso na TV da clínica: com sintomas de gripe, pegue uma máscara na recepção' },
      { ramo: 'saude-prevencao', aba: 'Prevenção', titulo: 'Campanha do mês', texto: 'A campanha de prevenção do mês, com o exame e o convite para agendar.', alt: 'Peça de campanha de prevenção, Outubro Rosa, com a mamografia' },
      { ramo: 'saude-aviso', aba: 'Feriado', titulo: 'Feriado e horário', texto: 'O dia sem atendimento, o que continua funcionando e quando a clínica volta.', alt: 'Aviso de feriado da clínica, com a data e a volta do atendimento' },
    ],
    signage: {
      titulo: 'A sala de espera <span class="grifo">informando</span> o paciente',
      texto: 'Quem espera olha para a TV. Em vez de canal aberto, ela mostra o que ajuda o paciente: orientação, prevenção, os serviços da clínica e os avisos da recepção.',
      cartoes: [
        ['Orientação e prevenção', 'Campanhas do mês, vacinação, cuidados do dia a dia e o quiz da prevenção: cada pergunta só vai para a TV depois de uma pessoa conferir a resposta.'],
        ['Serviços e convênios', 'Especialidades, exames, convênios aceitos e o horário de atendimento, com a marca da clínica.'],
        ['Avisos da recepção', 'Feriado, mudança de horário, a rede de Wi-Fi para o paciente e o QR para avaliar a clínica.'],
      ],
      nota: 'Publicidade de saúde tem regras próprias (dos conselhos profissionais e da Anvisa). A IA é orientada a evitar promessa de resultado, mas quem confere e responde pelo que vai para a TV é a clínica.',
    },
    junto: [
      ['Funciona sem internet', 'A TV guarda o que recebeu e segue mostrando se a internet da clínica cair.'],
      ['Horário de atendimento', 'Depois do último paciente, a TV pode ficar preta ou mostrar só o relógio. E, se ela cair durante o atendimento, chega um e-mail.'],
      ['Ver a tela agora', 'Do celular, veja o que está passando em cada TV, sem sair do consultório.'],
      ['Tom acolhedor', 'A IA da versão Saúde escreve para o paciente: linguagem simples, sem desconto agressivo nem promessa de cura. Você confere antes de publicar.'],
      ['Datas de saúde do ano', 'Cole as campanhas do ano, como Outubro Rosa e Novembro Azul, e a IA monta os avisos de cada data.'],
      ['A mesma peça nas redes', 'Vira post e story prontos para o Instagram da clínica. Você baixa ou compartilha pelo celular.'],
      ['Aniversariantes', 'Suba a lista da equipe uma vez; a TV mostra quem faz aniversário na semana.'],
      ['TV deitada ou em pé', 'A peça se ajusta à TV da recepção, deitada, ou à do corredor, em pé.'],
      ['Relatório de exibição', 'Quantas vezes cada campanha passou na sala de espera, e por quanto tempo.'],
    ],
    faq: [
      ['A IA pode errar numa informação de saúde?', 'Pode, como qualquer texto automático. Por isso você vê a peça antes de publicar, e o quiz só vai para a TV depois de uma pessoa conferir a resposta. Quem responde pelo que aparece na recepção é a clínica.'],
      ['Serve para consultório pequeno, com uma TV só?', 'Serve. O preço é por TV, e com uma TV e um celular já funciona. Use a Smart TV ou o box que você já tem.'],
      // docs/ads/README.md: a rede de anúncios é proposta, nada implementado.
      ['Aparecem anúncios de outras empresas na minha TV?', 'Não. Hoje a TV da clínica mostra só o que a clínica publicar.'],
    ],
    lugar: 'na sua clínica',
    fale: 'Várias unidades, contrato anual ou ajuda para instalar a TV da recepção: chama que a gente responde.',
  },
  comercio: {
    titulo: 'TV para loja e restaurante com IA | MultiTelas Comércio',
    descricao: 'TV para loja, restaurante e serviço: ofertas, cardápio e novidades na vitrine. A IA cria a peça com a sua marca e a TV muda na hora. Teste grátis.',
    kicker: 'MultiTelas Comércio · loja, restaurante e serviço',
    h1: 'A vitrine que <span class="grifo">vende sozinha</span>: oferta, cardápio e novidade na TV.',
    // QA de 03/11: o produto NÃO posta nas redes; ele deixa o post pronto (web/src/components/content/RedesSociais.jsx).
    texto: '\n        Você fala o que quer mostrar, tipo “pão de queijo em dobro à tarde” ou “o prato do dia é feijoada”. A IA\n        monta a peça com a sua marca, deixa o post pronto para as redes, e a TV da loja muda na hora.\n      ',
    chips: ['Padaria', 'Restaurante', 'Ótica', 'Academia', 'Salão', 'Lanchonete'],
    heroi: null, // a TV da padaria e as trocas da página principal
    legenda: 'Peças de exemplo feitas pelo MultiTelas para lojas fictícias.',
    telasKicker: 'Uma loja ou uma rede',
    telasTexto: 'Vitrine, balcão e caixa: cada TV com o seu conteúdo, ou todas as lojas com a mesma oferta. Publique do celular e veja de onde estiver o que está passando em cada uma.',
    pilha: ['salao', 'lanchonete', 'otica'],
    como: [
      ['Ligue a TV', 'A TV da vitrine ou do balcão abre o MultiTelas pelo navegador, por um box Android ou por um computador. Aponte o celular para o QR e pronto, ela é da loja.'],
      ['Diga o que vender', '“Pão de queijo em dobro à tarde.” A IA monta a peça com o preço, as cores e as letras da sua marca. Ou suba a foto do produto, do celular.'],
      ['Publique e mude quando quiser', 'A TV muda na hora. Acabou o produto? Troque o preço ou a foto e publique de novo. E programe o café da manhã de manhã e o almoço ao meio-dia.'],
    ],
    comoIntro: 'Três passos, e a oferta nova entra antes de o cliente chegar ao balcão.',
    exemplosIntro: 'Peças de exemplo, feitas pelo motor do MultiTelas com a marca de cada loja. As lojas são fictícias; as peças, não.',
    exemplos: [
      { ramo: 'padaria', aba: 'Padaria', titulo: 'Prato do dia', texto: 'A foto do prato, o preço e o horário. Amanhã é outro prato: muda uma linha e publica.', alt: 'Prato do dia de uma padaria, com foto e preço' },
      { ramo: 'otica', aba: 'Ótica', titulo: 'Vitrine da semana', texto: 'Três modelos com preço, na cor da ótica. Troca o produto ou o preço, a TV acompanha.', alt: 'Vitrine da semana de uma ótica, com três modelos e preços' },
      { ramo: 'salao', aba: 'Salão de beleza', titulo: 'Promoção do dia da semana', texto: 'Coloração com desconto toda terça, nas cores do salão — com o convite para agendar.', alt: 'Promoção de coloração de um salão de beleza' },
      { ramo: 'lanchonete', aba: 'Lanchonete', titulo: 'Lançamento', texto: 'Novidade no cardápio com selo de "novidade" e a data de estreia.', alt: 'Lançamento de hambúrguer de uma lanchonete' },
    ],
    signage: {
      titulo: 'Oferta, cardápio e <span class="grifo">novidade</span> na TV',
      texto: 'Cartaz de papel desbota e ninguém troca. Na TV, a oferta muda em um minuto, pelo celular, e a peça sai com a cara da sua marca.',
      cartoes: [
        ['Ofertas com preço', 'Promoção do dia, combo, produto da semana e as formas de pagamento, com o preço em destaque.'],
        ['Cardápio digital', 'Cardápio por categorias, prato do dia com foto e bebidas. Mudou o preço, a TV acompanha.'],
        ['Redes e avaliação', 'A mesma peça vira post e story para o Instagram, e um QR na TV leva o cliente a avaliar a loja ou a chamar no WhatsApp.'],
      ],
    },
    junto: [
      ['Funciona sem internet', 'A TV guarda o que recebeu e segue mostrando se a internet da loja cair.'],
      ['Horário da loja', 'Fora do expediente, a TV pode ficar preta ou mostrar só o relógio. Você escolhe.'],
      ['Ver a tela agora', 'Do celular, veja o que está passando em cada TV, sem ir até a loja.'],
      ['Foto e vídeo do celular', 'Mande da galeria para a TV; a foto entra inteira, sem cortar. No Android, com o painel instalado, dá para compartilhar direto da galeria.'],
      ['A mesma peça nas redes', 'Vira post e story prontos para o Instagram, com o texto e as hashtags do seu bairro. Você baixa ou compartilha pelo celular.'],
      // js/seasons.js
      ['Datas do comércio', 'Dia das Mães, Black Friday e Natal entram com peças e enfeites da época.'],
      ['Mural de fotos por QR', 'Clientes mandam fotos pelo celular; você tira da tela qualquer uma com um toque.'],
      ['TV deitada ou em pé', 'A oferta se ajusta à TV da vitrine, em pé, ou à do balcão, deitada.'],
      ['Relatório de exibição', 'Quantas vezes cada oferta passou, em cada loja: para saber o que esteve na vitrine.'],
    ],
    faq: [
      ['Dá para mudar o preço todo dia?', 'Dá. Mude o preço ou a foto pelo celular e publique: a TV muda na hora. Você também pode programar a oferta por horário.'],
      ['Posta sozinho no Instagram?', 'Não posta sozinho: a peça vira post e story prontos, com o texto e as hashtags, e você publica pelo celular, com um toque em compartilhar.'],
      ['Tenho mais de uma loja. Cada uma com a sua oferta?', 'Cada TV pode ter o seu conteúdo. Dê nomes e grupos às TVs (por exemplo, “Loja Centro”) e publique para um grupo ou para todas.'],
    ],
    lugar: 'na sua loja',
    fale: 'Dúvida, várias lojas, contrato anual ou ajuda para instalar: chama que a gente responde.',
  },
};

const SLUGS = Object.keys(TEXTOS);

function escAttr(s) { return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'); }

// Todas as ocorrências do marcador (o preço aparece no herói e na tabela).
function trocarMarcado(html, nome, conteudo) {
  if (conteudo == null) return html;
  const re = new RegExp('<!--frente:' + nome + '-->[\\s\\S]*?<!--/frente-->', 'g');
  return html.replace(re, () => '<!--frente:' + nome + '-->' + conteudo + '<!--/frente-->');
}
const cortar = (html, bloco) => html.replace(new RegExp('\\s*<!--' + bloco + '-->[\\s\\S]*?<!--/' + bloco + '-->', 'g'), '');
const desmarcar = (html, bloco) => html.replace(new RegExp('<!--/?' + bloco + '-->', 'g'), '');

/* O rodapé com quem vende (Decreto 7.962/2013, art. 2º): o que estiver configurado. */
function comFornecedor(html, env) {
  return trocarMarcado(html, 'fornecedor', legal.rodape(env));
}

/* A página principal: sem a tabela de preço de uma frente (decisão do dono, 03/11). */
function raiz(html, env) {
  let s = cortar(String(html), 'so-frente');
  s = desmarcar(s, 'so-raiz');
  return comFornecedor(s, env);
}

/* Os dados estruturados da frente: o endereço e o preço dela, não os da principal. */
function jsonLd(slug, t, p) {
  const url = SITE + '/' + slug;
  const f = Perfil.doSlug(slug);
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'Organization', name: 'MultiTelas', url: SITE + '/', logo: SITE + '/icons/icone-512.png' },
      {
        '@type': 'SoftwareApplication',
        name: f.marca,
        applicationCategory: 'BusinessApplication',
        applicationSubCategory: 'Digital signage',
        operatingSystem: 'Web, Smart TV, Android TV',
        description: t.descricao,
        url,
        inLanguage: 'pt-BR',
        offers: {
          '@type': 'Offer',
          price: (p.mensal / 100).toFixed(2),
          priceCurrency: 'BRL',
          url: url + '#precos',
          description: 'Plano mensal, por TV, sem fidelidade. Teste grátis de 14 dias.',
        },
      },
    ],
  }, null, 2);
}

/* A conta de 3 TVs para quem abre sem JavaScript (landing.js monta o simulador por cima). */
function contaDe3(p) {
  return '\n      <p class="text-sm text-mt-cinza">Com 3 TVs: ' + reais(p.mensal * 3) + ' por mês no mensal, ou ' + reais(p.anual[0] * 3) + ' por mês no anual.</p>\n    ';
}
function faixasHtml(p) {
  return FAIXAS.map((f, i) => '\n        <li>✓ ' + (f.de === 1 ? 'até ' + f.ate + ' TVs' : 'da ' + f.de + 'ª à ' + f.ate + 'ª') + ': ' + reais(p.anual[i]) + ' cada</li>').join('')
    + '\n        <li>✓ 26 TVs ou mais: a combinar</li>\n      ';
}

/* O HTML da landing de uma frente, ou null se o endereço não for de frente. */
function montar(html, slug, env) {
  const t = TEXTOS[slug];
  const frente = Perfil.doSlug(slug);
  const p = precosDe(slug);
  if (!t || !frente || !p) return null;
  let s = cortar(String(html), 'so-raiz');
  s = desmarcar(s, 'so-frente');
  const url = SITE + '/' + slug;
  s = s.replace(/<title>[^<]*<\/title>/, '<title>' + t.titulo + '</title>');
  s = s.replace(/(<meta name="description" content=")[^"]*(")/, '$1' + escAttr(t.descricao) + '$2');
  s = s.replace(/(<meta property="og:title" content=")[^"]*(")/, '$1' + escAttr(t.titulo) + '$2');
  s = s.replace(/(<meta property="og:description" content=")[^"]*(")/, '$1' + escAttr(t.descricao) + '$2');
  s = s.replace(/(<meta property="og:url" content=")[^"]*(")/, '$1' + url + '$2');
  s = s.replace(/(<link rel="canonical" href=")[^"]*(")/, '$1' + url + '$2');
  s = s.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/, () => '<script type="application/ld+json">\n' + jsonLd(slug, t, p) + '\n</script>');

  // O herói.
  s = trocarMarcado(s, 'kicker', t.kicker);
  s = trocarMarcado(s, 'titulo', t.h1);
  s = trocarMarcado(s, 'texto', t.texto);
  s = trocarMarcado(s, 'chips', ramos(t.chips));
  s = trocarMarcado(s, 'legenda', t.legenda);
  // O preço na primeira tela do celular (QA de 03/11), só o desta frente.
  s = trocarMarcado(s, 'preco-heroi', '\n      <p class="mt-5 text-base text-mt-tinta" data-preco-heroi><b><span data-preco-mensal>' + reais(p.mensal)
    + '</span> por TV, por mês</b><span class="text-mt-cinza">, sem fidelidade (menos no anual)</span> · <a href="#precos" class="font-semibold text-mt-violeta underline">ver preços</a></p>\n      ');
  /*
   * A TV do topo mostra uma peça da frente, sem as trocas de peça de loja
   * (ótica, lanchonete), que só fazem sentido no Comércio.
   */
  if (t.heroi) {
    s = s.replace(/<img src="vendor\/galeria\/heroi\.webp"[^>]*>/, (tag) => tag.replace('vendor/galeria/heroi.webp', t.heroi.src).replace(/alt="[^"]*"/, 'alt="' + escAttr(t.heroi.alt) + '"'));
    s = s.replace(/\s*<img class="troca"[^>]*>/g, '');
    s = s.replace(/(<meta property="og:image" content=")[^"]*(")/, '$1' + SITE + '/' + t.heroi.src + '$2');
  }

  // As seções do meio, na língua da frente.
  s = trocarMarcado(s, 'telas-kicker', t.telasKicker);
  s = trocarMarcado(s, 'telas-texto', t.telasTexto);
  s = trocarMarcado(s, 'pilha', pilha(t.pilha));
  s = trocarMarcado(s, 'como-intro', t.comoIntro);
  s = trocarMarcado(s, 'como', passos(t.como));
  s = trocarMarcado(s, 'exemplos-intro', t.exemplosIntro);
  s = trocarMarcado(s, 'abas', abas(t.exemplos));
  s = trocarMarcado(s, 'exemplo-img', imagemDoExemplo(t.exemplos[0]));
  s = trocarMarcado(s, 'exemplo-titulo', t.exemplos[0].titulo);
  s = trocarMarcado(s, 'exemplo-texto', t.exemplos[0].texto);
  s = trocarMarcado(s, 'signage', signage(t.signage));
  s = trocarMarcado(s, 'junto', itens(t.junto));
  s = trocarMarcado(s, 'faq', perguntas(t.faq));
  s = trocarMarcado(s, 'fale', t.fale);

  // O preço desta frente (sem JavaScript; com ele, landing.js confirma pelo catálogo da frente).
  s = trocarMarcado(s, 'preco-mensal', reais(p.mensal));
  s = trocarMarcado(s, 'preco-anual', reais(p.anual[p.anual.length - 1]));
  s = trocarMarcado(s, 'faixas', faixasHtml(p));
  s = trocarMarcado(s, 'lugar', t.lugar);
  s = trocarMarcado(s, 'calc', contaDe3(p));

  // A frente no <body> (o catálogo que landing.js pede e a mensagem do WhatsApp) e o cartão aceso.
  // O <body> de verdade, com a classe: um "<body>" escrito num comentário não conta.
  s = s.replace(/<body class="([^"]*)">/, (m, cls) => '<body class="' + cls + '" data-frente="' + slug + '" data-frente-id="' + frente.id + '" data-marca="' + escAttr(frente.marca) + '">');
  s = s.replace('data-frente-card="' + slug + '"', 'data-frente-card="' + slug + '" aria-current="page"');
  // Testar grátis, Começar o teste e Assinar: o cadastro já abre na frente.
  s = s.replace(/href="\/app\/\?cadastro=1/g, 'href="/app/?frente=' + slug + '&amp;cadastro=1');
  return comFornecedor(s, env);
}

module.exports = { montar, raiz, SLUGS, TEXTOS, PRECO_MENSAL_CENTS, precosDe, reais };
