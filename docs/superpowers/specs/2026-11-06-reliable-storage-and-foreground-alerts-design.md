# Village Timer, Phần 1: Lưu bền, nhắc dán lại, cài đặt và báo khi app đang mở

**Ngày:** 2026-11-06. **Trạng thái:** chờ người dùng duyệt.

Đây là phần đầu trong ba phần của tính năng thông báo. Phần 2 là app Android, Phần 3 là server gửi thông báo cho web. Mỗi phần có spec và plan riêng. Spec này thay thế dòng "Ngoài phạm vi: thông báo đẩy" trong `docs/superpowers/plans/2026-11-05-village-timer-pwa.md`.

## Yêu cầu của người dùng

Nguyên văn:

> và tôi muốn ứng dụng được phép chạy ngầm và sẽ có setting điều chỉnh thông báo, ví dụ như âm thanh voice "có công trình vừa hoàn thành" hoặc là 1 tiếng ting, hoặc là rung, hoặc là hiển thị thông báo trên màn hình giống như các thông báo tin nhắn

> và nhớ là có lưu lại API mỗi khi người dùng copy vô nhé, ở những lần mở lại app sau khi đóng thì vẫn giữ kết nối API đó, trừ khi API đó có thay đổi và hiện lỗi thì người dùng mới phải copy lại API rồi paste vô lại nhé

Người dùng đã chọn: làm cả app Android và web có server; giọng máy đọc; giữ cả ba trường hợp nhắc dán lại.

**Phần 1 không làm "chạy ngầm".** Việc báo khi app đã đóng thuộc Phần 2 và Phần 3.

## Mục tiêu

1. Dữ liệu đã dán không mất khi app bị tắt đột ngột ngay sau khi dán.
2. App tự nhắc dán lại trong những trường hợp nó phát hiện được.
3. Mỗi người chọn được một hoặc nhiều kiểu báo, và được báo khi app đang mở.
4. Phần lưu trữ và phần phát tín hiệu có giao diện chung để Phần 2 và 3 cắm vào mà không đổi logic.

## Ngoài phạm vi

- Báo khi app đã đóng, service worker nhận push, file APK: thuộc Phần 2 và 3.
- Chọn báo theo từng nhóm hạng mục hoặc từng tài khoản.
- Đổi câu giọng nói theo loại hạng mục. Khi xong nghiên cứu, app vẫn đọc "có công trình vừa hoàn thành", đúng câu người dùng đã chọn.
- Tránh báo trùng khi cùng một app mở ở hai tab.

## Dữ kiện đã kiểm chứng

Đo ngày 2026-11-06 trên Chrome máy tính, chưa đo trên Android:

| Cách ghi | Còn dữ liệu sau khi buộc tắt ngay lúc ghi xong |
|---|---|
| `localStorage` | 0/4 |
| IndexedDB, `durability: 'relaxed'` | 4/4 |
| IndexedDB, `durability: 'strict'` | 4/4 |

Với bản build hiện tại, buộc tắt Chrome sau khi dán 0, 1 và 3 giây đều mất dữ liệu; sau 6, 12 và 31 giây thì còn. Đóng bình thường thì còn.

Các điểm khác:

- `new Notification()` luôn ném `TypeError` trên Chrome Android; phải dùng `ServiceWorkerRegistration.showNotification()` (MDN compat data).
- `navigator.vibrate` trên Chrome cần cử chỉ của người dùng, nếu không sẽ trả `false` (MDN compat data).
- Giọng Piper `vi_VN-vais1000-medium` huấn luyện từ bộ dữ liệu VAIS-1000, giấy phép Creative Commons Attribution (MODEL_CARD và trang IEEE DataPort, DOI 10.21227/H2B887). Hai giọng tiếng Việt còn lại không dùng được: `25hours_single` ghi "License: Unknown", `vivos` là CC BY-NC-SA 4.0.
- Tài liệu Capacitor khuyến cáo xem `localStorage` trong WebView là tạm thời, và dùng Preferences cho dữ liệu nhỏ. Vì vậy Phần 2 cần một giao diện lưu trữ bất đồng bộ.

## Giả định chưa kiểm chứng

- IndexedDB trên Android cũng giữ được dữ liệu khi app bị tắt đột ngột. Sẽ kiểm tra khi có thiết bị thật ở Phần 2.

## Thiết kế

