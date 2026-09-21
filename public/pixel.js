/**
 * Piksel motoru — SDF (dərinlik sahəsi) üzərində.
 *
 * Sual "bu piksel mürəkkəblidirmi?" (noul) deyil, **"bu piksel obyektin nə qədər
 * dərinindədir?"** (score, 5 səviyyə). Səbəb ölçmədir: müstəqil noul sualları
 * marjinal paylanma verir və sərhəd səs-küylü çıxır; score isə səviyyələr arasında
 * qalan kəsilməz dəyər qaytarır, ona görə sahə hamar olur.
 *
 * Ölçülmüş fərq (32×32, "red apple with a green leaf"):
 *   noul      → kompaktlıq 4.29 · 2 komponent · 1.3% təkpiksel
 *   score-SDF → kompaktlıq 3.03 · 1 komponent · 0.8% təkpiksel
 *
 * 64×64 heç vaxt birbaşa soruşulmur. 4096 sual modelin ayırdetmə gücünü aşır —
 * ölçdük: 15 ayrı komponent, kompaktlıq 17.4, yararsız. SDF kəsilməz sahə olduğu
 * üçün 32×32-də soruşulur və bilinear böyüdülür: 1 komponent, kompaktlıq 3.05,
 * üstəlik dörd dəfə ucuz. Şrift renderi də SDF-i məhz buna görə işlədir.
 *
 * Rəng: hər palitra rəngi öz SDF sahəsini alır ("bu piksel yaşıl sahənin nə qədər
 * dərinindədir?"), sahələr **öz aralığına normallaşdırılır**, piksel argmax-a gedir.
 * Normallaşdırma vacibdir: ölçmədə yarpağın sahəsi maksimum 1.34-ə çatır, gövdəninki
 * 3.88 — mütləq müqayisə kiçik hissələri tamamilə silirdi.
 */
import { PENS, penCriteria, INK_DEFAULT } from "./palette.js";

export const SIZES = [16, 32, 64];

/** Render çözünürlüyü → modeldən soruşulan çözünürlük. */
const ASK = { 16: 16, 32: 32, 64: 32 };
const COLOR_N = 16; // rəng sahələri alçaq tezliklidir, forma qədər dəqiqlik istəmir
const MAX_PER_CALL = 512; // score sualı noul-dan ~5× ağırdır
const SURFACE = 2.5; // sahənin sıfır xətti: bundan yuxarısı obyektin içidir

/** Forma rubrikası — 0..4, cavab arada float ola bilər. */
const DEPTH = [
  "far outside the object, empty background",
  "just outside the object's outline",
  "exactly on the object's outline",
  "just inside the object, near its edge",
  "deep inside the object",
];

/** Rəng rubrikası — eyni məntiq, konkret rəngli sahə üçün. */
const COLOR_DEPTH = (c) => [
  `far from any ${c} area`,
  `near a ${c} area but not inside it`,
  `right at the edge of a ${c} area`,
  `inside a ${c} area`,
  `deep inside a large ${c} area`,
];

export const meta = (N) => {
  const ask = ASK[N];
  const calls = Math.ceil((ask * ask) / MAX_PER_CALL);
  return {
    N,
    ad: `${N}×${N}`,
    alt: ask === N ? `${ask * ask} score · ${calls} çağırış` : `${ask}×${ask} soruşulur → ${N}×${N} render`,
    izah:
      N === 16
        ? "Ən etibarlı ölçü. Ölçmədə hər mövzuda təmiz çıxdı — 0% təkpiksel, tək komponent."
        : N === 32
          ? "Modelin ayırdetmə gücünün son sərhəddi. Bundan yuxarı birbaşa soruşmaq dağılır."
          : "32×32 SDF sahəsi bilinear böyüdülür. Birbaşa 4096 sual 15 ayrı parça verirdi — bu isə tək.",
  };
};

// --- sahə əməliyyatları ---------------------------------------------------

/** Bilinear böyütmə — SDF kəsilməz olduğu üçün aralıq dəyərlər mənalıdır. */
function upsample(field, M) {
  const n = field.length;
  if (n === M) return field;
  return [...Array(M)].map((_, R) =>
    [...Array(M)].map((_, C) => {
      const y = ((R + 0.5) * n) / M - 0.5;
      const x = ((C + 0.5) * n) / M - 0.5;
      const y0 = Math.max(0, Math.min(n - 1, Math.floor(y)));
      const x0 = Math.max(0, Math.min(n - 1, Math.floor(x)));
      const y1 = Math.min(n - 1, y0 + 1);
      const x1 = Math.min(n - 1, x0 + 1);
      const fy = y - y0;
      const fx = x - x0;
      return (
        field[y0][x0] * (1 - fx) * (1 - fy) +
        field[y0][x1] * fx * (1 - fy) +
        field[y1][x0] * (1 - fx) * fy +
        field[y1][x1] * fx * fy
      );
    })
  );
}

/** Sahəni öz min–maks aralığına sıxır ki, rənglər arasında müqayisə ədalətli olsun. */
function normalized(field) {
  const flat = field.flat();
  const lo = Math.min(...flat);
  const hi = Math.max(...flat);
  const span = Math.max(1e-6, hi - lo);
  return field.map((row) => row.map((v) => (v - lo) / span));
}

const spriteState = (N, subject, extra = {}) => ({
  task: `${N}x${N} pixel art sprite`,
  subject,
  axes: `r 0 = top, r ${N - 1} = bottom, c 0 = left, c ${N - 1} = right`,
  ...extra,
});

