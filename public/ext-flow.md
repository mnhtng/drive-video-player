# Chrome Extension Flow - Nimbus Player

Tài liệu này giải thích chi tiết cách extension trong thư mục `extension/` hoạt động. Nội dung viết cho người chưa từng làm Chrome Extension, nên sẽ đi từ khái niệm cơ bản đến flow cụ thể trong code.

Extension này có một mục tiêu chính:

> Khi người dùng đang ở Google Drive, extension tìm file video Drive hiện tại hoặc file đang được chọn, rồi mở file đó trong Nimbus Player bằng URL `/play?id=...`.

Ví dụ:

```text
https://drive.google.com/file/d/DRIVE_FILE_ID/view
```

sẽ được mở thành:

```text
https://nimbus-player.vercel.app/play?id=DRIVE_FILE_ID
```

Nếu link Drive có `resourcekey`, extension cũng chuyển tiếp:

```text
https://nimbus-player.vercel.app/play?id=DRIVE_FILE_ID&resourcekey=RESOURCE_KEY
```

---

## 1. Cần hiểu gì trước khi đọc code?

Chrome Extension không chạy giống một web app bình thường. Nó có nhiều phần chạy ở nhiều môi trường khác nhau.

Trong extension này có 3 môi trường quan trọng:

| Môi trường | File chính | Chạy ở đâu? | Làm được gì? |
| --- | --- | --- | --- |
| Content script | `content-script.js` | Bên trong trang `drive.google.com` | Đọc DOM của Google Drive, inject nút nổi |
| Background service worker | `background.js` | Môi trường extension của Chrome | Mở tab mới, tạo context menu, đọc URL player |
| Popup | `popup.html`, `popup.js`, `popup.css` | Popup khi bấm icon extension | Hiển thị UI nhỏ để mở file hiện tại hoặc cấu hình URL player |

Ngoài ra có:

| File | Vai trò |
| --- | --- |
| `manifest.json` | File khai báo extension cho Chrome |
| `drive-reference.js` | Helper dùng chung để parse Drive URL/file ID và build URL player |
| `icons/*.png` | Icon extension |
| `README.md` | Hướng dẫn cài và dùng extension |
| `FLOW.md` | Tài liệu bạn đang đọc |

Điều quan trọng:

- `content-script.js` nhìn thấy trang Google Drive.
- `background.js` không nhìn thấy DOM Google Drive trực tiếp.
- `popup.js` chỉ chạy khi popup đang mở.
- Các phần này nói chuyện với nhau bằng `chrome.runtime.sendMessage()` và `chrome.tabs.sendMessage()`.

---

## 2. Sơ đồ tổng thể

```text
Google Drive tab
  |
  | Chrome injects
  v
drive-reference.js
content-script.js
  |
  | Detect Drive file/video
  | Inject floating button
  |
  | User clicks "Mở trong Nimbus Player"
  v
chrome.runtime.sendMessage({
  type: "OPEN_IN_NIMBUS_PLAYER",
  fileId,
  resourceKey
})
  |
  v
background.js
  |
  | Read playerBaseUrl from chrome.storage.sync
  | Build /play?id=...
  v
chrome.tabs.create({ url })
  |
  v
Nimbus Player tab opens
```

Popup flow:

```text
User clicks extension icon
  |
  v
popup.html + popup.js
  |
  | Query active tab
  | Ask content-script.js: GET_CURRENT_DRIVE_FILE
  v
content-script.js replies with fileId
  |
  v
popup.js sends OPEN_IN_NIMBUS_PLAYER to background.js
  |
  v
background.js opens Nimbus Player tab
```

Context menu flow:

```text
User right-clicks on Drive page/link
  |
  v
background.js contextMenus.onClicked
  |
  | Parse link/page URL
  | If needed, ask content-script.js
  v
background.js opens Nimbus Player tab
```

---

## 3. `manifest.json` - Chrome đọc file này đầu tiên

File: `extension/manifest.json`

`manifest.json` giống như `package.json` của extension, nhưng dành cho Chrome. Chrome đọc file này để biết:

- Extension tên gì.
- Extension dùng quyền gì.
- Popup nằm ở file nào.
- Background service worker nằm ở file nào.
- Content script sẽ được inject vào trang nào.

### 3.1. Thông tin cơ bản

```json
{
  "manifest_version": 3,
  "name": "Nimbus Player for Google Drive",
  "description": "Mở video Google Drive trực tiếp trong Nimbus Player.",
  "version": "0.1.0"
}
```

Ý nghĩa:

- `manifest_version: 3`: dùng chuẩn Manifest V3.
- `name`: tên hiển thị của extension.
- `description`: mô tả hiển thị trong Chrome extension manager / Chrome Web Store.
- `version`: version của extension.

### 3.2. `action` - popup khi bấm icon extension

```json
"action": {
  "default_title": "Nimbus Player",
  "default_popup": "popup.html",
  "default_icon": {
    "16": "icons/16.png",
    "32": "icons/32.png",
    "48": "icons/48.png",
    "128": "icons/128.png"
  }
}
```

Ý nghĩa:

- Khi người dùng bấm icon extension trên Chrome toolbar, Chrome mở `popup.html`.
- `default_title` là tooltip khi hover icon extension.
- `default_icon` là icon dùng cho toolbar.

### 3.3. `icons` - icon extension

```json
"icons": {
  "16": "icons/16.png",
  "32": "icons/32.png",
  "48": "icons/48.png",
  "128": "icons/128.png"
}
```

Chrome dùng các icon này ở nhiều nơi:

- Trang `chrome://extensions`.
- Toolbar.
- Dialog permission.
- Chrome Web Store nếu publish.

Kích thước đúng rất quan trọng. Vì vậy repo có script `pnpm extension:check` để kiểm tra file icon đúng size.

### 3.4. `permissions` - quyền extension xin từ Chrome

```json
"permissions": [
  "activeTab",
  "contextMenus",
  "storage"
]
```

Ý nghĩa từng quyền:

