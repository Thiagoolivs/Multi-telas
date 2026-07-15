/*
 * admin.js
 * Painel de gestão: escolha de template, mapa de zonas clicável,
 * conteúdos prontos (presets), upload de imagens e prévia ao vivo.
 * Salva no localStorage e exporta/importa a config como JSON.
 */
(function () {
  'use strict';

  let config = MTStorage.load();
  let dirty = false;
  let selectedZoneId = null;

  /* ================= Ícones SVG (traço, estilo corporativo) ================= */
  const ICONS = {
    text: '<path d="M4 7V5h16v2M12 5v14M9 19h6"/>',
    bell: '<path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>',
    image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>',
    film: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="M7 4v16M17 4v16M2 9h5M2 15h5M17 9h5M17 15h5"/>',
    play: '<circle cx="12" cy="12" r="10"/><path d="M10 8l6 4-6 4z"/>',
    live: '<circle cx="12" cy="12" r="2"/><path d="M16.2 7.8a6 6 0 0 1 0 8.4M7.8 16.2a6 6 0 0 1 0-8.4M19.1 4.9a10 10 0 0 1 0 14.2M4.9 19.1a10 10 0 0 1 0-14.2"/>',
    cake: '<path d="M4 21h16M5 21v-6a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v6M12 13V9M10.5 7a1.5 1.5 0 0 0 3 0c0-1-1.5-3-1.5-3s-1.5 2-1.5 3z"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/>',
    cloud: '<path d="M17.5 19a4.5 4.5 0 0 0 0-9 7 7 0 0 0-13.6 2A4 4 0 0 0 6 19z"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
    qr: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM20 14h1M14 20h1M20 20h1M17 20h1M20 17h1"/>',
    ticker: '<rect x="2" y="9" width="20" height="6" rx="2"/><path d="M5 12h2M9 12h6M17 12h2"/>',
    header: '<rect x="2" y="4" width="20" height="6" rx="2"/><path d="M2 14h20M2 18h12"/>',
    upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>',
    pencil: '<path d="M17 3l4 4L7 21H3v-4z"/>',
    trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6"/>',
    up: '<path d="M6 14l6-6 6 6"/>',
    down: '<path d="M6 10l6 6 6-6"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    gift: '<rect x="4" y="10" width="16" height="10" rx="1"/><path d="M3 6.5h18V10H3zM12 6.5V20M12 6.5s-4.2 0-4.2-2.7A1.9 1.9 0 0 1 12 3.2M12 6.5s4.2 0 4.2-2.7A1.9 1.9 0 0 0 12 3.2"/>',
    megaphone: '<path d="M4 10v4a1 1 0 0 0 1 1h2l1.2 5h2.2L9.2 15H10l9 3.5v-13L10 9H5a1 1 0 0 0-1 1z"/>',
    alert: '<path d="M12 3.5L2.8 19.5h18.4z"/><path d="M12 9.8v4.4M12 17.4v.01"/>',
    calendar: '<rect x="3.5" y="5" width="17" height="16" rx="2"/><path d="M3.5 10h17M8 2.5V6.5M16 2.5V6.5"/>',
    users: '<circle cx="9" cy="8" r="3.4"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.8a3.4 3.4 0 0 1 0 6.5M21.5 20a6.5 6.5 0 0 0-5-6.3"/>',
    shield: '<path d="M12 2.5l8 3v6c0 5-3.4 8.3-8 10-4.6-1.7-8-5-8-10v-6z"/><path d="M8.5 11.5l2.5 2.5 4.5-4.5"/>',
    wrench: '<path d="M14.7 6.3a4.5 4.5 0 0 0-6 5.6L3 17.6a2 2 0 1 0 2.8 2.8l5.7-5.7a4.5 4.5 0 0 0 5.6-6l-3 3-2.8-.7-.7-2.8z"/>',
    trophy: '<path d="M8 4h8v6a4 4 0 0 1-8 0zM8 5H4.5a3.2 3.2 0 0 0 3.7 3.6M16 5h3.5a3.2 3.2 0 0 1-3.7 3.6M12 14v4M8.5 21h7M10 18h4"/>',
    book: '<path d="M4 5a2 2 0 0 1 2-2h14v16H6a2 2 0 0 0-2 2z"/><path d="M4 19a2 2 0 0 1 2-2h14M8 7h8"/>',
    heart: '<path d="M12 20.5S3.5 15 3.5 9.2A4.7 4.7 0 0 1 12 6.4a4.7 4.7 0 0 1 8.5 2.8C20.5 15 12 20.5 12 20.5z"/>',
    news: '<rect x="3" y="4" width="15" height="16" rx="2"/><path d="M18 8h2a1 1 0 0 1 1 1v9a2 2 0 0 1-2 2H5M7 8h7M7 12h7M7 16h4"/>',
    car: '<path d="M5.5 15.5L7 10a2 2 0 0 1 1.9-1.5h6.2A2 2 0 0 1 17 10l1.5 5.5M4.5 15.5h15a1 1 0 0 1 1 1V19h-2.5v-1.5h-12V19H3.5v-2.5a1 1 0 0 1 1-1zM7.5 13h.01M16.5 13h.01"/>',
    pin: '<path d="M12 21.5S5 15.7 5 10a7 7 0 0 1 14 0c0 5.7-7 11.5-7 11.5z"/><circle cx="12" cy="10" r="2.6"/>',
    star: '<path d="M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6-5.4-3-5.4 3 1.2-6L3.3 9.3l6.1-.7z"/>',
    quote: '<path d="M9 7H5a1 1 0 0 0-1 1v4a1 1 0 0 0 1 1h3v1a2 2 0 0 1-2 2M20 7h-4a1 1 0 0 0-1 1v4a1 1 0 0 0 1 1h3v1a2 2 0 0 1-2 2"/>',
    chart: '<path d="M4 20V4M4 20h16M8 16v-4M12 16V8M16 16v-7"/>',
    tag: '<path d="M3 11.5V5a2 2 0 0 1 2-2h6.5a2 2 0 0 1 1.4.6l7 7a2 2 0 0 1 0 2.8l-6.5 6.5a2 2 0 0 1-2.8 0l-7-7A2 2 0 0 1 3 11.5z"/><circle cx="7.5" cy="7.5" r="1.3" fill="currentColor" stroke="none"/>',
    share: '<circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M8.2 10.8l7.6-3.6M8.2 13.2l7.6 3.6"/>',
    calendar2: '<rect x="3.5" y="5" width="17" height="16" rx="2"/><path d="M3.5 10h17M8 2.5V6.5M16 2.5V6.5"/>',
    sparkle: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M18 6l-2.5 2.5M8.5 15.5L6 18"/>',
    grip: '<circle cx="9" cy="6" r="1.3" fill="currentColor" stroke="none"/><circle cx="15" cy="6" r="1.3" fill="currentColor" stroke="none"/><circle cx="9" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="15" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="9" cy="18" r="1.3" fill="currentColor" stroke="none"/><circle cx="15" cy="18" r="1.3" fill="currentColor" stroke="none"/>',
    copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
    bookmark: '<path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z"/>',
    clock2: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/>',
  };
  function icon(name) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" ' +
      'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      (ICONS[name] || ICONS.text) + '</svg>';
  }

  /* ================= Formulários por tipo de conteúdo ================= */
  const FORMS = {
    announce: [
      {
        key: 'tipo', label: 'Tipo de aviso', kind: 'select',
        options: MTRender.ANN_VARIANTS.map((v) => [v.id, v.label]),
        def: 'comunicado',
      },
      { key: 'titulo', label: 'Título', kind: 'text' },
      { key: 'corpo', label: 'Texto', kind: 'textarea' },
      { key: 'info', label: 'Detalhes (ex.: Sexta · 15h · Auditório)', kind: 'text' },
      { key: 'etiqueta', label: 'Etiqueta (vazio = automática pelo tipo)', kind: 'text' },
      { key: 'duracao', label: 'Duração (s)', kind: 'number', def: 12 },
    ],
    text: [
      { key: 'titulo', label: 'Título', kind: 'text' },
      { key: 'corpo', label: 'Texto', kind: 'textarea' },
      { key: 'bg', label: 'Cor de fundo', kind: 'color', def: '#2F6FEB' },
      { key: 'cor', label: 'Cor do texto', kind: 'color', def: '#ffffff' },
      { key: 'duracao', label: 'Duração (s)', kind: 'number', def: 10 },
    ],
    notice: [
      { key: 'titulo', label: 'Título', kind: 'text' },
      { key: 'corpo', label: 'Texto do aviso', kind: 'textarea' },
      { key: 'bg', label: 'Cor de fundo', kind: 'color', def: '#7f1d1d' },
      { key: 'cor', label: 'Cor do texto', kind: 'color', def: '#ffffff' },
      { key: 'duracao', label: 'Duração (s)', kind: 'number', def: 12 },
    ],
    image: [
      { key: 'src', label: 'Imagem', kind: 'imagesrc' },
      { key: 'fit', label: 'Ajuste', kind: 'select', options: [['cover', 'Preencher a tela'], ['contain', 'Mostrar inteira']], def: 'cover' },
      { key: 'duracao', label: 'Duração (s)', kind: 'number', def: 8 },
    ],
    video: [
      { key: 'src', label: 'URL do vídeo (MP4)', kind: 'text', ph: 'https://…/video.mp4' },
      { key: 'loop', label: 'Repetir em loop', kind: 'checkbox' },
      { key: 'muted', label: 'Sem áudio', kind: 'checkbox', def: true },
      { key: 'duracao', label: 'Duração fixa (s) — 0 = até terminar', kind: 'number', def: 0 },
    ],
    youtube: [
      { key: 'videoId', label: 'Link ou ID do vídeo / live', kind: 'text', ph: 'https://youtube.com/watch?v=…' },
      { key: 'channelId', label: 'Ou ID do canal (exibe a live ativa do canal)', kind: 'text', ph: 'UCxxxxxxxxxxxxxxxx' },
      { key: 'loop', label: 'Repetir em loop', kind: 'checkbox' },
      { key: 'duracao', label: 'Duração (s) — 0 = fixo na tela (ao vivo)', kind: 'number', def: 20 },
    ],
    birthdaycard: [
      { key: 'nome', label: 'Nome do aniversariante', kind: 'text', ph: 'Ex.: João' },
      { key: 'mensagem', label: 'Mensagem', kind: 'textarea', def: 'Que hoje o seu dia seja o mais feliz de todos!' },
      { key: 'foto', label: 'Foto (opcional)', kind: 'imagesrc' },
      { key: 'bg', label: 'Cor de fundo', kind: 'color', def: '#0c1c4d' },
      { key: 'duracao', label: 'Duração (s)', kind: 'number', def: 15 },
    ],
    weatherpro: [
      { key: 'cidade', label: 'Cidade', kind: 'text', ph: 'São Paulo', def: 'São Paulo' },
      { key: 'duracao', label: 'Duração (s) — 0 = fixo na tela', kind: 'number', def: 0 },
    ],
    traffic: [
      { key: 'local', label: 'Cidade ou região', kind: 'text', ph: 'São Paulo', def: 'São Paulo' },
      { key: 'zoom', label: 'Zoom do mapa (10 a 17)', kind: 'number', def: 13 },
      { key: 'duracao', label: 'Duração (s) — 0 = fixo na tela', kind: 'number', def: 0 },
    ],
    map: [
      { key: 'local', label: 'Cidade ou endereço', kind: 'text', ph: 'São Paulo', def: 'São Paulo' },
      { key: 'zoom', label: 'Zoom do mapa (10 a 17)', kind: 'number', def: 14 },
      { key: 'duracao', label: 'Duração (s)', kind: 'number', def: 20 },
    ],
    birthday: [
      { key: 'titulo', label: 'Título', kind: 'text', def: 'Aniversariantes do Mês' },
      { key: 'nomes', label: 'Nomes (um por linha, ex.: "Ana Souza — 05/07")', kind: 'textarea', ph: 'Ana Souza — 05/07\nCarlos Lima — 12/07' },
      { key: 'bg', label: 'Cor de fundo', kind: 'color', def: '#1f2a52' },
      { key: 'cor', label: 'Cor do texto', kind: 'color', def: '#ffffff' },
      { key: 'duracao', label: 'Duração (s)', kind: 'number', def: 15 },
    ],
    spotlight: [
      { key: 'etiqueta', label: 'Etiqueta', kind: 'text', def: 'DESTAQUE DO MÊS' },
      { key: 'nome', label: 'Nome', kind: 'text', ph: 'Ex.: Mariana Alves' },
      { key: 'cargo', label: 'Cargo / função', kind: 'text', ph: 'Ex.: Analista de Produção' },
      { key: 'mensagem', label: 'Mensagem', kind: 'textarea' },
      { key: 'foto', label: 'Foto (opcional)', kind: 'imagesrc' },
      { key: 'bg', label: 'Cor de fundo', kind: 'color', def: '#0c1830' },
      { key: 'duracao', label: 'Duração (s)', kind: 'number', def: 14 },
    ],
    agenda: [
      { key: 'titulo', label: 'Título', kind: 'text', def: 'Programação' },
      { key: 'itens', label: 'Itens (um por linha, ex.: "08:00 | Abertura")', kind: 'textarea', ph: '08:00 | Abertura\n09:30 | Palestra' },
      { key: 'bg', label: 'Cor de fundo', kind: 'color', def: '#0b1a2e' },
      { key: 'duracao', label: 'Duração (s)', kind: 'number', def: 15 },
    ],
    quote: [
      { key: 'texto', label: 'Frase', kind: 'textarea' },
      { key: 'autor', label: 'Autor', kind: 'text' },
      { key: 'bg', label: 'Cor de fundo', kind: 'color', def: '#0c1830' },
      { key: 'duracao', label: 'Duração (s)', kind: 'number', def: 12 },
    ],
    kpi: [
      { key: 'rotulo', label: 'Rótulo (ex.: Produção do mês)', kind: 'text' },
      { key: 'valor', label: 'Valor (ex.: 12.480)', kind: 'text' },
      { key: 'tendencia', label: 'Tendência', kind: 'select', options: [['subiu', 'Subiu ▲'], ['desceu', 'Desceu ▼'], ['estavel', 'Estável ▬']], def: 'subiu' },
      { key: 'variacao', label: 'Variação (ex.: 8,2%)', kind: 'text' },
      { key: 'detalhe', label: 'Detalhe (ex.: unidades produzidas)', kind: 'text' },
      { key: 'bg', label: 'Cor de fundo', kind: 'color', def: '#0b1a2e' },
      { key: 'duracao', label: 'Duração (s)', kind: 'number', def: 12 },
    ],
    promo: [
      { key: 'selo', label: 'Selo (ex.: OFERTA)', kind: 'text', def: 'Oferta' },
      { key: 'titulo', label: 'Título do produto', kind: 'text' },
      { key: 'imagem', label: 'Imagem', kind: 'imagesrc' },
      { key: 'precoDe', label: 'Preço "de" (ex.: R$ 4,90)', kind: 'text' },
      { key: 'precoPor', label: 'Preço "por" (ex.: R$ 3,49)', kind: 'text' },
      { key: 'cta', label: 'Chamada (ex.: Fale com o comercial)', kind: 'text' },
      { key: 'bg', label: 'Cor de fundo', kind: 'color', def: '#12060f' },
      { key: 'duracao', label: 'Duração (s)', kind: 'number', def: 12 },
    ],
    social: [
      { key: 'titulo', label: 'Título', kind: 'text', def: 'Siga-nos nas redes' },
      { key: 'rede', label: 'Rede', kind: 'select', options: [['instagram', 'Instagram'], ['facebook', 'Facebook'], ['youtube', 'YouTube'], ['linkedin', 'LinkedIn'], ['tiktok', 'TikTok'], ['site', 'Site']], def: 'instagram' },
      { key: 'handle', label: 'Perfil / @usuário', kind: 'text', ph: '@raftembalagens' },
      { key: 'url', label: 'Link (para o QR)', kind: 'text', ph: 'https://instagram.com/…' },
      { key: 'qr', label: 'Mostrar QR Code', kind: 'checkbox', def: true },
      { key: 'bg', label: 'Cor de fundo', kind: 'color', def: '#0b1020' },
      { key: 'duracao', label: 'Duração (s)', kind: 'number', def: 12 },
    ],
    clock: [
      { key: 'bg', label: 'Cor de fundo', kind: 'color', def: '#101828' },
      { key: 'duracao', label: 'Duração (s)', kind: 'number', def: 10 },
    ],
    weather: [
      { key: 'cidade', label: 'Cidade', kind: 'text', ph: 'São Paulo', def: 'São Paulo' },
      { key: 'bg', label: 'Cor de fundo', kind: 'color', def: '#10213f' },
      { key: 'duracao', label: 'Duração (s)', kind: 'number', def: 12 },
    ],
    web: [
      { key: 'url', label: 'Endereço da página', kind: 'text', ph: 'https://…' },
      { key: 'duracao', label: 'Duração (s)', kind: 'number', def: 20 },
    ],
    qrcode: [
      { key: 'data', label: 'Conteúdo / link do QR', kind: 'text', ph: 'https://…' },
      { key: 'caption', label: 'Legenda', kind: 'text' },
      { key: 'bg', label: 'Cor de fundo', kind: 'color', def: '#ffffff' },
      { key: 'duracao', label: 'Duração (s)', kind: 'number', def: 12 },
    ],
  };

  /* ================= Conteúdos prontos (presets em grupos) ================= */
  const PRESET_GROUPS = [
    {
      label: 'Comunicação interna',
      presets: [
        {
          label: 'Comunicado interno', desc: 'Informativo geral para a equipe', icon: 'megaphone',
          item: { type: 'announce', tipo: 'comunicado', titulo: 'Comunicado', corpo: 'Digite aqui o comunicado para a equipe.', info: '', duracao: 12 },
        },
        {
          label: 'Aviso urgente', desc: 'Destaque máximo em vermelho', icon: 'alert',
          item: { type: 'announce', tipo: 'urgente', titulo: 'Atenção', corpo: 'Digite aqui o aviso urgente.', info: '', duracao: 12 },
        },
        {
          label: 'Reunião / evento', desc: 'Convocação com data e local', icon: 'calendar',
          item: { type: 'announce', tipo: 'evento', titulo: 'Reunião Geral', corpo: 'Participação de todas as equipes.', info: 'Sexta-feira · 15h · Auditório', duracao: 12 },
        },
        {
          label: 'Recursos Humanos', desc: 'Vagas internas, benefícios, RH', icon: 'users',
          item: { type: 'announce', tipo: 'rh', titulo: 'Vaga Interna Aberta', corpo: 'Inscrições abertas para a nova oportunidade. Fale com o RH.', info: '', duracao: 12 },
        },
        {
          label: 'Segurança do trabalho', desc: 'EPI, procedimentos, alertas', icon: 'shield',
          item: { type: 'announce', tipo: 'seguranca', titulo: 'Segurança em Primeiro Lugar', corpo: 'O uso de EPI é obrigatório nas áreas de produção.', info: '', duracao: 12 },
        },
        {
          label: 'Manutenção programada', desc: 'Paradas e indisponibilidades', icon: 'wrench',
          item: { type: 'announce', tipo: 'manutencao', titulo: 'Manutenção Programada', corpo: 'O sistema ficará indisponível durante a janela de manutenção.', info: 'Sábado · 8h às 12h', duracao: 12 },
        },
        {
          label: 'Conquista / meta', desc: 'Resultados e celebrações', icon: 'trophy',
          item: { type: 'announce', tipo: 'conquista', titulo: 'Meta Batida!', corpo: 'Parabéns a todos! Superamos a meta do mês.', info: '', duracao: 12 },
        },
        {
          label: 'Treinamento', desc: 'Capacitações e workshops', icon: 'book',
          item: { type: 'announce', tipo: 'treinamento', titulo: 'Novo Treinamento', corpo: 'Inscreva-se no treinamento pela intranet.', info: '', duracao: 12 },
        },
        {
          label: 'Saúde e bem-estar', desc: 'Campanhas e vacinação', icon: 'heart',
          item: { type: 'announce', tipo: 'saude', titulo: 'Campanha de Vacinação', corpo: 'Vacinação gratuita para todos os colaboradores.', info: 'Quarta-feira · Ambulatório', duracao: 12 },
        },
      ],
    },
    {
      label: 'Tempo real',
      presets: [
        {
          label: 'YouTube ao vivo', desc: 'Live em tempo real, fixa na tela', icon: 'live',
          item: { type: 'youtube', videoId: '', channelId: '', duracao: 0 },
        },
        {
          label: 'Painel do clima', desc: 'Tempo agora + previsão de 6 dias', icon: 'cloud',
          item: { type: 'weatherpro', cidade: 'São Paulo', duracao: 0 },
        },
        {
          label: 'Trânsito ao vivo', desc: 'Mapa do Waze em tempo real', icon: 'car',
          item: { type: 'traffic', local: 'São Paulo', zoom: 13, duracao: 0 },
        },
        {
          label: 'Mapa da região', desc: 'Localização com marcador', icon: 'pin',
          item: { type: 'map', local: 'São Paulo', zoom: 14, duracao: 20 },
        },
      ],
    },
    {
      label: 'Eventos',
      presets: [
        {
          label: 'Reunião / evento', desc: 'Convocação com data e local', icon: 'calendar',
          item: { type: 'announce', tipo: 'evento', titulo: 'Reunião Geral', corpo: 'Participação de todas as equipes.', info: 'Sexta-feira · 15h · Auditório', duracao: 12 },
        },
        {
          label: 'Agenda / programação', desc: 'Lista de horários e atividades', icon: 'calendar2',
          item: { type: 'agenda', titulo: 'Programação do Dia', itens: '08:00 | Abertura e café\n09:30 | Palestra de Segurança\n11:00 | Reunião de Equipes', bg: '#0b1a2e', duracao: 15 },
        },
        {
          label: 'Convite', desc: 'Divulgação de evento', icon: 'sparkle',
          item: { type: 'announce', tipo: 'evento', titulo: 'Você está convidado!', corpo: 'Confraternização de fim de ano da Raft Embalagens.', info: '20/12 · 19h · Salão de Eventos', duracao: 12 },
        },
        {
          label: 'Treinamento', desc: 'Capacitações e workshops', icon: 'book',
          item: { type: 'announce', tipo: 'treinamento', titulo: 'Novo Treinamento', corpo: 'Inscreva-se no treinamento pela intranet.', info: '', duracao: 12 },
        },
      ],
    },
    {
      label: 'Pessoas',
      presets: [
        {
          label: 'Cartão de aniversário', desc: 'Foto, balões e mensagem', icon: 'gift',
          item: { type: 'birthdaycard', nome: '', mensagem: 'Que hoje o seu dia seja o mais feliz de todos!', foto: '', bg: '#0c1c4d', duracao: 15 },
        },
        {
          label: 'Aniversariantes do mês', desc: 'Lista com nomes e datas', icon: 'cake',
          item: { type: 'birthday', titulo: 'Aniversariantes do Mês', nomes: 'Nome — 01/01', bg: '#1f2a52', cor: '#ffffff', duracao: 15 },
        },
        {
          label: 'Destaque de funcionário', desc: 'Funcionário do mês, reconhecimento', icon: 'star',
          item: { type: 'spotlight', etiqueta: 'FUNCIONÁRIO DO MÊS', nome: '', cargo: '', mensagem: 'Reconhecimento pelo comprometimento e excelência.', foto: '', bg: '#0c1830', duracao: 14 },
        },
        {
          label: 'Boas-vindas', desc: 'Mensagem de recepção', icon: 'text',
          item: { type: 'text', titulo: 'Seja bem-vindo(a)!', corpo: 'É um prazer receber você na Raft Embalagens.', bg: '#2F6FEB', cor: '#ffffff', duracao: 10 },
        },
      ],
    },
    {
      label: 'Marketing',
      presets: [
        {
          label: 'Promoção / produto', desc: 'Imagem, preço e chamada', icon: 'tag',
          item: { type: 'promo', selo: 'Oferta', titulo: 'Produto em destaque', imagem: '', precoDe: '', precoPor: 'R$ 0,00', cta: 'Fale com o comercial', bg: '#12060f', duracao: 12 },
        },
        {
          label: 'Indicador (KPI)', desc: 'Número de destaque com tendência', icon: 'chart',
          item: { type: 'kpi', rotulo: 'Produção do mês', valor: '12.480', tendencia: 'subiu', variacao: '8,2%', detalhe: 'unidades produzidas', bg: '#0b1a2e', duracao: 12 },
        },
        {
          label: 'Redes sociais', desc: 'Perfil + QR para seguir', icon: 'share',
          item: { type: 'social', titulo: 'Siga-nos nas redes', rede: 'instagram', handle: '@raftembalagens', url: 'https://instagram.com/raftembalagens', qr: true, bg: '#0b1020', duracao: 12 },
        },
        {
          label: 'Campanha (imagem)', desc: 'Foto/arte em tela cheia', icon: 'image',
          item: { type: 'image', src: '', fit: 'cover', duracao: 8 },
        },
        {
          label: 'Frase do dia', desc: 'Citação motivacional', icon: 'quote',
          item: { type: 'quote', texto: 'A qualidade nunca é acidente; é sempre resultado de um esforço inteligente.', autor: 'John Ruskin', bg: '#0c1830', duracao: 12 },
        },
      ],
    },
  ];

  function typeMeta(type) {
    return MTRender.ITEM_TYPES.find((t) => t.type === type) || { icon: 'text', label: type };
  }

  /* ================= Utilidades DOM ================= */
  const $ = (sel) => document.querySelector(sel);
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function markDirty() {
    dirty = true;
    $('#save-status').textContent = 'Alterações não salvas';
    $('#save-status').style.color = 'var(--warn)';
  }

  // Converte trilhas com "vh" em proporções "fr" para miniaturas/mapa.
  // Ex.: "12vh 1fr 8vh" -> cabeçalho 12%, rodapé 8%, meio com o restante.
  function mapTracks(tracks) {
    const parts = tracks.trim().split(/\s+/);
    const vhSum = parts.reduce((s, p) => s + (p.endsWith('vh') ? parseFloat(p) : 0), 0);
    const frSum = parts.reduce((s, p) => s + (p.endsWith('fr') ? parseFloat(p) : 0), 0);
    const frUnit = frSum ? (100 - vhSum) / frSum : 1;
    return parts
      .map((p) => (p.endsWith('vh') ? parseFloat(p) + 'fr' : parseFloat(p) * frUnit + 'fr'))
      .join(' ');
  }

  /* ================= Galeria de templates ================= */
  function renderTemplates() {
    const gallery = $('#template-gallery');
    gallery.innerHTML = '';
    MT_LAYOUTS.forEach((layout) => {
      const card = el('div', 'tpl');
      if (layout.id === config.settings.layoutId) card.classList.add('active');

      const thumb = el('div', 'tpl-thumb');
      thumb.style.gridTemplateColumns = mapTracks(layout.grid.columns);
      thumb.style.gridTemplateRows = mapTracks(layout.grid.rows);
      thumb.style.gridTemplateAreas = layout.grid.areas.map((r) => '"' + r + '"').join(' ');
      const seen = {};
      layout.grid.areas.join(' ').split(/\s+/).forEach((area) => {
        if (seen[area]) return; seen[area] = true;
        const cell = el('div', 'tpl-cell');
        cell.style.gridArea = area;
        const z = layout.zones.find((zz) => zz.area === area);
        if (z && (z.type === 'ticker' || z.type === 'header')) cell.classList.add('accent');
        thumb.appendChild(cell);
      });

      card.appendChild(thumb);
      card.appendChild(el('div', 'tpl-name', layout.name));
      card.appendChild(el('div', 'tpl-desc', layout.description));
      card.addEventListener('click', () => applyTemplate(layout.id));
      gallery.appendChild(card);
    });
  }

  function applyTemplate(layoutId) {
    if (layoutId === config.settings.layoutId) return;
    config.settings.layoutId = layoutId;
    config = MTStorage.normalize(config); // garante zonas do novo layout
    selectedZoneId = null;
    markDirty();
    renderTemplates();
    renderContent();
  }

  /* ================= Configurações gerais ================= */
  const SETTINGS_MAP = {
    '#cfg-nome': 'nome', '#cfg-titulo': 'titulo',
    '#cfg-cidade': 'cidadeClima', '#cfg-logo': 'logoUrl',
    '#cfg-transicao': 'transicao', '#cfg-remote': 'remoteConfigUrl',
    '#cfg-refresh': 'refreshSeconds',
  };

  function fillSettings() {
    const s = config.settings;
    Object.keys(SETTINGS_MAP).forEach((sel) => {
      const input = $(sel);
      input.value = s[SETTINGS_MAP[sel]] != null ? s[SETTINGS_MAP[sel]] : '';
    });
  }

  function attachSettingsEvents() {
    Object.keys(SETTINGS_MAP).forEach((sel) => {
      const input = $(sel);
      const key = SETTINGS_MAP[sel];
      input.addEventListener('input', () => {
        config.settings[key] = input.type === 'number' ? Number(input.value) : input.value;
        markDirty();
      });
    });

    // Upload do logotipo (comprimido, mantém transparência de PNG).
    $('#btn-logo-upload').addEventListener('click', () => $('#cfg-logo-file').click());
    $('#cfg-logo-file').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      compressImage(file, 600, (dataUrl) => {
        config.settings.logoUrl = dataUrl;
        $('#cfg-logo').value = dataUrl;
        markDirty();
      });
      e.target.value = '';
    });
  }

  /* ================= Mapa de zonas (clicável) ================= */
  function renderContent() {
    const layout = MT_getLayout(config.settings.layoutId);
    if (!selectedZoneId || !layout.zones.some((z) => z.id === selectedZoneId)) {
      const firstPlaylist = layout.zones.find((z) => z.type === 'playlist');
      selectedZoneId = (firstPlaylist || layout.zones[0]).id;
    }
    renderLayoutMap();
    renderZonePanel();
  }

  function renderLayoutMap() {
    const map = $('#layout-map');
    const layout = MT_getLayout(config.settings.layoutId);
    map.innerHTML = '';
    map.style.gridTemplateColumns = mapTracks(layout.grid.columns);
    map.style.gridTemplateRows = mapTracks(layout.grid.rows);
    map.style.gridTemplateAreas = layout.grid.areas.map((r) => '"' + r + '"').join(' ');

    layout.zones.forEach((zone) => {
      const block = el('button', 'map-zone');
      block.type = 'button';
      block.style.gridArea = zone.area;
      if (zone.id === selectedZoneId) block.classList.add('active');

      const data = config.zonas[zone.id] || {};
      let iconName = 'image';
      let meta = '';
      if (zone.type === 'ticker') {
        iconName = 'ticker';
        const n = (data.messages || []).filter((m) => m && m.trim()).length;
        meta = n ? n + (n === 1 ? ' aviso' : ' avisos') : 'sem avisos';
      } else if (zone.type === 'header') {
        iconName = 'header';
        meta = 'automático';
      } else {
        const n = (data.items || []).length;
        iconName = n ? typeMeta(data.items[0].type).icon : 'image';
        meta = n ? n + (n === 1 ? ' conteúdo' : ' conteúdos') : 'vazio';
      }

      block.innerHTML = icon(iconName);
      block.appendChild(el('span', 'map-zone-name', zone.name));
      block.appendChild(el('span', 'map-zone-meta', meta));
      block.addEventListener('click', () => {
        selectedZoneId = zone.id;
        renderLayoutMap();
        renderZonePanel();
      });
      map.appendChild(block);
    });
  }

  /* ================= Painel da zona selecionada ================= */
  function renderZonePanel() {
    const panel = $('#zone-panel');
    panel.innerHTML = '';
    const layout = MT_getLayout(config.settings.layoutId);
    const zone = layout.zones.find((z) => z.id === selectedZoneId);
    if (!zone) return;

    const head = el('div', 'zone-panel-head');
    head.appendChild(el('h3', null, zone.name));
    head.appendChild(el('span', 'zone-type', zoneTypeLabel(zone.type)));
    panel.appendChild(head);

    if (zone.type === 'ticker') {
      renderTickerEditor(panel, zone.id);
    } else if (zone.type === 'header') {
      panel.appendChild(el('p', 'empty-hint',
        'Esta faixa é montada automaticamente com o logotipo, o título, o relógio e o clima definidos em "Identidade e exibição".'));
    } else {
      renderPlaylistEditor(panel, zone.id);
    }
  }

  function zoneTypeLabel(t) {
    return t === 'ticker' ? 'faixa de avisos'
      : t === 'header' ? 'cabeçalho automático' : 'sequência de conteúdos';
  }

  function renderPlaylistEditor(panel, zoneId) {
    const zone = config.zonas[zoneId];
    if (!zone.items.length) {
      panel.appendChild(el('div', 'empty-hint',
        'Esta tela está vazia. Escolha um conteúdo pronto abaixo ou monte um personalizado.'));
    } else {
      const list = el('div', 'item-list');
      zone.items.forEach((item, idx) => list.appendChild(itemRow(zoneId, item, idx)));
      enableDragReorder(list, zoneId);
      panel.appendChild(list);
    }

    renderFavorites(panel, zoneId);

    PRESET_GROUPS.forEach((group) => {
      panel.appendChild(el('div', 'add-section-label', group.label));
      const presets = el('div', 'presets-grid');
      group.presets.forEach((p) => {
        const b = el('button', 'preset-btn');
        b.type = 'button';
        b.innerHTML = icon(p.icon) +
          '<span><span class="p-label"></span><span class="p-desc"></span></span>';
        b.querySelector('.p-label').textContent = p.label;
        b.querySelector('.p-desc').textContent = p.desc;
        b.addEventListener('click', () => {
          openItemModal(zoneId, null, p.item.type, Object.assign({}, p.item));
        });
        presets.appendChild(b);
      });
      panel.appendChild(presets);
    });

    panel.appendChild(el('div', 'add-section-label', 'Ou monte do zero'));
    const types = el('div', 'types-row');
    MTRender.ITEM_TYPES.forEach((t) => {
      const b = el('button', 'type-btn');
      b.type = 'button';
      b.innerHTML = icon(t.icon) + '<span></span>';
      b.querySelector('span').textContent = t.label;
      b.addEventListener('click', () => openItemModal(zoneId, null, t.type));
      types.appendChild(b);
    });
    panel.appendChild(types);
  }

  function itemRow(zoneId, item, idx) {
    const row = el('div', 'item-row');
    row.dataset.idx = idx;

    const handle = el('div', 'item-drag');
    handle.title = 'Arraste para reordenar';
    handle.innerHTML = icon('grip');
    row.appendChild(handle);

    const meta = typeMeta(item.type);
    const ic = el('div', 'item-icon');
    ic.innerHTML = icon(meta.icon);
    row.appendChild(ic);

    const info = el('div', 'item-info');
    const titleRow = el('div', 'item-title');
    titleRow.appendChild(el('span', null, itemTitle(item)));
    if (item.prioridade && item.prioridade !== 'normal') {
      titleRow.appendChild(el('span', 'item-badge badge-' + item.prioridade,
        item.prioridade === 'urgente' ? 'urgente' : 'destaque'));
    }
    if (item.agendamento && item.agendamento.ativo) {
      const b = el('span', 'item-badge badge-sched');
      b.innerHTML = icon('clock2');
      b.title = 'Agendado';
      titleRow.appendChild(b);
    }
    info.appendChild(titleRow);
    const durTxt = item.duracao === 0 ? 'fixo na tela' : (item.duracao || '—') + 's';
    info.appendChild(el('div', 'item-sub', meta.label + ' · ' + durTxt));
    row.appendChild(info);

    const actions = el('div', 'item-actions');
    actions.appendChild(iconBtn('pencil', 'Editar', () => openItemModal(zoneId, idx)));
    actions.appendChild(iconBtn('copy', 'Duplicar', () => duplicateItem(zoneId, idx)));
    actions.appendChild(iconBtn('bookmark', 'Salvar nos favoritos', () => saveFavorite(item)));
    actions.appendChild(iconBtn('trash', 'Remover', () => removeItem(zoneId, idx)));
    row.appendChild(actions);
    return row;
  }

  /* ---------- Arrastar-e-soltar para reordenar ---------- */
  function enableDragReorder(list, zoneId) {
    let dragIdx = null;
    list.querySelectorAll('.item-row').forEach((row) => {
      row.setAttribute('draggable', 'true');
      row.addEventListener('dragstart', (e) => {
        dragIdx = Number(row.dataset.idx);
        row.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
      });
      row.addEventListener('dragend', () => row.classList.remove('dragging'));
      row.addEventListener('dragover', (e) => {
        e.preventDefault();
        const over = Number(row.dataset.idx);
        list.querySelectorAll('.item-row').forEach((r) => r.classList.remove('drop-target'));
        if (over !== dragIdx) row.classList.add('drop-target');
      });
      row.addEventListener('drop', (e) => {
        e.preventDefault();
        const to = Number(row.dataset.idx);
        if (dragIdx == null || dragIdx === to) return;
        const arr = config.zonas[zoneId].items;
        const [it] = arr.splice(dragIdx, 1);
        arr.splice(to, 0, it);
        markDirty();
        renderContent();
      });
    });
  }

  function duplicateItem(zoneId, idx) {
    const arr = config.zonas[zoneId].items;
    arr.splice(idx + 1, 0, deepCopy(arr[idx]));
    markDirty();
    renderContent();
  }
  function deepCopy(o) { return JSON.parse(JSON.stringify(o)); }

  /* ---------- Favoritos (biblioteca reutilizável) ---------- */
  const FAV_KEY = 'multitelas.favoritos.v1';
  function getFavorites() {
    try { return JSON.parse(localStorage.getItem(FAV_KEY)) || []; } catch (e) { return []; }
  }
  function setFavorites(list) { localStorage.setItem(FAV_KEY, JSON.stringify(list)); }
  function saveFavorite(item) {
    const favs = getFavorites();
    favs.unshift({ label: itemTitle(item), item: deepCopy(item) });
    setFavorites(favs.slice(0, 40));
    renderContent();
    $('#save-status').textContent = 'Salvo nos favoritos';
    $('#save-status').style.color = 'var(--ok)';
  }
  function removeFavorite(i) { const f = getFavorites(); f.splice(i, 1); setFavorites(f); renderContent(); }

  function renderFavorites(panel, zoneId) {
    const favs = getFavorites();
    if (!favs.length) return;
    panel.appendChild(el('div', 'add-section-label', 'Favoritos'));
    const wrap = el('div', 'fav-list');
    favs.forEach((f, i) => {
      const chip = el('div', 'fav-chip');
      const b = el('button', 'fav-insert');
      b.type = 'button';
      b.innerHTML = icon(typeMeta(f.item.type).icon) + '<span></span>';
      b.querySelector('span').textContent = f.label || typeMeta(f.item.type).label;
      b.addEventListener('click', () => openItemModal(zoneId, null, f.item.type, deepCopy(f.item)));
      chip.appendChild(b);
      chip.appendChild(iconBtn('trash', 'Remover dos favoritos', () => removeFavorite(i)));
      wrap.appendChild(chip);
    });
    panel.appendChild(wrap);
  }

  function itemTitle(item) {
    if (item.type === 'image' && item.src && item.src.startsWith('data:')) return 'Imagem enviada';
    if (item.type === 'youtube' && item.channelId) return 'Live do canal';
    if (item.type === 'birthdaycard') return item.nome ? 'Parabéns, ' + item.nome + '!' : 'Cartão de aniversário';
    return item.titulo || item.caption || item.cidade || item.local || item.url
      || item.videoId || item.src || item.data || typeMeta(item.type).label;
  }

  function iconBtn(name, title, fn) {
    const b = el('button', 'icon-btn');
    b.type = 'button';
    b.title = title;
    b.innerHTML = icon(name);
    b.addEventListener('click', fn);
    return b;
  }

  function removeItem(zoneId, idx) {
    config.zonas[zoneId].items.splice(idx, 1);
    markDirty();
    renderContent();
  }

  /* ---------- Editor da faixa de avisos ---------- */
  function renderTickerEditor(panel, zoneId) {
    const zone = config.zonas[zoneId];
    const editor = el('div', 'messages-editor');

    function fieldRow(labelTxt, input) {
      const label = el('label', 'field');
      label.appendChild(el('span', null, labelTxt));
      label.appendChild(input);
      return label;
    }

    function redraw() {
      editor.innerHTML = '';

      // Opções da faixa.
      const opts = el('div', 'grid-2');
      const tagInput = el('input');
      tagInput.type = 'text';
      tagInput.value = zone.titulo != null ? zone.titulo : 'ÚLTIMAS NOTÍCIAS';
      tagInput.addEventListener('input', () => { zone.titulo = tagInput.value; markDirty(); });
      opts.appendChild(fieldRow('Título da faixa', tagInput));

      const modeSel = el('select');
      [['noticias', 'Notícias rotativas (com relógio)'], ['rolagem', 'Rolagem contínua']].forEach(([v, t]) => {
        const o = el('option', null, t); o.value = v; modeSel.appendChild(o);
      });
      modeSel.value = zone.modo || 'noticias';
      modeSel.addEventListener('change', () => { zone.modo = modeSel.value; markDirty(); redraw(); });
      opts.appendChild(fieldRow('Modo de exibição', modeSel));

      if ((zone.modo || 'noticias') === 'noticias') {
        const iv = el('input'); iv.type = 'number'; iv.min = '3';
        iv.value = zone.intervalo || 8;
        iv.addEventListener('input', () => { zone.intervalo = Number(iv.value); markDirty(); });
        opts.appendChild(fieldRow('Troca de notícia a cada (s)', iv));

        // Fonte automática de manchetes (RSS de portais famosos).
        const srcSel = el('select');
        const srcOptions = [['manual', 'Manual (digitar abaixo)']]
          .concat(MTNews.FEEDS.map((f) => [f.id, f.label]))
          .concat([['custom', 'RSS personalizado (URL)']]);
        srcOptions.forEach(([v, t]) => {
          const o = el('option', null, t); o.value = v; srcSel.appendChild(o);
        });
        srcSel.value = zone.fonte || 'manual';
        srcSel.addEventListener('change', () => { zone.fonte = srcSel.value; markDirty(); redraw(); });
        opts.appendChild(fieldRow('Fonte das notícias', srcSel));

        if (zone.fonte === 'custom') {
          const ru = el('input'); ru.type = 'text';
          ru.placeholder = 'https://…/feed.xml';
          ru.value = zone.rssUrl || '';
          ru.addEventListener('input', () => { zone.rssUrl = ru.value; markDirty(); });
          opts.appendChild(fieldRow('URL do RSS', ru));
        }
        if ((zone.fonte || 'manual') !== 'manual') {
          const qt = el('input'); qt.type = 'number'; qt.min = '1'; qt.max = '30';
          qt.value = zone.quantidade || 10;
          qt.addEventListener('input', () => { zone.quantidade = Number(qt.value); markDirty(); });
          opts.appendChild(fieldRow('Máximo de manchetes', qt));
        }
      } else {
        const si = el('input'); si.type = 'number'; si.min = '20';
        si.value = zone.velocidade || 60;
        si.addEventListener('input', () => { zone.velocidade = Number(si.value); markDirty(); });
        opts.appendChild(fieldRow('Velocidade da rolagem (px/s)', si));
      }
      editor.appendChild(opts);

      const auto = (zone.modo || 'noticias') === 'noticias' && (zone.fonte || 'manual') !== 'manual';
      editor.appendChild(el('div', 'add-section-label',
        auto ? 'Mensagens de reserva (se a fonte falhar)' : 'Notícias / mensagens'));
      const hint = el('p', 'hint');
      hint.textContent = auto
        ? 'As manchetes chegam sozinhas do portal escolhido e se renovam a cada 10 minutos. As mensagens abaixo só aparecem se o portal estiver fora do ar.'
        : 'Dica: use "Título :: descrição" para exibir manchete com texto de apoio.';
      hint.style.margin = '0 0 10px';
      editor.appendChild(hint);

      zone.messages.forEach((msg, idx) => {
        const row = el('div', 'msg-row');
        const input = el('input');
        input.type = 'text';
        input.value = msg;
        input.placeholder = 'Título :: descrição';
        input.addEventListener('input', () => { zone.messages[idx] = input.value; markDirty(); });
        row.appendChild(input);
        row.appendChild(iconBtn('trash', 'Remover', () => {
          zone.messages.splice(idx, 1); markDirty(); redraw();
        }));
        editor.appendChild(row);
      });
      const add = el('button', 'btn btn-ghost btn-sm', '+ Nova notícia');
      add.type = 'button';
      add.addEventListener('click', () => { zone.messages.push(''); markDirty(); redraw(); });
      editor.appendChild(add);
    }
    redraw();
    panel.appendChild(editor);
  }

  /* ================= Modal de item ================= */
  let modalState = null; // { zoneId, idx, type, draft, isNew }

  function openItemModal(zoneId, idx, type, presetItem) {
    const isNew = idx == null;
    let draft;
    if (isNew) {
      draft = presetItem ? Object.assign({}, presetItem) : { type };
      type = draft.type;
      FORMS[type].forEach((f) => {
        if (draft[f.key] === undefined && f.def !== undefined) draft[f.key] = f.def;
      });
    } else {
      draft = Object.assign({}, config.zonas[zoneId].items[idx]);
      type = draft.type;
    }
    modalState = { zoneId, idx, type, draft, isNew };

    $('#modal-title').textContent = (isNew ? 'Adicionar: ' : 'Editar: ') + typeMeta(type).label;
    const bodyEl = $('#modal-body');
    bodyEl.innerHTML = '';
    FORMS[type].forEach((f) => bodyEl.appendChild(buildField(f, draft)));

    // Campo de prioridade (layout inteligente) para tipos que podem tomar a tela.
    if (TAKEOVER_TYPES[type]) {
      bodyEl.appendChild(buildField({
        key: 'prioridade', label: 'Prioridade na tela',
        kind: 'select', def: 'normal',
        options: [['normal', 'Normal'], ['destaque', 'Destaque (amplia sobre a tela)'], ['urgente', 'Urgente (tela cheia + alerta)']],
      }, draft));
    }

    // Bloco de agendamento (mostrar só em certas datas/horários/dias).
    bodyEl.appendChild(buildScheduleField(draft));

    $('#modal').classList.remove('hidden');
  }

  const WEEKDAYS = [['0', 'Dom'], ['1', 'Seg'], ['2', 'Ter'], ['3', 'Qua'], ['4', 'Qui'], ['5', 'Sex'], ['6', 'Sáb']];
  function buildScheduleField(draft) {
    const a = draft.agendamento || (draft.agendamento = { ativo: false, dias: [] });
    if (!Array.isArray(a.dias)) a.dias = [];
    const box = el('details', 'sched');
    if (a.ativo) box.open = true;
    const sum = el('summary');
    sum.textContent = 'Agendar exibição (opcional)';
    box.appendChild(sum);

    const toggle = el('label', 'sched-toggle');
    const tI = el('input'); tI.type = 'checkbox'; tI.checked = !!a.ativo;
    tI.addEventListener('change', () => { a.ativo = tI.checked; });
    toggle.appendChild(tI);
    toggle.appendChild(el('span', null, 'Exibir apenas no período/horário abaixo'));
    box.appendChild(toggle);

    const grid = el('div', 'grid-2');
    [['dataInicio', 'De (data)', 'date'], ['dataFim', 'Até (data)', 'date'],
     ['horaInicio', 'De (hora)', 'time'], ['horaFim', 'Até (hora)', 'time']].forEach(([k, lbl, tp]) => {
      const f = el('label', 'field');
      f.appendChild(el('span', null, lbl));
      const inp = el('input'); inp.type = tp; inp.value = a[k] || '';
      inp.addEventListener('input', () => { a[k] = inp.value; });
      f.appendChild(inp);
      grid.appendChild(f);
    });
    box.appendChild(grid);

    const daysWrap = el('div', 'field');
    daysWrap.style.marginTop = '10px';
    daysWrap.appendChild(el('span', null, 'Dias da semana (vazio = todos)'));
    const days = el('div', 'sched-days');
    WEEKDAYS.forEach(([val, lbl]) => {
      const d = Number(val);
      const b = el('button', 'sched-day');
      b.type = 'button';
      b.textContent = lbl;
      if (a.dias.indexOf(d) >= 0) b.classList.add('on');
      b.addEventListener('click', () => {
        const i = a.dias.indexOf(d);
        if (i >= 0) { a.dias.splice(i, 1); b.classList.remove('on'); }
        else { a.dias.push(d); b.classList.add('on'); }
      });
      days.appendChild(b);
    });
    daysWrap.appendChild(days);
    box.appendChild(daysWrap);
    return box;
  }
  // Tipos que podem "tomar a tela" quando marcados como prioritários.
  const TAKEOVER_TYPES = {
    announce: 1, text: 1, notice: 1, birthdaycard: 1, spotlight: 1,
    kpi: 1, promo: 1, quote: 1, image: 1, agenda: 1, social: 1,
  };

  function buildField(f, draft) {
    if (f.kind === 'checkbox') {
      const label = el('label', 'field');
      const wrap = el('span');
      wrap.style.display = 'flex'; wrap.style.alignItems = 'center'; wrap.style.gap = '8px';
      const input = el('input'); input.type = 'checkbox';
      input.checked = draft[f.key] !== undefined ? !!draft[f.key] : !!f.def;
      draft[f.key] = input.checked;
      input.addEventListener('change', () => { draft[f.key] = input.checked; });
      wrap.appendChild(input);
      wrap.appendChild(el('span', null, f.label));
      label.appendChild(wrap);
      return label;
    }

    if (f.kind === 'imagesrc') return buildImageField(f, draft);

    const label = el('label', 'field');
    label.appendChild(el('span', null, f.label));
    let input;
    if (f.kind === 'textarea') {
      input = el('textarea');
    } else if (f.kind === 'select') {
      input = el('select');
      f.options.forEach(([val, txt]) => {
        const o = el('option', null, txt); o.value = val; input.appendChild(o);
      });
    } else {
      input = el('input');
      input.type = f.kind === 'number' ? 'number' : f.kind === 'color' ? 'color' : 'text';
    }
    if (f.ph) input.placeholder = f.ph;
    const val = draft[f.key] !== undefined ? draft[f.key] : (f.def !== undefined ? f.def : '');
    input.value = val;
    if (f.kind === 'color' && !val) input.value = '#000000';
    draft[f.key] = f.kind === 'number' ? Number(input.value) : input.value;
    input.addEventListener('input', () => {
      draft[f.key] = f.kind === 'number' ? Number(input.value) : input.value;
    });
    label.appendChild(input);
    return label;
  }

  /* ---------- Campo de imagem com upload direto ---------- */
  function buildImageField(f, draft) {
    const wrap = el('div', 'field');
    wrap.appendChild(el('span', null, f.label));

    const row = el('div', 'upload-row');
    const urlInput = el('input');
    urlInput.type = 'text';
    urlInput.placeholder = 'https://…/foto.jpg';
    const isData = typeof draft[f.key] === 'string' && draft[f.key].startsWith('data:');
    if (!isData) urlInput.value = draft[f.key] || '';

    const btn = el('button', 'btn btn-ghost btn-sm');
    btn.type = 'button';
    btn.innerHTML = icon('upload') + '<span>Enviar arquivo</span>';
    const file = el('input');
    file.type = 'file';
    file.accept = 'image/*';
    file.hidden = true;

    const preview = el('img', 'upload-preview');
    const note = el('div', 'hint');
    if (draft[f.key]) { preview.src = draft[f.key]; } else { preview.style.display = 'none'; }
    if (isData) note.textContent = 'Imagem enviada do computador.';

    btn.addEventListener('click', () => file.click());
    file.addEventListener('change', () => {
      const f0 = file.files[0];
      if (!f0) return;
      compressImage(f0, 1600, (dataUrl) => {
        draft[f.key] = dataUrl;
        preview.src = dataUrl;
        preview.style.display = '';
        urlInput.value = '';
        note.textContent = 'Imagem enviada (' + Math.round(dataUrl.length / 1024) + ' KB).';
      });
      file.value = '';
    });
    urlInput.addEventListener('input', () => {
      draft[f.key] = urlInput.value;
      if (urlInput.value) {
        preview.src = urlInput.value;
        preview.style.display = '';
        note.textContent = '';
      }
    });

    row.appendChild(urlInput);
    row.appendChild(btn);
    row.appendChild(file);
    wrap.appendChild(row);
    wrap.appendChild(preview);
    wrap.appendChild(note);
    return wrap;
  }

  // Redimensiona/comprime a imagem no navegador antes de salvar.
  function compressImage(file, maxW, cb) {
    const fr = new FileReader();
    fr.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxW / img.width);
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * scale);
        c.height = Math.round(img.height * scale);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        const isPng = file.type === 'image/png';
        const out = c.toDataURL(isPng ? 'image/png' : 'image/jpeg', 0.85);
        if (out.length > 3 * 1024 * 1024) {
          alert('Atenção: imagem grande (' + (out.length / 1024 / 1024).toFixed(1) +
            ' MB). Muitas imagens grandes podem esgotar o armazenamento do navegador — ' +
            'prefira usar URLs para fotos pesadas.');
        }
        cb(out);
      };
      img.onerror = () => alert('Não foi possível ler esta imagem.');
      img.src = fr.result;
    };
    fr.readAsDataURL(file);
  }

  function closeModal() {
    $('#modal').classList.add('hidden');
    modalState = null;
  }

  function applyModal() {
    if (!modalState) return;
    const { zoneId, idx, draft, isNew } = modalState;
    if (isNew) config.zonas[zoneId].items.push(draft);
    else config.zonas[zoneId].items[idx] = draft;
    markDirty();
    closeModal();
    renderContent();
  }

  /* ================= Salvar / Exportar / Importar ================= */
  function save() {
    try {
      config = MTStorage.save(config);
    } catch (e) {
      alert('Não foi possível salvar: o armazenamento do navegador está cheio. ' +
        'Remova imagens enviadas (use URLs no lugar) e tente novamente.');
      return;
    }
    dirty = false;
    $('#save-status').textContent = 'Salvo';
    $('#save-status').style.color = 'var(--ok)';
    refreshPreview();
  }

  function exportJSON() {
    const text = MTStorage.exportJSON(config);
    const blob = new Blob([text], { type: 'application/json' });
    const a = el('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'config-multitelas.json';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function importJSON(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        config = MTStorage.importJSON(reader.result);
        dirty = false;
        selectedZoneId = null;
        renderAll();
        refreshPreview();
        $('#save-status').textContent = 'Configuração importada';
        $('#save-status').style.color = 'var(--ok)';
      } catch (e) {
        alert('Arquivo inválido: ' + e.message);
      }
    };
    reader.readAsText(file);
  }

  function refreshPreview() {
    $('#preview-frame').contentWindow.location.reload();
  }

  /* ================= Editor de temas ================= */
  function ensureTheme() {
    const s = config.settings;
    if (!s.theme || typeof s.theme !== 'object') s.theme = { preset: 'dark-premium', font: 'system', overrides: {} };
    if (!s.theme.overrides || typeof s.theme.overrides !== 'object') s.theme.overrides = {};
    return s.theme;
  }

  function renderThemeEditor() {
    const host = $('#theme-editor');
    if (!host || !window.MTTheme) return;
    const theme = ensureTheme();
    host.innerHTML = '';

    // ---- Galeria de presets ----
    const gallery = el('div', 'theme-presets');
    MTTheme.listPresets().forEach(({ id, label, preset }) => {
      const card = el('button', 'theme-preset');
      card.type = 'button';
      if (theme.preset === id) card.classList.add('active');
      const sw = el('div', 'theme-swatch');
      sw.style.background = 'linear-gradient(135deg, ' + preset.bg + ', ' + preset.bg2 + ')';
      const dotB = el('span', 'theme-dot'); dotB.style.background = preset.brand;
      const dotA = el('span', 'theme-dot'); dotA.style.background = preset.accent;
      const chip = el('span', 'theme-chip');
      chip.style.background = 'rgba(' + preset.surface + ',' + Math.max(preset.glass, 0.3) + ')';
      chip.style.borderColor = preset.border;
      sw.appendChild(chip); sw.appendChild(dotB); sw.appendChild(dotA);
      card.appendChild(sw);
      card.appendChild(el('span', 'theme-preset-name', label));
      card.addEventListener('click', () => {
        theme.preset = id;
        theme.overrides = {}; // aplica o preset puro; ajustes ficam por conta do usuário
        markDirty();
        renderThemeEditor();
      });
      gallery.appendChild(card);
    });
    host.appendChild(gallery);

    // ---- Personalização manual ----
    const eff = MTTheme.resolve(theme); // valores efetivos atuais
    const ov = theme.overrides;

    const details = el('details', 'theme-custom');
    const sum = el('summary');
    sum.textContent = 'Personalizar cores, fonte e efeitos';
    details.appendChild(sum);

    // Cores
    const colors = el('div', 'theme-grid');
    [['brand', 'Cor primária'], ['brand2', 'Cor secundária'],
     ['accent', 'Cor de destaque'], ['bg', 'Fundo']].forEach(([key, lbl]) => {
      const f = el('label', 'field');
      f.appendChild(el('span', null, lbl));
      const inp = el('input'); inp.type = 'color';
      inp.value = toHex(eff[key]);
      inp.addEventListener('input', () => { ov[key] = inp.value; markDirty(); scheduleLivePreview(); });
      f.appendChild(inp);
      colors.appendChild(f);
    });
    details.appendChild(colors);

    // Fonte
    const fontField = el('label', 'field');
    fontField.style.marginTop = '12px';
    fontField.appendChild(el('span', null, 'Fonte'));
    const fontSel = el('select');
    MTTheme.listFonts().forEach(({ id, label }) => {
      const o = el('option', null, label); o.value = id; fontSel.appendChild(o);
    });
    fontSel.value = theme.font || 'system';
    fontSel.addEventListener('change', () => { theme.font = fontSel.value; markDirty(); scheduleLivePreview(); });
    fontField.appendChild(fontSel);
    details.appendChild(fontField);

    // Sliders de efeito
    const sliders = el('div', 'theme-sliders');
    [['glass', 'Transparência (vidro)', 0, 1, 0.02],
     ['blur', 'Desfoque', 0, 44, 1],
     ['radius', 'Cantos arredondados', 0, 36, 1],
     ['fx', 'Intensidade dos efeitos', 0, 1, 0.05]].forEach(([key, lbl, min, max, step]) => {
      const wrap = el('label', 'field theme-slider');
      const head = el('span', null, lbl);
      wrap.appendChild(head);
      const inp = el('input'); inp.type = 'range';
      inp.min = min; inp.max = max; inp.step = step;
      inp.value = eff[key];
      inp.addEventListener('input', () => { ov[key] = Number(inp.value); markDirty(); scheduleLivePreview(); });
      wrap.appendChild(inp);
      sliders.appendChild(wrap);
    });
    details.appendChild(sliders);

    const reset = el('button', 'btn btn-ghost btn-sm', 'Restaurar tema original');
    reset.type = 'button';
    reset.style.marginTop = '12px';
    reset.addEventListener('click', () => { theme.overrides = {}; markDirty(); renderThemeEditor(); scheduleLivePreview(); });
    details.appendChild(reset);

    const hint = el('p', 'hint');
    hint.textContent = 'As alterações aparecem na prévia ao lado. Clique em Salvar para publicar nas TVs.';
    details.appendChild(hint);

    host.appendChild(details);
  }

  // Normaliza para #rrggbb (input color exige hex).
  function toHex(c) {
    if (typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c)) return c;
    return '#000000';
  }

  // Prévia ao vivo do tema: aplica no iframe sem exigir salvar.
  let livePreviewTimer = null;
  function scheduleLivePreview() {
    clearTimeout(livePreviewTimer);
    livePreviewTimer = setTimeout(() => {
      try {
        const win = $('#preview-frame').contentWindow;
        if (win && win.MTTheme) win.MTTheme.apply(ensureTheme(), win.document.documentElement);
      } catch (e) { /* silencioso */ }
    }, 120);
  }

  /* ================= Datas comemorativas ================= */
  function renderSeasonsEditor() {
    const host = $('#seasons-editor');
    if (!host || !window.MTSeasons) return;
    host.innerHTML = '';

    // Seletor de decoração animada (manual ou automática pela data).
    const decorField = el('label', 'field');
    decorField.appendChild(el('span', null, 'Decoração animada sobre a tela'));
    const sel = el('select');
    [['none', 'Nenhuma'], ['auto', 'Automática (pela data de hoje)']]
      .concat(MTSeasons.DECORATIONS.filter((d) => d.id !== 'none').map((d) => [d.id, d.label]))
      .forEach(([v, t]) => { const o = el('option', null, t); o.value = v; sel.appendChild(o); });
    sel.value = config.settings.decoracao || 'none';
    sel.addEventListener('change', () => { config.settings.decoracao = sel.value; markDirty(); });
    decorField.appendChild(sel);
    host.appendChild(decorField);

    // Galeria de pacotes de datas comemorativas.
    host.appendChild(el('div', 'add-section-label', 'Pacotes de datas comemorativas'));
    const hint = el('p', 'hint');
    hint.textContent = 'Aplicar um pacote define o tema, a decoração e adiciona uma mensagem pronta na tela principal.';
    hint.style.margin = '0 0 10px';
    host.appendChild(hint);

    const today = MTSeasons.todaySeason();
    const grid = el('div', 'seasons-grid');
    MTSeasons.SEASONS.forEach((s) => {
      const card = el('button', 'season-card');
      card.type = 'button';
      if (today && today.id === s.id) card.classList.add('today');
      card.appendChild(el('span', 'season-emoji', s.emoji));
      card.appendChild(el('span', 'season-name', s.label));
      if (today && today.id === s.id) card.appendChild(el('span', 'season-badge', 'hoje'));
      card.addEventListener('click', () => applySeasonPack(s));
      grid.appendChild(card);
    });
    host.appendChild(grid);

    // Recursos inteligentes (Fase 3).
    host.appendChild(el('div', 'add-section-label', 'Recursos inteligentes'));
    host.appendChild(toggleRow('coresAdaptativas',
      'Cores adaptativas', 'O tema se ajusta às cores da imagem em exibição.'));
    host.appendChild(toggleRow('layoutInteligente',
      'Layout inteligente', 'Conteúdos marcados como prioritários tomam a tela e depois voltam.'));
    host.appendChild(toggleRow('somUrgente',
      'Som no aviso urgente', 'Toca um alerta sonoro e reforça o destaque nos avisos urgentes.'));
  }

  // Linha de toggle (checkbox) ligada a uma configuração booleana.
  function toggleRow(key, label, desc) {
    const row = el('label', 'toggle-row');
    const input = el('input'); input.type = 'checkbox';
    input.checked = config.settings[key] !== false;
    input.addEventListener('change', () => { config.settings[key] = input.checked; markDirty(); });
    const txt = el('div', 'toggle-text');
    txt.appendChild(el('span', 'toggle-label', label));
    txt.appendChild(el('span', 'toggle-desc', desc));
    row.appendChild(input);
    row.appendChild(txt);
    return row;
  }

  function applySeasonPack(season) {
    const theme = ensureTheme();
    theme.preset = season.theme.preset || theme.preset;
    theme.overrides = Object.assign({}, season.theme.overrides || {});
    config.settings.decoracao = season.decoracao || 'none';

    // Adiciona a saudação pronta no início da primeira zona de conteúdo.
    const layout = MT_getLayout(config.settings.layoutId);
    const zone = layout.zones.find((z) => z.type === 'playlist');
    if (zone && season.greeting) {
      const z = config.zonas[zone.id] || (config.zonas[zone.id] = { items: [] });
      if (!z.items) z.items = [];
      z.items.unshift(Object.assign({}, season.greeting));
    }
    markDirty();
    renderThemeEditor();
    renderSeasonsEditor();
    renderContent();
    scheduleLivePreview();
    $('#save-status').textContent = 'Pacote "' + season.label + '" aplicado — clique em Salvar';
    $('#save-status').style.color = 'var(--brand)';
  }

  /* ================= Vários painéis / playlists ================= */
  function renderPanelSwitch() {
    const host = $('#panel-switch');
    if (!host) return;
    host.innerHTML = '';
    const panels = MTStorage.listPanels();
    const active = MTStorage.activePanelId();

    const label = el('span', 'panel-switch-label', 'Painel');
    const select = el('select', 'panel-select');
    panels.forEach((p) => {
      const opt = el('option', null, p.name);
      opt.value = p.id;
      if (p.id === active) opt.selected = true;
      select.appendChild(opt);
    });
    select.addEventListener('change', () => switchToPanel(select.value));

    const actions = el('div', 'panel-switch-actions');
    actions.appendChild(iconAction('Novo painel', 'plus', () => {
      const name = (prompt('Nome do novo painel / playlist:', 'Novo painel') || '').trim();
      if (!name) return;
      MTStorage.createPanel(name);
      loadActivePanel();
    }));
    actions.appendChild(iconAction('Renomear painel', 'pencil', () => {
      const cur = panels.find((p) => p.id === active);
      const name = (prompt('Novo nome do painel:', cur ? cur.name : '') || '').trim();
      if (!name) return;
      MTStorage.renamePanel(active, name);
      config.settings.nome = name;
      fillSettings();
      renderPanelSwitch();
    }));
    if (panels.length > 1) {
      actions.appendChild(iconAction('Excluir painel', 'trash', () => {
        const cur = panels.find((p) => p.id === active);
        if (!confirm('Excluir o painel "' + (cur ? cur.name : '') + '"? Esta ação não pode ser desfeita.')) return;
        MTStorage.deletePanel(active);
        loadActivePanel();
      }));
    }

    host.appendChild(label);
    host.appendChild(select);
    host.appendChild(actions);
  }

  function iconAction(title, iconName, fn) {
    const b = el('button', 'panel-icon-btn');
    b.type = 'button';
    b.title = title;
    b.setAttribute('aria-label', title);
    b.innerHTML = icon(iconName);
    b.addEventListener('click', fn);
    return b;
  }

  function switchToPanel(id) {
    if (id === MTStorage.activePanelId()) return;
    if (dirty && !confirm('Há alterações não salvas neste painel. Trocar mesmo assim? As alterações serão perdidas.')) {
      renderPanelSwitch(); // restaura a seleção anterior
      return;
    }
    MTStorage.switchPanel(id);
    loadActivePanel();
  }

  function loadActivePanel() {
    config = MTStorage.load();
    dirty = false;
    selectedZoneId = null;
    renderPanelSwitch();
    renderAll();
    refreshPreview();
    $('#save-status').textContent = '';
  }

  /* ================= Trava do painel por PIN ================= */
  function refreshPinStatus() {
    const s = $('#pin-status');
    if (!s) return;
    s.textContent = MTStorage.hasPin()
      ? 'PIN ativo — o painel pede a senha ao abrir.'
      : 'Sem PIN — o painel abre direto.';
  }

  function setupPin() {
    const setBtn = $('#btn-pin-set');
    const rmBtn = $('#btn-pin-remove');
    if (setBtn) setBtn.addEventListener('click', () => {
      const pin = (prompt('Defina um PIN (números ou letras):', '') || '').trim();
      if (!pin) return;
      const again = (prompt('Confirme o PIN:', '') || '').trim();
      if (pin !== again) { alert('Os PINs não conferem.'); return; }
      MTStorage.setPin(pin);
      refreshPinStatus();
      alert('PIN definido. Ele será pedido na próxima vez que abrir o painel.');
    });
    if (rmBtn) rmBtn.addEventListener('click', () => {
      if (!MTStorage.hasPin()) { alert('Não há PIN definido.'); return; }
      if (!confirm('Remover a trava por PIN?')) return;
      MTStorage.setPin('');
      refreshPinStatus();
    });
    refreshPinStatus();
  }

  // Portão de entrada: se há PIN, esconde o painel até validar.
  function enforcePinLock() {
    if (!MTStorage.hasPin()) return;
    const lock = $('#pin-lock');
    const input = $('#pin-input');
    const err = $('#pin-error');
    const enter = $('#pin-enter');
    if (!lock) return;
    lock.classList.remove('hidden');
    document.body.classList.add('locked');
    setTimeout(() => input && input.focus(), 60);
    function tryUnlock() {
      if (MTStorage.checkPin((input.value || '').trim())) {
        lock.classList.add('hidden');
        document.body.classList.remove('locked');
      } else {
        err.textContent = 'PIN incorreto. Tente novamente.';
        input.value = '';
        input.focus();
      }
    }
    enter.addEventListener('click', tryUnlock);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') tryUnlock(); });
  }

  /* ================= Inicialização ================= */
  function renderAll() {
    renderTemplates();
    fillSettings();
    renderThemeEditor();
    renderSeasonsEditor();
    renderContent();
  }

  function attachGlobalEvents() {
    attachSettingsEvents();
    $('#btn-save').addEventListener('click', save);
    $('#btn-export').addEventListener('click', exportJSON);
    $('#btn-preview').addEventListener('click', refreshPreview);
    $('#btn-import').addEventListener('click', () => $('#import-file').click());
    $('#import-file').addEventListener('change', (e) => {
      if (e.target.files[0]) importJSON(e.target.files[0]);
      e.target.value = '';
    });
    $('#modal-close').addEventListener('click', closeModal);
    $('#modal-cancel').addEventListener('click', closeModal);
    $('#modal-ok').addEventListener('click', applyModal);
    $('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal') closeModal(); });

    window.addEventListener('beforeunload', (e) => {
      if (dirty) { e.preventDefault(); e.returnValue = ''; }
    });
    // Ctrl+S salva.
    window.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault(); save();
      }
    });
  }

  enforcePinLock();
  renderPanelSwitch();
  setupPin();
  renderAll();
  attachGlobalEvents();
})();