/** Bir SDF sahəsini soruşur; lazım gələndə sətir zolaqlarına bölünür. */
async function askField(session, { N, subject, criteria, note, signal, extra = {} }) {
  const rows = Math.max(1, Math.floor(MAX_PER_CALL / N));
  const jobs = [];
  for (let from = 0; from < N; from += rows) {
    const to = Math.min(N, from + rows);
    const q = {};
    for (let r = from; r < to; r++) {
      for (let c = 0; c < N; c++) q[`p${r}_${c}`] = { type: "score", instructions: `r=${r},c=${c}`, criteria };
    }
    jobs.push(
      session.call(
        spriteState(N, subject, { note, ...(to - from < N ? { band: `rows ${from}–${to - 1}` } : {}), ...extra }),
        q,
        { signal }
      )
    );
  }
  const out = await Promise.all(jobs);
  const field = [...Array(N)].map(() => Array(N).fill(0));
  for (const res of out) {
    for (const [k, a] of Object.entries(res.answers)) {
      const [, r, c] = k.match(/p(\d+)_(\d+)/).map(Number);
      field[r][c] = a.score;
    }
  }
  return { field, last: out[out.length - 1] };
}

// --- motor ----------------------------------------------------------------

export async function* run({ N, subject, color, paper, session, signal }) {
  paper.clear();
  const ask = ASK[N];
  let palette = null;

  // --- 1) palitra ---------------------------------------------------------
  if (color) {
    const res = await session.call(
      {
        task: "Choosing a small palette for a pixel art sprite.",
        subject,
        note: "A pixel art sprite reads best with few colours. Repeats are fine.",
      },
      {
        r1: { type: "choice", instructions: "Colour of the main body of the subject?", criteria: penCriteria() },
        r2: {
          type: "choice",
          instructions:
            "Colour of a clearly different second part — a leaf, a stem, a handle, a window, a face. Not the body colour.",
          criteria: penCriteria(),
        },
        r3: { type: "choice", instructions: "Colour of a small accent or detail?", criteria: penCriteria() },
        // Bu sual olmadan palitra HƏMİŞƏ ikinci rəng qaytarırdı: "ikinci hissənin
        // rəngi" sualı cavabsız qala bilmir. Nəticədə tək rəngli mövzular —
        // məsələn ürək — üzərinə yad ləkələr alırdı.
        cox_reng: {
          type: "noul",
          instructions: "Does this subject have a clearly visible second part in a different colour?",
          criteria: {
            true: "yes — a leaf, a stem, a handle, a face or similar, in its own colour",
            false: "no — it is essentially one solid colour",
          },
        },
        ucuncu: {
          type: "noul",
          instructions: "Does this sprite need a third colour at all?",
          criteria: { true: "yes, three colours", false: "two are enough" },
        },
      },
      { signal }
    );
    const a = res.answers;
    const want = a.cox_reng.noul < 0.5 ? 1 : a.ucuncu.noul >= 0.5 ? 3 : 2;
    palette = [...new Set([a.r1.choice, a.r2.choice, a.r3.choice].slice(0, want))]
      .map((id) => PENS[id])
      .filter(Boolean);
    if (!palette.length) palette = [PENS.qara];

    yield {
      kind: "step",
      res,
      text: "palitra",
      detail: palette.map((p) => p.az).join(" · "),
      conf: a.r1.confidence,
      swatches: palette.map((p) => p.hex),
      extra: `çoxrəngli ${a.cox_reng.noul.toFixed(2)} · 3-cü rəng ${a.ucuncu.noul.toFixed(2)}`,
    };
  }

  // --- 2) forma sahəsi ----------------------------------------------------
  const shape = await askField(session, {
    N: ask,
    subject,
    criteria: DEPTH,
    note: "For each pixel say how deep inside the object it lies.",
    signal,
  });
  const field = upsample(shape.field, N);
  const baseHex = palette ? palette[0].hex : INK_DEFAULT;
  paper.drawSprite(field, { colorAt: () => baseHex, surface: SURFACE });

  const sf = shape.field.flat();
  yield {
    kind: "step",
    res: shape.last,
    text: "forma sahəsi",
    detail: `${ask}×${ask} SDF`,
    p: Math.max(...sf) / 4,
    extra:
      `dərinlik ${Math.min(...sf).toFixed(2)}–${Math.max(...sf).toFixed(2)}` +
      (ask === N ? "" : ` · ${ask}→${N} böyüdüldü`),
  };

  // --- 3) rəng sahələri ---------------------------------------------------
  if (color && palette.length > 1) {
    const cn = Math.min(COLOR_N, ask);
    const fields = await Promise.all(
      palette.map((pen) =>
        askField(session, {
          N: cn,
          subject,
          criteria: COLOR_DEPTH(pen.en),
          note: `For each pixel say how deep inside a ${pen.en} coloured area of the sprite it lies.`,
          signal,
          extra: { colour: pen.en },
        }).then((f) => ({ pen, last: f.last, field: upsample(normalized(f.field), N) }))
      )
    );

    const colorAt = (r, c) => {
      let best = fields[0];
      for (const f of fields) if (f.field[r][c] > best.field[r][c]) best = f;
      return best.pen.hex;
    };

    const counts = new Map();
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        if (field[r][c] < SURFACE) continue;
        const hex = colorAt(r, c);
        counts.set(hex, (counts.get(hex) ?? 0) + 1);
      }
    }
    paper.drawSprite(field, { colorAt, surface: SURFACE });

    yield {
      kind: "step",
      res: fields[fields.length - 1].last,
      text: "rəng sahələri",
      detail: `${palette.length} × ${cn}×${cn} SDF`,
      swatches: [...counts.keys()],
      extra: [...counts.entries()]
        .map(([hex, n]) => `${palette.find((p) => p.hex === hex)?.az ?? "?"} ${n}px`)
        .join(" · "),
    };
  }

  yield { kind: "done", text: `${N}×${N} hazır`, extra: `${ask}×${ask} soruşuldu` };
}
