# Hai ngôn ngữ và giao diện mới: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** App hiện ngay hạng mục xong tiếp theo, đổi được giữa tiếng Việt và tiếng Anh ngay lập tức, nút dán không chiếm chỗ khi không cần, và giao diện theo kiểu A đã duyệt.

**Architecture:** `Job.detail` thành dữ liệu có cấu trúc để chữ được dựng lúc hiển thị. Hàm định dạng và `copy` nhận `Language`. App có hai màn hình trong cùng một trang, chính và cài đặt, nối với lịch sử trình duyệt để nút quay lại của Android hoạt động đúng.

**Tech Stack:** TypeScript 7, Vite 8, Vitest 5 + jsdom 31, vite-plugin-pwa 2. Không thêm dependency. Playwright chỉ dùng qua công cụ của controller, không nằm trong dự án.

**Spec:** `docs/superpowers/specs/2026-11-06-language-and-redesign-design.md`, mẫu `docs/superpowers/specs/2026-11-06-language-and-redesign-mock.html`. Văn bản, selector và màu lấy đúng từ spec, plan không chép lại.

## Global Constraints

- Không thêm gói nào vào `package.json`.
- Không có request mạng nào ngoài tải chính app. Không font hay ảnh từ ngoài. Dòng `privacy` giữ nguyên ý.
- Không dùng `innerHTML`; văn bản giao diện nằm trong `src/ui/copy.ts` và đi qua `textContent`. Biểu tượng tạo bằng `createElementNS`.
- `src/ui/app.ts` chỉ dùng `AlertOutput` và `KeyValueStore`, không gọi trực tiếp `Audio`, `Notification`, `navigator.vibrate` hay `indexedDB`.
- Giữ nguyên: `STORAGE_KEY`, `SETTINGS_KEY`, cơ sở dữ liệu IndexedDB, nhóm không báo `helper`, thứ tự báo banner, rung, ting, giọng nói.
- `needs-tap` chỉ kiểm tra lại ở `click` và `keydown`, chỉ gỡ riêng phần tử cảnh báo. Đừng đổi lại: lý do nằm trong spec Phần 1 mục 6.
- `public/sounds/voice.wav` và `public/sounds/ting.wav` không được đổi.
- Không commit `api_format.md`. Fixture test dùng tag giả `#TEST123`.
- Mọi commit kết thúc bằng dòng `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Làm trên nhánh `feat/language-redesign`, thư mục `C:\learnspaces\coc_notification`. Không push, không merge.
- Nếu PATH chưa có Node: PowerShell chạy `$env:Path += ";C:\Program Files\nodejs"`, Bash chạy `export PATH="$PATH:/c/Program Files/nodejs"`.
- Build với `BASE_PATH` phải chạy bằng PowerShell.

## Review Focus

Năm tình huống spec không nói rõ nhưng dễ gặp nhất, mỗi tình huống có test ở task phụ trách:

1. Đọc dữ liệu cũ, dán thêm tài khoản, đóng rồi mở lại: mọi tài khoản vẫn đọc được và lưu ở dạng mới (Task 1).
2. Đổi ngôn ngữ trong lúc tiếng ting đang phát: giọng nói của lần báo đó vẫn theo ngôn ngữ lúc bắt đầu báo, lần sau mới đổi (code ở Task 3, test ở Task 4, vì Task 4 mới có nút chọn ngôn ngữ).
3. Tải lại trang khi đang ở Cài đặt rồi bấm quay lại: app ở màn hình chính, không lỗi (Task 4).
4. Bấm nút quay lại trong app, sau đó sự kiện `popstate` của chính lần đó tới: không đóng hai lần, không mở lại (Task 4).
5. Xóa tài khoản cuối cùng trong Cài đặt: về màn hình lần đầu, chỉ một nút dán, ô dán hiện, không còn gợi ý (Task 5).

---

## Cấu trúc file

| File | Trách nhiệm |
|---|---|
| `src/core/language.ts` | `Language`, `deviceLanguage` |
| `src/core/types.ts`, `parse.ts`, `store.ts` | `JobDetail`, đổi dữ liệu cũ |
| `src/core/names.ts`, `time.ts`, `alerts.ts` | Dựng chữ theo ngôn ngữ, `nextJob` |
| `src/core/settings.ts` | `Settings`, `anyAlertOn` |
| `src/ui/copy.ts` | Văn bản hai ngôn ngữ |
| `src/ui/icons.ts` | Ba biểu tượng SVG |
| `src/ui/settings-view.ts` | Màn hình cài đặt, thay `alerts-panel.ts` |
| `src/ui/job-view.ts` | Dựng danh sách nhóm và khối xong tiếp theo |
| `src/ui/app.ts` | Trạng thái, điều hướng, báo, render màn hình chính |
| `src/ui/style.css` | Giao diện theo mẫu |

`src/ui/job-view.ts` là file spec chưa liệt kê; tách ra để `app.ts` không ôm thêm phần dựng danh sách và khối chính.

---

### Task 1: Dữ liệu hạng mục có cấu trúc

**Files:**
- Create: `src/core/language.ts`
- Modify: `src/core/types.ts`, `src/core/parse.ts`, `src/core/store.ts`, `src/core/names.ts`, `src/core/alerts.ts`, `src/ui/app.ts`
- Test: `tests/parse.test.ts`, `tests/store.test.ts`, `tests/alerts.test.ts`, `tests/app.test.ts`, `tests/names.test.ts` nếu đã có, nếu chưa thì tạo

**Interfaces:**
- Produces: `Language` trong `src/core/language.ts`; `JobDetail` đúng spec mục 1; `jobDetailText(detail: JobDetail, lang: Language): string` trong `src/core/names.ts`.
- Task này mọi nơi dùng `detail` gọi `jobDetailText(job.detail, 'vi')`. Task 2 thay `'vi'` bằng ngôn ngữ thật.

- [ ] **Step 1: Viết test và cho thấy chúng fail**

`tests/parse.test.ts`: đổi kỳ vọng `detail` sang cấu trúc mới. `weapon: 1` với `lvl: 16` cho `{ kind: 'weapon', level: 16, weapon: 1 }`. Thêm: `weapon: 'x'` cho `{ kind: 'upgrade', level: 16 }`.

`tests/store.test.ts`, thêm:

```ts
const oldVillage = (detail: unknown) => JSON.stringify({ villages: { '#A': {
  tag: '#A', exportedAt: 1, hasBoosts: false,
  jobs: [{ id: 1, group: 'home-build', detail, endsAt: 9 }],
} }, activeTag: '#A' });

