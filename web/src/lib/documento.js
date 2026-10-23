/*
 * CPF/CNPJ no painel — o MESMO js/documento.js que o servidor confere antes
 * de mandar ao Asaas, não uma cópia.
 */
import '../../../js/documento.js';

const D = globalThis.MTDocumento;

export default D;
export const { soDigitos, conferir, formatar } = D;
