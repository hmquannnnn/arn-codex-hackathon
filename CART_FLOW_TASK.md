# Kitly: Hiểu giỏ hàng để đề xuất bộ đồ phù hợp

**Trạng thái:** Đề xuất feature để team review.

## Ý tưởng

Người mua thường thêm nhiều món vào giỏ để lưu lại và cân nhắc, chứ chưa chắc muốn mua tất cả. Một giỏ có thể chứa nhiều lựa chọn balo, đồ cho nhiều dịp và cả những món định mua sau.

Kitly sẽ kết hợp **nhu cầu hiện tại** với **những món người dùng đã lưu trong giỏ**, giúp họ chọn ra một bộ đồ phù hợp, đủ dùng và đáp ứng ngân sách.

Feature có hai luồng dùng chung ý tưởng này:

| Luồng | Người dùng muốn gì? | Kitly chọn sản phẩm từ đâu? |
|---|---|---|
| Tìm bộ đồ, có hiểu giỏ hàng | “Chuẩn bị cho nhu cầu này, xem cả những món tao đã lưu.” | Giỏ hàng và các sản phẩm khác trong cửa hàng |
| Chọn bộ đồ từ giỏ hàng | “Tao xem đủ rồi, giúp tao chọn trong những món đã lưu.” | Chỉ những món có trong giỏ |

Phạm vi thử nghiệm đầu tiên là đồ đi học.

## Nguyên tắc chọn đồ

- **Đáp ứng yêu cầu trước:** sản phẩm phải phù hợp nhu cầu, số lượng, điều kiện bắt buộc và hạn nhận hàng. Cả bộ được kiểm tra theo ngân sách.
- **Ưu tiên nhẹ những món đã lưu:** nếu sản phẩm đáp ứng yêu cầu, việc có sẵn trong giỏ có thể cộng thêm một phần nhỏ vào điểm lựa chọn, vì đây là tín hiệu người dùng đã quan tâm. Mức cộng cụ thể sẽ được thử nghiệm sau.
- **Có trong giỏ không đồng nghĩa phải mua:** Kitly vẫn có thể đề xuất món khác nếu phù hợp hơn. Món không đáp ứng yêu cầu không được cộng điểm để “bù” cho điều kiện còn thiếu.
- **Người dùng có quyền quyết định:** “Giữ chiếc này” nghĩa là cố gắng xây bộ quanh món đó. Nếu có xung đột, Kitly nói rõ để người dùng chọn cách xử lý.
- **Đề xuất không tự thay đổi giỏ:** chỉ cập nhật khi người dùng xác nhận. Những món chưa chọn vẫn được giữ lại để cân nhắc lần sau.

## Luồng 1: Tìm bộ đồ, có hiểu giỏ hàng

### Tình huống

Lan đã xem hàng hôm trước và lưu vào giỏ:

| Món đã lưu | Giá minh họa |
|---|---:|
| Balo KidZone Lite | 520.000₫ |
| Bình giữ nhiệt | 149.000₫ |
| Tai nghe | 300.000₫ |

Hôm nay, Lan tìm kiếm từ trang chủ:

> “Con tao chuẩn bị vào lớp 1, chọn bộ đồ đi học dưới 1 triệu.”

### Kitly hỗ trợ thế nào?

Kitly nhận ra balo và bình nước trong giỏ liên quan đến nhu cầu đi học. Tai nghe vẫn nằm trong giỏ nhưng không được đưa vào bộ này.

Kitly so sánh những món đã lưu với các sản phẩm khác trong cửa hàng, rồi đề xuất:

| Món trong bộ | Nguồn | Lý do |
|---|---|---|
| Balo KidZone Lite | Đã có trong giỏ | Phù hợp nhu cầu, được ưu tiên nhẹ vì Lan đã lưu |
| Bình giữ nhiệt | Đã có trong giỏ | Phù hợp nhu cầu |
| Bộ vở | Tìm thêm trong cửa hàng | Bổ sung món còn thiếu |
| Bộ bút | Tìm thêm trong cửa hàng | Bổ sung món còn thiếu |
| Hộp bút | Tìm thêm trong cửa hàng | Bổ sung món còn thiếu |

Kitly hiển thị tổng tiền sau phí giao hàng và ưu đãi áp dụng được. Bên cạnh balo có thể có một lựa chọn khác:

> “Có chiếc balo khác giá 420.000₫. Đổi sang chiếc này sẽ giảm 100.000₫ tiền hàng.”

Lan trả lời:

> “Tao thích KidZone hơn, giữ cái đó.”

Kitly giữ chiếc balo và điều chỉnh những món còn lại nếu cần.