### 1. Lưu trữ

Thêm giao diện lưu trữ bất đồng bộ, giá trị là chuỗi JSON:

```ts
// src/core/store.ts
export interface KeyValueStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
}
export interface LoadResult { state: AppState; unreadable: boolean }
export function loadState(store: KeyValueStore, getLegacy?: () => Storage): Promise<LoadResult>;
export function saveState(store: KeyValueStore, state: AppState): Promise<boolean>;
```

`upsertVillage`, `removeVillage` và `emptyState` giữ nguyên. `openStorage` bị bỏ, vì `main.ts` không còn dùng `localStorage` để lưu.

`src/platform/indexeddb-store.ts` cung cấp `openStore(): Promise<KeyValueStore>`:

- Cơ sở dữ liệu `village-timer`, phiên bản 1, object store `kv`.
- Ghi với `durability: 'strict'`, promise chỉ resolve khi transaction `complete`.
- Nếu mở thất bại hoặc `indexedDB` ném lỗi, trả về store thay thế: `get` trả `null`, `set` reject. App vẫn chạy và hiện cảnh báo `storage` như hiện tại.

`loadState`:

- Chưa có dữ liệu và `getLegacy()` có bản hợp lệ ở khóa `village-timer:v1`: ghi sang store, chỉ xóa bản cũ sau khi ghi thành công. `getLegacy` là hàm vì ở trình duyệt chặn storage, chỉ cần chạm vào `localStorage` là đã ném lỗi; mọi lời gọi đều nằm trong `try/catch` bên trong `loadState`.
- JSON hỏng, sai cấu trúc, có tài khoản bị loại vì sai dữ liệu, hoặc `get` reject: `unreadable: true`, kèm những tài khoản đọc được. Dữ liệu cũ trong store không bị xóa cho đến lần lưu thành công tiếp theo.

`mountApp` vẫn đồng bộ. `main.ts` đọc store và cài đặt xong rồi mới gọi `mountApp`. Khi lưu, app gọi `saveState` ngay mà không chờ; nếu trả `false` thì hiện cảnh báo `storage`.

### 2. Nhắc dán lại

Thêm vào `src/core/alerts.ts`:

```ts
export function allFinished(jobs: Job[], nowMs: number): boolean;
```

Trả `true` khi có ít nhất một hạng mục không thuộc nhóm `helper`, và mọi hạng mục như vậy đều đã xong.

| Trường hợp | Selector | Nội dung |
|---|---|---|
| Mọi hạng mục của tài khoản đang xem đã xong | `[data-notice="all-finished"]` | `Mọi hạng mục đã xong. Hãy dán dữ liệu mới để cập nhật.` |
| `loaded.unreadable` | `[data-notice="unreadable"]` | `Không đọc được một phần dữ liệu đã lưu. Hãy dán lại dữ liệu từ game.` |

Cảnh báo `unreadable` biến mất sau lần dán thành công. Cảnh báo `all-finished` xuất hiện ngay lúc mục cuối cùng xong, vì `tick` đã render lại khi số mục xong thay đổi.

### 3. Cài đặt

```ts
// src/core/settings.ts
export interface AlertSettings { voice: boolean; ting: boolean; vibrate: boolean; banner: boolean }
export const DEFAULT_SETTINGS: AlertSettings; // cả bốn đều false
export const SETTINGS_KEY = 'village-timer:settings:v1';
export function loadSettings(store: KeyValueStore): Promise<AlertSettings>;
export function saveSettings(store: KeyValueStore, settings: AlertSettings): Promise<boolean>;
```

`loadSettings` trả `DEFAULT_SETTINGS` khi thiếu hoặc hỏng; từng trường không phải boolean thì lấy giá trị mặc định.

### 4. Phát hiện hạng mục vừa xong

```ts
// src/core/alerts.ts
export interface FinishedJob { tag: string; job: Job }
export interface AlertMessage { title: string; body: string }
export function finishedBetween(villages: Village[], fromSec: number, toSec: number): FinishedJob[];
export function alertMessage(finished: FinishedJob[]): AlertMessage;
```

`finishedBetween` lấy mọi hạng mục của mọi tài khoản có `fromSec < endsAt <= toSec`, bỏ nhóm `helper`.

