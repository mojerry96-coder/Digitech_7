/* Minimal line icons — one family: 24 px grid, 1.6 px rounded strokes, currentColor.
 * window.RDIcon(name, size) returns inline SVG markup; elements with data-icon="name" (and optional
 * data-size) are filled in automatically. Full-colour app and folder icons live in assets/icons/*.svg. */
(function () {
  "use strict";
  const P = {
    doc: '<path d="M7 3h7l5 5v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M14 3v5h5"/><path d="M9 13h6M9 17h4"/>',
    folder: '<path d="M3.5 7.5A2 2 0 0 1 5.5 5.5h3.6l2 2h7.4a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/>',
    import: '<path d="M12 4v10M8 10.5l4 4 4-4"/><path d="M4.5 15v2.5A2.5 2.5 0 0 0 7 20h10a2.5 2.5 0 0 0 2.5-2.5V15"/>',
    accuracy: '<circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l5 5"/><path d="M8 9h5M8 12h3.5"/>',
    representation: '<circle cx="9" cy="8" r="3"/><path d="M3.5 19.5c.4-3 2.7-5.2 5.5-5.2s5.1 2.2 5.5 5.2"/><circle cx="17" cy="9.5" r="2.4"/><path d="M15.6 14.6c2.3-.5 4.6 1.2 5 4.4"/>',
    report: '<rect x="5.5" y="4.5" width="13" height="16" rx="2"/><path d="M9 4.5V3.5h6v1"/><path d="M8.5 10h7M8.5 13.5h7M8.5 17h4"/>',
    pencil: '<path d="M4 20l1-4L15.5 5.5a2.1 2.1 0 0 1 3 3L8 19z"/><path d="M14 7l3 3"/>',
    eye: '<path d="M2.5 12s3.4-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.4 6.5-9.5 6.5S2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/>',
    chevron: '<path d="M9.5 6l6 6-6 6"/>',
    arrow: '<path d="M5 12h13M13 7l5 5-5 5"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    check: '<path d="M5 12.5l4.2 4.2L19 7"/>',
    search: '<circle cx="11" cy="11" r="6"/><path d="M15.5 15.5L20 20"/>',
    back: '<path d="M14.5 6l-6 6 6 6"/>',
    forward: '<path d="M9.5 6l6 6-6 6"/>',
    up: '<path d="M6 14.5l6-6 6 6"/>',
    home: '<path d="M4 11l8-6.5 8 6.5"/><path d="M6.5 9.5V19h11V9.5"/>',
    image: '<rect x="3.5" y="5" width="17" height="14" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="M4 17l5-4.5 3.5 3 3-2.5 4.5 4"/>',
    music: '<path d="M9 18V6l10-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/>',
    film: '<rect x="3.5" y="5" width="17" height="14" rx="2"/><path d="M8 5v14M16 5v14M3.5 9.5H8M3.5 14.5H8M16 9.5h4.5M16 14.5h4.5"/>',
    wifi: '<path d="M2.8 9a13.5 13.5 0 0 1 18.4 0M5.8 12.2a9 9 0 0 1 12.4 0M8.8 15.3a4.6 4.6 0 0 1 6.4 0"/><circle cx="12" cy="18.6" r="1" fill="currentColor" stroke="none"/>',
    sound: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>',
    mute: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M16 9.5l5 5M21 9.5l-5 5"/>',
    cc: '<rect x="3" y="5.5" width="18" height="13" rx="3"/><path d="M10 10.2a2.3 2.3 0 1 0 0 3.6M16.5 10.2a2.3 2.3 0 1 0 0 3.6"/>',
    play: '<path d="M8 5.5v13l10.5-6.5z" fill="currentColor"/>',
    replay: '<path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3"/><path d="M4.5 4.5v4h4"/>',
    sparkle: '<path d="M12 4l1.6 4.4L18 10l-4.4 1.6L12 16l-1.6-4.4L6 10l4.4-1.6z"/>'
  };
  function RDIcon(name, size = 20, cls = "ln-icon") {
    return `<svg class="${cls}" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${P[name] || ""}</svg>`;
  }
  window.RDIcon = RDIcon;
  document.querySelectorAll("[data-icon]").forEach((el) => (el.innerHTML = RDIcon(el.dataset.icon, +(el.dataset.size || 20))));
})();
