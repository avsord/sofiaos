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
module.exports = {makeThumb};
