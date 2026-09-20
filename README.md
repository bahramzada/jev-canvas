<div align="center">

# JEV Canvas

**Hər piksel bir ehtimaldır**

[JEV](https://docs.typesafe.ai/introduction) (TypeSafe System One) mətn yaratmır və şəkil çəkmir —
tipli dəyər və ehtimal paylanması qaytarır. Burada hər piksel ayrıca bir `noul` sualıdır,
qayıdan ehtimal isə piksel artın öz dilinə — **dither sıxlığına** çevrilir.

Eyni mövzu üç çözünürlükdə paralel çəkilir: **16×16 · 32×32 · 64×64**

[![Node](https://img.shields.io/badge/Node.js-20+-3c873a?logo=node.js&logoColor=white)](https://nodejs.org)
[![JEV](https://img.shields.io/badge/JEV-System_One-22d3ee)](https://docs.typesafe.ai)

</div>

---

## Necə işləyir

| Ölçü | Sual | Çağırış | Tipik vaxt |
| :--- | ---: | ---: | ---: |
| 16×16 | 256 `noul` | 1 | ~0.4s |
| 32×32 | 1 024 `noul` | 1 | ~0.5s |
| 64×64 | 4 096 `noul` | 4 | ~1.2s |

Sual həmişə eynidir: **`r=7,c=12 ink?`** — bu piksel obyektə aiddir, yoxsa fondur?
Suallar bir sorğuda paralel qiymətləndirilir, ona görə 1024 sual bir sualdan demək olar
sürətlidir. 64×64 = 4096 sual 64k kontekstə sığmadığı üçün dörd sətir zolağına bölünür;
suallar onsuz da müstəqil olduğu üçün bölünmə nəticəyə təsir etmir.

Üç ölçü **eyni mövzunu müstəqil çəkir** — biri o birinin nəticəsini görmür.

## Ehtimal → dither

1-bit piksel artda boz ton yoxdur; yarımton **nöqtə sıxlığı** ilə verilir. JEV-in qaytardığı
ehtimal da elə budur, ona görə çevirmə birbaşadır:

```
ehtimal yüksək   →  dolu piksel
ehtimal sərhəddə →  Bayer 4×4 naxışı (tərəddüd görünür)
ehtimal aşağı    →  boş
```

Sprite-ın kənarındakı şahmat naxışı bəzək deyil — modelin məhz orada qərarsız olduğu yerdir.

Üstünə iki addım əlavə olunur:

- **Təkpiksel təmizləmə** — iki qonşusu olmayan piksel silinir. Suallar müstəqil
  qiymətləndirildiyi üçün obyektdən uzaqda ara-sıra "bəli" çıxır; bu səs-küydür.
- **Kontur** — boş pikselə toxunan piksellər tündləşir. Piksel artın standart konturu.

## Rəng

**1-bit** rejimində tək qara mürəkkəb. **JEV seçir** rejimində model əvvəlcə palitranı
seçir (əsas rəng, ikinci hissənin rəngi, aksent + "dördüncü rəng lazımdırmı?"), sonra
hazır sprite ona ASCII kimi göstərilir və 8×8 bölgə üzrə rəng xəritəsi soruşulur.

> **Dürüst qeyd:** rəng xəritəsi çox vaxt bütün bölgələr üçün eyni rəngi seçir. "Yaşıl alma"
> üçün bu doğrudur, amma hissələri fərqli olan mövzularda da belə davranır. Palitra seçimi
> düzgün işləyir, bölgə səviyyəsində fərqləndirmə isə zəifdir.

---

## Ölçülmüş sərhədlər

Bu layihə təxminlə yox, ölçməklə quruldu. Ən vacib üç nəticə:

**1. Piksel-piksel yanaşma yalnız müəyyən formalarda işləyir.** Bütün suallar paralel
qiymətləndirilir — bir piksel o birinin cavabını bilmir. Koordinatın nöqtəvi funksiyası
olan formalar əla alınır, qlobal koordinasiya tələb edənlər alınmır:

```
"diaqonal xətt"  ✅              "böyük A hərfi"  ❌
@.:::...........                 .:-----=+--:::.
.@:............                  ::-==+=====--::
.=@-::.........                  .===+++=+=---:.
.==@=::.....:.                   :=++**+====--:.
```

Alma, ürək, ulduz kimi bütöv siluetlər yaxşı çıxır; hərf və mətn çıxmır.

**2. Çözünürlük artdıqca ayırdetmə düşür.** Eyni formanı müxtəlif gridlərdə çəkdirib
"dolu olmalı" və "boş olmalı" piksellərin orta ehtimal fərqini ölçdük:

| Grid | diaqonal | sol yarım | dairə | **orta** |
| :--- | ---: | ---: | ---: | ---: |
| 8×8 | 0.401 | 0.544 | 0.264 | 0.403 |
| 16×16 | 0.410 | 0.558 | 0.224 | 0.397 |
| 24×24 | 0.417 | 0.566 | 0.187 | 0.390 |
| 32×32 | 0.342 | 0.576 | 0.154 | 0.357 |

64×64-də səs-küy daha da artır — ona görə təkpiksel təmizləmə var.

**3. Kaskad kömək etmir.** 16×16 nəticəsini 32×32 sualına kontekst kimi verəndə nəticə
**pisləşdi** — sprite yerindən sürüşdü və dağıldı. Müstəqil çəkiliş daha yaxşıdır, ona görə
üç ölçü paralel və bir-birindən xəbərsiz işləyir.

<details>
<summary><b>API limitləri</b></summary>

<br>

| | Dəyər |
| :--- | :--- |
| `choice` variant tavanı | **255** (256 → HTTP 400) |
| `score` səviyyə sayı | 2–10, nəticə arada float |
| Bir sorğuda sual sayı | 2048 sınanıb → 1.3s; limit sual sayı yox, **64k kontekstdir** |
| Qiymət | **$0.042 / 1M input** — output pulsuz |
| Sürət limiti | 1200 sorğu/dəq, 250k token/san |
| Giriş | yalnız mətn |

Üç ölçü birlikdə, rəngli rejimdə bir sprite dəsti ≈ **$0.004**.

</details>

---

## Başlamaq

Node.js 20+ tələb olunur.

```bash
npm install
cp .env.example .env    # JEV_API_KEY doldurun
npm start
```

→ <http://localhost:3200>

| Dəyişən | Tələb olunur | Təyinat |
| :--- | :---: | :--- |
| `JEV_API_KEY` | bəli | [console.typesafe.ai](https://console.typesafe.ai/settings/keys) |
| `PORT` | xeyr | Standart: `3200` |

Hər sprite öz çözünürlüyündə PNG kimi yüklənə bilər — 16×16 sprite 16×16 piksel fayl olur.

## Necə qurulub

```
server.js          Express — JEV proxy-si, keep-alive agent, xərc hesabı
public/
  index.html       Konsol və vərəq şablonu
  style.css        Piksel studiyası — şahmat fon, monospace qeydlər
  app.js           Ölçüləri paralel işə salır, ölçmələri toplayır
  jev.js           Proxy müştərisi + sessiya ölçmələri
  paper.js         N×N offscreen → nearest-neighbor böyütmə, dither, kontur
  pixel.js         Motor: palitra → quruluş zolaqları → rəng xəritəsi
  palette.js       12 rəngli palitra
```

API açarı heç vaxt frontend-ə göndərilmir — bütün çağırışlar `/api/jev` üzərindən keçir.

## Rəsmi sənədlər

<https://docs.typesafe.ai/introduction>
