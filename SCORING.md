# Kitly: logic tính điểm hiện tại

Snapshot code `kitly-kit` ngày 31/10, commit `2ac87bf` (T11). Tài liệu chỉ mô tả code đang có, không đề xuất sửa.

Luồng: `Planner (LLM) → Matcher (lọc + chấm điểm chất lượng) → Optimizer (chọn rổ theo profile) → Pricer (tính tiền chính xác) → fitToBudget (gợi ý khi vượt ngân sách)`.
Từ Matcher trở đi là code thuần, không gọi LLM.

---

## 1. Planner: đầu vào cho phần chấm điểm (`src/server/planner.ts`)

LLM trả về `KitPlan`. Mỗi item gồm:

| Trường | Ý nghĩa với scoring |
|---|---|
| `category` | Thuộc enum taxonomy hoặc `null`. `null` thì không có ứng viên và item thành gap `no_category` |
| `required` | `true` là must-have, không bao giờ bị optimizer tự bỏ. `false` là nice-to-have, có thể bị bỏ khi thiếu tiền |
| `quantity` | Bị kẹp vào khoảng 1–3 |
| `mustHaveTags` | **Bộ lọc cứng** |
| `niceToHaveTags` | **Chỉ cộng điểm** (tagFit) |
| `maxUnitPrice` | Bộ lọc cứng theo đơn giá |

Plan-level: `budget` (trần `grandTotal`) và `deadline` (lọc theo ngày giao).

Hậu xử lý: tag ngữ cảnh (`grade-1`, `kids`, `newborn-0-3m`, …) được chuyển từ must-have sang nice-to-have, để không vô tình lọc mất sản phẩm.

---

## 2. Matcher: lọc và chấm điểm chất lượng (`src/server/matcher.ts`)

### 2.1 Lấy dữ liệu
Gọi `searchProducts({ categories })` **một lần** cho tất cả category trong plan, kèm `listShops()`.
Không dùng text search, nên cũng không có ranking theo từ khóa.

### 2.2 Bộ lọc (theo thứ tự)
1. `product.category === item.category`
2. `stock >= quantity` và shop tồn tại
3. Có đủ **tất cả** `mustHaveTags`
4. `arrivesBy <= deadline`, với `arrivesBy = today + shipDaysMax`
5. `price <= maxUnitPrice`

Kết quả lọc là `exact`, sắp xếp `bestFirst`: **score giảm dần → price tăng dần → id**.

Nếu `exact` rỗng thì item vào `noMatch`. `reason` là bước lọc đầu tiên làm rỗng danh sách: `no_category`, `no_product_with_tags`, `none_in_time` hoặc `none_in_budget`.
Kèm theo là `closest`: ứng viên gần nhất sau khi nới lỏng bộ lọc tag và giá (vẫn giữ deadline), cùng `missingTags` và `overMaxPriceBy`.

### 2.3 Công thức quality (`matcher.ts:24`)

```
quality = 0.35·tagFit + 0.35·rating + 0.18·reviews + 0.12·tier      ∈ [0, 1]

tagFit  = (#niceToHaveTags sản phẩm có) / (#niceToHaveTags)   ; = 1 nếu item không có nice-to-have
rating  = rating / 5
reviews = log10(1 + reviewCount) / log10(8001)                ; 8000 review ⇒ 1.0
tier    = mall 1.0 | preferred 0.75 | regular 0.5
```

| Thành phần | Trọng số | Ghi chú |
|---|---|---|
| tagFit | 0.35 | Mức khớp nhu cầu |
| rating | 0.35 | Tuyến tính theo thang 5 sao |
| reviews | 0.18 | Log, bão hòa ở 8000 review |
| tier | 0.12 | Uy tín shop |
| **price** | **0** | **Giá không nằm trong quality.** Giá chỉ tác động qua profile ở Optimizer |

Ví dụ: rating 4.8, 1.200 review, shop preferred, khớp 2/3 nice-to-have
→ `0.35·0.667 + 0.35·0.96 + 0.18·0.789 + 0.12·0.75 = 0.233 + 0.336 + 0.142 + 0.090 =` **0.801**

