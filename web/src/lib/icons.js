// Conjunto curado de ícones de linha (24x24, traço = currentColor/stroke).
// Usado nas composições (elemento 'icone'). Mantido em espelho no player
// (js/render.js) — se mudar aqui, atualize lá.
export const ICONS = {
  star: '<path d="M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9 6.8 19.1l1-5.8L3.5 9.2l5.9-.9z"/>',
  heart: '<path d="M12 20s-7-4.35-9-8a4.5 4.5 0 0 1 8-3 4.5 4.5 0 0 1 8 3c-2 3.65-9 8-9 8z"/>',
  bell: '<path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
  gift: '<rect x="3" y="8" width="18" height="4"/><path d="M4 12v9h16v-9M12 8v13"/><path d="M12 8S9 3 6.5 5 8 8 12 8zM12 8s3-5 5.5-3S16 8 12 8z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  pin: '<path d="M12 21s7-6 7-11a7 7 0 0 0-14 0c0 5 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/>',
  tag: '<path d="M20.6 13.4L11 3.8H4v7l9.6 9.6a2 2 0 0 0 2.8 0l4.2-4.2a2 2 0 0 0 0-2.8z"/><circle cx="7.5" cy="7.5" r="1.2"/>',
  cart: '<circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/><path d="M3 4h2l2.5 12h11l2-8H6"/>',
  leaf: '<path d="M4 20c0-8 6-14 16-14 0 10-6 16-16 14z"/><path d="M9 15c2-3 5-5 8-6"/>',
  shield: '<path d="M12 3l8 3v6c0 5-4 8-8 9-4-1-8-4-8-9V6z"/>',
  like: '<path d="M7 22V11l4-8a2 2 0 0 1 2 2v5h6a2 2 0 0 1 2 2l-2 8H7z"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 9h18M8 3v4M16 3v4"/>',
  coffee: '<path d="M4 8h13v5a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4z"/><path d="M17 9h2a2 2 0 0 1 0 4h-2"/><path d="M6 3v2M10 3v2M14 3v2"/>',
  bolt: '<path d="M13 2L4 14h6l-1 8 9-12h-6z"/>',
  megaphone: '<path d="M3 11v2l12 5V6L3 11z"/><path d="M15 8a4 4 0 0 1 0 8"/>',
  wifi: '<path d="M2 9a15 15 0 0 1 20 0M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0"/><circle cx="12" cy="19" r="1"/>',
  check: '<circle cx="12" cy="12" r="9"/><path d="M8 12l3 3 5-6"/>',
  sparkle: '<path d="M12 3v6M12 15v6M3 12h6M15 12h6M6 6l3 3M15 15l3 3M18 6l-3 3M9 15l-3 3"/>',
};
export const ICON_NAMES = Object.keys(ICONS);
