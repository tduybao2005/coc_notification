# Village Timer

Web app xem thời gian nâng cấp còn lại trong làng Clash of Clans. Dán dữ liệu export từ game, app hiện mỗi hạng mục đang nâng cấp còn bao lâu và xong lúc mấy giờ theo đồng hồ của máy bạn.

## Cách dùng

1. Trong game, mở Settings → More Settings → Data Export rồi bấm Copy.
2. Mở app và bấm "Dán dữ liệu". Nếu trình duyệt không cho đọc clipboard, nhấn giữ vào ô nhập bên dưới và chọn Dán.
3. Mỗi lần nâng cấp thêm hoặc dùng sách, búa, thuốc, gem, hãy dán dữ liệu mới để thời gian chính xác.

App nhớ được nhiều tài khoản; mỗi tài khoản là một tab theo tag.

## Cài app

- Android: mở app bằng Chrome, mở menu và chọn Thêm vào màn hình chính.
- Máy tính: mở app bằng Chrome hoặc Edge, bấm biểu tượng cài đặt ở thanh địa chỉ.

Sau khi cài, app mở được cả khi không có mạng.

## Quyền riêng tư

Không có máy chủ, không có analytics. Dữ liệu dán vào chỉ được xử lý trong trình duyệt và lưu trong `localStorage` của máy bạn, không gửi đi đâu. Mọi người dùng chung một URL nhưng không ai thấy dữ liệu của ai.

## Phát triển

```
npm ci
npm run dev      # chạy thử
npm test         # test
npm run check    # kiểm tra kiểu
npm run build    # build ra dist/
```

Push lên `main` sẽ chạy workflow `.github/workflows/deploy.yml` để test, build và đưa lên GitHub Pages.

### Cập nhật tên hạng mục khi game có nội dung mới

Tên hạng mục được sinh sẵn từ gói `clash-of-clans-data` vào `src/generated/names.json`:

```
npm i -D -E clash-of-clans-data@latest
npm run names
```

Hạng mục chưa có tên vẫn hiện, với tên dự phòng `Không rõ (#<id>)`.

## Disclaimer

This material is unofficial and is not endorsed by Supercell. For more information see Supercell's Fan Content Policy: www.supercell.com/fan-content-policy.

Item names come from [clash-of-clans-data](https://www.npmjs.com/package/clash-of-clans-data) (MIT); its license is in `public/licenses/clash-of-clans-data.txt`.