test.each<[string, JobDetail]>([
  ['Cấp 6 → 7', { kind: 'upgrade', level: 6 }],
  ['Cấp 3 · Vũ khí 2', { kind: 'weapon', level: 3, weapon: 2 }],
  ['Xây mới', { kind: 'build' }],
  ['Hồi chiêu', { kind: 'cooldown' }],
])('old detail %s is converted', async (raw, detail) => {
  const { state, unreadable } = await loadState(memoryStore({ [STORAGE_KEY]: oldVillage(raw) }));
  expect(state.villages['#A'].jobs[0].detail).toEqual(detail);
  expect(unreadable).toBe(false);
});

test.each([['Cấp ba'], [''], [5], [null], [{ kind: 'nope' }], [{ kind: 'upgrade' }]])(
  'an unknown detail %j drops that account', async (raw) => {
    const { state, unreadable } = await loadState(memoryStore({ [STORAGE_KEY]: oldVillage(raw) }));
    expect(state.villages).toEqual({});
    expect(unreadable).toBe(true);
  });

test('new details read back unchanged', async () => {
  const detail: JobDetail = { kind: 'weapon', level: 3, weapon: 2 };
  const s = memoryStore({ [STORAGE_KEY]: oldVillage(detail) });
  expect((await loadState(s)).state.villages['#A'].jobs[0].detail).toEqual(detail);
});

