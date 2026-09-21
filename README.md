<div align="center">

# JEV Canvas

**Dərinlik sahəsindən piksel art**

[JEV](https://docs.typesafe.ai/introduction) (TypeSafe System One) mətn yaratmır və şəkil çəkmir —
tipli dəyər və ehtimal paylanması qaytarır. Burada hər piksel bir `score` sualıdır:
**«sən obyektin nə qədər dərinindəsən?»** Cavab kəsilməz bir dərinlik sahəsidir (SDF),
sprite isə o sahənin kontur xəttidir.

İki rejim var: **SDF sahəsi** (JEV dərinlik verir, kod kontura çevirir) və
**Turnir** (kod namizəd sprite-lar qurur, JEV onları qiymətləndirir).

[![Node](https://img.shields.io/badge/Node.js-20+-3c873a?logo=node.js&logoColor=white)](https://nodejs.org)
[![JEV](https://img.shields.io/badge/JEV-System_One-22d3ee)](https://docs.typesafe.ai)

</div>

---

## Turnir rejimi — JEV çəkmir, seçir

Rəsmi bələdçi qaydanı bir cümlə ilə verir:

> *"Don't ask Jev to 'extract X' — instead 'pick the right candidate from these options.'
> This reframing — from generation to selection — dramatically improves reliability."*

Turnir məhz budur:

```
1. təsvir     JEV mövzunu ümumi mülahizə sualları ilə təsvir edir
              (dəyirmi? hündür? neçə hissə? simmetrik?) — sənədli güclü tərəfi
2. generasiya kod bu təsvir ətrafında 96 namizəd qurur (API-siz, ani)
3. seçim      bir `choice` çağırışı 96 namizədin HAMISI üçün ehtimal qaytarır —
              bu paylanma birbaşa fitness funksiyasıdır
4. mutasiya   qaliblər cütləşir, yeni nəsil qurulur, 3-cü addıma qayıdılır
```

6 nəsil ≈ 5 saniyə, **$0.006**. Genom çözünürlükdən asılı deyil: mühakimə 16×16-da gedir
(ölçmədə ən etibarlı ölçü), qalib isə istənilən çözünürlükdə render olunur.

### Ölçdük: JEV sprite-ı oxuya bilirmi?

Beş sprite hazırlayıb iki üsulla soruşduq. **Mütləq `noul` işləmir:**

```
alma sprite-ı  → "almadır?" 0.35
ağac sprite-ı  → "almadır?" 0.42   ← almadan yüksək
ulduz sprite-ı → "almadır?" 0.40   ← almadan yüksək
```

**Müqayisəli `choice` işləyir:**

```
alma 0.61 · ağac 0.33 · ulduz 0.06 · kvadrat 0.00 · səs-küy 0.00
```

Keyfiyyət sıralaması da düzgündür — dörd alma variantı, qəsdən pilləli:

| Sual | Nəticə |
| :--- | :--- |
| Ən yaxşı alma? | **saplı 0.60** > sapsız 0.22 > əyri 0.11 > deşikli 0.07 |
| Ən təmiz siluet? | sapsız 0.45 ≈ saplı 0.46 >> əyri 0.08 > deşikli 0.01 |
| Ən simmetrik? | **sapsız 0.59** > saplı 0.33 >> əyri 0.02 |

Ona görə memarlıq şərti sərtdir: **seçim bir çağırış içində, müqayisəli olmalıdır.**
Namizəd başına ayrı `noul` balı işləmir.

Tutum: bir `choice` çağırışında **128 namizəd** — 671ms, 19k token, $0.0008. Etiket tavanı 255-dir.

> **Dürüst qeyd:** nəsillər arasında ehtimallar müqayisə oluna bilməz — hər nəsil öz
> populyasiyası daxilində qiymətləndirilir, ona görə qalibin balı nəsildən-nəslə
> qalxmaya bilər. Keyfiyyət tavanı isə generatorun tavanıdır: JEV seçir, icad etmir.

---

## Niyə `noul` yox, `score`

İlk versiya hər pikselə `noul` verirdi — "bu piksel mürəkkəblidirmi?". Problem strukturaldır:
suallar bir sorğuda **paralel** qiymətləndirilir, bir piksel o birinin cavabını bilmir.
Nəticədə model **marjinal paylanma** qaytarır — "bütün mümkün almaların ortalaması", konkret
bir alma yox. Ortalama isə tərifinə görə bulanıqdır, sərhəd səs-küylü çıxır.

Bunu daha çox nümunə götürməklə düzəltmək mümkün deyil: JEV özü ilə demək olar tam uyğundur
([std 0.0102](https://docs.typesafe.ai/cookbooks/consistency_noul_cookbook.md), LLM-lərdə 0.30–0.70),
yəni cavab determinikdir. Yeganə lever — **sualın özünü dəyişmək**.

`score` rubrikası beş səviyyəlidir və cavab səviyyələr **arasında** qala bilir:

```
0  çöldə, fondan uzaq
1  konturun bayır tərəfində
2  düz konturun üstündə
3  içəridə, kənara yaxın
4  dərində
```

Ölçülmüş fərq (32×32, "red apple with a green leaf"; kompaktlıq = perimetr²/4πsahə, aşağı = təmiz):

| Üsul | Kompaktlıq↓ | Komponent↓ | Təkpiksel↓ |
| :--- | ---: | ---: | ---: |
| `noul` (köhnə) | 4.29 | 2 | 1.3% |
| **`score`-SDF** | **3.03** | **1** | **0.8%** |

## Niyə 64×64 birbaşa soruşulmur

4096 sual modelin ayırdetmə gücünü aşır. Ölçdük:

| 64×64 | Kompaktlıq | Komponent | Qiymət |
| :--- | ---: | ---: | ---: |
| Birbaşa 4096 sual | 17.44 | **15** | $0.0137 |
| **32×32 SDF → bilinear** | **3.05** | **1** | **$0.0034** |

Birbaşa soruşulan 64×64 on beş ayrı parçaya dağılır. SDF isə kəsilməz sahədir — 32×32-də
soruşulub interpolyasiya ilə böyüdülür və tək, təmiz sprite verir, üstəlik dörd dəfə ucuz.
Şrift renderi SDF-i məhz buna görə işlədir.

> Bu o deməkdir ki **64×64 heç vaxt 32×32-dən çox məlumat daşımır** — interpolyasiya kənarı
> hamarlayır, detal əlavə etmir. Vərəqin başlığında bu açıq yazılır: `32×32 soruşulur → 64×64 render`.

## Rəng: hər rəngə öz sahəsi

Palitra seçildikdən sonra **hər rəng üçün ayrıca SDF** soruşulur — "bu piksel yaşıl sahənin
nə qədər dərinindədir?" — sonra sahələr **öz aralığına normallaşdırılır** və piksel argmax-a gedir.

Normallaşdırma həlledicidir. Ölçmədə:

```
gövdə (qırmızı):  max = 3.88
yarpaq (yaşıl):   max = 1.34   ← mütləq eşiklə tamamilə itirdi
sap (qəhvəyi):    max = 0.82   ← eyni
```

Kiçik hissələrin **yeri düzgündür**, sadəcə mütləq dəyəri aşağıdır. Köhnə 8×8 bölgə xəritəsi
hissələri mütləq müqayisə etdiyi üçün həmişə bir rəng seçirdi; normallaşdırılmış argmax isə
yarpağı düz yerinə qoyur.

Rəng sahələri 16×16-da soruşulur — rəng bölgələri alçaq tezliklidir, forma qədər dəqiqlik istəmir.

## Ehtimal → dither

Dolu nüvə `surface = 2.5` konturudur; dither zolağı ondan **kənara** uzanır. Beləcə silinuet
ölçmədə ən yaxşı çıxan kontur xəttində qalır, tərəddüd isə onun ətrafında naxış kimi görünür.
Üstünə iki addım: **təkpiksel təmizləmə** (iki qonşusu olmayan piksel səs-küydür) və **kontur**
(nüvənin kənar pikselləri tündləşir).

---

## Ölçülmüş sərhədlər

**İşləyən:** bütöv siluetlər — alma, ürək, ulduz, qılınc, kabus.

**İşləməyən:**

- **Hərf və mətn.** Qlobal koordinasiya tələb edir, marjinal paylanma onu verə bilmir:
  ```
  "diaqonal xətt"  ✅              "böyük A hərfi"  ❌
  @.:::...........                 .:-----=+--:::.
  .@:............                  ::-==+=====--::
  .=@-::.........                  .===+++=+=---:.
  ```
- **Kaskad.** 16×16 nəticəsini 32×32-yə kontekst kimi verəndə nəticə pisləşdi — sprite sürüşdü
  və dağıldı. Ona görə üç ölçü bir-birindən xəbərsiz işləyir.
- **Tuvalın ~3%-dən kiçik hissələr** normallaşdırma ilə belə zəif qalır.
- **Sınanıb rədd edilən üsullar:** piksel başına hissə `choice` (hər şeyi "gövdə" adlandırdı),
  sətir-parametrləşdirmə (düzbucaqlı plitə verdi), ensemble (model deterministikdir),
  namizəd başına mütləq `noul` balı (sprite-ları ayırd etmir).
- **State-dən `band` sahəsini çıxarmaq** — sınandı, ardıcıl effekt yoxdur: almada kompaktlıq
  3.62 → 4.42 (pisləşdi), kabusda 7.31 → 5.74 (yaxşılaşdı). Olduğu kimi saxlanıldı.

<details>
<summary><b>API limitləri</b></summary>

<br>

| | Dəyər |
| :--- | :--- |
| `choice` variant tavanı | **255** (256 → HTTP 400) |
| `score` səviyyə sayı | 2–10, nəticə arada float |
| Bir sorğuda sual sayı | limit sual sayı yox, **64k kontekstdir**; `score` sualı `noul`-dan ~5× ağırdır |
| Qiymət | **$0.042 / 1M input** — output pulsuz |
| Sürət limiti | 1200 sorğu/dəq, 250k token/san |
| Giriş | yalnız mətn |

Üç ölçü birlikdə, rəngli rejimdə bir sprite dəsti ≈ **$0.013**.

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

Hər sprite öz çözünürlüyündə PNG kimi yüklənir — 16×16 sprite 16×16 piksel fayl olur.

## Necə qurulub

```
server.js          Express — JEV proxy-si, keep-alive agent, xərc hesabı
public/
  index.html       Konsol və vərəq şablonu
  style.css        Piksel studiyası — şahmat fon, monospace qeydlər
  app.js           Ölçüləri paralel işə salır, ölçmələri toplayır
  jev.js           Proxy müştərisi + sessiya ölçmələri
  paper.js         N×N offscreen → nearest-neighbor böyütmə, dither, kontur
  pixel.js         SDF motoru: palitra → forma SDF → rəng SDF-ləri → argmax
  tournament.js    Turnir motoru: təsvir → genom populyasiyası → choice seçimi → mutasiya
  palette.js       12 rəngli palitra
```

API açarı heç vaxt frontend-ə göndərilmir — bütün çağırışlar `/api/jev` üzərindən keçir.

## Rəsmi sənədlər

<https://docs.typesafe.ai/introduction>