- `activeTab`: cho phép popup thao tác với tab hiện tại sau khi user bấm extension.
- `contextMenus`: cho phép tạo menu chuột phải.
- `storage`: cho phép dùng `chrome.storage.sync` để lưu cấu hình.

Extension này không xin quyền rộng như `<all_urls>`, vì chỉ cần làm việc với Google Drive.

Lưu ý thực tế: quyền `contextMenus` chỉ thêm item vào menu chuột phải native của Chrome. Google Drive thường tự chặn right-click và hiển thị menu riêng của Drive, nên khi bấm chuột phải trực tiếp trên file card bạn thường sẽ thấy menu của Drive, không phải menu của extension. Vì vậy luồng chính vẫn là nút nổi và popup.

### 3.5. `host_permissions` - extension được chạy trên host nào

```json
"host_permissions": [
  "https://drive.google.com/*"
]
```

Ý nghĩa:

- Extension chỉ có quyền với URL thuộc `https://drive.google.com/*`.
- Content script sẽ không chạy trên website khác.

Đây là giới hạn tốt về bảo mật.

### 3.6. `background`

```json
"background": {
  "service_worker": "background.js"
}
```

Chrome sẽ dùng `background.js` làm service worker của extension.

Service worker không có UI. Nó chạy khi có event, ví dụ:

- Extension vừa cài.
- User click context menu.
- Content script gửi message.
- Popup gửi message.

Chrome có thể tắt service worker khi idle, nên `background.js` không nên giữ state quan trọng trong biến memory lâu dài. Config quan trọng được lưu trong `chrome.storage.sync`.

### 3.7. `content_scripts`

```json
"content_scripts": [
  {
    "matches": [
      "https://drive.google.com/*"
    ],
    "js": [
      "drive-reference.js",
      "content-script.js"
    ],
    "run_at": "document_idle"
  }
]
```

Ý nghĩa:

- Khi tab có URL khớp `https://drive.google.com/*`, Chrome inject các file JS này vào trang.
- `drive-reference.js` chạy trước.
- `content-script.js` chạy sau.
- `run_at: document_idle` nghĩa là chạy sau khi trang đã load tương đối xong.

Thứ tự rất quan trọng:

```text
drive-reference.js -> tạo globalThis.NimbusDrive
content-script.js  -> dùng globalThis.NimbusDrive
```

Nếu đổi thứ tự, `content-script.js` sẽ lỗi vì không tìm thấy `globalThis.NimbusDrive`.

---

## 4. `drive-reference.js` - helper dùng chung

File: `extension/drive-reference.js`

File này không tự mở tab, không tự inject UI. Nó chỉ chứa logic helper dùng chung ở nhiều nơi:

- Content script cần parse URL và build fallback URL.
- Background cần parse reference và build URL player.
- Popup cần parse active tab URL và validate player URL.

Cuối file có đoạn:

```js
globalThis.NimbusDrive = Object.freeze({
  DEFAULT_PLAYER_BASE_URL,
  DRIVE_FILE_ID_PATTERN,
  buildPlayerUrl,
  hasVideoExtension,
  isDriveHost,
  normalizePlayerBaseUrl,
  parseDriveReference,
});
```

Đây là cách file chia sẻ helper cho các file khác trong extension.

### 4.1. Vì sao không dùng `import/export`?

Trong extension Manifest V3, background có thể dùng module nếu khai báo `"type": "module"`, nhưng content script và popup trong setup này đang dùng script thường. Để đơn giản và thống nhất, helper được gắn vào `globalThis.NimbusDrive`.

Cách này giúp:

- `background.js` dùng được qua `importScripts('drive-reference.js')`.
- `popup.html` load được bằng `<script src="drive-reference.js">`.
- `content-script.js` dùng được vì manifest inject file helper trước.

### 4.2. `DEFAULT_PLAYER_BASE_URL`

```js
const DEFAULT_PLAYER_BASE_URL = 'https://nimbus-player.vercel.app';
```

Đây là URL app Nimbus Player mặc định. Nếu user không đổi trong popup, extension mở video bằng domain này.

### 4.3. `DRIVE_FILE_ID_PATTERN`

```js
const DRIVE_FILE_ID_PATTERN = /^[a-zA-Z0-9_-]{20,}$/;
```

Google Drive file ID thường là chuỗi dài gồm:

- chữ cái
- số
- `_`
- `-`

Regex này kiểm tra một chuỗi có giống file ID không.

Ví dụ hợp lệ:

```text
1abcDEFghiJKLmnopQRSTuvwxYZ
```

Ví dụ không hợp lệ:

```text
abc
https://example.com
file.mp4
```

### 4.4. `VIDEO_EXTENSION_PATTERN`

```js
const VIDEO_EXTENSION_PATTERN = /\.(3g2|3gp|avi|flv|m2ts|m4v|mkv|mov|mp4|mpeg|mpg|mts|ogv|ts|webm|wmv)(?:$|[\s?#):;,])/i;
```

Regex này dùng để đoán tên file có phải video không.

Ví dụ match:

```text
movie.mp4
episode-01.mkv
clip.webm
video.mov?download=1
```

Không match:

```text
document.pdf
image.png
notes.txt
```

### 4.5. `isDriveHost(hostname)`

```js
function isDriveHost(hostname) {
  return hostname === 'drive.google.com' || hostname.endsWith('.drive.google.com');
}
```

Hàm này kiểm tra host có phải Google Drive không.

Ví dụ:

```text
drive.google.com -> true
abc.drive.google.com -> true
docs.google.com -> false
example.com -> false
```

Trong thực tế manifest đã giới hạn host rồi, nhưng check thêm trong code giúp an toàn hơn.

### 4.6. `parseDriveReference(input)`

Đây là hàm quan trọng nhất trong helper.

Nó nhận input có thể là:

```text
DRIVE_FILE_ID
https://drive.google.com/file/d/DRIVE_FILE_ID/view
https://drive.google.com/open?id=DRIVE_FILE_ID
https://drive.google.com/uc?id=DRIVE_FILE_ID
```

và trả về:

