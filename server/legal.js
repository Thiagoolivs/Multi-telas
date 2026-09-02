/*
 * server/legal.js — Termos de Uso e Política de Privacidade.
 *
 * ATENÇÃO: os textos aqui são um RASCUNHO TÉCNICO. Eles descrevem com precisão
 * o que o sistema realmente faz — quais dados guarda, para onde manda, quanto
 * tempo retém — que é justamente a parte que um escritório de advocacia não tem
 * como saber sozinho. Mas rascunho não é peça jurídica: alguém com OAB precisa
 * revisar antes de vender. O aviso disso aparece no topo das páginas e sai
 * quando a revisão acontecer.
 *
 * VERSAO é a fonte única: o cadastro grava qual versão o cliente aceitou. Mudou
 * o texto de forma relevante, sobe a versão — assim dá para saber quem aceitou
 * o quê, que é o ponto inteiro de registrar aceite.
 */
const VERSAO = '2026-08-25';

// Trocar por um e-mail do domínio quando ele existir.
const CONTATO = process.env.SUPPORT_EMAIL || 'thiago.olivs.coelho@gmail.com';
const EMPRESA = process.env.LEGAL_NOME || 'MultiTelas';
const REVISADO = process.env.LEGAL_REVISADO === 'true';

/*
 * Suboperadores: para quem os dados do cliente realmente vão. Esta lista existe
 * porque a LGPD exige transparência sobre compartilhamento, e porque o cliente
 * merece saber que a arte dele passa por um modelo de IA do Google.
 */
const SUBOPERADORES = [
  { nome: 'Railway', papel: 'hospedagem da aplicação e do banco de dados', local: 'Estados Unidos' },
  { nome: 'Cloudflare R2', papel: 'armazenamento das imagens e arquivos enviados', local: 'Estados Unidos' },
  { nome: 'Google (Gemini API)', papel: 'geração de textos e imagens das campanhas; leitura das imagens enviadas como referência ou acervo', local: 'Estados Unidos' },
  { nome: 'Resend', papel: 'envio de e-mails de recuperação de senha e avisos', local: 'Estados Unidos' },
  { nome: 'Asaas', papel: 'processamento de pagamentos por Pix, boleto e cartão (não recebemos o número do cartão)', local: 'Brasil' },
  { nome: 'Open-Meteo', papel: 'previsão do tempo exibida nas telas (recebe apenas a cidade, nenhum dado pessoal)', local: 'Alemanha' },
];

