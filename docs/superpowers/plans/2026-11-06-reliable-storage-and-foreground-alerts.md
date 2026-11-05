# Lưu bền và báo khi app đang mở: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dữ liệu đã dán không còn mất khi app bị tắt đột ngột, app tự nhắc dán lại khi phát hiện được, và mỗi người chọn được kiểu báo (giọng nói, ting, rung, thông báo) khi app đang mở.

**Architecture:** Đổi lưu trữ sang giao diện `KeyValueStore` bất đồng bộ, chạy trên IndexedDB. Logic báo là hàm thuần trong `src/core/alerts.ts`, không cần danh sách đã báo. Tín hiệu đi qua giao diện `AlertOutput`, nên test dùng bản giả và Phần 2 thay được bằng bản Android.

**Tech Stack:** TypeScript 7, Vite 8, Vitest 5 + jsdom 31, vite-plugin-pwa 2. Không thêm dependency. Piper chỉ dùng một lần để tạo file giọng, không nằm trong dự án.

**Spec:** `docs/superpowers/specs/2026-11-06-reliable-storage-and-foreground-alerts-design.md`. Văn bản giao diện và selector lấy đúng từ spec, plan không chép lại.

## Global Constraints

- Không thêm gói nào vào `package.json`, chỉ được thêm script `ting`.
- Không có request mạng nào ngoài tải chính app. Dòng `Dữ liệu chỉ lưu trên máy này, không gửi đi đâu.` giữ nguyên.
- Không dùng `innerHTML`; văn bản giao diện nằm trong `src/ui/copy.ts` và đi qua `textContent`. Văn bản của `alertMessage` nằm cùng hàm đó, giống `detail` trong `src/core/parse.ts`.
- `src/ui/app.ts` chỉ dùng `AlertOutput` và `KeyValueStore`, không gọi trực tiếp `Audio`, `Notification`, `navigator.vibrate` hay `indexedDB`.
- Hằng số: `STORAGE_KEY = 'village-timer:v1'`, `SETTINGS_KEY = 'village-timer:settings:v1'`, cơ sở dữ liệu `village-timer`, phiên bản `1`, object store `kv`. Nhóm không báo: `helper`.
- Không commit `api_format.md`. Fixture test dùng tag giả `#TEST123`.
- Mọi commit kết thúc bằng dòng `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Làm trên nhánh `feat/village-timer`, thư mục `C:\learnspaces\coc_notification`. Không push, không merge.
- Nếu PATH chưa có Node: PowerShell chạy `$env:Path += ";C:\Program Files\nodejs"`, Bash chạy `export PATH="$PATH:/c/Program Files/nodejs"`.
- Build với `BASE_PATH` phải chạy bằng PowerShell. Git Bash tự đổi `/coc_notification/` thành đường dẫn Windows.

## Review Focus

Năm tình huống spec không nói rõ nhưng dễ gặp nhất, mỗi tình huống có test ở task phụ trách:

1. Trang bị tạm dừng lâu rồi chạy lại: mọi mục xong trong lúc đó gộp thành đúng một lần báo, tick sau không báo lại (Task 4).
2. Xóa tài khoản rồi tới giờ hạng mục của nó xong: không báo (Task 4).
3. Đã bật thông báo rồi thu hồi quyền trong trình duyệt: mở lại app, công tắc hiện tắt, không hiện đang bật mà không báo được (Task 4).
4. Âm thanh không bao giờ phát xong, ví dụ mất audio focus: sau 10 giây bỏ qua, các lần báo sau vẫn phát (Task 3, Task 4).
5. Bấm một công tắc nhanh nhiều lần: trạng thái cuối cùng được lưu (Task 4).

---

## Cấu trúc file

| File | Trách nhiệm |
|---|---|
| `src/core/store.ts` | Đọc, ghi, gộp trạng thái qua `KeyValueStore` |
| `src/core/settings.ts` | Đọc, ghi cài đặt báo |
| `src/core/alerts.ts` | Tìm mục vừa xong, tạo nội dung báo, kiểm tra mọi mục đã xong |
| `src/platform/indexeddb-store.ts` | `KeyValueStore` chạy trên IndexedDB |
| `src/platform/alert-output.ts` | `AlertOutput` và bản dành cho trình duyệt |
| `src/ui/alerts-panel.ts` | Khối `details` chứa công tắc và nút thử |
| `src/ui/app.ts` | Nối bảng thông báo, `fireAlert`, các cảnh báo mới |
| `public/sw-notifications.js` | Bấm vào thông báo thì mở app |
| `public/sounds/*`, `scripts/build-ting.mjs` | File âm thanh và script tạo tiếng ting |
| `tests/helpers.ts` | `memoryStore`, `fakeOutput` dùng chung cho test |

`src/ui/alerts-panel.ts` là file spec chưa liệt kê; tách ra để `app.ts` không ôm thêm phần dựng form.

---

### Task 1: Lưu bằng IndexedDB

**Files:**
- Create: `src/platform/indexeddb-store.ts`, `tests/helpers.ts`
- Modify: `src/core/store.ts`, `src/ui/app.ts`, `src/ui/copy.ts`, `src/main.ts`, `tests/store.test.ts`, `tests/app.test.ts`

**Interfaces:**
- Produces (`src/core/store.ts`): `KeyValueStore`, `LoadResult`, `loadState`, `saveState` đúng chữ ký trong spec mục 1. Bỏ `openStorage`.
- Produces (`src/platform/indexeddb-store.ts`): `openStore(): Promise<KeyValueStore>`
- Produces (`tests/helpers.ts`): `memoryStore(initial?: Record<string, string>, options?: { failWrites?: boolean; failReads?: boolean }): KeyValueStore`
- Produces (`src/ui/app.ts`): `AppDeps` tạm thời là `{ store: KeyValueStore; loaded: LoadResult; now; readClipboard }`. Task 4 thêm `settings` và `output`.

- [ ] **Step 1: Viết `tests/helpers.ts` và đổi test store**

Trong `tests/store.test.ts`, bỏ `memory`, hai test `openStorage`, và ba test round-trip, corrupt, failed write. Thêm:

```ts
const legacyWith = (raw: string | null) => {
  let value = raw;
  return { getItem: () => value, removeItem: () => { value = null; } } as unknown as Storage;
};
const saved = (state: AppState) => JSON.stringify(state);

test('round-trips through the store', async () => {
  const s = memoryStore();
  const { state } = upsertVillage(emptyState(), v('#A', 10));
  expect(await saveState(s, state)).toBe(true);
  expect(await loadState(s)).toEqual({ state, unreadable: false });
});

test('an empty store is not an error', async () => {
  expect(await loadState(memoryStore())).toEqual({ state: emptyState(), unreadable: false });
});

test.each(['{broken', '{"villages":5}', 'null'])('corrupt data %s is reported', async (raw) => {
  expect(await loadState(memoryStore({ [STORAGE_KEY]: raw }))).toEqual({ state: emptyState(), unreadable: true });
});

test('keeps readable accounts and reports the rest', async () => {
  const raw = JSON.stringify({ villages: { '#A': v('#A', 1), '#B': { tag: 'wrong' } }, activeTag: '#B' });
  const { state, unreadable } = await loadState(memoryStore({ [STORAGE_KEY]: raw }));
  expect(Object.keys(state.villages)).toEqual(['#A']);
  expect(state.activeTag).toBe('#A');
  expect(unreadable).toBe(true);
});

test('a failed read is reported', async () => {
  expect((await loadState(memoryStore({}, { failReads: true }))).unreadable).toBe(true);
});

test('a failed write returns false', async () => {
  expect(await saveState(memoryStore({}, { failWrites: true }), emptyState())).toBe(false);
});

test('unreadable data stays in the store until the next save', async () => {
  const s = memoryStore({ [STORAGE_KEY]: '{broken' });
  await loadState(s);
  expect(await s.get(STORAGE_KEY)).toBe('{broken');
});

test('moves old localStorage data across, then removes it', async () => {
  const raw = saved(upsertVillage(emptyState(), v('#A', 1)).state);
  const legacy = legacyWith(raw);
  const s = memoryStore();
  expect((await loadState(s, () => legacy)).state.activeTag).toBe('#A');
  expect(await s.get(STORAGE_KEY)).toBe(raw);
  expect(legacy.getItem(STORAGE_KEY)).toBeNull();
});

test('keeps old data when moving it fails', async () => {
  const raw = saved(upsertVillage(emptyState(), v('#A', 1)).state);
  const legacy = legacyWith(raw);
  const result = await loadState(memoryStore({}, { failWrites: true }), () => legacy);
  expect(result.state.activeTag).toBe('#A');
  expect(legacy.getItem(STORAGE_KEY)).toBe(raw);
});

test('store data wins over old localStorage data', async () => {
  const current = saved(upsertVillage(emptyState(), v('#NEW', 2)).state);
  const legacy = legacyWith(saved(upsertVillage(emptyState(), v('#OLD', 1)).state));
  expect((await loadState(memoryStore({ [STORAGE_KEY]: current }), () => legacy)).state.activeTag).toBe('#NEW');
});

test('blocked localStorage is ignored', async () => {
  const result = await loadState(memoryStore(), () => { throw new Error('SecurityError'); });
  expect(result).toEqual({ state: emptyState(), unreadable: false });
});
```

- [ ] **Step 2: Đổi `setup` trong `tests/app.test.ts`**

`setup` thành `async function setup(clockMs: number, opts: { clip?: AppDeps['readClipboard']; store?: KeyValueStore } = {})`, đọc `loaded = await loadState(store)` rồi mới mount. Mỗi test có một `store = memoryStore()` mới từ `beforeEach`, thay cho `window.localStorage`. Mọi lời gọi thành `await setup(...)`, và `setup(x, async () => clip)` thành `setup(x, { clip: async () => clip })`. Test `failed save warns` dùng `memoryStore({}, { failWrites: true })`. Không đổi assertion nào của các test đang có.

Thêm:

```ts
test('unreadable saved data asks for a new paste, and a good paste clears it', async () => {
  const root = await setup((T + 807) * 1000, { store: memoryStore({ [STORAGE_KEY]: '{broken' }) });
  expect(root.querySelector('[data-notice="unreadable"]')!.textContent).toContain('dán lại');
  click(root, 'button[data-action="paste"]');
  await flush();
  expect(root.querySelector('[data-notice="unreadable"]')).toBeNull();
  expect(rows(root)).toHaveLength(13);
});
```

Run: `npm test`
Expected: FAIL vì `loadState` chưa nhận `KeyValueStore`.

- [ ] **Step 3: Implement store, app và `openStore`**

- `src/core/store.ts` theo spec mục 1. Ghi dữ liệu cũ sang store xong mới gọi `removeItem`; ghi thất bại thì vẫn trả dữ liệu đã đọc.
- `src/ui/app.ts`: `persist()` gọi `saveState` không chờ, cập nhật `storageFailed` và render lại khi kết quả làm cờ này đổi. Thêm cảnh báo `unreadable`, xóa cờ này khi dán thành công. Thêm khóa vào `copy.notice`.
- `src/platform/indexeddb-store.ts` theo spec mục 1, transaction ghi dùng `{ durability: 'strict' }`.
- `src/main.ts`: top-level `await openStore()`, `await loadState(store, () => localStorage)`, rồi `mountApp`.

- [ ] **Step 4: Chạy test**

Run: `npm test; npm run check; npm run build`
Expected: mọi test PASS, `tsc` và build không lỗi. `openStore` chưa có test tự động; Task 5 kiểm tra nó trên Chrome thật.

- [ ] **Step 5: Commit**

```bash
git add src tests
git commit -m "feat: store data in IndexedDB so a paste survives a force close"
```

---

### Task 2: Cài đặt và logic báo

**Files:**
- Create: `src/core/settings.ts`, `src/core/alerts.ts`
- Test: `tests/settings.test.ts`, `tests/alerts.test.ts`

**Interfaces:**
- Consumes: `KeyValueStore` (Task 1), `jobName`, `remainingSeconds`
- Produces: `AlertSettings`, `DEFAULT_SETTINGS`, `SETTINGS_KEY`, `loadSettings`, `saveSettings`; `FinishedJob`, `AlertMessage`, `finishedBetween`, `alertMessage`, `allFinished`. Chữ ký đúng như spec mục 2, 3, 4.

- [ ] **Step 1: Viết test và cho thấy chúng fail**

`tests/settings.test.ts`:

```ts
test('defaults to everything off', async () => {
  expect(DEFAULT_SETTINGS).toEqual({ voice: false, ting: false, vibrate: false, banner: false });
  expect(await loadSettings(memoryStore())).toEqual(DEFAULT_SETTINGS);
});

test('round-trips', async () => {
  const s = memoryStore();
  const settings = { ...DEFAULT_SETTINGS, voice: true, banner: true };
  expect(await saveSettings(s, settings)).toBe(true);
  expect(await loadSettings(s)).toEqual(settings);
});

test.each(['{broken', 'null', '[]'])('corrupt settings %s give the defaults', async (raw) => {
  expect(await loadSettings(memoryStore({ [SETTINGS_KEY]: raw }))).toEqual(DEFAULT_SETTINGS);
});

test('a field of the wrong type takes its default', async () => {
  const s = memoryStore({ [SETTINGS_KEY]: '{"voice":true,"ting":"yes"}' });
  expect(await loadSettings(s)).toEqual({ ...DEFAULT_SETTINGS, voice: true });
});

test('a failed read gives the defaults and a failed write returns false', async () => {
  expect(await loadSettings(memoryStore({}, { failReads: true }))).toEqual(DEFAULT_SETTINGS);
  expect(await saveSettings(memoryStore({}, { failWrites: true }), DEFAULT_SETTINGS)).toBe(false);
});
```

`tests/alerts.test.ts`:

```ts
const job = (id: number, endsAt: number, group: Job['group'] = 'home-build'): Job =>
  ({ id, group, detail: 'Cấp 6 → 7', endsAt });
const village = (tag: string, jobs: Job[]): Village => ({ tag, exportedAt: 1, jobs, hasBoosts: false });

test('includes the upper bound and excludes the lower bound', () => {
  const v = village('#A', [job(1, 100), job(2, 101), job(3, 110), job(4, 111)]);
  expect(finishedBetween([v], 100, 110).map((f) => f.job.id)).toEqual([2, 3]);
});

test('skips helper cooldowns', () => {
  expect(finishedBetween([village('#A', [job(1, 105, 'helper')])], 100, 110)).toEqual([]);
});

test('covers every account', () => {
  const found = finishedBetween([village('#A', [job(1, 105)]), village('#B', [job(2, 105)])], 100, 110);
  expect(found.map((f) => f.tag)).toEqual(['#A', '#B']);
});

test('one job names it, with its detail and tag', () => {
  expect(alertMessage([{ tag: '#A', job: job(1000059, 5) }]))
    .toEqual({ title: 'Workshop đã xong', body: 'Cấp 6 → 7 · #A' });
});

test('several jobs are summed up', () => {
  expect(alertMessage([{ tag: '#A', job: job(1000059, 5) }, { tag: '#B', job: job(1000026, 5) }]))
    .toEqual({ title: '2 hạng mục đã xong', body: 'Workshop, Dark Barracks' });
});

test.each<[string, Job[], boolean]>([
  ['no jobs', [], false],
  ['only helpers', [job(1, 5, 'helper')], false],
  ['one still running', [job(1, 5), job(2, 200)], false],
  ['a job ending right now', [job(1, 100)], true],
  ['all done while a helper still runs', [job(1, 5), job(2, 200, 'helper')], true],
])('allFinished: %s', (_name, jobs, expected) => {
  expect(allFinished(jobs, 100_000)).toBe(expected);
});
```

Run: `npm test -- settings alerts`
Expected: FAIL vì hai module chưa tồn tại.

- [ ] **Step 2: Implement `src/core/settings.ts` và `src/core/alerts.ts`**

`allFinished` dùng `remainingSeconds`, để khớp với lúc dòng hạng mục đổi thành "Đã xong". `loadSettings` chỉ nhận trường có kiểu boolean. `saveSettings` bắt lỗi và trả `false`.

- [ ] **Step 3: Chạy test**

Run: `npm test -- settings alerts; npm run check`
Expected: mọi test PASS.

- [ ] **Step 4: Commit**

```bash
git add src/core/settings.ts src/core/alerts.ts tests/settings.test.ts tests/alerts.test.ts
git commit -m "feat: add alert settings and finished-job detection"
```

---

### Task 3: Âm thanh và phát tín hiệu

**Files:**
- Create: `src/platform/alert-output.ts`, `public/sw-notifications.js`, `public/sounds/voice.wav`, `public/sounds/ting.wav`, `public/licenses/vais1000-voice.txt`, `scripts/build-ting.mjs`
- Modify: `package.json`, `vite.config.ts`, `README.md`
- Test: `tests/alert-output.test.ts`, `tests/sounds.test.ts`

**Interfaces:**
- Consumes: `AlertMessage` (Task 2)
- Produces (`src/platform/alert-output.ts`): `Sound`, `BannerPermission`, `AlertOutput` đúng spec mục 5; `browserAlertOutput(baseUrl: string, makeAudio: (src: string) => HTMLAudioElement = (src) => new Audio(src)): AlertOutput`. Tham số `makeAudio` chỉ để test.

- [ ] **Step 1: Viết test và cho thấy chúng fail**

`tests/sounds.test.ts`:

```ts
test.each(['voice', 'ting'])('%s.wav is 16-bit mono PCM under 150 KB', (name) => {
  const wav = readFileSync(`public/sounds/${name}.wav`);
  expect(wav.toString('ascii', 0, 4)).toBe('RIFF');
  expect(wav.readUInt16LE(20)).toBe(1); // PCM
  expect(wav.readUInt16LE(22)).toBe(1); // mono
  expect(wav.readUInt16LE(34)).toBe(16);
  expect(wav.length).toBeLessThanOrEqual(150 * 1024);
});
```

`tests/alert-output.test.ts`, môi trường jsdom. Dùng phần tử audio giả là `EventTarget` có `play()`, `currentTime`, `preload`:

| Test | Assertion |
|---|---|
| `plays the right file under the base path` | `makeAudio` nhận `/coc_notification/sounds/voice.wav` và `/coc_notification/sounds/ting.wav` |
| `play resolves true when the sound ends` | Phát sự kiện `ended`, kết quả `true` |
| `a blocked sound resolves false` | `play()` reject, kết quả `false` |
| `a load error resolves false` | Phát sự kiện `error`, kết quả `false` |
| `a sound that never ends gives up after 10 seconds` | Fake timers, sau 10000ms kết quả `false` |
| `vibrate returns false without the API` | `navigator.vibrate` undefined, kết quả `false` |
| `permission is unsupported without Notification` | `bannerPermission()` là `'unsupported'` |
| `user activation counts as true without the API` | `navigator.userActivation` undefined, kết quả `true` |
| `showBanner returns false without a registration` | `getRegistration` resolve `undefined`, kết quả `false` |
| `showBanner goes through the service worker` | `showNotification` nhận `title`, và options có `body`, `icon: '/coc_notification/pwa-192x192.png'`, `tag: 'village-timer-finished'`, `renotify: true` |

Run: `npm test -- alert-output sounds`
Expected: FAIL vì module và file âm thanh chưa tồn tại.

- [ ] **Step 2: Tạo file âm thanh**

`scripts/build-ting.mjs` ghi `public/sounds/ting.wav`: 22050 Hz, mono, 16-bit, dài 0,6 giây, gồm sóng sine 1318,5 Hz cộng hoạ âm 2637 Hz với biên độ 0,3, tắt dần theo hàm mũ `exp(-6t)`, đỉnh 0,8. Thêm script `"ting": "node scripts/build-ting.mjs"` vào `package.json` rồi chạy `npm run ting`.

Tạo giọng nói trong thư mục tạm, chạy bằng Bash. Lệnh này đã chạy thử trên máy, ra file 1,28 giây, 56 KB, mono, 16-bit, 22050 Hz:

```bash
WORK=$(mktemp -d)
python -m venv "$WORK/venv"
"$WORK/venv/Scripts/python" -m pip install --quiet piper-tts
base=https://huggingface.co/rhasspy/piper-voices/resolve/main/vi/vi_VN/vais1000/medium
curl -sSL -o "$WORK/vi_VN-vais1000-medium.onnx" "$base/vi_VN-vais1000-medium.onnx"
curl -sSL -o "$WORK/vi_VN-vais1000-medium.onnx.json" "$base/vi_VN-vais1000-medium.onnx.json"
PYTHONUTF8=1 "$WORK/venv/Scripts/python" -m piper -m "$WORK/vi_VN-vais1000-medium.onnx" -f public/sounds/voice.wav -- 'Có công trình vừa hoàn thành.'
```

Viết `public/licenses/vais1000-voice.txt` gồm: file là giọng tổng hợp bằng Piper với giọng `vi_VN-vais1000-medium`, không phải bản ghi từ bộ dữ liệu; bộ dữ liệu VAIS-1000 Vietnamese Speech Synthesis Corpus; DOI `10.21227/H2B887`; liên kết `https://ieee-dataport.org/documents/vais-1000-vietnamese-speech-synthesis-corpus`; giấy phép Creative Commons Attribution, `https://creativecommons.org/licenses/by/4.0/`.

- [ ] **Step 3: Implement `browserAlertOutput`**

Theo spec mục 5. Mỗi âm thanh một phần tử tạo sẵn, `preload = 'auto'`. `play` đặt `currentTime = 0`, resolve `true` khi `ended`; resolve `false` khi `play()` reject, khi có `error`, hoặc sau `PLAY_TIMEOUT_MS = 10_000`, và luôn gỡ listener cùng timer. Không lắng nghe `pause`, vì trình duyệt phát `pause` ngay trước `ended` khi âm thanh chạy hết. Bọc mọi phần trong `try/catch`; hàm của `AlertOutput` không được ném lỗi.

- [ ] **Step 4: Thêm xử lý bấm thông báo và cấu hình PWA**

- `public/sw-notifications.js` theo spec mục 5.
- `vite.config.ts`: thêm `sounds/voice.wav`, `sounds/ting.wav`, `licenses/vais1000-voice.txt` vào `includeAssets`, và `workbox: { importScripts: ['sw-notifications.js'] }`.
- `README.md`: thêm mục Thông báo, gồm giới hạn chỉ báo khi app đang mở, lệnh tạo hai file âm thanh và nguồn giọng đọc.

- [ ] **Step 5: Chạy test**

Run: `npm test; npm run check; npm run build`
Expected: mọi test PASS, `dist/sw.js` có `sw-notifications.js`, và `dist/sounds/` có đủ hai file.

- [ ] **Step 6: Commit**

```bash
git add public scripts src tests vite.config.ts package.json README.md
git commit -m "feat: add alert sounds and browser alert output"
```

---

### Task 4: Bảng Thông báo và báo khi hạng mục xong

**Files:**
- Create: `src/ui/alerts-panel.ts`
- Modify: `src/ui/app.ts`, `src/ui/copy.ts`, `src/ui/style.css`, `src/main.ts`, `tests/helpers.ts`, `tests/app.test.ts`

**Interfaces:**
- Consumes: `finishedBetween`, `alertMessage`, `allFinished`, `saveSettings`, `AlertSettings` (Task 2); `AlertOutput`, `browserAlertOutput` (Task 3)
- Produces (`src/ui/alerts-panel.ts`):

```ts
export type AlertKey = keyof AlertSettings;
export interface AlertsPanelHandlers { onToggle(key: AlertKey, on: boolean): void; onTest(): void }
export interface AlertsPanel { element: HTMLDetailsElement; update(settings: AlertSettings): void; open(): void }
export function createAlertsPanel(handlers: AlertsPanelHandlers): AlertsPanel;
```

- Produces (`src/ui/app.ts`): `AppDeps` đầy đủ như spec mục 8.
- Produces (`tests/helpers.ts`): `fakeOutput(overrides?: Partial<AlertOutput>): AlertOutput & { calls: string[] }`. Mặc định quyền `granted`, `hasUserActivation` là `true`, mọi hàm thành công. `calls` ghi `banner:<title>`, `vibrate`, `ting`, `voice`.

- [ ] **Step 1: Viết test và cho thấy chúng fail**

`setup` nhận thêm `settings?: AlertSettings` và `output?: AlertOutput`. Thêm:

```ts
const on = (over: Partial<AlertSettings>): AlertSettings => ({ ...DEFAULT_SETTINGS, ...over });
const all = on({ banner: true, vibrate: true, ting: true, voice: true });
const twoJobs = JSON.stringify({ tag: '#TEST123', timestamp: T, buildings: [
  { data: 1000026, lvl: 1, timer: 100 }, { data: 1000059, lvl: 1, timer: 100 }] });

async function pasted(clockMs: number, opts: Parameters<typeof setup>[1] = {}) {
  const root = await setup(clockMs, opts);
  click(root, 'button[data-action="paste"]');
  await flush();
  return root;
}

test('a job reaching its end fires the enabled kinds once, in order', async () => {
  const output = fakeOutput();
  await pasted((T + 54757) * 1000, { output, settings: all });
  await vi.advanceTimersByTimeAsync(5000);
  expect(output.calls).toEqual(['banner:Workshop đã xong', 'vibrate', 'ting', 'voice']);
});

test('only the enabled kinds fire', async () => {
  const output = fakeOutput();
  await pasted((T + 54757) * 1000, { output, settings: on({ ting: true }) });
  await vi.advanceTimersByTimeAsync(5000);
  expect(output.calls).toEqual(['ting']);
});

test('jobs ending in the same tick fire once', async () => {
  const output = fakeOutput();
  await pasted((T + 98) * 1000, { output, settings: on({ banner: true }), clip: async () => twoJobs });
  await vi.advanceTimersByTimeAsync(5000);
  expect(output.calls).toEqual(['banner:2 hạng mục đã xong']);
});

test('jobs finished before opening stay quiet', async () => {
  const store = memoryStore();
  await pasted((T + 54800) * 1000, { store });
  unmount!();
  const output = fakeOutput();
  await setup((T + 54810) * 1000, { store, output, settings: all });
  await vi.advanceTimersByTimeAsync(5000);
  expect(output.calls).toEqual([]);
});

test('an account not on screen still alerts', async () => {
  let clip = sample;
  const output = fakeOutput();
  const root = await pasted((T + 54757) * 1000, { output, settings: on({ banner: true }), clip: async () => clip });
  clip = JSON.stringify({ tag: '#OTHER1', timestamp: T, buildings: [{ data: 1000026, lvl: 1, timer: 999999 }] });
  click(root, 'button[data-action="paste"]');
  await flush();
  await vi.advanceTimersByTimeAsync(5000);
  expect(output.calls).toEqual(['banner:Workshop đã xong']);
});

test('a page resumed after a long pause alerts once for everything it missed', async () => {
  const output = fakeOutput();
  await pasted((T + 44000) * 1000, { output, settings: on({ banner: true }) });
  vi.setSystemTime((T + 60000) * 1000);
  document.dispatchEvent(new Event('visibilitychange'));
  await flush();
  await vi.advanceTimersByTimeAsync(3000);
  expect(output.calls).toEqual(['banner:2 hạng mục đã xong']);
});

test('a deleted account no longer alerts', async () => {
  const output = fakeOutput();
  const root = await pasted((T + 54757) * 1000, { output, settings: all });
  click(root, 'button[data-action="delete"]');
  await vi.advanceTimersByTimeAsync(5000);
  expect(output.calls).toEqual([]);
});

test('a later alert does not play over a sound, and the next one plays once it ends', async () => {
  let plays = 0;
  let release!: (ok: boolean) => void;
  const output = fakeOutput({ play: () => { plays += 1; return new Promise((r) => { release = r; }); } });
  const clip = async () => JSON.stringify({ tag: '#TEST123', timestamp: T, buildings: [
    { data: 1000026, lvl: 1, timer: 100 }, { data: 1000059, lvl: 1, timer: 103 }, { data: 1000067, lvl: 1, timer: 109 }] });
  await pasted((T + 98) * 1000, { output, settings: on({ banner: true, voice: true }), clip });
  await vi.advanceTimersByTimeAsync(7000);
  expect(plays).toBe(1);
  expect(output.calls).toEqual(['banner:Dark Barracks đã xong', 'banner:Workshop đã xong']);
  release(true);
  await flush();
  await vi.advanceTimersByTimeAsync(6000);
  expect(plays).toBe(2);
});
```

Các test còn lại, mỗi dòng một test:

| Test | Thiết lập | Assertion |
|---|---|---|
| `pasting again does not alert twice` | Dán tại `T + 54757`, qua mốc, dán lại `sample` | `calls` vẫn chỉ có một lần báo |
| `a sound that fails shows a notice, the next success clears it` | `play` trả `false` rồi `true` | Có rồi hết `[data-notice="sound-failed"]` |
| `settings are saved and restored` | Bấm `input[name="alert-voice"]`, `flush` | `(await loadSettings(store)).voice` là `true`; mount lại thì ô đang tích |
| `rapid clicks keep the last state` | Bấm `alert-ting` ba lần liền, `flush` | `(await loadSettings(store)).ting` là `true` |
| `refused permission turns the switch back off` | `bannerPermission` là `default`, `requestBannerPermission` trả `denied` | Ô không tích, `banner` đã lưu là `false`, có `banner-denied` |
| `unsupported notifications never ask` | `bannerPermission` là `unsupported`, `requestBannerPermission` là spy | Spy không được gọi, có `banner-denied` |
| `granted permission turns the switch on` | `default`, request trả `granted` | Ô tích, `banner` đã lưu là `true` |
| `permission revoked since last time shows as off` | `settings.banner` là `true`, `bannerPermission` là `denied` | Ô không tích, tóm tắt chứa `Đang tắt` |
| `a failed settings save shows the storage notice` | Store `failWrites`, bấm `alert-ting`, `flush` | Có `[data-notice="storage"]`, ô vẫn tích |
| `the summary follows the switches` | Không bật gì, rồi bật `alert-ting` | `Đang tắt`, rồi `Đang bật` |
| `all-finished notice ignores helpers` | Một công trình đã xong, trợ thủ còn chạy | Có `[data-notice="all-finished"]` |
| `all-finished appears when the last job ends` | Một công trình, chạy qua mốc | Không có, rồi có `all-finished` |
| `needs-tap shows until the user touches the app` | `hasUserActivation` đổi từ `false` sang `true`, phát `pointerdown` | Có rồi hết `needs-tap` |
| `no needs-tap when only the banner is on` | `hasUserActivation` là `false`, chỉ bật `banner` | Không có `needs-tap` |
| `details opens after the first paste only` | Dán, đóng `details`, dán tài khoản thứ hai | Lần đầu `open`, lần sau vẫn đóng |
| `the test button fires the enabled kinds` | Bật `ting`, bấm `button[data-action="test-alert"]` | `calls` là `['ting']` |
| `the test button does nothing when all are off` | Không bật gì | `calls` rỗng |
| `the footer credits the voice` | Lần mở đầu | Có liên kết `licenses/vais1000-voice.txt` |

Run: `npm test -- app`
Expected: FAIL vì chưa có các phần tử và logic mới.

- [ ] **Step 2: Implement `src/ui/alerts-panel.ts` và thêm văn bản**

Dựng `details[data-role="alerts"]` theo bảng selector trong spec mục 6. Thêm toàn bộ văn bản mới của spec mục 2, 6 vào `src/ui/copy.ts`.

- [ ] **Step 3: Nối vào `src/ui/app.ts`**

- Khi mount: `settings` hiệu lực có `banner` chỉ đúng khi `deps.settings.banner` và `bannerPermission()` là `granted`. Đây là giá trị hiển thị, chỉ ghi vào store khi người dùng đổi công tắc.
- `lastCheckSec` khởi tạo bằng `deps.now() / 1000`. Trong `tick`, sau phần đếm ngược: gọi `finishedBetween(Object.values(state.villages), lastCheckSec, nowSec)`, đặt `lastCheckSec = Math.max(lastCheckSec, nowSec)`, có mục thì `void fireAlert(alertMessage(due))`.
- `fireAlert` theo thứ tự ở spec mục 5. Giữ cờ `soundPlaying`: nếu đang `true` thì bỏ qua phần âm thanh, và đặt lại `false` trong `finally`.
- `onToggle`: `banner` bật đi theo logic quyền ở spec mục 6, khóa ô trong lúc chờ `requestBannerPermission`. Công tắc khác đổi và lưu ngay. Lưu thất bại thì hiện `storage`.
- Render thêm `all-finished`, `needs-tap`, `banner-denied`, `sound-failed`. Lắng nghe `pointerdown` và `keydown` trên `document`, gỡ trong hàm unmount.
- Khi `upsertVillage` trả `added` mà trước đó chưa có tài khoản nào và cả bốn công tắc đều tắt: gọi `panel.open()`.
- Footer thêm dòng ghi nguồn giọng đọc, liên kết tương đối tới `licenses/vais1000-voice.txt`, đặt sau liên kết hiện có.

- [ ] **Step 4: Nối `src/main.ts` và giao diện**

`main.ts` thêm `await loadSettings(store)` và `browserAlertOutput(import.meta.env.BASE_URL)`. `style.css`: công tắc có vùng bấm tối thiểu 44px, không tạo thanh cuộn ngang ở 390px.

- [ ] **Step 5: Chạy test**

Run: `npm test; npm run check; npm run build`
Expected: mọi test PASS, `tsc` và build không lỗi.

- [ ] **Step 6: Commit**

```bash
git add src tests
git commit -m "feat: add alert settings panel and foreground alerts"
```

---

### Task 5: Kiểm tra thật và bàn giao

Task này do controller chạy, không giao implementer. Không tạo file trong dự án.

- [ ] **Step 1: Build production dưới đường dẫn con**

Run (PowerShell): `$env:BASE_PATH = "/coc_notification/"; npm run build`

- [ ] **Step 2: Kiểm tra trên Chrome thật**

Dùng extension Claude in Chrome. Nếu không kết nối được, dùng Chrome headless qua CDP với hồ sơ riêng và dữ liệu `tests/fixtures/export.sample.json`. Script nằm ở scratchpad, không commit.

Expected, tất cả đều đạt:
- Dán rồi buộc tắt Chrome ngay, mở lại vẫn đủ 13 dòng. Đây là tình huống trước đây mất dữ liệu.
- Dữ liệu cũ trong `localStorage` được chuyển sang, và khóa cũ bị xóa.
- Chặn `localStorage` và `indexedDB`: app vẫn hiện, dữ liệu vẫn hiện, có cảnh báo `storage`.
- Tắt server, `sounds/voice.wav` và `sounds/ting.wav` vẫn tải được.
- Cấp quyền thông báo, bấm `Thử`, `registration.getNotifications()` có thông báo.
- Bấm `Thử` với giọng nói bật, audio phát tới sự kiện `ended`.
- Mở bảng thông báo ở độ rộng 390px không có thanh cuộn ngang.
- Không có request nào ra ngoài máy và không có lỗi trong console.

- [ ] **Step 3: Người dùng kiểm tra**

Người dùng thử trên Android thật: bật các công tắc, bấm `Thử`, giữ app mở chờ một mục xong. Merge và phát hành vẫn theo Task 8 của plan `2026-11-05-village-timer-pwa.md`, cần người dùng xác nhận.
