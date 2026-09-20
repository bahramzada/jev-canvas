/**
 * Vektor rejimi — 960×960, şəbəkəsiz.
 *
 * Burada koordinat yuvarlaqlaşdırılmır: `score` cavabı səviyyələr arasında qalan
 * float-dur, ona görə element istənilən nöqtəyə düşə bilər. Bir əlavə üstünlük:
 * score-un `confidence` dəyəri "bu mövqe nə qədər vacibdir"i bildirir — günəşin
 * üfüqi yeri üçün model 0.00 əminlik verir, çünki hara qoysan doğrudur.
 * Aşağı əminlik xətti tərəddüdlü, yüksək əminlik tək və təmiz çəkir.
 *
 * İki çağırış: (1) hansı elementlər var, (2) hamısının koordinatı bir anda.
 */
import { PRIMITIVES, PRIMITIVE_BY_ID, PENS, penCriteria } from "../primitives.js";
import { PAPER_SIZE } from "../paper.js";

export const meta = {
  id: "vector",
  ad: "Vektor",
  olcu: "960 px",
  alt: "score · kəsilməz",
  izah:
    "Şəbəkə yoxdur: mövqe, ölçü və döngə kəsilməz `score` dəyərləridir. " +
    "Xəttin tərəddüdü birbaşa JEV-in əminliyindən gəlir.",
};

const MAX_ELEMENTS = 6;
const MARGIN = 90;

const POS_X = [
  "hard against the left edge",
  "in the left margin",
  "left of centre",
  "slightly left of centre",
  "centred",
  "slightly right of centre",
  "right of centre",
  "in the right margin",
  "hard against the right edge",
];
const POS_Y = [
  "at the very top of the picture",
  "high in the sky area",
  "upper third",
  "just above the middle",
  "at the middle height",
  "just below the middle",
  "lower third",
  "near the bottom",
  "resting on the bottom edge",
];
const SIZE_LEVELS = [
  "a tiny detail",
  "small",
  "modest",
  "medium",
  "noticeably large",
  "large",
  "very large",
  "dominating",
  "filling most of the canvas",
];
const TILT = [
  "tilted strongly counter-clockwise",
  "tilted counter-clockwise",
  "slightly tilted counter-clockwise",
  "upright",
  "slightly tilted clockwise",
  "tilted clockwise",
  "tilted strongly clockwise",
];

const lerp = (ans, levels, min, max) =>
  min + Math.max(0, Math.min(1, ans.score / (levels.length - 1))) * (max - min);

export async function* run({ subject, color, paper, session, signal }) {
  paper.clear();
  paper.clearUnder();

  // 1) Hansı elementlər bu şəklə aiddir? — hamısı bir çağırışda, paralel
  const secim = {};
  for (const p of PRIMITIVES) {
    secim[p.id] = {
      type: "noul",
      instructions: `Does "${p.en}" belong in this picture?`,
      criteria: { true: `yes — ${p.desc} belongs here`, false: "no, it does not belong" },
    };
  }
  const res1 = await session.call(
    { task: "Choosing which shapes a line drawing should contain.", subject, vocabulary_note: "Only these shapes can be drawn." },
    secim,
    { signal }
  );

  const secilmis = PRIMITIVES.map((p) => ({ p, v: res1.answers[p.id].noul }))
    .filter((x) => x.v >= 0.5)
    .sort((a, b) => b.v - a.v)
    .slice(0, MAX_ELEMENTS);

  if (!secilmis.length) {
    const enYaxsi = PRIMITIVES.map((p) => ({ p, v: res1.answers[p.id].noul })).sort((a, b) => b.v - a.v)[0];
    secilmis.push(enYaxsi);
  }

  yield {
    kind: "step",
    res: res1,
    text: "seçim",
    detail: secilmis.map((x) => x.p.az).join(" · "),
    p: secilmis[0].v,
    extra: `${secilmis.length} element · ${PRIMITIVES.length} sualdan`,
  };

  // 2) Hamısının koordinatı bir çağırışda
  const yerlesdirme = {};
  for (const { p } of secilmis) {
    yerlesdirme[`${p.id}__x`] = { type: "score", instructions: `Horizontal position of the ${p.en}`, criteria: POS_X };
    yerlesdirme[`${p.id}__y`] = { type: "score", instructions: `Vertical position of the ${p.en}`, criteria: POS_Y };
    yerlesdirme[`${p.id}__s`] = { type: "score", instructions: `How large should the ${p.en} be drawn?`, criteria: SIZE_LEVELS };
    yerlesdirme[`${p.id}__r`] = { type: "score", instructions: `How is the ${p.en} tilted?`, criteria: TILT };
    if (color) {
      yerlesdirme[`${p.id}__q`] = { type: "choice", instructions: `Which ink pen draws the ${p.en}?`, criteria: penCriteria() };
    }
  }

  const res2 = await session.call(
    {
      task: "Placing every shape of a line drawing on a square canvas at once.",
      subject,
      canvas: "A square picture. Left/right and top/bottom are described in the rubrics.",
      elements: secilmis.map((x) => x.p.en),
    },
    yerlesdirme,
    { signal }
  );

  // böyükdən kiçiyə — fon əvvəl, detal sonra
  const items = secilmis
    .map(({ p, v }) => {
      const a = res2.answers;
      return {
        p,
        v,
        x: lerp(a[`${p.id}__x`], POS_X, MARGIN, PAPER_SIZE - MARGIN),
        y: lerp(a[`${p.id}__y`], POS_Y, MARGIN, PAPER_SIZE - MARGIN),
        r: lerp(a[`${p.id}__s`], SIZE_LEVELS, 34, 300),
        rot: lerp(a[`${p.id}__r`], TILT, -0.42, 0.42),
        conf: (a[`${p.id}__x`].confidence + a[`${p.id}__y`].confidence) / 2,
        pen: color ? PENS[a[`${p.id}__q`]?.choice]?.hex ?? PENS.qara.hex : PENS.qara.hex,
        penAd: color ? PENS[a[`${p.id}__q`]?.choice]?.az ?? "qara" : null,
      };
    })
    .sort((a, b) => b.r - a.r);

  for (const it of items) {
    paper.drawPrimitive(it.p, it.x, it.y, it.r, {
      confidence: it.conf,
      rotation: it.rot,
      pen: it.pen,
      width: 2.6,
    });

    yield {
      kind: "step",
      res: null,
      text: it.p.az,
      detail: `${Math.round(it.x)},${Math.round(it.y)}`,
      p: it.v,
      conf: it.conf,
      pen: it.penAd,
      extra: `r=${Math.round(it.r)} · döngə ${(it.rot * 57.3).toFixed(0)}°`,
    };
  }

  yield { kind: "done", text: `${items.length} element yerləşdi`, res: res2 };
}
