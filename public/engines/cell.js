/**
 * Xana rejimi — 16×15 = 240 xana.
 *
 * Hər addımda bir JEV çağırışı dörd qərar verir: nə · harada · nə boyda · bitdimi.
 * "Harada" sualı bir `choice`-dur və 240 xananın hamısı üçün ehtimal qaytarır —
 * arxadakı istilik ləkəsi məhz odur. Seçilən xana yox, bütöv paylanma görünür.
 */
import { PRIMITIVE_BY_ID, primitiveCriteria, PENS, penCriteria } from "../primitives.js";
import { PAPER_SIZE } from "../paper.js";

export const meta = {
  id: "cell",
  ad: "Xana",
  olcu: "16×15",
  alt: "choice · 240 xana",
  izah:
    "Hər addımda bir çağırış: nə çəkilsin, hansı xanada, nə boyda, bitdimi. " +
    "Arxadakı ləkə — 240 xananın hamısının ehtimalı.",
};

const COLS = 16;
const ROWS = 15;
const MAX_STEPS = 10;

const CELLS = {};
for (let r = 0; r < ROWS; r++) {
  for (let c = 0; c < COLS; c++) {
    CELLS[`r${r}c${c}`] = `row ${r}, column ${c}`;
  }
}

const SIZE_LEVELS = [
  "tiny detail",
  "very small",
  "small",
  "modest",
  "medium",
  "fairly large",
  "large",
  "very large",
  "dominates the picture",
  "fills almost the whole canvas",
];

export async function* run({ subject, color, paper, session, signal }) {
  paper.clear();
  paper.clearUnder();
  paper.gridOverlay(COLS, ROWS);

  const placed = [];
  // Tutulmuş xanalar variant siyahısından çıxarılır. State-ə "burada artıq nə var"
  // yazmaq kifayət etmirdi — model eyni mərkəzi xananı təkrar-təkrar seçirdi.
  const tutulmus = new Set();

  for (let step = 0; step < MAX_STEPS; step++) {
    const bosXanalar = Object.fromEntries(
      Object.entries(CELLS).filter(([id]) => !tutulmus.has(id))
    );
    if (Object.keys(bosXanalar).length < 2) return;

    const questions = {
      element: {
        type: "choice",
        instructions:
          "Which shape should be drawn next so that the picture gets closer to the subject?",
        criteria: primitiveCriteria(),
      },
      yer: {
        type: "choice",
        instructions:
          "In which cell should the centre of that shape be placed? Consider what is already drawn.",
        criteria: bosXanalar,
      },
      olcu: { type: "score", instructions: "How large should it be drawn?", criteria: SIZE_LEVELS },
      bitdi: {
        type: "noul",
        instructions: "Is the picture already complete?",
        criteria: {
          true: "complete — the subject reads clearly, nothing essential is missing",
          false: "incomplete — an important element is still missing",
        },
      },
      ...(color
        ? {
            qelem: {
              type: "choice",
              instructions: "Which ink pen should draw this shape?",
              criteria: penCriteria(),
            },
          }
        : {}),
    };

    const state = {
      task: "Composing a line drawing on a cell grid, one shape at a time.",
      subject,
      canvas: `${COLS} columns x ${ROWS} rows. row 0 = top, row ${ROWS - 1} = bottom, column 0 = left, column ${COLS - 1} = right.`,
      already_drawn: placed.length
        ? placed.map((p) => `${p.en} at row ${p.row}, column ${p.col}, size ${p.size}/9`)
        : "nothing yet — this is the first shape",
    };

    const res = await session.call(state, questions, { signal });
    const a = res.answers;

    const bitdi = a.bitdi.noul;
    if (bitdi >= 0.6 && step >= 2) {
      yield { kind: "done", text: `bitdi · p=${bitdi.toFixed(2)}`, res };
      return;
    }

    const cellId = a.yer.choice;
    const [, row, col] = cellId.match(/^r(\d+)c(\d+)$/).map(Number);
    const prim = PRIMITIVE_BY_ID[a.element.choice];
    if (!prim) continue;

    const sizeLevel = a.olcu.score;
    const r = (0.55 + (sizeLevel / 9) * 2.6) * (PAPER_SIZE / COLS);
    const pen = color ? PENS[a.qelem.choice]?.hex ?? PENS.qara.hex : PENS.qara.hex;

    // istilik ləkəsi yalnız cari qərarı göstərir
    const field = [...Array(ROWS)].map((_, rr) =>
      [...Array(COLS)].map((_, cc) => a.yer.probabilities[`r${rr}c${cc}`] ?? 0)
    );
    paper.clearUnder();
    paper.gridOverlay(COLS, ROWS);
    paper.heat(field, { cols: COLS, rows: ROWS, pen: PENS.qirmizi.hex, alpha: 0.5 });
    paper.markCell(col, row, COLS, ROWS, { pen: PENS.qirmizi.hex });

    paper.drawPrimitive(prim, (col + 0.5) * (PAPER_SIZE / COLS), (row + 0.5) * (PAPER_SIZE / ROWS), r, {
      confidence: a.element.confidence,
      pen,
      width: 2.4,
    });

    const blokRadius = Math.max(0.8, r / (PAPER_SIZE / COLS));
    for (let rr = 0; rr < ROWS; rr++) {
      for (let cc = 0; cc < COLS; cc++) {
        if (Math.hypot(rr - row, cc - col) <= blokRadius) tutulmus.add(`r${rr}c${cc}`);
      }
    }

    placed.push({ en: prim.en, row, col, size: Math.round(sizeLevel) });

    yield {
      kind: "step",
      res,
      text: prim.az,
      detail: `r${row}c${col}`,
      p: a.yer.probabilities[cellId],
      conf: a.element.confidence,
      pen: color ? a.qelem.choice : null,
      extra: `ölçü ${sizeLevel.toFixed(1)} · bitdi ${bitdi.toFixed(2)}`,
    };
  }
}
