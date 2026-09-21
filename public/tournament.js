/**
 * Turnir rejimi — JEV çəkmir, seçir.
 *
 * Rəsmi bələdçi bir cümlə ilə qaydanı verir: "Don't ask Jev to generate X —
 * instead pick the right candidate from these options. This reframing — from
 * generation to selection — dramatically improves reliability."
 *
 * Ona görə burada sprite-ı **kod** istehsal edir, JEV isə yalnız hakimdir:
 *
 *   1. təsvir  — JEV mövzu haqqında ümumi mülahizə sualları cavablayır
 *                (forma ailəsi? hündür? neçə hissə? simmetrik?) — sənədli güclü tərəfi
 *   2. generasiya — kod bu təsvir ətrafında 96 namizəd qurur (API-siz, ani)
 *   3. seçim   — bir `choice` çağırışı 96 namizədin HAMISI üçün ehtimal qaytarır;
 *                bu paylanma birbaşa fitness funksiyasıdır
 *   4. mutasiya — qaliblər cütləşir, yeni nəsil qurulur, 3-cü addıma qayıdılır
 *
 * Niyə müqayisəli seçim, niyə mütləq bal yox — ölçdük:
 *   mütləq noul:  alma sprite-ı 0.35, ağac sprite-ı 0.42, ulduz 0.40  → ayırd etmir
 *   müqayisəli choice: alma 0.61, ağac 0.33, ulduz 0.06, kvadrat 0.00 → ayırd edir
 * Keyfiyyət sıralaması da düzgün çıxdı: saplı alma 0.60 > sapsız 0.22 > əyri 0.11
 * > deşikli 0.07. Yəni paylanma həqiqi keyfiyyət ölçüsüdür.
 *
 * Genom çözünürlükdən asılı deyil: mühakimə 16×16-da gedir (ölçmədə ən etibarlı
 * ölçü), qalib isə istənilən çözünürlükdə render olunur.
 */
import { PENS, penCriteria } from "./palette.js";

export const GENERATIONS = 6;
const POP = 96; // ölçmə: 64 namizəd = 623ms / 9.8k token, 128 = 671ms / 19k; 255 tavandır
const JUDGE_N = 16; // mühakimə çözünürlüyü
const ELITE = 2;

// --- genom ----------------------------------------------------------------
// Lobe = {x, y, rx, ry, c, t, lock}
//   t    forma tipi: 0 ellips · 1 üçbucaq (zirvə yuxarı) · 2 düzbucaqlı · 3 üçbucaq (zirvə aşağı)
//   lock mərkəzə kilid: x = 0.5, güzgülənmir
//
// Kilid ona görə lazımdır ki, simmetrik mövzularda mərkəzdən kənar hər lobe
// güzgülənir — şam ağacının gövdəsi bu səbəbdən iki ayağa bölünürdü. Kilidli
// lobe oxun üstündə tək qalır.

const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/** Forma ailəsi təsvirləri — həm təsvir sualında, həm də mühakimədə eyni mətn işlənir. */
export const FAMILY_DESC = {
  dairevi: "rounded and organic — circles, ovals, soft blobs",
  ucbucaqli: "triangular or cone-like — wide at the bottom, narrowing towards the top",
  bucaqli: "boxy and angular — rectangles, straight edges, flat sides",
  qarisiq: "a mix of rounded and angular parts",
};

/*
 * Sınandı və geri alındı: mühakiməyə ikinci ox (forma ailəsinə uyğunluq sualı)
 * əlavə etmək. Təcrid olunmuş ölçmədə işləyirdi — şam ağacı namizədlərində
 * qalibi ovaldan konusa çevirirdi (0.41 vs 0.38) və nəzarət mövzusuna zərər
 * vermirdi (göbələk 0.72 → 0.82). Amma canlı dörd mövzuda tanınma sayı
 * dəyişmədi (1/4), qiymət isə $0.006 → $0.0109 qalxdı, çünki ikinci sual
 * bütün namizəd kriteriyalarını təkrarlayır. Faydası qiymətini ödəmədi.
 */

/** Forma ailəsinə görə tip paylanması — JEV-in cavabı ilk populyasiyanı yönləndirir. */
export const FAMILY = {
  dairevi: [0.82, 0.05, 0.08, 0.05],
  ucbucaqli: [0.2, 0.52, 0.13, 0.15],
  bucaqli: [0.18, 0.05, 0.7, 0.07],
  qarisiq: [0.45, 0.2, 0.22, 0.13],
};