test('old data saves in the new form alongside a new account', async () => {
  const s = memoryStore({ [STORAGE_KEY]: oldVillage('Cấp 6 → 7') });
  const { state } = await loadState(s);
  await saveState(s, upsertVillage(state, v('#B', 2)).state);
  const again = await loadState(s);
  expect(Object.keys(again.state.villages).sort()).toEqual(['#A', '#B']);
  expect(again.state.villages['#A'].jobs[0].detail).toEqual({ kind: 'upgrade', level: 6 });
  expect(await s.get(STORAGE_KEY)).not.toContain('Cấp');
  expect(again.unreadable).toBe(false);
});
```

`jobDetailText`, mỗi hàng trong bảng spec mục 2 ở cả hai ngôn ngữ. `tests/alerts.test.ts`: helper `job` dùng `detail: { kind: 'upgrade', level: 6 }`, assertion giữ nguyên.

Run: `npm test`
Expected: FAIL.

- [ ] **Step 2: Implement**

`parseState` dùng hàm riêng `toDetail(value: unknown): JobDetail | null`, nhận cả dạng mới và bốn dạng chuỗi cũ, phần tử `jobs` không phải object cũng làm tài khoản bị loại. Regex cho dạng cũ: `/^Cấp (\d+) → \d+$/`, `/^Cấp (\d+) · Vũ khí (\d+)$/`.

- [ ] **Step 3: Chạy test**

Run: `npm test; npm run check`
Expected: mọi test PASS, `tsc` không lỗi.

- [ ] **Step 4: Commit**

```bash
git add src tests
git commit -m "feat: store job details as data, converting saved text"
```

---

### Task 2: Hai ngôn ngữ trong core và văn bản

**Files:**
- Modify: `src/core/language.ts`, `src/core/settings.ts`, `src/core/time.ts`, `src/core/alerts.ts`, `src/ui/copy.ts`, `src/ui/app.ts`, `src/ui/alerts-panel.ts`, `src/main.ts`
- Test: `tests/language.test.ts` (mới), `tests/settings.test.ts`, `tests/time.test.ts`, `tests/alerts.test.ts`, `tests/app.test.ts`

**Interfaces:**
- Consumes: `Language`, `jobDetailText` (Task 1).
- Produces: `deviceLanguage`, `Settings`, `DEFAULT_SETTINGS`, `anyAlertOn`, `formatRemaining`, `formatCountdown`, `formatEnd`, `formatAgo`, `alertMessage`, `nextJob`, `copy: Record<Language, Copy>`, `AppDeps.deviceLanguage`, đúng chữ ký spec mục 2, 3.
- Trong `app.ts`: `language(): Language` trả `settings.language ?? deps.deviceLanguage`, và `text()` trả `copy[language()]`. `createAlertsPanel(handlers, text: Copy)`; file này bị thay ở Task 4.

- [ ] **Step 1: Viết test và cho thấy chúng fail**

`tests/language.test.ts`: `test.each([['vi','vi'],['vi-VN','vi'],['VI','vi'],['en-US','en'],['','en'],['fr','en']])`.

`tests/settings.test.ts`: `language` mặc định `null`; `'en'` đọc lại đúng; `'de'` và `5` cho `null`; `anyAlertOn` đúng khi có công tắc bật, sai khi chỉ có `language`.

`tests/time.test.ts`: mỗi hàng bảng `formatRemaining` ở cả hai ngôn ngữ. Các giá trị cũ đổi theo: `formatRemaining(90061,'vi')` là `1 ngày 1 giờ`, `formatRemaining(3661,'vi')` là `1 giờ 1 phút`. Thêm:

```ts
test.each([
  [35992, '9:59:52'], [303, '0:05:03'], [86399, '23:59:59'], [86400, '1 ngày 0 giờ'], [0, 'Đã xong'],
])('countdown %i', (seconds, text) => expect(formatCountdown(seconds, 'vi')).toBe(text));

test('end time keeps the same order in both languages', () => {
  expect(formatEnd(T + 54759, 'vi', 'Asia/Ho_Chi_Minh')).toBe('14:24 Thứ 6, 06/11');
  expect(formatEnd(T + 54759, 'en', 'Asia/Ho_Chi_Minh')).toBe('14:24 Fri, 06/11');
});
```

`tests/alerts.test.ts`: `alertMessage` bản `en` đúng spec. `nextJob`: chọn mục sớm nhất, bỏ `helper`, bỏ mục đã xong, trả `null` khi không còn.

`tests/app.test.ts`: `setup` nhận thêm `deviceLanguage?: Language`, mặc định `'vi'`, và kiểu `settings?: Settings`. Thêm:

```ts
const VIETNAMESE = /[ăâđêôơưàáạảãèéẹẻẽìíịỉĩòóọỏõùúụủũỳýỵỷỹ]/i;

