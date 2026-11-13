const Database = require('better-sqlite3');
const path = require('path');

const fs = require('fs');

let dbPath = path.join(__dirname, 'giaonhan.db');
if (process.env.DB_PATH) {
  dbPath = process.env.DB_PATH;
} else if (fs.existsSync('/app/data')) {
  dbPath = '/app/data/giaonhan.db';
}

const db = new Database(dbPath);

// Enable WAL mode for better concurrency
db.pragma('journal_mode = WAL');

function initDatabase() {
  // 1. Users table (Giám đốc / Quản lý)
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      full_name TEXT NOT NULL,
      role TEXT DEFAULT 'admin', -- 'admin', 'manager'
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Default admin user
  const adminExists = db.prepare('SELECT id FROM users WHERE username = ?').get('admin');
  if (!adminExists) {
    db.prepare(`
      INSERT INTO users (username, password, full_name, role)
      VALUES (?, ?, ?, ?)
    `).run('admin', '123456', 'Giám Đốc Điều Hành', 'admin');
  }

  // 2. Shippers table
  db.exec(`
    CREATE TABLE IF NOT EXISTS shippers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT NOT NULL UNIQUE,
      password TEXT DEFAULT '123456',
      license_plate TEXT,
      vehicle_type TEXT DEFAULT 'Xe máy',
      status TEXT DEFAULT 'active', -- active, busy, off
      base_salary REAL DEFAULT 0, -- Lương cứng cơ bản (VNĐ)
      commission_rate REAL DEFAULT 75, -- % hưởng từ cước chuyến (nếu dùng phương pháp % cước)
      km_rate REAL DEFAULT 4500, -- Tiền công VNĐ/km (nếu tính theo km)
      allowance REAL DEFAULT 600000, -- Phụ cấp xăng/điện thoại (VNĐ/tháng)
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Add password column if table existed without it
  try {
    db.exec(`ALTER TABLE shippers ADD COLUMN password TEXT DEFAULT '123456';`);
  } catch (e) {
    // Column already exists
  }

  // 3. Orders table
  db.exec(`
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_code TEXT NOT NULL UNIQUE,
      sender_name TEXT NOT NULL,
      sender_phone TEXT NOT NULL,
      sender_address TEXT NOT NULL,
      sender_lat REAL,
      sender_lng REAL,
      receiver_name TEXT NOT NULL,
      receiver_phone TEXT NOT NULL,
      receiver_address TEXT NOT NULL,
      receiver_lat REAL,
      receiver_lng REAL,
      item_name TEXT DEFAULT 'Hàng tiêu dùng',
      weight REAL DEFAULT 1, -- kg
      cod_amount REAL DEFAULT 0, -- Tiền thu hộ COD (VNĐ)
      notes TEXT,
      distance_km REAL NOT NULL DEFAULT 0,
      shipping_fee REAL NOT NULL DEFAULT 0, -- Tổng tiền cước thu khách
      shipper_id INTEGER,
      shipper_earning REAL DEFAULT 0, -- Tiền shipper nhận từ chuyến này
      status TEXT DEFAULT 'pending', -- pending (chờ gán), assigned (đã gán), delivering (đang giao), completed (thành công), cancelled (đã hủy)
      route_polyline TEXT, -- Dữ liệu tọa độ đường đi để vẽ lại bản đồ
      completed_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (shipper_id) REFERENCES shippers(id)
    );
  `);

  // 4. Settings table
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      description TEXT
    );
  `);

  // 5. Payroll Adjustments (Thưởng/Phạt tháng)
  db.exec(`
    CREATE TABLE IF NOT EXISTS payroll_adjustments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shipper_id INTEGER NOT NULL,
      month_year TEXT NOT NULL, -- YYYY-MM
      bonus REAL DEFAULT 0,
      deduction REAL DEFAULT 0,
      note TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (shipper_id) REFERENCES shippers(id)
    );
  `);

  // Insert default settings if not exists
  const defaultSettings = [
    { key: 'base_distance_km', value: '2', description: 'Quãng đường tối thiểu tính cước mở cửa (km)' },
    { key: 'base_price', value: '16000', description: 'Cước mở cửa cho quãng đường tối thiểu (VNĐ)' },
    { key: 'tier1_max_km', value: '10', description: 'Mức khoảng cách bậc 1 (km)' },
    { key: 'tier1_rate', value: '5500', description: 'Đơn giá mỗi km từ cước mở cửa đến bậc 1 (VNĐ/km)' },
    { key: 'tier2_rate', value: '4500', description: 'Đơn giá mỗi km vượt bậc 1 (>10km) (VNĐ/km)' },
    { key: 'salary_calc_method', value: 'trip_percentage', description: 'Cách tính tiền chuyến cho shipper: trip_percentage (% cước) hoặc km_rate (tiền theo km)' },
    { key: 'shipper_default_percentage', value: '75', description: 'Tỷ lệ % cước chuyến mặc định chia cho shipper (%)' },
    { key: 'shipper_default_km_rate', value: '4500', description: 'Đơn giá tiền công tính trực tiếp theo km cho shipper (VNĐ/km)' },
    { key: 'company_name', value: 'CÔNG TY DỊCH VỤ GIAO NHẬN NHANH', description: 'Tên công ty' },
    { key: 'company_phone', value: '0901 234 567', description: 'Hotline công ty' }
  ];

  const insertSetting = db.prepare(`
    INSERT OR IGNORE INTO settings (key, value, description) VALUES (@key, @value, @description)
  `);

  for (const s of defaultSettings) {
    insertSetting.run(s);
  }

  // Seed initial sample data if empty
  const countShippers = db.prepare('SELECT count(*) as count FROM shippers').get().count;
  if (countShippers === 0) {
    seedSampleData();
  }
}