`tick` giữ biến `lastCheckSec`, khởi tạo bằng giờ lúc mount. Mỗi tick gọi `finishedBetween(villages, lastCheckSec, now)`, rồi `lastCheckSec = max(lastCheckSec, now)`. Cách này không cần lưu danh sách đã báo:

- Mục xong trước khi mở app có `endsAt <= lastCheckSec` nên không báo.
- Dán lại không báo trùng, vì thời gian chỉ tiến về phía trước.
- Trang bị đóng băng rồi hoạt động lại: các mục xong trong lúc đó được báo một lần ở tick kế tiếp.
- Đồng hồ máy bị chỉnh lùi: `max` ngăn báo lại.

`alertMessage`:

| Số mục | `title` | `body` |
|---|---|---|
| 1 | `{jobName(job)} đã xong` | `{detail} · {tag}` |
| Từ 2 | `{n} hạng mục đã xong` | Các `jobName(job)`, ngăn bởi `, ` |

### 5. Phát tín hiệu

```ts
// src/platform/alert-output.ts
export type Sound = 'voice' | 'ting';
export type BannerPermission = 'granted' | 'denied' | 'default' | 'unsupported';
export interface AlertOutput {
  play(sound: Sound): Promise<boolean>;      // resolve khi phát xong, false nếu bị chặn hoặc lỗi
  vibrate(): boolean;
  showBanner(message: AlertMessage): Promise<boolean>;
  bannerPermission(): BannerPermission;
  requestBannerPermission(): Promise<BannerPermission>;
  hasUserActivation(): boolean;
}
export function browserAlertOutput(baseUrl: string, makeAudio?: (src: string) => HTMLAudioElement): AlertOutput;
```

`src/ui/app.ts` chỉ biết `AlertOutput`, nhờ đó test dùng bản giả và Phần 2 thay bằng bản Android.

Khi có mục vừa xong, `fireAlert(message)` chạy theo thứ tự, mỗi tín hiệu lỗi không chặn tín hiệu sau:

1. `banner` bật: `showBanner`.
2. `vibrate` bật: `vibrate`.
3. `ting` bật: `play('ting')`, chờ phát xong.
4. `voice` bật: `play('voice')`.

Nhiều mục xong trong cùng một tick chỉ gọi `fireAlert` một lần. Nếu đang phát dở mà có lần báo mới thì lần mới bỏ qua phần âm thanh, phần còn lại vẫn chạy.

Chi tiết `browserAlertOutput`:

- Âm thanh dùng `HTMLAudioElement`, tải từ `{baseUrl}sounds/voice.wav` và `{baseUrl}sounds/ting.wav`. `play` có giới hạn 10 giây để một âm thanh treo không chặn các lần báo sau.
- Rung dùng `navigator.vibrate([200, 100, 200])`. Thiếu API thì trả `false`.
- `showBanner` lấy registration bằng `navigator.serviceWorker.getRegistration()` rồi gọi `showNotification` với `body`, `icon`, `tag: 'village-timer-finished'` và `renotify: true`; thiếu `renotify` thì lần báo sau sẽ âm thầm thay thông báo cũ. Không có registration hoặc không có quyền thì trả `false`.
- `hasUserActivation` đọc `navigator.userActivation.hasBeenActive`. Trình duyệt không có API này thì trả `true`.

Bấm vào thông báo phải mở app, giống thông báo tin nhắn. Thêm `public/sw-notifications.js` xử lý `notificationclick`: đóng thông báo, focus cửa sổ app đang mở, nếu không có thì mở `registration.scope`. Nạp vào service worker bằng `workbox.importScripts`.

### 6. Giao diện

Thêm `<details data-role="alerts">` ngay dưới ô dán, phía trước danh sách. Dòng tóm tắt là `Thông báo · Đang tắt` khi cả bốn công tắc tắt, ngược lại là `Thông báo · Đang bật`.

| Phần tử | Selector | Nội dung |
|---|---|---|
| Công tắc giọng nói | `input[name="alert-voice"]` | `Giọng nói "Có công trình vừa hoàn thành"` |
| Công tắc ting | `input[name="alert-ting"]` | `Tiếng ting` |
| Công tắc rung | `input[name="alert-vibrate"]` | `Rung (trên điện thoại)` |
| Công tắc hiện thông báo | `input[name="alert-banner"]` | `Hiện thông báo trên màn hình` |
| Nút thử | `button[data-action="test-alert"]` | `Thử` |
| Ghi chú giới hạn | `[data-role="alerts-limit"]` | `Hiện tại app chỉ báo khi đang mở. Trên Android, tắt màn hình hoặc chuyển sang app khác thì sẽ không báo.` |