test('english mode shows no Vietnamese, pasted data included', async () => {
  const root = await pasted((T + 807) * 1000, { deviceLanguage: 'en' });
  expect(root.textContent).not.toMatch(VIETNAMESE);
  expect(document.documentElement.lang).toBe('en');
  expect(row(root, 'Workshop').querySelector('.job-detail')!.textContent).toBe('Level 6 → 7');
});

test('a saved language wins over the device', async () => {
  const root = await setup(T * 1000, { deviceLanguage: 'en', settings: { ...DEFAULT_SETTINGS, language: 'vi' } });
  expect(root.textContent).toContain('Dữ liệu chỉ lưu trên máy này');
  expect(document.documentElement.lang).toBe('vi');
});

test('a finished job alerts in the current language', async () => {
  const output = fakeOutput();
  await pasted((T + 54757) * 1000, { output, deviceLanguage: 'en', settings: on({ banner: true }) });
  await vi.advanceTimersByTimeAsync(5000);
  expect(output.calls).toEqual(['banner:Workshop finished']);
});
```

Run: `npm test`
Expected: FAIL.

- [ ] **Step 2: Implement**

`copy.ts`: toàn bộ bảng spec mục 3, khóa nào "giữ nguyên" thì lấy câu hiện có. `Copy` là `typeof vi`. Tạm giữ các khóa `voiceCredit`, `alerts.summaryOn`, `alerts.summaryOff`, `notice.all-finished` để app chạy được, với bản `en`: `Voice: Piper, VAIS-1000 data (CC BY).`, `Alerts · On`, `Alerts · Off`, `Everything has finished. Paste new data to update.` Các task sau bỏ chúng. `exportedAt` tạm dùng `{time} ({ago})`: `vi` là `Xuất lúc {time} ({ago})`, `en` là `Exported {time} ({ago})`; Task 5 đổi theo spec.

`Object.values(settings).some(Boolean)` trong `app.ts` đổi thành `anyAlertOn(settings)`, vì `language` là chuỗi. `render` đặt `document.documentElement.lang`. `main.ts` truyền `deviceLanguage(navigator.language)`. Dùng `formatRemaining` cho `.job-remaining`.

- [ ] **Step 3: Chạy test**

Run: `npm test; npm run check; npm run build`
Expected: mọi test PASS, `tsc` và build không lỗi.

- [ ] **Step 4: Commit**

```bash
git add src tests
git commit -m "feat: add Vietnamese and English text throughout the app"
```

---

### Task 3: Giọng tiếng Anh

**Files:**
- Create: `public/sounds/voice-en.wav`, `public/licenses/lj-speech-voice.txt`
- Modify: `src/platform/alert-output.ts`, `src/ui/app.ts`, `src/ui/copy.ts`, `vite.config.ts`, `README.md`, `.gitignore`, `tests/helpers.ts`
- Test: `tests/alert-output.test.ts`, `tests/sounds.test.ts`, `tests/app.test.ts`

**Interfaces:**
- Consumes: `language()` (Task 2).
- Produces: `Sound = 'voice-vi' | 'voice-en' | 'ting'`. `fakeOutput.calls` ghi đúng tên `Sound`.

- [ ] **Step 1: Chép file giọng đã duyệt**

Chép nguyên file `voice-en.wav` theo đường dẫn controller đưa lúc giao việc thành `public/sounds/voice-en.wav`. Đây là đúng file người dùng đã nghe và duyệt, không tạo lại.

- [ ] **Step 2: Viết test và cho thấy chúng fail**

`tests/sounds.test.ts`: thêm `voice-en` vào bảng. `tests/alert-output.test.ts`: `makeAudio` nhận cả ba đường dẫn; `play('voice-en')` phát đúng phần tử.

`tests/app.test.ts`: các kỳ vọng `'voice'` đổi thành `'voice-vi'`. Thêm:

```ts
test('the voice follows the language', async () => {
  const output = fakeOutput();
  await pasted((T + 54757) * 1000, { output, deviceLanguage: 'en', settings: on({ voice: true }) });
  await vi.advanceTimersByTimeAsync(5000);
  expect(output.calls).toEqual(['voice-en']);
});

