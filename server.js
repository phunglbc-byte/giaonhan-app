const express = require('express');
const cors = require('cors');
const path = require('path');
const os = require('os');
const XLSX = require('xlsx');
const webpush = require('web-push');
const { db, initDatabase } = require('./database');
const { calculateShippingFee, calculateShipperEarning } = require('./pricing');
const { ROSI_HUB, DA_NANG_LOCATIONS, matchDaNangLocation, calculateHaversineKm, removeVietnameseTones } = require('./danang_geo');

const app = express();
const PORT = process.env.PORT || 3000;

// VAPID keys for Web Push Notifications (Lock screen alert when phone is off)
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || 'BOHHsPuGAsayvQfCXBNVv_7ciI650JzzEd3AGvGipNG6U0bStyjda4VHD_-pzjMoL0GFn1UD7EKru-Nksr8Ua-I';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || 'mTNZQMuvOiEnrLBUSRlAKbfZFLNwugtuNQITBzahVOg';
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:admin@rosi.vn';

try {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
} catch (e) {
  console.error('Failed to configure VAPID details:', e.message);
}

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Initialize SQLite database
initDatabase();

// Web Push Notification Helper
async function sendPushNotification({ shipperId, title, body, url, orderId }) {
  try {
    let subs = [];
    if (shipperId) {
      subs = db.prepare('SELECT * FROM push_subscriptions WHERE shipper_id = ?').all(shipperId);
    } else {
      subs = db.prepare('SELECT * FROM push_subscriptions').all();
    }

    if (!subs || subs.length === 0) {
      console.log(`[PUSH] No subscriptions found for shipperId=${shipperId || 'broadcast'}`);
      return { sent: 0 };
    }

    const payload = JSON.stringify({
      title: title || '⚡ ĐƠN HÀNG MỚI - ROSI EXPRESS',
      body: body || 'Có đơn hàng mới cần giao! Chạm vào đây để nhận đơn.',
      url: url || '/?tab=driver-trips',
      orderId: orderId || null
    });

    let sentCount = 0;
    for (const sub of subs) {
      const pushSub = {
        endpoint: sub.endpoint,
        keys: {
          p256dh: sub.p256dh,
          auth: sub.auth
        }
      };

      try {
        await webpush.sendNotification(pushSub, payload);
        sentCount++;
      } catch (err) {
        if (err.statusCode === 404 || err.statusCode === 410) {
          console.log(`[PUSH] Cleaned expired subscription id=${sub.id}`);
          db.prepare('DELETE FROM push_subscriptions WHERE id = ?').run(sub.id);
        } else {
          console.warn(`[PUSH] Send error:`, err.message);
        }
      }
    }
    console.log(`[PUSH] Successfully sent ${sentCount} notifications`);
    return { sent: sentCount };
  } catch (error) {
    console.error('[PUSH ERROR]', error.message);
    return { error: error.message };
  }
}

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
// 1. AUTHENTICATION API (ĐĂNG NHẬP GIÁM ĐỐC / KẾ TOÁN / TÀI XẾ)
// -----------------------------------------------------------------------------
app.post('/api/auth/login', (req, res) => {
  try {
    const { role, username, phone, password } = req.body;

    if (role === 'admin' || role === 'accountant') {
      // Giám đốc / Kế toán đăng nhập vào hệ thống quản lý
      const user = db.prepare('SELECT id, username, full_name, role FROM users WHERE username = ? AND password = ?').get(username, password);
      if (!user) {
        return res.status(401).json({ success: false, error: 'Tên đăng nhập hoặc mật khẩu quản lý không chính xác' });
      }
      return res.json({
        success: true,
        role: user.role, // 'admin' hoặc 'accountant'
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
        return res.status(401).json({ success: false, error: 'Số điện thoại hoặc mã PIN tài xế không chính xác' });
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
// WEB PUSH NOTIFICATION API (THÔNG BÁO MÀN HÌNH KHÓA CHO ĐIỆN THOẠI)
// -----------------------------------------------------------------------------
app.get('/api/push-public-key', (req, res) => {
  res.json({ success: true, publicKey: VAPID_PUBLIC_KEY });
});

app.post('/api/push-subscribe', (req, res) => {
  try {
    const { endpoint, p256dh, auth, shipper_id, user_id, role } = req.body;
    if (!endpoint || !p256dh || !auth) {
      return res.status(400).json({ success: false, error: 'Thiếu thông tin endpoint hoặc keys' });
    }

    const existing = db.prepare('SELECT id FROM push_subscriptions WHERE endpoint = ?').get(endpoint);
    if (existing) {
      db.prepare(`
        UPDATE push_subscriptions 
        SET shipper_id = coalesce(?, shipper_id), user_id = coalesce(?, user_id), role = coalesce(?, role), p256dh = ?, auth = ?
        WHERE id = ?
      `).run(shipper_id || null, user_id || null, role || null, p256dh, auth, existing.id);
    } else {
      db.prepare(`
        INSERT INTO push_subscriptions (user_id, shipper_id, role, endpoint, p256dh, auth)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(user_id || null, shipper_id || null, role || null, endpoint, p256dh, auth);
    }

    res.json({ success: true, message: 'Đăng ký nhận thông báo đẩy thành công' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/test-push', async (req, res) => {
  try {
    const { shipper_id } = req.body;
    const result = await sendPushNotification({
      shipperId: shipper_id || null,
      title: '🔔 THỬ NGHIỆM CHUÔNG BÁO ROSI',
      body: 'Chúc mừng! Điện thoại đã kết nối nhận chuông báo và thông báo màn hình khóa thành công!',
      url: '/?tab=driver-trips'
    });
    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
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
        sum(case when status = 'assigned' then 1 else 0 end) as assigned_orders,
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
// 3. GEOCODING & ROUTING API (TẬP TRUNG TẠI ĐÀ NẴNG - KHÔNG BAO GIỜ LỖI)
// -----------------------------------------------------------------------------
app.get('/api/geocode/search', async (req, res) => {
  const query = req.query.q;
  if (!query || query.trim().length < 1) {
    return res.json([]);
  }

  // Tách số nhà nếu người dùng có gõ (ví dụ: "120 Nguyễn Văn Linh", "54/2 Nguyễn Lương Bằng", "Số 15 Lê Duẩn")
  let cleanRaw = query.trim();
  let housePrefix = '';
  const houseMatch = cleanRaw.match(/^((?:số\s+)?\d+[\w\/\-\.]*)\s+(.*)$/i);
  if (houseMatch) {
    housePrefix = houseMatch[1];
    cleanRaw = houseMatch[2];
  }

  const cleanQ = removeVietnameseTones(cleanRaw);
  const fullCleanQ = removeVietnameseTones(query.trim());
  const results = [];

  // 1. Tìm trong từ điển Đà Nẵng trước (phản hồi tức thì <1ms, không bị chặn mạng)
  for (const loc of DA_NANG_LOCATIONS) {
    for (const kw of loc.keywords) {
      const cleanKw = removeVietnameseTones(kw);
      if (cleanKw.includes(cleanQ) || cleanQ.includes(cleanKw) || fullCleanQ.includes(cleanKw)) {
        const displayName = housePrefix ? `${housePrefix} ${loc.name.replace(/^đường\s+/i, '')}` : loc.name;
        const shortName = housePrefix ? `${housePrefix} ${loc.name.split(',')[0].replace(/^đường\s+/i, '')}` : loc.name.split(',')[0];
        if (!results.find(r => r.display_name === displayName)) {
          results.push({
            display_name: displayName,
            name: shortName,
            lat: loc.lat,
            lon: loc.lng
          });
        }
        break;
      }
    }
    if (results.length >= 6) break;
  }

  // Nếu kết quả từ điển ít hơn 3 và query có độ dài vừa phải, thử tìm thêm qua Nominatim
  if (results.length < 3 && query.length >= 3) {
    try {
      const qWithDaNang = cleanQ.includes('da nang') ? query : `${query}, Da Nang, Vietnam`;
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(qWithDaNang)}&countrycodes=vn&limit=4`;
      const ctrl = new AbortController();
      const timeoutId = setTimeout(() => ctrl.abort(), 2000); // 2s timeout
      
      const response = await fetch(url, {
        headers: { 'User-Agent': 'RosiDelivery/1.0' },
        signal: ctrl.signal
      });
      clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json();
        data.forEach(item => {
          if (!results.find(r => Math.abs(r.lat - parseFloat(item.lat)) < 0.001 && Math.abs(r.lon - parseFloat(item.lon)) < 0.001)) {
            results.push({
              display_name: item.display_name,
              name: item.name || item.display_name.split(',')[0],
              lat: parseFloat(item.lat),
              lon: parseFloat(item.lon)
            });
          }
        });
      }
    } catch (e) {
      // Bỏ qua lỗi Nominatim, đã có từ điển nội bộ
    }
  }

  // Luôn đảm bảo có kết quả trả về
  if (results.length === 0) {
    const fallback = matchDaNangLocation(query);
    if (fallback) {
      results.push({
        display_name: `${query.trim()}, Đà Nẵng`,
        name: query.trim(),
        lat: fallback.lat,
        lon: fallback.lng
      });
    }
  }

  res.json(results);
});

// REVERSE GEOCODING (Tìm tên địa chỉ khi chạm/ghim trên bản đồ)
app.get('/api/geocode/reverse', async (req, res) => {
  const lat = parseFloat(req.query.lat);
  const lng = parseFloat(req.query.lng);

  if (isNaN(lat) || isNaN(lng)) {
    return res.status(400).json({ success: false, error: 'Tọa độ không hợp lệ' });
  }

  // 1. Kiểm tra trụ sở ROSI
  const dToRosi = calculateHaversineKm(lat, lng, ROSI_HUB.lat, ROSI_HUB.lng);
  if (dToRosi < 0.1) {
    return res.json({
      success: true,
      address: ROSI_HUB.address,
      name: ROSI_HUB.name,
      district: 'Thanh Khê',
      city: 'Đà Nẵng'
    });
  }

  // 2. Tra trong từ điển Đà Nẵng xem có gần địa điểm nào đã biết không (trong bán kính 300m)
  let closest = null;
  let minD = 999;
  for (const loc of DA_NANG_LOCATIONS) {
    const d = calculateHaversineKm(lat, lng, loc.lat, loc.lng);
    if (d < minD) {
      minD = d;
      closest = loc;
    }
  }

  // 3. Tra cứu nhanh Nominatim reverse (1.8s timeout)
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 1800);
    const resp = await fetch(url, {
      headers: { 'User-Agent': 'RosiDelivery/1.0' },
      signal: ctrl.signal
    });
    clearTimeout(timer);

    if (resp.ok) {
      const data = await resp.json();
      if (data && data.address) {
        const a = data.address;
        const houseNo = a.house_number || '';
        const road = a.road || a.pedestrian || a.suburb || '';
        const district = a.city_district || a.suburb || a.quarter || '';
        const parts = [
          houseNo ? `${houseNo} ${road}` : road,
          district,
          'Đà Nẵng'
        ].filter(Boolean);

        const shortAddr = parts.join(', ');
        return res.json({
          success: true,
          address: shortAddr || data.display_name,
          display_name: data.display_name,
          road,
          district,
          city: 'Đà Nẵng'
        });
      }
    }
  } catch (e) {}

  // 4. Nếu gần địa điểm trong từ điển (dưới 500m)
  if (closest && minD <= 0.5) {
    return res.json({
      success: true,
      address: closest.name,
      matched: closest.name,
      city: 'Đà Nẵng'
    });
  }

  // 5. Fallback vị trí ghim
  res.json({
    success: true,
    address: `Vị trí đã ghim (${lat.toFixed(4)}, ${lng.toFixed(4)}), Đà Nẵng`,
    city: 'Đà Nẵng'
  });
});

// Caches for lightning-fast repeated queries and rate-limit prevention
const geocodeCache = new Map();
const routeCache = new Map();

async function resolveCoordinates(address, providedLat, providedLng, district = '') {
  let lat = parseFloat(providedLat);
  let lng = parseFloat(providedLng);

  if (!isNaN(lat) && !isNaN(lng) && lat !== 0) {
    return { lat, lng, source: 'provided' };
  }

  if (!address || typeof address !== 'string' || address.trim() === '') {
    return { lat: ROSI_HUB.lat, lng: ROSI_HUB.lng, source: 'hub_default' };
  }

  let cleanAddr = address.trim();
  if (district && !cleanAddr.toLowerCase().includes(district.toLowerCase())) {
    cleanAddr = `${cleanAddr}, Quận ${district}`;
  }

  const cleanQ = removeVietnameseTones(cleanAddr);

  // 1. Kiểm tra trụ sở ROSI
  if (cleanQ.includes('dang thai mai') || cleanQ.includes('rosi') || cleanQ.includes('vinh trung') || cleanQ.includes('29 dang thai mai')) {
    return { lat: ROSI_HUB.lat, lng: ROSI_HUB.lng, source: 'hub' };
  }

  // 2. Kiểm tra bộ nhớ đệm (Cache)
  if (geocodeCache.has(cleanQ)) {
    return geocodeCache.get(cleanQ);
  }

  // 3. Tra từ điển nội bộ Đà Nẵng
  const match = matchDaNangLocation(cleanAddr);
  if (match) {
    const res = { lat: match.lat, lng: match.lng, source: 'dictionary' };
    geocodeCache.set(cleanQ, res);
    return res;
  }

  // 4. Tra cứu trực tuyến qua Nominatim (OpenStreetMap) với thời gian chờ ngắn
  try {
    const qWithDaNang = cleanQ.includes('da nang') ? cleanAddr : `${cleanAddr}, Da Nang, Vietnam`;
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(qWithDaNang)}&countrycodes=vn&limit=1`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 2000);
    const resp = await fetch(url, {
      headers: { 'User-Agent': 'RosiDelivery/1.0' },
      signal: ctrl.signal
    });
    clearTimeout(timer);
    if (resp.ok) {
      const data = await resp.json();
      if (data && data.length > 0) {
        const found = { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon), source: 'nominatim' };
        geocodeCache.set(cleanQ, found);
        return found;
      }
    }
  } catch (e) {}

  // 5. Tra cứu dự phòng qua Photon API
  try {
    const photonUrl = `https://photon.komoot.io/api/?q=${encodeURIComponent(cleanAddr)}&lat=16.06&lon=108.21&limit=1`;
    const ctrl2 = new AbortController();
    const timer2 = setTimeout(() => ctrl2.abort(), 2000);
    const resp2 = await fetch(photonUrl, { signal: ctrl2.signal });
    clearTimeout(timer2);
    if (resp2.ok) {
      const pData = await resp2.json();
      if (pData.features && pData.features.length > 0) {
        const coords = pData.features[0].geometry.coordinates; // [lon, lat]
        const found = { lat: coords[1], lng: coords[0], source: 'photon' };
        geocodeCache.set(cleanQ, found);
        return found;
      }
    }
  } catch (e) {}

  // 6. Định vị dự phòng theo quận/khu vực tại Đà Nẵng
  const fallback = matchDaNangLocation(cleanAddr) || { lat: 16.0678, lng: 108.2208 };
  const res = { lat: fallback.lat, lng: fallback.lng, source: 'fallback' };
  geocodeCache.set(cleanQ, res);
  return res;
}

app.post('/api/route/calculate', async (req, res) => {
  try {
    const { fromLat, fromLng, toLat, toLng, fromAddress, toAddress, fromDistrict, toDistrict, district } = req.body;

    const start = await resolveCoordinates(fromAddress, fromLat, fromLng, fromDistrict);
    const end = await resolveCoordinates(toAddress, toLat, toLng, toDistrict || district);

    const startLat = start.lat;
    const startLng = start.lng;
    const endLat = end.lat;
    const endLng = end.lng;

    const cacheKey = `${startLat.toFixed(4)},${startLng.toFixed(4)}->${endLat.toFixed(4)},${endLng.toFixed(4)}`;
    let routeInfo = routeCache.get(cacheKey);

    if (!routeInfo) {
      let distanceKm = 0;
      let durationMin = 0;
      let coordinates = [];

      // Thử gọi OSRM để tính lộ trình uốn lượn thực tế
      try {
        const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${startLng},${startLat};${endLng},${endLat}?overview=full&geometries=geojson`;
        const ctrl = new AbortController();
        const timeoutId = setTimeout(() => ctrl.abort(), 2500);

        const osrmRes = await fetch(osrmUrl, { signal: ctrl.signal });
        clearTimeout(timeoutId);

        if (osrmRes.ok) {
          const routeData = await osrmRes.json();
          if (routeData.code === 'Ok' && routeData.routes && routeData.routes.length > 0) {
            const route = routeData.routes[0];
            distanceKm = parseFloat((route.distance / 1000).toFixed(2));
            durationMin = Math.max(3, Math.round(route.duration / 60));
            coordinates = route.geometry.coordinates;
          }
        }
      } catch (osrmErr) {
        // OSRM timeout / rate-limit -> chuyển sang tính hình học đô thị
      }

      // Fallback: Haversine nhân hệ số uốn lượn đô thị Đà Nẵng 1.30
      if (!distanceKm || distanceKm <= 0) {
        distanceKm = calculateHaversineKm(startLat, startLng, endLat, endLng);
        if (distanceKm < 0.8) distanceKm = 1.0;
        durationMin = Math.max(4, Math.round(distanceKm * 2.6));
        coordinates = [
          [startLng, startLat],
          [endLng, endLat]
        ];
      }

      routeInfo = { distanceKm, durationMin, coordinates };
      routeCache.set(cacheKey, routeInfo);
    }

    const settings = getSettingsMap();
    const shippingFee = calculateShippingFee(routeInfo.distanceKm, settings);

    res.json({
      success: true,
      data: {
        distance_km: routeInfo.distanceKm,
        duration_minutes: routeInfo.durationMin,
        shipping_fee: shippingFee,
        start_point: { lat: startLat, lng: startLng, address: fromAddress },
        end_point: { lat: endLat, lng: endLng, address: toAddress },
        route_polyline: routeInfo.coordinates,
        route_coordinates: routeInfo.coordinates
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

    // GỬI THÔNG BÁO ĐẨY TỚI ĐIỆN THOẠI TÀI XẾ (MÀN HÌNH KHÓA & TẮT MÀN HÌNH)
    if (shipper_id) {
      sendPushNotification({
        shipperId: shipper_id,
        title: '⚡ BẠN ĐƯỢC CHỈ ĐỊNH CUỐC XE (ROSI)',
        body: `Đơn ${order_code}: Điểm nhận: ${sender_address} ➔ Giao đến: ${receiver_address} (${dist} km - Cước ${fee.toLocaleString()} đ)`,
        url: '/?tab=driver-trips',
        orderId: result.lastInsertRowid
      });
    } else {
      // Bắn thông báo tới toàn bộ tài xế có đơn mới chờ nhận
      sendPushNotification({
        title: '📦 CÓ ĐƠN HÀNG MỚI CHỜ NHẬN (ROSI)',
        body: `Đơn ${order_code}: ${sender_address} ➔ ${receiver_address} (${dist} km - Cước ${fee.toLocaleString()} đ). Nhận ngay!`,
        url: '/?tab=driver-trips',
        orderId: result.lastInsertRowid
      });
    }

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

    // Gửi thông báo đẩy nếu có gán tài xế mới
    if (newShipperId && newShipperId !== current.shipper_id) {
      sendPushNotification({
        shipperId: newShipperId,
        title: '⚡ BẠN ĐƯỢC CHỈ ĐỊNH CUỐC XE MỚI (ROSI)',
        body: `Đơn ${current.order_code}: Điểm nhận: ${current.sender_address} ➔ Giao đến: ${current.receiver_address}. Chạm để nhận đơn!`,
        url: '/?tab=driver-trips',
        orderId: id
      });
    }

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
