import express from "express";
import compression from "compression";
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { TypeSafeClient } from "@typesafe-ai/sdk";
import { Agent, fetch as undiciFetch } from "undici";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3200;

// JEV qiyməti — yalnız input tokeni ödənişlidir (USD / 1M token)
const PRICE_PER_M_INPUT = 0.042;

if (!process.env.JEV_API_KEY) {
  console.warn("XƏBƏRDARLIQ: .env faylında JEV_API_KEY tapılmadı. Sorğular uğursuz olacaq.");
}

/**
 * Keep-alive agent.
 *
 * Rəsm çəkilişi bir-birinin ardınca onlarla çağırışdan ibarətdir. Standart
 * bağlantı bir neçə saniyə boşdan sonra bağlanır və hər addım yenidən TLS
 * əl sıxması ödəyir — ölçülən gecikməyə ~800ms əlavə edir. İsti bağlantı
 * addımlar arasındakı fasiləni ödənişsiz saxlayır.
 */
const keepAliveAgent = new Agent({
  keepAliveTimeout: 60_000,
  keepAliveMaxTimeout: 120_000,
  connections: 8,
});

const jev = new TypeSafeClient({
  apiKey: process.env.JEV_API_KEY,
  timeout: 30_000,
  fetch: (url, init) => undiciFetch(url, { ...init, dispatcher: keepAliveAgent }),
});

const app = express();
app.use(compression());
app.use(express.json({ limit: "4mb" }));
app.use(express.static(path.join(__dirname, "public")));

const VALID_TYPES = new Set(["choice", "score", "noul"]);

/** Sualları SDK-ya vermədən öncə normallaşdırır və limitləri yoxlayır. */
function buildQuestions(raw) {
  const entries = Object.entries(raw || {});
  if (entries.length === 0) throw new Error("Ən azı bir sual lazımdır.");

  const questions = {};
  for (const [name, q] of entries) {
    if (!q || !VALID_TYPES.has(q.type)) {
      throw new Error(`"${name}" üçün etibarsız tip: ${q?.type}`);
    }

    if (q.type === "choice") {
      const labels = Object.keys(q.criteria || {});
      if (labels.length < 2) throw new Error(`"${name}" (choice) üçün ən azı 2 variant lazımdır.`);
      // Server tərəfi 255-dən çoxunu rədd edir — səhvi şəbəkəyə çıxmamış tuturuq
      if (labels.length > 255) throw new Error(`"${name}" (choice) ${labels.length} variant — limit 255.`);
      questions[name] = { type: "choice", instructions: q.instructions, criteria: q.criteria };
    } else if (q.type === "score") {
      if (!Array.isArray(q.criteria) || q.criteria.length < 2 || q.criteria.length > 10) {
        throw new Error(`"${name}" (score) üçün 2–10 səviyyə lazımdır.`);
      }
      questions[name] = { type: "score", instructions: q.instructions, criteria: q.criteria };
    } else {
      questions[name] = {
        type: "noul",
        instructions: q.instructions,
        criteria: q.criteria?.true || q.criteria?.false ? q.criteria : null,
      };
    }
  }
  return questions;
}

app.post("/api/jev", async (req, res) => {
  const started = performance.now();
  try {
    const { state, questions: rawQuestions } = req.body || {};
    if (state === undefined || state === null || state === "") {
      return res.status(400).json({ error: "state boş ola bilməz." });
    }

    const questions = buildQuestions(rawQuestions);
    const result = await jev.systemOne({ state, questions });
    const latencyMs = Math.round(performance.now() - started);
    const inputTokens = result.usage?.input_tokens ?? 0;

    res.json({
      model: result.model,
      answers: result.answers,
      latencyMs,
      questionCount: Object.keys(questions).length,
      usage: {
        inputTokens,
        outputTokens: result.usage?.output_tokens ?? 0,
        costUsd: (inputTokens / 1_000_000) * PRICE_PER_M_INPUT,
      },
    });
  } catch (err) {
    console.error("jev error:", err?.message || err);
    const status = Number.isInteger(err?.status) ? err.status : 500;
    res.status(status).json({
      error: err?.message || "Naməlum xəta.",
      latencyMs: Math.round(performance.now() - started),
    });
  }
});

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, hasApiKey: Boolean(process.env.JEV_API_KEY) });
});

app.listen(PORT, () => {
  console.log(`jev-canvas: http://localhost:${PORT}`);
});