const TERMOS = `
<h2>1. Quem somos e o que este serviço faz</h2>
<p>O ${EMPRESA} é um serviço de sinalização digital: você monta conteúdo pelo painel e ele aparece nas TVs que você parear. Ao criar uma conta você concorda com estes Termos.</p>

<h2>2. Sua conta</h2>
<p>Você é responsável por manter a senha em segredo e pelo que acontece na sua conta. Avise imediatamente se suspeitar de acesso indevido. Você precisa ter capacidade legal para contratar e, se estiver agindo por uma empresa, poder para representá-la.</p>

<h2>3. Planos, cobrança e cancelamento</h2>
<p>O plano gratuito tem limite de telas. Planos pagos são cobrados de forma recorrente pelo Asaas. Você pode cancelar quando quiser; o acesso continua até o fim do período já pago e não há reembolso proporcional, salvo quando a lei exigir.</p>

<h2>4. O conteúdo é seu</h2>
<p>Tudo que você envia ou gera — imagens, textos, campanhas, logo — continua seu. Você nos autoriza apenas a armazenar, processar e exibir esse conteúdo para operar o serviço, inclusive a enviá-lo aos provedores de IA descritos na Política de Privacidade.</p>

<h2>5. Conteúdo gerado por inteligência artificial</h2>
<p>O serviço usa modelos de IA de terceiros para criar textos e imagens. Duas coisas que você precisa saber:</p>
<ul>
  <li>o resultado pode conter <b>erros, imprecisões ou afirmações falsas</b>. A conferência antes de publicar numa tela é sua;</li>
  <li>não garantimos que uma imagem gerada seja <b>original ou livre de direitos de terceiros</b>. Use com o mesmo cuidado que usaria com qualquer arte de origem externa.</li>
</ul>
<p>Você é o responsável pelo que aparece nas suas telas, inclusive por preços, promessas e condições anunciadas.</p>

<h2>6. Banco de Imagens MultiTelas (compartilhar é opcional)</h2>
<p>Existe um acervo comum de imagens, alimentado pelos próprios clientes. <b>Nada entra nele automaticamente.</b> Sua imagem só vai para lá se você marcar, naquela imagem, a opção de compartilhar.</p>
<ul>
  <li><b>Só imagens geradas pela IA</b> podem ser compartilhadas. Arquivos que você enviou não entram, porque podem conter pessoas, produtos ou marcas de terceiros.</li>
  <li>Ao compartilhar, você concede ao ${EMPRESA} e <b>a qualquer outro cliente do serviço — inclusive concorrentes seus, inclusive na sua cidade</b> — uma licença não exclusiva, gratuita e mundial para usar, exibir e adaptar aquela imagem em campanhas próprias.</li>
  <li>Você pode <b>descompartilhar quando quiser</b>. A imagem sai do acervo imediatamente e ninguém mais a encontra. As campanhas de outros clientes que <b>já a estavam usando continuam funcionando</b>: não desligamos a tela de terceiros por uma decisão que eles não participaram.</li>
  <li>Pelo mesmo motivo, uma imagem que você compartilhou e que já foi aprovada no acervo <b>permanece disponível mesmo se você apagar o arquivo ou encerrar sua conta</b>. Ela é gerada por IA, não contém texto, logotipo nem pessoas, e não carrega dado pessoal seu — o vínculo com sua conta é apagado junto com ela.</li>
  <li>Toda imagem oferecida passa por <b>conferência nossa</b> antes de entrar no acervo. Podemos recusar sem precisar justificar.</li>
</ul>
<p>Se você não marcar nada, sua imagem fica <b>só na sua conta</b> e nenhuma outra empresa a vê.</p>

<h2>7. Dados de pessoas que você cadastra</h2>
<p>Esta é a cláusula mais importante deste documento. Quando você cadastra <b>aniversariantes, fotos ou nomes de funcionários</b>, esses dados são de titulares que não têm relação conosco.</p>
<ul>
  <li><b>Você é o controlador</b> desses dados. Nós somos apenas <b>operador</b>: tratamos por sua conta e ordem, para executar o serviço.</li>
  <li><b>É sua a responsabilidade</b> de ter base legal para tratá-los e para exibi-los numa tela — incluindo avisar as pessoas e, quando for o caso, obter consentimento. Exibir o rosto de alguém num painel é tratamento de dado pessoal.</li>
  <li>Se um titular procurar você exercendo direitos (acesso, correção, exclusão), atendemos sua solicitação para cumprir o pedido.</li>
  <li>Você nos isenta de responsabilidade por dados que cadastrar sem base legal.</li>
</ul>

<h2>7-A. Mural de fotos enviadas pelo público</h2>
<p>O mural gera um QR. Quem apontar a câmera manda uma foto que aparece na sua tela — <b>sem cadastro e sem identificação</b>. É o recurso mais sensível do serviço, e as regras abaixo são condição para usá-lo.</p>
<ul>
  <li><b>Você é o controlador</b> dessas fotos, como em qualquer dado que cadastra aqui. Nós só transportamos, guardamos e exibimos por sua ordem.</li>
  <li><b>Avise quem envia.</b> A página do QR já informa que a foto será exibida publicamente, mas o aviso no local do evento é seu.</li>
  <li><b>Criança e adolescente.</b> Foto de menor de idade só pode ser exibida com autorização de quem é responsável por ele. Se você não tem como garantir isso, não use o mural em evento com crianças.</li>
  <li><b>Modere.</b> O painel tem um botão que tira tudo da tela e fecha o mural num clique. Manter o mural aberto sem ninguém olhando é decisão sua e risco seu.</li>
  <li>Guardamos o endereço IP de quem envia, por segurança e para apurar abuso.</li>
  <li>Podemos remover fotos e suspender murais que violem estes Termos, sem aviso prévio, quando houver denúncia ou risco evidente.</li>
</ul>

<h2>8. Uso proibido</h2>
<p>Não use o serviço para conteúdo ilegal, discriminatório, enganoso, que viole direitos de terceiros ou que exponha pessoas sem autorização. Também não tente burlar limites de plano, sobrecarregar a infraestrutura ou acessar dados de outras contas.</p>

<h2>9. Disponibilidade</h2>
<p>Trabalhamos para manter tudo no ar, mas não prometemos funcionamento ininterrupto. Pode haver manutenção, falha de terceiros (hospedagem, IA, e-mail) ou indisponibilidade da internet no local da TV. O reprodutor guarda a última configuração recebida e continua exibindo mesmo sem conexão.</p>

<h2>10. Limite de responsabilidade</h2>
<p>Na máxima extensão permitida pela lei, nossa responsabilidade total fica limitada ao valor que você pagou nos 12 meses anteriores ao fato. Isto não afasta direitos que a lei brasileira garanta de forma inafastável, inclusive os do Código de Defesa do Consumidor quando aplicável.</p>

<h2>11. Encerramento</h2>
<p>Você pode excluir sua conta a qualquer momento em <b>Ajustes</b>. A exclusão apaga seus dados conforme a Política de Privacidade. Podemos encerrar contas que violem estes Termos, avisando quando for possível.</p>

<h2>12. Mudanças</h2>
<p>Podemos alterar estes Termos. Mudanças relevantes serão avisadas por e-mail ou no painel com antecedência razoável. Continuar usando depois disso significa aceitar a nova versão.</p>

<h2>13. Lei e foro</h2>
<p>Aplica-se a lei brasileira. Fica eleito o foro do domicílio do consumidor quando a relação for de consumo.</p>
`;