```js
{
  fileId: 'DRIVE_FILE_ID',
  resourceKey: 'RESOURCE_KEY_OPTIONAL'
}
```

Các bước xử lý:

1. Nếu input rỗng hoặc không phải string thì trả `null`.
2. Trim input.
3. Nếu input đã là raw file ID thì trả luôn `{ fileId }`.
4. Thử parse bằng `new URL(...)`.
5. Nếu path có dạng `/file/d/{id}` hoặc `/d/{id}` thì lấy ID.
6. Nếu URL có query `?id={id}` thì lấy ID.
7. Nếu parse URL thất bại, fallback bằng regex trên text.

Tại sao cần nhiều cách như vậy?

Vì Google Drive có nhiều dạng link khác nhau, và DOM của Drive đôi khi chỉ chứa một phần URL.

### 4.7. `resourceKey`

Một số link Drive có dạng:

```text
https://drive.google.com/file/d/FILE_ID/view?resourcekey=RESOURCE_KEY
```

`resourcekey` giúp Google Drive xác định quyền truy cập với một số file share link. Nếu bỏ mất `resourcekey`, app player có thể không đọc được file dù `fileId` đúng.

Vì vậy extension giữ lại `resourceKey` và truyền sang URL player.

### 4.8. `normalizePlayerBaseUrl(input)`

Hàm này chuẩn hóa URL player user nhập trong popup.

Ví dụ input:

```text
https://nimbus-player.vercel.app/
```

được chuẩn hóa thành:

```text
https://nimbus-player.vercel.app
```

Nó cũng xóa:

- query string
- hash
- dấu `/` cuối URL

Vì sao cần chuẩn hóa?

Để khi build URL không bị lỗi kiểu:

```text
https://nimbus-player.vercel.app//play?id=...
```

hoặc:

```text
https://nimbus-player.vercel.app?x=1/play?id=...
```

### 4.9. `buildPlayerUrl(baseUrl, fileId, resourceKey)`

Hàm này tạo URL cuối cùng để mở app:

```js
function buildPlayerUrl(baseUrl, fileId, resourceKey) {
  const url = new URL('play', `${normalizePlayerBaseUrl(baseUrl)}/`);
  url.searchParams.set('id', fileId);
  if (resourceKey) url.searchParams.set('resourcekey', resourceKey);
  return url.toString();
}
```

Ví dụ:

```js
buildPlayerUrl(
  'https://nimbus-player.vercel.app',
  'abc123',
  'rk456'
)
```

Kết quả:

```text
https://nimbus-player.vercel.app/play?id=abc123&resourcekey=rk456
```

---

## 5. `content-script.js` - code chạy trong Google Drive

File: `extension/content-script.js`

Đây là phần “nhìn thấy Google Drive”. Nó chạy trong context của trang Drive nên có thể:

- đọc `window.location.href`
- đọc `document.title`
- query DOM bằng `document.querySelector`
- tạo element mới để inject nút nổi

Nhưng nó không nên tự chứa tất cả logic mở tab hoặc URL player. Những việc cấp extension được chuyển sang `background.js`.

### 5.1. Chống chạy trùng

Đầu file:

```js
if (globalThis.__nimbusPlayerContentLoaded) return;
globalThis.__nimbusPlayerContentLoaded = true;
```

Google Drive là SPA. Trang có thể thay đổi nội dung mà không reload thật. Ngoài ra trong quá trình phát triển, extension reload có thể khiến script bị inject nhiều lần.

Nếu không chặn, có thể xảy ra:

- nhiều nút nổi bị tạo trùng
- nhiều `MutationObserver` chạy cùng lúc
- click một lần nhưng gửi nhiều message

Biến `__nimbusPlayerContentLoaded` đánh dấu content script đã chạy rồi.

### 5.2. Lấy helper từ `globalThis.NimbusDrive`

```js
const {
  DEFAULT_PLAYER_BASE_URL,
  DRIVE_FILE_ID_PATTERN,
  buildPlayerUrl,
  hasVideoExtension,
  isDriveHost,
  parseDriveReference,
} = globalThis.NimbusDrive;
```

Đây là các helper từ `drive-reference.js`.

Content script cần:

- `parseDriveReference`: parse URL/link thành file ID.
- `hasVideoExtension`: đoán video qua tên file.
- `buildPlayerUrl`: fallback khi background không phản hồi.
- `DEFAULT_PLAYER_BASE_URL`: URL mặc định.
- `isDriveHost`: check domain.

### 5.3. Chỉ chạy trên Drive

```js
if (!isDriveHost(window.location.hostname)) return;
```

Manifest đã giới hạn, nhưng check thêm giúp code an toàn nếu sau này match pattern rộng hơn.

### 5.4. Các selector dùng để tìm file đang được chọn

```js
const SELECTED_ITEM_SELECTOR = [
  '[aria-selected="true"]',
  '[aria-checked="true"]',
  '[role="row"][aria-selected="true"]',
  '[role="gridcell"][aria-selected="true"]',
  '[role="option"][aria-selected="true"]',
  '[data-is-selected="true"]',
].join(',');
```

Google Drive không cung cấp DOM API chính thức cho extension kiểu này. Vì vậy extension phải dò theo DOM thực tế.

Các attribute như `aria-selected`, `aria-checked` thường được web app dùng để biểu thị item đang được chọn.

Nói đơn giản:

> Nếu người dùng đang chọn một file trong Drive, extension cố tìm element nào trong DOM đang có trạng thái selected.

### 5.5. Các attribute có thể chứa file ID

```js
const REFERENCE_ATTRIBUTE_NAMES = [
  'data-id',
  'data-docid',
  'data-file-id',
  'data-item-id',
  'data-resource-id',
  'data-target-id',
];
```

Một số element trong Google Drive có thể chứa ID trong các `data-*` attribute. Extension thử nhiều tên attribute để tăng khả năng detect.

### 5.6. Các attribute có thể chứa tên file

```js
const LABEL_ATTRIBUTE_NAMES = [
  'aria-label',
  'data-tooltip',
  'data-tooltip-unhoverable',
  'title',
  'alt',
];
```

