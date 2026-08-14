import React from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '../ui/Button.jsx';

/*
 * A rede embaixo do trapézio.
 *
 * O editor entra por `import()`. Quando esse download falha, a promessa
 * rejeita, o React desmonta a árvore inteira e a pessoa fica olhando uma tela
 * branca — sem mensagem, sem botão, sem nada em que clicar. Um `<Suspense>`
 * sozinho não cobre isso: ele trata a ESPERA, não a falha.
 *
 * Falha acontece por dois motivos bem comuns, e nenhum deles é bug:
 *
 *   1. Sem internet, num pacote que ainda não estava guardado.
 *   2. Um deploy no meio da sessão. Os nomes dos pacotes têm hash; a aba
 *      aberta continua pedindo os nomes velhos, que já não existem no
 *      servidor. É a causa clássica de "abriu branco do nada".
 *
 * Nos dois, o conserto é o mesmo — recarregar — e o certo é dizer isso em
 * vez de deixar a pessoa achar que perdeu o trabalho.
 */
export class LimiteDeErro extends React.Component {
  constructor(props) {
    super(props);
    this.state = { erro: null };
  }

  static getDerivedStateFromError(erro) {
    return { erro };
  }

  componentDidCatch(erro) {
    console.warn('[painel] tela não carregou:', erro && erro.message);
  }

  render() {
    if (!this.state.erro) return this.props.children;

    const semRede = navigator.onLine === false;
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 p-8 text-center">
        <div>
          <h2 className="text-base font-semibold text-ink">
            {semRede ? 'Esta parte precisa de internet' : 'Esta tela não abriu'}
          </h2>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-ink-2">
            {semRede
              ? 'O editor ainda não tinha sido baixado neste aparelho. Assim que a conexão voltar, ele abre normalmente.'
              : 'Costuma ser uma versão nova publicada enquanto esta aba estava aberta. Recarregar resolve.'}
            {' '}
            <span className="font-medium text-ink">Nada do que você publicou foi perdido</span> — e as telas
            continuam exibindo.
          </p>
        </div>
        <Button variant="primary" icon={RefreshCw} onClick={() => window.location.reload()}>
          Recarregar
        </Button>
      </div>
    );
  }
}