function pickType(w) {
  const r = Math.random();
  let acc = 0;
  for (let i = 0; i < w.length; i++) {
    acc += w[i];
    if (r <= acc) return i;
  }
  return 0;
}

/**
 * Lobenin verilmiş nöqtədəki "içəridəlik" dərinliyi, 0..1.
 * Piksel ən dərin lobenin rəngini alır — formalar metaball kimi birləşir.
 */
function depthAt(l, x, y) {
  const dx = (x - l.x) / l.rx;
  const dy = (y - l.y) / l.ry;
  if (l.t === 1 || l.t === 3) {
    const v = l.t === 1 ? (dy + 1) / 2 : (1 - dy) / 2; // 0 zirvədə, 1 oturacaqda
    if (v <= 0 || v > 1) return 0;
    const inside = 1 - Math.abs(dx) / v;
    return inside <= 0 ? 0 : Math.min(inside, v);
  }
  if (l.t === 2) return 1 - Math.max(Math.abs(dx), Math.abs(dy));
  return 1 - Math.hypot(dx, dy);
}

function randomGenome(spec, colors) {
  // JEV-in verdiyi spec yalnız MEYLDİR, qəlib deyil. Hissə sayı, simmetriya,
  // mövqe və forma tipi onun ətrafında gəzir ki, birinci nəsil həqiqətən
  // müxtəlif olsun — əks halda seçimin seçəcək bir şeyi qalmır.
  const n = clamp(spec.parts + Math.round(rnd(-1.4, 1.4)), 1, 5);
  const sym = Math.random() < (spec.sym ? 0.8 : 0.25);
  const lobes = [];
  for (let i = 0; i < n; i++) {
    const main = i === 0;
    const lock = sym && (main || Math.random() < 0.4);
    lobes.push({
      x: lock ? 0.5 : sym ? rnd(0.22, 0.5) : rnd(0.18, 0.82),
      y: main ? rnd(0.32, 0.7) : rnd(0.08, 0.92),
      rx: (main ? rnd(0.16, 0.44) : rnd(0.05, 0.26)) * spec.wide,
      ry: (main ? rnd(0.16, 0.44) : rnd(0.05, 0.26)) * spec.tall,
      c: main ? 0 : Math.floor(rnd(0, colors)),
      t: pickType(spec.weights),
      lock,
    });
  }
  return { lobes, sym };
}

function mutate(g, colors, rate = 1, weights) {
  const lobes = g.lobes.map((l) => {
    const lock = Math.random() < 0.1 * rate ? !l.lock : l.lock;
    return {
      x: lock ? 0.5 : clamp((l.lock ? 0.5 : l.x) + rnd(-0.07, 0.07) * rate, 0.1, 0.9),
      y: clamp(l.y + rnd(-0.07, 0.07) * rate, 0.1, 0.9),
      rx: clamp(l.rx * rnd(1 - 0.22 * rate, 1 + 0.22 * rate), 0.05, 0.48),
      ry: clamp(l.ry * rnd(1 - 0.22 * rate, 1 + 0.22 * rate), 0.05, 0.48),
      c: Math.random() < 0.12 * rate ? Math.floor(rnd(0, colors)) : l.c,
      t: Math.random() < 0.14 * rate ? pickType(weights) : l.t,
      lock,
    };
  });
  if (Math.random() < 0.15 * rate && lobes.length < 6) {
    const lock = Math.random() < 0.35;
    lobes.push({
      x: lock ? 0.5 : rnd(0.2, 0.8),
      y: rnd(0.1, 0.9),
      rx: rnd(0.06, 0.22),
      ry: rnd(0.06, 0.22),
      c: Math.floor(rnd(0, colors)),
      t: pickType(weights),
      lock,
    });
  }
  if (Math.random() < 0.12 * rate && lobes.length > 1) lobes.splice(Math.floor(rnd(1, lobes.length)), 1);
  return { lobes, sym: g.sym };
}

/** İki genomu birləşdirir — lobe-lar qarışıq götürülür. */
function cross(a, b) {
  const n = Math.max(a.lobes.length, b.lobes.length);
  const lobes = [];
  for (let i = 0; i < n; i++) {
    const src = Math.random() < 0.5 ? a.lobes[i] : b.lobes[i];
    if (src) lobes.push({ ...src });
  }
  return { lobes: lobes.length ? lobes : [...a.lobes], sym: Math.random() < 0.5 ? a.sym : b.sym };
}