Tên file có thể nằm trong:

- tooltip
- title
- accessibility label
- text content

Extension cần tên file để:

- hiển thị dưới nút nổi
- đoán đuôi file có phải video không

### 5.7. `ensureUi()` - tạo nút nổi

`ensureUi()` chịu trách nhiệm tạo UI extension trong trang Drive.

Nó tạo root element:

```js
rootHost = document.createElement('div');
rootHost.id = ROOT_ID;
document.documentElement.append(rootHost);
```

Sau đó attach Shadow DOM:

```js
const shadow = rootHost.shadowRoot || rootHost.attachShadow({ mode: 'open' });
```

Vì sao dùng Shadow DOM?

Google Drive có rất nhiều CSS. Nếu extension inject button bình thường, CSS của Drive có thể làm:

- sai màu
- sai font
- sai layout
- button bị ẩn hoặc méo

Shadow DOM giúp style của extension được cô lập.

Trong Shadow DOM, code thêm:

- `<style>` chứa CSS nút nổi
- `<button>` là nút **Mở video này**
- icon play bằng inline SVG
- text tên file

### 5.8. `getCandidateLabel(element)` - lấy tên file

Hàm này cố lấy label từ nhiều nguồn:

1. Check `aria-label`, `title`, `data-tooltip`, `alt`.
2. Nếu có `aria-labelledby`, tìm element tương ứng và lấy text.
3. Nếu không có, lấy `textContent` của element.

Tại sao phải phức tạp?

Vì DOM của Google Drive có thể thay đổi tùy view:

- list view
- grid view
- preview view
- search result
- shared drive

Không thể chỉ dựa vào một selector duy nhất.

### 5.9. `isVisible(element)` - chỉ xử lý element đang hiển thị

```js
const style = window.getComputedStyle(element);
if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
```

Google Drive có thể giữ nhiều element ẩn trong DOM. Nếu không check visible, extension có thể lấy nhầm file cũ hoặc item ẩn.

### 5.10. `referenceFromAttributes(element)`

Hàm này tìm file ID trong attribute:

```js
for (const attributeName of REFERENCE_ATTRIBUTE_NAMES) {
  const value = element.getAttribute?.(attributeName);
  if (value && DRIVE_FILE_ID_PATTERN.test(value)) {
    return { fileId: value };
  }
}
```

Nếu tìm thấy attribute có dạng Drive file ID, trả về `{ fileId }`.

### 5.11. `referenceFromElement(element)`

Đây là hàm tìm file ID từ một element.

Thứ tự tìm:

1. Nếu chính element là `<a>`, parse `href`.
2. Nếu element có attribute chứa ID, lấy ID.
3. Nếu element con có link, parse link.
4. Nếu element con có attribute chứa ID, lấy ID.

Pseudo-flow:

```text
element
  |
  | is anchor?
  v
parse href
  |
  | has data-id/data-docid?
  v
return fileId
  |
  | find child anchors
  v
parse child href
  |
  | find child data attributes
  v
return fileId
```

### 5.12. `enrichReference(reference, sourceElement, source)`

Hàm này nhận reference thô:

```js
{ fileId, resourceKey }
```

và bổ sung:

```js
{
  fileId,
  resourceKey,
  name,
  source,
  isLikelyVideo
}
```

Trong đó:

- `name`: tên file lấy từ DOM hoặc document title.
- `source`: nguồn phát hiện, ví dụ `location` hoặc `selection`.
- `isLikelyVideo`: có vẻ là video hay không.

Logic đoán video:

```js
const isLikelyVideo = hasVideoExtension(name)
  || hasVideoExtension(document.title)
  || Boolean(document.querySelector('video'));
```

Nghĩa là file được xem là video nếu:

- tên có `.mp4`, `.mkv`, `.webm`, ...
- title trang có đuôi video
- trang hiện có thẻ `<video>`

### 5.13. `findLocationReference()`

Hàm này parse URL hiện tại:

```js
const reference = parseDriveReference(window.location.href);
```

Trường hợp dùng:

```text
https://drive.google.com/file/d/FILE_ID/view
```

Khi user đang mở preview file, URL thường chứa file ID. Đây là cách detect đáng tin cậy nhất.

### 5.14. `findSelectedReference()`

Hàm này tìm file đang được chọn trong Drive folder/list/grid.

Flow:

1. Query tất cả element có trạng thái selected.
2. Lọc element đang visible.
3. Lấy tối đa 12 element đầu để tránh scan quá nhiều.
4. Với mỗi element, tìm root gần nhất như row/gridcell/option.
5. Gọi `referenceFromElement()`.
6. Nếu tìm thấy file ID, enrich và return.

Trường hợp dùng:

- User đang ở folder Drive.
- User click chọn một video nhưng chưa mở preview.
- Popup hoặc context menu cần biết file đang chọn là gì.

### 5.15. `findCurrentReference()`

Đây là hàm quyết định reference hiện tại.

Logic:

1. Thử lấy từ URL hiện tại.
2. Nếu URL reference là video, return luôn.
3. Thử lấy từ selected item.
4. Nếu selected reference là video, return luôn.
5. Nếu chưa chắc video, vẫn return location hoặc selected reference.

Vì sao vẫn return file chưa chắc video?

Vì popup có thể hiển thị "Đã phát hiện một file Drive" và cho user quyết định. Còn nút nổi trên trang chỉ hiện khi `isLikelyVideo` là true.

### 5.16. `render(reference)`

Hàm này cập nhật UI nút nổi.

```js
const shouldShow = Boolean(reference?.fileId && reference.isLikelyVideo);
rootHost.style.display = shouldShow ? '' : 'none';
```

Nút nổi chỉ hiện nếu:

- có `fileId`
- và file có vẻ là video

Nếu hiện nút, nó update:

- `fileLabel.textContent`
- `button.title`
- `button.disabled = false`

### 5.17. `scan()` và `scheduleScan()`

`scan()` đơn giản là:

```js
render(findCurrentReference());
```

