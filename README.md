<div align="center">

# JEV Canvas

**Ehtimalla rəsm çəkən plotter studiyası**

[JEV](https://docs.typesafe.ai/introduction) (TypeSafe System One) mətn yaratmır və piksel çəkmir —
tipli dəyər və ehtimal paylanması qaytarır. Burada həmin paylanmaların özü rəsmə çevrilir:
eyni mövzu üç fərqli fırça ilə, yanaşı çəkilir.

[![Node](https://img.shields.io/badge/Node.js-20+-3c873a?logo=node.js&logoColor=white)](https://nodejs.org)
[![JEV](https://img.shields.io/badge/JEV-System_One-22d3ee)](https://docs.typesafe.ai)

</div>

---

## Üç fırça

| Rejim | Grid | Primitiv | Nə edir |
| :--- | :--- | :--- | :--- |
| **Xana** | 16×15 = 240 | `choice` | Hər addımda bir çağırış dörd qərar verir: nə · harada · nə boyda · bitdimi. Arxadakı nöqtə buludu — 240 xananın **hamısının** ehtimalı, təkcə qalibin deyil. |
| **Ehtimal sahəsi** | 24×24 = 576 | `noul` | Bir çağırışda 576 ayrı "bu xana mürəkkəblidirmi?" sualı. Nöqtənin böyüklüyü **birbaşa ehtimaldır**. Rəngli rejimdə hər qələm üçün ayrı sahə — riso çapındakı rəng ayırmaları kimi. |
| **Vektor** | 960 px | `score` | Şəbəkə yoxdur: mövqe, ölçü və döngə kəsilməz float-dur, çünki `score` səviyyələr **arasında** qala bilir. İki çağırış: hansı elementlər var, sonra hamısının koordinatı birdən. |

Rejimləri istədiyin kimi birləşdir — üçü də, ikisi, biri. Hamısı eyni mövzunu paralel çəkir.

## Əminlik xəttin keyfiyyətidir

JEV hər qərarla birlikdə `confidence` qaytarır və bu, birbaşa qələmə ötürülür:

```
conf ≥ 0.70  →  tək, təmiz xətt
0.40 – 0.70  →  iki keçid
conf < 0.40  →  üç tərəddüdlü keçid, sürüşmə ilə
```

Yəni rəsmə baxanda modelin nədə əmin, nədə tərəddüdlü olduğunu görürsən. Vektor rejimində
bu xüsusilə maraqlıdır: günəşin **üfüqi** mövqeyi üçün model çox vaxt ~0.00 əminlik verir —
çünki günəşi sağa da, sola da qoysan doğrudur. Model "fərqi yoxdur"u özü bildirir.

## Mürəkkəb

İki rejim var: **ağ-qara** (tək qara qələm) və **JEV seçir** — bu halda qələmləri model özü
seçir. 8 qələmlik karusel: qara, qırmızı, mavi, yaşıl, sarı, bənövşəyi, narıncı, çəhrayı.

---

## Ölçmələr

Grid ölçüləri təxminlə yox, ölçməklə seçilib. Eyni nöqtəvi forma müxtəlif çözünürlükdə
çəkdirilib və "mürəkkəbli olmalı" ilə "boş olmalı" xanaların orta ehtimal fərqi ölçülüb
(yüksək = daha aydın ayırdetmə):

| Grid | Sual | diaqonal | sol yarım | dairə | **orta** | vaxt |
| :--- | ---: | ---: | ---: | ---: | ---: | ---: |
| 8×8 | 64 | 0.401 | 0.544 | 0.264 | 0.403 | 0.9s |
| 16×16 | 256 | 0.410 | 0.558 | 0.224 | 0.397 | 0.4s |
| **24×24** | 576 | **0.417** | 0.566 | 0.187 | 0.390 | 0.75s |
| 32×32 | 1024 | 0.342 | 0.576 | 0.154 | 0.357 | 0.9s |

**24×24 sərhəddir** — ondan sonra daha çox xana daha çox detal yox, daha çox səs-küy verir.
Xüsusilə radial formalarda ayırdetmə monoton düşür.

<details>
<summary><b>Nə işləyir, nə işləmir</b> — piksel rejiminin sərhədi</summary>

<br>

Bütün suallar bir sorğuda **paralel** qiymətləndirilir — bir xana o birinin cavabını bilmir.
Nəticə: **koordinatın nöqtəvi funksiyası** olan formalar əla alınır, **qlobal koordinasiya**
tələb edənlər alınmır.

```
"diaqonal xətt"  ✅              "böyük A hərfi"  ❌
@.:::...........                 .:-----=+--:::.
.@:............                  ::-==+=====--::
.=@-::.........                  .===+++=+=---:.
.==@=::.....:.                   :=++**+====--:.
.::+@=-:.::::..                  :=+++*+--==-::.
```

İterativ düzəliş də xilas etmir — cari tuvalı state-ə qaytarıb 4 dövrə çəkdirəndə nəticə
yenə ləkəyə yığılır. Ona görə tanınan rəsm **xana** və **vektor** rejimlərindən gəlir:
həndəsəni kod çəkir, bütün kompozisiya qərarlarını isə JEV verir.

Buna baxmayaraq JEV tuvalı **oxuya bilir**: ASCII rəsmi state-ə verəndə balansı düzgün
qiymətləndirir və dolu bölgələrə "bura daha nəsə lazımdır" ehtimalını aşağı verir.

</details>

<details>
<summary><b>API limitləri</b> — ölçülmüş, sənədlə təsdiqlənmiş</summary>

<br>

| | Dəyər |
| :--- | :--- |
| `choice` variant tavanı | **255** (256 → HTTP 400) |
| `score` səviyyə sayı | 2–10, nəticə arada float |
| Bir sorğuda sual sayı | 2048 sınanıb → 1.3s; limit sual sayı yox, **64k kontekstdir** |
| Qiymət | **$0.042 / 1M input** — output pulsuz |
| Sürət limiti | 1200 sorğu/dəq, 250k token/san |
| Giriş | yalnız mətn |

Bütöv bir rəsm sessiyası (üç rejim birlikdə) ~$0.003.

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

---

## Necə qurulub

```
server.js                 Express — JEV proxy-si, keep-alive agent, xərc hesabı
public/
  index.html              Vərəq şablonu və konsol
  style.css               Plotter studiyası — krem kağız, registrasiya nişanları
  app.js                  Rejimləri paralel işə salır, ölçmələri toplayır
  jev.js                  Proxy müştərisi + sessiya ölçmələri
  paper.js                Tuval: əminliyə görə ştrix, yarımton, ehtimal buludu
  primitives.js           8 qələm · 34 primitiv forma lüğəti
  engines/
    cell.js               16×15 · choice
    field.js              24×24 · noul
    vector.js             960px · score
```

API açarı heç vaxt frontend-ə göndərilmir — bütün çağırışlar `/api/jev` üzərindən keçir.

## Rəsmi sənədlər

<https://docs.typesafe.ai/introduction>
