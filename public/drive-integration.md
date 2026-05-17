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

## 3. Cấu hình Google Workspace Marketplace SDK

Google Drive UI Integration giúp app xuất hiện trong **Open with**, còn Google Workspace Marketplace SDK dùng để quản lý app trên Marketplace: ai có thể xem/cài app, app tích hợp với dịch vụ Google Workspace nào, và app yêu cầu OAuth scopes nào.

### Bước 3.1: Bật đúng SDK

1. Vào Google Cloud Console trong đúng project của Nimbus Player.
2. Bật **Google Workspace Marketplace SDK**.
3. Lưu ý: Đây là **Google Workspace Marketplace SDK**, không phải **Google Workspace Marketplace API**. Marketplace API là công cụ khác, chủ yếu dùng cho licensing/billing.

### Bước 3.2: Chọn visibility và install settings

Trong Marketplace SDK, cấu hình:

- **App visibility**:
  - Chọn **Public** nếu muốn người dùng ngoài domain của bạn tìm/cài app.
  - Chọn **Private** nếu chỉ dùng nội bộ trong một Google Workspace domain.
- **Installation settings**:
  - Với Nimbus Player, chọn **Individual + Admin install** nếu muốn người dùng cá nhân có thể tự cài app.
  - Chọn **Admin install only** chỉ khi app bắt buộc được admin cài cho domain.

> ⚠️ Theo tài liệu Google, sau khi chọn và lưu app visibility, bạn có thể không đổi lại lựa chọn này được. Hãy chọn cẩn thận trước khi lưu.

### Bước 3.3: Chọn loại tích hợp

Trong phần app integrations, chọn loại phù hợp:

- **Drive app**: Bắt buộc nếu muốn xuất bản app tích hợp với Google Drive. Bạn vẫn phải bật và cấu hình Google Drive API / Drive UI Integration như phần 2.
- **Web app**: Dùng khi muốn app có URL điều hướng chung từ Google Workspace apps menu. Nếu chọn mục này, nhập URL production của app:

  ```text
  https://nimbus-player.vercel.app
  ```

### Bước 3.4: Khai báo OAuth scopes trong Marketplace SDK

Trong phần OAuth scopes của Marketplace SDK, nhập đúng các scope mà app dùng trên OAuth consent screen và trong biến môi trường:

```text
https://www.googleapis.com/auth/drive.readonly
https://www.googleapis.com/auth/drive.install
openid
https://www.googleapis.com/auth/userinfo.email
https://www.googleapis.com/auth/userinfo.profile
```

Nếu sau này đổi scope trong OAuth consent screen hoặc `VITE_GOOGLE_OAUTH_SCOPES`, hãy cập nhật lại Marketplace SDK để các danh sách scope khớp nhau.

---

## 4. Hoàn tất Store Listing trên Google Workspace Marketplace

Marketplace SDK chỉ cấu hình cách app tích hợp/cài đặt. Để người dùng tìm thấy Nimbus Player trên Google Workspace Marketplace, bạn còn phải hoàn tất tab **Store Listing** và submit review.

### Bước 4.1: Mở Store Listing

Trong Google Cloud Console:

```text
APIs & Services -> Google Workspace Marketplace SDK -> Store Listing
```

Điền đầy đủ các nhóm thông tin sau.

### Bước 4.2: App Details

Các field nên dùng cho Nimbus Player:

```text
Language:
Vietnamese / Tiếng Việt
```

Nếu muốn listing dễ được reviewer đọc hơn, có thể thêm English làm ngôn ngữ phụ.

```text
Application name:
Nimbus Player
```

Tên này nên khớp với OAuth consent screen và homepage.

```text
Short description:
Phát video từ Google Drive trong một trình phát gọn, nhanh và riêng tư.
```

Giới hạn short description là 200 ký tự.

```text
Detailed description:
Nimbus Player giúp người dùng mở và phát các file video được lưu trong Google Drive của chính họ. Ứng dụng hỗ trợ mở video bằng Google Drive link, File ID, Drive folder và menu Open with của Google Drive.

Ứng dụng đọc metadata và nội dung video đã được người dùng cấp quyền để hiển thị thư viện video, tạo playlist theo thư mục và phát video trực tiếp trong trình duyệt. Nimbus Player không chỉnh sửa, xóa, upload, chia sẻ hoặc chuyển file Google Drive sang dịch vụ lưu trữ khác.

Các tính năng chính:
- Mở video từ Google Drive URL hoặc File ID.
- Mở video bằng Open with trong Google Drive.
- Duyệt và tìm kiếm video trong Google Drive.
- Duyệt video theo Drive folder và phát như playlist.
- Ghi nhớ vị trí xem trong trình duyệt.
- Hỗ trợ phụ đề và các điều khiển phát video cơ bản.
```

