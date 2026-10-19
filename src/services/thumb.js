'use strict';
// 0.3.199: miniatura minuscula (32 px de largura) de uma foto, para o chat mostrar desfocada sem baixar o
// original. Pura JS (jpeg-js), sem parte nativa. Fotos de celular sao JPEG; outros formatos ficam sem miniatura.
const jpeg = require('jpeg-js');

function makeThumb(bytes, mime, width = 32) {
  if (!bytes || !bytes.length || !/^image\/jpe?g$/i.test(String(mime || ''))) return null;
  let img;
  try { img = jpeg.decode(bytes, {useTArray: true, maxResolutionInMP: 60, maxMemoryUsageInMB: 512, formatAsRGBA: true}); } catch { return null; }
  if (!img || !img.width || !img.height) return null;
  const w = Math.max(1, Math.min(width, img.width)), h = Math.max(1, Math.round(img.height * w / img.width));
  const out = Buffer.alloc(w * h * 4), sx = img.width / w, sy = img.height / h;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    // media de uma grade de amostras dentro de cada bloco (ja suaviza)
    let r = 0, g = 0, b = 0, n = 0;
    for (let yy = 0; yy < 4; yy++) for (let xx = 0; xx < 4; xx++) {
      const px = Math.min(img.width - 1, Math.floor((x + (xx + 0.5) / 4) * sx)), py = Math.min(img.height - 1, Math.floor((y + (yy + 0.5) / 4) * sy));
      const i = (py * img.width + px) * 4; r += img.data[i]; g += img.data[i + 1]; b += img.data[i + 2]; n++;
    }
    const o = (y * w + x) * 4; out[o] = r / n; out[o + 1] = g / n; out[o + 2] = b / n; out[o + 3] = 255;
  }
  try { return jpeg.encode({data: out, width: w, height: h}, 55).data; } catch { return null; }
}
/** Orientacao EXIF de um JPEG (1 = normal; 0 = sem EXIF). jpeg-js nao aplica a rotacao, entao fotos com
 * orientacao diferente de 1 nao sao reduzidas (para nunca girar a imagem sem querer). */
function exifOrientation(bytes) {
  let i = 2;
  while (i + 4 < bytes.length && bytes[i] === 0xff) {
    const marker = bytes[i + 1], len = bytes.readUInt16BE(i + 2);
    if (marker === 0xe1 && bytes.toString('latin1', i + 4, i + 8) === 'Exif') {
      const t = i + 10, le = bytes.toString('latin1', t, t + 2) === 'II';
      const u16 = o => le ? bytes.readUInt16LE(o) : bytes.readUInt16BE(o), u32 = o => le ? bytes.readUInt32LE(o) : bytes.readUInt32BE(o);
      const ifd = t + u32(t + 4), n = u16(ifd);
      for (let k = 0; k < n; k++) { const e = ifd + 2 + k * 12; if (u16(e) === 0x0112) return u16(e + 8); }
      return 0;
    }
    if (marker === 0xda) break;
    i += 2 + len;
  }
  return 0;
}
/** 0.3.200: reduz uma imagem JPEG larga (capa de pagina) para no maximo `maxWidth` px e a recomprime.
 * Devolve null quando nao ha o que reduzir (nao e JPEG, ja e pequena, tem rotacao EXIF ou nao decodifica). */
function shrinkJpeg(bytes, {maxWidth = 1600, quality = 80} = {}) {
  if (!bytes || bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  try { if (exifOrientation(bytes) > 1) return null; } catch { return null; }
  let img;
  try { img = jpeg.decode(bytes, {useTArray: true, maxResolutionInMP: 60, maxMemoryUsageInMB: 512, formatAsRGBA: true}); } catch { return null; }
  if (!img || !img.width || !img.height || img.width <= maxWidth) return null;
  const w = maxWidth, h = Math.max(1, Math.round(img.height * w / img.width)), out = Buffer.alloc(w * h * 4);
  const sx = img.width / w, sy = img.height / h, nx = Math.max(1, Math.min(4, Math.ceil(sx))), ny = Math.max(1, Math.min(4, Math.ceil(sy)));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let r = 0, g = 0, b = 0;
    for (let yy = 0; yy < ny; yy++) for (let xx = 0; xx < nx; xx++) {
      const px = Math.min(img.width - 1, Math.floor((x + (xx + 0.5) / nx) * sx)), py = Math.min(img.height - 1, Math.floor((y + (yy + 0.5) / ny) * sy));
      const i = (py * img.width + px) * 4; r += img.data[i]; g += img.data[i + 1]; b += img.data[i + 2];
    }
    const o = (y * w + x) * 4, n = nx * ny; out[o] = r / n; out[o + 1] = g / n; out[o + 2] = b / n; out[o + 3] = 255;
  }
  let enc; try { enc = jpeg.encode({data: out, width: w, height: h}, quality).data; } catch { return null; }
  return enc.length < bytes.length ? Buffer.from(enc) : null;
}
/** Largura e altura de um JPEG lendo so o cabecalho (sem decodificar a imagem). */
function jpegSize(bytes) {
  if (!bytes || bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < bytes.length) {
    if (bytes[i] !== 0xff) { i++; continue; }
    const m = bytes[i + 1];
    if (m === 0xff) { i++; continue; }
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return {height: bytes.readUInt16BE(i + 5), width: bytes.readUInt16BE(i + 7)};
    if (m === 0xd8 || (m >= 0xd0 && m <= 0xd7) || m === 0x01) { i += 2; continue; }
    i += 2 + bytes.readUInt16BE(i + 2);
  }
  return null;
}
module.exports = {makeThumb, shrinkJpeg, exifOrientation, jpegSize};
