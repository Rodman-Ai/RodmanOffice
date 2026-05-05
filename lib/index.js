// =============================================================
//  /lib/ — shared engines for RodmanOffice apps.
//
//  Consumed by Word, Slides, Image, and Converter. Keep these
//  entry points stable; changes here affect multiple apps.
// =============================================================

export * as docs from './docs/index.js';
export * as sheets from './sheets/index.js';
export * as images from './images/index.js';
export * as slides from './slides/index.js';
export * as claude from './claude/index.js';