---

## 3. Optimizer: chọn rổ theo profile (`src/server/optimizer/index.ts`)

### 3.1 Trạng thái và hàm mục tiêu
Một **state** là một lựa chọn gồm 1 candidate cho mỗi item. Mỗi state được `priceBasket` tính giá chính xác, bao gồm ship theo từng shop và voucher.
- `quality(state) = Σ score` của các candidate đã chọn
- `grandTotal` lấy từ Pricer (mục 4)

`utility` (`index.ts:16`):

| Profile | Utility (càng lớn càng tốt) | Khi hòa | Ràng buộc ngân sách |
|---|---|---|---|
| **saver** | `−grandTotal` | quality cao hơn | **Không**: luôn ghi nhận rổ rẻ nhất, kể cả khi vượt ngân sách |
| **balanced** | `quality − 0.5 · grandTotal / 1.000.000` | grandTotal thấp hơn | Chỉ xét state có `grandTotal ≤ budget` |
| **premium** | `quality` | grandTotal thấp hơn | Chỉ xét state có `grandTotal ≤ budget` |

Cách hiểu balanced: **1 điểm quality tương đương 2.000.000₫**, tức chịu trả thêm tối đa 200k để đổi lấy +0.1 quality.
Hệ số này là **tuyệt đối**, không chuẩn hóa theo quy mô rổ. Với kit 300k, phần giá chỉ chiếm khoảng 0.15 điểm. Với kit 30M, phần giá chiếm khoảng 15 điểm, lớn hơn hẳn tổng quality.

Premium hoàn toàn bỏ qua giá, chỉ bị chặn bởi budget. Không có budget thì premium chọn rổ quality cao nhất, bất kể giá.

### 3.2 Thuật toán tìm kiếm (`search`, `index.ts:34`)
Một lần duyệt cập nhật đồng thời winner của cả 3 profile.

- **Tổng số tổ hợp ≤ 12.000**: **vét cạn** mọi tổ hợp, nên luôn tìm được tối ưu chính xác.
- **Lớn hơn 12.000**: **coordinate descent**, chạy tối đa 2 vòng cho mỗi profile, từ nhiều điểm xuất phát:
  1. Rổ rẻ nhất (mỗi item lấy candidate rẻ nhất)
  2. Rổ quality cao nhất
  3. Rổ ưu tiên 2 shop phủ được nhiều item nhất, mục đích là gom shop để tiết kiệm ship
  4. Rổ ưu tiên từng shop có shop voucher, để vượt ngưỡng min spend vốn cần đổi nhiều item cùng lúc
  5. Winner saver hiện tại, nếu đã có
  - Mỗi bước: với từng item, thử thay bằng mọi candidate khác và giữ thay đổi tốt nhất.
  - `improves`: state nằm trong ngân sách luôn thắng state vượt ngân sách. Nếu cả hai cùng vượt thì so theo saver.
  - Có thể kẹt ở tối ưu cục bộ, vì mỗi bước chỉ đổi một item.

### 3.3 Xử lý ngân sách (`optimizeProfiles`, `index.ts:150`)
1. Lọc lại `stock >= quantity` và deadline. Bước này trùng với Matcher.
2. Chạy `search` với tất cả item có ứng viên.
3. **Nếu rổ saver, tức rổ rẻ nhất, vẫn vượt budget**: bỏ **từng** nice-to-have, theo thứ tự hiệu suất thấp nhất trước.
   Hiệu suất của một item là `max(score / (price × quantity))` trên các candidate của item đó. Sau mỗi lần bỏ thì chạy lại `search`. Must-have không bao giờ bị bỏ.
4. Mỗi profile lấy winner của mình. Nếu không có (không state nào vừa budget) thì fallback về rổ saver.
5. Nếu rổ cuối vẫn `over_budget`: `minimumCost` là grandTotal của saver, `overBy` là `grandTotal − budget`, `costDrivers` là top 3 dòng đắt nhất, và `fit` lấy từ `fitToBudget` (mục 5).

Nice-to-have bị bỏ sẽ nằm trong `skipped` với reason `budget`.

