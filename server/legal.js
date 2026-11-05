/*
 * server/legal.js — Termos de Uso e Política de Privacidade.
 *
 * ATENÇÃO: os textos aqui são um RASCUNHO TÉCNICO. Eles descrevem com precisão
 * o que o sistema realmente faz — quais dados guarda, para onde manda, quanto
 * tempo retém — que é justamente a parte que um escritório de advocacia não tem
 * como saber sozinho. Mas rascunho não é peça jurídica: alguém com OAB precisa
 * revisar antes de vender.
 *
 * QA de lançamento, 03/11 (docs/qa/13-20-landing-juridico.md, G1 a G4 e M1 a
 * M8): a política negava os cookies do Google que a landing liga; faltavam a
 * identificação do fornecedor, o direito de arrependimento, a multa do anual e
 * vários suboperadores; e o aviso no topo dizia ao CLIENTE "não use como peça
 * contratual", o que esvazia o aceite que o cadastro registra.
 *
 * O AVISO DE REVISÃO, como ficou (decisão documentada no relatório do QA):
 *   - para o OPERADOR, o alerta completo mora em /sistema (server/diagnostico.js,
 *     "Termos e Privacidade"), enquanto LEGAL_REVISADO não for true;
 *   - para o CLIENTE, uma nota honesta e sem susto: o texto vale como está,
 *     está em revisão jurídica, e mudança relevante é avisada antes de valer.
 *     Não parece definitivo (diz que está em revisão) e não diz que não vale.
 *
 * QUEM VENDE (Decreto 7.962/2013, art. 2º; LGPD art. 41): razão social, CNPJ,
 * endereço e contatos vêm do ambiente (RAZAO_SOCIAL, CNPJ, ENDERECO,
 * SUPPORT_EMAIL, EMAIL_DPO, ENCARREGADO_NOME). Faltando, a página mostra só o
 * que existe — nunca um e-mail pessoal fixo no código — e /sistema avisa.
 *
 * VERSAO é a fonte única: o cadastro grava qual versão o cliente aceitou. Mudou
 * o texto de forma relevante, sobe a versão — assim dá para saber quem aceitou
 * o quê, que é o ponto inteiro de registrar aceite.
 */
const VERSAO = '2026-11-03';
const VERSAO_LEGIVEL = '3 de novembro de 2026';

let plans = null;
try { plans = require('./plans'); } catch (e) { plans = null; }
const DIAS_DE_TESTE = (plans && plans.DIAS_DE_TESTE) || 14;
const CRIACOES_DO_TESTE = (plans && plans.CRIACOES_DO_TESTE) || 20;
const ATRASO = (plans && plans.ATRASO) || { avisoDias: 3, seloDias: 10, suspensaoDias: 20 };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* Quem vende, do ambiente. Lido a cada página: trocar a variável não pede deploy de código. */
function fornecedor(env) {
  const e = env || process.env;
  const v = (k) => String(e[k] || '').trim();
  const email = (k) => (EMAIL.test(v(k)) ? v(k) : '');
  const contato = email('SUPPORT_EMAIL');
  return {
    marca: v('LEGAL_NOME') || 'MultiTelas',
    razaoSocial: v('RAZAO_SOCIAL'),
    cnpj: v('CNPJ'),
    endereco: v('ENDERECO'),
    contato,
    encarregado: v('ENCARREGADO_NOME'),
    emailDpo: email('EMAIL_DPO') || contato,
  };
}
// O que a lei pede e ainda não está configurado (o operador vê em /sistema).
const OBRIGATORIOS = [['RAZAO_SOCIAL', 'razão social'], ['CNPJ', 'CNPJ'], ['ENDERECO', 'endereço'], ['SUPPORT_EMAIL', 'e-mail de contato']];
function faltandoFornecedor(env) {
  const f = fornecedor(env);
  const tem = { RAZAO_SOCIAL: f.razaoSocial, CNPJ: f.cnpj, ENDERECO: f.endereco, SUPPORT_EMAIL: f.contato };
  return OBRIGATORIOS.filter(([k]) => !tem[k]).map(([k, nome]) => ({ variavel: k, nome }));
}
const revisado = (env) => (env || process.env).LEGAL_REVISADO === 'true';