`scheduleScan()` dùng timeout để throttle:

```js
if (scanTimer) return;
scanTimer = window.setTimeout(() => {
  scanTimer = 0;
  scan();
}, delay);
```

Tại sao cần throttle?

Google Drive thay đổi DOM rất nhiều. Nếu mỗi mutation đều scan ngay, có thể gây tốn CPU. `scheduleScan()` gom nhiều thay đổi gần nhau thành một lần scan.

### 5.18. `openCurrentReference()`

Khi user bấm nút nổi, hàm này chạy.

Nó gửi message sang background:

```js
chrome.runtime.sendMessage({
  type: 'OPEN_IN_NIMBUS_PLAYER',
  fileId: currentReference.fileId,
  resourceKey: currentReference.resourceKey,
}, callback);
```

Nếu background phản hồi lỗi hoặc không phản hồi, content script fallback:

```js
openWithStoredPlayerUrl(currentReference);
```

Fallback này tự đọc `chrome.storage.sync`, build URL và `window.open`.

### 5.19. Listener `GET_CURRENT_DRIVE_FILE`

Content script lắng nghe:

```js
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== 'GET_CURRENT_DRIVE_FILE') return false;
  scan();
  sendResponse({ reference: ... });
  return false;
});
```

Popup/background dùng message này để hỏi:

> Tab Drive hiện tại đang detect được file nào?

Content script trả về:

```js
{
  reference: {
    fileId,
    resourceKey,
    name,
    isLikelyVideo
  }
}
```

### 5.20. Theo dõi DOM và URL thay đổi

Google Drive là SPA nên cần theo dõi:

```js
const observer = new MutationObserver(() => scheduleScan());
```

Observer xem DOM thay đổi:

```js
observer.observe(document.documentElement, {
  attributes: true,
  attributeFilter: ['aria-selected', 'aria-checked', 'data-is-selected', 'title', 'aria-label'],
  childList: true,
  subtree: true,
});
```

Ngoài DOM, Drive còn đổi URL bằng History API. Vì vậy có interval:

```js
window.setInterval(() => {
  if (lastLocationHref === window.location.href) return;
  lastLocationHref = window.location.href;
  scheduleScan(0);
}, 750);
```

---

## 6. `background.js` - nơi xử lý quyền extension

File: `extension/background.js`

Background là service worker của extension. Nó không nằm trong trang Google Drive, nên không query DOM Drive trực tiếp. Nhưng nó có các quyền Chrome API quan trọng:

- `chrome.tabs.create`
- `chrome.contextMenus`
- `chrome.storage.sync`
- `chrome.runtime.onMessage`

### 6.1. Import helper

```js
importScripts('drive-reference.js');
```

Background cần parse Drive URL và build URL player, nên import helper.

Sau đó lấy helper:

```js
const {
  DEFAULT_PLAYER_BASE_URL,
  DRIVE_FILE_ID_PATTERN,
  buildPlayerUrl,
  parseDriveReference,
} = globalThis.NimbusDrive;
```

### 6.2. Bọc callback API thành Promise

Chrome API nhiều hàm vẫn dùng callback. Code bọc thành Promise để dùng `async/await`.

Ví dụ:

```js
function storageGet(defaults) {
  return new Promise((resolve) => {
    chrome.storage.sync.get(defaults, resolve);
  });
}
```

Tương tự:

- `createTab()`
- `sendTabMessage()`

### 6.3. `normalizeReference(value)`

Hàm này đảm bảo input có file ID hợp lệ.

Input có thể là:

- string URL
- string file ID
- object `{ fileId, resourceKey }`

Nếu input là string, nó gọi:

```js
parseDriveReference(value)
```

Sau đó validate bằng:

```js
DRIVE_FILE_ID_PATTERN.test(reference.fileId)
```

Nếu hợp lệ, trả:

```js
{
  fileId,
  resourceKey
}
```

Nếu không, trả `null`.

### 6.4. `openPlayer(referenceInput)`

Đây là hàm mở player thật sự.

Flow:

1. Normalize input.
2. Nếu không có file ID hợp lệ, throw error.
3. Lấy `playerBaseUrl` từ storage.
4. Build URL player.
5. Mở tab mới.
6. Return URL đã mở.

Code chính:

```js
const { playerBaseUrl } = await storageGet({ playerBaseUrl: DEFAULT_PLAYER_BASE_URL });
const playerUrl = buildPlayerUrl(playerBaseUrl, reference.fileId, reference.resourceKey);
await createTab(playerUrl);
```

Ví dụ:

```js
openPlayer({
  fileId: 'abc123',
  resourceKey: 'rk456'
});
```

Mở:

```text
https://nimbus-player.vercel.app/play?id=abc123&resourcekey=rk456
```

### 6.5. `installContextMenus()`

Hàm này tạo menu chuột phải:

```js
chrome.contextMenus.create({
  id: MENU_OPEN_PAGE,
  title: 'Mở video Drive hiện tại trong Nimbus Player',
  contexts: ['page'],
  documentUrlPatterns: ['https://drive.google.com/*'],
});
```

Menu này hiện khi right-click trên trang Drive.

Menu thứ hai:

```js
chrome.contextMenus.create({
  id: MENU_OPEN_LINK,
  title: 'Mở video Drive trong Nimbus Player',
  contexts: ['link'],
  documentUrlPatterns: ['https://drive.google.com/*'],
  targetUrlPatterns: [
    'https://drive.google.com/*',
    'https://docs.google.com/*',
  ],
});
```

Menu này hiện khi right-click vào link Drive hoặc docs link trong Drive.

Trước khi tạo menu, code gọi:

```js
chrome.contextMenus.removeAll(...)
```

để tránh duplicate menu sau khi extension reload.

### 6.6. `onInstalled`

```js
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.get({ playerBaseUrl: null }, ({ playerBaseUrl }) => {
    if (!playerBaseUrl) {
      chrome.storage.sync.set({ playerBaseUrl: DEFAULT_PLAYER_BASE_URL });
    }
  });
  installContextMenus();
});
```

