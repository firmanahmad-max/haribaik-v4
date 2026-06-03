// share.js — generate kartu visual Islami dari respons dan bagikan via Web Share API.

/**
 * @param {object} item { arabic, translation, source, source_type }
 * @param {(msg:string)=>void} toast
 */
export async function shareCard(item, toast) {
  const mount = document.getElementById('shareCardMount');
  const card = document.createElement('div');
  card.className = 'share-card';
  card.innerHTML = `
    <div class="ornament">۞ ﷽ ۞</div>
    <div class="s-arabic">${escapeHtml(item.arabic)}</div>
    <div class="s-trans">"${escapeHtml(item.translation)}"</div>
    <div class="s-source">— ${escapeHtml(item.source)}</div>
    <div class="s-watermark">HariBaik · Mulai harimu dengan kebaikan</div>`;
  mount.appendChild(card);

  try {
    // Pastikan font Amiri sudah dimuat agar teks Arab tidak ter-render dengan font fallback.
    try {
      await document.fonts.load('700 40px Amiri');
      await document.fonts.load('400 40px Amiri');
      await document.fonts.ready;
    } catch {
      /* abaikan bila Font Loading API tak tersedia */
    }
    const canvas = await html2canvas(card, { backgroundColor: null, scale: 2 });
    const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
    const file = new File([blob], 'haribaik.png', { type: 'image/png' });

    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({
        files: [file],
        title: 'HariBaik',
        text: `"${item.translation}" — ${item.source}`,
      });
    } else {
      // Fallback: salin teks + unduh gambar.
      await copyText(`"${item.translation}" — ${item.source}\n\nvia HariBaik`);
      downloadCanvas(canvas);
      toast?.('Gambar diunduh & teks disalin');
    }
  } catch (err) {
    if (err?.name !== 'AbortError') toast?.('Gagal membuat kartu');
  } finally {
    mount.removeChild(card);
  }
}

function downloadCanvas(canvas) {
  const a = document.createElement('a');
  a.href = canvas.toDataURL('image/png');
  a.download = 'haribaik.png';
  a.click();
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    /* clipboard tidak tersedia */
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}