// "Razão Social Ltda, CNPJ 00.000.000/0001-00, Rua X, 10 — São Paulo/SP": só o que existe.
function identificacao(f) {
  return [f.razaoSocial, f.cnpj && 'CNPJ ' + f.cnpj, f.endereco].filter(Boolean).map(esc).join(', ');
}
// Para escrever: o e-mail, ou o caminho no painel quando ainda não há e-mail.
function contatoHtml(email) {
  return email ? '<a href="mailto:' + esc(email) + '">' + esc(email) + '</a>' : 'a página <b>Suporte</b> do painel';
}

/* O rodapé da landing e das páginas legais: © + quem vende (só o que estiver configurado). */
function rodape(env) {
  const f = fornecedor(env);
  const id = identificacao(f);
  return '© 2026 ' + esc(f.marca) + (id ? ' · ' + id : '');
}

/*
 * Suboperadores: para quem os dados do cliente realmente vão, e para quê. A
 * LGPD exige transparência sobre compartilhamento, e o cliente merece saber
 * que a arte dele passa por um modelo de IA. `quando` diz se o serviço está
 * sempre ligado ou só em parte do produto.
 */
const SUBOPERADORES = [
  { nome: 'Railway', papel: 'hospedagem da aplicação e do banco de dados', local: 'Estados Unidos', quando: 'sempre' },
  { nome: 'Cloudflare R2 (armazenamento compatível com S3)', papel: 'guarda das imagens, vídeos e arquivos enviados', local: 'Estados Unidos', quando: 'sempre' },
  { nome: 'Google (Gemini API)', papel: 'geração de textos e imagens; leitura das imagens enviadas como referência ou acervo', local: 'Estados Unidos', quando: 'ao usar a IA' },
  { nome: 'Anthropic', papel: 'geração e revisão de textos pela IA', local: 'Estados Unidos', quando: 'quando este motor de IA está ligado' },
  { nome: 'Groq', papel: 'geração de textos pela IA', local: 'Estados Unidos', quando: 'quando este motor de IA está ligado' },
  { nome: 'Resend', papel: 'envio de e-mails (confirmação, senha, avisos)', local: 'Estados Unidos', quando: 'sempre' },
  { nome: 'Brevo', papel: 'envio de e-mails, como alternativa ao Resend', local: 'França (União Europeia)', quando: 'quando o Resend não está em uso' },
  { nome: 'Asaas', papel: 'cobrança por Pix, boleto e cartão (não recebemos o número do cartão)', local: 'Brasil', quando: 'nos planos pagos' },
  { nome: 'Google (login)', papel: 'entrar com a conta Google: nome, e-mail e identificador da conta', local: 'Estados Unidos', quando: 'se você entrar pelo Google' },
  { nome: 'Google Analytics e Google Ads', papel: 'medição de visitas e de anúncios na página do site, só com o seu aceite (veja "Cookies")', local: 'Estados Unidos', quando: 'só na página do site, nunca no painel nem na TV' },
  { nome: 'Open-Meteo', papel: 'previsão do tempo nas telas (recebe só a cidade, nenhum dado pessoal)', local: 'Alemanha', quando: 'se a TV mostra o tempo' },
  { nome: 'Pixabay', papel: 'banco de fotos (recebe só o termo de busca)', local: 'Alemanha', quando: 'ao buscar fotos' },
  { nome: 'Microsoft (visualizador do Office)', papel: 'mostrar apresentações PowerPoint na TV (recebe o endereço do arquivo)', local: 'Estados Unidos', quando: 'se você puser um PowerPoint na TV' },
  { nome: 'QR Server (goQR.me)', papel: 'desenhar o QR de algumas peças (recebe o link do QR)', local: 'Alemanha', quando: 'em peças com QR' },
  { nome: 'rss2json', papel: 'ler notícias por RSS na TV (recebe só o endereço do feed)', local: 'exterior', quando: 'se a TV mostra notícias' },
];

