import React, { useEffect, useMemo, useState } from 'react';
import { MonitorPlay, CalendarDays, Table2, UserPlus, Hourglass, Home } from 'lucide-react';
import { TituloDoPasso, RodapeDoPasso, Escolha, Erro } from './MolduraDoPasso.jsx';
import { LigarTv } from './PassoTv.jsx';
import { TvAoVivo } from '../tela/TvAoVivo.jsx';
import { deviceConfig } from '../../api.js';
import { aplicarHorario, configDaTela } from '../../lib/primeiraTv.js';

/*
 * Passo 7 · Pôr na TV: um botão violeta. Antes, a TV desenhada como vai
 * ficar; depois, a TV de verdade ("Na TV agora", o mesmo quadro da página
 * da TV) e os três próximos passos. Com a aprovação ligada, o membro PEDE:
 * o botão diz "Pedir para pôr na TV" e o fim diz que espera o dono.
 * A TV que ficou para depois é ligada aqui mesmo, antes do botão.
 */
export function PassoPronto({ opcao, horario, frente, nomeDaConta, tv, podeLigar, precisaAprovar, souRevisor, resultado, onLigada, onPorNaTv, onIr, onInicio, onIrParaPlano }) {
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');
  const [naTv, setNaTv] = useState(null);
  const final = useMemo(() => (opcao ? aplicarHorario(opcao.montada, horario, frente) : null), [opcao, horario, frente]);
  const comoVaiFicar = useMemo(() => (final ? configDaTela(final, nomeDaConta) : null), [final, nomeDaConta]);

  // Foi para a TV: o quadro mostra a programação que a TV recebeu (com o horário e o nome da conta que o servidor põe).
  useEffect(() => {
    if (!resultado || resultado.pendente || !tv) return;
    deviceConfig.ler(tv.id).then((r) => setNaTv(r.config || null)).catch(() => setNaTv(null));
  }, [resultado, tv && tv.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function por() {
    setEnviando(true); setErro('');
    try { await onPorNaTv(); }
    catch (e) { setErro(e.message || 'Não deu para pôr na TV. Tente de novo.'); }
    finally { setEnviando(false); }
  }

  if (resultado) {
    const proximos = [
      { id: 'agenda', icone: CalendarDays, titulo: 'Agenda', detalhe: 'Datas e avisos que entram e saem sozinhos', on: () => onIr('calendario') },
      { id: 'planilha', icone: Table2, titulo: 'Planilha de preços', detalhe: 'O preço muda na planilha e a TV muda junto', on: () => onIr('planilhas') },
      souRevisor
        ? { id: 'convidar', icone: UserPlus, titulo: 'Convidar alguém', detalhe: 'Para cuidar da TV com você', on: () => onIr('team', { convidar: true }) }
        : { id: 'pedidos', icone: Hourglass, titulo: 'Meus pedidos', detalhe: 'O que espera a aprovação do dono', on: () => onIr('aprovacoes') },
    ];
    return (
      <>
        <TituloDoPasso titulo={resultado.pendente ? 'Pedido mandado!' : 'Pronto! Está na TV.'}
          frase={resultado.pendente ? 'A tela vai para a TV quando o dono da conta aprovar.' : 'Dá para mudar tudo depois em Telas.'} />
        <TvAoVivo cfg={(!resultado.pendente && naTv) || comoVaiFicar} alturaMaxima={300} rotulo={resultado.pendente ? 'Como vai ficar' : 'Na TV agora'} />
        <p className="mt-1.5 text-center text-xs text-ink-3">{resultado.pendente ? 'Como vai ficar' : 'Na TV agora'}</p>
        <h2 className="mb-2 mt-6 text-lg font-semibold text-ink">E depois?</h2>
        <div className="space-y-2.5">
          {proximos.map((p) => <Escolha key={p.id} icone={p.icone} titulo={p.titulo} detalhe={p.detalhe} onClick={p.on} />)}
        </div>
        <RodapeDoPasso principal={{ rotulo: 'Ir para o Início', icone: Home, onClick: onInicio }} />
      </>
    );
  }

  if (!tv) {
    if (!podeLigar) {
      return (
        <>
          <TituloDoPasso titulo="Tudo pronto" frase="Falta a TV: quem liga uma TV nova é o dono da conta. Quando ela estiver ligada, volte aqui e toque em Pôr na TV." />
          <RodapeDoPasso principal={{ rotulo: 'Ir para o Início', icone: Home, onClick: onInicio }} />
        </>
      );
    }
    return (
      <>
        <TituloDoPasso titulo="Falta ligar a TV" frase="A tela está pronta. Ligue a TV para ela ir para lá." />
        <LigarTv onLigada={onLigada} onIrParaPlano={onIrParaPlano} secundario={{ rotulo: 'Fazer isso depois', onClick: onInicio }} />
      </>
    );
  }

  return (
    <>
      <TituloDoPasso titulo="Tudo pronto!" frase={precisaAprovar ? 'Confira. O dono da conta aprova antes de ir para a TV.' : 'Confira e ponha na TV ' + (tv.name ? '“' + tv.name + '”' : '') + '.'} />
      {comoVaiFicar && <TvAoVivo cfg={comoVaiFicar} alturaMaxima={320} rotulo="Como vai ficar" />}
      <p className="mt-1.5 text-center text-xs text-ink-3">Como vai ficar</p>
      <Erro>{erro}</Erro>
      <RodapeDoPasso principal={{ rotulo: precisaAprovar ? 'Pedir para pôr na TV' : 'Pôr na TV', icone: MonitorPlay, onClick: por, ocupado: enviando, disabled: !final }} />
    </>
  );
}
