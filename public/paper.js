/**
 * Kağız — bir tuvalın üzərindəki bütün çəkiliş əməliyyatları.
 *
 * Əsas fikir: JEV-in `confidence` dəyəri xəttin keyfiyyətini idarə edir.
 * Əmin qərar tək, təmiz xətlə çəkilir; tərəddüdlü qərar bir neçə dəfə,
 * sürüşmə ilə — plotter qələminin tərəddüd etdiyi kimi.
 */

const SIZE = 960;

/** Təkrarlana bilən təsadüf — eyni rəsm yenidən çəkiləndə eyni görünsün. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Paper {
  /**
   * @param canvas mürəkkəb qatı — çəkilən rəsm burada yığılır
   * @param under  alt qat (istəyə bağlı) — ehtimal xəritəsi və şəbəkə; hər addımda təmizlənir,
   *               beləcə istilik ləkəsi yalnız *cari* qərarı göstərir, rəsmi isə yumur.
   */
  constructor(canvas, { seed = 7, under = null } = {}) {
    this.canvas = canvas;
    this.underCanvas = under;
    this.size = SIZE;
    this.seed = seed;
    this.ctx = canvas.getContext("2d");
    this.uctx = under ? under.getContext("2d") : this.ctx;
    this.resize();
    this.clear();
    this.clearUnder();
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    for (const el of [this.canvas, this.underCanvas]) {
      if (!el) continue;
      el.width = SIZE * dpr;
      el.height = SIZE * dpr;
      el.getContext("2d").setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    this.dpr = dpr;
  }

  clear() {
    const { ctx } = this;
    this.rnd = mulberry32(this.seed);
    ctx.save();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, SIZE, SIZE);
    ctx.restore();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }

  clearUnder() {
    if (!this.underCanvas) return;
    const { uctx } = this;
    uctx.save();
    uctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    uctx.clearRect(0, 0, SIZE, SIZE);
    uctx.restore();
  }

  // --- mürəkkəb -----------------------------------------------------------

  /**
   * Bir yolu əminliyə uyğun çəkir.
   * conf ≥ 0.7 → tək təmiz xətt · 0.4–0.7 → iki keçid · < 0.4 → üç tərəddüdlü keçid
   */
  ink(pathFn, { confidence = 1, pen = "#16150f", width = 2.2, alpha = 1 } = {}) {
    const conf = Math.max(0, Math.min(1, confidence));
    const passes = conf >= 0.7 ? 1 : conf >= 0.4 ? 2 : 3;
    const jitter = (1 - conf) * 5.5;
    const { ctx } = this;

    ctx.save();
    ctx.strokeStyle = pen;
    ctx.lineWidth = width;
    for (let i = 0; i < passes; i++) {
      const ox = i === 0 ? 0 : (this.rnd() - 0.5) * jitter;
      const oy = i === 0 ? 0 : (this.rnd() - 0.5) * jitter;
      ctx.save();
      ctx.translate(ox, oy);
      ctx.globalAlpha = alpha * (i === 0 ? 1 : 0.55);
      ctx.beginPath();
      pathFn(ctx);
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }

  /** Primitivi verilmiş nöqtədə çəkir. r — yarım ölçü (piksel). */
  drawPrimitive(prim, x, y, r, { confidence = 1, rotation = 0, pen = "#16150f", width = 2.2 } = {}) {
    const { ctx } = this;
    ctx.save();
    ctx.translate(x, y);
    if (rotation) ctx.rotate(rotation);
    prim.draw(ctx, r, (fn) => this.ink(fn, { confidence, pen, width }));
    ctx.restore();
  }

  // --- ehtimal vizualı -----------------------------------------------------

  /**
   * Yarımton sahəsi: hər xana ehtimalı qədər böyük nöqtə.
   * Riso çapındakı kimi — ehtimal nə qədər yüksəkdirsə nöqtə bir o qədər dolğun.
   */
  halftone(values, { cols, rows, pen = "#16150f", offset = [0, 0], gamma = 1.35, max = 1, min = 0 } = {}) {
    const { ctx } = this;
    const cw = SIZE / cols;
    const ch = SIZE / rows;
    const rMax = Math.min(cw, ch) * 0.52;
    ctx.save();
    ctx.fillStyle = pen;
    ctx.globalAlpha = 0.88;
    ctx.globalCompositeOperation = "multiply";
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const span = Math.max(1e-6, max - min);
        const v = Math.max(0, Math.min(1, (values[r][c] - min) / span));
        const rad = Math.pow(v, gamma) * rMax;
        if (rad < 0.35) continue;
        ctx.beginPath();
        ctx.arc(offset[0] + (c + 0.5) * cw, offset[1] + (r + 0.5) * ch, rad, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  /** Ehtimal buludu — "harada?" sualının paylanması, nöqtə sıxlığı kimi. */
  heat(values, { cols, rows, pen = "#b4402e", max = null, alpha = 0.3, gamma = 0.45 } = {}) {
    const ctx = this.uctx;
    const cw = SIZE / cols;
    const ch = SIZE / rows;
    const peak = max ?? Math.max(...values.flat());
    if (!peak) return;
    const rMax = Math.min(cw, ch) * 0.46;
    ctx.save();
    ctx.fillStyle = pen;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const v = values[r][c] / peak;
        if (v < 0.012) continue;
        const t = Math.pow(v, gamma);
        ctx.globalAlpha = alpha * Math.min(1, 0.35 + t * 0.65);
        ctx.beginPath();
        ctx.arc((c + 0.5) * cw, (r + 0.5) * ch, Math.max(0.8, t * rMax), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  /** Nazik qərar şəbəkəsi — hansı gridlə işlədiyimiz görünsün. */
  gridOverlay(cols, rows, { pen = "#16150f", alpha = 0.1 } = {}) {
    const ctx = this.uctx;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = pen;
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    for (let c = 0; c <= cols; c++) {
      const x = Math.round((SIZE / cols) * c) + 0.5;
      ctx.moveTo(x, 0);
      ctx.lineTo(x, SIZE);
    }
    for (let r = 0; r <= rows; r++) {
      const y = Math.round((SIZE / rows) * r) + 0.5;
      ctx.moveTo(0, y);
      ctx.lineTo(SIZE, y);
    }
    ctx.stroke();
    ctx.restore();
  }

  /** Seçilmiş xananın ətrafındakı nişan — hansı xana qazandı. */
  markCell(col, row, cols, rows, { pen = "#b4402e" } = {}) {
    const ctx = this.uctx;
    const cw = SIZE / cols;
    const ch = SIZE / rows;
    const x = col * cw;
    const y = row * ch;
    const t = Math.min(cw, ch) * 0.28;
    ctx.save();
    ctx.strokeStyle = pen;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (const [cx, cy, dx, dy] of [
      [x, y, 1, 1],
      [x + cw, y, -1, 1],
      [x, y + ch, 1, -1],
      [x + cw, y + ch, -1, -1],
    ]) {
      ctx.moveTo(cx + dx * t, cy);
      ctx.lineTo(cx, cy);
      ctx.lineTo(cx, cy + dy * t);
    }
    ctx.stroke();
    ctx.restore();
  }

  toDataURL() {
    return this.canvas.toDataURL("image/png");
  }
}

export const PAPER_SIZE = SIZE;