function termos(env) {
  const f = fornecedor(env);
  const id = identificacao(f);
  const quem = id
    ? `O ${esc(f.marca)} é oferecido por ${id}. Contato: ${contatoHtml(f.contato)}.`
    : `O ${esc(f.marca)} é um serviço de sinalização digital. Contato: ${contatoHtml(f.contato)}.`;
  return `
<h2>1. Quem somos e o que este serviço faz</h2>
<p>${quem}</p>
<p>O serviço é de sinalização digital: você monta conteúdo pelo painel e ele aparece nas TVs que você parear. Ao criar uma conta você concorda com estes Termos e com a <a href="/privacidade">Política de Privacidade</a>.</p>

<h2>2. Sua conta</h2>
<p>Você é responsável por manter a senha em segredo e pelo que acontece na sua conta. Avise imediatamente se suspeitar de acesso indevido. Você precisa ter capacidade legal para contratar e, se estiver agindo por uma empresa, poder para representá-la.</p>

<h2>3. A versão da sua conta: Empresas, Saúde ou Comércio</h2>
<p>O serviço tem três versões. A da sua conta segue o <b>tipo do seu negócio</b>, escolhido no cadastro, e define os modelos, o tom da IA, o que aparece no painel e o <b>preço</b>. Se a versão não corresponder ao negócio (por exemplo, uma loja cadastrada como Empresas), o suporte pode reclassificar a conta; avisamos você antes, e um preço diferente só vale a partir da cobrança seguinte ao aviso.</p>

<h2>4. Teste, planos e cobrança</h2>
<ul>
  <li><b>Teste grátis:</b> ${DIAS_DE_TESTE} dias, sem cartão, com 1 TV e ${CRIACOES_DO_TESTE} criações com IA. Se você não assinar, nada é cobrado: a TV continua exibindo o que já estava programado, com um selo do ${esc(f.marca)} no canto, e a IA e o pareamento de TVs novas passam a pedir assinatura.</li>
  <li><b>Preço por TV:</b> os planos pagos são cobrados por TV pareada (no mínimo 1), por mês, no preço da versão da sua conta. O preço vigente está na página de preços da sua versão e no painel, em Plano, antes de você assinar.</li>
  <li><b>Como é cobrado:</b> de forma recorrente pelo Asaas (Pix, boleto ou cartão). A primeira cobrança é no dia da assinatura; as seguintes, a cada mês, no mesmo dia.</li>
  <li><b>Criações com IA:</b> cada plano tem uma franquia mensal de criações por conta. Pacotes avulsos de criações, quando oferecidos, têm o preço mostrado no painel antes da compra.</li>
  <li><b>Atraso:</b> a TV nunca é desligada por causa de fatura. Com ${ATRASO.avisoDias} dias de atraso avisamos por e-mail; com ${ATRASO.seloDias}, aparece um selo discreto do ${esc(f.marca)} no canto das TVs; com ${ATRASO.suspensaoDias}, criar com IA e parear TVs novas ficam pausados até o pagamento.</li>
</ul>

<h2>5. Direito de arrependimento (7 dias)</h2>
<p>Se você contratou pela internet, pode desistir em até <b>7 dias</b> contados da assinatura do plano pago, sem precisar justificar (Código de Defesa do Consumidor, art. 49). Nesse caso <b>devolvemos tudo o que foi pago</b> nesse período, inclusive no plano anual, e não há multa. Para pedir, escreva para ${contatoHtml(f.contato)} ou use a página <b>Suporte</b> do painel; confirmamos o recebimento e pedimos o estorno ao Asaas pelo mesmo meio de pagamento. O prazo para o dinheiro voltar depende do meio (no cartão, pode aparecer só na fatura seguinte). O teste grátis não conta como contratação, porque nele nada é cobrado.</p>

<h2>6. Cancelamento</h2>
<ul>
  <li><b>Mensal:</b> cancele quando quiser, pelo painel, em Plano. Nenhuma cobrança nova é feita, e o plano continua valendo <b>até o fim do período já pago</b>. Depois, a conta volta ao modo gratuito: uma TV (a mais antiga) segue no ar com o selo, e as outras mostram que estão pausadas até a reativação. Fora o direito de arrependimento (item 5) e os casos em que a lei exigir, não há reembolso proporcional do mês em curso.</li>
  <li><b>Anual:</b> é um contrato de 12 meses, cobrado mês a mês com preço menor por TV. Cancelar antes de completar os 12 meses tem <b>multa de 30% da soma das mensalidades que faltam</b>. Exemplo: com uma mensalidade de R$ 200 e 4 meses por pagar, a multa é 30% de R$ 800, ou R$ 240. <b>Com os 12 meses cumpridos, não há multa.</b> O acesso também vai até o fim do período já pago.</li>
  <li>Excluir a conta com uma assinatura ativa cancela a assinatura antes de apagar os dados: nenhuma cobrança nova é gerada.</li>
</ul>

<h2>7. O conteúdo é seu</h2>
<p>Tudo que você envia ou gera — imagens, textos, campanhas, logo — continua seu. Você nos autoriza apenas a armazenar, processar e exibir esse conteúdo para operar o serviço, inclusive a enviá-lo aos provedores de IA descritos na Política de Privacidade.</p>

<h2>8. Conteúdo gerado por inteligência artificial</h2>
<p>O serviço usa modelos de IA de terceiros para criar textos e imagens. Duas coisas que você precisa saber:</p>
<ul>
  <li>o resultado pode conter <b>erros, imprecisões ou afirmações falsas</b>. A conferência antes de publicar numa tela é sua;</li>
  <li>não garantimos que uma imagem gerada seja <b>original ou livre de direitos de terceiros</b>. Use com o mesmo cuidado que usaria com qualquer arte de origem externa.</li>
</ul>
<p>Você é o responsável pelo que aparece nas suas telas, inclusive por preços, promessas e condições anunciadas. Em saúde, a publicidade segue regras próprias (conselhos profissionais e Anvisa), e conferi-las é do estabelecimento.</p>

<h2>9. Banco de Imagens MultiTelas (compartilhar é opcional)</h2>
<p>Existe um acervo comum de imagens, alimentado pelos próprios clientes. <b>Nada entra nele automaticamente.</b> Sua imagem só vai para lá se você marcar, naquela imagem, a opção de compartilhar.</p>
<ul>
  <li><b>Só imagens geradas pela IA</b> podem ser compartilhadas. Arquivos que você enviou não entram, porque podem conter pessoas, produtos ou marcas de terceiros.</li>
  <li>Ao compartilhar, você concede ao ${esc(f.marca)} e <b>a qualquer outro cliente do serviço — inclusive concorrentes seus, inclusive na sua cidade</b> — uma licença não exclusiva, gratuita e mundial para usar, exibir e adaptar aquela imagem em campanhas próprias.</li>
  <li>Você pode <b>descompartilhar quando quiser</b>. A imagem sai do acervo imediatamente e ninguém mais a encontra. As campanhas de outros clientes que <b>já a estavam usando continuam funcionando</b>: não desligamos a tela de terceiros por uma decisão que eles não participaram.</li>
  <li>Pelo mesmo motivo, uma imagem que você compartilhou e que já foi aprovada no acervo <b>permanece disponível mesmo se você apagar o arquivo ou encerrar sua conta</b>. Ela é gerada por IA, não contém texto, logotipo nem pessoas, e não carrega dado pessoal seu — o vínculo com sua conta é apagado junto com ela.</li>
  <li>Toda imagem oferecida passa por <b>conferência nossa</b> antes de entrar no acervo. Podemos recusar sem precisar justificar.</li>
</ul>
<p>Se você não marcar nada, sua imagem fica <b>só na sua conta</b> e nenhuma outra empresa a vê.</p>

<h2>10. Dados de pessoas que você cadastra</h2>
<p>Esta é a cláusula mais importante deste documento. Quando você cadastra <b>aniversariantes, fotos ou nomes de funcionários</b>, ou recebe fotos pelo QR, esses dados são de titulares que não têm relação conosco.</p>
<ul>
  <li><b>Você é o controlador</b> desses dados. Nós somos <b>operador</b>: tratamos por sua conta e ordem, para executar o serviço.</li>
  <li><b>É sua a responsabilidade</b> de ter base legal para tratá-los e para exibi-los numa tela — incluindo avisar as pessoas e, quando for o caso, obter consentimento. Exibir o rosto de alguém num painel é tratamento de dado pessoal.</li>
  <li><b>Entre empregador e empregado</b>, o consentimento é frágil, porque o empregado nem sempre se sente livre para dizer não. Ofereça sempre a opção de ficar de fora sem consequência, e prefira não exibir a foto de quem não quis.</li>
  <li>Se um titular procurar você exercendo direitos (acesso, correção, exclusão), ajudamos você a atender o pedido.</li>
  <li>Cada um responde pelo que fez: se um dado for cadastrado ou exibido sem base legal por decisão sua, e nós formos cobrados por isso, temos <b>direito de regresso</b> contra você. Isso vale entre nós e não reduz os direitos do titular nem os deveres que a lei dá a cada um perante a ANPD (LGPD, art. 42).</li>
</ul>

<h2>10-A. Mural de fotos enviadas pelo público</h2>
<p>O mural gera um QR. Quem apontar a câmera manda uma foto que aparece na sua tela — <b>sem cadastro e sem identificação</b>. É o recurso mais sensível do serviço, e as regras abaixo são condição para usá-lo.</p>
<ul>
  <li><b>Você é o controlador</b> dessas fotos, como em qualquer dado que cadastra aqui. Nós só transportamos, guardamos e exibimos por sua ordem.</li>
  <li><b>Avise quem envia.</b> A página do QR já informa que a foto será exibida publicamente, mas o aviso no local do evento é seu.</li>
  <li><b>Criança e adolescente.</b> Foto de menor de idade só pode ser exibida com autorização de quem é responsável por ele. Se você não tem como garantir isso, não use o mural em evento com crianças.</li>
  <li><b>Modere.</b> O painel tem um botão que tira tudo da tela e fecha o mural num clique. Manter o mural aberto sem ninguém olhando é decisão sua e risco seu.</li>
  <li>Guardamos o endereço IP de quem envia, por segurança e para apurar abuso.</li>
  <li>Podemos remover fotos e suspender murais que violem estes Termos, sem aviso prévio, quando houver denúncia ou risco evidente.</li>
</ul>

<h2>11. Uso proibido</h2>
<p>Não use o serviço para conteúdo ilegal, discriminatório, enganoso, que viole direitos de terceiros ou que exponha pessoas sem autorização. Também não tente burlar limites de plano, sobrecarregar a infraestrutura ou acessar dados de outras contas.</p>

<h2>12. Disponibilidade</h2>
<p>Trabalhamos para manter tudo no ar, mas não prometemos funcionamento ininterrupto. Pode haver manutenção, falha de terceiros (hospedagem, IA, e-mail) ou indisponibilidade da internet no local da TV. O reprodutor guarda a última configuração recebida e continua exibindo mesmo sem conexão.</p>

<h2>13. Limite de responsabilidade</h2>
<p>Na máxima extensão permitida pela lei, nossa responsabilidade total fica limitada ao valor que você pagou nos 12 meses anteriores ao fato. Isto não afasta direitos que a lei brasileira garanta de forma inafastável, inclusive os do Código de Defesa do Consumidor quando aplicável.</p>

<h2>14. Encerramento</h2>
<p>Você pode excluir sua conta a qualquer momento em <b>Ajustes</b>. A exclusão apaga seus dados conforme a Política de Privacidade. Podemos encerrar contas que violem estes Termos, avisando quando for possível.</p>

<h2>15. Mudanças</h2>
<p>Podemos alterar estes Termos. Mudanças relevantes serão avisadas por e-mail ou no painel com antecedência razoável, antes de valer. Continuar usando depois disso significa aceitar a nova versão; se não concordar, você pode cancelar antes de a mudança valer.</p>

<h2>16. Lei e foro</h2>
<p>Aplica-se a lei brasileira. Quando a relação for de consumo, fica eleito o foro do domicílio do consumidor; nos demais casos, o foro do domicílio de quem é demandado.</p>
`;
}

