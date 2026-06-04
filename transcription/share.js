// RodmanTranscribe — share / handoff helpers.
//
// Two surfaces:
//   - shareTranscript(): Web Share API for text (and a file when the
//     browser allows `navigator.canShare({files})`), with a clipboard
//     fallback. iOS Safari supports text shares broadly; file shares
//     are newer and version-dependent — hence the graceful fallback.
//   - sendToWord(): hand a Markdown transcript to /word/ via a one-shot
//     localStorage key so the word app can pick it up on next load.

const WORD_INBOX_KEY = 'rodmanword:incoming';

/**
 * @param {object} o
 * @param {string} o.title    Suggested title (used as filename base).
 * @param {string} o.text     Plain text body of the transcript.
 * @param {Uint8Array} [o.file] Optional bytes for the formatted export.
 * @param {string} [o.fileName] e.g. "interview.srt"
 * @param {string} [o.mime]
 */
export async function shareTranscript(o) {
  const { title, text, file, fileName, mime } = o;
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    // File share where supported (iOS 16.4+, modern Chrome on mobile).
    if (file && fileName && typeof navigator.canShare === 'function') {
      try {
        const blob = new Blob([file], { type: mime || 'text/plain' });
        const f = new File([blob], fileName, { type: blob.type });
        if (navigator.canShare({ files: [f] })) {
          await navigator.share({ title, text: title, files: [f] });
          return { method: 'web-share-file' };
        }
      } catch (err) {
        if (err?.name === 'AbortError') return { method: 'cancelled' };
        // fall through to text share
      }
    }
    try {
      await navigator.share({ title, text });
      return { method: 'web-share-text' };
    } catch (err) {
      if (err?.name === 'AbortError') return { method: 'cancelled' };
    }
  }
  // Clipboard fallback.
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return { method: 'clipboard' };
    } catch { /* fall through */ }
  }
  return { method: 'unsupported' };
}

/**
 * Drop a transcript into RodmanWord's inbox and open /word/. Uses
 * localStorage as a same-origin hand-off; the word app reads it on boot
 * (additive snippet in word/app.js) and removes the key.
 */
export function sendToWord({ title, markdown }) {
  if (typeof localStorage === 'undefined') return false;
  try {
    localStorage.setItem(WORD_INBOX_KEY, JSON.stringify({
      title: title || 'Transcript',
      markdown: markdown || '',
      from: 'rodman-transcribe',
      at: Date.now(),
    }));
  } catch { return false; }
  try {
    window.open('../word/', '_blank');
  } catch { /* popups blocked */ }
  return true;
}

export { WORD_INBOX_KEY };