test('the footer credits both voices', async () => {
  const root = await setup(T * 1000);
  expect(root.querySelector('footer a[href="licenses/vais1000-voice.txt"]')).not.toBeNull();
  expect(root.querySelector('footer a[href="licenses/lj-speech-voice.txt"]')).not.toBeNull();
});
```

Run: `npm test -- alert-output sounds app`
Expected: FAIL.

- [ ] **Step 3: Implement**

`fireAlert` đọc `const lang = language()` một lần ở đầu hàm, và dùng cho cả giọng nói. Thêm `sounds/voice-en.wav` và `licenses/lj-speech-voice.txt` vào `includeAssets`. Viết file giấy phép theo spec mục 4. Footer dùng `voiceCreditVi`, `voiceCreditEn`, mỗi dòng một liên kết tương đối; bỏ khóa `voiceCredit`. `README.md`: mục Thông báo thêm cách tạo `voice-en.wav`, mục mới về ngôn ngữ. `.gitignore`: thêm `.superpowers/` và `.playwright-mcp/`.

- [ ] **Step 4: Chạy test**

Run: `npm test; npm run check; npm run build`
Expected: mọi test PASS, `dist/sounds/` có đủ ba file, `dist/sw.js` có `voice-en`.

- [ ] **Step 5: Commit**

```bash
git add public src tests vite.config.ts README.md .gitignore
git commit -m "feat: add the English voice"
```

---

### Task 4: Màn hình cài đặt

**Files:**
- Create: `src/ui/settings-view.ts`, `src/ui/icons.ts`
- Delete: `src/ui/alerts-panel.ts`
- Modify: `src/ui/app.ts`, `src/ui/copy.ts`
- Test: `tests/app.test.ts`

**Interfaces:**
- Consumes: `Settings`, `Language`, `anyAlertOn` (Task 2).
- Produces: `SettingsHandlers`, `SettingsView`, `createSettingsView` đúng spec mục 7; `AlertKey` chuyển sang `src/ui/settings-view.ts`; `icon(name: 'settings' | 'back' | 'clipboard'): SVGSVGElement` trong `src/ui/icons.ts`.
- `app.ts` có `view: 'main' | 'settings'`, `openSettings()`, `closeSettings()`. Đoạn gốc của app có hai phần tử `[data-view="main"]` và `[data-view="settings"]`.

- [ ] **Step 1: Viết test và cho thấy chúng fail**

Bỏ test `the summary follows the switches`, `details opens after the first paste only`, helper `summary`. Test `permission revoked since last time shows as off` chỉ giữ assertion ô không tích. Test `english mode shows no Vietnamese` xét `[data-view="main"]`, vì nhãn `Tiếng Việt` không dịch. 

Thêm:

```ts
const screen = (root: HTMLElement) => root.querySelector('[data-view]:not([hidden])')!.getAttribute('data-view');
const openSettings = (root: HTMLElement) => click(root, 'button[data-action="settings"]');

test('settings opens and closes with its buttons, and focus follows', async () => {
  const root = await setup(T * 1000);
  expect(screen(root)).toBe('main');
  openSettings(root);
  expect(screen(root)).toBe('settings');
  expect(document.activeElement).toBe(root.querySelector('button[data-action="back"]'));
  click(root, 'button[data-action="back"]');
  expect(screen(root)).toBe('main');
  expect(document.activeElement).toBe(root.querySelector('button[data-action="settings"]'));
});

test('the system back button closes settings', async () => {
  const root = await setup(T * 1000);
  openSettings(root);
  window.dispatchEvent(new PopStateEvent('popstate'));
  expect(screen(root)).toBe('main');
});