function privacidade(env) {
  const f = fornecedor(env);
  const id = identificacao(f);
  const encarregado = (f.encarregado ? esc(f.encarregado) + ', ' : '') + contatoHtml(f.emailDpo);
  return `
<h2>1. Quem trata os dados, e em que papel</h2>
<p>${id ? 'O ' + esc(f.marca) + ' é oferecido por ' + id + '.' : 'O ' + esc(f.marca) + ' é um serviço de sinalização digital.'} Ele trata dados pessoais em duas posições, e a diferença muda quem responde pelo quê:</p>
<ul>
  <li><b>Controlador</b> dos dados de quem contrata o serviço — o seu e-mail, seu nome e seus dados de cobrança. Aqui as decisões são nossas.</li>
  <li><b>Operador</b> dos dados que você cadastra sobre terceiros — nomes, cargos, datas de aniversário e fotos de funcionários, e as fotos recebidas pelo QR. Aqui quem decide é você; nós só executamos.</li>
</ul>

<h2>2. O que guardamos</h2>
<table>
  <tr><th>Dado</th><th>Para quê</th><th>Base legal</th></tr>
  <tr><td>E-mail, nome e senha (guardada como hash, nunca em texto)</td><td>criar e acessar a conta</td><td>execução de contrato</td></tr>
  <tr><td>Identificador da conta Google, quando você entra por ela</td><td>autenticação</td><td>execução de contrato</td></tr>
  <tr><td>Nome da empresa, versão da conta, plano e identificadores do Asaas</td><td>cobrança</td><td>execução de contrato e obrigação legal</td></tr>
  <tr><td>Telas pareadas: nome, código, configuração e último acesso</td><td>operar o serviço</td><td>execução de contrato</td></tr>
  <tr><td>Conteúdo que você cria: campanhas, imagens, logo, cores e regras da marca</td><td>montar e exibir a programação</td><td>execução de contrato</td></tr>
  <tr><td>Aniversariantes: nome, matrícula, cargo, dia, mês e foto</td><td>exibir a homenagem na tela</td><td><b>definida por você</b> — somos operador</td></tr>
  <tr><td>Foto pelo QR: nome, e-mail, data de aniversário e setor de quem envia, e a foto</td><td>a pessoa mandar a própria foto, para o RH aprovar</td><td><b>definida por você</b> — somos operador</td></tr>
  <tr><td>Mural: a foto enviada, o nome e a mensagem que a pessoa digitou (ambos opcionais) e o endereço IP de quem enviou</td><td>exibir na tela e apurar abuso</td><td><b>definida por você</b> — somos operador</td></tr>
  <tr><td>Registro do aceite dos Termos: versão, data, endereço IP e origem</td><td>comprovar o aceite</td><td>legítimo interesse e obrigação legal</td></tr>
  <tr><td>Convites de equipe: e-mail do convidado e papel</td><td>dar acesso ao painel</td><td>execução de contrato</td></tr>
  <tr><td>Acessos do suporte à sua conta: quem entrou, quando e o motivo</td><td>prestar contas de cada acesso</td><td>legítimo interesse</td></tr>
</table>

<h2 id="cookies">3. Cookies e medição</h2>
<table>
  <tr><th>Nome</th><th>Onde</th><th>Para quê</th><th>Por quanto tempo</th></tr>
  <tr><td><code>mt_session</code></td><td>painel</td><td>manter você conectado. Essencial: sem ele não há login, por isso dispensa consentimento</td><td>até 30 dias, ou até você sair</td></tr>
  <tr><td><code>mt_oauth</code> e <code>mt_frente</code></td><td>login com Google</td><td>proteger o login e lembrar a versão escolhida durante a ida ao Google. Essenciais</td><td>10 minutos</td></tr>
  <tr><td><code>mt_cookies</code> (guardado no navegador)</td><td>página do site</td><td>lembrar se você aceitou ou recusou a medição</td><td>até você limpar os dados do navegador</td></tr>
  <tr><td><code>_ga</code>, <code>_ga_*</code> (Google Analytics) e <code>_gcl_au</code> (Google Ads)</td><td><b>só na página do site</b> (multitelas.net.br, /empresas, /saude, /comercio)</td><td>contar visitas e saber quais anúncios trouxeram quem se cadastrou</td><td>até 2 anos (<code>_ga</code>) e 90 dias (<code>_gcl_au</code>), pelas regras do Google</td></tr>
</table>
<p><b>Os cookies do Google só são gravados se você clicar em "Aceitar"</b> no aviso da página. Até lá, e se você clicar em "Recusar", a medição fica desligada (o Google recebe, no máximo, um sinal sem cookie de que a página foi aberta). A personalização de anúncios (remarketing) fica sempre desligada. Para mudar de ideia, use o link <b>Cookies</b> no rodapé da página ou limpe os dados do site no navegador.</p>
<p>O <b>painel</b> e a <b>TV</b> não têm Google Analytics nem Google Ads. Não vendemos dados pessoais e não os compartilhamos para publicidade de terceiros.</p>

<h2>4. Para onde os dados vão</h2>
<p>Usamos os serviços abaixo para operar. A maioria fica fora do Brasil; a transferência internacional se apoia nas cláusulas-padrão contratuais aprovadas pela ANPD (Resolução CD/ANPD nº 19/2024) ou nas garantias equivalentes dos contratos de cada serviço, e no que for necessário para executar o serviço que você contratou (LGPD, art. 33).</p>
<table>
  <tr><th>Serviço</th><th>Para quê</th><th>Quando</th><th>Onde</th></tr>
  ${SUBOPERADORES.map((s) => `<tr><td>${s.nome}</td><td>${s.papel}</td><td>${s.quando}</td><td>${s.local}</td></tr>`).join('\n  ')}
</table>
<p><b>Sobre a IA:</b> quando você gera uma campanha, o pedido que escreveu vai para o motor de IA. Quando você sobe imagens como referência de estilo ou como acervo da marca, <b>essas imagens são enviadas ao Google para serem analisadas</b>. Se elas contiverem rostos ou qualquer dado pessoal, isso vale como compartilhamento — leve em conta antes de subir.</p>

<h2>5. Fotos de pessoas</h2>
<p>Fotos de rosto são dado pessoal. Quem decide usá-las é a sua empresa (o controlador), que precisa ter base legal — em geral, o <b>consentimento</b> da pessoa fotografada, livre e que pode ser retirado a qualquer momento. O que o serviço faz em cada caso:</p>
<ul>
  <li><b>Aniversariantes:</b> a foto é enviada pela sua empresa. Fica enquanto a pessoa estiver na lista; sai quando ela é tirada da lista ou quando a conta é excluída. A TV mostra o aniversariante na semana do aniversário, e só depois de você ligar "mostrar nas TVs".</li>
  <li><b>Foto pelo QR:</b> a própria pessoa manda a foto, depois de confirmar um código enviado ao e-mail dela, e marca a autorização na página. A foto só vai para a TV depois de alguém da sua empresa aprovar. <b>Foto sem decisão é apagada em 30 dias.</b> O mural de uma data (por exemplo, o aniversário da empresa) é apagado 30 dias depois da data, e a sua empresa pode guardá-lo por mais 30 dias; o painel avisa 7 dias antes. A pessoa pode pedir para sair a qualquer momento, à sua empresa ou a nós.</li>
  <li><b>Mural:</b> quem envia aceita, na página do QR, que a foto seja exibida publicamente. Guardamos a foto, o nome e a mensagem (opcionais) e o endereço IP de quem enviou, enquanto o mural existir. Tirar uma foto da tela a esconde; excluir o mural apaga a foto e o registro dela.</li>
</ul>
<p>Na relação de emprego, o consentimento é frágil: ofereça sempre a opção de ficar de fora sem consequência.</p>

<h2>6. Por quanto tempo</h2>
<ul>
  <li>Enquanto sua conta existir, mantemos os dados necessários para o serviço funcionar.</li>
  <li>Fotos de pessoas: os prazos do item 5.</li>
  <li>Ao excluir a conta, apagamos conta, usuários, telas, configurações, biblioteca, marca, aniversariantes, fotos pelo QR, murais e suas fotos, sessões, o registro do aceite e os arquivos enviados. A exclusão é imediata e não há lixeira — não dá para desfazer. As TVs deixam de receber conteúdo novo; o que cada uma já tinha guardado só sai da tela quando ela é reiniciada (ou desligada e ligada).</li>
  <li>O registro dos acessos do suporte à conta é mantido mesmo depois da exclusão, como prova de que cada acesso teve motivo.</li>
  <li>Registros exigidos por lei (fiscais e de cobrança) podem ser mantidos pelo prazo legal, mesmo após a exclusão.</li>
  <li>Cópias em backup do banco podem persistir por até 30 dias antes de serem sobrescritas.</li>
</ul>

<h2>7. Acesso do suporte à sua conta</h2>
<p>Para resolver um problema, alguém da nossa equipe pode entrar na sua conta. Cada entrada exige um motivo escrito, dura no máximo uma hora, aparece numa faixa no painel enquanto dura e fica registrada (quem, quando e por quê). O suporte não mexe em cobrança, equipe, senha, exportação nem exclusão de dados. Os acessos aparecem na exportação dos seus dados.</p>

<h2>8. Seus direitos</h2>
<p>A LGPD garante confirmação de tratamento, acesso, correção, anonimização, portabilidade, eliminação, informação sobre compartilhamento e revisão de decisões automatizadas. Dois deles você exerce sozinho, no painel, em <b>Ajustes</b>:</p>
<ul>
  <li><b>Exportar meus dados</b> — baixa um arquivo com tudo que guardamos da sua conta;</li>
  <li><b>Excluir minha conta</b> — apaga tudo, conforme descrito acima.</li>
</ul>
<p>Para os demais, escreva para ${contatoHtml(f.emailDpo)}. Respondemos em até 15 dias.</p>
<p><b>Se você é funcionário de uma empresa cliente</b> e seus dados aparecem numa tela: quem decide sobre esses dados é o seu empregador. Procure-o primeiro — mas se preferir falar conosco, encaminhamos.</p>

<h2>9. Segurança</h2>
<p>Senhas são guardadas com <i>hash</i> e sal, nunca em texto legível. O acesso é por cookie de sessão restrito ao domínio, marcado como <i>HttpOnly</i> e, sob HTTPS, <i>Secure</i>. Cada conta enxerga apenas os próprios dados. Há limite de tentativas em cadastro, login, pareamento e geração por IA. Nenhum sistema é imune: se houver incidente com risco relevante, comunicaremos você e a ANPD.</p>

<h2>10. Encarregado (DPO)</h2>
<p>Contato para assuntos de proteção de dados: ${encarregado}.</p>

<h2>11. Mudanças</h2>
<p>Se esta política mudar de forma relevante, avisamos no painel ou por e-mail. A versão vigente está identificada no topo e no rodapé desta página.</p>
`;
}

