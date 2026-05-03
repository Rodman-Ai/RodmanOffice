// =============================================================
//  /lib/ — shared engines for RodmanOffice apps.
//
//  Currently consumed only by /converter/. The originating apps
//  (/word/, /sheets/, /image/) keep their own copies and will
//  migrate to /lib/ in a separate, later effort.
// =============================================================

export * as docs from './docs/index.js';
export * as sheets from './sheets/index.js';
export * as images from './images/index.js';
export * as slides from './slides/index.js';