Chạy khi extension được cài hoặc reload.

Nó làm 2 việc:

1. Nếu chưa có `playerBaseUrl`, set mặc định.
2. Tạo context menu.

### 6.7. `onStartup`

```js
chrome.runtime.onStartup.addListener(installContextMenus);
```

Khi Chrome khởi động lại, tạo lại context menu.

### 6.8. Xử lý click context menu

```js
chrome.contextMenus.onClicked.addListener((info, tab) => {
  handleContextMenuClick(info, tab).catch(...);
});
```

`handleContextMenuClick()` làm:

1. Thử parse file ID từ:
   - `info.linkUrl`
   - `info.srcUrl`
   - `info.pageUrl`
   - `tab.url`
2. Nếu parse được, mở player.
3. Nếu không parse được, hỏi content script trong tab:

```js
const response = await sendTabMessage(tab.id, {
  type: 'GET_CURRENT_DRIVE_FILE'
});
```

4. Nếu content script trả về reference, mở player.

### 6.9. Message listener trong background

Background lắng nghe message:

```js
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  ...
});
```

Hiện background chỉ nhận 1 loại message từ popup/content script.

#### `OPEN_IN_NIMBUS_PLAYER`

Gửi từ:

- content script khi bấm nút nổi
- popup khi bấm nút mở

Payload:

```js
{
  type: 'OPEN_IN_NIMBUS_PLAYER',
  fileId: '...',
  resourceKey: '...'
}
```

Background gọi `openPlayer(message)` rồi trả:

```js
{ ok: true, url }
```

hoặc:

```js
{ ok: false, error }
```

### 6.10. Vì sao background phải `return true`?

Trong listener:

```js
openPlayer(message)
  .then(...)
  .catch(...);
return true;
```

`return true` báo cho Chrome biết:

> Hàm này sẽ gọi `sendResponse` bất đồng bộ sau.

Nếu quên `return true`, message channel có thể bị đóng trước khi async xong, popup/content script sẽ không nhận response.

---

## 7. Popup - UI khi bấm icon extension

Popup gồm:

- `popup.html`: cấu trúc HTML.
- `popup.css`: style.
- `popup.js`: logic.

Popup chỉ chạy khi user bấm icon extension. Khi đóng popup, JS trong popup cũng dừng.

### 7.1. `popup.html`

File: `extension/popup.html`

Phần head:

```html
<link rel="stylesheet" href="popup.css">
<script src="drive-reference.js" defer></script>
<script src="popup.js" defer></script>
```

Thứ tự script:

1. `drive-reference.js`
2. `popup.js`

Vì `popup.js` dùng `globalThis.NimbusDrive`.

Popup có 3 phần:

1. Header:

```html
<h1>Nimbus Player</h1>
<p>Mở nhanh video từ Google Drive</p>
```

2. Section tab hiện tại:

```html
<h2>Tab hiện tại</h2>
<p id="tabStatus">Đang kiểm tra tab...</p>
<p id="fileName" hidden></p>
<button id="openCurrentButton" disabled>Mở trong Nimbus Player</button>
```

3. Footer có nút mở app chính:

```html
<button id="openAppButton">Mở Nimbus Player</button>
```

### 7.2. `popup.css`

File: `extension/popup.css`

CSS này chỉ áp dụng cho popup. Nó không ảnh hưởng Google Drive.

Các nhóm chính:

- `body`: màu nền, font, width tối thiểu.
- `.popup-shell`: layout tổng thể rộng `340px`.
- `.section`: từng khối/card trong popup.
- `.file-name`: hiển thị tên file, có ellipsis nếu quá dài.
- `.primary-button`: nút mở video.
- `.link-button`: nút mở app chính.

### 7.3. `popup.js`

File: `extension/popup.js`

Popup JS làm 3 việc:

1. Detect tab hiện tại.
2. Mở file trong Nimbus Player.
3. Mở trang Nimbus Player chính.

### 7.4. Lấy DOM nodes

Đầu file:

```js
const tabStatus = document.getElementById('tabStatus');
const fileName = document.getElementById('fileName');
const openCurrentButton = document.getElementById('openCurrentButton');
...
```

Đây là các element trong `popup.html`.

### 7.5. `queryActiveTab()`

```js
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  resolve(tabs[0] || null);
});
```

Lấy tab user đang mở trong cửa sổ hiện tại.

### 7.6. `sendTabMessage(tabId, message)`

Gửi message từ popup tới content script trong tab:

```js
chrome.tabs.sendMessage(tabId, message, callback);
```

Khác với `chrome.runtime.sendMessage`:

- `runtime.sendMessage`: gửi tới background hoặc extension context.
- `tabs.sendMessage`: gửi tới content script trong một tab cụ thể.

Popup dùng `tabs.sendMessage` để hỏi content script:

```js
{ type: 'GET_CURRENT_DRIVE_FILE' }
```

### 7.7. `refreshCurrentTab()`

Đây là hàm chạy tự động khi popup mở.

Trước đây popup có nút **Kiểm tra** để chạy lại hàm này thủ công. Nút đó đã được bỏ vì popup tự kiểm tra ngay khi mở, còn khi người dùng đổi selection trong Drive thì popup thường cũng mất focus/đóng lại. Bỏ nút giúp UI rõ hơn: popup chỉ còn trạng thái hiện tại và nút mở video.

Flow:

1. Set UI loading:

```js
tabStatus.textContent = 'Đang kiểm tra tab...';
fileName.hidden = true;
openCurrentButton.disabled = true;
```

2. Lấy active tab:

```js
const tab = await queryActiveTab();
```

3. Thử parse file ID từ URL tab:

```js
let reference = tab?.url ? parseDriveReference(tab.url) : null;
```

4. Nếu tab có ID, hỏi content script:

```js
const response = await sendTabMessage(tab.id, {
  type: 'GET_CURRENT_DRIVE_FILE'
});
```

5. Nếu content script trả reference, dùng reference đó.
6. Render UI bằng `renderCurrentReference(reference, tab)`.

### 7.8. `renderCurrentReference(reference, tab)`