const CSS = `
:root { color-scheme: light dark; }
* { box-sizing: border-box; }
body { margin: 0; background: #f7f8fa; color: #14161a; font: 16px/1.65 system-ui, -apple-system, Segoe UI, Roboto, sans-serif; }
.wrap { max-width: 760px; margin: 0 auto; padding: 40px 22px 80px; }
a { color: #4f46e5; }
h1 { font-size: 1.9rem; margin: 0 0 .3rem; letter-spacing: -.02em; }
h2 { font-size: 1.05rem; margin: 2.1rem 0 .5rem; letter-spacing: -.01em; }
p, li { color: #33383f; }
ul { padding-left: 1.2rem; }
li { margin: .3rem 0; }
code { font-size: .85em; }
table { width: 100%; border-collapse: collapse; margin: .8rem 0; font-size: .9rem; display: block; overflow-x: auto; }
th, td { border: 1px solid #dfe2e8; padding: .5rem .6rem; text-align: left; vertical-align: top; }
th { background: #eef0f4; font-weight: 600; }
.meta { color: #6b7280; font-size: .85rem; }
.nota { border: 1px solid #dfe2e8; background: #fff; border-radius: 10px; padding: .8rem 1rem; margin: 1.2rem 0; font-size: .9rem; }
.nav { display: flex; flex-wrap: wrap; gap: .4rem 1rem; margin-top: .8rem; font-size: .9rem; }
footer { margin-top: 3rem; border-top: 1px solid #dfe2e8; padding-top: 1rem; }
@media (prefers-color-scheme: dark) {
  body { background: #0d0f13; color: #e8eaee; }
  p, li { color: #c3c8d1; }
  th, td { border-color: #262b33; }
  th { background: #171a20; }
  .meta { color: #8b929d; }
  .nota { border-color: #262b33; background: #14171c; }
  footer { border-color: #262b33; }
  a { color: #a5b4fc; }
}
`;

