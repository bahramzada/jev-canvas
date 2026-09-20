/**
 * Piksel motoru — hər piksel bir JEV sualıdır.
 *
 * Quruluş: N×N `noul` — "bu piksel obyektə aiddir, yoxsa fondur?". Suallar bir
 * sorğuda paralel qiymətləndirilir, ona görə 16×16 və 32×32 tək çağırışa sığır.
 * 64×64 = 4096 sual 64k kontekstə sığmır, 4 sətir zolağına bölünür və zolaqlar
 * paralel gedir — bölünmə nəticəyə təsir etmir, çünki suallar onsuz da müstəqildir.
 *
 * Rəng ayrıca və kobud şəbəkədə soruşulur: 8×8 bölgə üçün `choice`. Səbəb ölçmədir —
 * quruluş yüksək çözünürlükdə işləyir, rəng isə bölgə səviyyəsində daha sabit çıxır.
 */
import { PENS, penCriteria, INK_DEFAULT } from "./palette.js";

export const SIZES = [16, 32, 64];
const MAP = 8; // rəng bölgələri şəbəkəsi
const MAX_PER_CALL = 1024; // bir sorğuda sual həddi (kontekstə görə)

export const meta = (N) => {
  const total = N * N;
  const calls = Math.ceil(total / MAX_PER_CALL);
  return {
    N,
    ad: `${N}×${N}`,
    alt: `${total.toLocaleString("az")} noul · ${calls} çağırış`,
    izah:
      N === 16
        ? "Ən kobud sprite. Hər piksel böyük qərardır, ona görə forma ən aydın oxunur."
        : N === 32
          ? "İkonlar üçün klassik ölçü. Bir çağırışda 1024 sual, hamısı paralel."
          : "4096 sual 64k kontekstə sığmır — dörd sətir zolağına bölünür, paralel gedir.",
  };
};

/** Bir zolağın sualları. Kriteriya yazmırıq: token sayını iki dəfə azaldır. */
function bandQuestions(N, from, to) {
  const q = {};
  for (let r = from; r < to; r++) {
    for (let c = 0; c < N; c++) q[`p${r}_${c}`] = { type: "noul", instructions: `r=${r},c=${c} ink?` };
  }
  return q;
}

const spriteState = (N, subject, extra = {}) => ({
  task: `${N}x${N} pixel art sprite, one decision per pixel`,
  subject,
  axes: `r 0 = top, r ${N - 1} = bottom, c 0 = left, c ${N - 1} = right`,
  note: "Decide for every pixel independently whether it belongs to the object or is empty background.",
  ...extra,
});

/** Sprite-ın 1-bit ASCII təsviri — rəng sualına kontekst kimi gedir. */
function asciiSprite(values) {
  const flat = values.flat();
  const lo = Math.min(...flat);
  const hi = Math.max(...flat);
  const th = lo + (hi - lo) * 0.55;
  return values.map((row, i) => `${String(i).padStart(2)}: ${row.map((v) => (v >= th ? "#" : ".")).join("")}`);
}

