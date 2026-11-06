# Village Timer: Hai ngôn ngữ và giao diện mới

**Ngày:** 2026-11-06. **Trạng thái:** đã được người dùng duyệt.

Spec này nối tiếp Phần 1 (`2026-11-06-reliable-storage-and-foreground-alerts-design.md`) và được làm trước Phần 2 (app Android). Nó thay thế các mục sau của Phần 1: khối `details` ở mục 6, vị trí nút dán, và lời gợi ý tự mở bảng thông báo.

## Yêu cầu của người dùng

Nguyên văn:

> hãy thiết kế giao diện trông chuyên nghiệp hơn

> và hãy có setting tiếng anh, tiếng việt giúp t nữa nhé

> hãy dùng playwright để kiểm chứng giao diện

> ủa mà nếu như app của họ đã dán dữ liệu thì có cần dán lại mỗi lần sau mở lại không? nếu không thì hãy chuyển nút dán dữ liệu vào một chỗ khác giúp t. để chỗ nào sao cho chuyên nghiệp chút

Người dùng đã chọn: kiểu A "Tối gọn"; thêm giọng tiếng Anh; giữ tên hạng mục bằng tiếng Anh ở cả hai ngôn ngữ; nút dán nhỏ nằm cạnh dòng tuổi dữ liệu.

Mẫu đã duyệt nằm ở `docs/superpowers/specs/2026-11-06-language-and-redesign-mock.html`. Mở file đó trong trình duyệt để xem. Giá trị khoảng cách và cỡ chữ lấy theo mẫu.

## Mục tiêu

1. Người mở app thấy ngay hạng mục nào xong tiếp theo, không phải cuộn qua các nút.
2. Toàn bộ chữ của app đổi được giữa tiếng Việt và tiếng Anh ngay lập tức, kể cả với dữ liệu đã dán.
3. Giọng nói theo ngôn ngữ đang chọn.
4. Nút dán không chiếm chỗ khi không cần.

## Ngoài phạm vi

- Dịch tên hạng mục. Export chỉ chứa mã số, bảng 250 tên trong `clash-of-clans-data` chỉ có tiếng Anh, và đổi ngôn ngữ trong game không ảnh hưởng gì.
- Chế độ sáng, chọn màu.
- Dịch tên và mô tả trong `manifest.webmanifest`. File này chỉ có một bản, giữ nguyên.
- Báo khi app đã đóng: thuộc Phần 2 và 3.

## Dữ kiện đã kiểm chứng

- File export thật chỉ có một giá trị chữ là tag; mọi thứ còn lại là số.
- `public/sounds/voice-en.wav` mới: Piper 1.8, giọng `en_US-ljspeech-high`, câu `A building has finished.`, `length_scale=1.0`, `volume=0.9`, thêm 0,25 giây im lặng mỗi đầu, 22050 Hz, mono, 16-bit, 1,89 giây, 81 KB, không bị cắt đỉnh. Người dùng đã nghe và duyệt ngày 2026-11-06.
- Bộ dữ liệu LJ Speech thuộc phạm vi công cộng, theo MODEL_CARD của Piper và trang `keithito.com/LJ-Speech-Dataset`.
- Trên Android, nút quay lại của hệ thống sẽ thoát app nếu app không có mục lịch sử để lùi về.

## Thiết kế

### 1. Dữ liệu hạng mục

`Job.detail` đang là chuỗi tiếng Việt, và đã được lưu trên máy người dùng. Đổi thành dữ liệu có cấu trúc:

```ts
// src/core/types.ts
export type JobDetail =
  | { kind: 'upgrade'; level: number }
  | { kind: 'weapon'; level: number; weapon: number }
  | { kind: 'build' }
  | { kind: 'cooldown' };
export interface Job { id: number; parentId?: number; group: Group; detail: JobDetail; endsAt: number }
```

`detailOf` trong `src/core/parse.ts` trả `JobDetail` theo đúng các nhánh hiện có. `node.weapon` không phải số thì coi như không có vũ khí.

