# Hướng Dẫn Tích Hợp Google Drive "Open With"

Tài liệu này hướng dẫn bạn cách cấu hình Google Cloud Console để ứng dụng **Nimbus Player** xuất hiện trong menu chuột phải **"Mở bằng" (Open with)** khi người dùng thao tác với file video trên giao diện web của Google Drive.

---

## 1. Yêu cầu bắt buộc (Prerequisites)

- **Đã có Domain HTTPS**: Tính năng "Open With" của Google Drive API **KHÔNG** hoạt động với `http://localhost`. Bạn bắt buộc phải deploy ứng dụng lên một môi trường thật (Ví dụ: Vercel, Netlify, Cloudflare Pages, v.v.).
- **Tài khoản Google Cloud**: Cùng tài khoản/Project mà bạn đã dùng để tạo OAuth Client ID cho ứng dụng.
- **OAuth scope cài đặt Drive app**: Ứng dụng phải xin thêm scope `https://www.googleapis.com/auth/drive.install`. Nếu chỉ xin `drive.readonly`, app có thể đọc file sau khi đăng nhập nhưng thường **không tự xuất hiện** trong menu **Open with** của Google Drive.

---

## 2. Các Bước Cấu Hình Trên Google Cloud Console

### Bước 2.1: Bật Google Drive API (Nếu chưa bật)

