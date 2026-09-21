/**
 * İki rejim:
 *   SDF sahəsi — JEV hər piksel üçün dərinlik verir, kod sahəni kontura çevirir
 *   Turnir     — kod namizəd sprite-lar qurur, JEV bir çağırışda hamısını qiymətləndirir
 */
import { Paper } from "./paper.js";
import { JevSession } from "./jev.js";
import * as pixel from "./pixel.js";
import * as tournament from "./tournament.js";

const el = (s, root = document) => root.querySelector(s);
const subjectInput = el("#subject");
const sheetsBox = el("#sheets");
const sizesGroup = el("#sizes-group");
const stamp = el("#stamp");
const btnLive = el("#live");
const btnFast = el("#fast");
const btnStop = el("#stop");

const TOURNAMENT_N = 32; // genom çözünürlükdən asılı deyil; mühakimə 16-da, render burada

let controller = null;
let running = false;

const engine = () => el('#engine input[name="engine"]:checked').value;
const selectedSizes = () =>
  [...document.querySelectorAll("#modes input:checked")].map((i) => Number(i.value));
const colorMode = () => el('#ink input[name="ink"]:checked').value === "color";

// --- vərəq qurma ----------------------------------------------------------

function buildSheet({ ad, alt, izah }, N) {
  const node = el("#sheet-tpl").content.cloneNode(true);
  const sheet = el(".sheet", node);
  el(".sheet-name", sheet).textContent = ad;
  el(".sheet-grid", sheet).textContent = alt;
  el(".sheet-note", sheet).textContent = izah;
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
  pv.textContent = p != null ? `p ${p.toFixed(p < 0.01 ? 3 : 2)}` : "";

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

const dlName = (subject, tag) => `jev-${subject.replace(/\W+/g, "-").slice(0, 32)}-${tag}.png`;

function attachDownload(sheet, paper, name) {
  const dl = el(".sf-dl", sheet);
  dl.href = paper.toDataURL();
  dl.download = name;
  dl.hidden = false;
}

// --- SDF rejimi -----------------------------------------------------------

function runSdf({ subject, color, delay, sessions }) {
  return selectedSizes().map((N) => {
    const { sheet, paper, log } = buildSheet(pixel.meta(N), N);
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
        attachDownload(sheet, paper, dlName(subject, `${N}x${N}`));
      } catch (err) {
        if (err.name !== "AbortError") logLine(log, { kind: "err", text: "xəta", detail: err.message });
      } finally {
        sheet.classList.remove("busy");
        paintFoot(sheet, session);
      }
    })();
  });
}

// --- Turnir rejimi --------------------------------------------------------

function runTournament({ subject, color, delay, sessions }) {
  const built = [...Array(tournament.GENERATIONS)].map((_, g) =>
    buildSheet(tournament.meta(g), TOURNAMENT_N)
  );
  const session = new JevSession();
  sessions.push(session);
  for (const b of built) b.sheet.classList.add("busy");

  return [
    (async () => {
      try {
        for await (const step of tournament.run({
          subject,
          color,
          papers: built.map((b) => b.paper),
          session,
          signal: controller.signal,
          renderN: TOURNAMENT_N,
        })) {
          const idx = step.gen ?? 0;
          logLine(built[idx].log, step);
          if (step.gen != null) {
            const b = built[step.gen];
            b.sheet.classList.remove("busy");
            attachDownload(b.sheet, b.paper, dlName(subject, `nesil-${step.gen + 1}`));
          }
          for (const b of built) paintFoot(b.sheet, session);
          paintTotals(sessions);
          if (delay) await new Promise((r) => setTimeout(r, delay));
        }
      } catch (err) {
        if (err.name !== "AbortError") logLine(built[0].log, { kind: "err", text: "xəta", detail: err.message });
      } finally {
        for (const b of built) {
          b.sheet.classList.remove("busy");
          paintFoot(b.sheet, session);
        }
      }
    })(),
  ];
}

// --- işə salma ------------------------------------------------------------

async function start({ live }) {
  if (running) return;
  const mode = engine();
  if (mode === "sdf" && !selectedSizes().length) {
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
  const opts = { subject, color: colorMode(), delay: live ? 320 : 0, sessions: [] };
  const jobs = mode === "tournament" ? runTournament(opts) : runSdf(opts);

  await Promise.all(jobs);
  paintTotals(opts.sessions);

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

// --- boş vərəqlər ---------------------------------------------------------

function resetSheets() {
  if (running) return;
  const mode = engine();
  sizesGroup.hidden = mode === "tournament";
  sheetsBox.innerHTML = "";
  if (mode === "tournament") {
    for (let g = 0; g < tournament.GENERATIONS; g++) buildSheet(tournament.meta(g), TOURNAMENT_N);
  } else {
    for (const N of selectedSizes()) buildSheet(pixel.meta(N), N);
  }
}

document.querySelectorAll("#modes input, #engine input").forEach((box) =>
  box.addEventListener("change", resetSheets)
);
resetSheets();