---

## 4. Pricer: tính tiền chính xác (`src/server/optimizer/pricing.ts`)

```
lineTotal  = price × quantity
mỗi shop:  subtotal = Σ lineTotal, shipping = shop.shipFee   (1 phí ship / shop)
grandTotal = itemsTotal + shippingTotal − discountTotal
```

Voucher chỉ được tính nếu `validUntil >= today`. Danh sách voucher gồm voucher public và voucher trong ví của persona (`listVouchers(persona)`).

| Loại | Phạm vi | Điều kiện | Áp dụng |
|---|---|---|---|
| Shop voucher (fixed/percent) | Mỗi shop chọn 1 voucher giảm nhiều nhất | `subtotal ≥ minSpend` | Trừ vào subtotal của shop |
| Platform FREESHIP | Mỗi nhóm shop, 1 voucher | `subtotal của shop ≥ minSpend` | Trừ tối đa bằng phí ship của shop đó |
| Platform discount | Mỗi đơn, 1 voucher giảm nhiều nhất | `itemsTotal` (gộp, **trước** shop discount) `≥ minSpend` | % tính trên `itemsTotal − shopDiscount` |

`discount(v, amount) = clamp(percent ? floor(amount·value/100) : value, 0, min(amount, maxDiscount))`

- Voucher freeship cấp shop **bị bỏ qua**, vì dữ liệu không có loại này.
- Pricer còn trả `alternatives` cho mỗi dòng: tối đa 2 candidate thuộc **shop khác**, mỗi shop 1 candidate, sắp xếp theo `bestFirst`.

---

## 5. fitToBudget: gợi ý khi vượt ngân sách (`src/server/optimizer/fit.ts`)

Các bước được thử theo thứ tự. Bước nào làm rổ vừa budget thì trả về gợi ý đó:
1. Bỏ các item mà người dùng đã "Add anyway".
2. Bỏ dần nice-to-have, hiệu suất `score / lineTotal` thấp nhất trước.
3. **Đổi sản phẩm để tối thiểu grandTotal.**
   - ≤ 4.096 tổ hợp: vét cạn.
   - Lớn hơn: beam search, beam = 64.
   - Mục tiêu chỉ là **giá thấp nhất**, không xét quality.
4. Bỏ dần must-have, đắt nhất trước. Gợi ý khi đó có cờ `dropsMustHave: true`.

Output: tối đa 1 `FitSuggestion` gồm `removeItemKeys`, `swaps`, `grandTotal` và `label` tiếng Việt hoặc tiếng Anh.

---

## 6. Ghi nhận nhanh: hành vi đáng chú ý của code hiện tại

- **Saver không có sàn chất lượng.** Saver chỉ minimize giá, nên có thể chọn sản phẩm rating thấp nếu nó rẻ nhất.
- **Hệ số giá của balanced không chuẩn hóa.** Mức đánh đổi 0.5 điểm cho mỗi 1M₫ hợp với kit vài triệu, nhưng sai lệch nhiều khi kit rất rẻ hoặc rất đắt.
- **Premium khi không có budget** chọn rổ quality cao nhất, bất kể giá.
- **Rating chia 5 bị nén**: 4.0★ và 4.9★ chỉ chênh khoảng 0.063 điểm. Thiếu Bayesian prior, nên 5.0★ với 3 review vẫn được điểm rating tối đa.
- `soldCount` (nếu có trong dữ liệu) và `persona` **không** tham gia chấm điểm. Persona chỉ ảnh hưởng tới voucher trong ví.
- Quality của rổ là **tổng** điểm, nên rổ có nhiều item hơn luôn có quality cao hơn. Đây là lý do việc bỏ nice-to-have được làm riêng, không giao cho utility quyết định.
- Khi trên 12.000 tổ hợp, coordinate descent chỉ chạy 2 vòng, nên không đảm bảo tìm được tối ưu toàn cục.
- `pipeline.ts:139` tính `budgetHint = budget! / #items`. Khi `budget = null` thì phép tính ra 0, nhưng giá trị này chỉ dùng cho bảng demand, không ảnh hưởng chấm điểm.
