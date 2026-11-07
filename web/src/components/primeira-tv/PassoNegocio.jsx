import React from 'react';
import { Croissant, UtensilsCrossed, Sandwich, Glasses, Scissors, Pill, Stethoscope, Smile, Briefcase, Factory, Store } from 'lucide-react';
import { TituloDoPasso, RodapeDoPasso, Escolha } from './MolduraDoPasso.jsx';
import { negociosDaFrente } from '../../lib/primeiraTv.js';

const ICONE = {
  padaria: Croissant, restaurante: UtensilsCrossed, lanchonete: Sandwich, otica: Glasses, salao: Scissors,
  farmacia: Pill, clinica: Stethoscope, dentista: Smile, escritorio: Briefcase, industria: Factory, outro: Store,
};

/*
 * Passo 1 · Seu negócio (≈30 s): um toque. Os negócios da frente da conta
 * vêm primeiro; o escolhido vira o ramo da conta (as telas, as paletas e a
 * Biblioteca põem o dele primeiro).
 */
export function PassoNegocio({ estado, frente, onEscolher, onPular, ocupado }) {
  return (
    <>
      <TituloDoPasso titulo="Qual é o seu negócio?" frase="Assim a TV já vem com as telas certas para você." />
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        {negociosDaFrente(frente).map((n) => (
          <Escolha key={n.id} empilhada icone={ICONE[n.id]} titulo={n.nome} escolhida={estado.negocio === n.id} disabled={ocupado}
            onClick={() => onEscolher(n.id)} />
        ))}
      </div>
      <RodapeDoPasso secundario={{ rotulo: 'Pular', onClick: onPular, disabled: ocupado }} />
    </>
  );
}