Hàm này quyết định popup hiển thị gì.

Trường hợp không phải tab Drive:

```js
tabStatus.textContent = 'Mở một tab Google Drive để khởi chạy video.';
openCurrentButton.disabled = true;
```

Trường hợp tab Drive nhưng không detect được file:

```js
tabStatus.textContent = 'Chưa phát hiện video Drive trong tab này.';
openCurrentButton.disabled = true;
```

Trường hợp detect được file:

```js
tabStatus.textContent = reference.isLikelyVideo === false
  ? 'Đã phát hiện một file Drive.'
  : 'Sẵn sàng mở video Drive này.';

fileName.textContent = reference.name || reference.fileId;
openCurrentButton.disabled = false;
```

### 7.9. `openReference(reference)`

Khi user bấm **Mở trong Nimbus Player**, popup gọi:

```js
openReference(currentReference)
```

Hàm này gửi message sang background:

```js
const response = await sendRuntimeMessage({
  type: 'OPEN_IN_NIMBUS_PLAYER',
  fileId: reference.fileId,
  resourceKey: reference.resourceKey,
});
```

Nếu background mở tab thành công, popup không cần làm gì thêm. Nếu lỗi, popup hiển thị lỗi ở `tabStatus`.

### 7.10. Mở app chính

Nút **Mở Nimbus Player**:

```js
const { playerBaseUrl } = await storageGet({ playerBaseUrl: DEFAULT_PLAYER_BASE_URL });
await createTab(normalizePlayerBaseUrl(playerBaseUrl));
```

Nút này mở app chính không kèm file ID.

---

## 8. Message passing - các phần nói chuyện với nhau như thế nào?

Extension này có 2 kiểu message.

### 8.1. Content script hoặc popup gửi tới background

Dùng:

```js
chrome.runtime.sendMessage(...)
```

Ví dụ content script gửi:

```js
chrome.runtime.sendMessage({
  type: 'OPEN_IN_NIMBUS_PLAYER',
  fileId,
  resourceKey,
});
```

Background nhận bằng:

```js
chrome.runtime.onMessage.addListener(...)
```

### 8.2. Popup hoặc background gửi tới content script trong tab

Dùng:

```js
chrome.tabs.sendMessage(tabId, ...)
```

Ví dụ popup hỏi content script:

```js
chrome.tabs.sendMessage(tab.id, {
  type: 'GET_CURRENT_DRIVE_FILE'
});
```

Content script nhận bằng:

```js
chrome.runtime.onMessage.addListener(...)
```

### 8.3. Danh sách message hiện có

| Message type | Ai gửi? | Ai nhận? | Dùng để làm gì? |
| --- | --- | --- | --- |
| `OPEN_IN_NIMBUS_PLAYER` | content script hoặc popup | background | Mở tab player |
| `GET_CURRENT_DRIVE_FILE` | popup hoặc background | content script | Hỏi tab Drive hiện tại có file nào |

---

## 9. Storage - URL trình phát được lưu ở đâu?

Extension lưu URL trình phát trong:

```js
chrome.storage.sync
```

Giá trị chính hiện là:

```js
{
  playerBaseUrl: 'https://nimbus-player.vercel.app'
}
```

Popup không còn hiển thị form cấu hình URL này cho người dùng cuối. Giá trị `playerBaseUrl` vẫn được giữ trong storage để dev có thể override thủ công khi test local/staging. Người dùng bình thường chỉ thấy nút mở video.

Vì dùng `storage.sync`, Chrome có thể sync giá trị này theo tài khoản Chrome nếu user bật sync.

Flow đọc URL:

```text
User mở video
  |
  v
background.js reads chrome.storage.sync.get(...)
  |
  v
buildPlayerUrl(playerBaseUrl, fileId, resourceKey)
```

---

## 10. Ba flow sử dụng chính

### 10.1. Flow A - Nút nổi trên Google Drive

Đây là flow chính nhất.

```text
User mở preview video Drive
  |
  v
Chrome injects content-script.js
  |
  v
content-script.js parses window.location.href
  |
  v
content-script.js sees fileId + video
  |
  v
content-script.js shows floating button
  |
  v
User clicks button
  |
  v
content-script.js sends OPEN_IN_NIMBUS_PLAYER
  |
  v
background.js opens player tab
```

Ví dụ input:

```text
https://drive.google.com/file/d/1abcXYZ/view?resourcekey=0-rk
```

Message gửi sang background:

```js
{
  type: 'OPEN_IN_NIMBUS_PLAYER',
  fileId: '1abcXYZ',
  resourceKey: '0-rk'
}
```

URL mở:

```text
https://nimbus-player.vercel.app/play?id=1abcXYZ&resourcekey=0-rk
```

### 10.2. Flow B - Popup extension

Flow này dùng khi user bấm icon extension.

```text
User clicks extension icon
  |
  v
popup.html opens
  |
  v
popup.js runs refreshCurrentTab()
  |
  v
popup.js asks active Drive tab/content script
  |
  v
popup shows detected file
  |
  v
User clicks "Mở trong Nimbus Player"
  |
  v
popup sends OPEN_IN_NIMBUS_PLAYER
  |
  v
background opens player tab
```

Popup có thể detect bằng 2 cách:

1. Parse URL active tab.
2. Hỏi content script trong active tab.

### 10.3. Flow C - Context menu

Flow này dùng khi right-click.

```text
User right-clicks on Drive page/link
  |
  v
Chrome shows extension context menu
  |
  v
User clicks menu
  |
  v
background.js receives contextMenus.onClicked
  |
  v
background parses info.linkUrl/pageUrl/tab.url
  |
  v
if needed, background asks content script
  |
  v
background opens player tab
```

Context menu có ích khi:

- user đang chọn file nhưng nút nổi chưa hiện
- user right-click trực tiếp vào link Drive
- user muốn mở từ list/folder view