test('the popstate after the in-app back button changes nothing', async () => {
  const root = await setup(T * 1000);
  openSettings(root);
  click(root, 'button[data-action="back"]');
  window.dispatchEvent(new PopStateEvent('popstate'));
  expect(screen(root)).toBe('main');
  openSettings(root);
  expect(screen(root)).toBe('settings');
});

test('reloading inside settings starts on the main screen', async () => {
  history.replaceState({ view: 'settings' }, '');
  const root = await setup(T * 1000);
  expect(screen(root)).toBe('main');
  window.dispatchEvent(new PopStateEvent('popstate'));
  expect(screen(root)).toBe('main');
  history.replaceState(null, '');
});

test('picking a language applies at once and is saved', async () => {
  const root = await pasted((T + 807) * 1000);
  click(root, 'input[name="language"][value="en"]');
  expect(root.querySelector('[data-view="main"]')!.textContent).not.toMatch(VIETNAMESE);
  expect(document.documentElement.lang).toBe('en');
  await flush();
  expect((await loadSettings(store)).language).toBe('en');
});

test('the language follows the device until one is picked', async () => {
  const root = await setup(T * 1000, { deviceLanguage: 'en' });
  expect(input2(root, 'en').checked).toBe(true);
  await flush();
  expect((await loadSettings(store)).language).toBeNull();
});
```

```ts
test('a language change during the ting leaves that alert in its own language', async () => {
  let release!: (ok: boolean) => void;
  const played: string[] = [];
  const output = fakeOutput({ play: (sound) => {
    played.push(sound);
    return sound === 'ting' ? new Promise((r) => { release = r; }) : Promise.resolve(true);
  } });
  const root = await pasted((T + 54757) * 1000, { output, settings: on({ ting: true, voice: true }) });
  await vi.advanceTimersByTimeAsync(5000);
  click(root, 'input[name="language"][value="en"]');
  release(true);
  await flush();
  expect(played).toEqual(['ting', 'voice-vi']);
});
```

`input2(root, value)` trả `input[name="language"][value=...]`. Các test còn lại, mỗi dòng một test:

| Test | Thiết lập | Assertion |
|---|---|---|
| `a refused permission shows its notice on the settings screen` | Mở cài đặt, `requestBannerPermission` trả `denied`, bấm `alert-banner` | `[data-view="settings"]` chứa `banner-denied`, toàn app chỉ có 1 phần tử này |
| `a sound failure on the test button shows on the settings screen` | Mở cài đặt, bật `ting`, `play` trả `false`, bấm thử | `[data-view="settings"]` chứa `sound-failed` |
| `alert notices move back to the main screen` | Tiếp test trên, bấm `back` | `[data-view="main"]` chứa `sound-failed`, chỉ 1 phần tử |
| `a failed language save warns and still applies` | Store `failWrites`, chọn `en` | Có `storage`, `lang` là `en` |
| `delete sits on the settings screen, only with an account` | Chưa có rồi có tài khoản | Không có, rồi có `button[data-action="delete"]` trong `[data-view="settings"]` |
| `deleting returns to the main screen` | Mở cài đặt, bấm xóa | `screen` là `main` |

Run: `npm test -- app`
Expected: FAIL.

- [ ] **Step 2: Implement `src/ui/icons.ts` và `src/ui/settings-view.ts`**

Ba biểu tượng lấy `path` từ file mẫu. `button[data-action="settings"]` dùng biểu tượng hai thanh trượt trong mẫu. `update` đặt mọi chữ theo `lang`, nên dùng được khi đổi ngôn ngữ. Công tắc vẫn là `input type="checkbox"`, ô ngôn ngữ là `input type="radio"` trong `label`.

- [ ] **Step 3: Nối vào `src/ui/app.ts`**

- Nút `settings` nằm ở phần đầu màn hình chính, cạnh tên app.
- `openSettings`: đặt `view`, `history.pushState({ view: 'settings' }, '')`, ghi cờ `settingsEntry = true`, render, `focusBack`.
- `closeSettings`: chỉ chạy khi `view` là `settings`. Nút `back` gọi nó rồi `history.back()` nếu `settingsEntry`; `popstate` chỉ gọi nó. Đặt `settingsEntry = false`. Gỡ listener `popstate` khi unmount.
- `alertNotices()` tạo `storage`, `needs-tap`, `banner-denied`, `sound-failed`; `render` đưa chúng vào `top` hoặc `settingsView.notices` theo `view`, chỗ còn lại để trống. `recheckActivation` tìm trong cả `root`.
- `onLanguage`: lưu `settings`, `render`.
- `onDelete`: `removeVillage`, `persist`, `closeSettings`.
- Bỏ `panel.open()`. Task 5 thêm gợi ý.

- [ ] **Step 4: Chạy test**

Run: `npm test; npm run check; npm run build`
Expected: mọi test PASS, `tsc` và build không lỗi.

- [ ] **Step 5: Commit**

```bash
git add src tests
git commit -m "feat: add a settings screen with language choice"
```

---

### Task 5: Màn hình chính và giao diện mới

**Files:**
- Create: `src/ui/job-view.ts`
- Modify: `src/ui/app.ts`, `src/ui/copy.ts`, `src/ui/style.css`, `src/ui/settings-view.ts`, `index.html`, `vite.config.ts`
- Test: `tests/app.test.ts`

**Interfaces:**
- Consumes: `nextJob`, `allFinished`, `formatCountdown` (Task 2); `icon` (Task 4).
- Produces (`src/ui/job-view.ts`): `jobList(village: Village, nowMs: number, lang: Language, text: Copy): { nodes: HTMLElement[]; finished: number }`, `nextCard(job: Job, nowMs: number, lang: Language, text: Copy): HTMLElement`.

- [ ] **Step 1: Viết test và cho thấy chúng fail**

Sửa các test cũ theo chữ mới của spec. Test `all-finished` vẫn dùng selector cũ. Test `ticking leaves the account line untouched` vẫn giữ. Thêm helper `pasteButtons(root)` trả mọi `button[data-action="paste"]`. Thêm:

| Test | Thiết lập | Assertion |
|---|---|---|
| `one big paste button before any data` | Lần đầu mở | 1 nút, nằm trong `.controls`, chữ `Dán dữ liệu`, có class `primary` |
| `a small paste button beside the data age` | Dán xong | 1 nút, nằm trong `.account`, chữ `Dán mới`, có `svg`, không có class `primary` |
| `a big paste button when everything finished` | Chỉ một mục, qua mốc | 1 nút, nằm trong thẻ `[data-notice="all-finished"]`, chữ `Dán dữ liệu mới`, có class `primary` |
| `the paste box shows only when needed` | Lần đầu; dán xong; clipboard lỗi; dán tay thành công | `box.hidden` là `false`, `true`, `false`, `true` |
| `the next card picks the soonest job and ticks` | Dán tại `T + 807` | `.next-count` đúng `formatCountdown`, sau 1 giây giảm 1 giây, có tên `Baby Dragon` |
| `the next card skips helpers` | Chỉ một công trình và trợ thủ xong sớm hơn | Khối hiện công trình |
| `the next card moves on when a job finishes` | Hai mục, chạy qua mốc mục đầu | Khối hiện mục sau |
| `the next card follows the account tabs` | Hai tài khoản, đổi chip | Khối đổi theo |
| `no next card with only helpers or no jobs` | Hai trường hợp | Không có `[data-role="next"]`, không có `all-finished` |
| `the nudge shows after the first paste with alerts off` | Dán lần đầu | Có `alerts-nudge` |
| `the nudge opens settings and goes away` | Bấm `open-alerts`, rồi `back` | `screen` là `settings`, sau đó không còn gợi ý |
| `no nudge once an alert is on, or on the second paste, or after reopening` | Ba trường hợp | Không có `alerts-nudge` |
| `deleting the last account returns to the first screen` | Dán, mở cài đặt, xóa | `[data-role="help"]` có, 1 nút dán lớn, ô dán hiện, không có gợi ý |
| `the account line drops the tag with two accounts` | Hai tài khoản | `.account span` không chứa tag |
| `group counts` | Dán mẫu | `.group-count` đầu tiên là `6`, `h2` đầu vẫn đúng tên nhóm |
| `the export time is in place` | Dán | `.export-at` chứa `lúc ` |

Run: `npm test -- app`
Expected: FAIL.

- [ ] **Step 2: Dựng màn hình chính**

- Màn hình chính gồm phần đầu, `.side` và `.content`. `.side` chứa chip, `.account`, cảnh báo, khối chính, gợi ý, `.controls`. `.content` chứa danh sách và `.hint`.
- `paste` là một phần tử duy nhất. `render` đặt chữ, class `primary` và chuyển nó vào đúng vị trí trước khi `replaceChildren`, để không làm mất listener.
- `.next-count` có `data-ends-at-next` cho `tick`. `tick` không đếm phần tử này khi tính `finished`, vì `li[data-ends-at]` là selector riêng.
- Bỏ khóa `notice.all-finished`, `alerts.summaryOn`, `alerts.summaryOff`. Đổi `exportedAt` theo spec mục 3.

- [ ] **Step 3: Viết `style.css` và màu chung**

Theo spec mục 5, 8 và file mẫu. Hai cột dùng `@media (min-width: 900px)`, `.side` là `position: sticky`. Công tắc dùng `appearance: none`, vùng bấm là cả `label`. Radio ngôn ngữ ẩn bằng cách vẫn nhận focus được, không dùng `display: none`. Không tạo thanh cuộn ngang ở 390px.

`index.html` và `vite.config.ts`: đổi `#14171f` thành `#0e1116`.