/** Genomu N×N indeks şəbəkəsinə çevirir: 0 = boş, 1..K = palitra indeksi. */
export function render(g, N) {
  const grid = [...Array(N)].map(() => new Uint8Array(N));
  const lobes = [];
  for (const l of g.lobes) {
    const base = l.lock ? { ...l, x: 0.5 } : l;
    lobes.push(base);
    if (g.sym && !l.lock) lobes.push({ ...base, x: 1 - base.x });
  }
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      const y = (r + 0.5) / N;
      const x = (c + 0.5) / N;
      let best = 0;
      let depth = 0;
      for (const l of lobes) {
        const d = depthAt(l, x, y);
        if (d > depth) {
          depth = d;
          best = l.c + 1;
        }
      }
      grid[r][c] = best;
    }
  }
  return grid;
}

/** JEV-ə gedən mətn təsviri. Rəngli rejimdə rəqəmlər palitra indeksidir. */
function ascii(grid, colored) {
  return grid
    .map((row, i) => `${String(i).padStart(2)}: ${[...row].map((v) => (v ? (colored ? String(v) : "#") : ".")).join("")}`)
    .join(" | ");
}

// --- motor ----------------------------------------------------------------

export const meta = (gen) => ({
  ad: `Nəsil ${gen + 1}`,
  alt: gen === 0 ? `${POP} namizəd · təsadüfi` : `${POP} namizəd · mutasiya`,
  izah:
    gen === 0
      ? `Kod JEV-in təsvirini meyl kimi götürüb ${POP} təsadüfi namizəd qurur. Heç biri hələ seçilməyib.`
      : "Əvvəlki nəslin qalibləri cütləşib mutasiya olunur. JEV bir çağırışda hamısını qiymətləndirir.",
});

