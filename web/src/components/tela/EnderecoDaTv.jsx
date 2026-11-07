import React from 'react';
import { Check, Copy } from 'lucide-react';
import { Button } from '../ui/Button.jsx';

/*
 * O endereço que se digita NA TV.
 *
 * Antes daqui a instrução era "abra o player com ?cloud=1" — linguagem de
 * quem escreveu o código, dita a quem está de pé com um controle de TV na
 * mão. `/tv` já existia no servidor e ninguém sabia: o caminho curto estava
 * pronto e a instrução continuava mandando digitar um parâmetro de consulta.
 *
 * O endereço é montado a partir de onde o painel está sendo servido, então
 * vale tanto no domínio do cliente quanto numa máquina de teste.
 *
 * Usado por Telas › Ligar uma TV e pelo passo "Ligar a TV" do "Sua primeira
 * TV em 5 minutos" (um lugar só diz como a TV se liga).
 */
export function EnderecoDaTv() {
  const endereco = (typeof window !== 'undefined' ? window.location.origin : '') + '/tv';
  const [copiado, setCopiado] = React.useState(false);
  const copiar = () => {
    if (!navigator.clipboard) return;
    navigator.clipboard.writeText(endereco).then(() => {
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    }).catch(() => {});
  };
  return (
    <div className="rounded-md border border-line bg-surface-2 p-3">
      <div className="text-2xs font-semibold uppercase tracking-wide text-ink-3">1 · Na TV, abra o app MultiTelas TV — ou, no navegador dela, o endereço</div>
      <div className="mt-1.5 flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded border border-line bg-surface px-2 py-1.5 text-sm text-ink">{endereco}</code>
        <Button size="sm" variant="secondary" icon={copiado ? Check : Copy} onClick={copiar}>
          {copiado ? 'Copiado' : 'Copiar'}
        </Button>
      </div>
      <div className="mt-1.5 text-xs text-ink-3">
        A TV vai mostrar um código de 6 letras e números e um QR. Deixe essa tela aberta enquanto você liga a TV aqui.
      </div>
    </div>
  );
}
