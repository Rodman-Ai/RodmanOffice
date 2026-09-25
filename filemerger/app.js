// FileMerger shell: tab switching and drag-and-drop routing.
//
// The two tabs load independently, so a browser without WebCodecs
// (which the video tab's Mediabunny engine needs) can still merge PDFs.
import { kindOf } from './packet.js';
const tabs = {
  video: { tab: document.getElementById('tab-video'), panel: document.getElementById('panel-video') },
  pdf: { tab: document.getElementById('tab-pdf'), panel: document.getElementById('panel-pdf') },
};

const video = import('./video.js').catch((err) => {
  console.error(err);
  const box = document.getElementById('unsupported');
  box.textContent = `The video merger couldn't start in this browser: ${err.message}`;
  box.hidden = false;
  return null;
});
const pdf = import('./pdf.js');

function show(name, remember = true) {
  for (const [key, { tab, panel }] of Object.entries(tabs)) {
    const on = key === name;
    tab.setAttribute('aria-selected', String(on));
    tab.tabIndex = on ? 0 : -1;
    panel.hidden = !on;
  }
  if (remember) {
    try { localStorage.setItem('filemerger.tab', name); } catch { /* storage unavailable */ }
  }
}

for (const [key, { tab }] of Object.entries(tabs)) {
  tab.addEventListener('click', () => show(key));
  tab.addEventListener('keydown', (ev) => {
    if (ev.key !== 'ArrowLeft' && ev.key !== 'ArrowRight') return;
    const other = key === 'video' ? 'pdf' : 'video';
    show(other);
    tabs[other].tab.focus();
  });
}

// ?tab=pdf (or #pdf) deep-links a tab; otherwise reopen the last one used.
const params = new URLSearchParams(location.search);
let initial = params.get('tab') || location.hash.slice(1);
if (!tabs[initial]) {
  try { initial = localStorage.getItem('filemerger.tab'); } catch { initial = null; }
}
show(tabs[initial] ? initial : 'video', false);

// Files can be dropped anywhere on the page. Videos go to the video
// tab; PDFs, images and documents to the PDF tab. The view switches to
// whichever tab received files.
const isVideo = (f) => f.type.startsWith('video/') || /\.(mp4|m4v|mov|mkv|webm)$/i.test(f.name);
const isPdf = (f) => !isVideo(f) && kindOf(f) !== null;
const zones = document.querySelectorAll('.drop');
let dragDepth = 0;

window.addEventListener('dragenter', (ev) => {
  if (!ev.dataTransfer?.types.includes('Files')) return;
  dragDepth++;
  zones.forEach((z) => z.classList.add('over'));
});
window.addEventListener('dragleave', () => {
  if (dragDepth > 0 && --dragDepth === 0) zones.forEach((z) => z.classList.remove('over'));
});
// Always cancel so a stray drop never navigates away from the page.
window.addEventListener('dragover', (ev) => ev.preventDefault());
window.addEventListener('drop', async (ev) => {
  ev.preventDefault();
  dragDepth = 0;
  zones.forEach((z) => z.classList.remove('over'));
  const files = Array.from(ev.dataTransfer?.files ?? []);
  const videos = files.filter(isVideo);
  const pdfs = files.filter(isPdf);
  if (!videos.length && !pdfs.length) return;
  // Prefer the visible tab when a drop contains both kinds.
  const current = tabs.pdf.panel.hidden ? 'video' : 'pdf';
  const target = (current === 'pdf' ? pdfs.length : !videos.length) ? 'pdf' : 'video';
  show(target);
  if (videos.length) (await video)?.addFiles(videos);
  if (pdfs.length) (await pdf).addFiles(pdfs);
});