Nhưng có một giới hạn quan trọng: extension chỉ thêm item vào menu chuột phải native của Chrome. Google Drive lại có custom menu riêng cho file card. Nếu right-click trên file card và thấy menu của Drive, đó là menu do Drive render, extension không thể chèn item vào đó bằng API `chrome.contextMenus`. Muốn thấy context menu của extension, bạn cần right-click ở vị trí Chrome còn mở menu native, ví dụ một link thật hoặc vùng trang không bị Drive chặn. Trong thực tế, nên ưu tiên dùng nút nổi hoặc popup vì ổn định hơn trong giao diện Drive.

---

## 11. Vì sao extension phải chia nhiều file?

Nếu mới làm extension, có thể bạn sẽ hỏi: tại sao không gom hết vào một file?

Lý do là quyền và môi trường chạy khác nhau.

### 11.1. Content script nhìn thấy trang nhưng không nên ôm hết logic

`content-script.js` thấy DOM Google Drive, nên nó phù hợp để:

- tìm file ID trong trang
- inject nút
- đọc title/label

Nhưng nó không phải nơi tốt nhất để:

- quản lý context menu
- xử lý URL player trung tâm
- mở tab theo mọi flow

### 11.2. Background có quyền extension nhưng không thấy DOM trang

`background.js` phù hợp để:

- mở tab mới
- tạo context menu
- lưu/read storage
- nhận message từ nhiều nguồn

Nhưng nó không query được DOM Google Drive trực tiếp. Muốn biết Drive đang chọn file nào, nó phải hỏi content script.

### 11.3. Popup là UI tạm thời

`popup.js` chỉ chạy khi popup mở. Khi popup đóng, state trong popup mất.

Vì vậy popup phù hợp để:

- hiển thị trạng thái
- gửi command sang background

Không nên lưu state quan trọng chỉ trong popup.

### 11.4. Helper dùng chung giúp tránh duplicate

`drive-reference.js` gom logic parse URL và build player URL. Nếu không có helper này, cùng một logic sẽ bị copy vào content script, background và popup.

---

## 12. Cách debug extension này

### 12.1. Kiểm tra manifest/assets/scripts

Chạy:

```text
pnpm extension:check
```

Script này kiểm tra:

- `manifest.json` parse được.
- File background tồn tại.
- File popup và asset popup tồn tại.
- JS không lỗi cú pháp.
- Icon đúng kích thước.

### 12.2. Load unpacked

1. Mở `chrome://extensions`.
2. Bật **Developer mode**.
3. Chọn **Load unpacked**.
4. Chọn thư mục `extension`.

Mỗi khi sửa code extension, thường cần bấm reload extension trong `chrome://extensions`.

### 12.3. Debug background

Vào `chrome://extensions`, tìm extension, bấm link service worker hoặc **Inspect views**.

Ở đó bạn xem được:

- console log từ `background.js`
- lỗi context menu
- lỗi message handler

### 12.4. Debug content script

Mở tab Google Drive, mở DevTools của chính tab đó. Console sẽ có lỗi từ content script nếu có.

Lưu ý:

- Content script chạy trong tab Drive.
- Background console không thấy log của content script.
- Popup console không thấy log của content script.

### 12.5. Debug popup

Right-click popup và chọn Inspect, hoặc vào `chrome://extensions` rồi inspect popup nếu Chrome hiển thị.

Popup console dùng để debug:

- lỗi DOM trong `popup.js`
- lỗi gửi message
- lỗi storage

### 12.6. Khi nút nổi không hiện

Kiểm tra theo thứ tự:

1. URL có phải `https://drive.google.com/*` không?
2. Extension đã reload sau khi sửa code chưa?
3. Content script có lỗi console không?
4. File hiện tại có đuôi video không?
5. Trang preview có thẻ `<video>` không?
6. `parseDriveReference(window.location.href)` có lấy được file ID không?

Nút nổi chỉ hiện khi:

```js
reference?.fileId && reference.isLikelyVideo
```

Nếu popup detect được file nhưng nút nổi không hiện, có thể `isLikelyVideo` đang false.

### 12.7. Khi popup không detect được file

Kiểm tra:

1. Active tab có phải Drive không?
2. Content script đã được inject chưa?
3. `chrome.tabs.sendMessage` có lỗi không?
4. URL Drive có file ID không?
5. File đang chọn trong Drive có DOM selected không?

### 12.8. Khi bấm mở nhưng không ra tab

Kiểm tra:

1. Background service worker console có lỗi không?
2. `playerBaseUrl` trong `chrome.storage.sync` có hợp lệ không?
3. Message `OPEN_IN_NIMBUS_PLAYER` có `fileId` không?
4. `buildPlayerUrl()` tạo URL đúng không?
5. Chrome có chặn popup/tab không?

---

## 13. Những điểm cần nhớ

- `manifest.json` là file Chrome đọc đầu tiên.
- `content-script.js` chạy trong Google Drive và inject nút.
- `background.js` mở tab, đọc URL player, tạo context menu.
- `popup.js` chỉ chạy khi popup đang mở.
- `drive-reference.js` chứa helper dùng chung.
- Các phần giao tiếp bằng message.
- Google Drive là SPA, nên content script phải theo dõi DOM và URL thay đổi.
- Không nên tin DOM Drive tuyệt đối, vì Google có thể đổi cấu trúc DOM bất cứ lúc nào.

---

## 14. Glossary nhanh

| Thuật ngữ | Nghĩa |
| --- | --- |
| Manifest | File khai báo extension cho Chrome |
| Content script | JS chạy trong trang web được match |
| Background service worker | JS chạy nền của extension, xử lý event |
| Popup | UI nhỏ khi bấm icon extension |
| Host permission | Quyền extension được chạy trên domain nào |
| Message passing | Cơ chế gửi message giữa popup/content/background |
| `chrome.storage.sync` | Storage của extension, có thể sync theo Chrome account |
| `chrome.tabs.create` | API mở tab mới |
| `chrome.contextMenus` | API tạo menu chuột phải |
| Shadow DOM | DOM cô lập style, giúp UI extension không bị CSS trang phá |
| SPA | Single Page Application, app đổi nội dung/URL mà không reload toàn trang |
