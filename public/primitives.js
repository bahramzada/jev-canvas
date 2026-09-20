/**
 * Plotter qələmləri və primitiv lüğəti.
 *
 * Mövzu sərbəst mətndir, ona görə JEV-ə konkret bir səhnənin detalları yox,
 * ümumi bir forma lüğəti verilir — istənilən mövzunu bu lüğətdən qurmağa çalışır.
 * Hər primitiv vahid qutuya (mərkəz 0,0) çəkilir, ölçüsü çağıran tərəf verir.
 */

export const PENS = {
  qara: { az: "qara", en: "black", hex: "#16150f" },
  qirmizi: { az: "qırmızı", en: "red", hex: "#b4402e" },
  mavi: { az: "mavi", en: "blue", hex: "#2f5d94" },
  yasil: { az: "yaşıl", en: "green", hex: "#3f7a55" },
  sari: { az: "sarı", en: "yellow ochre", hex: "#c9971f" },
  benovseyi: { az: "bənövşəyi", en: "violet", hex: "#7a4f8a" },
  narinci: { az: "narıncı", en: "orange", hex: "#cf7030" },
  cehrayi: { az: "çəhrayı", en: "pink", hex: "#c85f86" },
};

/** JEV-ə göndərilən qələm kriteriyaları (ingiliscə — model ingiliscəyə daha dəqiqdir). */
export const penCriteria = () =>
  Object.fromEntries(Object.entries(PENS).map(([id, p]) => [id, `${p.en} ink pen`]));

// --- çəkiliş köməkçiləri ------------------------------------------------

const TAU = Math.PI * 2;

/** Dairəvi yay — plotter qələmi kimi çoxbucaqlı addımlarla. */
function arc(ctx, r, from = 0, to = TAU, steps = 48) {
  for (let i = 0; i <= steps; i++) {
    const a = from + ((to - from) * i) / steps;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  }
}

/** Qapalı sahəni ştrixlə doldurur — plotter doldurma üsulu. */
function hatch(ctx, r, angle = -Math.PI / 4, gap = 6, shape = "box") {
  const n = Math.ceil((r * 2.4) / gap);
  for (let i = -n; i <= n; i++) {
    const off = i * gap;
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    const px = -dy * off;
    const py = dx * off;
    let len = r * 1.4;
    if (shape === "circle") {
      const d = Math.abs(off);
      if (d >= r) continue;
      len = Math.sqrt(r * r - d * d);
    }
    ctx.moveTo(px - dx * len, py - dy * len);
    ctx.lineTo(px + dx * len, py + dy * len);
  }
}

// --- lüğət ---------------------------------------------------------------
// az: interfeys dili · en: JEV-ə gedən təsvir · draw(ctx, r, ink)
//   ink(fn) — fn daxilində yol qurulur, ink onu əminliyə uyğun ştrixlə çəkir.