const PRIVACIDADE = `
<h2>1. Dois papéis diferentes</h2>
<p>O ${EMPRESA} trata dados pessoais em duas posições, e a diferença muda quem responde pelo quê:</p>
<ul>
  <li><b>Controlador</b> dos dados de quem contrata o serviço — o seu e-mail, seu nome e seus dados de cobrança. Aqui as decisões são nossas.</li>
  <li><b>Operador</b> dos dados que você cadastra sobre terceiros — nomes, cargos, datas de aniversário e fotos de funcionários. Aqui quem decide é você; nós só executamos.</li>
</ul>

<h2>2. O que guardamos</h2>
<table>
  <tr><th>Dado</th><th>Para quê</th><th>Base legal</th></tr>
  <tr><td>E-mail, nome e senha (guardada como hash, nunca em texto)</td><td>criar e acessar a conta</td><td>execução de contrato</td></tr>
  <tr><td>Identificador da conta Google, quando você entra por ela</td><td>autenticação</td><td>execução de contrato</td></tr>
  <tr><td>Nome da empresa, plano e identificadores do Asaas</td><td>cobrança</td><td>execução de contrato e obrigação legal</td></tr>
  <tr><td>Telas pareadas: nome, código, configuração e último acesso</td><td>operar o serviço</td><td>execução de contrato</td></tr>
  <tr><td>Conteúdo que você cria: campanhas, imagens, logo, cores e regras da marca</td><td>montar e exibir a programação</td><td>execução de contrato</td></tr>
  <tr><td>Aniversariantes: nome, matrícula, cargo, dia, mês e foto</td><td>exibir a homenagem na tela</td><td><b>definida por você</b> — somos operador</td></tr>
  <tr><td>Mural: a foto enviada, o nome e a mensagem que a pessoa digitou (ambos opcionais) e o endereço IP de quem enviou</td><td>exibir na tela e apurar abuso</td><td><b>definida por você</b> — somos operador</td></tr>
  <tr><td>Registro do aceite dos Termos: versão, data e endereço IP</td><td>comprovar o aceite</td><td>legítimo interesse e obrigação legal</td></tr>
  <tr><td>Convites de equipe: e-mail do convidado e papel</td><td>dar acesso ao painel</td><td>execução de contrato</td></tr>
</table>
<p>Não usamos cookies de publicidade nem de análise. O único cookie é o de sessão, necessário para manter você conectado — por ser essencial, dispensa consentimento.</p>

<h2>3. Para onde os dados vão</h2>
<p>Usamos os serviços abaixo para operar. Todos ficam fora do Brasil; a transferência internacional se apoia em cláusulas contratuais dos respectivos contratos e no que for necessário para executar o serviço que você contratou.</p>
<table>
  <tr><th>Serviço</th><th>Para quê</th><th>Onde</th></tr>
  ${SUBOPERADORES.map((s) => `<tr><td>${s.nome}</td><td>${s.papel}</td><td>${s.local}</td></tr>`).join('\n  ')}
</table>
<p><b>Sobre a IA:</b> quando você gera uma campanha, o briefing que escreveu vai para a API do Google. Quando você sobe imagens como referência de estilo ou como acervo da marca, <b>essas imagens são enviadas ao Google para serem analisadas</b>. Se elas contiverem rostos ou qualquer dado pessoal, isso vale como compartilhamento — leve em conta antes de subir.</p>
<p>Não vendemos dados pessoais e não os compartilhamos para publicidade de terceiros.</p>

<h2>4. Por quanto tempo</h2>
<ul>
  <li>Enquanto sua conta existir, mantemos os dados necessários para o serviço funcionar.</li>
  <li>Fotos do mural ficam guardadas enquanto o mural existir. Tirar uma foto da tela a esconde, não a apaga: excluir o mural apaga o registro dela.</li>
  <li>Ao excluir a conta, apagamos conta, usuários, telas, configurações, biblioteca, marca, aniversariantes, murais e suas fotos, sessões e os arquivos enviados. A exclusão é imediata e não há lixeira — não dá para desfazer.</li>
  <li>Registros exigidos por lei (fiscais e de cobrança) podem ser mantidos pelo prazo legal, mesmo após a exclusão.</li>
  <li>Cópias em backup do banco podem persistir por até 30 dias antes de serem sobrescritas.</li>
</ul>

<h2>5. Seus direitos</h2>
<p>A LGPD garante confirmação de tratamento, acesso, correção, anonimização, portabilidade, eliminação, informação sobre compartilhamento e revisão de decisões automatizadas. Dois deles você exerce sozinho, no painel, em <b>Ajustes</b>:</p>
<ul>
  <li><b>Exportar meus dados</b> — baixa um arquivo com tudo que guardamos da sua conta;</li>
  <li><b>Excluir minha conta</b> — apaga tudo, conforme descrito acima.</li>
</ul>
<p>Para os demais, escreva para <a href="mailto:${CONTATO}">${CONTATO}</a>. Respondemos em até 15 dias.</p>
<p><b>Se você é funcionário de uma empresa cliente</b> e seus dados aparecem numa tela: quem decide sobre esses dados é o seu empregador. Procure-o primeiro — mas se preferir falar conosco, encaminhamos.</p>

<h2>6. Segurança</h2>
<p>Senhas são guardadas com <i>hash</i> e sal, nunca em texto legível. O acesso é por cookie de sessão restrito ao domínio, marcado como <i>HttpOnly</i> e, sob HTTPS, <i>Secure</i>. Cada conta enxerga apenas os próprios dados. Há limite de tentativas em cadastro, login, pareamento e geração por IA. Nenhum sistema é imune: se houver incidente com risco relevante, comunicaremos você e a ANPD.</p>

<h2>7. Encarregado (DPO)</h2>
<p>Contato para assuntos de proteção de dados: <a href="mailto:${CONTATO}">${CONTATO}</a>.</p>

<h2>8. Mudanças</h2>
<p>Se esta política mudar de forma relevante, avisamos no painel ou por e-mail. A versão vigente está identificada no rodapé desta página.</p>
`;

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
table { width: 100%; border-collapse: collapse; margin: .8rem 0; font-size: .9rem; display: block; overflow-x: auto; }
th, td { border: 1px solid #dfe2e8; padding: .5rem .6rem; text-align: left; vertical-align: top; }
th { background: #eef0f4; font-weight: 600; }
.meta { color: #6b7280; font-size: .85rem; }
.aviso { border: 1px solid #f0c36d; background: #fdf6e3; color: #6b4f14; border-radius: 10px; padding: .8rem 1rem; margin: 1.2rem 0; font-size: .9rem; }
.nav { display: flex; gap: 1rem; margin-top: .8rem; font-size: .9rem; }
footer { margin-top: 3rem; border-top: 1px solid #dfe2e8; padding-top: 1rem; }
@media (prefers-color-scheme: dark) {
  body { background: #0d0f13; color: #e8eaee; }
  p, li { color: #c3c8d1; }
  th, td { border-color: #262b33; }
  th { background: #171a20; }
  .meta { color: #8b929d; }
  .aviso { border-color: #5c4718; background: #1e1809; color: #e7c98a; }
  footer { border-color: #262b33; }
  a { color: #a5b4fc; }
}
`;

function pagina(titulo, corpo) {
  const aviso = REVISADO ? '' :
    '<div class="aviso"><b>Rascunho.</b> Este texto descreve com precisão o que o sistema faz, '
    + 'mas ainda não passou por revisão jurídica. Não use como peça contratual definitiva.</div>';
  return `<!doctype html><html lang="pt-BR"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${titulo} · ${EMPRESA}</title><style>${CSS}</style></head>
<body><div class="wrap">
<h1>${titulo}</h1>
<div class="meta">Versão ${VERSAO}</div>
<div class="nav"><a href="/termos">Termos de Uso</a><a href="/privacidade">Política de Privacidade</a><a href="/app">Voltar ao painel</a></div>
${aviso}
${corpo}
<footer class="meta">${EMPRESA} · versão ${VERSAO} · contato: <a href="mailto:${CONTATO}">${CONTATO}</a></footer>
</div></body></html>`;
}

module.exports = {
  VERSAO,
  CONTATO,
  SUBOPERADORES,
  termosHtml: () => pagina('Termos de Uso', TERMOS),
  privacidadeHtml: () => pagina('Política de Privacidade', PRIVACIDADE),
};