1. Truy cập vào [Google Cloud Console](https://console.cloud.google.com/).
2. Chọn đúng **Project** của ứng dụng Nimbus Player.
3. Tìm kiếm **"Google Drive API"** trên thanh tìm kiếm và bấm chọn.
4. Bấm **Enable** (Bật) nếu API này chưa được bật.

### Bước 2.2: Cấu hình OAuth scopes

Trong biến môi trường của ứng dụng, cấu hình `VITE_GOOGLE_OAUTH_SCOPES` có cả quyền đọc Drive và quyền cài app vào Drive UI:

```text
VITE_GOOGLE_OAUTH_SCOPES=https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/drive.install
```

Sau khi đổi scope:

1. Deploy lại ứng dụng.
2. Vào **Google Cloud Console -> OAuth consent screen / Data Access** và đảm bảo scope `drive.install` đã được khai báo nếu màn hình consent yêu cầu.
3. Đăng xuất khỏi app, hoặc vào Google Account -> **Security -> Third-party apps & services** để gỡ quyền cũ của Nimbus Player, rồi đăng nhập lại để Google cấp token mới có scope `drive.install`.

### Bước 2.3: Cấu hình "Drive UI Integration"

1. Trong màn hình cấu hình của Google Drive API, nhìn sang menu bên trái, chọn tab **"Drive UI Integration"** (Tích hợp giao diện người dùng Drive).
2. Tại phần **Application Information**, điền các thông tin sau:
   - **Application Name**: Tên sẽ hiển thị trong menu chuột phải (Khuyến nghị: `Nimbus Player`).
   - **Short description**: Mô tả ngắn (VD: `Trình phát video tối ưu cho Google Drive`).
   - **Long description**: (Tùy chọn) Mô tả chi tiết.
   - **Application Icons**: Tải lên các biểu tượng của ứng dụng theo kích thước yêu cầu (16x16, 32x32, v.v.). Icon này sẽ hiển thị bên cạnh tên app trong Drive.

### Bước 2.4: Thiết lập Open URL (Quan Trọng Nhất)

Cuộn xuống phần **Drive Integration**:

1. Tìm mục **Open URL**.
2. Nhập URL trang web của bạn sau khi đã deploy thành công.
   - Ví dụ: `https://nimbus-player.vercel.app/`
   > 💡 **Lưu ý**: KHÔNG cần thêm tham số `?state=...`. Google Drive sẽ tự động đính kèm tham số này vào URL của bạn khi người dùng click "Mở bằng". Router trong mã nguồn (`src/core/router.ts`) đã được lập trình để tự động bắt và xử lý tham số này.

### Bước 2.5: Định nghĩa định dạng file hỗ trợ

Ứng dụng của chúng ta chỉ phát video, nên cần báo cho Google Drive biết để chỉ hiện menu "Open With" đối với các file video.

1. Mục **Default MIME types**: Không dùng wildcard `video/*`. Hãy thêm các MIME type cụ thể:

   ```text
   video/mp4
   video/webm
   video/x-matroska
   video/x-msvideo
   video/quicktime
   video/x-flv
   ```

2. Mục **Default File Extensions**: Thêm các đuôi file video phổ biến. Ví dụ:

   ```text
   mp4, mkv, avi, mov, webm, flv
   ```

3. (Tùy chọn) Nếu bạn muốn ứng dụng hiện lên cho mọi loại file, bạn có thể để trống hoặc cấu hình linh hoạt hơn, nhưng với Nimbus Player, chỉ định video là tốt nhất.

### Bước 2.6: Cấu hình bổ sung (Nên bật)

Cuộn lên các phần tùy chọn phía trên trong trang cấu hình:

1. **Shared drives support**: Hãy **Tích chọn** ô *"This application works properly with files in shared drives"*. Nếu không bật, ứng dụng của bạn sẽ không xuất hiện trong menu Open With khi người dùng xem video trong các thư mục "Bộ nhớ dùng chung" (Shared Drives).
2. **Mobile browser support**: Hãy **Tích chọn** ô *"This application can be launched and works properly in a mobile browser"* vì giao diện web của chúng ta đã được tối ưu cho điện thoại.

### Bước 2.7: Lưu cấu hình

- Cuộn xuống cuối trang và bấm **Submit / Save** để lưu lại tất cả thiết lập.

---

## 3. Quá trình kiểm tra (Testing)

> ⏳ **Chú ý**: Sau khi lưu, có thể mất từ vài phút đến vài giờ để Google cập nhật tích hợp mới này lên hệ thống của họ. Tuy nhiên, nếu đã chờ rất lâu mà vẫn không thấy app, nguyên nhân thường là app chưa được install/authorize với scope `drive.install`, không phải chỉ do propagation.

1. Mở ứng dụng Nimbus Player và đăng nhập Google bằng account muốn dùng trong Drive.
2. Đảm bảo màn hình consent đã xin cả `drive.readonly` và `drive.install`.
3. Mở [Google Drive](https://drive.google.com).
4. Tìm đến một file video (ví dụ: file `.mp4`).
5. Click chuột phải vào file video đó (hoặc bấm vào biểu tượng 3 chấm) -> Chọn **Mở bằng (Open with)**.
6. Bạn sẽ thấy **"Nimbus Player"** xuất hiện trong danh sách. Click vào đó.
7. Google Drive sẽ mở một thẻ trình duyệt mới hướng tới URL ứng dụng của bạn, kèm theo một chuỗi JSON được mã hóa ở tham số `state`:
   `https://nimbus-player.vercel.app/?state={"action":"open","ids":["ID_CUA_FILE_VIDEO"]}`
8. Ứng dụng sẽ tự động parse `state`, trích xuất `FILE_ID` và tiến hành tải video ngay lập tức thông qua luồng xác thực OAuth2 và Service Worker đã thiết lập.

---

## 4. Xử lý sự cố (Troubleshooting)

- **Không thấy app trong menu Open With**: Kiểm tra `VITE_GOOGLE_OAUTH_SCOPES` đã có `https://www.googleapis.com/auth/drive.install`, deploy lại, gỡ quyền OAuth cũ của app trong Google Account, rồi đăng nhập lại.
- **Đã có `drive.install` nhưng vẫn không thấy**: Đảm bảo file bạn đang chọn đúng MIME type hoặc phần mở rộng đã đăng ký ở Bước 2.5. Tránh dùng `video/*`; hãy dùng MIME type cụ thể như `video/mp4`.
- **App chỉ hiện với tài khoản của bạn, không hiện với người khác**: Nếu app chưa publish/install qua Google Workspace Marketplace hoặc người dùng không nằm trong danh sách test users của OAuth consent screen, người khác có thể chưa cài được app.
- **Dùng tài khoản Google Workspace công ty/trường học**: Admin có thể chặn third-party Drive apps hoặc OAuth app chưa được trust. Cần kiểm tra chính sách trong Google Admin Console.
- **Mở app nhưng báo lỗi không tải được video**: Kiểm tra lại xem ứng dụng đã được cấu hình biến môi trường OAuth đúng trên môi trường deploy chưa (đặc biệt là URI Redirect của Google Client ID có khớp với domain deploy không).

## 5. Tham khảo

- <https://developers.google.com/workspace/drive/api/guides/enable-sdk?hl=vi>
- <https://developers.google.com/workspace/marketplace/enable-configure-sdk?hl=vi>