`parseState` trong `src/core/store.ts` đổi dữ liệu cũ khi đọc:

| Chuỗi cũ | `JobDetail` |
|---|---|
| `Cấp 6 → 7` | `{ kind: 'upgrade', level: 6 }` |
| `Cấp 3 · Vũ khí 2` | `{ kind: 'weapon', level: 3, weapon: 2 }` |
| `Xây mới` | `{ kind: 'build' }` |
| `Hồi chiêu` | `{ kind: 'cooldown' }` |

Chuỗi không khớp mẫu nào, hoặc `detail` không đúng cấu trúc: cả tài khoản đó bị loại và `unreadable` là `true`, như tài khoản hỏng hiện nay. Khóa lưu giữ nguyên `village-timer:v1`. Bản lưu chuyển sang dạng mới ở lần lưu tiếp theo.

### 2. Ngôn ngữ

```ts
// src/core/language.ts
export type Language = 'vi' | 'en';
export function deviceLanguage(tag: string): Language; // bắt đầu bằng 'vi', không phân biệt hoa thường, thì 'vi', ngược lại 'en'
```

Cài đặt có thêm trường ngôn ngữ:

```ts
// src/core/settings.ts
export interface Settings extends AlertSettings { language: Language | null } // null là theo máy
export const DEFAULT_SETTINGS: Settings; // bốn công tắc false, language null
export function anyAlertOn(settings: AlertSettings): boolean;
export function loadSettings(store: KeyValueStore): Promise<Settings>;
export function saveSettings(store: KeyValueStore, settings: Settings): Promise<boolean>;
```

Khóa `SETTINGS_KEY` giữ nguyên. `language` không phải `'vi'` hay `'en'` thì lấy `null`.

`AppDeps` thêm `deviceLanguage: Language`, và đổi `settings: Settings`. `main.ts` truyền `deviceLanguage(navigator.language)`. Ngôn ngữ hiệu lực là `settings.language ?? deps.deviceLanguage`.

Đổi ngôn ngữ có tác dụng ngay, không tải lại trang: lưu cài đặt, đặt `document.documentElement.lang`, dựng lại mọi chữ. Thông báo và giọng nói dùng ngôn ngữ tại lúc báo.

Hàm định dạng nhận thêm ngôn ngữ:

```ts
// src/core/time.ts
export function formatRemaining(seconds: number, lang: Language): string;
export function formatCountdown(seconds: number, lang: Language): string;
export function formatEnd(endsAt: number, lang: Language, timeZone?: string): string;
export function formatAgo(seconds: number, lang: Language): string;
// src/core/names.ts
export function jobDetailText(detail: JobDetail, lang: Language): string;
// src/core/alerts.ts
export function alertMessage(finished: FinishedJob[], lang: Language): AlertMessage;
export function nextJob(jobs: Job[], nowMs: number): Job | null;
```

`nextJob` trả hạng mục còn thời gian sớm nhất, bỏ nhóm `helper`.

| `formatRemaining` | `vi` | `en` |
|---|---|---|
| Hết giờ | `Đã xong` | `Done` |
| Từ 1 ngày | `4 ngày 13 giờ` | `4d 13h` |
| Từ 1 giờ | `13 giờ 3 phút` | `13h 3m` |
| Từ 1 phút | `45 phút 12 giây` | `45m 12s` |
| Dưới 1 phút | `12 giây` | `12s` |

`formatCountdown`: dưới 24 giờ là `H:MM:SS`, ví dụ `9:59:52` và `0:05:03`. Từ 24 giờ trở lên trả giống `formatRemaining`. Hết giờ trả giống `formatRemaining`.

`formatEnd`: cả hai ngôn ngữ cùng thứ tự `19:54 Thứ 6, 06/11` và `19:54 Fri, 06/11`, ghép từ `Intl.DateTimeFormat.formatToParts` với locale `vi-VN` và `en-GB`. Mẫu ở màn hình danh sách lược bỏ ngày, nhưng app giữ ngày để không nhầm với hạng mục xong sau hơn một tuần.

