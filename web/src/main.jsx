import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { registrarWorker } from './lib/instalar.js';
import { vigiarVersao } from './lib/versao.js';
import './index.css';

registrarWorker();
// D46: o painel aberto há horas avisa quando há versão nova.
vigiarVersao();

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
