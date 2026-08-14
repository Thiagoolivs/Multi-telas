import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { registrarWorker } from './lib/instalar.js';
import './index.css';

registrarWorker();

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