Cảnh báo mới:

| Selector | Khi nào | Nội dung |
|---|---|---|
| `[data-notice="needs-tap"]` | Đang bật giọng nói, ting hoặc rung, và `hasUserActivation()` là `false` | `Chạm vào app một lần để bật âm thanh và rung.` |
| `[data-notice="banner-denied"]` | Người dùng bật công tắc nhưng quyền bị từ chối hoặc không hỗ trợ | `Trình duyệt đang chặn thông báo. Hãy cho phép trong phần cài đặt trang web.` |
| `[data-notice="sound-failed"]` | `play` trả `false` | `Không phát được âm thanh. Hãy chạm vào app rồi bấm Thử.` |

Mọi văn bản mới nằm trong `src/ui/copy.ts` và đi qua `textContent`, như quy ước hiện có.

Hành vi:

- Bật `banner`: nếu quyền chưa cấp thì gọi `requestBannerPermission`. Không được cấp thì công tắc tắt lại và hiện `banner-denied`. Các công tắc khác lưu ngay khi đổi.
- Nút `Thử` gọi `fireAlert` với `title: 'Thử thông báo'`, `body: 'Village Timer'`, dùng các kiểu đang bật. Nếu không bật kiểu nào thì không làm gì.
- Khối `details` tự mở một lần khi tài khoản đầu tiên được thêm vào máy mà cả bốn công tắc đang tắt. Đây là gợi ý sau lần dán đầu tiên.
- `needs-tap` được kiểm tra lại khi `pointerdown`, `pointerup` hoặc `keydown` trên `document`. `hasUserActivation` là `true` thì cảnh báo biến mất. Cần cả `pointerup` vì khi chạm trên điện thoại, Chrome báo `hasBeenActive` là `false` lúc `pointerdown` và chỉ thành `true` lúc `pointerup`. Chỉ gỡ riêng phần tử cảnh báo, không render lại, để không làm mất cú bấm vào các nút ở phía trên.
- `banner-denied` biến mất ở lần đổi công tắc tiếp theo. `sound-failed` biến mất khi lần phát sau thành công.

Footer thêm dòng liên kết tới giấy phép giọng đọc: `Giọng đọc: Piper, dữ liệu VAIS-1000 (CC BY).`

### 7. File âm thanh

- `public/sounds/voice.wav`: câu `Có công trình vừa hoàn thành.`, tạo bằng Piper với giọng `vi_VN-vais1000-medium`, `length_scale=1.0`, `volume=0.9`, thêm 0,25 giây im lặng ở mỗi đầu để loa và tai nghe Bluetooth không nuốt mất chữ đầu. Người dùng đã nghe và duyệt file này ngày 2026-11-06.
- `public/sounds/ting.wav`: `scripts/build-ting.mjs` tạo sóng sine có độ tắt dần, khoảng 0,6 giây, nên không có vấn đề bản quyền.
- Cả hai đều là WAV PCM 16-bit mono, không cần công cụ chuyển đổi và Android dùng được ở Phần 2. Mỗi file không quá 150 KB.
- `public/licenses/vais1000-voice.txt` ghi tên bộ dữ liệu, DOI, giấy phép và câu nói rõ file là giọng tổng hợp, không phải bản ghi gốc.
- README ghi lại lệnh tạo `voice.wav`.

Hai file âm thanh và file giấy phép được thêm vào `includeAssets` để chạy được khi không có mạng.

### 8. Luồng dữ liệu

```
Khởi động:  main.ts -> openStore -> loadState + loadSettings -> mountApp
Dán:        handleText -> parseExport -> upsertVillage -> saveState + render
Mỗi giây:   tick -> cập nhật đếm ngược -> finishedBetween -> fireAlert
                 -> render lại nếu số mục xong thay đổi
Đổi cài đặt: công tắc -> saveSettings + render
```

`AppDeps` đổi thành:

```ts
export interface AppDeps {
  store: KeyValueStore;
  loaded: LoadResult;
  settings: AlertSettings;
  output: AlertOutput;
  now: () => number;
  readClipboard: () => Promise<string>;
}
```