export async function* run({ subject, color, papers, session, signal, renderN = 32 }) {
  // --- 1) JEV mövzunu təsvir edir (generasiya yox, mülahizə) --------------
  const tesvir = {
    nisbet: {
      type: "score",
      instructions: "What are the proportions of this subject when drawn as a small sprite?",
      criteria: [
        "much wider than it is tall, a flat horizontal shape",
        "somewhat wider than tall",
        "roughly square, as wide as it is tall",
        "somewhat taller than wide",
        "much taller than it is wide, a narrow vertical shape",
      ],
    },
    hisse: {
      type: "choice",
      instructions: "How many visually distinct parts does this subject have?",
      criteria: {
        bir: "a single solid mass, no separate parts",
        iki: "two parts — a main mass plus one smaller attached piece",
        uc: "three distinct parts",
        dord: "four or more distinct parts",
      },
    },
    forma: {
      type: "choice",
      instructions: "What is the overall shape family of this subject when drawn as a simple silhouette?",
      criteria: FAMILY_DESC,
    },
    simmetrik: {
      type: "noul",
      instructions: "Is this subject left-right symmetric?",
      criteria: { true: "the left and right halves mirror each other", false: "the two halves clearly differ" },
    },
    ...(color
      ? {
          r1: { type: "choice", instructions: "Colour of the main body of the subject?", criteria: penCriteria() },
          r2: {
            type: "choice",
            instructions: "Colour of a clearly different second part — a leaf, a stem, a handle, a face. Not the body colour.",
            criteria: penCriteria(),
          },
          // tək rəngli mövzuda ikinci rəngi məcbur etməmək üçün — bax pixel.js
          cox_reng: {
            type: "noul",
            instructions: "Does this subject have a clearly visible second part in a different colour?",
            criteria: {
              true: "yes — a leaf, a stem, a handle, a face or similar, in its own colour",
              false: "no — it is essentially one solid colour",
            },
          },
        }
      : {}),
  };

  const res0 = await session.call(
    { task: "Describing a subject so it can be drawn as a small pixel sprite.", subject },
    tesvir,
    { signal }
  );
  const a = res0.answers;
  const partsMap = { bir: 1, iki: 2, uc: 3, dord: 4 };
  const spec = {
    parts: partsMap[a.hisse.choice] ?? 2,
    sym: a.simmetrik.noul >= 0.5,
    aile: FAMILY_DESC[a.forma.choice] ? a.forma.choice : "qarisiq",
    weights: FAMILY[a.forma.choice] ?? FAMILY.qarisiq,
    tall: 0.72 + (a.nisbet.score / 4) * 0.56,
    wide: 1.28 - (a.nisbet.score / 4) * 0.56,
  };

  const palette = color
    ? [...new Set(a.cox_reng.noul >= 0.5 ? [a.r1.choice, a.r2.choice] : [a.r1.choice])]
        .map((id) => PENS[id])
        .filter(Boolean)
    : [PENS.qara];
  if (!palette.length) palette.push(PENS.qara);

  yield {
    kind: "step",
    res: res0,
    text: "təsvir",
    detail: `${a.forma.choice} · ${spec.parts} hissə · ${spec.sym ? "simmetrik" : "asimmetrik"}`,
    conf: a.forma.confidence,
    swatches: color ? palette.map((p) => p.hex) : null,
    extra: `nisbət ${a.nisbet.score.toFixed(1)}/4 · simmetriya ${a.simmetrik.noul.toFixed(2)}`,
  };

  // --- 2) nəsillər --------------------------------------------------------
  let pop = [...Array(POP)].map(() => randomGenome(spec, palette.length));
  const hexes = palette.map((p) => p.hex);
  const colored = color && palette.length > 1;

  for (let gen = 0; gen < GENERATIONS; gen++) {
    const criteria = {};
    pop.forEach((g, i) => {
      criteria[`n${i}`] = ascii(render(g, JUDGE_N), colored);
    });

    const state = {
      task: `Picking the best ${JUDGE_N}x${JUDGE_N} pixel art sprite of a subject from a set of candidates.`,
      subject,
      legend: colored
        ? `'.' = empty background; ${palette.map((p, i) => `'${i + 1}' = ${p.en}`).join(", ")}`
        : "'#' = a filled pixel, '.' = empty background",
      note: "Every candidate is the same sprite grid, row by row, separated by ' | '.",
    };

    const res = await session.call(
      state,
      {
        secim: {
          type: "choice",
          instructions: `Which candidate is the best pixel art sprite of "${subject}"?`,
          criteria,
        },
      },
      { signal }
    );

    // Paylanmanın ÖZÜ fitness-dir — yalnız qalib deyil, hamısının balı var.
    const P = res.answers.secim.probabilities;
    const scored = pop
      .map((g, i) => ({ g, i, p: P[`n${i}`] ?? 0 }))
      .sort((x, y) => y.p - x.p);

    const winner = scored[0];
    papers[gen].drawPixels(render(winner.g, renderN), hexes);

    yield {
      kind: "step",
      res,
      gen,
      text: `nəsil ${gen + 1}`,
      detail: `qalib n${winner.i}`,
      p: winner.p,
      conf: res.answers.secim.confidence,
      extra: `${POP} namizəd · 2-ci ${scored[1].p.toFixed(3)} · ${winner.g.lobes.length} lobe`,
    };

    if (gen === GENERATIONS - 1) break;

    // --- 3) seçim və mutasiya ---------------------------------------------
    // Fitness-ə mütənasib rulet seçimi; ilk ELITE genom toxunulmaz qalır.
    // Xam paylanma yastıdır (64 namizəddə qalib ~0.10, bərabər bölgü 0.016),
    // ona görə rulet birbaşa ehtimalla işləyəndə seçim demək olar təsadüfi olur.
    // Kub fitness-i qalibləri qabardır və konvergensiyanı mənalı edir.
    const w = scored.map((x) => ({ g: x.g, w: Math.pow(x.p, 3) }));
    const total = w.reduce((s, x) => s + x.w, 0) || 1;
    const parent = () => {
      let t = Math.random() * total;
      for (const x of w) if ((t -= x.w) <= 0) return x.g;
      return w[0].g;
    };
    const rate = 1.25 - (gen / GENERATIONS) * 0.8; // əvvəl geniş axtarış, sonra incə tənzimləmə
    const next = scored.slice(0, ELITE).map((x) => x.g);
    while (next.length < POP) next.push(mutate(cross(parent(), parent()), palette.length, rate, spec.weights));
    pop = next;
  }

  yield { kind: "done", text: `${GENERATIONS} nəsil bitdi`, extra: `${GENERATIONS * POP} namizəd qiymətləndirildi` };
}
