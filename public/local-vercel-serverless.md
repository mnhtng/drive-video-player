# Chạy Vercel Serverless Function Ở Local

Tài liệu này dùng cho flow OAuth Google của Nimbus Player khi chạy local.

Frontend chạy bằng Vite ở:

```bash
http://localhost:5173
```

Nhưng endpoint token OAuth nằm trong Vercel Serverless Function:

```bash
/api/token
```

Trong `vite.config.ts`, mọi request `/api/*` từ Vite sẽ được proxy sang API dev server:

```ts
target: process.env.DEV_API_PROXY_TARGET || 'http://localhost:3000'
```

Vì vậy khi chạy local, cần chạy 2 server cùng lúc:

- Vite frontend: `localhost:5173`
- Vercel API serverless dev: `localhost:3000`

Nếu chỉ chạy Vite mà không chạy Vercel dev server, request này sẽ lỗi:

```text
POST http://localhost:5173/api/token 502 (Bad Gateway)
```

Khi đó Google login có thể thành công ở phía Google, nhưng app không đổi được OAuth `code` thành `access_token`, nên app vẫn xem là chưa đăng nhập và quay về trang chủ.

## 1. Cấu Hình `.env`

File `.env` cần có các biến sau:

```env
VITE_GOOGLE_CLIENT_ID=your-google-oauth-client-id.apps.googleusercontent.com
VITE_GOOGLE_REDIRECT_URI=http://localhost:5173
VITE_GOOGLE_OAUTH_SCOPES=https://www.googleapis.com/auth/drive.readonly
VITE_TOKEN_PROXY_URL=/api/token

GOOGLE_CLIENT_ID=your-google-oauth-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-google-oauth-client-secret

TOKEN_ALLOWED_ORIGINS=http://localhost:5173
DEV_API_PROXY_TARGET=http://localhost:3000
```

Lưu ý:

- `VITE_GOOGLE_CLIENT_ID` và `GOOGLE_CLIENT_ID` thường là cùng một OAuth client ID.
- `GOOGLE_CLIENT_SECRET` chỉ dùng ở serverless function, không được expose qua biến `VITE_*`.
- `VITE_GOOGLE_REDIRECT_URI` phải trùng với Authorized redirect URI trong Google Cloud Console.
- Với local dev, redirect URI nên là `http://localhost:5173`.

## 2. Cấu Hình Google Cloud Console

Trong Google Cloud Console, vào OAuth Client đang dùng và thêm:

Authorized JavaScript origins:

```text
http://localhost:5173
```

Authorized redirect URIs:

```text
http://localhost:5173
```

Nếu redirect URI trong Google Cloud không khớp với `.env`, Google sẽ không trả code hợp lệ hoặc token exchange sẽ fail.

## 3. Chạy Local Dev

Mở terminal 1 để chạy Vercel serverless function:

```bash
pnpm dlx vercel dev --listen 3000
```

Hoặc nếu dùng npm:

```bash
npx vercel dev --listen 3000
```

Mở terminal 2 để chạy Vite frontend:

```bash
pnpm dev
```

Hoặc nếu dùng npm:

```bash
npm run dev
```

Sau đó mở app ở:

```text
http://localhost:5173
```

## 4. Kiểm Tra API Proxy

Khi cả 2 server đang chạy, thử gọi:

```bash
curl -i -X POST \
  -H 'Content-Type: application/json' \
  --data '{"grant_type":"authorization_code"}' \
  http://localhost:5173/api/token
```

Kết quả đúng cho request test thiếu dữ liệu là `400`, ví dụ:

```json
{"error":"Missing code or redirect_uri for authorization_code grant"}
```

Nếu trả `502 Bad Gateway`, kiểm tra:

- Vercel dev server ở `localhost:3000` đã chạy chưa.
- `DEV_API_PROXY_TARGET` có đúng là `http://localhost:3000` không.
- Terminal chạy `vercel dev` có log lỗi gì không.

Có thể gọi trực tiếp API server để tách lỗi proxy:

```bash
curl -i -X POST \
  -H 'Content-Type: application/json' \
  --data '{"grant_type":"authorization_code"}' \
  http://localhost:3000/api/token
```

Nếu gọi `localhost:3000/api/token` cũng fail, lỗi nằm ở Vercel dev server hoặc function `api/token.ts`.

Nếu gọi `localhost:3000/api/token` được nhưng `localhost:5173/api/token` fail, lỗi nằm ở Vite proxy hoặc `DEV_API_PROXY_TARGET`.

## 5. Debug Flow Login Bị Quay Về Trang Chủ

Triệu chứng:

```text
POST http://localhost:5173/api/token 502 (Bad Gateway)
FetchError
```

Nguyên nhân:

1. App lưu file ID cần phát vào `sessionStorage`.
2. Google redirect về app sau login.
3. `react-oauth2-code-pkce` gọi `/api/token`.
4. `/api/token` fail nên không có `access_token`.
5. App vẫn ở trạng thái chưa authenticated.
6. URL callback không còn `?id=...`, nên router parse thành trang chủ.

Cách xử lý:

1. Chạy `vercel dev --listen 3000`.
2. Chạy Vite ở `localhost:5173`.
3. Kiểm tra `.env`.
4. Kiểm tra Google Cloud OAuth redirect URI.
5. Thử lại flow paste link -> login -> redirect.

## 6. Lỗi Thường Gặp

### `502 Bad Gateway` khi gọi `/api/token`

Thường do Vite proxy không kết nối được tới `localhost:3000`.

Chạy:

```bash
pnpm dlx vercel dev --listen 3000
```

### `invalid_client`

Thường do sai `GOOGLE_CLIENT_ID` hoặc `GOOGLE_CLIENT_SECRET`.

Kiểm tra lại OAuth client trong Google Cloud Console.

### `redirect_uri_mismatch`

Thường do `VITE_GOOGLE_REDIRECT_URI` không trùng Authorized redirect URI.

Với local, cả `.env` và Google Cloud nên dùng:

```text
http://localhost:5173
```

### Login xong vẫn về trang chủ

Nếu console có `/api/token 502`, nguyên nhân là token exchange fail, không phải lỗi phát video.

Sửa API serverless local trước, sau đó app mới có token để mở trang phát video.