Nếu Lan bổ sung “balo phải chống gù”, nhưng chiếc trong giỏ chưa có thông tin xác nhận, Kitly phải nói rõ và tìm lựa chọn đáp ứng. Việc Lan đã lưu sản phẩm không làm mất yêu cầu bắt buộc này.

### Kết quả

Lan có một bộ đồ kết hợp các món đã thích với những món còn thiếu. Khi xác nhận, những món mới được thêm vào giỏ; balo và bình nước đã có không bị thêm trùng. Tai nghe vẫn được giữ để mua sau.

## Luồng 2: Chọn bộ đồ từ những món trong giỏ

### Tình huống

Sau nhiều lần xem hàng, giỏ của Lan có:

| Món đã lưu | Giá minh họa |
|---|---:|
| Balo Bago | 200.000₫ |
| Balo KidZone Lite | 520.000₫ |
| Bình nước nhựa | 85.000₫ |
| Bình giữ nhiệt | 149.000₫ |
| Bộ vở | 50.000₫ |
| Bộ bút | 30.000₫ |
| Đèn bàn | 180.000₫ |
| Tai nghe | 300.000₫ |

Lan không muốn tìm thêm. Tại giỏ hàng, Lan chọn **“Build a kit from my cart”** và nói:

> “Chọn bộ đi học cho một bé lớp 1 dưới 800k, chỉ dùng đồ trong giỏ. Giữ balo KidZone, đèn bàn nhà có rồi.”

### Kitly hỗ trợ thế nào?

Kitly chọn một bộ từ các món đã lưu:

| Quyết định | Món | Lý do |
|---|---|---|
| Mua lần này | Balo KidZone Lite | Lan yêu cầu giữ |
| Mua lần này | Bình nước nhựa | Đáp ứng nhu cầu, tiết kiệm ngân sách |
| Mua lần này | Bộ vở, bộ bút | Các món cần cho lần mua này |
| Lựa chọn khác | Balo Bago, bình giữ nhiệt | Có thể thay các món đã chọn |
| Giữ trong giỏ | Đèn bàn, tai nghe | Đã có đèn; tai nghe chưa thuộc nhu cầu lần này |

Tiền hàng của bộ đề xuất là **685.000₫**. Kitly tính tiếp phí giao hàng và ưu đãi để kiểm tra tổng có nằm trong ngân sách 800.000₫ không.

Nếu checklist còn thiếu hộp bút, Kitly chỉ ra phần thiếu. Vì Lan yêu cầu chỉ dùng đồ trong giỏ, Kitly không tự tìm và thêm sản phẩm ngoài giỏ. Nếu các món thiết yếu không thể đáp ứng trong ngân sách, Kitly nói rõ thay vì trình bày bộ đồ như đã đầy đủ.

Lan có thể nói tiếp:

> “Đổi sang bình giữ nhiệt.”

Tiền hàng thành **749.000₫**. Kitly tính lại tổng thanh toán và thông báo có còn vừa ngân sách không.

### Kết quả

Lan duyệt bộ đề xuất và chỉ thanh toán những món đã chọn. Các món khác vẫn nằm trong giỏ. Nếu chỉ mua một phần số lượng của một món, số lượng còn lại cũng được giữ.

Trong luồng này, tất cả ứng viên đều đã nằm trong giỏ nên việc “có trong giỏ” không giúp phân biệt món nào tốt hơn. Lựa chọn dựa trên yêu cầu, ngân sách, sự phù hợp và những món Lan muốn giữ.

## Giá trị của hai luồng

- Khi đang tìm đồ: Kitly tận dụng những lựa chọn người dùng đã xem, giảm việc phải bắt đầu lại từ đầu.
- Khi đã xem đủ: Kitly giúp người dùng chốt một bộ từ giỏ, giảm việc tự so sánh và tính tiền.
- Trong cả hai luồng: người dùng biết vì sao một món được chọn, món nào còn thiếu và tổng phải trả là bao nhiêu.

Đây vẫn là bài toán ban đầu của Kitly: **từ một nhu cầu, giúp người dùng chọn ra bộ đồ phù hợp**. Hai luồng khác nhau ở nơi bắt đầu và nguồn sản phẩm được phép chọn.

## Phạm vi đề xuất để team thống nhất

Bản đầu gồm hai điểm vào trên, lựa chọn giữ/đổi/để sau, tổng tiền có phí giao hàng và ưu đãi, cùng khả năng chỉ thanh toán các món đã chọn.

Chưa bao gồm tự dọn toàn bộ giỏ khi chưa có nhu cầu cụ thể, nhắc mua, theo dõi giảm giá hay tự suy đoán sở thích từ lịch sử dài hạn.

**Lưu ý:** Giá và kết quả lựa chọn trong các ví dụ là minh họa trải nghiệm, không phải cam kết về giá hay tổng thanh toán của catalog hiện tại.