### 9. Xử lý lỗi

| Tình huống | Hành vi |
|---|---|
| IndexedDB không mở được | App chạy với store thay thế, hiện `storage` khi lưu thất bại |
| Dữ liệu đã lưu hỏng | Hiện `unreadable`, tài khoản đọc được vẫn hiện |
| Lưu cài đặt thất bại | Hiện `storage`, cài đặt vẫn có tác dụng đến khi đóng app |
| Âm thanh bị chặn hoặc lỗi | Hiện `sound-failed`, các tín hiệu khác vẫn chạy |
| Không có quyền thông báo | Tắt công tắc, hiện `banner-denied` |
| `showBanner` trả `false` lúc báo thật | Các tín hiệu khác vẫn chạy, danh sách vẫn hiện "Đã xong" |

## Tệp thay đổi

| Tệp | Thay đổi |
|---|---|
| `src/core/store.ts` | Đổi sang `KeyValueStore`, thêm chuyển dữ liệu cũ |
| `src/core/settings.ts` | Mới |
| `src/core/alerts.ts` | Mới |
| `src/platform/indexeddb-store.ts` | Mới |
| `src/platform/alert-output.ts` | Mới |
| `src/ui/alerts-panel.ts` | Mới, dựng khối `details` |
| `src/ui/app.ts` | Nối bảng thông báo, `fireAlert`, các cảnh báo mới |
| `src/ui/copy.ts`, `src/ui/style.css` | Thêm văn bản và giao diện |
| `src/main.ts` | Khởi động bất đồng bộ |
| `public/sw-notifications.js` | Mới |
| `public/sounds/*`, `public/licenses/vais1000-voice.txt` | Mới |
| `scripts/build-ting.mjs` | Mới |
| `vite.config.ts` | Thêm `includeAssets`, `workbox.importScripts` |
| `README.md` | Thêm phần thông báo, lệnh tạo giọng |

Làm tiếp trên nhánh `feat/village-timer` nếu nhánh đó chưa merge; nếu đã merge thì tạo nhánh mới từ `main`.

## Kiểm thử

Test tự động, không thêm dependency:

- `tests/store.test.ts`: đọc và ghi qua store trong bộ nhớ; dữ liệu hỏng cho `unreadable`; chuyển dữ liệu cũ chỉ xóa bản cũ sau khi ghi thành công; ghi thất bại trả `false`.
- `tests/settings.test.ts`: mặc định, dữ liệu hỏng, trường sai kiểu.
- `tests/alerts.test.ts`: biên `fromSec` và `toSec`, bỏ nhóm `helper`, gồm mọi tài khoản, văn bản một mục và nhiều mục, `allFinished` với danh sách rỗng và danh sách chỉ có `helper`.
- `tests/app.test.ts`: dùng `AlertOutput` giả, kiểm tra các điểm:
  - Mục vừa qua giờ gọi đúng các kiểu đang bật, đúng một lần.
  - Nhiều mục xong cùng tick chỉ báo một lần.
  - Đang phát dở thì lần báo mới không phát chồng âm thanh.
  - Mục đã xong trước khi mở app không báo.
  - Tài khoản không đang xem vẫn được báo.
  - Dán lại không báo trùng.
  - Công tắc được lưu và khôi phục.
  - Quyền bị từ chối thì công tắc tắt và hiện `banner-denied`.
  - Hiện đúng `all-finished`, `unreadable`, `needs-tap`, `sound-failed`.
  - `details` tự mở sau lần dán đầu tiên.

Kiểm tra trên Chrome thật, bản build production dưới đường dẫn `/coc_notification/`:

- Buộc tắt Chrome ngay sau khi dán, mở lại vẫn đủ 13 dòng.
- Dữ liệu cũ trong `localStorage` được chuyển sang.
- `sounds/voice.wav` và `sounds/ting.wav` tải được khi đã tắt server.
- Cấp quyền thông báo, bấm `Thử`, `registration.getNotifications()` có thông báo.
- Bấm `Thử` với giọng nói bật thì audio phát tới sự kiện `ended`.
- Ở độ rộng 390px, khi mở bảng thông báo, không có thanh cuộn ngang.
- Không có request nào ra ngoài máy.

Người dùng kiểm tra:

- Thử trên Android thật: bật các công tắc, bấm `Thử`, giữ app mở chờ một mục xong.