export async function* run({ N, subject, color, paper, session, signal }) {
  paper.clear();

  const values = [...Array(N)].map(() => Array(N).fill(0));
  let colorAt = () => INK_DEFAULT;
  let palette = null;

  // --- 1) rəngli rejimdə əvvəlcə palitra -----------------------------------
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
            "Colour of a clearly different second part of the subject — a leaf, a stem, a handle, a window, a face. Not the body colour.",
          criteria: penCriteria(),
        },
        r3: { type: "choice", instructions: "Colour of a small accent or detail on the subject?", criteria: penCriteria() },
        r4: { type: "choice", instructions: "One more colour, if the subject has yet another distinct part?", criteria: penCriteria() },
        dordunku: {
          type: "noul",
          instructions: "Does this sprite need a fourth colour at all?",
          criteria: { true: "yes, four colours", false: "three or fewer are enough" },
        },
      },
      { signal }
    );
    const a = res.answers;
    const want = a.dordunku.noul >= 0.5 ? 4 : 3;
    palette = [...new Set([a.r1.choice, a.r2.choice, a.r3.choice, a.r4.choice].slice(0, want))]
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
      extra: `4-cü rəng ${a.dordunku.noul.toFixed(2)}`,
    };
  }

  // --- 2) quruluş zolaqları + rəng xəritəsi paralel ------------------------
  const rowsPer = Math.min(N, Math.max(1, Math.floor(MAX_PER_CALL / N)));
  const bands = [];
  for (let from = 0; from < N; from += rowsPer) {
    const to = Math.min(N, from + rowsPer);
    bands.push(
      session
        .call(
          spriteState(N, subject, N > rowsPer ? { band: `this request covers rows ${from}–${to - 1} of the same sprite` } : {}),
          bandQuestions(N, from, to),
          { signal }
        )
        .then((res) => ({ res, from, to }))
    );
  }

  // zolaqlar gəldikcə sprite yenilənir — canlı görünsün
  let filled = 0;
  for (const band of bands) {
    const { res, from, to } = await band;
    for (let r = from; r < to; r++) {
      for (let c = 0; c < N; c++) values[r][c] = res.answers[`p${r}_${c}`].noul;
    }
    filled = to;

    const seen = values.slice(0, filled).flat();
    const lo = Math.min(...seen);
    const hi = Math.max(...seen);
    paper.drawSprite(values, { colorAt, lo, hi });

    yield {
      kind: "step",
      res,
      text: N > rowsPer ? `sətir ${from}–${to - 1}` : "quruluş",
      detail: `${(to - from) * N} sual`,
      p: hi,
      extra: `${lo.toFixed(2)}–${hi.toFixed(2)}`,
    };
  }

  // --- 3) rəng xəritəsi ----------------------------------------------------
  // Quruluşdan SONRA soruşulur və hazır sprite state-ə verilir. Paralel gedəndə
  // model hansı bölgənin dolu olduğunu bilmirdi və hamısına eyni rəngi verirdi.
  if (color && palette.length > 1) {
    const q = {};
    const criteria = { ...Object.fromEntries(palette.map((p) => [p.az, p.en])), bos: "nothing here, empty background" };
    for (let r = 0; r < MAP; r++) {
      for (let c = 0; c < MAP; c++) {
        q[`m${r}_${c}`] = {
          type: "choice",
          instructions: `Region row ${r}, column ${c} of ${MAP}: which colour do the filled pixels there take?`,
          criteria,
        };
      }
    }
    const res = await session.call(
      {
        task: `Colouring a finished ${N}x${N} pixel art sprite, region by region.`,
        subject,
        sprite: asciiSprite(values),
        legend: "'#' = a filled pixel of the sprite, '.' = empty background",
        axes: `the sprite above is split into ${MAP}x${MAP} equal regions; region row 0 = top, column 0 = left`,
        palette: palette.map((p) => p.en),
        note: "Different parts of the subject take different colours — the body, a leaf or stem, a highlight.",
      },
      q,
      { signal }
    );
    const grid = [...Array(MAP)].map((_, r) =>
      [...Array(MAP)].map((_, c) => {
        const pick = res.answers[`m${r}_${c}`].choice;
        return PENS[Object.keys(PENS).find((k) => PENS[k].az === pick)]?.hex ?? palette[0].hex;
      })
    );
    colorAt = (r, c) =>
      grid[Math.min(MAP - 1, Math.floor((r / N) * MAP))][Math.min(MAP - 1, Math.floor((c / N) * MAP))];

    const flat = values.flat();
    paper.drawSprite(values, { colorAt, lo: Math.min(...flat), hi: Math.max(...flat) });

    const used = new Set(grid.flat());
    yield {
      kind: "step",
      res,
      text: "rəng xəritəsi",
      detail: `${MAP}×${MAP} bölgə`,
      swatches: [...used],
      extra: `${used.size} rəng işlədildi`,
    };
  }

  const flat = values.flat();
  const lo = Math.min(...flat);
  const hi = Math.max(...flat);
  yield {
    kind: "done",
    text: `${N}×${N} hazır`,
    extra: `ehtimal aralığı ${lo.toFixed(2)}–${hi.toFixed(2)}`,
    values,
  };
}