```text
Category:
Productivity
```

Nếu có field **Pricing**, chọn:

```text
Free of charge
```

### Bước 4.3: Graphic Assets

Chuẩn bị asset theo yêu cầu của Google:

- **Application icons**:
  - `128 x 128`
  - `32 x 32`
  - Nếu listing có Web app, chuẩn bị thêm `96 x 96` và `48 x 48`.
- **Application card banner**:
  - `220 x 140`
- **Screenshots**:
  - Ít nhất 1 ảnh, tối đa 5 ảnh.
  - Kích thước khuyến nghị: `1280 x 800`.
  - Có thể dùng `640 x 400` hoặc `2560 x 1600` nếu cần.
  - Ảnh nên full-bleed, góc vuông, không padding.

Screenshot nên thể hiện rõ app tích hợp với Google Drive:

1. Homepage Nimbus Player có tên app và mục đích app.
2. Drive browser sau khi đăng nhập.
3. Player đang phát video từ Google Drive.
4. Google Drive menu **Open with -> Nimbus Player**.
5. Playlist theo Drive folder nếu muốn reviewer thấy lý do dùng `drive.readonly`.

### Bước 4.4: Support Links

Các link bắt buộc:

```text
Terms of service:
https://nimbus-player.vercel.app/terms.html
```

Nếu bạn chưa có Terms of Service riêng, hãy tạo trang này trước khi submit listing.

```text
Privacy policy:
https://nimbus-player.vercel.app/privacy.html
```

```text
Support:
https://nimbus-player.vercel.app/support.html
```

Nếu chưa có support page riêng, tạo trang đơn giản ghi cách liên hệ, email support, và thông tin cần gửi khi báo lỗi.

Các link tuỳ chọn:

```text
Setup:
https://nimbus-player.vercel.app
```

Không cần **Admin config** nếu app không yêu cầu admin cấu hình domain-level.

### Bước 4.5: Distribution

Nếu muốn public toàn cầu:

```text
Distribution:
All regions
```

Nếu chỉ chọn một số region, người dùng ngoài region đó sẽ không thấy app trong Marketplace search và có thể không mở được direct listing URL.

### Bước 4.6: Submit for review

Sau khi điền xong:

1. Kiểm tra lại App Configuration đã chọn đúng:

   ```text
   App visibility: Public
   Installation settings: Individual + Admin install
   Integration: Drive app
   ```

2. Kiểm tra OAuth scopes trong Marketplace SDK khớp với OAuth consent screen.
3. Bấm **Submit For Review** trong tab Store Listing.
4. Theo dõi trạng thái ở đầu trang Store Listing.
5. Theo dõi email ở **Developer email** vì Google sẽ gửi kết quả review hoặc yêu cầu sửa vào email này.

### Bước 4.7: Trả lời email review từ GWM Reviews

Khi Google Workspace Marketplace Review Team bắt đầu review, họ có thể gửi email yêu cầu:

- Video demo end-to-end workflow.
- Cách app sử dụng requested scopes.
- Testing credentials nếu app cần account riêng, API token hoặc allowlist.
- Allowlist test account:

  ```text
  gwm-testuser@marketplacetest.net
  ```

Với Nimbus Player:

- Không gửi mật khẩu Google hoặc tài khoản Google cá nhân.
- Nếu app đang ở production/external và không có allowlist riêng trong code, nói rõ app không cần credentials riêng; reviewer có thể đăng nhập bằng Google account của họ.
- `gwm-testuser@marketplacetest.net` chủ yếu dùng để allowlist nếu app có chặn user/domain. Tài khoản này có thể không hiện như một Google account để share file trực tiếp trong Google Drive.
- Nếu demo dùng video/folder test trên Google Drive, cách ổn định nhất là bật link sharing:

  ```text
  General access -> Anyone with the link -> Viewer
  ```

- Nếu không muốn bật **Anyone with the link**, hãy tạo một Google account test thật, share file/folder cho account đó, rồi cung cấp credentials test theo yêu cầu của reviewer.
- Nếu bạn đang giới hạn domain/user ở tầng app hoặc OAuth testing mode, hãy thêm `gwm-testuser@marketplacetest.net` vào allowlist đó trước khi trả lời.

