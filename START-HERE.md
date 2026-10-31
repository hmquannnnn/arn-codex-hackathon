# Kitly — bắt đầu từ đây (31/10)

Gói này chỉ có **tài liệu** (soạn trước, đã khai trong Declarations PDF). Code viết hoàn toàn tại chỗ.

## 1. Lane 3 (10:00, ~5 phút)
1. Tạo repo **public** mới trên GitHub, clone về máy.
2. Bung zip vào gốc repo. Gốc phải có `AGENTS.md`, `START-HERE.md` và thư mục `kit/`.
3. `git add -A && git commit -m "kit: planning docs (prepared before the event)" && git push`
4. Tạo project Supabase + Vercel, gửi env cho cả đội. Danh sách biến ở `AGENTS.md` mục **Env**.
5. Báo Lane 1 bắt đầu T00 ngay. Lane 2 đọc kit trong lúc chờ T00 push.

## 2. Lane 1 và Lane 2: mở Codex trong thư mục repo
Codex tự đọc `AGENTS.md` ở gốc. Mỗi ticket dán đúng khối dưới, chỉ đổi lane và ticket:
```
You are Lane <1|2>, mode full. Read AGENTS.md, then kit/PRD.md, kit/CONTRACT.md, kit/DATA.md, kit/DEMO.md.
Implement ONLY kit/tickets/<NN-file>.md. Follow AGENTS.md exactly: tests first at the named seams,
npm test + npm run build green, commit "T<NN>: …", pull --rebase, push, append to CODEX_LOG.md.
```
Thứ tự ticket:
- **Lane 1:** `00 01 02 03 04 09 16 05 06 07 08 20a`
- **Lane 2:** `10 11 15 17 12 13 14 20b`

Giờ giấc và mốc quyết định: `kit/RUNBOOK.md`. Kịch bản demo 6 phút: `kit/DEMO.md`.

## 3. Khi Codex xong một ticket
Đọc tin nhắn cuối của nó, tự chạy `npm test`, mở app xem, rồi giao ticket kế tiếp.
Nếu Codex chạy lệch hướng quá 15 phút: dừng, chạy `git reset --hard origin/main`, rồi chạy lại kèm một ghi chú rõ hơn.
Vướng thì ghi vào `BLOCKERS.md`; Lane 3 đọc file này mỗi giờ.
