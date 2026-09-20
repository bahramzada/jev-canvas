/**
 * Ehtimal sahəsi — 24×24 = 576 noul, bir çağırışda.
 *
 * Burada tuvalın özü ehtimal xəritəsidir: hər xananın mürəkkəb ehtimalı
 * yarımton nöqtəsinin ölçüsünə çevrilir. Rəngli rejimdə JEV əvvəlcə qələmləri
 * seçir, sonra hər qələm üçün ayrıca sahə çəkilir — riso çapındakı rəng
 * ayırmaları kimi, üst-üstə düşəndə yüngül registrasiya sürüşməsi ilə.
 *
 * Ölçmə: 24×24 bilərəkdən seçilib — 32×32-də ayırdetmə gücü düşür (0.390 → 0.357).
 */
import { PENS, penCriteria } from "../primitives.js";

export const meta = {
  id: "field",
  ad: "Ehtimal sahəsi",
  olcu: "24×24",
  alt: "noul · 576 sual",
  izah:
    "Bir çağırışda 576 ayrı 'bu xana mürəkkəblidirmi?' sualı. " +
    "Nöqtənin böyüklüyü birbaşa ehtimaldır — heç nə yuvarlaqlaşdırılmır.",
};

const N = 24;
const MAX_LAYERS = 3;
const OFFSETS = [
  [0, 0],
  [3, -2.5],
  [-2.5, 3],
];

function fieldQuestions(inkName) {
  const q = {};
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      q[`p${r}_${c}`] = {
        type: "noul",
        instructions: {
          pixel: { row: r, col: c },
          question: `Is pixel (row=${r}, col=${c}) part of the ${inkName} ink of the picture?`,
        },
        criteria: {
          true: `this pixel is inside the drawn shape (${inkName} ink)`,
          false: "this pixel is empty background (blank paper)",
        },
      };
    }
  }
  return q;
}

const baseState = (subject, extra = {}) => ({
  task: `Pixel art on a ${N}x${N} grid.`,
  subject,
  coordinates: `row 0 = top, row ${N - 1} = bottom, col 0 = left, col ${N - 1} = right`,
  note:
    "Decide for every pixel independently whether it is ink or background, " +
    "so that together the pixels form the subject.",
  ...extra,
});

export async function* run({ subject, color, paper, session, signal }) {
  paper.clear();
  paper.clearUnder();
  paper.gridOverlay(N, N, { alpha: 0.07 });

  let pens = [PENS.qara];

  if (color) {
    const res = await session.call(
      { task: "Choosing plotter pens for a picture.", subject, note: "Pick pens that suit the subject; they may repeat if one colour is enough." },
      {
        qelem_1: { type: "choice", instructions: "Main ink pen for this picture?", criteria: penCriteria() },
        qelem_2: { type: "choice", instructions: "Second ink pen, for a contrasting layer?", criteria: penCriteria() },
        qelem_3: { type: "choice", instructions: "Third ink pen, for accents?", criteria: penCriteria() },
        uc_reng: {
          type: "noul",
          instructions: "Does this picture need a third colour at all?",
          criteria: { true: "yes, three inks", false: "two inks are enough" },
        },
      },
      { signal }
    );
    const a = res.answers;
    const wanted = a.uc_reng.noul >= 0.5 ? 3 : 2;
    const ids = [a.qelem_1.choice, a.qelem_2.choice, a.qelem_3.choice].slice(0, wanted);
    pens = [...new Set(ids)].map((id) => PENS[id]).filter(Boolean).slice(0, MAX_LAYERS);
    if (!pens.length) pens = [PENS.qara];

    yield {
      kind: "step",
      res,
      text: "palitra",
      detail: pens.map((p) => p.az).join(" · "),
      conf: a.qelem_1.confidence,
      extra: `3-cü rəng ${a.uc_reng.noul.toFixed(2)}`,
    };
  }

  // qatlar paralel gedir — hər biri müstəqil 576 suallıq bir çağırış
  const layers = pens.map((pen, i) =>
    session
      .call(
        baseState(subject, pens.length > 1 ? { layer: `the ${pen.en} separation of a ${pens.length}-colour print` } : {}),
        fieldQuestions(pens.length > 1 ? pen.en : "black"),
        { signal }
      )
      .then((res) => ({ res, pen, i }))
  );

  for (const layer of layers) {
    const { res, pen, i } = await layer;
    const values = [...Array(N)].map((_, r) =>
      [...Array(N)].map((_, c) => res.answers[`p${r}_${c}`].noul)
    );
    const flat = values.flat();
    const peak = Math.max(...flat);
    const floor = Math.min(...flat);
    // Paylanma çox vaxt dar bir zolağa (məs. 0.35–0.60) sıxılır; xam dəyərlə
    // çəksək bütün nöqtələr eyni böyüklükdə çıxır. Min–maks dartması quruluşu açır.
    const span = peak - floor;
    const lo = span > 0.12 ? floor + span * 0.12 : 0;
    const hi = span > 0.12 ? peak : Math.max(peak, 0.35);

    paper.halftone(values, {
      cols: N,
      rows: N,
      pen: pen.hex,
      offset: OFFSETS[i % OFFSETS.length],
      min: lo,
      max: hi,
      gamma: 1.25,
    });

    const mean = flat.reduce((a, b) => a + b, 0) / (N * N);
    yield {
      kind: "step",
      res,
      text: pen.az,
      detail: `${N}×${N} sahə`,
      p: peak,
      conf: null,
      pen: pen.az,
      extra: `${floor.toFixed(2)}–${peak.toFixed(2)} · orta ${mean.toFixed(2)}`,
    };
  }
}
