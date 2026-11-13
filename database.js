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
db.pragma('journal_mode = WAL');

function initDatabase() {
  // 1. Users table (Giám đốc / Quản lý)
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      full_name TEXT NOT NULL,
      role TEXT DEFAULT 'admin',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const adminExists = db.prepare('SELECT id FROM users WHERE username = ?').get('admin');
  if (!adminExists) {
    db.prepare(`
      INSERT INTO users (username, password, full_name, role)
      VALUES (?, ?, ?, ?)
    `).run('admin', '123456', 'Ban Giám Đốc ROSI', 'admin');
  }

  const ketoanExists = db.prepare('SELECT id FROM users WHERE username = ?').get('ketoan');
  if (!ketoanExists) {
    db.prepare(`
      INSERT INTO users (username, password, full_name, role)
      VALUES (?, ?, ?, ?)
    `).run('ketoan', '123456', 'Phòng Kế Toán ROSI', 'accountant');
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
      status TEXT DEFAULT 'active',
      base_salary REAL DEFAULT 3500000,
      commission_rate REAL DEFAULT 75,
      km_rate REAL DEFAULT 4500,
      allowance REAL DEFAULT 600000,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  try {
    db.exec(`ALTER TABLE shippers ADD COLUMN password TEXT DEFAULT '123456';`);
  } catch (e) {}

  // 3. Orders table
  db.exec(`
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_code TEXT NOT NULL UNIQUE,
      trip_type TEXT DEFAULT 'delivery', -- 'delivery' (từ cty giao đi) hoặc 'pickup' (đi nhận về cty) hoặc 'custom'
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
      weight REAL DEFAULT 1,
      cod_amount REAL DEFAULT 0,
      notes TEXT,
      distance_km REAL NOT NULL DEFAULT 0,
      shipping_fee REAL NOT NULL DEFAULT 0,
      shipper_id INTEGER,
      shipper_earning REAL DEFAULT 0,
      status TEXT DEFAULT 'pending',
      route_polyline TEXT,
      completed_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (shipper_id) REFERENCES shippers(id)
    );
  `);

  try {
    db.exec(`ALTER TABLE orders ADD COLUMN trip_type TEXT DEFAULT 'delivery';`);
  } catch (e) {}

  // 4. Settings table
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      description TEXT
    );
  `);

  // 5. Payroll Adjustments
  db.exec(`
    CREATE TABLE IF NOT EXISTS payroll_adjustments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shipper_id INTEGER NOT NULL,
      month_year TEXT NOT NULL,
      bonus REAL DEFAULT 0,
      deduction REAL DEFAULT 0,
      note TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (shipper_id) REFERENCES shippers(id)
    );
  `);

  // Default settings fixed for CÔNG TY TNHH ROSI VIỆT NAM (ĐÀ NẴNG)
  const defaultSettings = [
    { key: 'company_name', value: 'CÔNG TY TNHH ROSI VIỆT NAM', description: 'Tên công ty' },
    { key: 'company_address', value: '29 Đặng Thai Mai, Phường Vĩnh Trung, Quận Thanh Khê, Thành phố Đà Nẵng', description: 'Trụ sở cố định công ty' },
    { key: 'company_phone', value: '0905 123 456', description: 'Hotline công ty' },
    { key: 'company_lat', value: '16.0607366', description: 'Vĩ độ cố định trụ sở Đà Nẵng' },
    { key: 'company_lng', value: '108.2112765', description: 'Kinh độ cố định trụ sở Đà Nẵng' },
    { key: 'base_distance_km', value: '2', description: 'Quãng đường tối thiểu tính cước mở cửa (km)' },
    { key: 'base_price', value: '16000', description: 'Cước mở cửa cho quãng đường tối thiểu (VNĐ)' },
    { key: 'tier1_max_km', value: '10', description: 'Mức khoảng cách bậc 1 (km)' },
    { key: 'tier1_rate', value: '5500', description: 'Đơn giá mỗi km từ cước mở cửa đến bậc 1 (VNĐ/km)' },
    { key: 'tier2_rate', value: '4500', description: 'Đơn giá mỗi km vượt bậc 1 (>10km) (VNĐ/km)' },
    { key: 'salary_calc_method', value: 'trip_percentage', description: 'Cách tính tiền chuyến cho shipper' },
    { key: 'shipper_default_percentage', value: '75', description: 'Tỷ lệ % cước chuyến chia cho shipper (%)' },
    { key: 'shipper_default_km_rate', value: '4500', description: 'Đơn giá tiền công tính trực tiếp theo km cho shipper (VNĐ/km)' }
  ];

  const insertSetting = db.prepare(`
    INSERT INTO settings (key, value, description) VALUES (@key, @value, @description)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, description = excluded.description
  `);

  for (const s of defaultSettings) {
    insertSetting.run(s);
  }

  // Ensure Da Nang sample orders and shippers
  seedRosiDaNangData();
}

function seedRosiDaNangData() {
  // Update or insert default shippers for Da Nang
  const countShippers = db.prepare('SELECT count(*) as count FROM shippers').get().count;
  if (countShippers === 0) {
    const insertShipper = db.prepare(`
      INSERT INTO shippers (name, phone, password, license_plate, vehicle_type, status, base_salary, commission_rate, km_rate, allowance)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertShipper.run('Nguyễn Văn Tuấn', '0912345678', '123456', '43-C1 888.22', 'Xe máy', 'active', 3500000, 75, 4500, 600000);
    insertShipper.run('Trần Minh Hải', '0987654321', '123456', '43-D1 452.19', 'Xe máy', 'active', 3500000, 75, 4500, 600000);
    insertShipper.run('Lê Hoàng Nam', '0903112233', '123456', '43-K2 118.99', 'Xe máy', 'active', 3500000, 80, 5000, 500000);
  } else {
    // Update license plates to 43 (Da Nang) if still old
    db.prepare("UPDATE shippers SET license_plate = '43-C1 888.22' WHERE id = 1").run();
    db.prepare("UPDATE shippers SET license_plate = '43-D1 452.19' WHERE id = 2").run();
    db.prepare("UPDATE shippers SET license_plate = '43-K2 118.99' WHERE id = 3").run();
  }

  // Update company name in users
  db.prepare("UPDATE users SET full_name = 'Ban Giám Đốc ROSI' WHERE username = 'admin'").run();

  // Reset or add sample orders around Da Nang
  const countOrders = db.prepare('SELECT count(*) as count FROM orders').get().count;
  if (countOrders === 0 || countOrders <= 5) {
    db.prepare('DELETE FROM orders').run();

    const insertOrder = db.prepare(`
      INSERT INTO orders (
        order_code, trip_type, sender_name, sender_phone, sender_address, sender_lat, sender_lng,
        receiver_name, receiver_phone, receiver_address, receiver_lat, receiver_lng,
        item_name, weight, cod_amount, notes, distance_km, shipping_fee, shipper_id, shipper_earning, status, completed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const now = new Date();
    const todayStr = now.toISOString();
    const yesterday = new Date(Date.now() - 86400000).toISOString();

    const rosiAddress = '29 Đặng Thai Mai, Phường Vĩnh Trung, Quận Thanh Khê, Thành phố Đà Nẵng';
    const rosiLat = 16.0607366;
    const rosiLng = 108.2112765;

    // Đơn 1: Giao từ ROSI đi Cầu Rồng / Hải Châu (Đã hoàn thành)
    insertOrder.run(
      'ROSI-8801', 'delivery',
      'CÔNG TY TNHH ROSI VIỆT NAM', '0905123456', rosiAddress, rosiLat, rosiLng,
      'Chị Ngọc Mai', '0935111222', '152 Bạch Đằng, Phường Hải Châu 1, Quận Hải Châu, Đà Nẵng', 16.0682, 108.2238,
      'Mỹ phẩm & Hàng đóng gói Rosi', 1.0, 320000, 'Giao giờ hành chính', 2.3, 17650, 1, 13200, 'completed', yesterday
    );

    // Đơn 2: Giao từ ROSI đi Hòa Khánh / Liên Chiểu (Đã hoàn thành)
    insertOrder.run(
      'ROSI-8802', 'delivery',
      'CÔNG TY TNHH ROSI VIỆT NAM', '0905123456', rosiAddress, rosiLat, rosiLng,
      'Anh Quốc Bảo', '0905333444', '54 Nguyễn Lương Bằng, Phường Hòa Khánh Bắc, Quận Liên Chiểu, Đà Nẵng', 16.0766, 108.1501,
      'Đơn hàng linh kiện & vật tư', 2.5, 750000, 'Gọi trước khi đến', 8.2, 50100, 1, 37500, 'completed', todayStr
    );

    // Đơn 3: Tài xế đi lấy hàng từ Chợ Cồn về kho ROSI (Đã hoàn thành)
    insertOrder.run(
      'ROSI-8803', 'pickup',
      'Đại lý Đối tác Chợ Cồn', '0914555666', 'Chợ Cồn, Đường Ông Ích Khiêm, Hải Châu, Đà Nẵng', 16.0694, 108.2148,
      'CÔNG TY TNHH ROSI VIỆT NAM', '0905123456', rosiAddress, rosiLat, rosiLng,
      'Nhận kiện hàng nguyên liệu', 3.0, 0, 'Nhận tại quầy số 12', 1.5, 16000, 2, 12000, 'completed', todayStr
    );

    // Đơn 4: Giao từ ROSI đi Ngũ Hành Sơn (Đang giao)
    insertOrder.run(
      'ROSI-8804', 'delivery',
      'CÔNG TY TNHH ROSI VIỆT NAM', '0905123456', rosiAddress, rosiLat, rosiLng,
      'Chị Thu Trang', '0977888999', '280 Ngũ Hành Sơn, Phường Mỹ An, Quận Ngũ Hành Sơn, Đà Nẵng', 16.0461, 108.2392,
      'Gói hàng quà tặng', 1.2, 450000, 'Khách cần trước 17h', 4.8, 31400, 2, 23550, 'delivering', null
    );

    // Đơn 5: Đơn mới chờ gán tài xế (Đi Sơn Trà)
    insertOrder.run(
      'ROSI-8805', 'delivery',
      'CÔNG TY TNHH ROSI VIỆT NAM', '0905123456', rosiAddress, rosiLat, rosiLng,
      'Anh Thành Nam', '0966222333', '125 Võ Nguyên Giáp, Phường Phước Mỹ, Quận Sơn Trà, Đà Nẵng', 16.0631, 108.2468,
      'Kiện hàng tài liệu hợp đồng', 0.5, 0, 'Giao cho lễ tân tòa nhà', 4.5, 29750, null, 0, 'pending', null
    );
  }
}

module.exports = {
  db,
  initDatabase
};
