# Village Timer PWA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Xây một web app cài được trên máy tính và Android: người dùng dán dữ liệu export từ Clash of Clans, app hiển thị mỗi hạng mục đang nâng cấp còn bao lâu và xong lúc mấy giờ theo đồng hồ của máy họ.

**Architecture:** PWA tĩnh, không có backend. Mọi xử lý chạy trong trình duyệt và dữ liệu chỉ lưu ở `localStorage` của từng máy, nên cả clan dùng chung một URL mà không ai thấy dữ liệu của ai. Tên hạng mục được sinh sẵn từ gói `clash-of-clans-data` thành bảng `id → tên` nhỏ, commit cùng mã nguồn.

**Tech Stack:** TypeScript 7, Vite 8, Vitest 5 + jsdom 31, vite-plugin-pwa 2, Node 26 LTS. Không dùng UI framework. Hosting: GitHub Pages.

**Spec:** Chưa có file spec riêng. Yêu cầu gốc nằm ở mục "Yêu cầu" ngay dưới đây; định dạng dữ liệu lấy từ `api_format.md` (JSON thô, không phải Markdown).

## Yêu cầu

Nguyên văn từ người dùng:

> - t muốn tạo một trang app trên máy tính và điện thoại (android) để hiển thị được thời gian các công trình đang xây dựng còn bao lâu, và tính ra được khoảng thời gian kết thúc so với thời gian thực dưới máy mình. Hiện tại t đã copy API export format từ game và lưu trong file @api_format.md
> - ngoài ra trang web đó t muốn các bạn trong clan t cũng có thể sử dụng chỉ cần người dùng mở app đó lên rồi copy API format từ game là có thể hiển thị được thông tin từ acc họ luôn

**Ngoài phạm vi:** thông báo đẩy khi nâng cấp xong (PWA không có server không báo tin cậy được khi app đang đóng), màn hình xem chung cả clan, tên hạng mục tiếng Việt, lập kế hoạch nâng cấp, file APK.

## Dữ kiện đã kiểm chứng

Các điểm dưới đây đã được chạy kiểm tra với `api_format.md` ngày 2026-11-05:

- `timestamp` là Unix giây thật: mẫu là `2026-11-05T16:12:02Z`, sớm hơn giờ thực lúc kiểm tra 807 giây.
- `timer` là số giây còn lại tính từ `timestamp`, nên `endsAt = timestamp + timer`.
- Khi có `timer`, `lvl` là cấp đã xong và đang nâng lên `lvl + 1` (theo tài liệu của Clash Max).
- Mẫu có 13 mốc thời gian: 11 `timer` (`buildings` 6, `units` 1, `pets` 1, `buildings2` 2, `units2` 1) và 2 `helper_cooldown`.
- Hạng mục đang nâng cấp là một phần tử riêng, không có `cnt`. Hai Scattershot `1000067` là hai dòng riêng.
- `clash-of-clans-data` 0.19.1 (MIT, phát hành 2026-10-29) có trường `dataId`: 250 ID, không ID nào trùng tên khác nhau. Mọi ID trong các mục có thể chạy timer đều có tên, kể cả ID lồng trong `1000097`. Riêng `decos`, `obstacles`, `skins`, `sceneries`, `house_parts` không có tên, nhưng app không cần các mục này.
- Gói npm `clash-of-clans-data` không chứa code đọc export (`dist` không có `buildings2` hay `helper_cooldown`), nên phần parse phải tự viết.
- Đường dẫn trong game: Settings → More Settings → Data Export → Copy (theo blog Clash Ninja).
- `api.clashking.xyz` không phân giải được từ máy này ngày 2026-11-05, nên không dùng làm nguồn tên.
- Máy hiện chưa có Node, npm và `gh`; có `git` 2.54 và `winget`.

## Giả định chưa kiểm chứng

Mẫu không có các trường hợp này, nên code phải an toàn dù giả định sai, và không được trình bày chúng như sự thật cho người dùng:

- `boosts` khác rỗng trông như thế nào: app chỉ biết "có boost" và hiện cảnh báo.
- Apprentice/Lab Assistant đang chạy lúc export có làm `timer` chạy nhanh hơn không: app lấy `timer` nguyên giá trị.
- Công trình xây mới có `lvl: 0` hay không; vũ khí Town Hall hay module Crafting Station có `timer` ở đâu: dùng nhãn trung lập ở Task 2.

## Global Constraints