/*
 * A nota para o CLIENTE enquanto não houver revisão jurídica. Diz a verdade
 * (está em revisão) sem tirar o valor do que ele aceita, e promete o que o
 * item "Mudanças" já promete: aviso antes de qualquer mudança valer.
 */
const NOTA_EM_REVISAO = '<div class="nota">Esta é a versão inicial, de ' + VERSAO_LEGIVEL + ', e vale como está escrita. '
  + 'Ela está em revisão jurídica: se a revisão mudar alguma coisa relevante, avisamos por e-mail e no painel antes de a mudança valer.</div>';

function pagina(titulo, corpo, env) {
  const f = fornecedor(env);
  const aviso = revisado(env) ? '' : NOTA_EM_REVISAO;
  const id = identificacao(f);
  return `<!doctype html><html lang="pt-BR"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${titulo} · ${esc(f.marca)}</title>
<meta name="description" content="${titulo} do ${esc(f.marca)}: o que vale para quem usa o serviço, como cobramos e como tratamos os dados.">
<link rel="canonical" href="https://app.multitelas.net.br/${titulo === 'Termos de Uso' ? 'termos' : 'privacidade'}">
<link rel="icon" type="image/svg+xml" href="/icons/icone.svg">
<style>${CSS}</style></head>
<body><div class="wrap">
<h1>${titulo}</h1>
<div class="meta">Versão ${VERSAO}</div>
<div class="nav"><a href="/">Voltar ao site</a><a href="/termos">Termos de Uso</a><a href="/privacidade">Política de Privacidade</a><a href="/app">Entrar no painel</a></div>
${aviso}
${corpo}
<footer class="meta">© 2026 ${esc(f.marca)}${id ? ' · ' + id : ''} · versão ${VERSAO} · contato: ${contatoHtml(f.contato)}</footer>
</div></body></html>`;
}

module.exports = {
  VERSAO,
  // O e-mail de contato configurado ('' sem SUPPORT_EMAIL: nunca um e-mail pessoal fixo).
  get CONTATO() { return fornecedor().contato; },
  SUBOPERADORES,
  fornecedor,
  faltandoFornecedor,
  rodape,
  termosHtml: (env) => pagina('Termos de Uso', termos(env), env),
  privacidadeHtml: (env) => pagina('Política de Privacidade', privacidade(env), env),
};
