/*
 * js/modelos.js — peças de partida.
 *
 * Uma tela em branco é o pior lugar para começar. Quem abre o editor pela
 * primeira vez sabe o que quer dizer ("promoção de terça", "bem-vindo, fulano")
 * e não faz ideia de onde pôr, de que tamanho, em que cor — e o resultado é uma
 * peça com um texto no meio, que é exatamente o que não se quer numa parede.
 *
 * Duas escolhas fazem estes modelos valerem mais do que uma galeria comum:
 *
 * 1. NASCEM NA COR DA EMPRESA. Recebem a paleta da marca e devolvem a peça já
 *    pintada. Modelo genérico é lindo na galeria e some no primeiro uso, porque
 *    a primeira coisa que a pessoa faz é trocar tudo de cor — e trocar cor de
 *    seis elementos à mão é o momento em que ela desiste.
 *
 * 2. SÃO CALCULADOS PARA O FORMATO. A mesma peça em 16/9 e em 9/16 não é a
 *    mesma peça: `x` e `w` são % da LARGURA e `y` e `h` são % da ALTURA, então
 *    uma faixa que ocupa um terço da tela deitada ocupa um sexto da tela em pé.
 *    E o corpo do texto é medido em cqw, que numa peça estreita vale bem menos
 *    pixel. Cada modelo é uma função do formato, e não um JSON fixo.
 *
 * Sem dependência de DOM: dá para testar cada modelo em qualquer formato sem
 * abrir navegador.
 */
