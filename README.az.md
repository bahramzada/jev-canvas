<div align="center">

# JEV Canvas

**Rəsm çəkə bilməyən model rəsm çəkə bilərmi?**

[English](README.md) · Azərbaycanca

[JEV](https://docs.typesafe.ai/introduction) (TypeSafe System One) nə mətn yaradır, nə şəkil.
Yalnız tipli dəyər və ehtimal paylanması qaytarır — başqa heç nə. Öz sənədi belə yazır:
*"not good at System 2 tasks, specialized domains, and anything generative."*

Bu layihə buna baxmayaraq onunla piksel art çəkməyə çalışır və nə baş verdiyini ölçür.

[![Node](https://img.shields.io/badge/Node.js-20+-3c873a?logo=node.js&logoColor=white)](https://nodejs.org)
[![JEV](https://img.shields.io/badge/JEV-System_One-22d3ee)](https://docs.typesafe.ai)
[![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

</div>

---

## Qısa xülasə

İki yanaşma quruldu və bir-biri ilə müqayisə edildi.

| | **SDF sahəsi** | **Turnir** |
| :--- | :--- | :--- |
| JEV nə edir | hər pikselin obyekt içindəki dərinliyini verir | 96 namizəddən ən yaxşısını seçir |
| Primitiv | `score` (5 səviyyəli rubrika) | `choice` (96 etiket) |
| Kim çəkir | JEV təsvir edir, kod eşikləyir | kod qurur, JEV hakimlik edir |
| Sprite qiyməti | ~$0.013 (üç ölçü, rəngli) | ~$0.006 (altı nəsil) |
| Vaxt | ~1.5s | ~5s |

**Hökm:** hər ikisi təmiz, tək komponentli sprite verir. Amma hər ikisi yalnız **sadə, ikonik**
mövzularda tanınan nəticə çıxarır — alma, göbələk. Nə biri, nə o biri tanınan ördək, şam ağacı
və ya kabus vermir. Tavan modelin özüdür və bu faylın qalan hissəsi sübutdur.

---

## Yanaşma 1 — SDF sahəsi

İlk versiya hər pikselə bir `noul` verirdi: *"bu piksel mürəkkəblidirmi?"* Bu, struktural səbəbdən
uğursuzdur. Bir sorğudakı suallar **paralel** qiymətləndirilir — heç bir piksel o birinin cavabını
bilmir — ona görə model **marjinal** paylanma qaytarır: bütün mümkün almaların ortalamasını,
konkret bir almanı yox. Ortalama isə tərifinə görə bulanıqdır.

Daha çox nümunə götürmək də kömək etmir: JEV özü ilə demək olar tam uyğundur
([std 0.0102](https://docs.typesafe.ai/cookbooks/consistency_noul_cookbook.md), LLM-lərdə 0.30–0.70),
yəni təkrar çağırış eyni cavabı verir. Yeganə lever — **sualın özüdür**.

Ona görə sual aidiyyatdan **dərinliyə** dəyişdi:

```
0  obyektdən uzaqda, boş fon
1  konturun bayır tərəfində
2  düz konturun üstündə
3  içəridə, kənara yaxın
4  dərində
```

`score` cavabı rubrika səviyyələri **arasında** qala bilir, ona görə nəticə səs-küylü ikili maska
yox, kəsilməz işarəli məsafə sahəsi olur. Sprite həmin sahənin `2.5` konturudur.

*"red apple with a green leaf"* mövzusunda 32×32-də ölçüldü
(kompaktlıq = perimetr² / 4π·sahə; aşağı = daha təmiz):

| Sual tipi | Kompaktlıq ↓ | Komponent ↓ | Təkpiksel ↓ |
| :--- | ---: | ---: | ---: |
| `noul` — "bu piksel mürəkkəblidir?" | 4.29 | 2 | 1.3% |
| **`score` — "nə qədər dərindədir?"** | **3.03** | **1** | **0.8%** |

### 64×64 heç vaxt birbaşa soruşulmur

Çözünürlük artdıqca məkan ayırdetməsi dağılır. Eyni forma müxtəlif gridlərdə çəkdirilib,
"mürəkkəbli olmalı" və "boş olmalı" piksellərin orta ehtimal fərqi ölçülüb:

| Grid | diaqonal | sol yarım | dairə | **orta** |
| :--- | ---: | ---: | ---: | ---: |
| 8×8 | 0.401 | 0.544 | 0.264 | 0.403 |
| 16×16 | 0.410 | 0.558 | 0.224 | 0.397 |
| 24×24 | 0.417 | 0.566 | 0.187 | 0.390 |
| 32×32 | 0.342 | 0.576 | 0.154 | 0.357 |

64×64-də tamamilə dağılır — və SDF **kəsilməz** sahə olduğu üçün buna ehtiyac yoxdur:

| 64×64 | Kompaktlıq | Komponent | Qiymət |
| :--- | ---: | ---: | ---: |
| 4096 sual, birbaşa | 17.44 | **15** | $0.0137 |
| **32×32 sahə, bilinear böyüdülmüş** | **3.05** | **1** | **$0.0034** |

On beş qopuq parça yerinə bir təmiz sprite, üstəlik dörd dəfə ucuz. Şrift renderi işarəli məsafə
sahəsini məhz buna görə işlədir. Güzəşt interfeysdə açıq yazılır: 64×64 vərəqinin başlığı
`32×32 soruşulur → 64×64 render` olur, çünki o, 32×32-dən artıq məlumat daşımır.

### Rəng: hər rəngə öz sahəsi

Hər palitra rəngi öz dərinlik sahəsini alır — *"bu piksel yaşıl sahənin nə qədər dərinindədir?"* —
və hər sahə piksel başına argmax-dan əvvəl **öz aralığına normallaşdırılır**.

Bütün sirr normallaşdırmadadır:

```
gövdə  (qırmızı)  max = 3.88
yarpaq (yaşıl)    max = 1.34   ← istənilən mütləq eşik onu silir
sap    (qəhvəyi)  max = 0.82   ← eyni
```

Kiçik hissələrin **yeri düzgündür** — yarpaq sahəsi sprite-ın yuxarısında, sap sahəsi
yuxarı-mərkəzdə pik verir — sadəcə mütləq dəyərləri aşağıdır. Əvvəlki 8×8 bölgə xəritəsi hissələri
mütləq müqayisə etdiyi üçün hər bölgəni eyni rənglə boyayırdı.

### Ehtimal → dither

Dolu nüvə `2.5` konturudur; dither zolağı ondan **kənara** uzanır, beləcə siluet ölçmədə ən yaxşı
çıxan kontur xəttində qalır, tərəddüd isə onun ətrafında Bayer naxışı kimi görünür. Ardınca iki
təmizləmə: tək qalmış piksellər silinir (müstəqil suallar obyektdən uzaqda ara-sıra "bəli" deyir)
və boş sahəyə toxunan nüvə pikselləri tündləşib kontur olur.

---

## Yanaşma 2 — turnir

Rəsmi bələdçi qaydanı bir cümlə ilə verir:

> *"Don't ask Jev to 'extract X' — instead 'pick the right candidate from these options.'
> This reframing — from generation to selection — dramatically improves reliability."*

Ona görə bu rejimdə JEV heç vaxt çəkmir:

```
1. təsvir     JEV mövzu haqqında ümumi mülahizə suallarını cavablayır
              (forma ailəsi? nisbət? neçə hissə? simmetrik?)
2. generasiya kod bu təsvir ətrafında 96 namizəd qurur — API çağırışı yoxdur
3. seçim      bir `choice` çağırışı 96 namizədin HAMISI üçün ehtimal qaytarır;
              bu paylanma fitness funksiyasıdır
4. mutasiya   qaliblər cütləşib mutasiya olunur, 3-cü addıma qayıdılır
```

Altı nəsil, ~5 saniyə, **$0.006**. Genom çözünürlükdən asılı deyil: mühakimə 16×16-da gedir
(ölçmədə ən etibarlı ölçü), qalib istənilən çözünürlükdə render olunur.

Genom lobe birləşməsidir — ellips, üçbucaq (zirvə yuxarı), düzbucaqlı, üçbucaq (zirvə aşağı) —
hər birində **mərkəz kilidi** var: lobe oxun üstünə bağlanır və güzgülənmir. Kilid olmadan
mərkəzdən kənar hər lobe güzgülənir və ağacın gövdəsi iki ayağa bölünür.

### Ölçüldü: JEV sprite-ı oxuya bilirmi?

Beş sprite quruldu və iki üsulla qiymətləndirildi.

**Mütləq `noul`, namizəd başına bir çağırış — işləmir:**

```
alma sprite-ı  → "almadır?"  0.35
ağac sprite-ı  → "almadır?"  0.42   ← almadan yüksək
ulduz sprite-ı → "almadır?"  0.40   ← almadan yüksək
```

**Müqayisəli `choice`, hamısı bir çağırışda — işləyir:**

```
alma 0.61 · ağac 0.33 · ulduz 0.06 · kvadrat 0.00 · səs-küy 0.00
```

Sıralama keyfiyyəti də izləyir. Dörd alma variantı, qəsdən pilləli:

| Sual | Nəticə |
| :--- | :--- |
| Ən yaxşı alma? | **saplı 0.60** > sapsız 0.22 > əyri 0.11 > deşikli 0.07 |
| Ən təmiz siluet? | sapsız 0.45 ≈ saplı 0.46 >> əyri 0.08 > deşikli 0.01 |
| Ən simmetrik? | **sapsız 0.59** > saplı 0.33 >> əyri 0.02 |

Deməli memarlıq şərti sərtdir: **seçim müqayisəli və bir çağırışın içində olmalıdır.**
Tutum: bir çağırışda 128 namizəd, 671ms, 19k token; etiket tavanı 255-dir.

> Ehtimallar **nəsillər arasında müqayisə oluna bilməz** — hər nəsil öz populyasiyası daxilində
> qiymətləndirilir, ona görə qalibin balı zamanla qalxmaya bilər.

---

## Nə işləmədi

Buradakı hər bənd qurulub, ölçülüb və rədd edilib. Siyahıya salınır, çünki mənfi nəticələr
müsbətlərdən daha məlumatlı çıxdı.

| Cəhd | Nəticə |
| :--- | :--- |
| **Ensemble / öz-uyğunluq** | Mənasızdır. JEV praktiki olaraq deterministikdir (std 0.0102), təkrar çağırış eyni cavabı verir. |
| **Kobuddan incəyə kaskad** | 16×16 nəticəsini 32×32 sualına vermək nəticəni **pisləşdirdi** — sprite sürüşdü və dağıldı. |
| **Yüksək çözünürlükdən kiçiltmə** | 32×32-ni 16×16-ya ortalamaq (kompaktlıq 2.2) birbaşa 16×16 soruşmaqdan (2.01) yaxşı deyil, üstəlik 4× baha. |
| **Piksel başına hissə `choice`** | Demək olar hər şeyi "gövdə" adlandırdı: 915 gövdə pikseli, cəmi 109 fon. Yararsız. |
| **Sətir-parametrləşdirmə** | Hər sətrin sol və sağ kənarını soruşmaq düzbucaqlı plitə verdi — model demək olar hər sətirdə eyni kənarı qaytarır. |
| **Sprite-ların mütləq `noul` balı** | Almanı ağacdan ayıra bilmir (0.35 vs 0.42). Yalnız müqayisəli `choice` edə bilir. |
| **Mühakimə çözünürlüyünü qaldırmaq** | Əks nəticə verir. Şam ağacı namizədlərində JEV oval çətiri konusdan üstün tutur və çözünürlük artdıqca səhvə **daha əmin** olur: 16×16 → 0.44 vs 0.38, 24×24 → 0.64 vs 0.25, 32×32 → 0.71 vs 0.13. Təcrid olunmuş forma testində isə üçbucağı hər çözünürlükdə düzgün tanıyır (0.63 vs 0.35) — deməli məsələ görmə deyil, üstünlükdür. |
| **İkinci mühakimə oxu** | Forma ailəsi sualı əlavə edib iki paylanmanı birləşdirmək təcrid olunmuş halda şam ağacını düzəltdi (konus 0.41 > oval 0.38) və nəzarət mövzusunu gücləndirdi (göbələk 0.72 → 0.82) — amma dörd canlı mövzuda tanınma sayı dəyişmədi, qiymət isə $0.006-dan $0.0109-a qalxdı. Geri alındı. |
| **State-dən `band` sahəsini çıxarmaq** | Ardıcıl effekt yoxdur: alma 3.62 → 4.42 (pisləşdi), kabus 7.31 → 5.74 (yaxşılaşdı). Olduğu kimi saxlanıldı. |

---

## Dürüst tavan

**İşləyir:** bütöv, ikonik siluetlər. Alma və göbələkdə yoxlanılıb — hər ikisi təmiz, oxunaqlı
sprite verir. Bu sinfin içində də nəticə dəyişir: *"a red heart"* inandırıcı qırmızı kütlə verir,
amma ürək vermir.

**İşləmir:**

- **Hərf və mətn.** Qlobal koordinasiya marjinal paylanmanın verə bilmədiyi məhz həmin şeydir:

  ```
  "diaqonal xətt"  ✅              "böyük A hərfi"  ❌
  @.:::...........                 .:-----=+--:::.
  .@:............                  ::-==+=====--::
  .=@-::.........                  .===+++=+=---:.
  ```

- **Quruluşlu mövzular.** Ördək, şam ağacı, kabus təmiz, amma ümumi bir ləkə kimi çıxır.
  Səbəb yuxarıdakı ölçmələrdə görünür: JEV *"mənalı siluet"* ilə *"səs-küy"* arasındakı fərqi əla
  ayırır (0.61 vs 0.00), amma *"düzgün siluet"* ilə *"yanlış siluet"* arasındakını zəif ayırır
  (0.61 vs 0.33).
- **Tuvalın ~3%-dən kiçik hissələr**, nisbi normallaşdırma ilə belə.
- **Tək rəngli mövzular əvvəl yad rəng alırdı**, çünki palitra sualı ikinci hissənin rəngini
  soruşur və `choice` cavabsız qala bilmir. Bir `noul` ilə həll olundu: *"bu mövzunun fərqli
  rəngdə aydın görünən ikinci hissəsi varmı?"*
- **~32×32-dən artıq detal.** 64×64 sprite 32×32 məlumatının daha hamar renderidir, artığı deyil.

<details>
<summary><b>API limitləri</b> — ölçülüb və server cavabı ilə təsdiqlənib</summary>

<br>

| | Dəyər |
| :--- | :--- |
| `choice` variant tavanı | **255** (256 → HTTP 400) |
| `score` rubrika səviyyəsi | 2–10; cavab aralarında qala bilər |
| Sorğudakı sual sayı | sual limiti yoxdur — tavan **64k kontekstdir**; `score` sualı `noul`-dan ~5× ağırdır |
| Qiymət | **$0.042 / 1M input token** — output pulsuzdur |
| Sürət limiti | 1200 sorğu/dəq, 250k token/san |
| Giriş | yalnız mətn |

</details>

---

## İşə salmaq

Node.js 20+.

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

Hər sprite öz çözünürlüyündə PNG kimi yüklənir — 16×16 sprite 16×16 piksel fayl olur.

## Quruluş

```
server.js          Express — JEV proxy-si, keep-alive agent, xərc hesabı
public/
  index.html       konsol və vərəq şablonu
  style.css        piksel studiyası — şahmat fon, monospace qeydlər
  app.js           seçilmiş rejimi işə salır, ölçmələri toplayır
  jev.js           proxy müştərisi + sessiya ölçmələri
  paper.js         N×N offscreen → nearest-neighbor böyütmə, dither, kontur
  pixel.js         SDF motoru: palitra → forma sahəsi → rəng sahələri → argmax
  tournament.js    turnir motoru: təsvir → populyasiya → choice → mutasiya
  palette.js       12 rəngli palitra
```

API açarı heç vaxt brauzerə çatmır — bütün çağırışlar `/api/jev` üzərindən keçir.

## Sənəd

TypeSafe sənədləri: <https://docs.typesafe.ai/introduction>

## Lisenziya

MIT