export const PRIMITIVES = [
  {
    id: "dag", az: "dağ", en: "mountain", desc: "a mountain peak with a ridge line",
    draw(ctx, r, ink) {
      ink((c) => {
        c.moveTo(-r, r * 0.8);
        c.lineTo(-r * 0.25, -r * 0.9);
        c.lineTo(r * 0.15, -r * 0.1);
        c.lineTo(r * 0.45, -r * 0.55);
        c.lineTo(r, r * 0.8);
        c.closePath();
      });
      ink((c) => {
        c.moveTo(-r * 0.45, -r * 0.35);
        c.lineTo(-r * 0.25, -r * 0.9);
        c.lineTo(-r * 0.02, -r * 0.4);
      });
    },
  },
  {
    id: "tepe", az: "təpə", en: "rolling hill", desc: "a soft rounded hill",
    draw(ctx, r, ink) {
      ink((c) => {
        c.moveTo(-r, r * 0.6);
        c.quadraticCurveTo(-r * 0.3, -r * 0.8, r * 0.35, r * 0.1);
        c.quadraticCurveTo(r * 0.7, r * 0.45, r, r * 0.6);
      });
    },
  },
  {
    id: "agac", az: "ağac", en: "tree", desc: "a broadleaf tree with a round crown",
    draw(ctx, r, ink) {
      ink((c) => {
        c.moveTo(-r * 0.12, r);
        c.lineTo(-r * 0.09, -r * 0.1);
        c.moveTo(r * 0.12, r);
        c.lineTo(r * 0.09, -r * 0.1);
      });
      ink((c) => arc(c, r * 0.62, 0, TAU, 26));
      ink((c) => hatch(c, r * 0.58, -0.7, r * 0.3, "circle"));
    },
  },
  {
    id: "sam", az: "şam ağacı", en: "pine tree", desc: "a tall conifer with triangular tiers",
    draw(ctx, r, ink) {
      ink((c) => {
        c.moveTo(-r * 0.08, r);
        c.lineTo(r * 0.08, r);
      });
      for (let i = 0; i < 3; i++) {
        const y = -r * 0.7 + i * r * 0.55;
        const w = r * (0.3 + i * 0.26);
        ink((c) => {
          c.moveTo(-w, y + r * 0.45);
          c.lineTo(0, y - r * 0.2);
          c.lineTo(w, y + r * 0.45);
        });
      }
    },
  },
  {
    id: "kol", az: "kol", en: "bush", desc: "a low round bush",
    draw(ctx, r, ink) {
      ink((c) => arc(c, r * 0.55, Math.PI, TAU, 20));
      ink((c) => {
        c.moveTo(-r * 0.55, 0);
        c.lineTo(r * 0.55, 0);
      });
      ink((c) => arc(c, r * 0.3, Math.PI, TAU, 14));
    },
  },
  {
    id: "ot", az: "ot", en: "grass tuft", desc: "a tuft of grass blades",
    draw(ctx, r, ink) {
      for (let i = -2; i <= 2; i++) {
        ink((c) => {
          c.moveTo(i * r * 0.22, r * 0.5);
          c.quadraticCurveTo(i * r * 0.3, -r * 0.1, i * r * 0.5, -r * 0.6);
        });
      }
    },
  },
  {
    id: "cicek", az: "çiçək", en: "flower", desc: "a single flower on a stem",
    draw(ctx, r, ink) {
      ink((c) => {
        c.moveTo(0, r);
        c.quadraticCurveTo(r * 0.15, r * 0.2, 0, -r * 0.2);
      });
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU;
        ink((c) => {
          arcAt(c, Math.cos(a) * r * 0.35, Math.sin(a) * r * 0.35 - r * 0.4, r * 0.2);
        });
      }
      ink((c) => arcAt(c, 0, -r * 0.4, r * 0.14));
    },
  },
  {
    id: "ev", az: "ev", en: "house", desc: "a small house with a pitched roof",
    draw(ctx, r, ink) {
      ink((c) => {
        c.moveTo(-r * 0.7, r * 0.8);
        c.lineTo(-r * 0.7, -r * 0.1);
        c.lineTo(r * 0.7, -r * 0.1);
        c.lineTo(r * 0.7, r * 0.8);
        c.closePath();
      });
      ink((c) => {
        c.moveTo(-r * 0.85, -r * 0.1);
        c.lineTo(0, -r * 0.85);
        c.lineTo(r * 0.85, -r * 0.1);
      });
      ink((c) => {
        c.moveTo(-r * 0.25, r * 0.8);
        c.lineTo(-r * 0.25, r * 0.2);
        c.lineTo(r * 0.15, r * 0.2);
        c.lineTo(r * 0.15, r * 0.8);
      });
    },
  },
  {
    id: "bina", az: "bina", en: "tall building", desc: "a tall city building with windows",
    draw(ctx, r, ink) {
      ink((c) => {
        c.moveTo(-r * 0.5, r);
        c.lineTo(-r * 0.5, -r);
        c.lineTo(r * 0.5, -r);
        c.lineTo(r * 0.5, r);
      });
      for (let row = 0; row < 5; row++) {
        for (let col = 0; col < 2; col++) {
          const x = -r * 0.28 + col * r * 0.36;
          const y = -r * 0.78 + row * r * 0.35;
          ink((c) => {
            c.moveTo(x - r * 0.1, y - r * 0.1);
            c.lineTo(x + r * 0.1, y - r * 0.1);
            c.lineTo(x + r * 0.1, y + r * 0.1);
            c.lineTo(x - r * 0.1, y + r * 0.1);
            c.closePath();
          });
        }
      }
    },
  },
  {
    id: "qulle", az: "qüllə", en: "tower", desc: "a narrow tower or minaret",
    draw(ctx, r, ink) {
      ink((c) => {
        c.moveTo(-r * 0.22, r);
        c.lineTo(-r * 0.22, -r * 0.5);
        c.lineTo(r * 0.22, -r * 0.5);
        c.lineTo(r * 0.22, r);
      });
      ink((c) => {
        c.moveTo(-r * 0.32, -r * 0.5);
        c.lineTo(0, -r);
        c.lineTo(r * 0.32, -r * 0.5);
        c.closePath();
      });
    },
  },
  {
    id: "qapi", az: "qapı", en: "door", desc: "a doorway",
    draw(ctx, r, ink) {
      ink((c) => {
        c.moveTo(-r * 0.4, r);
        c.lineTo(-r * 0.4, -r * 0.4);
        c.quadraticCurveTo(0, -r, r * 0.4, -r * 0.4);
        c.lineTo(r * 0.4, r);
      });
      ink((c) => arcAt(c, r * 0.22, r * 0.2, r * 0.07));
    },
  },
  {
    id: "pencere", az: "pəncərə", en: "window", desc: "a window with cross bars",
    draw(ctx, r, ink) {
      ink((c) => {
        c.moveTo(-r * 0.6, -r * 0.6);
        c.lineTo(r * 0.6, -r * 0.6);
        c.lineTo(r * 0.6, r * 0.6);
        c.lineTo(-r * 0.6, r * 0.6);
        c.closePath();
      });
      ink((c) => {
        c.moveTo(0, -r * 0.6);
        c.lineTo(0, r * 0.6);
        c.moveTo(-r * 0.6, 0);
        c.lineTo(r * 0.6, 0);
      });
    },
  },
  {
    id: "hasar", az: "hasar", en: "fence", desc: "a wooden fence",
    draw(ctx, r, ink) {
      ink((c) => {
        c.moveTo(-r, -r * 0.2);
        c.lineTo(r, -r * 0.2);
        c.moveTo(-r, r * 0.3);
        c.lineTo(r, r * 0.3);
      });
      for (let i = -2; i <= 2; i++) {
        ink((c) => {
          c.moveTo(i * r * 0.45, -r * 0.6);
          c.lineTo(i * r * 0.45, r * 0.7);
        });
      }
    },
  },
  {
    id: "korpu", az: "körpü", en: "bridge", desc: "an arched bridge",
    draw(ctx, r, ink) {
      ink((c) => {
        c.moveTo(-r, -r * 0.1);
        c.lineTo(r, -r * 0.1);
      });
      ink((c) => arc(c, r * 0.6, Math.PI, TAU, 24));
      for (let i = -1; i <= 1; i++) {
        ink((c) => {
          c.moveTo(i * r * 0.55, -r * 0.1);
          c.lineTo(i * r * 0.55, -r * 0.45);
        });
      }
    },
  },
  {
    id: "yol", az: "yol", en: "road or path", desc: "a path receding into the distance",
    draw(ctx, r, ink) {
      ink((c) => {
        c.moveTo(-r, r);
        c.quadraticCurveTo(-r * 0.15, r * 0.1, -r * 0.12, -r);
        c.moveTo(r, r);
        c.quadraticCurveTo(r * 0.2, r * 0.1, r * 0.12, -r);
      });
      for (let i = 0; i < 3; i++) {
        const t = i / 3;
        ink((c) => {
          c.moveTo(0, r - t * r * 1.4);
          c.lineTo(0, r - t * r * 1.4 - r * 0.18);
        });
      }
    },
  },
  {
    id: "su", az: "su", en: "water surface with waves", desc: "horizontal wave lines",
    draw(ctx, r, ink) {
      for (let i = -2; i <= 2; i++) {
        const y = i * r * 0.3;
        ink((c) => {
          c.moveTo(-r, y);
          for (let x = -r; x <= r; x += r * 0.25) {
            c.quadraticCurveTo(x + r * 0.12, y - r * 0.12, x + r * 0.25, y);
          }
        });
      }
    },
  },
  {
    id: "qayiq", az: "qayıq", en: "boat", desc: "a small sailing boat",
    draw(ctx, r, ink) {
      ink((c) => {
        c.moveTo(-r * 0.7, r * 0.3);
        c.lineTo(r * 0.7, r * 0.3);
        c.lineTo(r * 0.45, r * 0.7);
        c.lineTo(-r * 0.45, r * 0.7);
        c.closePath();
      });
      ink((c) => {
        c.moveTo(0, r * 0.3);
        c.lineTo(0, -r * 0.9);
      });
      ink((c) => {
        c.moveTo(r * 0.05, -r * 0.85);
        c.lineTo(r * 0.6, r * 0.15);
        c.lineTo(r * 0.05, r * 0.15);
        c.closePath();
      });
    },
  },
  {
    id: "balik", az: "balıq", en: "fish", desc: "a fish seen from the side",
    draw(ctx, r, ink) {
      ink((c) => {
        c.moveTo(-r * 0.4, 0);
        c.quadraticCurveTo(0, -r * 0.55, r * 0.6, 0);
        c.quadraticCurveTo(0, r * 0.55, -r * 0.4, 0);
      });
      ink((c) => {
        c.moveTo(-r * 0.4, 0);
        c.lineTo(-r * 0.85, -r * 0.35);
        c.lineTo(-r * 0.85, r * 0.35);
        c.closePath();
      });
      ink((c) => arcAt(c, r * 0.35, -r * 0.08, r * 0.06));
    },
  },
  {
    id: "gunes", az: "günəş", en: "sun", desc: "the sun with rays",
    draw(ctx, r, ink) {
      ink((c) => arc(c, r * 0.5, 0, TAU, 28));
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * TAU;
        ink((c) => {
          c.moveTo(Math.cos(a) * r * 0.68, Math.sin(a) * r * 0.68);
          c.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        });
      }
    },
  },
  {
    id: "ay", az: "ay", en: "crescent moon", desc: "a crescent moon",
    draw(ctx, r, ink) {
      ink((c) => {
        arc(c, r * 0.7, Math.PI * 0.35, Math.PI * 1.65, 26);
        for (let i = 26; i >= 0; i--) {
          const a = Math.PI * 1.65 - (Math.PI * 1.3 * i) / 26;
          c.lineTo(Math.cos(a) * r * 0.7 + r * 0.42, Math.sin(a) * r * 0.7);
        }
        c.closePath();
      });
    },
  },
  {
    id: "ulduz", az: "ulduz", en: "star", desc: "a five-pointed star",
    draw(ctx, r, ink) {
      ink((c) => {
        for (let i = 0; i < 10; i++) {
          const a = -Math.PI / 2 + (i / 10) * TAU;
          const rad = i % 2 ? r * 0.35 : r * 0.85;
          const x = Math.cos(a) * rad;
          const y = Math.sin(a) * rad;
          i === 0 ? c.moveTo(x, y) : c.lineTo(x, y);
        }
        c.closePath();
      });
    },
  },
  {
    id: "bulud", az: "bulud", en: "cloud", desc: "a fluffy cloud",
    draw(ctx, r, ink) {
      ink((c) => {
        c.moveTo(-r * 0.8, r * 0.25);
        c.quadraticCurveTo(-r * 1.0, -r * 0.3, -r * 0.35, -r * 0.3);
        c.quadraticCurveTo(-r * 0.25, -r * 0.8, r * 0.2, -r * 0.6);
        c.quadraticCurveTo(r * 0.8, -r * 0.7, r * 0.75, -r * 0.1);
        c.quadraticCurveTo(r * 1.0, r * 0.3, r * 0.5, r * 0.25);
        c.closePath();
      });
    },
  },
  {
    id: "yagis", az: "yağış", en: "falling rain", desc: "diagonal rain streaks",
    draw(ctx, r, ink) {
      for (let i = -2; i <= 2; i++) {
        for (let j = 0; j < 2; j++) {
          ink((c) => {
            const x = i * r * 0.35 + j * r * 0.12;
            const y = -r * 0.5 + j * r * 0.7;
            c.moveTo(x, y);
            c.lineTo(x - r * 0.12, y + r * 0.42);
          });
        }
      }
    },
  },
  {
    id: "tustu", az: "tüstü", en: "rising smoke", desc: "a curl of smoke",
    draw(ctx, r, ink) {
      ink((c) => {
        c.moveTo(0, r);
        c.quadraticCurveTo(-r * 0.5, r * 0.4, 0, -r * 0.05);
        c.quadraticCurveTo(r * 0.5, -r * 0.5, -r * 0.1, -r);
      });
    },
  },
  {
    id: "qus", az: "quş", en: "bird in flight", desc: "a bird silhouette in flight",
    draw(ctx, r, ink) {
      ink((c) => {
        c.moveTo(-r * 0.9, r * 0.15);
        c.quadraticCurveTo(-r * 0.45, -r * 0.45, 0, 0);
        c.quadraticCurveTo(r * 0.45, -r * 0.45, r * 0.9, r * 0.15);
      });
    },
  },
  {
    id: "insan", az: "insan", en: "standing person", desc: "a simple standing human figure",
    draw(ctx, r, ink) {
      ink((c) => arcAt(c, 0, -r * 0.62, r * 0.2));
      ink((c) => {
        c.moveTo(0, -r * 0.42);
        c.lineTo(0, r * 0.2);
      });
      ink((c) => {
        c.moveTo(-r * 0.4, -r * 0.1);
        c.lineTo(0, -r * 0.3);
        c.lineTo(r * 0.4, -r * 0.1);
      });
      ink((c) => {
        c.moveTo(-r * 0.3, r);
        c.lineTo(0, r * 0.2);
        c.lineTo(r * 0.3, r);
      });
    },
  },
  {
    id: "heyvan", az: "heyvan", en: "four-legged animal", desc: "a four-legged animal silhouette",
    draw(ctx, r, ink) {
      ink((c) => {
        c.moveTo(-r * 0.6, -r * 0.1);
        c.quadraticCurveTo(0, -r * 0.45, r * 0.55, -r * 0.15);
        c.lineTo(r * 0.6, r * 0.15);
        c.lineTo(-r * 0.6, r * 0.15);
        c.closePath();
      });
      for (const x of [-0.45, -0.2, 0.2, 0.45]) {
        ink((c) => {
          c.moveTo(x * r, r * 0.15);
          c.lineTo(x * r, r * 0.7);
        });
      }
      ink((c) => {
        c.moveTo(r * 0.5, -r * 0.2);
        c.lineTo(r * 0.85, -r * 0.6);
        c.lineTo(r * 0.65, -r * 0.62);
      });
    },
  },
  {
    id: "qaya", az: "qaya", en: "rock or boulder", desc: "an angular boulder",
    draw(ctx, r, ink) {
      ink((c) => {
        c.moveTo(-r * 0.8, r * 0.5);
        c.lineTo(-r * 0.5, -r * 0.3);
        c.lineTo(r * 0.1, -r * 0.55);
        c.lineTo(r * 0.75, -r * 0.05);
        c.lineTo(r * 0.7, r * 0.5);
        c.closePath();
      });
      ink((c) => {
        c.moveTo(-r * 0.5, -r * 0.3);
        c.lineTo(-r * 0.05, r * 0.5);
      });
    },
  },
  {
    id: "tekar", az: "çarx", en: "wheel or gear", desc: "a wheel with spokes",
    draw(ctx, r, ink) {
      ink((c) => arc(c, r * 0.8, 0, TAU, 32));
      ink((c) => arc(c, r * 0.2, 0, TAU, 16));
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU;
        ink((c) => {
          c.moveTo(Math.cos(a) * r * 0.2, Math.sin(a) * r * 0.2);
          c.lineTo(Math.cos(a) * r * 0.8, Math.sin(a) * r * 0.8);
        });
      }
    },
  },
  {
    id: "spiral", az: "spiral", en: "spiral", desc: "a spiral curl",
    draw(ctx, r, ink) {
      ink((c) => {
        for (let i = 0; i <= 120; i++) {
          const t = i / 120;
          const a = t * TAU * 2.6;
          const rad = r * t;
          const x = Math.cos(a) * rad;
          const y = Math.sin(a) * rad;
          i === 0 ? c.moveTo(x, y) : c.lineTo(x, y);
        }
      });
    },
  },
  {
    id: "dairə", az: "dairə", en: "circle", desc: "a plain circle",
    draw(ctx, r, ink) {
      ink((c) => arc(c, r * 0.8, 0, TAU, 40));
    },
  },
  {
    id: "ucbucaq", az: "üçbucaq", en: "triangle", desc: "a plain triangle",
    draw(ctx, r, ink) {
      ink((c) => {
        c.moveTo(0, -r * 0.85);
        c.lineTo(r * 0.8, r * 0.6);
        c.lineTo(-r * 0.8, r * 0.6);
        c.closePath();
      });
    },
  },
  {
    id: "kvadrat", az: "kvadrat", en: "square", desc: "a plain square",
    draw(ctx, r, ink) {
      ink((c) => {
        c.moveTo(-r * 0.75, -r * 0.75);
        c.lineTo(r * 0.75, -r * 0.75);
        c.lineTo(r * 0.75, r * 0.75);
        c.lineTo(-r * 0.75, r * 0.75);
        c.closePath();
      });
    },
  },
  {
    id: "xett", az: "xətt", en: "straight line", desc: "a single straight stroke",
    draw(ctx, r, ink) {
      ink((c) => {
        c.moveTo(-r, r * 0.4);
        c.lineTo(r, -r * 0.4);
      });
    },
  },
  {
    id: "stritx", az: "ştrix ləkə", en: "hatched patch", desc: "a patch of dense hatching",
    draw(ctx, r, ink) {
      ink((c) => hatch(c, r * 0.8, -Math.PI / 4, r * 0.18, "circle"));
    },
  },
];

/** Mərkəzi (cx,cy) olan dairə — yol artıq açıq olduğu üçün moveTo ilə başlayır. */
function arcAt(ctx, cx, cy, r) {
  for (let i = 0; i <= 24; i++) {
    const a = (i / 24) * TAU;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  }
}

export const PRIMITIVE_BY_ID = Object.fromEntries(PRIMITIVES.map((p) => [p.id, p]));

/** JEV-ə gedən choice kriteriyaları: id → ingiliscə təsvir. */
export const primitiveCriteria = (ids = null) =>
  Object.fromEntries(
    (ids ? PRIMITIVES.filter((p) => ids.includes(p.id)) : PRIMITIVES).map((p) => [p.id, p.desc])
  );
