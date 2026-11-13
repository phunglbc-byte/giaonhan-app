const express = require('express');
const cors = require('cors');
const path = require('path');
const os = require('os');
const XLSX = require('xlsx');
const { db, initDatabase } = require('./database');
const { calculateShippingFee, calculateShipperEarning } = require('./pricing');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Initialize SQLite database
initDatabase();

// Helper to get settings as key-value object
function getSettingsMap() {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const map = {};
  for (const r of rows) {
    map[r.key] = r.value;
  }
  return map;
}

// -----------------------------------------------------------------------------
// 1. AUTHENTICATION API (ĐĂNG NHẬP GIÁM ĐỐC / TÀI XẾ)
// -----------------------------------------------------------------------------
app.post('/api/auth/login', (req, res) => {
  try {
    const { role, username, phone, password } = req.body;

    if (role === 'admin') {
      // Giám đốc / Quản lý
      const user = db.prepare('SELECT id, username, full_name, role FROM users WHERE username = ? AND password = ?').get(username, password);
      if (!user) {
        return res.status(401).json({ success: false, error: 'Tên đăng nhập hoặc mật khẩu Giám đốc không chính xác' });
      }
      return res.json({
        success: true,
        role: 'admin',
        user: {
          id: user.id,
          username: user.username,
          name: user.full_name,
          role: user.role
        }
      });
    } else if (role === 'shipper') {
      // Tài xế đăng nhập bằng Số điện thoại & Mật khẩu
      const shipper = db.prepare('SELECT id, name, phone, license_plate, vehicle_type, status FROM shippers WHERE phone = ? AND password = ?').get(phone, password);
      if (!shipper) {
        return res.status(401).json({ success: false, error: 'Số điện thoại hoặc mã PIN/mật khẩu tài xế không chính xác' });
      }
      return res.json({
        success: true,
        role: 'shipper',
        user: {
          id: shipper.id,
          name: shipper.name,
          phone: shipper.phone,
          license_plate: shipper.license_plate,
          vehicle_type: shipper.vehicle_type,
          status: shipper.status
        }
      });
    } else {
      return res.status(400).json({ success: false, error: 'Vai trò đăng nhập không hợp lệ' });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// -----------------------------------------------------------------------------
// 2. STATS OVERVIEW API
// -----------------------------------------------------------------------------
app.get('/api/stats/summary', (req, res) => {
  try {
    const todayOrders = db.prepare(`
      SELECT 
        count(*) as total_orders,
        sum(case when status = 'completed' then 1 else 0 end) as completed_orders,
        sum(case when status = 'delivering' then 1 else 0 end) as delivering_orders,
        sum(case when status = 'pending' then 1 else 0 end) as pending_orders,
        coalesce(sum(case when status = 'completed' then shipping_fee else 0 end), 0) as total_revenue,
        coalesce(sum(case when status = 'completed' then distance_km else 0 end), 0) as total_km,
        coalesce(sum(case when status = 'completed' then shipper_earning else 0 end), 0) as total_shipper_earning
      FROM orders
      WHERE date(created_at) = date('now', 'localtime')
    `).get();

    const totalShippers = db.prepare("SELECT count(*) as count FROM shippers WHERE status = 'active'").get().count;

    res.json({
      success: true,
      data: {
        ...todayOrders,
        active_shippers: totalShippers
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// -----------------------------------------------------------------------------
// 3. GEOCODING & ROUTING API (Đo quãng đường qua bản đồ OSRM + Nominatim)
// -----------------------------------------------------------------------------
app.get('/api/geocode/search', async (req, res) => {
  const query = req.query.q;
  if (!query || query.trim().length < 2) {
    return res.json([]);
  }

  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&countrycodes=vn&addressdetails=1&limit=5`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'GiaoNhanApp-VN/1.0 (contact: info@giaonhan.local)'
      }
    });
    if (!response.ok) {
      throw new Error(`Nominatim error: ${response.status}`);
    }
    const data = await response.json();
    const results = data.map(item => ({
      display_name: item.display_name,
      lat: parseFloat(item.lat),
      lon: parseFloat(item.lon),
      name: item.name || item.display_name.split(',')[0]
    }));
    res.json(results);
  } catch (error) {
    console.error('Geocode search failed:', error.message);
    res.json([]);
  }
});

app.post('/api/route/calculate', async (req, res) => {
  const { fromLat, fromLng, toLat, toLng, fromAddress, toAddress } = req.body;

  let startLat = parseFloat(fromLat);
  let startLng = parseFloat(fromLng);
  let endLat = parseFloat(toLat);
  let endLng = parseFloat(toLng);

  try {
    if ((isNaN(startLat) || isNaN(startLng)) && fromAddress) {
      const geo1 = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(fromAddress)}&countrycodes=vn&limit=1`, {
        headers: { 'User-Agent': 'GiaoNhanApp-VN/1.0' }
      }).then(r => r.json());
      if (geo1 && geo1.length > 0) {
        startLat = parseFloat(geo1[0].lat);
        startLng = parseFloat(geo1[0].lon);
      }
    }

    if ((isNaN(endLat) || isNaN(endLng)) && toAddress) {
      const geo2 = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(toAddress)}&countrycodes=vn&limit=1`, {
        headers: { 'User-Agent': 'GiaoNhanApp-VN/1.0' }
      }).then(r => r.json());
      if (geo2 && geo2.length > 0) {
        endLat = parseFloat(geo2[0].lat);
        endLng = parseFloat(geo2[0].lon);
      }
    }

    if (isNaN(startLat) || isNaN(startLng) || isNaN(endLat) || isNaN(endLng)) {
      return res.status(400).json({
        success: false,
        error: 'Chưa xác định được tọa độ 2 điểm lấy hàng và giao hàng.'
      });
    }

    let distanceKm = 0;
    let durationMin = 0;
    let coordinates = [];

    try {
      const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${startLng},${startLat};${endLng},${endLat}?overview=full&geometries=geojson`;
      const osrmRes = await fetch(osrmUrl, { timeout: 7000 });
      if (osrmRes.ok) {
        const routeData = await osrmRes.json();
        if (routeData.code === 'Ok' && routeData.routes && routeData.routes.length > 0) {
          const route = routeData.routes[0];
          distanceKm = parseFloat((route.distance / 1000).toFixed(2));
          durationMin = Math.round(route.duration / 60);
          coordinates = route.geometry.coordinates;
        }
      }
    } catch (osrmErr) {
      console.warn('OSRM request failed, falling back to Haversine:', osrmErr.message);
    }

    if (!distanceKm || distanceKm <= 0) {
      const R = 6371; // km
      const dLat = (endLat - startLat) * Math.PI / 180;
      const dLon = (endLng - startLng) * Math.PI / 180;
      const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(startLat * Math.PI / 180) * Math.cos(endLat * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      const crowDist = R * c;
      distanceKm = parseFloat((crowDist * 1.28).toFixed(2));
      durationMin = Math.round(distanceKm * 3);
      coordinates = [
        [startLng, startLat],
        [endLng, endLat]
      ];
    }

    const settings = getSettingsMap();
    const shippingFee = calculateShippingFee(distanceKm, settings);

    res.json({
      success: true,
      data: {
        distance_km: distanceKm,
        duration_minutes: durationMin,
        shipping_fee: shippingFee,
        start_point: { lat: startLat, lng: startLng },
        end_point: { lat: endLat, lng: endLng },
        route_coordinates: coordinates
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// -----------------------------------------------------------------------------
// 4. ORDERS API
// -----------------------------------------------------------------------------
app.get('/api/orders', (req, res) => {
  try {
    const { status, shipper_id, date } = req.query;
    let query = `
      SELECT o.*, s.name as shipper_name, s.phone as shipper_phone, s.license_plate as shipper_license_plate
      FROM orders o
      LEFT JOIN shippers s ON o.shipper_id = s.id
      WHERE 1=1
    `;
    const params = [];

    if (status && status !== 'all') {
      query += ` AND o.status = ?`;
      params.push(status);
    }
    if (shipper_id) {
      query += ` AND o.shipper_id = ?`;
      params.push(shipper_id);
    }
    if (date) {
      query += ` AND date(o.created_at) = ?`;
      params.push(date);
    }

    query += ` ORDER BY o.id DESC`;

    const orders = db.prepare(query).all(...params);
    res.json({ success: true, data: orders });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/orders', (req, res) => {
  try {
    const {
      sender_name, sender_phone, sender_address, sender_lat, sender_lng,
      receiver_name, receiver_phone, receiver_address, receiver_lat, receiver_lng,
      item_name, weight, cod_amount, notes, distance_km, shipping_fee, shipper_id, route_polyline
    } = req.body;

    const settings = getSettingsMap();
    const dist = parseFloat(distance_km) || 0;
    const fee = shipping_fee !== undefined && shipping_fee !== null ? parseFloat(shipping_fee) : calculateShippingFee(dist, settings);

    let earning = 0;
    let orderStatus = 'pending';

    if (shipper_id) {
      const shipper = db.prepare('SELECT * FROM shippers WHERE id = ?').get(shipper_id);
      if (shipper) {
        earning = calculateShipperEarning(fee, dist, shipper, settings);
        orderStatus = 'assigned';
      }
    }

    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const order_code = `ROSI-${randomSuffix}`;

    const stmt = db.prepare(`
      INSERT INTO orders (
        order_code, sender_name, sender_phone, sender_address, sender_lat, sender_lng,
        receiver_name, receiver_phone, receiver_address, receiver_lat, receiver_lng,
        item_name, weight, cod_amount, notes, distance_km, shipping_fee, shipper_id, shipper_earning, status, route_polyline
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      order_code, sender_name, sender_phone, sender_address, sender_lat || null, sender_lng || null,
      receiver_name, receiver_phone, receiver_address, receiver_lat || null, receiver_lng || null,
      item_name || 'Hàng tiêu dùng', weight || 1, cod_amount || 0, notes || '',
      dist, fee, shipper_id || null, earning, orderStatus, route_polyline ? JSON.stringify(route_polyline) : null
    );

    const newOrder = db.prepare('SELECT * FROM orders WHERE id = ?').get(result.lastInsertRowid);
    res.json({ success: true, data: newOrder });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.put('/api/orders/:id', (req, res) => {
  try {
    const id = req.params.id;
    const current = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
    if (!current) {
      return res.status(404).json({ success: false, error: 'Không tìm thấy đơn hàng' });
    }

    const {
      status, shipper_id, distance_km, shipping_fee, notes, cod_amount
    } = req.body;

    const settings = getSettingsMap();
    let newStatus = status || current.status;
    let newShipperId = shipper_id !== undefined ? (shipper_id ? parseInt(shipper_id) : null) : current.shipper_id;
    let newDist = distance_km !== undefined ? parseFloat(distance_km) : current.distance_km;
    let newFee = shipping_fee !== undefined ? parseFloat(shipping_fee) : current.shipping_fee;

    let newEarning = current.shipper_earning;
    if (newShipperId) {
      const shipper = db.prepare('SELECT * FROM shippers WHERE id = ?').get(newShipperId);
      if (shipper) {
        newEarning = calculateShipperEarning(newFee, newDist, shipper, settings);
        if (newStatus === 'pending') {
          newStatus = 'assigned';
        }
      }
    } else if (newShipperId === null) {
      newEarning = 0;
      if (newStatus === 'assigned' || newStatus === 'delivering') {
        newStatus = 'pending';
      }
    }

    let completedAt = current.completed_at;
    if (newStatus === 'completed' && current.status !== 'completed') {
      completedAt = new Date().toISOString();
    } else if (newStatus !== 'completed') {
      completedAt = null;
    }

    db.prepare(`
      UPDATE orders SET
        status = ?,
        shipper_id = ?,
        distance_km = ?,
        shipping_fee = ?,
        shipper_earning = ?,
        notes = coalesce(?, notes),
        cod_amount = coalesce(?, cod_amount),
        completed_at = ?
      WHERE id = ?
    `).run(
      newStatus, newShipperId, newDist, newFee, newEarning,
      notes !== undefined ? notes : null,
      cod_amount !== undefined ? cod_amount : null,
      completedAt, id
    );

    const updated = db.prepare(`
      SELECT o.*, s.name as shipper_name, s.phone as shipper_phone
      FROM orders o
      LEFT JOIN shippers s ON o.shipper_id = s.id
      WHERE o.id = ?
    `).get(id);

    res.json({ success: true, data: updated });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.delete('/api/orders/:id', (req, res) => {
  try {
    const id = req.params.id;
    db.prepare('DELETE FROM orders WHERE id = ?').run(id);
    res.json({ success: true, message: 'Đã xóa đơn hàng thành công' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// -----------------------------------------------------------------------------
// 5. SHIPPERS (NHÂN VIÊN GIAO NHẬN) API
// -----------------------------------------------------------------------------
app.get('/api/shippers', (req, res) => {
  try {
    const shippers = db.prepare(`
      SELECT s.id, s.name, s.phone, s.license_plate, s.vehicle_type, s.status,
             s.base_salary, s.commission_rate, s.km_rate, s.allowance, s.created_at,
        (SELECT count(*) FROM orders WHERE shipper_id = s.id AND status IN ('assigned', 'delivering')) as active_trips,
        (SELECT count(*) FROM orders WHERE shipper_id = s.id AND status = 'completed') as total_completed_trips,
        (SELECT coalesce(sum(distance_km), 0) FROM orders WHERE shipper_id = s.id AND status = 'completed') as total_km_run
      FROM shippers s
      ORDER BY s.id ASC
    `).all();
    res.json({ success: true, data: shippers });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/shippers', (req, res) => {
  try {
    const { name, phone, password, license_plate, vehicle_type, base_salary, commission_rate, km_rate, allowance } = req.body;
    if (!name || !phone) {
      return res.status(400).json({ success: false, error: 'Họ tên và số điện thoại là bắt buộc' });
    }

    const stmt = db.prepare(`
      INSERT INTO shippers (name, phone, password, license_plate, vehicle_type, base_salary, commission_rate, km_rate, allowance)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      name, phone, password || '123456', license_plate || '', vehicle_type || 'Xe máy',
      parseFloat(base_salary) || 0,
      parseFloat(commission_rate) || 75,
      parseFloat(km_rate) || 4500,
      parseFloat(allowance) || 600000
    );

    const newShipper = db.prepare('SELECT id, name, phone, license_plate, vehicle_type, status FROM shippers WHERE id = ?').get(result.lastInsertRowid);
    res.json({ success: true, data: newShipper });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.put('/api/shippers/:id', (req, res) => {
  try {
    const id = req.params.id;
    const { name, phone, password, license_plate, vehicle_type, status, base_salary, commission_rate, km_rate, allowance } = req.body;

    db.prepare(`
      UPDATE shippers SET
        name = coalesce(?, name),
        phone = coalesce(?, phone),
        password = coalesce(?, password),
        license_plate = coalesce(?, license_plate),
        vehicle_type = coalesce(?, vehicle_type),
        status = coalesce(?, status),
        base_salary = coalesce(?, base_salary),
        commission_rate = coalesce(?, commission_rate),
        km_rate = coalesce(?, km_rate),
        allowance = coalesce(?, allowance)
      WHERE id = ?
    `).run(
      name, phone, password, license_plate, vehicle_type, status,
      base_salary !== undefined ? parseFloat(base_salary) : null,
      commission_rate !== undefined ? parseFloat(commission_rate) : null,
      km_rate !== undefined ? parseFloat(km_rate) : null,
      allowance !== undefined ? parseFloat(allowance) : null,
      id
    );

    const updated = db.prepare('SELECT id, name, phone, license_plate, vehicle_type, status FROM shippers WHERE id = ?').get(id);
    res.json({ success: true, data: updated });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.delete('/api/shippers/:id', (req, res) => {
  try {
    const id = req.params.id;
    db.prepare("UPDATE orders SET shipper_id = NULL, status = 'pending' WHERE shipper_id = ? AND status IN ('assigned', 'delivering')").run(id);
    db.prepare('DELETE FROM shippers WHERE id = ?').run(id);
    res.json({ success: true, message: 'Đã xóa nhân viên giao nhận' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// -----------------------------------------------------------------------------
// 6. MONTHLY PAYROLL & SALARY CALCULATION API
// -----------------------------------------------------------------------------
function computePayrollData(monthYear) {
  const shippers = db.prepare('SELECT * FROM shippers ORDER BY id ASC').all();

  return shippers.map((shipper, idx) => {
    const ordersInMonth = db.prepare(`
      SELECT * FROM orders 
      WHERE shipper_id = ? 
        AND status = 'completed'
        AND strftime('%Y-%m', completed_at) = ?
      ORDER BY completed_at ASC
    `).all(shipper.id, monthYear);

    const totalTrips = ordersInMonth.length;
    const totalKm = ordersInMonth.reduce((acc, o) => acc + (parseFloat(o.distance_km) || 0), 0);
    const totalTripEarning = ordersInMonth.reduce((acc, o) => acc + (parseFloat(o.shipper_earning) || 0), 0);

    const adjustment = db.prepare(`
      SELECT coalesce(sum(bonus), 0) as bonus, coalesce(sum(deduction), 0) as deduction, group_concat(note, '; ') as notes
      FROM payroll_adjustments
      WHERE shipper_id = ? AND month_year = ?
    `).get(shipper.id, monthYear);

    const baseSalary = parseFloat(shipper.base_salary) || 0;
    const allowance = parseFloat(shipper.allowance) || 0;
    const bonus = parseFloat(adjustment?.bonus) || 0;
    const deduction = parseFloat(adjustment?.deduction) || 0;

    const totalSalary = baseSalary + totalTripEarning + allowance + bonus - deduction;

    return {
      stt: idx + 1,
      shipper_id: shipper.id,
      shipper_code: `SHP-${String(shipper.id).padStart(3, '0')}`,
      name: shipper.name,
      phone: shipper.phone,
      license_plate: shipper.license_plate,
      vehicle_type: shipper.vehicle_type,
      month_year: monthYear,
      total_trips: totalTrips,
      total_km: parseFloat(totalKm.toFixed(2)),
      total_trip_earning: totalTripEarning,
      base_salary: baseSalary,
      allowance: allowance,
      bonus: bonus,
      deduction: deduction,
      total_salary: totalSalary,
      adjustment_notes: adjustment?.notes || '',
      orders: ordersInMonth
    };
  });
}

app.get('/api/payroll', (req, res) => {
  try {
    const monthYear = req.query.month_year || new Date().toISOString().slice(0, 7);
    const payrollList = computePayrollData(monthYear);

    res.json({
      success: true,
      month_year: monthYear,
      data: payrollList
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/payroll/adjustment', (req, res) => {
  try {
    const { shipper_id, month_year, bonus, deduction, note } = req.body;
    if (!shipper_id || !month_year) {
      return res.status(400).json({ success: false, error: 'Thiếu thông tin shipper hoặc tháng' });
    }

    db.prepare(`
      INSERT INTO payroll_adjustments (shipper_id, month_year, bonus, deduction, note)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      shipper_id,
      month_year,
      parseFloat(bonus) || 0,
      parseFloat(deduction) || 0,
      note || ''
    );

    res.json({ success: true, message: 'Đã cập nhật thưởng/phạt thành công' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// -----------------------------------------------------------------------------
// 7. XUẤT FILE EXCEL CHO KẾ TOÁN TÍNH LƯƠNG (.XLSX)
// -----------------------------------------------------------------------------
app.get('/api/payroll/export-excel', (req, res) => {
  try {
    const monthYear = req.query.month_year || new Date().toISOString().slice(0, 7);
    const payrollList = computePayrollData(monthYear);
    const settings = getSettingsMap();
    const companyName = settings.company_name || 'CÔNG TY TNHH ROSI VIỆT NAM';
    const companyAddress = settings.company_address || '29 Đặng Thai Mai, Phường Vĩnh Trung, Quận Thanh Khê, Thành phố Đà Nẵng';

    // 1. Tạo Sheet 1: Bảng Lương Tổng Hợp
    const summaryRows = [
      [`BẢNG LƯƠNG NHÂN VIÊN GIAO NHẬN THEO QUÃNG ĐƯỜNG (KM)`],
      [`Đơn vị: ${companyName}`],
      [`Trụ sở cố định: ${companyAddress}`],
      [`Kỳ tính lương: Tháng ${monthYear.split('-')[1]} năm ${monthYear.split('-')[0]}`],
      [], // Dòng trống
      [
        'STT', 'Mã NV', 'Họ và Tên Tài Xế', 'Số Điện Thoại', 'Phương Tiện / Biển Số',
        'Số Chuyến Giao', 'Tổng Quãng Đường (km)', 'Tiền Công Chuyến/Km (VNĐ)',
        'Lương Cơ Bản (VNĐ)', 'Phụ Cấp Xăng/ĐT (VNĐ)', 'Thưởng Thêm (VNĐ)',
        'Khấu Trừ Phạt (VNĐ)', 'TỔNG THỰC LĨNH (VNĐ)', 'Ghi Chú'
      ]
    ];

    let totalAllTrips = 0;
    let totalAllKm = 0;
    let totalAllTripEarning = 0;
    let totalAllSalary = 0;

    payrollList.forEach(p => {
      totalAllTrips += p.total_trips;
      totalAllKm += p.total_km;
      totalAllTripEarning += p.total_trip_earning;
      totalAllSalary += p.total_salary;

      summaryRows.push([
        p.stt,
        p.shipper_code,
        p.name,
        p.phone,
        `${p.vehicle_type} - ${p.license_plate || ''}`,
        p.total_trips,
        p.total_km,
        p.total_trip_earning,
        p.base_salary,
        p.allowance,
        p.bonus,
        p.deduction,
        p.total_salary,
        p.adjustment_notes
      ]);
    });

    // Dòng Tổng Cộng
    summaryRows.push([
      'TỔNG', '', '', '', '',
      totalAllTrips,
      parseFloat(totalAllKm.toFixed(2)),
      totalAllTripEarning,
      '', '', '', '',
      totalAllSalary,
      ''
    ]);

    // 2. Tạo Sheet 2: Chi Tiết Từng Chuyến Hàng Giao Thành Công
    const orderRows = [
      [`CHI TIẾT CÁC CHUYẾN GIAO HÀNG TRONG THÁNG ${monthYear}`],
      [],
      [
        'STT', 'Ngày Hoàn Thành', 'Mã Đơn', 'Tài Xế Phụ Trách', 'Số Điện Thoại Xế',
        'Người Gửi / Điểm Lấy', 'Địa Chỉ Lấy Hàng',
        'Người Nhận / Khách Hàng', 'Địa Chỉ Giao Hàng',
        'Quãng Đường (km)', 'Cước Thu Khách (VNĐ)', 'Tiền COD Thu Hộ (VNĐ)', 'Tiền Công Xế Nhận (VNĐ)'
      ]
    ];

    let orderStt = 1;
    payrollList.forEach(p => {
      p.orders.forEach(o => {
        orderRows.push([
          orderStt++,
          o.completed_at ? o.completed_at.slice(0, 16).replace('T', ' ') : '',
          o.order_code,
          p.name,
          p.phone,
          `${o.sender_name} (${o.sender_phone})`,
          o.sender_address,
          `${o.receiver_name} (${o.receiver_phone})`,
          o.receiver_address,
          o.distance_km,
          o.shipping_fee,
          o.cod_amount,
          o.shipper_earning
        ]);
      });
    });

    // Build XLSX Workbook
    const wb = XLSX.utils.book_new();

    const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
    const wsOrders = XLSX.utils.aoa_to_sheet(orderRows);

    // Set column widths for Sheet 1
    wsSummary['!cols'] = [
      { wch: 6 },  // STT
      { wch: 10 }, // Mã NV
      { wch: 22 }, // Họ tên
      { wch: 14 }, // SĐT
      { wch: 24 }, // Phương tiện
      { wch: 15 }, // Số chuyến
      { wch: 20 }, // Tổng km
      { wch: 24 }, // Tiền công km
      { wch: 18 }, // Lương cứng
      { wch: 18 }, // Phụ cấp
      { wch: 16 }, // Thưởng
      { wch: 16 }, // Phạt
      { wch: 22 }, // TỔNG THỰC LĨNH
      { wch: 26 }  // Ghi chú
    ];

    // Set column widths for Sheet 2
    wsOrders['!cols'] = [
      { wch: 6 },  // STT
      { wch: 18 }, // Ngày
      { wch: 12 }, // Mã đơn
      { wch: 20 }, // Tài xế
      { wch: 14 }, // SĐT xế
      { wch: 25 }, // Người gửi
      { wch: 35 }, // ĐC lấy
      { wch: 25 }, // Người nhận
      { wch: 35 }, // ĐC giao
      { wch: 15 }, // Km
      { wch: 18 }, // Cước
      { wch: 18 }, // COD
      { wch: 20 }  // Công xế
    ];

    XLSX.utils.book_append_sheet(wb, wsSummary, 'Bang_Luong_Tong_Hop');
    XLSX.utils.book_append_sheet(wb, wsOrders, 'Chi_Tiet_Chuyen_Giao');

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    const fileName = `Bang_Luong_ROSI_Thang_${monthYear}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send(buffer);
  } catch (error) {
    console.error('Export excel error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// -----------------------------------------------------------------------------
// 8. SETTINGS API
// -----------------------------------------------------------------------------
app.get('/api/settings', (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM settings').all();
    res.json({ success: true, data: rows });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.put('/api/settings', (req, res) => {
  try {
    const settings = req.body;
    const stmt = db.prepare('INSERT OR REPLACE INTO settings (key, value, description) VALUES (?, ?, (SELECT description FROM settings WHERE key = ?))');

    const updateMany = db.transaction((obj) => {
      for (const [k, v] of Object.entries(obj)) {
        stmt.run(k, String(v), k);
      }
    });

    updateMany(settings);
    res.json({ success: true, message: 'Đã lưu cấu hình bảng giá và công ty thành công' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Fallback to index.html for SPA
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`======================================================`);
  console.log(`🚀 PHẦN MỀM QUẢN LÝ GIAO NHẬN & TÍNH LƯƠNG THEO KM`);
  console.log(`======================================================`);
  console.log(`📍 Giám đốc Quản lý (Web): http://localhost:${PORT}`);

  const interfaces = os.networkInterfaces();
  for (const devName in interfaces) {
    const iface = interfaces[devName];
    for (let i = 0; i < iface.length; i++) {
      const alias = iface[i];
      if (alias.family === 'IPv4' && !alias.internal) {
        console.log(`📱 Tài xế mở trên Điện thoại: http://${alias.address}:${PORT}`);
      }
    }
  }
  console.log(`======================================================`);
});
