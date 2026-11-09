# Paper Friends Shorts → TikTok · Instagram · Facebook (qua Buffer)

Kho này giữ video Short (`videos/`) và lịch đăng (`posts.json`). Mỗi sáng 08:17 giờ VN, GitHub Actions gọi Buffer API để hẹn giờ các bài của 7 ngày tới, đúng 19:00 giờ VN, lên cả 3 mạng. Lịch tổng và chú thích: trang Paper Friends Social Reels.

## Làm một lần
1. **Buffer:** nối 3 kênh TikTok @paperfriendssongs, Instagram @paperfriendssongs, Trang Facebook Paper Friends.
2. **Lấy API key:** Buffer → Settings → API (publish.buffer.com/settings/api) → tạo key.
3. **Cất key vào GitHub:** kho này → Settings → Secrets and variables → Actions → New repository secret.
   - Tên `BUFFER_API_KEY`, giá trị là key vừa tạo.
   - Đừng dán key vào chat hay vào file.
4. **Kiểm tra:** tab Actions → "Schedule Shorts to Buffer" → Run workflow.
   - `mode = channels`: phải thấy đủ 3 kênh.
   - `mode = dry-run`: xem danh sách bài sẽ hẹn.
5. **Đăng thử:** Run workflow với `mode = schedule`, `only = meet_paper_friends`. Mở Buffer → Queue, kiểm tra:
   - đủ 3 bài lúc 19:00 ngày 12/11;
   - Instagram và TikTok có dấu ✨ AI-generated.

## Nhãn AI
- **Instagram và TikTok:** gửi kèm cờ `isAiGenerated` của Buffer.
- **Facebook:** Buffer chưa có cờ này. Chú thích Facebook tự thêm dòng "🎵 Song & animation made with AI." (`config.json`). Muốn có nhãn "AI info" chính thức của Meta thì mở bài trong Meta Business Suite và bật Nhãn AI.

## Thêm bài
- Chép video 1080×1920 vào `videos/<key>.mp4` (dưới 100 MB).
- Thêm một mục vào `posts.json` gồm `key`, `publish_at` giờ VN, `caption`, `channels`.
- Workflow tự hẹn khi bài vào cửa sổ 7 ngày.
- `state/scheduled.json` ghi ID bài đã hẹn để không hẹn trùng. Xoá một dòng trong đó thì lần chạy sau sẽ hẹn lại bài đó.

Gói Buffer miễn phí cho tối đa 10 bài chờ mỗi kênh. Cửa sổ 7 ngày (`window_days`) giữ dưới mức đó.