function seedSampleData() {
  const insertShipper = db.prepare(`
    INSERT INTO shippers (name, phone, password, license_plate, vehicle_type, status, base_salary, commission_rate, km_rate, allowance)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertShipper.run('Nguyễn Văn Tuấn', '0912345678', '123456', '59-S2 839.21', 'Xe máy', 'active', 3000000, 75, 4500, 600000);
  insertShipper.run('Trần Minh Hải', '0987654321', '123456', '59-X1 452.19', 'Xe máy', 'active', 3000000, 75, 4500, 600000);
  insertShipper.run('Lê Hoàng Nam', '0903112233', '123456', '59-K3 118.99', 'Xe máy', 'active', 0, 80, 5000, 500000);

  // Sample orders
  const insertOrder = db.prepare(`
    INSERT INTO orders (
      order_code, sender_name, sender_phone, sender_address, sender_lat, sender_lng,
      receiver_name, receiver_phone, receiver_address, receiver_lat, receiver_lng,
      item_name, weight, cod_amount, notes, distance_km, shipping_fee, shipper_id, shipper_earning, status, completed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const now = new Date();
  const todayStr = now.toISOString();
  const yesterday = new Date(Date.now() - 86400000).toISOString();

  // Đơn 1: Đã giao thành công bởi Tuấn
  insertOrder.run(
    'GN-8801',
    'Kho Q1 - Bến Thành', '0909000111', 'Chợ Bến Thành, Quận 1, TP.HCM', 10.7725, 106.6980,
    'Chị Lan Anh', '0933222111', '86 Lê Thánh Tôn, Bến Nghé, Quận 1, TP.HCM', 10.7774, 106.7018,
    'Hồ sơ hợp đồng gấp', 0.5, 0, 'Giao giờ hành chính', 1.8, 16000, 1, 12000, 'completed', yesterday
  );

  // Đơn 2: Đã giao thành công bởi Tuấn
  insertOrder.run(
    'GN-8802',
    'Shop Thời Trang Daisy', '0909111222', '340 Nguyễn Trãi, Quận 5, TP.HCM', 10.7562, 106.6711,
    'Anh Minh Trí', '0944333222', 'Khu Công Nghệ Cao, TP. Thủ Đức, TP.HCM', 10.8544, 106.7928,
    'Quần áo thời trang 2 kiện', 2.0, 450000, 'Khách cần xem hàng trước khi nhận', 18.5, 98250, 1, 73680, 'completed', todayStr
  );

  // Đơn 3: Đã giao thành công bởi Hải
  insertOrder.run(
    'GN-8803',
    'Cửa hàng Điện Máy Xanh', '0909222333', '180 Hai Bà Trưng, Đa Kao, Quận 1, TP.HCM', 10.7885, 106.6961,
    'Bác Hùng', '0911888999', '215 Hoàng Văn Thụ, Phường 8, Phú Nhuận, TP.HCM', 10.7997, 106.6772,
    'Linh kiện máy tính', 1.2, 850000, 'Hàng dễ vỡ, cẩn thận', 3.6, 24800, 2, 18600, 'completed', todayStr
  );

  // Đơn 4: Đang giao bởi Hải
  insertOrder.run(
    'GN-8804',
    'Nhà Thuốc Long Châu', '0909333444', '379 Cách Mạng Tháng 8, Phường 13, Quận 10, TP.HCM', 10.7816, 106.6706,
    'Chị Thuỷ', '0977666555', '54 Bạch Đằng, Phường 2, Tân Bình, TP.HCM', 10.8123, 106.6669,
    'Thuốc theo toa', 0.8, 230000, 'Giao trước 12h', 4.5, 29750, 2, 22300, 'delivering', null
  );

  // Đơn 5: Đơn mới chờ gán shipper
  insertOrder.run(
    'GN-8805',
    'Cty Bánh Kẹo Á Châu', '0909444555', '125 Điện Biên Phủ, Phường 15, Bình Thạnh, TP.HCM', 10.7972, 106.7061,
    'Anh Phúc', '0966555444', '42 Đinh Tiên Hoàng, Đa Kao, Quận 1, TP.HCM', 10.7901, 106.6983,
    'Bánh sinh nhật trang trí', 1.5, 380000, 'Giao thẳng đến phòng lễ tân', 2.4, 18200, null, 0, 'pending', null
  );
}

module.exports = {
  db,
  initDatabase
};
