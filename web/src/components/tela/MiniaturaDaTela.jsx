import React, { useEffect, useState } from 'react';
import { MonitorPlay } from 'lucide-react';
import { Palco } from '../content/VerTelaAgora.jsx';
import { TvAoVivo } from './TvAoVivo.jsx';
import { telaAgora, deviceConfig } from '../../api.js';

/*
 * A TV em miniatura, com o que ela está mostrando (QA de 26/10: "o que está
 * passando agora em cada TV"). Usa a mesma resposta do "Ver a tela agora":
 * lê a última que a TV mandou e, se a TV está no ar e a resposta é velha,
 * pede uma nova — a TV responde em ~1 s pelo tempo real.
 *
 * Sem resposta (TV nova, fora do ar, sem programação), mostra o recado e a
 * ação que resolve — nunca um quadro vazio sem explicação.
 */
const VELHA_MS = 5 * 60 * 1000;
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

/*
 * Teto de pedidos à TV (revisão do PR #305). Cada pedido é um comando para a
 * TV e várias leituras; uma conta com 50 TVs abrindo Telas e Início
 * algumas vezes estouraria o teto do painel (600 por 5 min, que bloqueia).
 * A mesma TV não é perguntada de novo em 2 minutos, e no máximo 8 TVs por
 * minuto na aba inteira; as outras mostram a última resposta que a TV deu.
 */
const JA_PEDIU_MS = 2 * 60 * 1000;
const MAX_POR_MINUTO = 8;
const pedidos = new Map();
let janela = [];
// `deNovo`: a pessoa acabou de pôr algo nesta TV (fase 7); a TV é perguntada outra vez, ainda dentro das 8 por minuto.
export function podePedir(id, agora = Date.now(), deNovo = false) {
  if (!deNovo && agora - (pedidos.get(id) || 0) < JA_PEDIU_MS) return false;
  janela = janela.filter((t) => agora - t < 60 * 1000);
  if (janela.length >= MAX_POR_MINUTO) return false;
  janela.push(agora);
  pedidos.set(id, agora);
  return true;
}

/*
 * A programação de cada TV, para a miniatura sair com a marca, a logo e o
 * cabeçalho de verdade (fase 10): a resposta da TV diz o que está no ar, a
 * programação diz como a TV desenha. Lida uma vez por versão da TV (o
 * `updatedAt` da lista muda quando alguém põe algo nela).
 */
const programacoes = new Map();
function lerProgramacao(id, versao) {
  const guardada = programacoes.get(id);
  if (guardada && guardada.versao === versao) return guardada.promessa;
  const promessa = deviceConfig.get(id).catch(() => null);
  programacoes.set(id, { versao, promessa });
  if (programacoes.size > 200) programacoes.delete(programacoes.keys().next().value);
  return promessa;
}

/*
 * `altura`: a altura máxima do palco (o cartão usa 220; a página da TV, mais).
 * `pedirDeNovo`: muda quando a página da TV põe algo no ar — a miniatura
 * espera a TV trocar e pergunta de novo, em vez de seguir com a imagem velha.
 */
/*
 * `cfg`: a programação que está na TV, quando quem chama já tem (a página da
 * TV). Sem ela, a miniatura lê a da TV.
 */
export function MiniaturaDaTela({ d, online, vazia, acao, altura = 220, pedirDeNovo = 0, cfg }) {
  const [resposta, setResposta] = useState(null);
  // undefined: lendo; null: não deu para ler (fica o desenho de antes).
  const [lida, setLida] = useState(undefined);
  useEffect(() => {
    if (cfg || vazia) return undefined;
    let vivo = true;
    lerProgramacao(d.id, d.updatedAt || 0).then((c) => { if (vivo) setLida(c); });
    return () => { vivo = false; };
  }, [d.id, d.updatedAt, cfg, vazia]);
  const programacao = cfg || lida;
  // Começa "perguntando": até a primeira leitura voltar, a TV no ar está sendo consultada.
  const [perguntando, setPerguntando] = useState(online && !vazia);

  useEffect(() => {
    let vivo = true;
    (async () => {
      let r = null;
      try { r = await telaAgora.ler(d.id); } catch (e) { r = null; }
      if (!vivo) return;
      if (r && r.estado) setResposta(r);
      const fresca = r && r.estado && Date.now() - r.em < VELHA_MS && !pedirDeNovo;
      if (!online || vazia || fresca || !podePedir(d.id, Date.now(), !!pedirDeNovo)) { setPerguntando(false); return; }
      setPerguntando(true);
      // A TV recebe a programação nova pelo tempo real em ~1 s: perguntar antes traria a de antes.
      if (pedirDeNovo) await dormir(2500);
      if (!vivo) return;
      try { await telaAgora.pedir(d.id); } catch (e) { if (vivo) setPerguntando(false); return; }
      const antes = (r && r.em) || 0;
      for (let i = 0; i < 4 && vivo; i++) {
        await dormir(1500);
        let n = null;
        try { n = await telaAgora.ler(d.id); } catch (e) { n = null; }
        if (vivo && n && n.estado && n.em > antes) { setResposta(n); break; }
      }
      if (vivo) setPerguntando(false);
    })();
    return () => { vivo = false; };
  }, [d.id, online, vazia, d.updatedAt, pedirDeNovo]);

  if (resposta && resposta.estado && !vazia) {
    /*
     * Imagem que não é de agora diz de quando é, em vez de passar por "agora":
     * fora do ar, apagada e com "Última imagem"; no ar mas velha (a TV não foi
     * perguntada de novo por causa do teto), com "Visto às".
     */
    const quando = resposta.em ? new Date(resposta.em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
    const velha = !resposta.em || Date.now() - resposta.em > VELHA_MS;
    const selo = !online ? 'Última imagem · ' + quando : velha && quando ? 'Visto em ' + quando : '';
    return (
      <div className="pointer-events-none relative w-full" aria-label={(selo ? selo + ' · ' : 'O que está passando agora · ') + (d.name || '')}>
        <div className={!online ? 'opacity-50 grayscale' : ''}>
          {/* A TV de verdade (o player num quadro); sem a programação ainda, o desenho de antes. */}
          {programacao === undefined ? <div className="aspect-video w-full rounded-lg bg-surface-2" />
            : programacao
            ? <TvAoVivo cfg={programacao} estado={resposta.estado} alturaMaxima={altura} leve={altura <= 240} rotulo={'O que passa agora em ' + (d.name || 'esta TV')} />
            : <Palco estado={resposta.estado} alturaMaxima={altura} />}
        </div>
        {selo && <span className="absolute bottom-2 right-2 rounded-full bg-black/70 px-2 py-0.5 text-xs font-medium text-white">{selo}</span>}
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center gap-2 px-4 text-center">
      <MonitorPlay size={26} className={online ? 'text-accent' : 'text-ink-3'} />
      <span className="text-sm font-medium text-ink-2">
        {vazia ? 'Nada passando nesta TV ainda' : !online ? 'Sem imagem: a TV está fora do ar'
          : perguntando ? 'Perguntando à TV o que está passando…' : 'Ainda sem imagem desta TV'}
      </span>
      {acao}
    </div>
  );
}