`formatAgo`: `vi` giữ nguyên. `en` là `just now`, `5m ago`, `2h ago`, `3d ago`.

| `jobDetailText` | `vi` | `en` |
|---|---|---|
| `upgrade` | `Cấp 6 → 7` | `Level 6 → 7` |
| `weapon` | `Cấp 3 · Vũ khí 2` | `Level 3 · Weapon 2` |
| `build` | `Xây mới` | `New build` |
| `cooldown` | `Hồi chiêu` | `Cooldown` |

`alertMessage`: `vi` giữ nguyên. `en` là `Workshop finished` với thân `Level 6 → 7 · #A`, và `2 items finished` với thân là danh sách tên.

### 3. Văn bản giao diện

`src/ui/copy.ts` xuất `copy: Record<Language, Copy>`, trong đó `Copy` lấy từ kiểu của bản `vi`, để TypeScript báo lỗi nếu bản `en` thiếu khóa. Bản `vi` giữ các câu hiện có, thêm và đổi các khóa ở bảng dưới.

| Khóa | `vi` | `en` |
|---|---|---|
| `helpTitle` | `Bắt đầu trong 3 bước` | `Get started in 3 steps` |
| `help1` | giữ nguyên | `In the game, open Settings → More Settings → Data Export and tap Copy.` |
| `help2` | giữ nguyên | `Come back here and tap "Paste data".` |
| `help3` | giữ nguyên | `Install the app: on Android open the Chrome menu and choose Add to Home screen; on a computer click the install icon in the address bar.` |
| `paste` | `Dán dữ liệu` | `Paste data` |
| `pasteSmall` | `Dán mới` | `Paste new` |
| `pasteFresh` | `Dán dữ liệu mới` | `Paste new data` |
| `placeholder` | giữ nguyên | `Or paste the data here` |
| `delete` | giữ nguyên | `Delete` |
| `exportedAgo` | `Xuất {ago}` | `Exported {ago}` |
| `exportedAt` | `lúc {time}` | `at {time}` |
| `staleHint` | giữ nguyên | `If you used books, hammers, potions or gems after exporting, paste new data.` |
| `noJobs` | giữ nguyên | `Nothing is upgrading on this account.` |
| `next` | `Xong tiếp theo` | `Next up` |
| `allDoneEyebrow` | `Đã xong` | `All done` |
| `allDoneTitle` | `Mọi hạng mục đã xong` | `Everything has finished` |
| `allDoneText` | `Hãy dán dữ liệu mới để cập nhật.` | `Paste new data to update.` |
| `nudge` | `Bật thông báo khi có hạng mục xong` | `Get alerted when something finishes` |
| `nudgeAction` | `Bật` | `Turn on` |
| `settings.open`, `settings.title` | `Cài đặt` | `Settings` |
| `settings.back` | `Quay lại` | `Back` |
| `settings.language` | `Ngôn ngữ` | `Language` |
| `settings.alerts` | `Thông báo` | `Alerts` |
| `settings.account` | `Tài khoản` | `Account` |
| `alerts.voice` | `Giọng nói` | `Voice` |
| `alerts.ting` | giữ nguyên | `Ting sound` |
| `alerts.vibrate` | giữ nguyên | `Vibrate (on phones)` |
| `alerts.banner` | giữ nguyên | `Show on-screen notification` |
| `alerts.test` | giữ nguyên | `Test` |
| `alerts.limit` | giữ nguyên | `For now the app only alerts while it is open. On Android, turning the screen off or switching apps stops the alerts.` |
| `alerts.testTitle` | giữ nguyên | `Test alert` |
| `voiceCreditVi` | `Giọng tiếng Việt: Piper, dữ liệu VAIS-1000 (CC BY).` | `Vietnamese voice: Piper, VAIS-1000 data (CC BY).` |
| `voiceCreditEn` | `Giọng tiếng Anh: Piper, dữ liệu LJ Speech (phạm vi công cộng).` | `English voice: Piper, LJ Speech data (public domain).` |
| `privacy` | giữ nguyên | `Data stays on this device and is never sent anywhere.` |
| `credit` | giữ nguyên | `Item names: clash-of-clans-data (MIT).` |
| `error.empty` | giữ nguyên | `The clipboard is empty. Tap Copy in the game and try again.` |
| `error.not-json` | giữ nguyên | `This is not game export data, or part of it is missing. Tap Copy in the game and paste again.` |
| `error.not-export` | giữ nguyên | `This data has no tag or export time. Get it again from Data Export in the game.` |
| `error.clipboard` | giữ nguyên | `Could not read the clipboard. Press and hold the box below and choose Paste.` |
| `notice.kept-newer` | giữ nguyên | `The pasted data is older than what is saved, so the app kept the newer copy.` |
| `notice.storage` | giữ nguyên | `Could not save on this device. Data will be lost when the app closes.` |
| `notice.unreadable` | giữ nguyên | `Part of the saved data could not be read. Please paste the game data again.` |
| `notice.needs-tap` | giữ nguyên | `Tap the app once to turn on sound and vibration.` |
| `notice.banner-denied` | giữ nguyên | `The browser is blocking notifications. Allow them in the site settings.` |
| `notice.sound-failed` | giữ nguyên | `Could not play sound. Tap the app, then tap Test.` |
| `notice.boost` | giữ nguyên | `A boost was active at export, so things may finish sooner than shown.` |
| `notice.clock` | giữ nguyên | `This device's clock is behind game time. Set the correct time so the remaining time is accurate.` |
| `groups.home-build` | giữ nguyên | `Home Village · Buildings` |
| `groups.home-hero` | giữ nguyên | `Home Village · Heroes` |
| `groups.lab` | giữ nguyên | `Home Village · Research` |
| `groups.pet` | giữ nguyên | `Home Village · Pets` |
| `groups.builder-build` | giữ nguyên | `Builder Base · Buildings and heroes` |
| `groups.builder-lab` | giữ nguyên | `Builder Base · Research` |
| `groups.helper` | giữ nguyên | `Helpers · Cooldowns` |
| `groups.other` | giữ nguyên | `Other` |

