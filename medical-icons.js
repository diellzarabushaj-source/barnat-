(() => {
  'use strict';

  const paths = {
    digestive:'<path d="M9 3v5c0 2 1 3 3 3h1c3 0 5 2 5 5 0 3-2 5-5 5H9c-3 0-5-2-5-5 0-2 1-4 3-5V3"/><path d="M8 8h4"/>',
    blood:'<path d="M12 2S5 10 5 15a7 7 0 0 0 14 0c0-5-7-13-7-13Z"/><path d="M9 16c.6 1.3 1.6 2 3 2"/>',
    heart:'<path d="M20.8 4.6a5.4 5.4 0 0 0-7.6 0L12 5.8l-1.2-1.2a5.4 5.4 0 0 0-7.6 7.6L12 21l8.8-8.8a5.4 5.4 0 0 0 0-7.6Z"/><path d="m3 12 4-1 2 4 3-8 2 5h7"/>',
    skin:'<path d="M3 6c4-3 8 3 12 0s6 0 6 0v12s-2-3-6 0-8-3-12 0V6Z"/><path d="M7 9v6M12 8v8M17 9v6"/>',
    reproductive:'<circle cx="12" cy="8" r="4"/><path d="M12 12v9M8 17h8"/>',
    endocrine:'<path d="M12 3v18M5 8c2-3 5-3 7 0-2 3-5 3-7 0ZM19 8c-2-3-5-3-7 0 2 3 5 3 7 0ZM5 16c2-3 5-3 7 0-2 3-5 3-7 0ZM19 16c-2-3-5-3-7 0 2 3 5 3 7 0Z"/>',
    bacteria:'<ellipse cx="12" cy="12" rx="6" ry="8"/><path d="m7 5-2-2M17 5l2-2M6 10H3M18 10h3M6 16l-3 2M18 16l3 2M9 9h.01M15 13h.01M10 16h.01"/>',
    oncology:'<path d="M12 3c-3 0-5 2-5 5 0 2 1 3 2 4-1 1-2 2-2 4 0 3 2 5 5 5s5-2 5-5c0-2-1-3-2-4 1-1 2-2 2-4 0-3-2-5-5-5Z"/><path d="m9 8 6 8M15 8l-6 8"/>',
    bone:'<path d="M6 9a3 3 0 1 1-3-3 3 3 0 0 1 3 3l12 6a3 3 0 1 1 0 3L6 12a3 3 0 1 1 0-3Z"/>',
    brain:'<path d="M9 4a3 3 0 0 0-3 3v1a3 3 0 0 0-2 3 3 3 0 0 0 2 3v1a3 3 0 0 0 3 3h1V4H9ZM15 4a3 3 0 0 1 3 3v1a3 3 0 0 1 2 3 3 3 0 0 1-2 3v1a3 3 0 0 1-3 3h-1V4h1Z"/><path d="M7 10h3M14 8h3M14 14h3"/>',
    parasite:'<path d="M12 4c4 0 7 3 7 7s-3 7-7 7-7-3-7-7 3-7 7-7Z"/><path d="m7 6-3-3M17 6l3-3M6 15l-3 3M18 15l3 3M9 10h.01M15 10h.01M9 14c2 1 4 1 6 0"/>',
    lungs:'<path d="M11 3v8c-2-3-4-5-6-5-2 0-3 4-3 8 0 5 3 7 7 7 2 0 2-2 2-4V3ZM13 3v8c2-3 4-5 6-5 2 0 3 4 3 8 0 5-3 7-7 7-2 0-2-2-2-4V3Z"/>',
    eye:'<path d="M2 12s4-6 10-6 10 6 10 6-4 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
    ear:'<path d="M6 10a6 6 0 1 1 10 4c-2 2-2 6-5 6-2 0-3-1-3-3"/><path d="M10 10a2 2 0 1 1 3 2c-1 1-1 2-1 3"/>',
    kidney:'<path d="M9 4C5 4 3 7 3 11c0 5 3 8 7 8 2 0 2-2 2-4V7c0-2-1-3-3-3ZM15 4c4 0 6 3 6 7 0 5-3 8-7 8-2 0-2-2-2-4V7c0-2 1-3 3-3Z"/>',
    pregnancy:'<circle cx="12" cy="5" r="2"/><path d="M9 9c-1 3-1 6 0 9l-2 3M15 9c2 2 3 6 1 9l1 3M9 12c5-2 8 1 7 5H9"/>',
    baby:'<circle cx="12" cy="9" r="5"/><path d="M8 15c-3 1-4 4-3 6M16 15c3 1 4 4 3 6M9 9h.01M15 9h.01M10 12c1 1 3 1 4 0"/>',
    dna:'<path d="M7 3c0 6 10 6 10 18M17 3c0 6-10 6-10 18M8 6h8M7 11h10M7 16h10"/>',
    stethoscope:'<path d="M6 3v6a4 4 0 0 0 8 0V3M6 3H4M14 3h2M10 13v2a5 5 0 0 0 10 0v-1"/><circle cx="20" cy="11" r="2"/>',
    injury:'<path d="m13 2-2 8 7-3-8 15 2-9-7 3 8-14Z"/>',
    shield:'<path d="M12 3 4 6v6c0 5 3 8 8 10 5-2 8-5 8-10V6l-8-3Z"/><path d="m9 12 2 2 4-5"/>',
    code:'<path d="m8 9-4 3 4 3M16 9l4 3-4 3M14 5l-4 14"/>',
    flask:'<path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3"/><path d="M7 16h10"/>',
    microscope:'<path d="m9 3 5 5-3 3-5-5 3-3ZM12 10l3 3M8 14a5 5 0 0 0 8 4M5 21h14M15 13l3-3"/>',
    platelet:'<circle cx="8" cy="9" r="3"/><circle cx="16" cy="15" r="3"/><path d="m10 12 4 1"/>',
    coagulation:'<path d="M12 3s-6 7-6 12a6 6 0 0 0 12 0c0-5-6-12-6-12Z"/><path d="m9 14 2 2 4-4"/>',
    liver:'<path d="M4 9c4-5 12-5 16 0-1 7-5 10-12 9-3 0-5-3-4-9Z"/><path d="M12 7v7"/>',
    glucose:'<circle cx="12" cy="12" r="8"/><path d="M9 9c0-2 6-2 6 0s-6 2-6 4 6 2 6 0M12 5v14"/>',
    lipid:'<circle cx="8" cy="12" r="4"/><circle cx="16" cy="12" r="4"/><path d="M12 8v8"/>',
    pancreas:'<path d="M4 13c3-5 7-7 12-5 3 1 5 4 4 7-4-2-7 2-11 1-2 0-4-1-5-3Z"/>',
    urine:'<path d="M8 3h8l-1 8a5 5 0 0 1-10 0L4 3h4ZM7 18h10M12 16v5"/>',
    inflammation:'<path d="M13 2c1 5-3 5-1 9 1 2 4 1 4-2 3 3 4 7 2 10-3 4-10 4-13 0-3-4 0-9 3-12 0 5 4 5 5 1Z"/>',
    medicine:'<rect x="3" y="9" width="18" height="7" rx="3.5"/><path d="m12 9 4 7"/>',
    clipboard:'<path d="M9 5h6M9 3h6v4H9V3ZM6 5H4v16h16V5h-2M8 12h8M8 16h6"/>',
    external:'<path d="M14 3h7v7M21 3l-9 9"/><path d="M18 13v7H4V6h7"/>',
  };

  function svg(name, className = '') {
    const body = paths[name] || paths.stethoscope;
    return `<svg${className ? ` class="${className}"` : ''} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
  }

  window.MedIndexIcons = Object.freeze({ svg, names:Object.freeze(Object.keys(paths)) });
})();
