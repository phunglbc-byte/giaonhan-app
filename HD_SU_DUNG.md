# HƯỚNG DẪN SỬ DỤNG HỆ THỐNG GIAO NHẬN & XUẤT EXCEL TÍNH LƯƠNG

---

## 1. Phân quyền đăng nhập hệ thống

Hệ thống được chia làm 2 cổng đăng nhập độc lập:

### 👑 Cổng 1: Dành cho Giám đốc / Ban Quản lý (Chạy trên Web Máy tính)
- **Địa chỉ truy cập:** [http://localhost:3000](http://localhost:3000)
- **Tên đăng nhập:** `admin`
- **Mật khẩu:** `123456`
- **Quyền hạn:**
  * Giám sát toàn bộ đơn hàng của công ty, điều phối gán đơn cho tài xế.
  * Bản đồ đo km tự động (OSRM) & định vị lộ trình xe chạy.
  * Quản lý danh sách nhân viên giao nhận (thêm mới, chỉnh sửa mức lương, cấp mật khẩu cho tài xế).
  * Xem bảng lương tháng và **Xuất file Excel (.xlsx) chuẩn cho Kế toán**.
  * Cấu hình bảng giá cước km linh hoạt.

---

### 🏍️ Cổng 2: Dành cho Tài xế / Shipper (Chạy trên App Điện thoại)
- **Địa chỉ mở trên điện thoại (qua Wi-Fi):** `http://192.168.1.25:3000` *(hoặc IP máy tính của bạn)*
- **Tài khoản tài xế mẫu:**
  * **Tài xế Nguyễn Văn Tuấn:** Số điện thoại `0912345678` | Mật khẩu: `123456`
  * **Tài xế Trần Minh Hải:** Số điện thoại `0987654321` | Mật khẩu: `123456`
  * **Tài xế Lê Hoàng Nam:** Số điện thoại `0903112233` | Mật khẩu: `123456`
- **Giao diện App Điện thoại:**
  * Chỉ hiển thị các đơn hàng được Giám đốc gán cho riêng tài xế đó.
  * Tự động lưu đăng nhập, không cần gõ lại mật khẩu khi mở lại app.
  * Nút **"Chỉ đường Maps"**: Bấm 1 chạm để mở Google Maps dẫn đường tới tận nơi.
  * Bấm vào số điện thoại người gửi/nhận để gọi điện thoại tức thì.
  * Nút **"Đã nhận hàng"** và **"Giao thành công"** để cập nhật trạng thái đơn.
  * Tự theo dõi thành tích: Số chuyến đã giao, số km đã chạy hôm nay và tiền công kiếm được.

---

## 2. Cách cài đặt App ra Màn hình chính Điện thoại (PWA)
1. Trên điện thoại mở trình duyệt Safari (iPhone) hoặc Chrome (Android) truy cập: `http://192.168.1.25:3000`
2. **Trên iPhone (Safari):** Bấm biểu tượng Chia sẻ (mũi tên hướng lên) ➔ Chọn **"Thêm vào Màn hình chính" (Add to Home Screen)**.
3. **Trên Android (Chrome):** Bấm dấu 3 chấm góc phải ➔ Chọn **"Cài đặt ứng dụng"** hoặc **"Thêm vào Màn hình chính"**.
4. Ứng dụng sẽ có biểu tượng icon xe giao hàng trên màn hình điện thoại như ứng dụng tải từ AppStore / CH Play!

---

## 3. Xuất file Excel (.xlsx) gửi Kế toán tính lương
1. Giám đốc đăng nhập vào web quản trị ➔ Chọn mục **"Bảng tính lương tháng"**.
2. Chọn **Tháng / Năm** cần chốt lương (ví dụ: Tháng 11/2026).
3. Bấm vào nút màu xanh lá: **"📥 Xuất File Excel Kế Toán (.xlsx)"**.
4. Trình duyệt sẽ tự động tải về file `Bang_Luong_Giao_Nhan_2026-11.xlsx` bao gồm 2 Sheet chuyên nghiệp:
   - **Sheet 1: `Bang_Luong_Tong_Hop`:**
     * STT, Mã nhân viên, Họ tên tài xế, Số điện thoại, Phương tiện / Biển số xe.
     * Số chuyến giao thành công trong tháng.
     * **Tổng quãng đường xe chạy (km)**.
     * **Tiền công chuyến theo km (VNĐ)**.
     * Lương cơ bản, Phụ cấp xăng xe/điện thoại, Tiền thưởng thêm, Khấu trừ phạt.
     * **TỔNG LƯƠNG THỰC LĨNH (VNĐ)**.
     * Dòng Tổng cộng toàn công ty ở dưới cùng.
   - **Sheet 2: `Chi_Tiet_Chuyen_Giao`:**
     * Chi tiết từng chuyến hàng tài xế đã giao trong tháng: Ngày giờ hoàn thành, Mã đơn hàng, Tên tài xế, Điểm lấy hàng, Điểm giao hàng, Quãng đường (km), Cước thu khách, Tiền COD, Tiền công xế nhận.
     * Giúp kế toán đối soát minh bạch 100%, không lo thất thoát hay sai sót số liệu!