`title`, `disclaimer` và `alerts.testBody` giống nhau ở cả hai bản. Khóa `exportedAt` đổi nghĩa như bảng trên. Bỏ các khóa `voiceCredit`, `alerts.summaryOn`, `alerts.summaryOff`, `notice.all-finished`.

### 4. Âm thanh

```ts
// src/platform/alert-output.ts
export type Sound = 'voice-vi' | 'voice-en' | 'ting';
```

`browserAlertOutput` tải `{baseUrl}sounds/voice.wav`, `{baseUrl}sounds/voice-en.wav`, `{baseUrl}sounds/ting.wav`. `fireAlert` gọi `play(lang === 'vi' ? 'voice-vi' : 'voice-en')`. Bốn kiểu báo và thứ tự báo giữ nguyên như Phần 1.

Thêm `voice-en.wav` vào `public/sounds/` và `includeAssets`. Thêm `public/licenses/lj-speech-voice.txt` ghi rõ file là giọng tổng hợp bằng Piper với giọng `en_US-ljspeech-high`, không phải bản ghi từ bộ dữ liệu, bộ dữ liệu LJ Speech, liên kết `https://keithito.com/LJ-Speech-Dataset/`, phạm vi công cộng. `README.md` ghi lại cách tạo.

### 5. Hình ảnh

Kiểu A, chỉ dùng phông hệ thống, không tải font hay ảnh từ ngoài. Số dùng `tabular-nums`.

| Biến CSS | Giá trị | Dùng cho |
|---|---|---|
| `--bg` | `#0e1116` | Nền trang |
| `--surface` | `#161a21` | Thẻ, danh sách, nút phụ |
| `--line` | `#242a34` | Viền, đường kẻ |
| `--ink` | `#eef1f6` | Chữ chính |
| `--muted` | `#8b95a7` | Chữ phụ |
| `--accent` | `#6cb2ff` | Màu nhấn duy nhất |
| `--on-accent` | `#08111f` | Chữ trên nền nhấn |
| `--warn` | `#f2b84b` | Cảnh báo |
| `--error` | `#ff7a7a` | Lỗi, nút xóa |

