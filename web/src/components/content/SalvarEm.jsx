import React, { useEffect, useState } from 'react';
import { Check, FolderPlus, FolderOpen } from 'lucide-react';
import { Dialog } from '../ui/Dialog.jsx';
import { Button } from '../ui/Button.jsx';
import { Field, Input, Select } from '../ui/Field.jsx';
import { DesignThumb } from './DesignThumb.jsx';

/*
 * "Ficou pronto — onde isto vai ficar?"
 *
 * Um só diálogo para tudo que a conta cria: peça feita na mão, imagem da IA,
 * arquivo importado. Antes cada caminho montava o seu, e os três erravam a
 * mesma coisa: o campo de pasta vinha PREENCHIDO com a primeira campanha que
 * existisse na conta. Uma imagem de IA caía dentro de "Natal 2025" porque
 * "Natal 2025" era a primeira da lista — e ninguém percebia até procurar.
 *
 * Aqui a escolha é explícita e tem duas portas do mesmo tamanho: guardar numa
 * pasta que já existe, ou CRIAR UMA. Criar pasta deixou de ser um segredo de
 * quem descobre que o campo aceita texto livre.
 *
 * Conta nova não tem pasta nenhuma: nesse caso só existe a porta de criar, já
 * com um nome sugerido, e não há escolha a fazer.
 */
export function SalvarEm({
  aberto, onFechar, onSalvar, item, pastas = [], ocupado,
  titulo = 'Salvar design',
  descricao = 'Dê um nome e escolha onde ele fica.',
  nomeSugerido = '',
  pastaSugerida = '',
  padraoNova = 'Meus Designs',
}) {
  const [nome, setNome] = useState('');
  const [modo, setModo] = useState('existente');   // 'existente' | 'nova'
  const [existente, setExistente] = useState('');
  const [nova, setNova] = useState('');

  /*
   * Reabrir o diálogo tem que recomeçar do sugerido. Sem isto, salvar uma
   * imagem em "Verão" e gerar outra logo depois traria "Verão" de volta como
   * se fosse escolha nova — e a segunda imagem cairia lá sem ninguém decidir.
   */
  const chavePastas = pastas.join(' ');
  useEffect(() => {
    if (!aberto) return;
    setNome(nomeSugerido);

    /*
     * A sugestão de pasta significa "é aqui que isto pertence" — a imagem da
     * IA sugere "Imagens da IA", o arquivo importado sugere "Importados".
     * Se essa pasta JÁ EXISTE, o certo é usá-la, não criar uma segunda com o
     * mesmo nome. Se não existe, a porta certa é a de criar, já preenchida.
     *
     * Sem sugestão (é o caso de quem acabou de desenhar à mão), quem tem
     * pastas escolhe entre elas: abrir em "criar" faria a conta juntar um
     * monte de "Meus Designs" ao lado das pastas de verdade.
     */
    const jaExiste = !!pastaSugerida && pastas.includes(pastaSugerida);
    const criar = pastas.length === 0 || (!!pastaSugerida && !jaExiste);
    setModo(criar ? 'nova' : 'existente');
    setExistente(jaExiste ? pastaSugerida : (pastas[0] || ''));
    setNova(criar ? (pastaSugerida || padraoNova) : '');
  }, [aberto, nomeSugerido, pastaSugerida, padraoNova, chavePastas]);

  const pastaEscolhida = (modo === 'nova' ? nova : existente).trim();
  const podeSalvar = !ocupado && !!pastaEscolhida;

  function salvar() {
    if (!podeSalvar) return;
    onSalvar({ nome: nome.trim() || nomeSugerido || 'Design', pasta: pastaEscolhida });
  }

  return (
    <Dialog open={aberto} onClose={onFechar} title={titulo} description={descricao}
      footer={<>
        <Button variant="ghost" onClick={onFechar}>Cancelar</Button>
        <Button variant="primary" icon={Check} disabled={!podeSalvar} onClick={salvar}>
          {ocupado ? 'Salvando…' : 'Salvar'}
        </Button>
      </>}>
      {item && <div className="mb-3"><DesignThumb item={item} /></div>}

      <Field label="Nome">
        <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Promo de inverno" />
      </Field>

      <div className="mt-3">
        <div className="mb-1.5 text-2xs font-semibold uppercase tracking-wide text-ink-3">Onde fica</div>

        {/* Sem pasta nenhuma, não há o que escolher — só criar a primeira. */}
        {pastas.length > 0 && (
          <div className="mb-2 flex gap-1.5">
            <BotaoModo ativo={modo === 'existente'} icone={FolderOpen} onClick={() => setModo('existente')}>
              Pasta que já existe
            </BotaoModo>
            <BotaoModo ativo={modo === 'nova'} icone={FolderPlus} onClick={() => setModo('nova')}>
              Criar pasta
            </BotaoModo>
          </div>
        )}

        {modo === 'existente' && pastas.length > 0 ? (
          <Select value={existente} onChange={(e) => setExistente(e.target.value)}>
            {pastas.map((p) => <option key={p} value={p}>{p}</option>)}
          </Select>
        ) : (
          <Field label="Nome da pasta nova" className="mt-0">
            <Input value={nova} onChange={(e) => setNova(e.target.value)} placeholder="Ex.: Imagens da IA" autoFocus />
          </Field>
        )}

        {!pastaEscolhida && (
          <p className="mt-1.5 text-2xs text-ink-3">Dê um nome à pasta para poder salvar.</p>
        )}
      </div>
    </Dialog>
  );
}

function BotaoModo({ ativo, icone: Icone, onClick, children }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={ativo}
      className={'flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-2 py-2 text-xs transition '
        + (ativo ? 'border-accent bg-accent/10 text-accent' : 'border-line text-ink-2 hover:text-ink')}>
      <Icone size={14} /> {children}
    </button>
  );
}
