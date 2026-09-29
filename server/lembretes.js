/*
 * server/lembretes.js — os dois e-mails do fim do teste.
 *
 * O teste de 14 dias acabava em silêncio: a conta descobria no painel, ou
 * pela TV com o selo "versão gratuita" no canto. Quem ia assinar não tinha
 * um empurrão na hora certa, e quem nem tinha ligado a TV passava as duas
 * semanas sem ninguém lembrar que faltava ligar.
 *
 * Dois avisos, cada um uma vez só por conta:
 *
 *   '2d'  — faltando até 2 dias. Se a conta ainda não pareou nenhuma tela, o
 *           e-mail é sobre LIGAR a TV (sem tela no ar não há o que decidir);
 *           se pareou, é sobre continuar sem o selo.
 *   'fim' — até 3 dias depois de acabar: a tela segue no ar, com selo, e o
 *           que muda ao assinar.
 *
 * Só contas no plano grátis. Cortesia e quem paga ficam de fora pelo plano.
 * A marca vai para o banco DEPOIS do envio, como no vigia: um e-mail repetido
 * por falha do provedor é chato; um que nunca sai é pior.
 */
const plans = require('./plans');
const { log } = require('./log.js');

const DIA = 24 * 60 * 60 * 1000;
const JANELA_FIM_MS = 3 * DIA;            // depois disso, "seu teste acabou" já é notícia velha
const INTERVALO_MS = 6 * 60 * 60 * 1000;  // o "faltam 2 dias" não pode pular um dia inteiro

/* Qual aviso esta conta deve receber agora — ou nenhum. Função pura. */
function decidir(conta, agora) {
  if (!conta || (conta.plan && conta.plan !== 'free')) return null;
  if (!conta.email) return null;
  const ja = conta.lembrete_teste || '';
  const fim = plans.fimDoTeste(conta);
  if (!fim) return null;
  if (agora >= fim) {
    return ja !== 'fim' && agora - fim <= JANELA_FIM_MS ? 'fim' : null;
  }
  const restam = plans.diasDeTesteRestantes(conta, agora);
  return restam <= 2 && !ja ? '2d' : null;
}

function reais(cents) {
  return 'R$ ' + (cents / 100).toFixed(2).replace('.', ',');
}

function escapar(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function mensagem(tipo, conta, appUrl, agora) {
  const preco = reais(plans.PLANS.pro.precoTelaCents);
  const telas = Number(conta.telas) || 0;
  const restam = plans.diasDeTesteRestantes(conta, agora);
  const quando = restam <= 1 ? 'amanhã' : 'em ' + restam + ' dias';
  let assunto; let titulo; let paragrafos; let botao; let destino;

  if (tipo === '2d' && !telas) {
    assunto = 'Seu teste do MultiTelas acaba ' + quando + ' — e a TV ainda não foi ligada';
    titulo = 'Falta ligar a primeira TV';
    paragrafos = [
      'Seu teste grátis acaba ' + quando + ', e nenhuma tela foi pareada ainda. Leva uns cinco minutos:',
      'Abra o app MultiTelas TV no aparelho da TV (ou o endereço /tv no navegador da Smart TV), aponte o celular para o QR que aparecer, e escolha um modelo pronto — o cardápio, uma promoção.',
      'Ver funcionando na sua parede é o que ajuda a decidir.',
    ];
    botao = 'Parear minha TV';
    destino = '/app/?ir=screens';
  } else if (tipo === '2d') {
    assunto = 'Seu teste do MultiTelas acaba ' + quando;
    titulo = 'Seu teste acaba ' + quando;
    paragrafos = [
      'Sua' + (telas > 1 ? 's ' + telas + ' telas estão' : ' tela está') + ' no ar. Para continuar do jeito que está, assine o Pro: ' + preco + ' por tela, por mês.',
      'Se não assinar, nada apaga: a tela segue exibindo o que já está programado, com o selo "versão gratuita" no canto, e parear tela nova passa a pedir assinatura.',
    ];
    botao = 'Ver o plano';
    destino = '/app/?ir=billing';
  } else {
    assunto = 'Seu teste do MultiTelas acabou — a TV continua no ar';
    titulo = 'Seu teste acabou. A TV continua no ar.';
    paragrafos = [
      'A programação segue exibindo, agora com o selo "versão gratuita" no canto da tela.',
      'Assinando o Pro (' + preco + ' por tela, por mês), o selo sai na hora, e voltam a IA com a sua marca, o relatório de exibição e o pareamento de telas novas.',
    ];
    botao = 'Assinar o Pro';
    destino = '/app/?ir=billing';
  }

  const link = appUrl ? appUrl + destino : '';
  const text = titulo + '\n\n' + paragrafos.join('\n\n') + (link ? '\n\n' + botao + ': ' + link : '');
  const html = '<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#0f172a">' +
    '<h1 style="font-size:18px;margin:0 0 12px">' + escapar(titulo) + '</h1>' +
    paragrafos.map((p) => '<p style="font-size:14px;line-height:1.6;margin:0 0 16px;color:#334155">' + escapar(p) + '</p>').join('') +
    (link ? '<p style="margin:8px 0 0"><a href="' + escapar(link) + '" style="display:inline-block;background:#2f6feb;color:#fff;text-decoration:none;font-size:14px;font-weight:600;padding:11px 20px;border-radius:8px">' + escapar(botao) + '</a></p>' : '') +
    '</div>';
  return { subject: assunto, text, html };
}

async function varrer({ db, mail, appUrl, agora }) {
  const t0 = typeof agora === 'number' ? agora : Date.now();
  // Nasceu há até 14 + 3 dias: cobre o "faltam 2" e o "acabou" com folga.
  const contas = await db.contasEmTeste(t0 - (plans.DIAS_DE_TESTE * DIA + JANELA_FIM_MS + DIA));
  let enviados = 0;
  for (const conta of contas) {
    const tipo = decidir(conta, t0);
    if (!tipo) continue;
    const { subject, text, html } = mensagem(tipo, conta, appUrl, t0);
    try {
      await mail.send({ to: conta.email, subject, html, text });
      await db.marcarLembreteTeste(conta.id, tipo);
      enviados++;
    } catch (e) {
      log.aviso('lembrete.envio-falhou', { conta: conta.id, motivo: e.message });
    }
  }
  if (enviados) log.info('lembrete.teste', { enviados });
  return { enviados };
}

function ligar({ db, mail, appUrl }) {
  const passada = () => varrer({ db, mail, appUrl })
    .catch((e) => log.aviso('lembrete.varredura-falhou', { motivo: e.message }));
  const inicio = setTimeout(passada, 2 * 60 * 1000);
  if (inicio.unref) inicio.unref();
  const relogio = setInterval(passada, INTERVALO_MS);
  if (relogio.unref) relogio.unref();
  return () => { clearTimeout(inicio); clearInterval(relogio); };
}

module.exports = { decidir, mensagem, varrer, ligar, JANELA_FIM_MS, INTERVALO_MS };
