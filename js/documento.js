/*
 * js/documento.js — CPF ou CNPJ de quem paga, conferido pelos dígitos.
 *
 * O Asaas não emite assinatura nem cobrança para cliente sem CPF/CNPJ, e o
 * cliente era criado sem: todo "Assinar" em produção respondia 502 e o
 * painel mostrava o erro no topo da página, longe do botão (EXECUTOR D0.8).
 * O painel pergunta o documento antes; o servidor confere de novo, com a
 * mesma regra, antes de mandar ao Asaas.
 *
 * O documento NÃO é guardado no nosso banco: vai direto para o cadastro do
 * cliente no Asaas, que precisa dele para emitir a nota. Guardar aqui seria
 * acumular dado pessoal sem uso nosso (LGPD, minimização).
 *
 * Módulo duplo: require() no Node, MTDocumento no navegador.
 */
(function (raiz, fabrica) {
  var api = fabrica();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (raiz) raiz.MTDocumento = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function soDigitos(v) { return String(v == null ? '' : v).replace(/\D+/g, ''); }

  // Todos os dígitos iguais passam na conta, mas não existem (000.000.000-00).
  function repetido(d) { return /^(\d)\1+$/.test(d); }

  function cpfValido(d) {
    if (d.length !== 11 || repetido(d)) return false;
    for (var n = 9; n < 11; n++) {
      var soma = 0;
      for (var i = 0; i < n; i++) soma += Number(d[i]) * (n + 1 - i);
      var dv = (soma * 10) % 11 % 10;
      if (dv !== Number(d[n])) return false;
    }
    return true;
  }

  function cnpjValido(d) {
    if (d.length !== 14 || repetido(d)) return false;
    var pesos = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    for (var n = 12; n < 14; n++) {
      var soma = 0;
      for (var i = 0; i < n; i++) soma += Number(d[i]) * pesos[i + 13 - n];
      var resto = soma % 11;
      var dv = resto < 2 ? 0 : 11 - resto;
      if (dv !== Number(d[n])) return false;
    }
    return true;
  }

  /*
   * { ok, tipo: 'cpf'|'cnpj'|'', digitos, erro }. O erro é a frase que a
   * pessoa lê embaixo do campo.
   */
  function conferir(v) {
    var d = soDigitos(v);
    if (!d) return { ok: false, tipo: '', digitos: '', erro: 'Digite o CPF ou o CNPJ de quem paga.' };
    if (d.length === 11) return cpfValido(d) ? { ok: true, tipo: 'cpf', digitos: d, erro: '' } : { ok: false, tipo: 'cpf', digitos: d, erro: 'Esse CPF não existe. Confira os números.' };
    if (d.length === 14) return cnpjValido(d) ? { ok: true, tipo: 'cnpj', digitos: d, erro: '' } : { ok: false, tipo: 'cnpj', digitos: d, erro: 'Esse CNPJ não existe. Confira os números.' };
    return { ok: false, tipo: '', digitos: d, erro: 'O CPF tem 11 números e o CNPJ, 14.' };
  }

  // 12345678909 → 123.456.789-09 · 11222333000181 → 11.222.333/0001-81 (enquanto digita).
  function formatar(v) {
    var d = soDigitos(v).slice(0, 14);
    if (d.length <= 11) {
      return d.replace(/^(\d{3})(\d)/, '$1.$2').replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d{1,2})$/, '.$1-$2');
    }
    return d.replace(/^(\d{2})(\d)/, '$1.$2').replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
      .replace(/\.(\d{3})(\d)/, '.$1/$2').replace(/(\d{4})(\d{1,2})$/, '$1-$2');
  }

  return { soDigitos: soDigitos, conferir: conferir, formatar: formatar, cpfValido: cpfValido, cnpjValido: cnpjValido };
});
