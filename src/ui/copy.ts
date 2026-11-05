import type { Group } from '../core/types';
import type { ParseError } from '../core/parse';

export const copy = {
  title: 'Village Timer',
  help1: 'Trong game, mở Settings → More Settings → Data Export rồi bấm Copy.',
  help2: 'Quay lại đây và bấm "Dán dữ liệu".',
  help3: 'Cài app: trên Android mở menu Chrome và chọn Thêm vào màn hình chính; trên máy tính bấm biểu tượng cài đặt ở thanh địa chỉ.',
  paste: 'Dán dữ liệu',
  placeholder: 'Hoặc dán dữ liệu vào đây',
  delete: 'Xóa',
  exportedAt: 'Xuất lúc {time} ({ago})',
  staleHint: 'Nếu đã dùng sách, búa, thuốc hoặc gem sau lúc xuất, hãy dán dữ liệu mới.',
  noJobs: 'Tài khoản này không có gì đang nâng cấp.',
  error: {
    empty: 'Clipboard đang trống. Hãy bấm Copy trong game rồi thử lại.',
    'not-json': 'Đây không phải dữ liệu xuất từ game, hoặc dữ liệu bị thiếu. Hãy bấm Copy trong game rồi dán lại.',
    'not-export': 'Dữ liệu này thiếu tag hoặc thời gian xuất. Hãy lấy lại từ mục Data Export trong game.',
    clipboard: 'Không đọc được clipboard. Hãy nhấn giữ vào ô bên dưới và chọn Dán.',
  } satisfies Record<ParseError | 'clipboard', string>,
  notice: {
    'kept-newer': 'Dữ liệu vừa dán cũ hơn bản đang lưu nên app giữ bản mới hơn.',
    storage: 'Không lưu được trên máy này. Dữ liệu sẽ mất khi đóng app.',
    unreadable: 'Không đọc được một phần dữ liệu đã lưu. Hãy dán lại dữ liệu từ game.',
    boost: 'Lúc xuất đang có boost nên có thể xong sớm hơn giờ hiển thị.',
    clock: 'Đồng hồ máy đang chậm hơn giờ game. Hãy chỉnh lại giờ của máy để thời gian còn lại chính xác.',
  },
  privacy: 'Dữ liệu chỉ lưu trên máy này, không gửi đi đâu.',
  disclaimer: "This material is unofficial and is not endorsed by Supercell. For more information see Supercell's Fan Content Policy: www.supercell.com/fan-content-policy.",
  credit: 'Dữ liệu tên hạng mục: clash-of-clans-data (MIT).',
  groups: {
    'home-build': 'Làng chính · Công trình',
    'home-hero': 'Làng chính · Anh hùng',
    lab: 'Làng chính · Nghiên cứu',
    pet: 'Làng chính · Thú cưng',
    'builder-build': 'Căn cứ thợ xây · Công trình và anh hùng',
    'builder-lab': 'Căn cứ thợ xây · Nghiên cứu',
    helper: 'Trợ thủ · Hồi chiêu',
    other: 'Khác',
  } satisfies Record<Group, string>,
};
