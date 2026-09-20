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
   * SDF dərinlik sahəsini sprite kimi çəkir.
   *
   * Sahə mütləq şkaladadır (0 = obyektdən uzaq, 4 = dərində), ona görə kontrast
   * dartmasına ehtiyac yoxdur — `surface` sabit sıfır xəttidir. Bu, köhnə
   * min–maks dartmasından daha sabitdir: boş tuval və ya zəif sahə artıq
   * süni şəkildə "şişirdilmir".
   *
   * @param field    N×N dərinlik (score cavabı, arada float)
   * @param colorAt  (r,c) → hex
   * @param surface  sıfır xətti — bundan yuxarısı obyektin içidir
   * @param soft     dither zolağının yarı eni. Dar saxlanılır ki, yalnız sərhəd
   *                 tərəddüdlü qalsın: 32×32-də sahənin dinamik aralığı daralır
   *                 (ölçmə: 0.36–3.27, 16×16-da 0.40–3.63) və geniş zolaqda
   *                 sprite-ın yarısı şahmata düşürdü.
   * @param outline  kənar piksellər tündləşsin
   */
  drawSprite(field, { colorAt, surface = 2.5, soft = 0.55, outline = true } = {}) {
    const { N, octx } = this;
    // Zolaq asimmetrikdir: dolu nüvə tam `surface` konturudur, dither isə ondan
    // KƏNARA uzanır. Simmetrik zolaqda nüvə surface+soft konturuna sürüşürdü və
    // sprite ölçmədə yaxşı çıxan formadan nəzərəçarpacaq dərəcədə nazik olurdu.
    const band = Math.max(1e-6, soft);
    const lo = surface - band;

    // 1) dərinlik → maska. Sərhəd zolağı dither olur, içəri tam dolu.
    //    `core` yalnız tam dolu pikselləri saxlayır — kontur ondan hesablanır,
    //    yoxsa dither zolağının hər pikseli "kənar" sayılıb tündləşirdi və
    //    sprite-ın ətrafında qaralmış səpinti əmələ gəlirdi.
    const mask = [...Array(N)].map(() => new Uint8Array(N));
    const core = [...Array(N)].map(() => new Uint8Array(N));
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        const v = Math.max(0, Math.min(1, (field[r][c] - lo) / band));
        if (v <= 0) continue;
        if (v >= 1) {
          mask[r][c] = core[r][c] = 1;
        } else if (v > (BAYER[r & 3][c & 3] + 0.5) / 16) {
          mask[r][c] = 1;
        }
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
          core[r][c] &&
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
