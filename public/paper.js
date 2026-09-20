/**
 * Piksel tuvalı.
 *
 * Offscreen tam N×N-dir — hər JEV sualı bir real pikseldir. Görünən tuvala
 * nearest-neighbor ilə böyüdülür, ona görə kənarlar kəsgin qalır.
 *
 * Əsas fikir: ehtimal boz tona yox, **dither sıxlığına** çevrilir. 1-bit piksel
 * artda yarımton elə belə verilir; JEV-in qaytardığı ehtimal da elə budur.
 * Əmin piksel dolu, sərhəddəki tərəddüdlü piksel seyrək naxış olur.
 */

const OUT = 960; // görünən tuvalın məntiqi ölçüsü

/** Bayer 4×4 — sıralı dither eşikləri. */
const BAYER = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export class Paper {
  /**
   * @param canvas görünən sprite qatı
   * @param under  alt qat — şəffaflıq şahmatı
   * @param N      sprite çözünürlüyü (16, 32, 64…)
   */
  constructor(canvas, { under = null, N = 32 } = {}) {
    this.N = N;
    this.canvas = canvas;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = OUT * dpr;

    canvas.width = canvas.height = this.w;
    this.view = canvas.getContext("2d");
    this.view.imageSmoothingEnabled = false;

    this.off = document.createElement("canvas");
    this.off.width = this.off.height = N;
    this.octx = this.off.getContext("2d", { willReadFrequently: true });

    if (under) {
      under.width = under.height = this.w;
      this.uctx = under.getContext("2d");
      this.uctx.imageSmoothingEnabled = false;
    }

    this.clear();
    this.checkerboard();
  }

  clear() {
    this.octx.clearRect(0, 0, this.N, this.N);
    this.blit();
  }

  /** Offscreen-i görünən tuvala böyüdür — hamarlama olmadan. */
  blit() {
    const v = this.view;
    v.clearRect(0, 0, this.w, this.w);
    v.imageSmoothingEnabled = false;
    v.drawImage(this.off, 0, 0, this.w, this.w);
  }

  /** Şəffaf sahə — piksel redaktorlarındakı şahmat. */
  checkerboard(step = 16) {
    if (!this.uctx) return;
    const ctx = this.uctx;
    const n = step;
    const cell = this.w / n;
    ctx.clearRect(0, 0, this.w, this.w);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, this.w, this.w);
    ctx.fillStyle = "#f2eee3";
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if ((r + c) % 2) ctx.fillRect(c * cell, r * cell, cell, cell);
      }
    }
  }

  /**
   * Ehtimal matrisini sprite kimi çəkir.
   *
   * @param values   N×N ehtimal
   * @param colorAt  (r,c) → hex; rəng xəritəsi (ağ-qarada sabit)
   * @param lo,hi    kontrast dartması üçün aralıq
   * @param floor/solid  dither zolağı. Dar saxlanılır: geniş zolaqda bütün sprite
   *                     şahmata dönür, dar zolaqda isə yalnız sərhəd tərəddüdlü qalır.
   * @param outline  kənar piksellər tündləşsin
   */
  drawSprite(values, { colorAt, lo = 0, hi = 1, floor = 0.45, solid = 0.70, outline = true } = {}) {
    const { N, octx } = this;
    const span = Math.max(1e-6, hi - lo);
    const band = Math.max(1e-6, solid - floor);

    // 1) ehtimal → maska. Dither zolağı yalnız sərhədə düşür.
    const mask = [...Array(N)].map(() => new Uint8Array(N));
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        const t = Math.max(0, Math.min(1, (values[r][c] - lo) / span));
        const v = Math.max(0, Math.min(1, (t - floor) / band));
        if (v <= 0) continue;
        if (v < 1 && v <= (BAYER[r & 3][c & 3] + 0.5) / 16) continue;
        mask[r][c] = 1;
      }
    }

    // 2) tək qalmış pikselləri təmizlə. Suallar müstəqil qiymətləndirildiyi üçün
    //    obyektdən uzaqda ara-sıra "bəli" çıxır; iki qonşusu olmayan piksel səs-küydür.
    const clean = mask.map((row) => row.slice());
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        if (!mask[r][c]) continue;
        let n = 0;
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            if ((dr || dc) && mask[r + dr]?.[c + dc]) n++;
          }
        }
        if (n < 2) clean[r][c] = 0;
      }
    }

    // 3) rənglə. Kənar piksellər tündləşir — piksel artdakı kontur.
    const img = octx.createImageData(N, N);
    const d = img.data;
    const cache = new Map();
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        if (!clean[r][c]) continue;
        const edge =
          outline &&
          (!clean[r - 1]?.[c] || !clean[r + 1]?.[c] || !clean[r]?.[c - 1] || !clean[r]?.[c + 1]);
        const hex = colorAt(r, c);
        const key = edge ? hex + "|e" : hex;
        let rgb = cache.get(key);
        if (!rgb) {
          rgb = hexToRgb(hex);
          if (edge) rgb = rgb.map((x) => Math.round(x * 0.52));
          cache.set(key, rgb);
        }
        const i = (r * N + c) * 4;
        d[i] = rgb[0];
        d[i + 1] = rgb[1];
        d[i + 2] = rgb[2];
        d[i + 3] = 255;
      }
    }
    octx.putImageData(img, 0, 0);
    this.blit();
  }

  /** PNG — sprite öz çözünürlüyündə, böyüdülmədən. */
  toDataURL() {
    return this.off.toDataURL("image/png");
  }
}

export const OUT_SIZE = OUT;