`theme-color` trong `index.html`, `theme_color` và `background_color` trong `vite.config.ts` đổi thành `#0e1116`.

Biểu tượng là SVG nội tuyến trong `src/ui/icons.ts`, tạo bằng `createElementNS`, gồm `settings`, `back`, `clipboard`. Không dùng `innerHTML`.

Vùng bấm tối thiểu 44px trên điện thoại, kể cả các nút trông nhỏ. Mọi điều khiển có `focus-visible`. `[hidden]` luôn là `display: none !important`, để các luật bố cục không làm phần tử ẩn hiện lại.

### 6. Màn hình chính

App có hai màn hình, `[data-view="main"]` và `[data-view="settings"]`. Màn hình không hiện có thuộc tính `hidden`.

Thứ tự từ trên xuống:

| Phần tử | Selector | Khi nào hiện |
|---|---|---|
| Tên app và nút cài đặt | `button[data-action="settings"]` có `aria-label` | Luôn |
| Hàng chip tài khoản | `button[data-tag]`, `aria-pressed` | Từ 2 tài khoản |
| Dòng tài khoản | `.account span`, nút dán nhỏ | Có tài khoản |
| Cảnh báo | `[data-notice]` | Như hiện tại |
| Khối xong tiếp theo | `[data-role="next"]`, `.next-count` | Có `nextJob` |
| Khối đã xong | `[data-notice="all-finished"]` | `allFinished` đúng |
| Gợi ý bật thông báo | `[data-role="alerts-nudge"]`, `button[data-action="open-alerts"]` | Xem bên dưới |
| Danh sách theo nhóm | `h2`, `.group-count`, `li[data-ends-at]` | Có hạng mục |
| Ghi chú dữ liệu cũ | `.hint` | Có tài khoản |
| Chân trang | `footer` | Luôn |

Dòng tài khoản gồm tag, `exportedAgo`, và `exportedAt` trong `.export-at`. `.export-at` chỉ hiện từ 900px trở lên. Khi có từ 2 tài khoản thì bỏ tag khỏi dòng này, vì chip đã hiện tag.

**Nút dán.** Chỉ có một `button[data-action="paste"]` tại mỗi thời điểm, và phần tử này được chuyển chỗ khi render:

| Trạng thái | Vị trí | Chữ | Kiểu |
|---|---|---|---|
| Chưa có tài khoản | Dưới hướng dẫn, trong `.controls` | `paste` | Nút lớn màu nhấn |
| Mọi hạng mục đã xong | Trong khối đã xong | `pasteFresh` | Nút lớn màu nhấn |
| Còn lại | Bên phải dòng tài khoản | `pasteSmall`, kèm biểu tượng `clipboard` | Nút nhỏ, viền, chữ màu nhấn |

**Ô dán.** `textarea[name="export"]` chỉ hiện khi chưa có tài khoản, hoặc sau khi đọc clipboard thất bại, và ẩn lại sau lần dán thành công. Khi hiện, nó nằm trong `.controls` ngay dưới phần cảnh báo.

**Gợi ý bật thông báo.** Thay cho việc tự mở bảng thông báo ở Phần 1. Hiện khi tài khoản đầu tiên vừa được thêm mà chưa bật kiểu báo nào; không lưu lại, nên chỉ thấy trong lần mở đó. Biến mất khi mở cài đặt hoặc khi xóa hết tài khoản. Bấm `open-alerts` thì mở cài đặt.

**Đếm ngược.** `tick` cập nhật `.next-count` cùng với các dòng. Khi hạng mục đầu tiên xong, số mục xong thay đổi nên `render` chạy lại và khối chuyển sang hạng mục kế tiếp.

### 7. Màn hình cài đặt