Mẫu email trả lời:

```text
Hi GWM Reviews Team,

Thank you for starting the review for Nimbus Player.

Demo video:
{PASTE_UNLISTED_YOUTUBE_LINK_HERE}

Nimbus Player does not require a separate username, password, or API token. Reviewers can sign in with Google OAuth. The app uses Google Drive access only to list video files, read file metadata, stream selected videos in the browser, and build folder playlists.

For testing, I have prepared a sample Google Drive video/folder with "Anyone with the link" Viewer access:
{PASTE_SHARED_DRIVE_FILE_OR_FOLDER_LINK_HERE}

Suggested test flow:
1. Open https://nimbus-player.vercel.app
2. Sign in with Google.
3. Paste the shared Drive video URL or folder URL.
4. Open the video in Nimbus Player.
5. Optionally test Google Drive -> Open with -> Nimbus Player.

Nimbus Player does not upload, modify, delete, share, or store users' Google Drive files on another service.

Thanks,
{YOUR_NAME}
```

### Bước 4.8: Vì sao search Marketplace chưa thấy app?

Nimbus Player sẽ chưa xuất hiện trong kết quả tìm kiếm nếu rơi vào một trong các trạng thái sau:

- Store Listing vẫn là **Draft** hoặc **Unpublished**.
- Public listing đang **Under review**.
- Listing bị reject và cần sửa.
- App visibility không phải **Public**.
- Listing chọn **Unlisted**, khi đó chỉ mở được bằng direct URL và không xuất hiện trong search.
- Installation settings là **Admin install only**, user thường có thể không thấy như mong đợi.
- Distribution không bao gồm region của người đang search.
- Google cần thêm thời gian index sau khi listing được approve.

---

## 5. Cấu hình OAuth Branding Verification

Khi chuyển OAuth consent screen sang trạng thái publish/production, Google có thể yêu cầu xác minh branding. Nếu gặp lỗi:

```text
The website of your home page URL "https://nimbus-player.vercel.app" is not registered to you.
```

nghĩa là Google chưa thấy tài khoản **Owner/Editor** của Google Cloud Project là chủ sở hữu homepage domain trong Google Search Console.

### Bước 5.1: Cấu hình URL trên OAuth Branding

Trong **Google Cloud Console -> APIs & Services -> OAuth consent screen / Branding**, cấu hình:

```text
App name:
Nimbus Player

Home page URL:
https://nimbus-player.vercel.app

Privacy policy URL:
https://nimbus-player.vercel.app/privacy.html
```

Homepage phải công khai, hiển thị đúng tên **Nimbus Player**, giải thích mục đích app, và có link tới Privacy Policy.

### Bước 5.2: Xác minh ownership trong Google Search Console

