// qibla.js — arah kiblat: bearing great-circle ke Ka'bah + pembacaan kompas perangkat.

const KAABA = { lat: 21.4225, lng: 39.8262 };
const dtr = (d) => (d * Math.PI) / 180;
const rtd = (r) => (r * 180) / Math.PI;

/** Bearing kiblat (derajat searah jarum jam dari Utara sejati). */
export function qiblaBearing(lat, lng) {
  const f1 = dtr(lat);
  const f2 = dtr(KAABA.lat);
  const dL = dtr(KAABA.lng - lng);
  const theta = Math.atan2(Math.sin(dL), Math.cos(f1) * Math.tan(f2) - Math.sin(f1) * Math.cos(dL));
  return (rtd(theta) + 360) % 360;
}

// iOS membutuhkan izin eksplisit untuk DeviceOrientation.
export async function requestOrientationPermission() {
  const D = window.DeviceOrientationEvent;
  if (D && typeof D.requestPermission === 'function') {
    try {
      return (await D.requestPermission()) === 'granted';
    } catch {
      return false;
    }
  }
  return true;
}

/**
 * Mulai membaca arah hadap perangkat. Memanggil onHeading(derajat 0-360, dari Utara).
 * Mengembalikan fungsi untuk berhenti.
 */
export function startCompass(onHeading) {
  const handler = (e) => {
    let heading = null;
    if (typeof e.webkitCompassHeading === 'number') heading = e.webkitCompassHeading; // iOS, sudah heading
    else if (typeof e.alpha === 'number') heading = 360 - e.alpha; // alpha berlawanan arah jarum jam
    if (heading != null && !Number.isNaN(heading)) onHeading((heading + 360) % 360);
  };
  window.addEventListener('deviceorientationabsolute', handler, true);
  window.addEventListener('deviceorientation', handler, true);
  return () => {
    window.removeEventListener('deviceorientationabsolute', handler, true);
    window.removeEventListener('deviceorientation', handler, true);
  };
}

export function compassSupported() {
  return typeof window !== 'undefined' && 'DeviceOrientationEvent' in window;
}
