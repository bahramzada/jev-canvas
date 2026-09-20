/** Seçilmiş ölçüləri eyni mövzu üzərində paralel çəkir və ölçmələri toplayır. */
import { Paper } from "./paper.js";
import { JevSession } from "./jev.js";
import * as pixel from "./pixel.js";

const el = (s, root = document) => root.querySelector(s);
const subjectInput = el("#subject");
const sheetsBox = el("#sheets");
const stamp = el("#stamp");
const btnLive = el("#live");
const btnFast = el("#fast");
const btnStop = el("#stop");

let controller = null;
let running = false;

const selectedSizes = () =>
  [...document.querySelectorAll("#modes input:checked")].map((i) => Number(i.value));
const colorMode = () => el('#ink input[name="ink"]:checked').value === "color";

// --- vərəq qurma ----------------------------------------------------------

function buildSheet(N) {
  const meta = pixel.meta(N);
  const node = el("#sheet-tpl").content.cloneNode(true);
  const sheet = el(".sheet", node);
  el(".sheet-name", sheet).textContent = meta.ad;
  el(".sheet-grid", sheet).textContent = meta.alt;
  el(".sheet-note", sheet).textContent = meta.izah;
  sheetsBox.append(sheet);

  const paper = new Paper(el(".layer.ink", sheet), { under: el(".layer.under", sheet), N });
  return { sheet, paper, log: el(".log", sheet) };
}

function logLine(log, { text, detail, p, conf, extra, swatches, kind }) {
  const li = document.createElement("li");
  if (kind === "done") li.className = "done";
  if (kind === "err") li.className = "err";

  const n = document.createElement("span");
  n.className = "n";
  n.textContent = kind === "step" ? String(log.children.length + 1).padStart(2, "0") : "·";

  const what = document.createElement("span");
  what.className = "what";
  what.textContent = text;

  if (swatches?.length) {
    const box = document.createElement("span");
    box.className = "swatches";
    for (const hex of swatches) {
      const s = document.createElement("i");
      s.style.background = hex;
      box.append(s);
    }
    what.append(box);
  }
  if (detail || extra) {
    const i = document.createElement("i");
    i.className = "dim";
    i.textContent = ` ${[detail, extra].filter(Boolean).join(" · ")}`;
    what.append(i);
  }
  if (conf != null) {
    const bar = document.createElement("span");
    bar.className = "confbar";
    const fill = document.createElement("i");
    fill.style.width = `${Math.round(Math.max(0, Math.min(1, conf)) * 100)}%`;
    bar.append(fill);
    what.append(bar);
  }

  const pv = document.createElement("span");
  pv.className = "p";
  pv.textContent = p != null ? `p ${p.toFixed(2)}` : "";

  li.append(n, what, pv);
  log.append(li);
  log.scrollTop = log.scrollHeight;
}

function paintFoot(sheet, session) {
  el(".sf-lat", sheet).textContent = session.calls ? `${session.medianLatency} ms median` : "—";
  el(".sf-call", sheet).textContent = `${session.calls} çağırış · ${session.questions} sual`;
  el(".sf-cost", sheet).textContent = `$${session.costUsd.toFixed(4)}`;
}

function paintTotals(sessions) {
  const t = sessions.reduce(
    (acc, s) => ({
      calls: acc.calls + s.calls,
      q: acc.q + s.questions,
      tok: acc.tok + s.tokens,
      cost: acc.cost + s.costUsd,
      lat: [...acc.lat, ...s.latencies],
    }),
    { calls: 0, q: 0, tok: 0, cost: 0, lat: [] }
  );
  const sorted = [...t.lat].sort((a, b) => a - b);
  el("#m-calls").textContent = t.calls;
  el("#m-q").textContent = t.q.toLocaleString("az");
  el("#m-tok").textContent = t.tok.toLocaleString("az");
  el("#m-cost").textContent = `$${t.cost.toFixed(4)}`;
  el("#m-med").textContent = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
}

// --- işə salma ------------------------------------------------------------

async function start({ live }) {
  if (running) return;
  const sizes = selectedSizes();
  if (!sizes.length) {
    stamp.textContent = "ölçü seç";
    return;
  }
  const subject = subjectInput.value.trim();
  if (!subject) {
    subjectInput.focus();
    stamp.textContent = "mövzu boşdur";
    return;
  }

  running = true;
  controller = new AbortController();
  btnLive.disabled = btnFast.disabled = true;
  btnStop.disabled = false;
  stamp.textContent = live ? "çəkilir" : "tez rejim";
  stamp.classList.add("busy");

  sheetsBox.innerHTML = "";
  const color = colorMode();
  const delay = live ? 320 : 0;
  const sessions = [];

  const jobs = sizes.map((N) => {
    const { sheet, paper, log } = buildSheet(N);
    const session = new JevSession();
    sessions.push(session);
    sheet.classList.add("busy");

    return (async () => {
      try {
        for await (const step of pixel.run({ N, subject, color, paper, session, signal: controller.signal })) {
          logLine(log, step);
          paintFoot(sheet, session);
          paintTotals(sessions);
          if (delay) await new Promise((r) => setTimeout(r, delay));
        }
        const dl = el(".sf-dl", sheet);
        dl.href = paper.toDataURL();
        dl.download = `jev-${subject.replace(/\W+/g, "-").slice(0, 32)}-${N}x${N}.png`;
        dl.hidden = false;
      } catch (err) {
        if (err.name !== "AbortError") logLine(log, { kind: "err", text: "xəta", detail: err.message });
      } finally {
        sheet.classList.remove("busy");
        paintFoot(sheet, session);
      }
    })();
  });

  await Promise.all(jobs);
  paintTotals(sessions);

  running = false;
  controller = null;
  btnLive.disabled = btnFast.disabled = false;
  btnStop.disabled = true;
  stamp.classList.remove("busy");
  stamp.textContent = "hazır";
}

btnLive.addEventListener("click", () => start({ live: true }));
btnFast.addEventListener("click", () => start({ live: false }));
btnStop.addEventListener("click", () => {
  controller?.abort();
  stamp.textContent = "dayandırıldı";
});
subjectInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") start({ live: true });
});

const resetSheets = () => {
  if (running) return;
  sheetsBox.innerHTML = "";
  for (const N of selectedSizes()) buildSheet(N);
};
document.querySelectorAll("#modes input").forEach((box) => box.addEventListener("change", resetSheets));
resetSheets();