1. Mở [Google Search Console](https://search.google.com/search-console).
2. Dùng chính tài khoản Google đang là **Owner** hoặc **Editor** của Google Cloud Project.
3. Thêm property cho homepage:

   ```text
   https://nimbus-player.vercel.app/
   ```

4. Chọn phương thức xác minh mà bạn thực hiện được. Với domain do Vercel cấp (`*.vercel.app`), nên thử **URL-prefix property** trước.
5. Sau khi Search Console báo verified, quay lại Google Cloud Branding và bấm **I have fixed the issues** để yêu cầu review lại.

> ⚠️ **Lưu ý quan trọng**: Nếu Google không chấp nhận ownership của `nimbus-player.vercel.app`, cách chắc chắn hơn là dùng custom domain riêng, ví dụ `player.yourdomain.com`. Sau đó verify domain đó bằng DNS TXT trong Search Console, đổi Home page URL và Privacy policy URL sang domain riêng, rồi submit lại.

---

## 6. Cấu hình Data Access Verification

Nếu Google Cloud hiển thị lỗi:

```text
Missing the following fields for one or more requested scopes: scope justification, demo video.
```

nghĩa là bạn đang xin scope nhạy cảm hoặc restricted scope nhưng chưa giải thích cách sử dụng scope và chưa cung cấp video demo. Với Nimbus Player, scope cần giải thích kỹ nhất là:

```text
https://www.googleapis.com/auth/drive.readonly
```

### Bước 6.1: Chọn feature đúng với app

Trong phần **What features will you use?**, chọn nhóm gần nhất với sản phẩm:

```text
Drive productivity
```

Không nên chọn **Drive backup** hoặc **Drive sync client** nếu app không backup/sync dữ liệu Drive. Chọn sai feature dễ khiến reviewer hiểu sai mục đích app.

### Bước 6.2: Scope justification cho `drive.readonly`

Trong ô **How will the scopes be used?**, có thể dùng nội dung sau:

```text
Nimbus Player uses the Google Drive readonly scope to let users browse, search, and open video files stored in their own Google Drive. The app reads file metadata such as file name, MIME type, size, thumbnail, video duration, and parent folder so it can display a video library, build a folder playlist, and open the selected video in the player. The app also reads the selected video file content only for browser-based playback through the user's active session.

The app does not modify, delete, upload, share, or transfer Google Drive files to another storage service. A more limited scope is not sufficient for the current Drive browser and folder playlist features because the app needs to list the user's Drive video files and videos inside selected Drive folders.
```

Nếu muốn viết hoàn toàn bằng tiếng Việt:

```text
Nimbus Player sử dụng Google Drive readonly scope để người dùng duyệt, tìm kiếm và mở các file video được lưu trong Google Drive của chính họ. Ứng dụng đọc metadata của file như tên file, MIME type, dung lượng, thumbnail, thời lượng video và thư mục cha để hiển thị thư viện video, tạo playlist theo thư mục và mở video được chọn trong trình phát.

Ứng dụng không chỉnh sửa, xóa, upload, chia sẻ hoặc chuyển file Google Drive sang dịch vụ lưu trữ khác. Scope hẹp hơn chưa đủ cho các tính năng Drive browser và folder playlist hiện tại vì ứng dụng cần liệt kê video trong Drive của người dùng và video bên trong các thư mục Drive được chọn.
```

### Bước 6.3: Demo video

Google yêu cầu video thể hiện rõ OAuth flow và cách app dùng dữ liệu từ từng scope. Video nên để **Unlisted** trên YouTube rồi dán link vào ô **YouTube link**.

Checklist nội dung video:

1. Mở homepage Nimbus Player, cho thấy app name, mục đích app và link Privacy Policy.
2. Bấm **Đăng nhập Google**.
3. Hiển thị OAuth consent screen có các scope đang xin, đặc biệt là `drive.readonly` và `drive.install`.
4. Sau khi đăng nhập, mở Drive browser trong app.
5. Tìm hoặc duyệt danh sách video từ Google Drive.
6. Mở một video và cho thấy app phát video trong player.
7. Nếu dùng folder playlist, mở một Drive folder và cho thấy app liệt kê video trong thư mục.
8. Nếu dùng Open with, mở Google Drive, chọn một file video, chọn **Open with -> Nimbus Player**, rồi cho thấy video được mở trong app.
9. Nói hoặc ghi chú rõ rằng app chỉ đọc metadata/file content để phát video, không chỉnh sửa hoặc upload dữ liệu Drive.

### Bước 6.4: Additional info

Trong ô **Additional info**, có thể điền:

```text
Nimbus Player is a browser-based video player for files stored in the user's own Google Drive. The app uses Drive readonly access only to list video files, read metadata, stream selected videos, and build playlists from selected Drive folders. The app does not upload, modify, delete, share, or store users' Google Drive files on another service.

The production homepage is https://nimbus-player.vercel.app and the privacy policy is https://nimbus-player.vercel.app/privacy.html.
```

### Bước 6.5: Có thể tránh restricted scope không?

Google khuyến nghị dùng scope hẹp nhất có thể. Nếu bạn muốn tránh `drive.readonly`, hướng thay thế là chuyển app sang:

```text
https://www.googleapis.com/auth/drive.file
https://www.googleapis.com/auth/drive.install
```

Tuy nhiên, với scope `drive.file`, app chỉ truy cập được các file người dùng chọn/mở bằng app hoặc qua Google Picker. Các tính năng như **tự liệt kê video gần đây**, **search toàn Drive**, hoặc **duyệt video trong folder bằng folder ID** sẽ cần thiết kế lại và có thể không hoạt động như hiện tại.

---

## 7. Cấu hình Google Analytics (Tuỳ chọn)

Google Analytics không bắt buộc cho Google Drive Open with, OAuth verification hoặc Marketplace listing. Chỉ cấu hình nếu bạn muốn đo lường lượt truy cập/trải nghiệm sử dụng app.

> ⚠️ Nếu bật Google Analytics, hãy cập nhật Privacy Policy để nói rõ app có thu thập dữ liệu phân tích sử dụng. Hiện project đã dùng Vercel Analytics/Speed Insights trong production, nên không nên bật thêm GA4 nếu bạn không thật sự cần hai hệ thống analytics cùng lúc.

### Bước 7.1: Tạo tài khoản và property GA4

1. Truy cập [Google Analytics](https://analytics.google.com).
2. Tạo **Account** nếu chưa có.
3. Tạo **Property** mới cho Nimbus Player.
4. Chọn múi giờ báo cáo và đơn vị tiền tệ phù hợp.

### Bước 7.2: Thêm Web data stream

Trong property GA4:

1. Vào **Admin -> Data streams**.
2. Chọn **Web**.
3. Nhập URL website:

   ```text
   https://nimbus-player.vercel.app
   ```

4. Đặt stream name, ví dụ:

   ```text
   Nimbus Player Web
   ```

5. Tạo stream và sao chép **Measurement ID** dạng:

   ```text
   G-XXXXXXXXXX
   ```

### Bước 7.3: Gắn Google tag nếu quyết định dùng GA4

Google hướng dẫn có thể dán Google tag trực tiếp vào HTML, ngay sau thẻ `<head>`. Với project này, chỉ nên gắn tag sau khi bạn đã quyết định dùng GA4 thật sự và đã cập nhật Privacy Policy.

Ví dụ Google tag sẽ có dạng:

```html
<!-- Google tag (gtag.js) -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-XXXXXXXXXX"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'G-XXXXXXXXXX');
</script>
```

Sau khi gắn tag và deploy, dữ liệu có thể mất tối đa khoảng 30 phút để bắt đầu xuất hiện trong báo cáo realtime.

---

## 8. Quá trình kiểm tra (Testing)

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

## 9. Xử lý sự cố (Troubleshooting)

- **Không thấy app trong menu Open With**: Kiểm tra `VITE_GOOGLE_OAUTH_SCOPES` đã có `https://www.googleapis.com/auth/drive.install`, deploy lại, gỡ quyền OAuth cũ của app trong Google Account, rồi đăng nhập lại.
- **Đã có `drive.install` nhưng vẫn không thấy**: Đảm bảo file bạn đang chọn đúng MIME type hoặc phần mở rộng đã đăng ký ở Bước 2.5. Tránh dùng `video/*`; hãy dùng MIME type cụ thể như `video/mp4`.
- **Branding báo homepage chưa registered to you**: Verify homepage trong Google Search Console bằng tài khoản Owner/Editor của Google Cloud Project. Nếu dùng `*.vercel.app` không qua được, chuyển sang custom domain riêng và verify bằng DNS TXT.
- **Data Access báo thiếu scope justification hoặc demo video**: Điền justification cho `drive.readonly` và cung cấp YouTube demo video theo Bước 6.
- **Không tìm thấy app trên Google Workspace Marketplace**: Kiểm tra Store Listing đã submit và được approve, App visibility là Public, listing không phải Unlisted, Distribution gồm region của bạn, và Installation settings không phải Admin install only nếu bạn muốn user cá nhân cài.
- **Google Analytics không có dữ liệu**: Kiểm tra đã tạo Web data stream, dùng đúng Measurement ID, đã deploy Google tag lên production, và chờ tối đa khoảng 30 phút để dữ liệu realtime xuất hiện.
- **App chỉ hiện với tài khoản của bạn, không hiện với người khác**: Nếu app chưa publish/install qua Google Workspace Marketplace hoặc người dùng không nằm trong danh sách test users của OAuth consent screen, người khác có thể chưa cài được app.
- **Dùng tài khoản Google Workspace công ty/trường học**: Admin có thể chặn third-party Drive apps hoặc OAuth app chưa được trust. Cần kiểm tra chính sách trong Google Admin Console.
- **Mở app nhưng báo lỗi không tải được video**: Kiểm tra lại xem ứng dụng đã được cấu hình biến môi trường OAuth đúng trên môi trường deploy chưa (đặc biệt là URI Redirect của Google Client ID có khớp với domain deploy không).

## 10. Tham khảo

- <https://developers.google.com/workspace/drive/api/guides/enable-sdk?hl=vi>
- <https://developers.google.com/workspace/marketplace/enable-configure-sdk?hl=vi>
- <https://developers.google.com/workspace/marketplace/create-listing>
- <https://support.google.com/analytics/answer/9304153?hl=vi>
- <https://developers.google.com/drive/api/guides/api-specific-auth>
- <https://support.google.com/cloud/answer/13461325>
- <https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification>
- <https://support.google.com/cloud/answer/13464321>
- <https://support.google.com/cloud/answer/15549049>
- <https://support.google.com/webmasters/answer/9008080>