| Phần tử | Selector |
|---|---|
| Nút quay lại | `button[data-action="back"]` có `aria-label` |
| Chọn ngôn ngữ | `input[type="radio"][name="language"]`, `value` là `vi` hoặc `en` |
| Công tắc thông báo | Bốn `input[name="alert-*"]` như Phần 1, vẽ thành công tắc gạt |
| Nút thử | `button[data-action="test-alert"]` |
| Ghi chú giới hạn | `[data-role="alerts-limit"]` |
| Xóa tài khoản đang xem | Một hàng trong khung: mã tag của tài khoản đang xem (`[data-role="account-tag"]`) bên trái, `button[data-action="delete"]` bên phải; chỉ hiện khi có tài khoản |

Nút chọn ngôn ngữ là hai ô `Tiếng Việt` và `English`, ô đang chọn theo ngôn ngữ hiệu lực. Hai nhãn này không dịch. Khi `settings.language` là `null`, ô đúng với ngôn ngữ máy vẫn được chọn, và giá trị lưu vẫn là `null` cho đến khi người dùng bấm.

Thông báo nào do thao tác trong cài đặt gây ra thì phải thấy được ngay tại đó. Vì vậy `storage`, `needs-tap`, `banner-denied`, `sound-failed` hiện trong màn hình đang mở; mỗi cảnh báo chỉ có một phần tử trong DOM.

Xóa tài khoản thì quay về màn hình chính.

**Điều hướng.** Mở cài đặt gọi `history.pushState({ view: 'settings' }, '')`. Sự kiện `popstate` về màn hình chính, nhờ đó nút quay lại của Android đóng cài đặt thay vì thoát app. Nút `back` đóng cài đặt ngay rồi gọi `history.back()` nếu đang có mục cài đặt. Mở app luôn bắt đầu ở màn hình chính, kể cả khi tải lại lúc đang ở cài đặt. Mở màn hình nào thì đưa focus tới nút điều hướng của màn hình đó.

`src/ui/alerts-panel.ts` được thay bằng `src/ui/settings-view.ts`:

```ts
export interface SettingsHandlers {
  onToggle(key: AlertKey, on: boolean): void;
  onLanguage(lang: Language): void;
  onTest(): void;
  onDelete(): void;
  onBack(): void;
}
export interface SettingsView {
  element: HTMLElement;
  notices: HTMLElement;
  update(view: { settings: AlertSettings; lang: Language; accountTag: string | null }): void;
  lockBanner(locked: boolean): void;
  focusBack(): void;
}
export function createSettingsView(handlers: SettingsHandlers): SettingsView;
```

### 8. Máy tính

Từ 900px, `#app` rộng tối đa 1040px. Màn hình chính chia hai cột: cột trái rộng 340px gồm chip, dòng tài khoản, cảnh báo, khối xong tiếp theo, gợi ý, `.controls`, và đứng yên khi cuộn; cột phải là danh sách. Dưới 900px là một cột. Chân trang nằm dưới cả hai cột. Cài đặt rộng tối đa 480px, căn giữa.

### 9. Xử lý lỗi

| Tình huống | Hành vi |
|---|---|
| Dữ liệu cũ có `detail` lạ | Loại tài khoản đó, hiện `unreadable` |
| `language` đã lưu sai | Theo ngôn ngữ máy |
| Lưu ngôn ngữ thất bại | Đổi vẫn có tác dụng, hiện `storage` |
| Thiếu `voice-en.wav` | `play` trả `false`, hiện `sound-failed` |
| Đọc clipboard thất bại | Hiện lỗi, hiện ô dán |

## Tệp thay đổi

