<div align="center">

# JEV Canvas

**Can a model that cannot draw, draw?**

English · [Azərbaycanca](README.az.md)

[JEV](https://docs.typesafe.ai/introduction) (TypeSafe System One) generates no text and no images.
It returns typed values and probability distributions — nothing else. Its own documentation says it
is *"not good at System 2 tasks, specialized domains, and anything generative."*

This project tries to draw pixel art with it anyway, and measures what happens.

[![Node](https://img.shields.io/badge/Node.js-20+-3c873a?logo=node.js&logoColor=white)](https://nodejs.org)
[![JEV](https://img.shields.io/badge/JEV-System_One-22d3ee)](https://docs.typesafe.ai)
[![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

</div>

---

## The short version

Two approaches were built and measured against each other.

| | **SDF field** | **Tournament** |
| :--- | :--- | :--- |
| What JEV does | rates every pixel's depth inside the object | picks the best sprite out of 96 candidates |
| Primitive | `score` (5-level rubric) | `choice` (96 labels) |
| Who draws | JEV describes, code thresholds | code generates, JEV judges |
| Cost per sprite | ~$0.013 (three sizes, colour) | ~$0.006 (six generations) |
| Time | ~1.5s | ~5s |

**Verdict:** both produce clean, single-component sprites. Both reliably produce *recognisable*
sprites only for simple iconic subjects — an apple, a mushroom. Neither produces a recognisable
duck, pine tree or ghost. The ceiling is the model, and the rest of this file is
the evidence.

---

## Approach 1 — the SDF field

The first version asked one `noul` per pixel: *"is this pixel ink?"* That fails for a structural
reason. Questions in a request are evaluated **in parallel** — no pixel knows any other pixel's
answer — so the model returns the **marginal** distribution: the average over all possible apples,
not one apple. An average is blurry by definition.

Sampling more does not help either: JEV agrees with itself almost perfectly
([std 0.0102](https://docs.typesafe.ai/cookbooks/consistency_noul_cookbook.md); LLMs sit at
0.30–0.70), so repeated calls return the same answer. The only lever is **the question itself**.

So the question changed from membership to **depth**:

```
0  far outside the object, empty background
1  just outside the object's outline
2  exactly on the object's outline
3  just inside the object, near its edge
4  deep inside the object
```

`score` answers land *between* rubric levels, so the result is a continuous signed-distance field
rather than a noisy binary mask. The sprite is the `2.5` contour of that field.

Measured on a 32×32 sprite of *"red apple with a green leaf"*
(compactness = perimeter² / 4π·area; lower is cleaner):

| Question type | Compactness ↓ | Components ↓ | Isolated pixels ↓ |
| :--- | ---: | ---: | ---: |
| `noul` — "is this pixel ink?" | 4.29 | 2 | 1.3% |
| **`score` — "how deep inside?"** | **3.03** | **1** | **0.8%** |

### 64×64 is never asked directly

Spatial acuity collapses as resolution rises. Measured by drawing the same shape at several grid
sizes and taking the mean probability gap between pixels that *should* be ink and pixels that
should not:

| Grid | diagonal | left half | circle | **mean** |
| :--- | ---: | ---: | ---: | ---: |
| 8×8 | 0.401 | 0.544 | 0.264 | 0.403 |
| 16×16 | 0.410 | 0.558 | 0.224 | 0.397 |
| 24×24 | 0.417 | 0.566 | 0.187 | 0.390 |
| 32×32 | 0.342 | 0.576 | 0.154 | 0.357 |

At 64×64 it falls apart completely — and because an SDF is a *continuous* field, it doesn't have to:

| 64×64 | Compactness | Components | Cost |
| :--- | ---: | ---: | ---: |
| 4096 questions, asked directly | 17.44 | **15** | $0.0137 |
| **32×32 field, bilinearly upsampled** | **3.05** | **1** | **$0.0034** |

Fifteen disconnected fragments versus one clean sprite, at a quarter of the price. Font rendering
uses signed distance fields for exactly this reason. The trade-off is stated plainly in the UI:
a 64×64 sheet is labelled `32×32 asked → 64×64 rendered`, because it carries no more information
than the 32×32 does.

### Colour: one field per colour

Each palette colour gets its own depth field — *"how deep inside a green area is this pixel?"* —
and each field is **normalised to its own range** before a per-pixel argmax.

Normalisation is the whole trick:

```
body  (red)    max = 3.88
leaf  (green)  max = 1.34   ← erased by any absolute threshold
stem  (brown)  max = 0.82   ← same
```

Small parts are placed **correctly** — the leaf field peaks at the top of the sprite, the stem
field at top-centre — they are merely weak in absolute terms. An earlier 8×8 region map compared
parts absolutely and therefore painted every region the same colour.

### Probability → dither

The solid core is the `2.5` contour; the dither band extends **outward** from it, so the silhouette
stays on the contour that measured best while hesitation shows up as a Bayer pattern around it.
Two cleanup passes follow: isolated pixels are removed (independent questions occasionally say
"yes" far from the object), and core pixels touching empty space are darkened into an outline.

---

## Approach 2 — the tournament

The official guide states the rule in one sentence:

> *"Don't ask Jev to 'extract X' — instead 'pick the right candidate from these options.'
> This reframing — from generation to selection — dramatically improves reliability."*

So in this mode JEV never draws:

```
1. describe   JEV answers common-sense questions about the subject
              (shape family? proportions? how many parts? symmetric?)
2. generate   code builds 96 candidate sprites around that description — no API calls
3. select     one `choice` call returns a probability for ALL 96 candidates;
              that distribution is the fitness function
4. mutate     winners are crossed and mutated, back to step 3
```

Six generations, ~5 seconds, **$0.006**. The genome is resolution-independent: judging happens at
16×16 (the most reliable size measured), the winner renders at any resolution.

The genome is a union of lobes — ellipse, triangle up, rectangle, triangle down — each with a
**centre lock** that pins a lobe to the axis and exempts it from mirroring. Without the lock, every
off-axis lobe is mirrored and a tree trunk splits into two legs.

### Measured: can JEV read a sprite?

Five sprites were built and judged two ways.

**Absolute `noul`, one call per candidate — does not work:**

```
apple sprite  → "is this an apple?"  0.35
tree sprite   → "is this an apple?"  0.42   ← higher than the apple
star sprite   → "is this an apple?"  0.40   ← higher than the apple
```

**Comparative `choice`, all candidates in one call — works:**

```
apple 0.61 · tree 0.33 · star 0.06 · square 0.00 · noise 0.00
```

And the ranking tracks quality. Four apple variants, degraded on purpose:

| Question | Result |
| :--- | :--- |
| Best apple? | **with stem 0.60** > without stem 0.22 > lopsided 0.11 > holey 0.07 |
| Cleanest silhouette? | without stem 0.45 ≈ with stem 0.46 >> lopsided 0.08 > holey 0.01 |
| Most symmetric? | **without stem 0.59** > with stem 0.33 >> lopsided 0.02 |

So the architectural constraint is strict: **selection must be comparative, inside a single call.**
Capacity is 128 candidates per call at 671ms and 19k tokens; the hard label ceiling is 255.

> Probabilities are **not comparable across generations** — each generation is scored within its
> own population, so the winner's score need not rise over time.

---

## What did not work

Every item here was built, measured, and rejected. They are listed because the negative results
turned out to be more informative than the positive ones.

| Attempt | Result |
| :--- | :--- |
| **Ensemble / self-consistency** | Pointless. JEV is effectively deterministic (std 0.0102), so repeated calls return the same answer. |
| **Coarse-to-fine cascade** | Feeding the 16×16 result into the 32×32 prompt made it **worse** — the sprite drifted and broke apart. |
| **Supersample and downscale** | 32×32 averaged down to 16×16 (compactness 2.2) did not beat asking 16×16 directly (2.01), at 4× the cost. |
| **Per-pixel part `choice`** | Labelled almost everything "body": 915 body pixels against 109 background. Unusable. |
| **Row parameterisation** | Asking each row's left and right edge produced a rectangular slab — the model returns nearly the same edges for every row. |
| **Absolute `noul` scoring of sprites** | Cannot separate an apple from a tree (0.35 vs 0.42). Only comparative `choice` can. |
| **Raising judge resolution** | Backfires. On pine-tree candidates JEV prefers an oval crown to a cone, and grows *more* confident in the wrong answer as resolution rises: 16×16 → 0.44 vs 0.38, 24×24 → 0.64 vs 0.25, 32×32 → 0.71 vs 0.13. In an isolated shape test it identifies a triangle correctly at every resolution (0.63 vs 0.35), so this is preference, not perception. |
| **Second judging axis** | Adding a shape-family question and blending the two distributions fixed the pine tree in isolation (cone 0.41 > oval 0.38) and strengthened the control subject (mushroom 0.72 → 0.82) — but across four live subjects the recognisability score did not move, while cost rose from $0.006 to $0.0109. Reverted. |
| **Removing `band` from the state** | No consistent effect: apple 3.62 → 4.42 (worse), ghost 7.31 → 5.74 (better). Left in place. |

---

## The honest ceiling

**Works:** solid iconic silhouettes. Verified on an apple and a mushroom — both come out as clean,
readable sprites. Even inside this class the result varies: *"a red heart"* renders as a plausible
red mass but not as a heart.

**Does not work:**

- **Letters and text.** Global coordination is exactly what a marginal distribution cannot provide:

  ```
  "a diagonal line"  ✅              "the capital letter A"  ❌
  @.:::...........                   .:-----=+--:::.
  .@:............                    ::-==+=====--::
  .=@-::.........                    .===+++=+=---:.
  ```

- **Structured subjects.** A duck, a pine tree or a ghost comes out as a clean but generic blob.
  The reason is visible in the measurements above: JEV separates *"meaningful silhouette"* from
  *"noise"* very well (0.61 vs 0.00) but separates *"right silhouette"* from *"wrong silhouette"*
  poorly (0.61 vs 0.33).
- **Parts smaller than ~3% of the canvas**, even with relative normalisation.
- **Single-colour subjects used to pick up stray colours**, because the palette question asks for a
  second part's colour and a `choice` cannot decline to answer. Fixed by gating it behind a
  `noul`: *"does this subject have a clearly visible second part in a different colour?"*
- **Detail beyond ~32×32.** A 64×64 sprite is a smoother rendering of 32×32 information, never more.

<details>
<summary><b>API limits</b> — measured and confirmed against the server</summary>

<br>

| | Value |
| :--- | :--- |
| `choice` label ceiling | **255** (256 → HTTP 400) |
| `score` rubric levels | 2–10; the answer may land between them |
| Questions per request | no question limit — the ceiling is the **64k context**; a `score` question costs ~5× a `noul` |
| Price | **$0.042 / 1M input tokens** — output is free |
| Rate limits | 1200 requests/min, 250k tokens/sec |
| Input | text only |

</details>

---

## Running it

Node.js 20+.

```bash
npm install
cp .env.example .env    # fill in JEV_API_KEY
npm start
```

→ <http://localhost:3200>

| Variable | Required | Purpose |
| :--- | :---: | :--- |
| `JEV_API_KEY` | yes | [console.typesafe.ai](https://console.typesafe.ai/settings/keys) |
| `PORT` | no | default `3200` |

Every sprite downloads as a PNG at its native resolution — a 16×16 sprite is a 16×16 pixel file.

## Layout

```
server.js          Express — JEV proxy, keep-alive agent, cost accounting
public/
  index.html       console and sheet template
  style.css        pixel studio — checkerboard ground, monospace annotations
  app.js           runs the selected mode, collects measurements
  jev.js           proxy client + per-session metrics
  paper.js         N×N offscreen → nearest-neighbour upscale, dither, outline
  pixel.js         SDF engine: palette → shape field → colour fields → argmax
  tournament.js    tournament engine: describe → population → choice → mutate
  palette.js       12-colour palette
```

The API key never reaches the browser — every call goes through `/api/jev`.

## Reference

TypeSafe documentation: <https://docs.typesafe.ai/introduction>

## License

MIT
