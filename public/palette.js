/** Piksel palitrası. Ağ-qara rejimdə yalnız `qara`; rəngli rejimdə JEV özü seçir. */

export const PENS = {
  qara: { az: "qara", en: "black", hex: "#1b1a16" },
  ag: { az: "ağ", en: "white", hex: "#f7f4ea" },
  boz: { az: "boz", en: "grey", hex: "#8a8578" },
  qirmizi: { az: "qırmızı", en: "red", hex: "#c6402f" },
  narinci: { az: "narıncı", en: "orange", hex: "#d98232" },
  sari: { az: "sarı", en: "yellow", hex: "#e3bb3c" },
  yasil: { az: "yaşıl", en: "green", hex: "#4e8f4a" },
  turkuz: { az: "firuzəyi", en: "teal", hex: "#3d8b8b" },
  mavi: { az: "mavi", en: "blue", hex: "#3a5fa8" },
  benovseyi: { az: "bənövşəyi", en: "purple", hex: "#7c4f96" },
  cehrayi: { az: "çəhrayı", en: "pink", hex: "#cf6a8f" },
  qehveyi: { az: "qəhvəyi", en: "brown", hex: "#8a5a34" },
};

/** JEV-ə gedən kriteriyalar — ingiliscə, çünki model ingiliscəyə daha dəqiqdir. */
export const penCriteria = () =>
  Object.fromEntries(Object.entries(PENS).map(([id, p]) => [id, `${p.en}`]));

export const INK_DEFAULT = PENS.qara.hex;