(function (raiz, fabrica) {
  /*
   * As medidas de cada família (largura de caractere, entrelinha) vêm de
   * js/fontes.js. No Node, pedimos aqui para não depender de quem carregou
   * primeiro — sem isto, o mesmo modelo saía com corpo diferente conforme a
   * ordem dos testes. No navegador, o catálogo já está no global.
   */
  if (typeof module === 'object' && module.exports) require('./fontes.js');
  var api = fabrica();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (raiz) raiz.MTModelos = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /* A proporção largura/altura da peça. */
  function razao(formato) {
    var p = String(formato || '16/9').split('/').map(Number);
    return (p[0] && p[1]) ? p[0] / p[1] : 16 / 9;
  }

  /*
   * Uma regra que vale para o arquivo inteiro: `x` e `w` são % da LARGURA,
   * `y` e `h` são % da ALTURA. E cada eixo é usado COMO ELE É — uma faixa que
   * ocupa o terço de cima ocupa o terço de cima em qualquer formato, que é o
   * que se quer de um layout.
   *
   * A primeira versão convertia as medidas verticais multiplicando pela
   * proporção, como se fossem larguras. Em 16/9 quase não se notava; em 21/9
   * o texto saía pela base da peça. `quadrado` existe para o único caso em que
   * a conversão é mesmo necessária: um elemento que precisa ficar redondo, ou
   * tão alto quanto largo.
   */
  function quadrado(larguraPct, formato) { return larguraPct * razao(formato); }

  /*
   * Escala do corpo de texto por formato. Uma peça em pé é estreita: o mesmo
   * cqw resulta em letra menor na prática, e sem este fator o título de uma
   * peça 9/16 sai tímido — que é o oposto do que um cartaz precisa.
   */
  function escala(formato) {
    var r = razao(formato);
    return r >= 2 ? 0.8 : r >= 1 ? 1 : 1.7;
  }

  /*
   * Margem de segurança. A TV corta as bordas, e texto encostado na borda some
   * numa parte das telas — justamente naquelas em que ninguém vai conferir.
   */
  function margem(formato) {
    var r = razao(formato);
    return { x: r >= 2 ? 5 : 7, y: r >= 1 ? 7 : 5 };
  }

  /* Paleta a partir da marca, com o mínimo de suposição. */
  function paleta(cores) {
    var c = Array.isArray(cores) ? cores.filter(Boolean) : [];
    var marca = c[0] || '#2f6feb';
    var apoio = c[1] || marca;
    return {
      marca: marca,
      apoio: apoio,
      fundo: escurecer(marca, 0.86),
      fundoAlt: escurecer(marca, 0.72),
      texto: '#ffffff',
      // Sobre a cor da marca, um creme lê melhor que branco puro: branco puro
      // "vibra" em fundo saturado numa tela grande.
      textoNaMarca: claro(marca) ? escurecer(marca, 0.8) : '#fff6e6',
    };
  }
  function hexRgb(h) {
    var s = String(h || '').replace('#', '');
    if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
    var n = parseInt(s, 16);
    return isFinite(n) ? [(n >> 16) & 255, (n >> 8) & 255, n & 255] : [47, 111, 235];
  }
  function rgbHex(r) {
    return '#' + r.map(function (v) {
      var x = Math.max(0, Math.min(255, Math.round(v))).toString(16);
      return x.length < 2 ? '0' + x : x;
    }).join('');
  }
  function escurecer(hex, q) { return rgbHex(hexRgb(hex).map(function (v) { return v * (1 - q); })); }
  function claro(hex) {
    var r = hexRgb(hex);
    return (r[0] * 0.299 + r[1] * 0.587 + r[2] * 0.114) / 255 > 0.6;
  }

  var z = 0;
  function el(o) { z += 1; return Object.assign({ z: z, rot: 0, opacidade: 1 }, o); }
  function texto(o) { return el(Object.assign({ tipo: 'texto', fonte: 'sans', peso: 800, align: 'center', cor: '#ffffff' }, o)); }
  function forma(o) { return el(Object.assign({ tipo: 'forma', shape: 'rect', radius: 0 }, o)); }
  function icone(o) { return el(Object.assign({ tipo: 'icone', name: 'star', peso: 1.6 }, o)); }

  /* ---------------- Os modelos ---------------- */

  /*
   * Cada um recebe (formato, paleta) e devolve { bg, elementos }. O texto vem
   * com um exemplo do que escrever ali, e não "Texto": ver "SEGUNDA A SEXTA,
   * 8h ÀS 18h" no lugar ensina o que aquele bloco é, o que "Texto" nunca faz.
   */
  var MODELOS = [
    {
      id: 'aviso',
      nome: 'Aviso',
      para: 'Recado curto que todo mundo precisa ler.',
      montar: function (f, p) {
        var m = margem(f);
        var k = escala(f);
        return {
          bg: { kind: 'cor', cor: 'linear-gradient(150deg, ' + p.fundo + ', ' + p.fundoAlt + ')' },
          elementos: [
            forma({ x: m.x, y: m.x, w: 8, h: 1.2, fill: p.marca, radius: 40 }),
            texto({ text: 'COMUNICADO', x: m.x, y: m.x + 3, w: 100 - m.x * 2, h: 4, tamanho: 2.6 * k, peso: 700, align: 'left', cor: p.marca, espacamento: 0.18 }),
            texto({ text: 'O refeitório funciona\nem horário estendido', x: m.x, y: m.x + 8, w: 100 - m.x * 2, h: 22, tamanho: 8 * k, peso: 900, align: 'left', fonte: 'condensada' }),
            texto({ text: 'Segunda a sexta, das 8h às 18h', x: m.x, y: 100 - m.y - 6, w: 100 - m.x * 2, h: 5, tamanho: 3 * k, peso: 500, align: 'left', cor: p.apoio }),
          ],
        };
      },
    },
    {
      id: 'promocao',
      nome: 'Promoção',
      para: 'Preço em destaque, do jeito que vende.',
      montar: function (f, p) {
        var m = margem(f);
        var k = escala(f);
        return {
          bg: { kind: 'cor', cor: p.marca },
          elementos: [
            texto({ text: 'OFERTA DA SEMANA', x: m.x, y: m.x + 2, w: 100 - m.x * 2, h: 5, tamanho: 3 * k, peso: 700, cor: p.textoNaMarca, espacamento: 0.22 }),
            texto({ text: 'R$ 19,90', x: m.x, y: m.x + 10, w: 100 - m.x * 2, h: 26, tamanho: 16 * k, peso: 900, fonte: 'display', cor: p.textoNaMarca }),
            forma({ x: 30, y: 100 - m.y - 9, w: 40, h: 7, fill: p.textoNaMarca, radius: 50 }),
            texto({ text: 'PEÇA NO BALCÃO', x: 30, y: 100 - m.y - 7.4, w: 40, h: 4, tamanho: 2.8 * k, peso: 800, cor: p.marca }),
          ],
        };
      },
    },
    {
      id: 'boas-vindas',
      nome: 'Boas-vindas',
      para: 'Receber uma visita pelo nome.',
      montar: function (f, p) {
        var m = margem(f);
        var k = escala(f);
        return {
          bg: { kind: 'cor', cor: 'linear-gradient(150deg, ' + p.fundo + ', ' + p.fundoAlt + ')' },
          elementos: [
            texto({ text: 'Bem-vindo,', x: 10, y: 22, w: 80, h: 8, tamanho: 5 * k, peso: 400, fonte: 'serifada', cor: p.apoio }),
            texto({ text: 'Fulano de Tal', x: 10, y: 30, w: 80, h: 14, tamanho: 9 * k, peso: 700, fonte: 'script' }),
            forma({ x: 42, y: 46, w: 16, h: 0.5, fill: p.marca, radius: 40 }),
            texto({ text: 'É um prazer receber você', x: 10, y: 100 - m.y - 7, w: 80, h: 5, tamanho: 2.8 * k, peso: 500, cor: p.apoio }),
          ],
        };
      },
    },
    {
      id: 'evento',
      nome: 'Evento',
      para: 'Data, hora e lugar, sem ninguém perguntar.',
      montar: function (f, p) {
        var m = margem(f);
        var k = escala(f);
        return {
          bg: { kind: 'cor', cor: 'linear-gradient(150deg, ' + p.fundo + ', ' + p.fundoAlt + ')' },
          elementos: [
            forma({ x: 0, y: 0, w: 100, h: 3, fill: p.marca }),
            icone({ name: 'calendar', x: 46, y: 14, w: 8, h: quadrado(8, f), cor: p.marca }),
            texto({ text: 'CONFRATERNIZAÇÃO', x: 8, y: 26, w: 84, h: 16, tamanho: 8 * k, peso: 900, fonte: 'condensada' }),
            texto({ text: '20 de dezembro · 19h', x: 8, y: 44, w: 84, h: 6, tamanho: 4 * k, peso: 700, cor: p.marca }),
            texto({ text: 'Salão de eventos · 3º andar', x: 8, y: 100 - m.y - 7, w: 84, h: 5, tamanho: 2.8 * k, peso: 500, cor: p.apoio }),
          ],
        };
      },
    },
    {
      id: 'numero',
      nome: 'Número em destaque',
      para: 'Um indicador que a equipe acompanha.',
      montar: function (f, p) {
        var m = margem(f);
        var k = escala(f);
        return {
          bg: { kind: 'cor', cor: 'linear-gradient(150deg, ' + p.fundo + ', ' + p.fundoAlt + ')' },
          elementos: [
            texto({ text: 'DIAS SEM ACIDENTES', x: 8, y: 18, w: 84, h: 5, tamanho: 3 * k, peso: 700, cor: p.apoio, espacamento: 0.2 }),
            texto({ text: '127', x: 8, y: 26, w: 84, h: 28, tamanho: 22 * k, peso: 900, fonte: 'display', cor: p.marca }),
            texto({ text: 'Nosso recorde é 180. Falta pouco.', x: 8, y: 100 - m.y - 7, w: 84, h: 5, tamanho: 2.8 * k, peso: 500, cor: p.apoio }),
          ],
        };
      },
    },
    {
      id: 'frase',
      nome: 'Frase do dia',
      para: 'Uma frase que fica bem numa parede.',
      montar: function (f, p) {
        var k = escala(f);
        return {
          bg: { kind: 'cor', cor: p.fundo },
          elementos: [
            texto({ text: '"', x: 8, y: 14, w: 20, h: 14, tamanho: 16 * k, peso: 900, fonte: 'serifada', align: 'left', cor: p.marca, opacidade: 0.5 }),
            texto({ text: 'Feito é melhor\nque perfeito.', x: 12, y: 26, w: 76, h: 24, tamanho: 7 * k, peso: 400, fonte: 'serifada', italico: true, align: 'left' }),
            texto({ text: '— Sheryl Sandberg', x: 12, y: 54, w: 76, h: 5, tamanho: 2.8 * k, peso: 600, align: 'left', cor: p.apoio }),
          ],
        };
      },
    },
    {
      id: 'foto-faixa',
      nome: 'Foto com faixa',
      para: 'Sua imagem no fundo, recado na faixa.',
      montar: function (f, p) {
        var k = escala(f);
        var altura = 14;
        return {
          bg: { kind: 'cor', cor: p.fundo },
          elementos: [
            forma({ x: 0, y: 100 - altura - 2, w: 100, h: altura + 2, fill: { grad: 'linear', ang: 0, cores: [p.marca, p.fundo] }, opacidade: 0.92 }),
            texto({ text: 'NOSSA NOVA LOJA', x: 6, y: 100 - altura, w: 88, h: 7, tamanho: 5.5 * k, peso: 900, align: 'left', fonte: 'condensada' }),
            texto({ text: 'Avenida Central, 1200 — inauguração sábado', x: 6, y: 100 - altura + 7, w: 88, h: 4.5, tamanho: 2.6 * k, peso: 500, align: 'left', cor: p.textoNaMarca }),
          ],
          dica: 'Troque o fundo por uma foto: o degradê já escurece a base para o texto continuar legível.',
        };
      },
    },
    {
      id: 'lista',
      nome: 'Lista de três',
      para: 'Três itens lado a lado — regras, etapas, benefícios.',
      montar: function (f, p) {
        var k = escala(f);
        var emPe = razao(f) < 1;
        var itens = ['Use o crachá', 'Bata o ponto', 'Fale com o RH'];
        var els = [
          texto({ text: 'ANTES DE COMEÇAR', x: 6, y: 10, w: 88, h: 6, tamanho: 3.4 * k, peso: 800, cor: p.marca, espacamento: 0.18 }),
        ];
        itens.forEach(function (t, i) {
          // Em pé, empilha; deitada, lado a lado. A mesma lista nos dois
          // formatos só funciona se ela mudar de arranjo junto com a peça.
          var x = emPe ? 12 : 6 + i * 30.7;
          var y = emPe ? 22 + i * 9 : 26;
          var w = emPe ? 76 : 28;
          els.push(forma({ x: x, y: y, w: emPe ? 7 : 6, h: quadrado(emPe ? 7 : 6, f), fill: p.marca, radius: 50 }));
          els.push(texto({ text: String(i + 1), x: x, y: y + emPe ? 1.4 : 1.2, w: emPe ? 7 : 6, h: 4, tamanho: 3 * k, peso: 900, cor: p.textoNaMarca }));
          els.push(texto({
            text: t,
            x: emPe ? x + 10 : x, y: emPe ? y + quadrado(1.6, f) : y + quadrado(emPe ? 7 : 6, f) + 2,
            w: emPe ? w - 10 : w, h: 6,
            tamanho: 3.2 * k, peso: 700, align: 'left',
          }));
        });
        return { bg: { kind: 'cor', cor: 'linear-gradient(150deg, ' + p.fundo + ', ' + p.fundoAlt + ')' }, elementos: els };
      },
    },
  ];


  /* ---------------- O texto tem que caber ---------------- */

  /*
   * Um modelo é escrito com a caixa e o corpo que o desenho pede. Só que o
   * corpo é medido em cqw (% da LARGURA) e a caixa em % da altura: em 21/9 a
   * mesma linha ocupa mais que o dobro da altura que ocupa em 9/16. Escrever
   * os dois à mão para quatro formatos é errar em pelo menos um.
   *
   * Então o corpo se ajusta à caixa, aqui, num lugar só — e um modelo novo
   * ganha isso de graça. Encolher o texto é preferível a crescer a caixa: a
   * caixa cresceria por cima do elemento de baixo, e um cartaz com dois textos
   * sobrepostos é pior do que um cartaz com o título um pouco menor.
   *
   * Foi medido no navegador, e não deduzido: 22 dos textos dos modelos saíam
   * cortados pela altura da própria caixa.
   */
  function larguraCaractere(fonte) {
    var F = raizGlobal() && raizGlobal().MTFontes;
    if (F && F.larguraCaractere) return F.larguraCaractere(fonte);
    return 0.58;   // conservador: mais largo que quase toda família
  }
  function entrelinha(fonte) {
    var F = raizGlobal() && raizGlobal().MTFontes;
    if (F && F.dados) return F.dados(fonte).entrelinha;
    return 1.1;
  }
  function raizGlobal() { return typeof globalThis !== 'undefined' ? globalThis : null; }

  function linhasDe(txt, larguraCaixa, corpo, fonte, caixaAlta) {
    /*
     * MAIÚSCULA é mais larga. A tabela de larguras é a média de um texto
     * normal, e um título todo em caixa alta ocupa bem mais — foi o que fez
     * "CONFRATERNIZAÇÃO" sair 106px numa caixa de 96px, mesmo depois de
     * ajustado. O fator saiu de medir no navegador, não de deduzir; e ele erra
     * de propósito para o lado seguro, porque um título 8% menor ninguém nota
     * e um título cortado todo mundo nota.
     */
    var alta = caixaAlta || (raizGlobal().MTFontes && raizGlobal().MTFontes.dados(fonte).caixaAlta);
    var largura = larguraCaractere(fonte) * (alta ? 1.25 : 1);
    var porLinha = Math.max(1, Math.floor(larguraCaixa / (corpo * largura)));
    return String(txt || '').split('\n').reduce(function (n, linha) {
      return n + Math.max(1, Math.ceil(linha.length / porLinha));
    }, 0);
  }

  function ajustarTextos(els, formato) {
    var R = razao(formato);
    return els.map(function (e) {
      if (e.tipo !== 'texto') return e;
      var corpo = e.tamanho;
      var el = entrelinha(e.fonte);
      for (var i = 0; i < 30; i++) {
        // Altura ocupada, em % da ALTURA da peça: 1 cqw vale `R` por cento dela.
        var linhas = linhasDe(e.text, e.w, corpo, e.fonte, e.caixaAlta);
        var alto = linhas * corpo * R * el;
        // Uma linha só não pode ser mais larga que a caixa: nesse caso ela não
        // quebra, ela é CORTADA nas laterais.
        // 3% de folga: uma linha que termina exatamente na borda da caixa é
        // cortada por arredondamento de pixel na hora de desenhar.
        var util = e.w * 0.97;
        var larga = linhas === 1 && String(e.text).indexOf('\n') < 0
          && String(e.text).length * corpo * larguraCaractere(e.fonte)
             * ((e.caixaAlta || (raizGlobal().MTFontes && raizGlobal().MTFontes.dados(e.fonte).caixaAlta)) ? 1.25 : 1) > util;
        if (alto <= e.h && !larga) break;
        corpo *= 0.93;
      }
      if (corpo === e.tamanho) return e;
      /*
       * Arredonda para BAIXO. Arredondar ao mais próximo chegou a devolver um
       * corpo MAIOR que o conferido — 12.3039 cabia numa linha e 12.31 quebrava
       * em duas — e o texto voltava a estourar a caixa depois de ajustado.
       */
      return Object.assign({}, e, { tamanho: Math.floor(corpo * 100) / 100 });
    });
  }

  /* ---------------- API ---------------- */

  function listar() {
    return MODELOS.map(function (m) { return { id: m.id, nome: m.nome, para: m.para }; });
  }

  /*
   * Monta a peça. `duracao` fica em 12s, que é o tempo em que alguém de pé
   * numa recepção lê um recado curto sem correr.
   */
  function montar(id, formato, cores) {
    var m = MODELOS.find(function (x) { return x.id === id; });
    if (!m) return null;
    z = 0;
    var fora = m.montar(formato || '16/9', paleta(cores));
    return {
      type: 'composicao',
      formato: formato || '16/9',
      duracao: 12,
      bg: fora.bg,
      elementos: ajustarTextos(fora.elementos, formato || '16/9'),
      dica: fora.dica || '',
    };
  }

  return { listar: listar, montar: montar, MODELOS: MODELOS, paleta: paleta, razao: razao, escala: escala, margem: margem, ajustarTextos: ajustarTextos, linhasDe: linhasDe };
});