- [ ] **Step 4: Chạy test**

Run: `npm test; npm run check; npm run build`
Expected: mọi test PASS, `tsc` và build không lỗi.

- [ ] **Step 5: Commit**

```bash
git add src tests index.html vite.config.ts
git commit -m "feat: rebuild the main screen around the next finish"
```

---

### Task 6: Kiểm chứng bằng Playwright và bàn giao

Task này do controller chạy, không giao implementer. Không tạo file trong dự án; ảnh chụp nằm ở `.playwright-mcp/`, đã bị bỏ qua khỏi git.

- [ ] **Step 1: Build và phục vụ dưới đường dẫn con**

Run (PowerShell): `$env:BASE_PATH = "/coc_notification/"; npm run build`

Phục vụ `dist` dưới `/coc_notification/` bằng server tĩnh trong scratchpad, cùng dữ liệu `tests/fixtures/export.sample.json`.

- [ ] **Step 2: Kiểm chứng bằng Playwright**

Ở khổ 390×844 có giả lập điện thoại và 1280×800, với `vi` và `en`, cho từng trạng thái: lần đầu mở, có dữ liệu, nhiều tài khoản, mọi hạng mục đã xong, cài đặt, đọc clipboard thất bại.

Expected, tất cả đều đạt:
- Không có thanh cuộn ngang.
- Mọi nút và công tắc có vùng bấm từ 44px trở lên.
- Ảnh chụp khớp mẫu, không chữ nào bị cắt hay chồng nhau.
- Tương phản chữ chính và chữ phụ trên nền từ 4,5:1 trở lên.
- Không có lỗi console và không có request ra ngoài.
- Bấm quay lại của trình duyệt ở cài đặt thì về màn hình chính.

- [ ] **Step 3: Chạy lại toàn bộ**

Cập nhật selector trong `part1-check.mjs` và `browser-check.mjs` ở scratchpad theo màn hình cài đặt mới, thêm kiểm tra giọng `voice-en.wav` phát tới `ended` và tải được khi tắt server. Chạy cả hai, cùng `reopen-check.mjs`. Trong `part1-check` có phép chạm thật lần đầu vào nút dán khi đang có `needs-tap`.

Run: `npm test`, thêm `TZ=UTC npm test` trong Bash.
Expected: mọi phép kiểm tra đạt.

- [ ] **Step 4: Người dùng duyệt rồi mới phát hành**

Dừng lại, báo kết quả và ảnh chụp. Merge vào `main` và push chỉ làm khi người dùng xác nhận. Sau khi đăng, chạy lại `live-check.mjs` ở scratchpad trên link thật. Người dùng thử trên Android: giao diện, đổi ngôn ngữ, giọng tiếng Anh, nút quay lại ở cài đặt.