- Node `>=26`; devDependencies: `vite ^8.3.6`, `vitest ^5.1.0`, `typescript ^7.0.2`, `@types/node ^26.6.6`, `jsdom ^31.0.0`, `vite-plugin-pwa ^2.0.0`, `workbox-build ^7.4.1`, `workbox-window ^7.4.1`, `@vite-pwa/assets-generator ^2.0.0`, `clash-of-clans-data 0.19.1` (ghim đúng phiên bản).
- Không có backend, analytics, font CDN hay bất kỳ request mạng nào ngoài tải chính app.
- Không dùng `innerHTML` với dữ liệu từ người dùng; mọi nội dung động đi qua `textContent`.
- Văn bản giao diện bằng tiếng Việt, nằm trong `src/ui/copy.ts`. Tên hạng mục giữ tiếng Anh như dữ liệu nguồn.
- Không dùng logo, hình ảnh hay tên game của Supercell trong tên app và icon. Tên app là `Village Timer`.
- Không commit `api_format.md` (repo sẽ public). Fixture test luôn dùng tag giả `#TEST123`.
- Mọi commit kết thúc bằng dòng `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Lệnh chạy trong `C:\learnspaces\coc_notification`. Nếu PATH chưa nhận Node ngay sau khi cài, chạy `$env:Path += ";C:\Program Files\nodejs"` trước.

## Review Focus

Năm tình huống dễ gặp nhất, mỗi tình huống có test ở task phụ trách:

1. Dán lại nhiều lần, dán nhầm bản cũ, hoặc dán tài khoản khác: bản mới nhất của từng tag được giữ, tài khoản khác không bị ghi đè (Task 4, Task 5).
2. Mở lại app sau nhiều giờ hoặc nhiều ngày: mục hết giờ hiện "Đã xong", không biến mất và không ra số âm (Task 5).
3. Game cập nhật thêm ID hoặc mục export mới: dòng vẫn hiện với tên dự phòng, không mất timer và không lỗi (Task 2).
4. Đồng hồ máy chậm hoặc máy ở múi giờ khác: giờ kết thúc theo múi giờ của máy, có cảnh báo khi đồng hồ chậm (Task 3, Task 5).
5. Trình duyệt chặn đọc clipboard: có thông báo rõ và vẫn dán tay vào ô nhập được (Task 5).

---

## Cấu trúc file

| File | Trách nhiệm |
|---|---|
| `scripts/build-names.mjs` | Sinh bảng tên từ `clash-of-clans-data` |
| `src/generated/names.json` | Bảng `dataId → name`, được commit |
| `src/core/types.ts` | Kiểu dữ liệu dùng chung |
| `src/core/names.ts` | Tra tên hạng mục |
| `src/core/parse.ts` | Đọc và kiểm tra export, rút ra các `Job` |
| `src/core/time.ts` | Tính giờ, định dạng, sắp xếp và gom nhóm |
| `src/core/store.ts` | Lưu, đọc, gộp dữ liệu nhiều tài khoản |
| `src/ui/copy.ts` | Toàn bộ văn bản giao diện |
| `src/ui/app.ts` | Dựng DOM, xử lý dán và đếm ngược |
| `src/ui/style.css` | Giao diện |
| `src/main.ts` | Nối app với API trình duyệt |
| `tests/*.test.ts` | Test theo từng module |

---

### Task 1: Khởi tạo dự án và bảng tên

**Files:**
- Create: `.gitignore`, `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `src/main.ts`, `scripts/build-names.mjs`, `src/generated/names.json`, `src/core/types.ts`, `src/core/names.ts`
- Test: `tests/names.test.ts`

**Interfaces:**
- Produces (`src/core/types.ts`):

```ts
export type Group = 'home-build' | 'home-hero' | 'lab' | 'pet'
  | 'builder-build' | 'builder-lab' | 'helper' | 'other';
export interface Job { id: number; parentId?: number; group: Group; detail: string; endsAt: number } // endsAt: Unix giây
export interface Village { tag: string; exportedAt: number; jobs: Job[]; hasBoosts: boolean }
```

- Produces (`src/core/names.ts`): `nameOf(id: number): string`, `jobName(job: Pick<Job, 'id' | 'parentId'>): string`

- [ ] **Step 1: Cài Node và tạo repo**

Run:
```powershell
winget install --id OpenJS.NodeJS.LTS -e --accept-source-agreements --accept-package-agreements
git init -b main
```
Expected: `node --version` in ra `v26.x`.

Tạo `.gitignore` gồm `node_modules/`, `dist/`, `api_format.md`. Commit `.gitignore` và file plan này lên `main`, rồi chạy `git checkout -b feat/village-timer`.

- [ ] **Step 2: Dựng khung dự án**

`package.json` có `"type": "module"`, `"private": true` và các scripts: `dev` = `vite`, `build` = `vite build`, `preview` = `vite preview`, `test` = `vitest run`, `check` = `tsc --noEmit`, `names` = `node scripts/build-names.mjs`. Cài đúng các devDependencies ở Global Constraints.

`tsconfig.json` bật `strict` và `resolveJsonModule`, với `types: ['vitest/globals', 'vite/client', 'node']`, và `include` gồm `src`, `tests`, `vite.config.ts`. Trong `vite.config.ts`, `base` lấy từ `process.env.BASE_PATH ?? '/'`; Vitest đặt `globals: true` và `environment: 'node'`, vì mọi file test dùng `test`, `expect`, `vi` mà không import. `index.html` có `lang="vi"`, viewport cho điện thoại, `<div id="app"></div>` và thẻ script nạp `src/main.ts`; `src/main.ts` để trống ở bước này.

- [ ] **Step 3: Viết test bảng tên và cho thấy nó fail**

```ts
import names from '../src/generated/names.json';
import { nameOf, jobName } from '../src/core/names';

test('names table covers real export ids', () => {
  expect(Object.keys(names).length).toBeGreaterThanOrEqual(250);
  expect(nameOf(1000026)).toBe('Dark Barracks');
  expect(nameOf(4000023)).toBe('Baby Dragon');
  expect(nameOf(73000010)).toBe('Spirit Fox');
  expect(nameOf(4000042)).toBe('Night Witch');
  expect(nameOf(93000000)).toBe("Builder's Apprentice");
});

test('unknown id falls back without throwing', () => {
  expect(nameOf(999)).toBe('Không rõ (#999)');
});

test('nested job is named with its parent', () => {
  expect(jobName({ id: 102000033, parentId: 103000011 })).toBe('Hot Candle — Hitpoints');
  expect(jobName({ id: 1000026 })).toBe('Dark Barracks');
});
```

Run: `npm test`
Expected: FAIL vì chưa có `src/generated/names.json`.

- [ ] **Step 4: Viết `scripts/build-names.mjs` rồi sinh bảng tên**

Script đệ quy qua mọi `.json` trong `node_modules/clash-of-clans-data/data/`, lấy mọi object có `dataId` kiểu số và `name` kiểu chuỗi (kể cả object lồng nhau). Nếu một ID có hai tên khác nhau thì ném lỗi. Ghi ra `src/generated/names.json` với key đã sắp xếp.

Run: `npm run names`

- [ ] **Step 5: Viết `src/core/names.ts`**

`nameOf` trả tên trong bảng, hoặc `Không rõ (#<id>)`. `jobName` trả `<tên cha> — <tên>` khi có `parentId`.

- [ ] **Step 6: Chạy test**

Run: `npm test; npm run check`
Expected: 3 test PASS, `tsc` không báo lỗi.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: scaffold project and generate item names"
```

---

### Task 2: Đọc dữ liệu export

**Files:**
- Create: `src/core/parse.ts`, `tests/fixtures/export.sample.json`
- Test: `tests/parse.test.ts`

**Interfaces:**
- Consumes: `Job`, `Village`, `Group` từ `src/core/types.ts`
- Produces:

```ts
export type ParseError = 'empty' | 'not-json' | 'not-export';
export type ParseResult = { ok: true; village: Village } | { ok: false; error: ParseError };
export function parseExport(text: string): ParseResult;
```

- [ ] **Step 1: Tạo fixture ẩn danh**

Run:
```powershell
node -e "const fs=require('fs');const d=JSON.parse(fs.readFileSync('api_format.md','utf8'));d.tag='#TEST123';fs.mkdirSync('tests/fixtures',{recursive:true});fs.writeFileSync('tests/fixtures/export.sample.json',JSON.stringify(d));"
```

- [ ] **Step 2: Viết test và cho thấy chúng fail**

```ts
import { readFileSync } from 'node:fs';
import { parseExport } from '../src/core/parse';

const sample = readFileSync('tests/fixtures/export.sample.json', 'utf8');
const T = 1793895122;
const wrap = (extra: object) => JSON.stringify({ tag: '#TEST123', timestamp: T, ...extra });
const jobs = (text: string) => {
  const r = parseExport(text);
  if (!r.ok) throw new Error(r.error);
  return r.village.jobs;
};

test('reads every running timer from the real export', () => {
  const r = parseExport(sample);
  expect(r).toMatchObject({ ok: true, village: { tag: '#TEST123', exportedAt: T, hasBoosts: false } });
  const all = jobs(sample);
  expect(all).toHaveLength(13);
  const count = (g: string) => all.filter((j) => j.group === g).length;
  expect([count('home-build'), count('lab'), count('pet'), count('builder-build'),
    count('builder-lab'), count('helper')]).toEqual([6, 1, 1, 2, 1, 2]);
});

test('computes end time and target level', () => {
  const all = jobs(sample);
  expect(all.find((j) => j.id === 1000026)).toMatchObject({ endsAt: 1794295613, detail: 'Cấp 12 → 13' });
  expect(all.find((j) => j.id === 4000042)).toMatchObject({ group: 'builder-lab', detail: 'Cấp 17 → 18' });
  expect(all.find((j) => j.id === 93000000)).toMatchObject({ group: 'helper', detail: 'Hồi chiêu' });
});

test('keeps two upgrades of the same building as two jobs', () => {
  const ends = jobs(sample).filter((j) => j.id === 1000067).map((j) => j.endsAt).sort();
  expect(ends).toEqual([1793983896, 1794014804]);
});

test('finds timers nested inside crafted defenses', () => {
  const text = wrap({ buildings: [{ data: 1000097, types: [{ data: 103000011,
    modules: [{ data: 102000033, lvl: 1, timer: 100 }] }] }] });
  expect(jobs(text)).toEqual([{ id: 102000033, parentId: 103000011, group: 'home-build',
    detail: 'Cấp 1 → 2', endsAt: T + 100 }]);
});

test('keeps timers from unknown ids and sections', () => {
  const text = wrap({ new_things: [{ data: 999, lvl: 1, timer: 5 }] });
  expect(jobs(text)).toMatchObject([{ id: 999, group: 'other', endsAt: T + 5 }]);
});

test('uses neutral labels for cases the sample cannot confirm', () => {
  expect(jobs(wrap({ buildings: [{ data: 1000001, lvl: 16, weapon: 1, timer: 9 }] }))[0].detail).toBe('Cấp 16 · Vũ khí 1');
  expect(jobs(wrap({ buildings: [{ data: 1000006, lvl: 0, timer: 9 }] }))[0].detail).toBe('Xây mới');
});

test('maps heroes and ignores invalid timers', () => {
  expect(jobs(wrap({ heroes: [{ data: 28000000, lvl: 71, timer: 9 }] }))[0]).toMatchObject({ group: 'home-hero', detail: 'Cấp 71 → 72' });
  expect(jobs(wrap({ units: [{ data: 1, timer: '9' }, { data: 2, timer: -1 }, { data: 3, timer: 0 }] }))).toEqual([]);
});

test('flags active boosts', () => {
  expect(parseExport(wrap({ boosts: { any: 1 } }))).toMatchObject({ ok: true, village: { hasBoosts: true } });
});

test('accepts text around the JSON', () => {
  expect(parseExport(`Của tôi:\n${sample}\n`).ok).toBe(true);
});

test.each([
  ['', 'empty'], ['   \n', 'empty'],
  ['xin chào', 'not-json'], [sample.slice(0, 500), 'not-json'],
  ['{"a":1}', 'not-export'], ['[1,2]', 'not-json'],
  ['{"tag":"<img src=x>","timestamp":1793895122}', 'not-export'],
  ['{"tag":"#ABC","timestamp":"soon"}', 'not-export'],
])('rejects %j as %s', (text, error) => {
  expect(parseExport(text)).toEqual({ ok: false, error });
});
```

Run: `npm test -- parse`
Expected: FAIL vì `parse.ts` chưa tồn tại.

- [ ] **Step 3: Implement `parseExport` trong `src/core/parse.ts`**

- Tiền xử lý: `trim`; rỗng thì trả `empty`. Lấy đoạn từ `{` đầu tiên đến `}` cuối cùng; không có hoặc `JSON.parse` lỗi thì trả `not-json`.
- Kiểm tra: `tag` khớp `/^#[0-9A-Z]+$/` và `timestamp` là số dương hữu hạn; sai thì trả `not-export`.
- Duyệt: với mỗi key ở cấp cao nhất có giá trị là mảng, đệ quy qua object và mảng con, truyền `data` của object chứa nó làm `parentId` (chỉ từ cấp lồng trở đi). Bỏ qua phần tử không phải object, ví dụ `house_parts`.
- Tạo job: `timer` là số `> 0` thì thêm một job; `helper_cooldown` là số `> 0` thì thêm một job nhóm `helper`. `endsAt = timestamp + giá trị đó`.
- Nhóm theo section ở cấp cao nhất:

| Section | Group |
|---|---|
| `buildings`, `traps` | `home-build` |
| `heroes` | `home-hero` |
| `units`, `spells`, `siege_machines` | `lab` |
| `pets` | `pet` |
| `buildings2`, `traps2`, `heroes2` | `builder-build` |
| `units2` | `builder-lab` |
| `helpers` | `helper` |
| Còn lại | `other` |

- `detail`, xét theo thứ tự: helper → `Hồi chiêu`; có `weapon` → `Cấp {lvl} · Vũ khí {weapon}`; `lvl` thiếu hoặc bằng 0 → `Xây mới`; còn lại → `Cấp {lvl} → {lvl+1}`.
- `hasBoosts`: `boosts` là object có ít nhất một key.

- [ ] **Step 4: Chạy test**

Run: `npm test -- parse; npm run check`
Expected: mọi test PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/parse.ts tests/parse.test.ts tests/fixtures/export.sample.json
git commit -m "feat: parse game export into timed jobs"
```

---

### Task 3: Tính giờ và định dạng

**Files:**
- Create: `src/core/time.ts`
- Test: `tests/time.test.ts`

**Interfaces:**
- Consumes: `Job`, `Group`
- Produces:

```ts
export const GROUP_ORDER: Group[]; // home-build, home-hero, lab, pet, builder-build, builder-lab, helper, other
export function remainingSeconds(endsAt: number, nowMs: number): number;
export function formatRemaining(seconds: number): string;
export function formatEnd(endsAt: number, timeZone?: string): string;
export function formatAgo(seconds: number): string;
export function deviceClockBehind(exportedAt: number, nowMs: number): boolean;
export function groupJobs(jobs: Job[], nowMs: number): { group: Group; jobs: Job[] }[];
```

- [ ] **Step 1: Viết test và cho thấy chúng fail**

```ts
import { remainingSeconds, formatRemaining, formatEnd, formatAgo, deviceClockBehind, groupJobs } from '../src/core/time';
import type { Job } from '../src/core/types';

const T = 1793895122;
const job = (group: Job['group'], endsAt: number): Job => ({ id: endsAt, group, detail: '', endsAt });

test('remaining time counts down from the device clock and stops at zero', () => {
  expect(remainingSeconds(T + 100, (T + 30) * 1000)).toBe(70);
  expect(remainingSeconds(T + 100, (T + 500) * 1000)).toBe(0);
});

test.each([
  [400491, '4 ngày 15 giờ 14 phút'],
  [54759, '15 giờ 12 phút 39 giây'],
  [86400, '1 ngày 0 giờ 0 phút'],
  [60, '1 phút 0 giây'],
  [59, '59 giây'],
  [0, 'Đã xong'],
])('formats %i seconds', (seconds, text) => {
  expect(formatRemaining(seconds)).toBe(text);
});

test('end time follows the device time zone', () => {
  const endsAt = T + 54759;
  const vn = formatEnd(endsAt, 'Asia/Ho_Chi_Minh');
  expect(vn).toContain('14:24');
  expect(vn).toContain('06/11');
  expect(formatEnd(endsAt, 'UTC')).toContain('07:24');
});

test.each([
  [30, 'vừa xong'], [807, '13 phút trước'], [7200, '2 giờ trước'], [172800, '2 ngày trước'],
])('ago %i', (seconds, text) => {
  expect(formatAgo(seconds)).toBe(text);
});

test('detects a device clock behind the export time', () => {
  expect(deviceClockBehind(T, (T - 121) * 1000)).toBe(true);
  expect(deviceClockBehind(T, (T - 120) * 1000)).toBe(false);
  expect(deviceClockBehind(T, (T + 900) * 1000)).toBe(false);
});

test('groups in fixed order, soonest first, finished last, no empty groups', () => {
  const now = (T + 50) * 1000;
  const a = job('lab', T + 900);
  const b = job('home-build', T + 500);
  const c = job('home-build', T + 100);
  const done = job('home-build', T + 10);
  expect(groupJobs([a, b, done, c], now)).toEqual([
    { group: 'home-build', jobs: [c, b, done] },
    { group: 'lab', jobs: [a] },
  ]);
});
```

Run: `npm test -- time`
Expected: FAIL vì `time.ts` chưa tồn tại.

- [ ] **Step 2: Implement `src/core/time.ts`**

- `formatRemaining`: `≤ 0` → `Đã xong`; có ngày → `{d} ngày {h} giờ {m} phút`; có giờ → `{h} giờ {m} phút {s} giây`; có phút → `{m} phút {s} giây`; còn lại → `{s} giây`.
- `formatEnd`: `Intl.DateTimeFormat('vi-VN', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone })`. Không truyền `timeZone` thì dùng múi giờ của máy.
- `deviceClockBehind`: đúng khi `exportedAt - now > 120` giây.

- [ ] **Step 3: Chạy test**

Run: `npm test -- time; npm run check`
Expected: mọi test PASS.

- [ ] **Step 4: Commit**

```bash
git add src/core/time.ts tests/time.test.ts
git commit -m "feat: compute and format remaining and end times"
```

---

### Task 4: Lưu dữ liệu nhiều tài khoản

**Files:**
- Create: `src/core/store.ts`
- Test: `tests/store.test.ts`

**Interfaces:**
- Consumes: `Village`
- Produces:

```ts
export const STORAGE_KEY = 'village-timer:v1';
export interface AppState { villages: Record<string, Village>; activeTag: string | null }
export type UpsertOutcome = 'added' | 'updated' | 'kept-newer';
export function emptyState(): AppState;
export function loadState(storage: Storage): AppState;
export function saveState(storage: Storage, state: AppState): boolean;
export function upsertVillage(state: AppState, village: Village): { state: AppState; outcome: UpsertOutcome };
export function removeVillage(state: AppState, tag: string): AppState;
```

- [ ] **Step 1: Viết test và cho thấy chúng fail**

```ts
import { STORAGE_KEY, emptyState, loadState, saveState, upsertVillage, removeVillage } from '../src/core/store';
import type { Village } from '../src/core/types';

const v = (tag: string, exportedAt: number): Village => ({ tag, exportedAt, jobs: [], hasBoosts: false });
const memory = (): Storage => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, x: string) => void m.set(k, x) } as Storage;
};

test('round-trips through storage', () => {
  const s = memory();
  const { state } = upsertVillage(emptyState(), v('#A', 10));
  expect(saveState(s, state)).toBe(true);
  expect(loadState(s)).toEqual(state);
});

test.each(['{broken', '{"villages":5}', 'null'])('corrupt storage %s gives empty state', (raw) => {
  const s = memory();
  s.setItem(STORAGE_KEY, raw);
  expect(loadState(s)).toEqual(emptyState());
});

test('reports a failed write instead of throwing', () => {
  const s = { setItem() { throw new Error('quota'); } } as unknown as Storage;
  expect(saveState(s, emptyState())).toBe(false);
});

test('a second account keeps the first and becomes active', () => {
  const first = upsertVillage(emptyState(), v('#A', 10));
  const second = upsertVillage(first.state, v('#B', 5));
  expect(second.outcome).toBe('added');
  expect(Object.keys(second.state.villages)).toEqual(['#A', '#B']);
  expect(second.state.activeTag).toBe('#B');
});

test('newer export replaces, older export is ignored but its account opens', () => {
  const start = upsertVillage(upsertVillage(emptyState(), v('#A', 10)).state, v('#B', 10)).state;
  const newer = upsertVillage(start, v('#A', 20));
  expect(newer.outcome).toBe('updated');
  expect(newer.state.villages['#A'].exportedAt).toBe(20);
  const older = upsertVillage(newer.state, v('#A', 15));
  expect(older.outcome).toBe('kept-newer');
  expect(older.state.villages['#A'].exportedAt).toBe(20);
  expect(older.state.activeTag).toBe('#A');
});

test('removing the active account selects another or none', () => {
  const start = upsertVillage(upsertVillage(emptyState(), v('#A', 1)).state, v('#B', 1)).state;
  const one = removeVillage(start, '#B');
  expect(one.activeTag).toBe('#A');
  expect(removeVillage(one, '#A')).toEqual(emptyState());
});
```

Run: `npm test -- store`
Expected: FAIL vì `store.ts` chưa tồn tại.

- [ ] **Step 2: Implement `src/core/store.ts`**

Các hàm không sửa `state` đầu vào. `loadState` trả `emptyState()` khi JSON hỏng hoặc sai cấu trúc; `saveState` bắt lỗi ghi và trả `false`. Cùng `exportedAt` thì tính là `updated`.

- [ ] **Step 3: Chạy test**

Run: `npm test -- store; npm run check`
Expected: mọi test PASS.

- [ ] **Step 4: Commit**

```bash
git add src/core/store.ts tests/store.test.ts
git commit -m "feat: persist multiple accounts locally"
```

---

### Task 5: Giao diện dán dữ liệu và đếm ngược

**Files:**
- Create: `src/ui/copy.ts`, `src/ui/app.ts`, `src/ui/style.css`
- Modify: `src/main.ts`
- Test: `tests/app.test.ts`

**Interfaces:**
- Consumes: `parseExport`; `jobName`; `groupJobs`, `remainingSeconds`, `formatRemaining`, `formatEnd`, `formatAgo`, `deviceClockBehind`; toàn bộ `src/core/store.ts`
- Produces:

```ts
export interface AppDeps { storage: Storage; now: () => number; readClipboard: () => Promise<string> }
export function mountApp(root: HTMLElement, deps: AppDeps): () => void; // trả hàm gỡ timer và listener
```

Bố cục một cột, rộng tối đa 640px, nền tối, số dùng `font-variant-numeric: tabular-nums`:

```
Village Timer
[#AAA] [#BBB]                        ← chỉ hiện khi có từ 2 tài khoản
#AAA · Xuất lúc ... (13 phút trước)  [Xóa]
⚠ cảnh báo (nếu có)
[ Dán dữ liệu ]  [ ô nhập dán tay ]
Làng chính · Công trình
  Workshop              14 giờ 59 phút 12 giây
  Cấp 6 → 7             Th 6, 06/11 14:24
footer
```

Selector cố định, dùng trong cả code và test:

| Phần tử | Selector |
|---|---|
| Nút dán | `button[data-action="paste"]` |
| Ô dán tay | `textarea[name="export"]` |
| Nút xóa tài khoản | `button[data-action="delete"]` |
| Tab tài khoản | `button[data-tag]` |
| Dòng hạng mục | `li[data-ends-at]`, gồm `.job-name`, `.job-detail`, `.job-remaining`, `.job-end` |
| Tiêu đề nhóm | `h2` |
| Cảnh báo | `[data-notice="error\|kept-newer\|storage\|boost\|clock"]` |
| Hướng dẫn | `[data-role="help"]` |
| Thông báo không có việc | `[data-role="no-jobs"]` |

Văn bản trong `src/ui/copy.ts`:

| Khóa | Nội dung |
|---|---|
| `title` | `Village Timer` |
| `help1` | `Trong game, mở Settings → More Settings → Data Export rồi bấm Copy.` |
| `help2` | `Quay lại đây và bấm "Dán dữ liệu".` |
| `help3` | `Cài app: trên Android mở menu Chrome và chọn Thêm vào màn hình chính; trên máy tính bấm biểu tượng cài đặt ở thanh địa chỉ.` |
| `paste` | `Dán dữ liệu` |
| `placeholder` | `Hoặc dán dữ liệu vào đây` |
| `delete` | `Xóa` |
| `exportedAt` | `Xuất lúc {time} ({ago})` |
| `staleHint` | `Nếu đã dùng sách, búa, thuốc hoặc gem sau lúc xuất, hãy dán dữ liệu mới.` |
| `noJobs` | `Tài khoản này không có gì đang nâng cấp.` |
| `error.empty` | `Clipboard đang trống. Hãy bấm Copy trong game rồi thử lại.` |
| `error.not-json` | `Đây không phải dữ liệu xuất từ game, hoặc dữ liệu bị thiếu. Hãy bấm Copy trong game rồi dán lại.` |
| `error.not-export` | `Dữ liệu này thiếu tag hoặc thời gian xuất. Hãy lấy lại từ mục Data Export trong game.` |
| `error.clipboard` | `Không đọc được clipboard. Hãy nhấn giữ vào ô bên dưới và chọn Dán.` |
| `notice.kept-newer` | `Dữ liệu vừa dán cũ hơn bản đang lưu nên app giữ bản mới hơn.` |
| `notice.storage` | `Không lưu được trên máy này. Dữ liệu sẽ mất khi đóng app.` |
| `notice.boost` | `Lúc xuất đang có boost nên có thể xong sớm hơn giờ hiển thị.` |
| `notice.clock` | `Đồng hồ máy đang chậm hơn giờ game. Hãy chỉnh lại giờ của máy để thời gian còn lại chính xác.` |
| `privacy` | `Dữ liệu chỉ lưu trên máy này, không gửi đi đâu.` |
| `disclaimer` | `This material is unofficial and is not endorsed by Supercell. For more information see Supercell's Fan Content Policy: www.supercell.com/fan-content-policy.` |
| `credit` | `Dữ liệu tên hạng mục: clash-of-clans-data (MIT).` |
| Nhóm `home-build` | `Làng chính · Công trình` |
| Nhóm `home-hero` | `Làng chính · Anh hùng` |
| Nhóm `lab` | `Làng chính · Nghiên cứu` |
| Nhóm `pet` | `Làng chính · Thú cưng` |
| Nhóm `builder-build` | `Căn cứ thợ xây · Công trình và anh hùng` |
| Nhóm `builder-lab` | `Căn cứ thợ xây · Nghiên cứu` |
| Nhóm `helper` | `Trợ thủ · Hồi chiêu` |
| Nhóm `other` | `Khác` |

- [ ] **Step 1: Viết test và cho thấy chúng fail**

```ts
// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { mountApp, type AppDeps } from '../src/ui/app';

const sample = readFileSync('tests/fixtures/export.sample.json', 'utf8');
const T = 1793895122;
const flush = () => vi.advanceTimersByTimeAsync(0);
let unmount: (() => void) | undefined;

function setup(clockMs: number, clip: AppDeps['readClipboard'] = async () => sample, storage = window.localStorage) {
  document.body.innerHTML = '<div id="app"></div>';
  const deps: AppDeps = { storage, now: () => Date.now(), readClipboard: clip };
  vi.setSystemTime(clockMs);
  unmount = mountApp(document.getElementById('app')!, deps);
  return document.getElementById('app')!;
}
const click = (root: HTMLElement, selector: string) => (root.querySelector(selector) as HTMLElement).click();
const rows = (root: HTMLElement) => [...root.querySelectorAll('li[data-ends-at]')];
const row = (root: HTMLElement, name: string) => rows(root).find((r) => r.textContent!.includes(name))!;
const remaining = (r: Element) => r.querySelector('.job-remaining')!.textContent;

beforeEach(() => { vi.useFakeTimers(); window.localStorage.clear(); });
afterEach(() => { unmount?.(); vi.useRealTimers(); });

test('first visit shows how to export and the legal footer', () => {
  const root = setup(T * 1000);
  expect(root.querySelector('[data-role="help"]')!.textContent).toContain('Data Export');
  expect(root.querySelector('footer')!.textContent).toContain('not endorsed by Supercell');
  expect(root.querySelector('footer')!.textContent).toContain('Dữ liệu chỉ lưu trên máy này');
});

test('pasting shows every job with remaining time and end time', async () => {
  const root = setup((T + 807) * 1000);
  click(root, 'button[data-action="paste"]');
  await flush();
  expect(rows(root)).toHaveLength(13);
  expect(root.querySelector('h2')!.textContent).toBe('Làng chính · Công trình');
  const barracks = row(root, 'Dark Barracks');
  expect(barracks.querySelector('.job-detail')!.textContent).toBe('Cấp 12 → 13');
  expect(remaining(barracks)).toBe('4 ngày 15 giờ 1 phút');
  expect(root.textContent).toContain('13 phút trước');
});

test('remaining time ticks every second', async () => {
  const root = setup((T + 807) * 1000);
  click(root, 'button[data-action="paste"]');
  await flush();
  expect(remaining(row(root, 'Workshop'))).toBe('14 giờ 59 phút 12 giây');
  await vi.advanceTimersByTimeAsync(1000);
  expect(remaining(row(root, 'Workshop'))).toBe('14 giờ 59 phút 11 giây');
});

test('reopening restores data, and finished jobs stay visible', async () => {
  let root = setup((T + 807) * 1000);
  click(root, 'button[data-action="paste"]');
  await flush();
  unmount!();
  root = setup((T + 30 * 86400) * 1000);
  expect(rows(root)).toHaveLength(13);
  expect(rows(root).every((r) => remaining(r) === 'Đã xong')).toBe(true);
});

test('job moves to the end of its group when it finishes', async () => {
  const root = setup((T + 54750) * 1000);
  click(root, 'button[data-action="paste"]');
  await flush();
  const first = () => root.querySelector('li[data-ends-at] .job-name')!.textContent;
  expect(first()).toContain('Workshop');
  await vi.advanceTimersByTimeAsync(10000);
  expect(first()).not.toContain('Workshop');
});

test('clipboard denied explains and manual paste still works', async () => {
  const root = setup((T + 807) * 1000, async () => { throw new Error('denied'); });
  click(root, 'button[data-action="paste"]');
  await flush();
  expect(root.querySelector('[data-notice="error"]')!.textContent).toContain('nhấn giữ');
  const box = root.querySelector('textarea[name="export"]') as HTMLTextAreaElement;
  box.value = sample;
  box.dispatchEvent(new Event('input', { bubbles: true }));
  await flush();
  expect(rows(root)).toHaveLength(13);
});

test('bad paste keeps existing data and shows the reason', async () => {
  let clip = sample;
  const root = setup((T + 807) * 1000, async () => clip);
  click(root, 'button[data-action="paste"]');
  await flush();
  clip = sample.slice(0, 500);
  click(root, 'button[data-action="paste"]');
  await flush();
  expect(rows(root)).toHaveLength(13);
  expect(root.querySelector('[data-notice="error"]')!.textContent).toContain('dữ liệu bị thiếu');
});

test('older export is not applied and says so', async () => {
  let clip = sample;
  const root = setup((T + 900) * 1000, async () => clip);
  click(root, 'button[data-action="paste"]');
  await flush();
  clip = JSON.stringify({ ...JSON.parse(sample), timestamp: T - 500, buildings: [] });
  click(root, 'button[data-action="paste"]');
  await flush();
  expect(rows(root)).toHaveLength(13);
  expect(root.querySelector('[data-notice="kept-newer"]')).not.toBeNull();
});

test('second account gets a tab, switching and deleting work', async () => {
  let clip = sample;
  const root = setup((T + 807) * 1000, async () => clip);
  click(root, 'button[data-action="paste"]');
  await flush();
  expect(root.querySelectorAll('button[data-tag]')).toHaveLength(0);
  clip = JSON.stringify({ tag: '#OTHER1', timestamp: T, buildings: [{ data: 1000026, lvl: 1, timer: 5000 }] });
  click(root, 'button[data-action="paste"]');
  await flush();
  expect(rows(root)).toHaveLength(1);
  click(root, 'button[data-tag="#TEST123"]');
  expect(rows(root)).toHaveLength(13);
  click(root, 'button[data-action="delete"]');
  expect(rows(root)).toHaveLength(1);
  expect(root.querySelectorAll('button[data-tag]')).toHaveLength(0);
});

test('shows boost, clock and no-job notices', async () => {
  const clip = JSON.stringify({ tag: '#TEST123', timestamp: T, boosts: { any: 1 } });
  const root = setup((T - 600) * 1000, async () => clip);
  click(root, 'button[data-action="paste"]');
  await flush();
  expect(root.querySelector('[data-notice="boost"]')).not.toBeNull();
  expect(root.querySelector('[data-notice="clock"]')).not.toBeNull();
  expect(root.querySelector('[data-role="no-jobs"]')).not.toBeNull();
});

test('failed save warns but still shows the data', async () => {
  const storage = { getItem: () => null, setItem() { throw new Error('quota'); } } as unknown as Storage;
  const root = setup((T + 807) * 1000, async () => sample, storage);
  click(root, 'button[data-action="paste"]');
  await flush();
  expect(rows(root)).toHaveLength(13);
  expect(root.querySelector('[data-notice="storage"]')).not.toBeNull();
});
```

Run: `npm test -- app`
Expected: FAIL vì `app.ts` chưa tồn tại.

- [ ] **Step 2: Viết `src/ui/copy.ts`**

Dùng đúng văn bản trong bảng, kể cả các khóa cảnh báo và tên nhóm.

- [ ] **Step 3: Implement `mountApp` trong `src/ui/app.ts`**

- Dựng DOM bằng `document.createElement` và `textContent`. `title` là `h1`, tên nhóm là `h2`. `privacy`, `disclaimer`, `credit` nằm trong `footer`.
- Khối `[data-role="help"]` chỉ hiện khi chưa có tài khoản nào. Nút dán và ô nhập luôn hiện.
- `handleText(text)`: gọi `parseExport`. Lỗi thì hiện cảnh báo và giữ nguyên dữ liệu. Thành công thì `upsertVillage`, `saveState`, xóa ô nhập rồi render lại.
- Nút dán: `try { await deps.readClipboard() } catch` hiện `error.clipboard`. Clipboard rỗng đi qua `handleText` và ra lỗi `empty`.
- Ô nhập: xử lý ở sự kiện `input`, bỏ qua khi giá trị rỗng.
- Hiện `staleHint` ở dưới dòng `exportedAt` khi đang xem một tài khoản.
- Đếm ngược: `setInterval` 1000ms chỉ ghi lại `textContent` của `.job-remaining`. Chỉ render lại toàn bộ khi số mục đã xong thay đổi, để không mất focus và vùng đang chọn. Gọi thêm một lần ở `visibilitychange`.
- Hàm trả về gỡ cả interval và listener.

- [ ] **Step 4: Viết `src/ui/style.css` và nối `src/main.ts`**

`main.ts` import CSS và gọi `mountApp` với `localStorage`, `Date.now`, `() => navigator.clipboard.readText()`. Vùng bấm tối thiểu 44px.

- [ ] **Step 5: Chạy test**

Run: `npm test; npm run check`
Expected: mọi test PASS.

- [ ] **Step 6: Commit**

```bash
git add src tests
git commit -m "feat: add paste flow and live countdown UI"
```

---

### Task 6: Biến web thành app cài được

**Files:**
- Create: `public/icon.svg`, các icon PNG được sinh, `public/licenses/clash-of-clans-data.txt`
- Modify: `vite.config.ts`, `index.html`, `src/main.ts`

**Interfaces:**
- Consumes: `mountApp`
- Produces: `dist/` có `manifest.webmanifest` và `sw.js`, chạy offline

- [ ] **Step 1: Tạo icon**

Vẽ `public/icon.svg`: đồng hồ cát đơn giản, tự vẽ, không dùng hình ảnh của game.

Run: `npx pwa-assets-generator --preset minimal-2023 public/icon.svg`
Expected: `public/` có `pwa-192x192.png`, `pwa-512x512.png`, `maskable-icon-512x512.png`, `apple-touch-icon-180x180.png`, `favicon.ico`.

- [ ] **Step 2: Cấu hình PWA**

Thêm `VitePWA` vào `vite.config.ts`:

```ts
VitePWA({
  registerType: 'autoUpdate',
  includeAssets: ['favicon.ico', 'apple-touch-icon-180x180.png', 'licenses/clash-of-clans-data.txt'],
  manifest: {
    name: 'Village Timer', short_name: 'Village Timer',
    description: 'Xem thời gian nâng cấp còn lại trong làng',
    lang: 'vi', display: 'standalone',
    theme_color: '#14171f', background_color: '#14171f',
    icons: [
      { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
      { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
      { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  },
})
```

Trong `src/main.ts` gọi `registerSW({ immediate: true })` từ `virtual:pwa-register`, và thêm `vite-plugin-pwa/client` vào `types` của `tsconfig.json`. Trong `index.html` thêm favicon, apple-touch-icon và `theme-color`. Sao chép `node_modules/clash-of-clans-data/LICENSE` sang `public/licenses/clash-of-clans-data.txt`, và cho dòng `credit` ở footer liên kết tới file đó.

- [ ] **Step 3: Build và kiểm tra sản phẩm**

Run:
```powershell
npm test; npm run check; npm run build
Test-Path dist/manifest.webmanifest, dist/sw.js, dist/licenses/clash-of-clans-data.txt
```
Expected: test và build thành công, `Test-Path` in ra ba lần `True`.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: make the app installable and offline-capable"
```

---

### Task 7: Kiểm tra thật và chuẩn bị phát hành

**Files:**
- Create: `.github/workflows/deploy.yml`, `README.md`

**Interfaces:**
- Consumes: scripts `test`, `check`, `build`; biến `BASE_PATH` trong `vite.config.ts`
- Produces: workflow deploy khi push lên `main`

- [ ] **Step 1: Viết workflow**

Chạy khi push lên `main`, gồm: checkout, setup-node `26` với cache npm, `npm ci`, `npm test`, `npm run check`, `npm run build` với `BASE_PATH: /${{ github.event.repository.name }}/`, rồi upload `dist` và deploy bằng các action GitHub Pages chính thức, dùng major mới nhất tại thời điểm làm. Quyền: `pages: write`, `id-token: write`.

- [ ] **Step 2: Viết `README.md`**

Gồm: app làm gì; cách người dùng lấy dữ liệu (Settings → More Settings → Data Export → Copy); cách cài trên Android và máy tính; dữ liệu chỉ nằm trên máy người dùng; cách cập nhật tên khi game có nội dung mới: `npm i -D -E clash-of-clans-data@latest; npm run names`; và disclaimer của Supercell.

- [ ] **Step 3: Kiểm tra trong Chrome thật**

Run: `npm run build; npm run preview` (chạy nền). Dùng skill `claude-in-chrome` để mở URL preview.

Dán nội dung `api_format.md` vào ô nhập và xác nhận:
- Có 13 dòng, nhóm đầu tiên là Làng chính · Công trình.
- Trong mỗi nhóm, mục sắp xong nhất đứng đầu và mục đã xong nằm cuối. Workshop hết giờ lúc `2026-11-06T07:24Z`, nên chạy sau mốc đó sẽ thấy nó ở cuối nhóm.
- Mục chưa xong giảm số giây theo thời gian thực.
- Tải lại trang, dữ liệu vẫn còn.
- Ở độ rộng 390px không có thanh cuộn ngang.

Sau đó tắt server preview, tải lại trang và xác nhận app vẫn mở được nhờ service worker.

Expected: tất cả đều đạt. Ghi kết quả từng mục vào báo cáo cuối task.

- [ ] **Step 4: Commit**

```bash
git add .github README.md
git commit -m "ci: deploy to GitHub Pages"
```

---

### Task 8: Phát hành (cần người dùng)

Task này công khai app ra Internet. Dừng lại và chờ người dùng xác nhận trước khi push.

**Files:** không tạo file mới.

**Interfaces:**
- Consumes: workflow ở Task 7
- Produces: URL HTTPS để chia sẻ cho clan

- [ ] **Step 1: Hoàn tất nhánh**

Dùng skill `superpowers:finishing-a-development-branch` để merge `feat/village-timer` vào `main`.

- [ ] **Step 2: Người dùng tạo repo**

Người dùng tạo repo **public** rỗng tên `coc_notification` trên GitHub (GitHub Pages miễn phí cần repo public), rồi vào Settings → Pages và chọn Source là GitHub Actions. Xác nhận `api_format.md` không có trong repo: `git ls-files api_format.md` phải không in ra gì.

- [ ] **Step 3: Push và kiểm tra**

```bash
git remote add origin <URL repo của người dùng>
git push -u origin main
```

Expected: workflow chạy xanh; `https://<tên-github>.github.io/coc_notification/` mở được qua HTTPS.

- [ ] **Step 4: Người dùng thử trên Android**

Trên Chrome Android: mở URL, chọn Thêm vào màn hình chính, mở app từ màn hình chính, dán dữ liệu mới từ game. So sánh thời gian còn lại của vài dòng với số trong game; nếu lệch quá vài giây thì báo lại, vì đó là dấu hiệu một giả định ở trên sai. Khi đúng, gửi URL cho clan.
