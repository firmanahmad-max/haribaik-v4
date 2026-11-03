// share.js — generate kartu visual Islami dari respons dan bagikan via Web Share API.
// Kartu dirender 9:16 (540×960 CSS px × scale 2 = 1080×1920) agar pas untuk status
// WhatsApp/Instagram Story; ukuran font menyesuaikan panjang teks lalu dikecilkan
// bertahap bila masih meluber.

const TYPE_LABEL = { quran: 'Al-Quran', hadits: 'Hadits', doa: 'Doa' };

// Ukuran awal (CSS px) berdasarkan panjang teks — teks pendek tampil besar.
function initialSizes(arabic, translation) {
  const a = arabic.length;
  const t = translation.length;
  const ar = a <= 50 ? 60 : a <= 110 ? 50 : a <= 200 ? 40 : a <= 320 ? 33 : 28;
  const tr = t <= 100 ? 31 : t <= 200 ? 27 : t <= 350 ? 22.5 : t <= 550 ? 19 : 17;
  return { ar, tr };
}

/**
 * Render kartu ke canvas 1080×1920.
 * @param {object} item { arabic, translation, source, source_type }
 * @returns {Promise<HTMLCanvasElement>}
 */
export async function renderShareCanvas(item) {
  const arabic = String(item.arabic || '').trim();
  const translation = String(item.translation || '').trim();
  const type = TYPE_LABEL[String(item.source_type || '').toLowerCase()];

  const mount = document.getElementById('shareCardMount') || document.body;
  const card = document.createElement('div');
  card.className = 'share-card';
  card.innerHTML = `
    <div class="s-inner">
      <div class="ornament">۞ ﷽ ۞</div>
      <div class="s-body">
        <div class="s-content">
          ${type ? `<div class="s-type">${escapeHtml(type)}</div>` : ''}
          ${arabic ? `<div class="s-arabic">${escapeHtml(arabic)}</div><div class="s-divider"></div>` : ''}
          ${translation ? `<div class="s-trans">“${escapeHtml(translation)}”</div>` : ''}
          ${item.source ? `<div class="s-source">— ${escapeHtml(item.source)}</div>` : ''}
        </div>
      </div>
      <div class="s-watermark">HariBaik · Mulai harimu dengan kebaikan</div>
    </div>`;
  mount.appendChild(card);

  try {
    // Pastikan font Amiri sudah dimuat agar metrik & render teks Arab benar.
    try {
      await document.fonts.load('400 40px Amiri');
      await document.fonts.load('700 40px Amiri');
      await document.fonts.ready;
    } catch { /* Font Loading API tak tersedia */ }

    // Fit: mulai dari ukuran adaptif, kecilkan bertahap sampai isi muat di area tengah.
    let { ar, tr } = initialSizes(arabic, translation);
    const body = card.querySelector('.s-body');
    const content = card.querySelector('.s-content');
    const apply = () => {
      card.style.setProperty('--ar-size', `${ar}px`);
      card.style.setProperty('--tr-size', `${tr}px`);
    };
    apply();
    for (let i = 0; i < 20 && content.offsetHeight > body.clientHeight; i++) {
      ar = Math.max(18, ar * 0.93);
      tr = Math.max(13, tr * 0.94);
      apply();
    }

    return await html2canvas(card, { backgroundColor: '#0c1a13', scale: 2, width: 540, height: 960 });
  } finally {
    card.remove();
  }
}

/**
 * @param {object} item { arabic, translation, source, source_type }
 * @param {(msg:string)=>void} toast
 */
export async function shareCard(item, toast) {
  try {
    const canvas = await renderShareCanvas(item);
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