| Tệp | Thay đổi |
|---|---|
| `src/core/types.ts`, `parse.ts`, `store.ts` | `JobDetail`, đổi dữ liệu cũ |
| `src/core/language.ts` | Mới |
| `src/core/settings.ts` | Thêm `language`, `anyAlertOn` |
| `src/core/time.ts`, `names.ts`, `alerts.ts` | Nhận `lang`, thêm `formatCountdown`, `jobDetailText`, `nextJob` |
| `src/platform/alert-output.ts` | `Sound` mới |
| `src/ui/copy.ts` | Hai ngôn ngữ |
| `src/ui/icons.ts` | Mới |
| `src/ui/settings-view.ts` | Mới, thay `alerts-panel.ts` |
| `src/ui/app.ts`, `style.css`, `main.ts` | Bố cục mới |
| `index.html`, `vite.config.ts` | Màu, thêm âm thanh và giấy phép |
| `public/sounds/voice-en.wav`, `public/licenses/lj-speech-voice.txt` | Mới |
| `README.md` | Thêm ngôn ngữ, cách tạo giọng tiếng Anh |
| `.gitignore` | Thêm `.superpowers/`, `.playwright-mcp/` |

Làm trên nhánh `feat/language-redesign`.

## Kiểm thử

Test tự động, không thêm dependency:

- `tests/store.test.ts`: đổi bốn dạng chuỗi cũ, chuỗi lạ cho `unreadable`, dữ liệu mới đọc lại nguyên vẹn.
- `tests/parse.test.ts`: `detail` có cấu trúc đúng bốn dạng.
- `tests/settings.test.ts`: `language` hợp lệ, sai, thiếu.
- `tests/language.test.ts`: `vi`, `vi-VN`, `VI`, `en-US`, chuỗi rỗng.
- `tests/time.test.ts`: mỗi hàng trong bảng `formatRemaining` ở cả hai ngôn ngữ, `formatCountdown` tại biên 24 giờ, `formatEnd` có thứ tự đúng.
- `tests/alerts.test.ts`: văn bản hai ngôn ngữ, `nextJob` bỏ `helper`, bỏ mục đã xong, trả `null` khi không còn.
- `tests/app.test.ts`:
  - Đổi ngôn ngữ thì mọi chữ đổi ngay, kể cả dữ liệu đã dán, và không còn chữ tiếng Việt khi chọn `en`.
  - `language` là `null` thì theo `deviceLanguage`; chọn rồi thì lưu và khôi phục.
  - Báo dùng đúng giọng và đúng văn bản theo ngôn ngữ lúc báo.
  - Chỉ có một nút dán, đúng vị trí và chữ theo từng trạng thái.
  - Ô dán ẩn hiện đúng các trường hợp.
  - Khối xong tiếp theo chọn đúng mục, chạy từng giây, chuyển mục khi xong.
  - Gợi ý bật thông báo hiện và biến mất đúng lúc.
  - Mở, đóng cài đặt bằng nút và bằng `popstate`; cảnh báo hiện trong cài đặt.
- `tests/sounds.test.ts`: thêm `voice-en`.

Kiểm chứng bằng Playwright trên bản build production dưới `/coc_notification/`, ở khổ 390×844 có giả lập điện thoại và 1280×800, cả `vi` và `en`, cho từng trạng thái: lần đầu mở, có dữ liệu, nhiều tài khoản, mọi hạng mục đã xong, cài đặt, đọc clipboard thất bại.

- Không có thanh cuộn ngang.
- Mọi nút và công tắc có vùng bấm từ 44px trở lên.
- Không chữ nào bị cắt hay chồng nhau, xem qua ảnh chụp.
- Tương phản chữ chính và chữ phụ trên nền từ 4,5:1 trở lên.
- Không có lỗi console và không có request ra ngoài.
- Chạm thật lần đầu vào nút dán nhỏ khi đang có `needs-tap` vẫn tới đúng nút.
- Bấm quay lại của trình duyệt ở cài đặt thì về màn hình chính.

Sau đó chạy lại toàn bộ `part1-check` và `browser-check` đã cập nhật selector, rồi kiểm tra lại trên link thật sau khi đăng. Các script này nằm ở scratchpad, không commit.

Người dùng kiểm tra trên Android thật: giao diện, đổi ngôn ngữ, giọng tiếng Anh, nút quay lại ở cài đặt.
