// =============================================================================
// GiaoNhanApp - Frontend Application Logic
// =============================================================================

let appState = {
  currentUser: null, // { id, name, phone, username, role, ... }
  userRole: null,    // 'admin' | 'shipper'
  currentView: 'dashboard',
  orders: [],
  shippers: [],
  settings: {},
  activeShipperTab: 'active', // 'active' | 'history'
  orderFilter: 'all',
  
  // Route Map State
  map: null,
  startMarker: null,
  endMarker: null,
  routePolyline: null,
  calcData: {
    start: null,
    end: null,
    distanceKm: 0,
    durationMin: 0,
    shippingFee: 0,
    shipperEarning: 0
  }
};

// Formatting helpers
function formatVND(amount) {
  if (amount === undefined || amount === null) return '0 đ';
  return new Intl.NumberFormat('vi-VN').format(Math.round(amount)) + ' đ';
}

function formatDate(isoStr) {
  if (!isoStr) return '--';
  const d = new Date(isoStr);
  return d.toLocaleDateString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
}

function getStatusBadge(status) {
  switch (status) {
    case 'pending':
      return `<span class="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-700">Chờ xử lý</span>`;
    case 'assigned':
      return `<span class="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-blue-100 text-blue-700">Đã gán xế</span>`;
    case 'delivering':
      return `<span class="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-100 text-indigo-700">Đang giao</span>`;
    case 'completed':
      return `<span class="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-700">Giao thành công</span>`;
    case 'cancelled':
      return `<span class="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-rose-100 text-rose-700">Đã hủy</span>`;
    default:
      return `<span class="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-700">${status}</span>`;
  }
}

// -----------------------------------------------------------------------------
// 1. AUTHENTICATION & ROLE MANAGEMENT
// -----------------------------------------------------------------------------
function switchLoginRole(role) {
  const adminTab = document.getElementById('tab-login-admin');
  const shipperTab = document.getElementById('tab-login-shipper');
  const adminForm = document.getElementById('form-login-admin');
  const shipperForm = document.getElementById('form-login-shipper');

  if (role === 'admin') {
    adminTab.className = 'py-2.5 rounded-xl bg-white text-blue-700 shadow-xs transition flex items-center justify-center gap-1.5 font-bold';
    shipperTab.className = 'py-2.5 rounded-xl text-slate-500 hover:text-slate-800 transition flex items-center justify-center gap-1.5 font-bold';
    adminForm.classList.remove('hidden');
    shipperForm.classList.add('hidden');
  } else {
    shipperTab.className = 'py-2.5 rounded-xl bg-white text-emerald-700 shadow-xs transition flex items-center justify-center gap-1.5 font-bold';
    adminTab.className = 'py-2.5 rounded-xl text-slate-500 hover:text-slate-800 transition flex items-center justify-center gap-1.5 font-bold';
    shipperForm.classList.remove('hidden');
    adminForm.classList.add('hidden');
  }
  lucide.createIcons();
}

async function handleLogin(e, role) {
  if (e) e.preventDefault();

  let payload = { role };
  if (role === 'admin') {
    payload.username = document.getElementById('admin-username').value.trim();
    payload.password = document.getElementById('admin-password').value;
  } else {
    payload.phone = document.getElementById('shipper-phone').value.trim();
    payload.password = document.getElementById('shipper-password').value;
  }

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const result = await res.json();

    if (!result.success) {
      alert(result.error || 'Đăng nhập không thành công');
      return;
    }

    applyLoginSession(result.role, result.user);
  } catch (err) {
    console.error('Login error:', err);
    alert('Không thể kết nối đến máy chủ đăng nhập.');
  }
}

function quickLogin(role, phone = '0912345678') {
  if (role === 'admin') {
    document.getElementById('admin-username').value = 'admin';
    document.getElementById('admin-password').value = '123456';
    handleLogin(null, 'admin');
  } else {
    switchLoginRole('shipper');
    document.getElementById('shipper-phone').value = phone;
    document.getElementById('shipper-password').value = '123456';
    handleLogin(null, 'shipper');
  }
}

function applyLoginSession(role, user) {
  appState.userRole = role;
  appState.currentUser = user;

  // Persist session in localStorage
  localStorage.setItem('giaonhan_auth', JSON.stringify({ role, user }));

  // Hide login screen
  document.getElementById('login-screen').classList.add('hidden');

  // Update header
  const headerName = document.getElementById('header-user-name');
  if (role === 'admin') {
    headerName.innerHTML = `👑 Giám Đốc: <b class="font-bold text-white">${user.name}</b>`;
    document.getElementById('desktop-sidebar').classList.remove('hidden');
    document.getElementById('mobile-nav').classList.remove('hidden');
    navigateView('dashboard');
    loadShippers();
    loadOrders();
    loadDashboardSummary();
  } else {
    headerName.innerHTML = `🏍️ Xế: <b class="font-bold text-white">${user.name}</b>`;
    document.getElementById('desktop-sidebar').classList.add('hidden');
    document.getElementById('mobile-nav').classList.add('hidden');
    navigateView('shipper-mobile');
    initDriverPortal(user);
  }

  lucide.createIcons();
}

function handleLogout() {
  localStorage.removeItem('giaonhan_auth');
  appState.currentUser = null;
  appState.userRole = null;
  document.getElementById('login-screen').classList.remove('hidden');
  lucide.createIcons();
}

function checkSavedSession() {
  try {
    const saved = localStorage.getItem('giaonhan_auth');
    if (saved) {
      const { role, user } = JSON.parse(saved);
      if (role && user) {
        applyLoginSession(role, user);
        return true;
      }
    }
  } catch (e) {
    localStorage.removeItem('giaonhan_auth');
  }
  return false;
}

// -----------------------------------------------------------------------------
// 2. NAVIGATION (DÀNH CHO GIÁM ĐỐC / ADMIN)
// -----------------------------------------------------------------------------
function navigateView(viewName) {
  appState.currentView = viewName;

  const views = ['dashboard', 'orders', 'route-calc', 'shippers', 'payroll', 'settings', 'shipper-mobile'];
  views.forEach(v => {
    const el = document.getElementById(`view-${v}`);
    if (el) el.classList.add('hidden');
  });

  const targetView = document.getElementById(`view-${viewName}`);
  if (targetView) targetView.classList.remove('hidden');

  // Update desktop nav buttons
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.classList.remove('active', 'text-blue-600', 'bg-blue-50');
    btn.classList.add('text-slate-600');
  });
  const activeDesktopBtn = document.getElementById(`nav-${viewName}`);
  if (activeDesktopBtn) {
    activeDesktopBtn.classList.add('active', 'text-blue-600', 'bg-blue-50');
    activeDesktopBtn.classList.remove('text-slate-600');
  }

  // Update mobile nav buttons
  document.querySelectorAll('#mobile-nav button').forEach(btn => {
    btn.classList.remove('text-blue-600');
    btn.classList.add('text-slate-500');
  });
  const activeMobileBtn = document.getElementById(`m-nav-${viewName}`);
  if (activeMobileBtn) {
    activeMobileBtn.classList.add('text-blue-600');
    activeMobileBtn.classList.remove('text-slate-500');
  }

  lucide.createIcons();

  if (viewName === 'route-calc') {
    setTimeout(initMapIfNeeded, 200);
  } else if (viewName === 'orders') {
    loadOrders();
  } else if (viewName === 'shippers') {
    loadShippers();
  } else if (viewName === 'payroll') {
    loadPayrollData();
  } else if (viewName === 'settings') {
    loadSettingsData();
  } else if (viewName === 'dashboard') {
    loadDashboardSummary();
  }
}

// -----------------------------------------------------------------------------
// 3. DASHBOARD VIEW (BAN GIÁM ĐỐC)
// -----------------------------------------------------------------------------
async function loadDashboardSummary() {
  try {
    const res = await fetch('/api/stats/summary');
    const data = await res.json();
    if (data.success) {
      const s = data.data;
      document.getElementById('stat-total-orders').textContent = s.total_orders || 0;
      document.getElementById('stat-completed-orders').textContent = `${s.completed_orders || 0} đã hoàn thành`;
      document.getElementById('stat-total-km').textContent = `${(s.total_km || 0).toFixed(1)} km`;
      document.getElementById('stat-total-revenue').textContent = formatVND(s.total_revenue || 0);
      document.getElementById('stat-shipper-earning').textContent = `Lương xế: ${formatVND(s.total_shipper_earning || 0)}`;
      document.getElementById('stat-active-shippers').textContent = s.active_shippers || 0;
      document.getElementById('stat-delivering-count').textContent = `${s.delivering_orders || 0} đơn đang giao`;
    }

    const ordersRes = await fetch('/api/orders');
    const ordersData = await ordersRes.json();
    if (ordersData.success) {
      appState.orders = ordersData.data;
      renderRecentOrders(ordersData.data.slice(0, 5));
    }
  } catch (err) {
    console.error('Error loading dashboard:', err);
  }
}

function renderRecentOrders(recent) {
  const container = document.getElementById('recent-orders-list');
  if (!recent || recent.length === 0) {
    container.innerHTML = '<p class="text-center py-6 text-sm text-slate-400">Chưa có đơn hàng nào hôm nay</p>';
    return;
  }

  container.innerHTML = recent.map(o => `
    <div class="p-3.5 hover:bg-slate-50 transition flex items-center justify-between cursor-pointer" onclick="openOrderDetailModal(${o.id})">
      <div class="flex items-center space-x-3">
        <div class="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-xs">
          ${o.order_code.slice(-4)}
        </div>
        <div>
          <div class="flex items-center space-x-2">
            <span class="font-bold text-xs text-slate-800">${o.receiver_name}</span>
            ${getStatusBadge(o.status)}
          </div>
          <p class="text-[11px] text-slate-500 line-clamp-1">
            <i data-lucide="map-pin" class="w-3 h-3 inline text-rose-500"></i> ${o.receiver_address}
          </p>
        </div>
      </div>
      <div class="text-right">
        <span class="font-bold text-xs text-blue-700">${formatVND(o.shipping_fee)}</span>
        <p class="text-[11px] text-slate-500">${o.distance_km} km</p>
      </div>
    </div>
  `).join('');

  lucide.createIcons();
}

// -----------------------------------------------------------------------------
// 4. ORDERS VIEW (QUẢN LÝ ĐƠN HÀNG)
// -----------------------------------------------------------------------------
async function loadOrders() {
  try {
    let url = '/api/orders';
    if (appState.orderFilter !== 'all') {
      url += `?status=${appState.orderFilter}`;
    }
    const res = await fetch(url);
    const data = await res.json();
    if (data.success) {
      appState.orders = data.data;
      renderOrdersList(data.data);
    }
  } catch (err) {
    console.error('Error loading orders:', err);
  }
}

function filterOrders(status) {
  appState.orderFilter = status;
  document.querySelectorAll('.order-filter-btn').forEach(btn => {
    if (btn.dataset.status === status) {
      btn.classList.add('bg-blue-600', 'text-white');
      btn.classList.remove('bg-white', 'text-slate-600', 'border');
    } else {
      btn.classList.remove('bg-blue-600', 'text-white');
      btn.classList.add('bg-white', 'text-slate-600', 'border');
    }
  });
  loadOrders();
}

function renderOrdersList(orders) {
  const container = document.getElementById('orders-container');
  if (!orders || orders.length === 0) {
    container.innerHTML = '<div class="col-span-full text-center py-12 text-slate-400 text-sm">Không có đơn hàng nào trong mục này</div>';
    return;
  }

  container.innerHTML = orders.map(o => `
    <div class="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition space-y-3">
      <div class="flex items-center justify-between border-b border-slate-100 pb-2">
        <div class="flex items-center space-x-2">
          <span class="font-bold text-xs text-blue-700 font-mono">${o.order_code}</span>
          ${getStatusBadge(o.status)}
        </div>
        <span class="text-[11px] text-slate-400">${formatDate(o.created_at)}</span>
      </div>

      <div class="space-y-1.5 text-xs">
        <div class="flex items-start space-x-2">
          <span class="w-4 h-4 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-[10px] flex-shrink-0 mt-0.5">A</span>
          <div class="flex-1">
            <p class="font-semibold text-slate-700">${o.sender_name} <span class="text-slate-400 font-normal">(${o.sender_phone})</span></p>
            <p class="text-slate-500 text-[11px] line-clamp-1">${o.sender_address}</p>
          </div>
        </div>

        <div class="flex items-start space-x-2">
          <span class="w-4 h-4 rounded-full bg-rose-100 text-rose-700 flex items-center justify-center font-bold text-[10px] flex-shrink-0 mt-0.5">B</span>
          <div class="flex-1">
            <p class="font-semibold text-slate-700">${o.receiver_name} <span class="text-slate-400 font-normal">(${o.receiver_phone})</span></p>
            <p class="text-slate-500 text-[11px] line-clamp-1">${o.receiver_address}</p>
          </div>
        </div>
      </div>

      <div class="bg-slate-50 p-2.5 rounded-xl border border-slate-100 grid grid-cols-3 gap-2 text-center text-xs">
        <div>
          <span class="text-slate-400 text-[10px]">Quãng đường</span>
          <p class="font-bold text-slate-800">${o.distance_km} km</p>
        </div>
        <div>
          <span class="text-slate-400 text-[10px]">Cước thu</span>
          <p class="font-bold text-blue-700">${formatVND(o.shipping_fee)}</p>
        </div>
        <div>
          <span class="text-slate-400 text-[10px]">Lương xế</span>
          <p class="font-bold text-emerald-700">${formatVND(o.shipper_earning)}</p>
        </div>
      </div>

      <div class="flex items-center justify-between pt-1">
        <div class="text-xs">
          ${o.shipper_name ? `
            <span class="text-slate-600 flex items-center gap-1">
              <i data-lucide="bike" class="w-3.5 h-3.5 text-blue-600"></i>
              <b>${o.shipper_name}</b>
            </span>
          ` : `
            <span class="text-amber-600 font-semibold flex items-center gap-1">
              <i data-lucide="alert-circle" class="w-3.5 h-3.5"></i>
              Chưa gán tài xế
            </span>
          `}
        </div>

        <button onclick="openOrderDetailModal(${o.id})" class="px-3 py-1.5 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 font-semibold text-xs transition flex items-center gap-1">
          <span>Chi tiết</span>
          <i data-lucide="chevron-right" class="w-3.5 h-3.5"></i>
        </button>
      </div>
    </div>
  `).join('');

  lucide.createIcons();
}

// -----------------------------------------------------------------------------
// 5. MAP & ROUTE DISTANCE CALCULATOR (OSRM ENGINE)
// -----------------------------------------------------------------------------
function initMapIfNeeded() {
  if (appState.map) {
    appState.map.invalidateSize();
    return;
  }

  const defaultCenter = [10.7769, 106.7009];
  appState.map = L.map('map').setView(defaultCenter, 13);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap contributors'
  }).addTo(appState.map);

  appState.map.on('click', (e) => {
    const { lat, lng } = e.latlng;
    if (!appState.startMarker) {
      setMapStartPoint(lat, lng, `Tọa độ: ${lat.toFixed(4)}, ${lng.toFixed(4)}`);
    } else if (!appState.endMarker) {
      setMapEndPoint(lat, lng, `Tọa độ: ${lat.toFixed(4)}, ${lng.toFixed(4)}`);
      calculateRouteOnMap();
    } else {
      setMapEndPoint(lat, lng, `Tọa độ: ${lat.toFixed(4)}, ${lng.toFixed(4)}`);
      calculateRouteOnMap();
    }
  });
}

function createPinIcon(type, text) {
  return L.divIcon({
    className: '',
    html: `<div class="${type === 'start' ? 'custom-pin-start' : 'custom-pin-end'}">${text}</div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16]
  });
}

function setMapStartPoint(lat, lng, address) {
  if (appState.startMarker) appState.map.removeLayer(appState.startMarker);

  appState.startMarker = L.marker([lat, lng], { icon: createPinIcon('start', 'A'), draggable: true }).addTo(appState.map);
  appState.calcData.start = { lat, lng, address };
  document.getElementById('calc-from-coords').textContent = `Tọa độ: ${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  if (address && !address.startsWith('Tọa độ:')) {
    document.getElementById('calc-from-address').value = address;
  }

  appState.startMarker.on('dragend', (e) => {
    const pos = e.target.getLatLng();
    appState.calcData.start = { lat: pos.lat, lng: pos.lng, address: `Tọa độ: ${pos.lat.toFixed(4)}, ${pos.lng.toFixed(4)}` };
    document.getElementById('calc-from-coords').textContent = `Tọa độ: ${pos.lat.toFixed(5)}, ${pos.lng.toFixed(5)}`;
    if (appState.endMarker) calculateRouteOnMap();
  });
}

function setMapEndPoint(lat, lng, address) {
  if (appState.endMarker) appState.map.removeLayer(appState.endMarker);

  appState.endMarker = L.marker([lat, lng], { icon: createPinIcon('end', 'B'), draggable: true }).addTo(appState.map);
  appState.calcData.end = { lat, lng, address };
  document.getElementById('calc-to-coords').textContent = `Tọa độ: ${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  if (address && !address.startsWith('Tọa độ:')) {
    document.getElementById('calc-to-address').value = address;
  }

  appState.endMarker.on('dragend', (e) => {
    const pos = e.target.getLatLng();
    appState.calcData.end = { lat: pos.lat, lng: pos.lng, address: `Tọa độ: ${pos.lat.toFixed(4)}, ${pos.lng.toFixed(4)}` };
    document.getElementById('calc-to-coords').textContent = `Tọa độ: ${pos.lat.toFixed(5)}, ${pos.lng.toFixed(5)}`;
    if (appState.startMarker) calculateRouteOnMap();
  });
}

async function searchAddress(type) {
  const input = document.getElementById(type === 'from' ? 'calc-from-address' : 'calc-to-address');
  const dropdown = document.getElementById(type === 'from' ? 'autocomplete-from' : 'autocomplete-to');
  const query = input.value.trim();

  if (!query) return;

  try {
    dropdown.innerHTML = '<div class="p-2 text-xs text-slate-400">Đang tìm kiếm địa chỉ...</div>';
    dropdown.classList.remove('hidden');

    const res = await fetch(`/api/geocode/search?q=${encodeURIComponent(query)}`);
    const results = await res.json();

    if (!results || results.length === 0) {
      dropdown.innerHTML = '<div class="p-2 text-xs text-slate-400">Không tìm thấy địa chỉ phù hợp</div>';
      return;
    }

    dropdown.innerHTML = results.map(item => `
      <div class="autocomplete-item" onclick="selectSearchedAddress('${type}', ${item.lat}, ${item.lon}, '${item.display_name.replace(/'/g, "\\'")}')">
        <p class="font-bold text-slate-800">${item.name}</p>
        <p class="text-slate-500 text-[11px] line-clamp-1">${item.display_name}</p>
      </div>
    `).join('');
  } catch (err) {
    console.error('Search error:', err);
    dropdown.classList.add('hidden');
  }
}

function selectSearchedAddress(type, lat, lon, address) {
  const input = document.getElementById(type === 'from' ? 'calc-from-address' : 'calc-to-address');
  const dropdown = document.getElementById(type === 'from' ? 'autocomplete-from' : 'autocomplete-to');
  
  input.value = address;
  dropdown.classList.add('hidden');

  if (type === 'from') {
    setMapStartPoint(lat, lon, address);
  } else {
    setMapEndPoint(lat, lon, address);
  }

  if (appState.map) appState.map.setView([lat, lon], 14);
  if (appState.startMarker && appState.endMarker) calculateRouteOnMap();
}

async function calculateRouteOnMap() {
  const fromAddr = document.getElementById('calc-from-address').value.trim();
  const toAddr = document.getElementById('calc-to-address').value.trim();

  const payload = { fromAddress: fromAddr, toAddress: toAddr };
  if (appState.calcData.start) {
    payload.fromLat = appState.calcData.start.lat;
    payload.fromLng = appState.calcData.start.lng;
  }
  if (appState.calcData.end) {
    payload.toLat = appState.calcData.end.lat;
    payload.toLng = appState.calcData.end.lng;
  }

  const btn = document.getElementById('btn-calc-route');
  btn.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i><span>Đang tính đường đi...</span>`;
  lucide.createIcons();

  try {
    const res = await fetch('/api/route/calculate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const result = await res.json();

    if (!result.success) {
      alert(result.error || 'Không thể tính toán lộ trình.');
      return;
    }

    const d = result.data;
    appState.calcData.distanceKm = d.distance_km;
    appState.calcData.durationMin = d.duration_minutes;
    appState.calcData.shippingFee = d.shipping_fee;
    appState.calcData.shipperEarning = Math.round(d.shipping_fee * 0.75);

    setMapStartPoint(d.start_point.lat, d.start_point.lng, fromAddr || 'Điểm lấy hàng');
    setMapEndPoint(d.end_point.lat, d.end_point.lng, toAddr || 'Điểm giao hàng');

    if (appState.routePolyline) appState.map.removeLayer(appState.routePolyline);

    if (d.route_coordinates && d.route_coordinates.length > 0) {
      const latlngs = d.route_coordinates.map(c => [c[1], c[0]]);
      appState.routePolyline = L.polyline(latlngs, {
        color: '#2563eb',
        weight: 6,
        opacity: 0.85,
        lineJoin: 'round'
      }).addTo(appState.map);

      appState.map.fitBounds(appState.routePolyline.getBounds(), { padding: [50, 50] });
    }

    document.getElementById('res-distance').textContent = `${d.distance_km} km`;
    document.getElementById('res-duration').textContent = `~ ${d.duration_minutes} phút xe máy`;
    document.getElementById('res-price').textContent = formatVND(d.shipping_fee);
    document.getElementById('res-shipper-earning').textContent = `Công xế nhận: ${formatVND(appState.calcData.shipperEarning)}`;

    document.getElementById('res-breakdown').innerHTML = `
      <p>• <b>Phương thức:</b> Tuyến đường thực tế qua OSRM Engine</p>
      <p>• <b>Đơn giá:</b> Cước mở cửa + Lũy tiến theo số km</p>
    `;

    document.getElementById('calc-result-box').classList.remove('hidden');
  } catch (err) {
    console.error('Route calculation error:', err);
    alert('Lỗi kết nối máy chủ khi tính đường đi.');
  } finally {
    btn.innerHTML = `<i data-lucide="route" class="w-4 h-4"></i><span>Tính toán Quãng đường & Cước</span>`;
    lucide.createIcons();
  }
}

function createOrderFromCalculatedRoute() {
  const fromAddr = document.getElementById('calc-from-address').value.trim();
  const toAddr = document.getElementById('calc-to-address').value.trim();

  openCreateOrderModal();
  document.getElementById('order-sender-address').value = fromAddr;
  document.getElementById('order-receiver-address').value = toAddr;
  document.getElementById('order-distance-km').value = appState.calcData.distanceKm;
  document.getElementById('order-shipping-fee').value = appState.calcData.shippingFee;
}

// -----------------------------------------------------------------------------
// 6. CREATE ORDER MODAL & AUTO CALCULATE
// -----------------------------------------------------------------------------
function openCreateOrderModal() {
  populateShipperSelect('order-shipper-id');
  document.getElementById('modal-create-order').classList.remove('hidden');
  lucide.createIcons();
}

function populateShipperSelect(selectId, selectedId = null) {
  const select = document.getElementById(selectId);
  if (!select) return;

  const currentOptions = select.querySelector('option[value=""]');
  select.innerHTML = '';
  if (currentOptions) select.appendChild(currentOptions);

  appState.shippers.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s.id;
    opt.textContent = `${s.name} (${s.phone} - ${s.license_plate || s.vehicle_type})`;
    if (selectedId && selectedId == s.id) opt.selected = true;
    select.appendChild(opt);
  });
}

let debounceTimer;
function debounceGeocode(input, type) {
  clearTimeout(debounceTimer);
  const dropdown = document.getElementById(type === 'sender' ? 'suggest-sender' : 'suggest-receiver');
  const q = input.value.trim();

  if (q.length < 3) {
    dropdown.classList.add('hidden');
    return;
  }

  debounceTimer = setTimeout(async () => {
    try {
      dropdown.innerHTML = '<div class="p-2 text-xs text-slate-400">Đang gợi ý địa chỉ...</div>';
      dropdown.classList.remove('hidden');

      const res = await fetch(`/api/geocode/search?q=${encodeURIComponent(q)}`);
      const results = await res.json();

      if (!results || results.length === 0) {
        dropdown.classList.add('hidden');
        return;
      }

      dropdown.innerHTML = results.map(item => `
        <div class="autocomplete-item" onclick="selectModalAddress('${type}', '${item.display_name.replace(/'/g, "\\'")}', ${item.lat}, ${item.lon})">
          <p class="font-bold text-slate-800">${item.name}</p>
          <p class="text-slate-500 text-[11px] line-clamp-1">${item.display_name}</p>
        </div>
      `).join('');
    } catch (err) {
      console.error(err);
      dropdown.classList.add('hidden');
    }
  }, 400);
}

function selectModalAddress(type, address, lat, lon) {
  const input = document.getElementById(type === 'sender' ? 'order-sender-address' : 'order-receiver-address');
  const dropdown = document.getElementById(type === 'sender' ? 'suggest-sender' : 'suggest-receiver');
  input.value = address;
  input.dataset.lat = lat;
  input.dataset.lng = lon;
  dropdown.classList.add('hidden');

  const sAddr = document.getElementById('order-sender-address').value;
  const rAddr = document.getElementById('order-receiver-address').value;
  if (sAddr && rAddr) {
    autoCalculateOrderDistance();
  }
}

async function autoCalculateOrderDistance() {
  const sInput = document.getElementById('order-sender-address');
  const rInput = document.getElementById('order-receiver-address');
  const sAddr = sInput.value.trim();
  const rAddr = rInput.value.trim();

  if (!sAddr || !rAddr) {
    alert('Vui lòng nhập cả địa chỉ lấy hàng và địa chỉ giao hàng trước.');
    return;
  }

  const payload = {
    fromAddress: sAddr,
    toAddress: rAddr,
    fromLat: sInput.dataset.lat,
    fromLng: sInput.dataset.lng,
    toLat: rInput.dataset.lat,
    toLng: rInput.dataset.lng
  };

  try {
    const res = await fetch('/api/route/calculate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const result = await res.json();

    if (result.success) {
      document.getElementById('order-distance-km').value = result.data.distance_km;
      document.getElementById('order-shipping-fee').value = result.data.shipping_fee;
    } else {
      alert(result.error || 'Không tính được quãng đường tự động. Bạn có thể tự gõ số km bên dưới.');
    }
  } catch (err) {
    console.error('Auto calculate error:', err);
  }
}

function recalcFeeFromManualKm() {
  const km = parseFloat(document.getElementById('order-distance-km').value) || 0;
  let fee = 16000;
  if (km > 2 && km <= 10) {
    fee = 16000 + (km - 2) * 5500;
  } else if (km > 10) {
    fee = 16000 + 8 * 5500 + (km - 10) * 4500;
  }
  document.getElementById('order-shipping-fee').value = Math.round(fee / 500) * 500;
}

async function submitCreateOrder() {
  const sender_name = document.getElementById('order-sender-name').value.trim() || 'Người gửi';
  const sender_phone = document.getElementById('order-sender-phone').value.trim() || '0900000000';
  const sender_address = document.getElementById('order-sender-address').value.trim();

  const receiver_name = document.getElementById('order-receiver-name').value.trim();
  const receiver_phone = document.getElementById('order-receiver-phone').value.trim();
  const receiver_address = document.getElementById('order-receiver-address').value.trim();

  const distance_km = parseFloat(document.getElementById('order-distance-km').value) || 0;
  const shipping_fee = parseFloat(document.getElementById('order-shipping-fee').value) || 0;
  const item_name = document.getElementById('order-item-name').value.trim();
  const cod_amount = parseFloat(document.getElementById('order-cod-amount').value) || 0;
  const shipper_id = document.getElementById('order-shipper-id').value;
  const notes = document.getElementById('order-notes').value.trim();

  if (!sender_address || !receiver_address || !receiver_name) {
    alert('Vui lòng điền đầy đủ: Tên người nhận, Địa chỉ lấy hàng và Địa chỉ giao hàng.');
    return;
  }

  const payload = {
    sender_name, sender_phone, sender_address,
    receiver_name, receiver_phone, receiver_address,
    distance_km, shipping_fee, item_name, cod_amount,
    shipper_id: shipper_id ? parseInt(shipper_id) : null,
    notes
  };

  try {
    const res = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const result = await res.json();

    if (result.success) {
      closeModal('modal-create-order');
      document.getElementById('order-receiver-name').value = '';
      document.getElementById('order-receiver-phone').value = '';
      document.getElementById('order-receiver-address').value = '';
      document.getElementById('order-distance-km').value = '';
      document.getElementById('order-shipping-fee').value = '';
      
      loadOrders();
      loadDashboardSummary();
      alert('Tạo đơn hàng thành công!');
    } else {
      alert('Lỗi tạo đơn: ' + result.error);
    }
  } catch (err) {
    console.error(err);
    alert('Không thể kết nối đến máy chủ.');
  }
}

// -----------------------------------------------------------------------------
// 7. ORDER DETAIL & STATUS UPDATE MODAL
// -----------------------------------------------------------------------------
async function openOrderDetailModal(orderId) {
  const order = appState.orders.find(o => o.id === orderId);
  if (!order) return;

  document.getElementById('dt-order-code').textContent = order.order_code;

  const body = document.getElementById('dt-order-body');
  body.innerHTML = `
    <div class="flex items-center justify-between pb-2 border-b">
      <span class="text-slate-500">Trạng thái:</span>
      ${getStatusBadge(order.status)}
    </div>

    <div class="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-2">
      <p class="font-bold text-slate-800">Thông tin chuyển phát:</p>
      <div class="space-y-1">
        <p><b>Điểm lấy:</b> ${order.sender_name} (${order.sender_phone}) - ${order.sender_address}</p>
        <p><b>Điểm giao:</b> ${order.receiver_name} (${order.receiver_phone}) - ${order.receiver_address}</p>
      </div>
    </div>

    <div class="grid grid-cols-2 gap-2">
      <div class="bg-blue-50 p-2.5 rounded-lg border border-blue-200">
        <span class="text-slate-500">Quãng đường</span>
        <p class="font-bold text-blue-700 text-sm">${order.distance_km} km</p>
      </div>
      <div class="bg-emerald-50 p-2.5 rounded-lg border border-emerald-200">
        <span class="text-slate-500">Cước phí thu</span>
        <p class="font-bold text-emerald-700 text-sm">${formatVND(order.shipping_fee)}</p>
      </div>
    </div>

    <div class="grid grid-cols-2 gap-2">
      <div class="bg-purple-50 p-2.5 rounded-lg border border-purple-200">
        <span class="text-slate-500">Lương xế nhận</span>
        <p class="font-bold text-purple-700 text-sm">${formatVND(order.shipper_earning)}</p>
      </div>
      <div class="bg-amber-50 p-2.5 rounded-lg border border-amber-200">
        <span class="text-slate-500">Tiền COD</span>
        <p class="font-bold text-amber-700 text-sm">${formatVND(order.cod_amount)}</p>
      </div>
    </div>

    <div class="space-y-2 border-t pt-2">
      <div>
        <label class="block font-medium text-slate-700 mb-1">Tài xế phụ trách:</label>
        <select id="dt-shipper-select" class="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 bg-white font-medium">
          <option value="">-- Chưa gán tài xế --</option>
        </select>
      </div>
      <div>
        <label class="block font-medium text-slate-700 mb-1">Thay đổi trạng thái đơn:</label>
        <select id="dt-status-select" class="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 bg-white font-medium">
          <option value="pending" ${order.status === 'pending' ? 'selected' : ''}>Chờ gán tài xế</option>
          <option value="assigned" ${order.status === 'assigned' ? 'selected' : ''}>Đã gán tài xế</option>
          <option value="delivering" ${order.status === 'delivering' ? 'selected' : ''}>Đang trên đường giao</option>
          <option value="completed" ${order.status === 'completed' ? 'selected' : ''}>Giao thành công</option>
          <option value="cancelled" ${order.status === 'cancelled' ? 'selected' : ''}>Đã hủy đơn</option>
        </select>
      </div>
      <div>
        <label class="block font-medium text-slate-700 mb-1">Ghi chú:</label>
        <input type="text" id="dt-notes" value="${order.notes || ''}" class="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 bg-white">
      </div>
    </div>
  `;

  populateShipperSelect('dt-shipper-select', order.shipper_id);

  const footer = document.getElementById('dt-order-footer');
  footer.innerHTML = `
    <button onclick="deleteOrder(${order.id})" class="px-3 py-1.5 rounded-lg bg-rose-50 text-rose-600 hover:bg-rose-100 font-semibold text-xs flex items-center gap-1 transition">
      <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
      <span>Xóa đơn</span>
    </button>
    <div class="flex space-x-2">
      <button onclick="closeModal('modal-order-detail')" class="px-4 py-1.5 rounded-xl border border-slate-300 text-slate-600 hover:bg-slate-100 font-medium text-xs">Đóng</button>
      <button onclick="saveOrderDetail(${order.id})" class="px-5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-sm flex items-center gap-1">
        <i data-lucide="save" class="w-3.5 h-3.5"></i>
        <span>Lưu cập nhật</span>
      </button>
    </div>
  `;

  document.getElementById('modal-order-detail').classList.remove('hidden');
  lucide.createIcons();
}

async function saveOrderDetail(orderId) {
  const shipper_id = document.getElementById('dt-shipper-select').value;
  const status = document.getElementById('dt-status-select').value;
  const notes = document.getElementById('dt-notes').value.trim();

  try {
    const res = await fetch(`/api/orders/${orderId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        shipper_id: shipper_id ? parseInt(shipper_id) : null,
        status,
        notes
      })
    });
    const result = await res.json();
    if (result.success) {
      closeModal('modal-order-detail');
      loadOrders();
      loadDashboardSummary();
    } else {
      alert('Lỗi cập nhật: ' + result.error);
    }
  } catch (err) {
    console.error(err);
  }
}

async function deleteOrder(orderId) {
  if (!confirm('Bạn có chắc chắn muốn xóa đơn hàng này không?')) return;
  try {
    const res = await fetch(`/api/orders/${orderId}`, { method: 'DELETE' });
    const result = await res.json();
    if (result.success) {
      closeModal('modal-order-detail');
      loadOrders();
      loadDashboardSummary();
    }
  } catch (err) {
    console.error(err);
  }
}

// -----------------------------------------------------------------------------
// 8. SHIPPERS MANAGEMENT VIEW
// -----------------------------------------------------------------------------
async function loadShippers() {
  try {
    const res = await fetch('/api/shippers');
    const data = await res.json();
    if (data.success) {
      appState.shippers = data.data;
      renderShippersList(data.data);
    }
  } catch (err) {
    console.error('Error loading shippers:', err);
  }
}

function renderShippersList(shippers) {
  const container = document.getElementById('shippers-list');
  if (!shippers || shippers.length === 0) {
    container.innerHTML = '<div class="col-span-full text-center py-10 text-slate-400 text-sm">Chưa có tài xế nào</div>';
    return;
  }

  container.innerHTML = shippers.map(s => `
    <div class="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-3">
      <div class="flex items-center justify-between border-b pb-2">
        <div class="flex items-center space-x-2.5">
          <div class="w-10 h-10 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-sm">
            ${s.name.split(' ').pop().slice(0, 1)}
          </div>
          <div>
            <h3 class="font-bold text-slate-800 text-xs">${s.name}</h3>
            <p class="text-[11px] text-slate-500">${s.phone}</p>
          </div>
        </div>
        <span class="px-2 py-0.5 rounded-full text-[10px] font-semibold ${s.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}">
          ${s.status === 'active' ? 'Đang chạy' : (s.status === 'busy' ? 'Bận' : 'Nghỉ')}
        </span>
      </div>

      <div class="space-y-1 text-xs text-slate-600">
        <p class="flex items-center gap-1.5">
          <i data-lucide="car" class="w-3.5 h-3.5 text-blue-600"></i>
          <span><b>${s.vehicle_type}</b> - ${s.license_plate || 'Chưa có biển số'}</span>
        </p>
        <p class="flex items-center gap-1.5">
          <i data-lucide="wallet" class="w-3.5 h-3.5 text-emerald-600"></i>
          <span>Lương cứng: <b>${formatVND(s.base_salary)}</b> / tháng</span>
        </p>
        <p class="flex items-center gap-1.5">
          <i data-lucide="percent" class="w-3.5 h-3.5 text-purple-600"></i>
          <span>Hưởng cước: <b>${s.commission_rate}%</b> (hoặc ${formatVND(s.km_rate)}/km)</span>
        </p>
      </div>

      <div class="bg-slate-50 p-2.5 rounded-xl border border-slate-100 grid grid-cols-2 gap-2 text-center text-xs">
        <div>
          <span class="text-slate-400 text-[10px]">Đã hoàn thành</span>
          <p class="font-bold text-slate-800">${s.total_completed_trips || 0} chuyến</p>
        </div>
        <div>
          <span class="text-slate-400 text-[10px]">Tổng quãng đường</span>
          <p class="font-bold text-blue-700">${(s.total_km_run || 0).toFixed(1)} km</p>
        </div>
      </div>

      <div class="flex justify-end space-x-2 pt-1 border-t">
        <button onclick="editShipper(${s.id})" class="px-3 py-1.5 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 font-semibold text-xs flex items-center gap-1">
          <i data-lucide="edit-3" class="w-3.5 h-3.5"></i>
          <span>Chỉnh sửa</span>
        </button>
      </div>
    </div>
  `).join('');

  lucide.createIcons();
}

function openShipperModal() {
  document.getElementById('edit-shipper-id').value = '';
  document.getElementById('shipper-form-name').value = '';
  document.getElementById('shipper-form-phone').value = '';
  document.getElementById('shipper-form-password').value = '123456';
  document.getElementById('shipper-form-plate').value = '';
  document.getElementById('shipper-form-base-salary').value = '3000000';
  document.getElementById('shipper-form-allowance').value = '600000';
  document.getElementById('shipper-form-commission').value = '75';
  document.getElementById('shipper-form-km-rate').value = '4500';

  document.getElementById('shipper-modal-title').innerHTML = `
    <i data-lucide="user-plus" class="w-4 h-4"></i>
    <span>Thêm tài xế mới</span>
  `;

  document.getElementById('modal-shipper').classList.remove('hidden');
  lucide.createIcons();
}

function editShipper(shipperId) {
  const shipper = appState.shippers.find(s => s.id === shipperId);
  if (!shipper) return;

  document.getElementById('edit-shipper-id').value = shipper.id;
  document.getElementById('shipper-form-name').value = shipper.name;
  document.getElementById('shipper-form-phone').value = shipper.phone;
  document.getElementById('shipper-form-password').value = '123456';
  document.getElementById('shipper-form-plate').value = shipper.license_plate || '';
  document.getElementById('shipper-form-vehicle').value = shipper.vehicle_type || 'Xe máy';
  document.getElementById('shipper-form-base-salary').value = shipper.base_salary || 0;
  document.getElementById('shipper-form-allowance').value = shipper.allowance || 0;
  document.getElementById('shipper-form-commission').value = shipper.commission_rate || 75;
  document.getElementById('shipper-form-km-rate').value = shipper.km_rate || 4500;

  document.getElementById('shipper-modal-title').innerHTML = `
    <i data-lucide="edit-3" class="w-4 h-4"></i>
    <span>Sửa thông tin tài xế</span>
  `;

  document.getElementById('modal-shipper').classList.remove('hidden');
  lucide.createIcons();
}

async function submitShipperForm() {
  const editId = document.getElementById('edit-shipper-id').value;
  const name = document.getElementById('shipper-form-name').value.trim();
  const phone = document.getElementById('shipper-form-phone').value.trim();
  const password = document.getElementById('shipper-form-password').value.trim() || '123456';
  const license_plate = document.getElementById('shipper-form-plate').value.trim();
  const vehicle_type = document.getElementById('shipper-form-vehicle').value;
  const base_salary = parseFloat(document.getElementById('shipper-form-base-salary').value) || 0;
  const allowance = parseFloat(document.getElementById('shipper-form-allowance').value) || 0;
  const commission_rate = parseFloat(document.getElementById('shipper-form-commission').value) || 75;
  const km_rate = parseFloat(document.getElementById('shipper-form-km-rate').value) || 4500;

  if (!name || !phone) {
    alert('Vui lòng điền Họ tên và Số điện thoại của tài xế.');
    return;
  }

  const payload = {
    name, phone, password, license_plate, vehicle_type,
    base_salary, allowance, commission_rate, km_rate
  };

  try {
    const url = editId ? `/api/shippers/${editId}` : '/api/shippers';
    const method = editId ? 'PUT' : 'POST';

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const result = await res.json();

    if (result.success) {
      closeModal('modal-shipper');
      loadShippers();
    } else {
      alert('Lỗi: ' + result.error);
    }
  } catch (err) {
    console.error(err);
  }
}

// -----------------------------------------------------------------------------
// 9. MONTHLY PAYROLL & EXCEL EXPORT (CHO KẾ TOÁN)
// -----------------------------------------------------------------------------
async function loadPayrollData() {
  const monthInput = document.getElementById('payroll-month-input');
  if (!monthInput.value) {
    monthInput.value = new Date().toISOString().slice(0, 7);
  }

  const monthYear = monthInput.value;

  try {
    const res = await fetch(`/api/payroll?month_year=${monthYear}`);
    const data = await res.json();
    if (data.success) {
      renderPayrollTable(data.data, monthYear);
    }
  } catch (err) {
    console.error('Error loading payroll:', err);
  }
}

function renderPayrollTable(payrollList, monthYear) {
  const tbody = document.getElementById('payroll-table-body');
  if (!payrollList || payrollList.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" class="text-center py-6 text-slate-400">Không có dữ liệu tài xế</td></tr>';
    return;
  }

  tbody.innerHTML = payrollList.map(p => `
    <tr class="hover:bg-slate-50 transition">
      <td class="py-3 px-4">
        <p class="font-bold text-slate-800">${p.name}</p>
        <p class="text-[11px] text-slate-400 font-mono">${p.phone} - ${p.license_plate || 'Xe'}</p>
      </td>
      <td class="py-3 px-3 text-center font-bold text-slate-700">${p.total_trips}</td>
      <td class="py-3 px-3 text-center font-bold text-blue-600">${p.total_km} km</td>
      <td class="py-3 px-3 text-right font-medium text-emerald-700">${formatVND(p.total_trip_earning)}</td>
      <td class="py-3 px-3 text-right text-slate-600">${formatVND(p.base_salary)}</td>
      <td class="py-3 px-3 text-right text-slate-600">${formatVND(p.allowance)}</td>
      <td class="py-3 px-3 text-right">
        <span class="${p.bonus > 0 ? 'text-emerald-600 font-semibold' : 'text-slate-400'}">+${formatVND(p.bonus)}</span>
        ${p.deduction > 0 ? `<br><span class="text-rose-600 font-semibold">-${formatVND(p.deduction)}</span>` : ''}
      </td>
      <td class="py-3 px-4 text-right font-bold text-blue-700 text-sm">
        ${formatVND(p.total_salary)}
      </td>
      <td class="py-3 px-3 text-center">
        <div class="flex items-center justify-center space-x-1">
          <button onclick="openAdjustmentModal(${p.shipper_id}, '${p.name}', '${monthYear}')" class="p-1.5 rounded-lg bg-amber-50 text-amber-700 hover:bg-amber-100 transition" title="Thêm Thưởng/Phạt">
            <i data-lucide="award" class="w-3.5 h-3.5"></i>
          </button>
          <button onclick="viewSalarySlip(${JSON.stringify(p).replace(/"/g, '&quot;')})" class="p-1.5 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 transition" title="In phiếu lương">
            <i data-lucide="printer" class="w-3.5 h-3.5"></i>
          </button>
        </div>
      </td>
    </tr>
  `).join('');

  lucide.createIcons();
}

function exportPayrollExcel() {
  const monthInput = document.getElementById('payroll-month-input');
  const monthYear = monthInput ? monthInput.value : new Date().toISOString().slice(0, 7);
  // Trực tiếp mở URL tải file excel
  window.location.href = `/api/payroll/export-excel?month_year=${monthYear}`;
}

function openAdjustmentModal(shipperId, shipperName, monthYear) {
  document.getElementById('adj-shipper-id').value = shipperId;
  document.getElementById('adj-month-year').value = monthYear;
  document.getElementById('adj-shipper-name').textContent = `Tài xế: ${shipperName} (Tháng ${monthYear})`;
  document.getElementById('adj-bonus').value = '0';
  document.getElementById('adj-deduction').value = '0';
  document.getElementById('adj-note').value = '';

  document.getElementById('modal-adjustment').classList.remove('hidden');
}

async function submitPayrollAdjustment() {
  const shipper_id = document.getElementById('adj-shipper-id').value;
  const month_year = document.getElementById('adj-month-year').value;
  const bonus = parseFloat(document.getElementById('adj-bonus').value) || 0;
  const deduction = parseFloat(document.getElementById('adj-deduction').value) || 0;
  const note = document.getElementById('adj-note').value.trim();

  try {
    const res = await fetch('/api/payroll/adjustment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shipper_id, month_year, bonus, deduction, note })
    });
    const result = await res.json();
    if (result.success) {
      closeModal('modal-adjustment');
      loadPayrollData();
    }
  } catch (err) {
    console.error(err);
  }
}

function viewSalarySlip(payroll) {
  const area = document.getElementById('print-area');
  const monthParts = payroll.month_year.split('-');
  const monthFormatted = `Tháng ${monthParts[1]} Năm ${monthParts[0]}`;

  area.innerHTML = `
    <div class="border-b-2 border-slate-800 pb-4 flex justify-between items-center">
      <div>
        <h2 class="text-base font-bold uppercase tracking-wider text-slate-800">CÔNG TY DỊCH VỤ GIAO NHẬN NHANH</h2>
        <p class="text-[11px] text-slate-500">Hotline: 0901 234 567 | Bộ phận Kế toán & Tiền lương</p>
      </div>
      <div class="text-right">
        <h3 class="text-sm font-bold text-blue-700 uppercase">PHIẾU LƯƠNG NHÂN VIÊN</h3>
        <p class="text-xs font-semibold text-slate-600">${monthFormatted}</p>
      </div>
    </div>

    <div class="grid grid-cols-2 gap-4 py-3 bg-slate-50 p-3 rounded-lg border border-slate-200">
      <div>
        <p><b>Họ và tên:</b> ${payroll.name}</p>
        <p><b>Số điện thoại:</b> ${payroll.phone}</p>
      </div>
      <div>
        <p><b>Phương tiện:</b> ${payroll.vehicle_type} (${payroll.license_plate || 'Chưa cập nhật'})</p>
        <p><b>Mã nhân viên:</b> ${payroll.shipper_code}</p>
      </div>
    </div>

    <div class="grid grid-cols-3 gap-2 text-center py-2">
      <div class="border border-slate-200 p-2 rounded">
        <span class="text-[10px] text-slate-500 uppercase">Số chuyến giao</span>
        <p class="text-sm font-bold text-slate-800">${payroll.total_trips} chuyến</p>
      </div>
      <div class="border border-slate-200 p-2 rounded">
        <span class="text-[10px] text-slate-500 uppercase">Tổng quãng đường</span>
        <p class="text-sm font-bold text-blue-700">${payroll.total_km} km</p>
      </div>
      <div class="border border-slate-200 p-2 rounded">
        <span class="text-[10px] text-slate-500 uppercase">Tổng tiền công km</span>
        <p class="text-sm font-bold text-emerald-700">${formatVND(payroll.total_trip_earning)}</p>
      </div>
    </div>

    <table class="w-full border-collapse border border-slate-300 text-xs">
      <thead>
        <tr class="bg-slate-100 text-slate-700">
          <th class="border border-slate-300 p-2 text-left">Khoản mục</th>
          <th class="border border-slate-300 p-2 text-right">Số tiền (VNĐ)</th>
          <th class="border border-slate-300 p-2 text-left">Ghi chú</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td class="border border-slate-300 p-2 font-medium">1. Lương cơ bản</td>
          <td class="border border-slate-300 p-2 text-right">${formatVND(payroll.base_salary)}</td>
          <td class="border border-slate-300 p-2 text-slate-500">Mức lương thỏa thuận cố định</td>
        </tr>
        <tr>
          <td class="border border-slate-300 p-2 font-medium">2. Tiền công chuyến theo Km</td>
          <td class="border border-slate-300 p-2 text-right font-semibold text-emerald-700">${formatVND(payroll.total_trip_earning)}</td>
          <td class="border border-slate-300 p-2 text-slate-500">${payroll.total_trips} chuyến (${payroll.total_km} km)</td>
        </tr>
        <tr>
          <td class="border border-slate-300 p-2 font-medium">3. Phụ cấp xăng xe, điện thoại</td>
          <td class="border border-slate-300 p-2 text-right">${formatVND(payroll.allowance)}</td>
          <td class="border border-slate-300 p-2 text-slate-500">Trợ cấp hàng tháng</td>
        </tr>
        <tr>
          <td class="border border-slate-300 p-2 font-medium">4. Tiền thưởng thêm</td>
          <td class="border border-slate-300 p-2 text-right text-emerald-600">+${formatVND(payroll.bonus)}</td>
          <td class="border border-slate-300 p-2 text-slate-500">${payroll.adjustment_notes || 'Thưởng chuyên cần / năng suất'}</td>
        </tr>
        <tr>
          <td class="border border-slate-300 p-2 font-medium">5. Khấu trừ / Phạt</td>
          <td class="border border-slate-300 p-2 text-right text-rose-600">-${formatVND(payroll.deduction)}</td>
          <td class="border border-slate-300 p-2 text-slate-500">Khấu trừ vi phạm (nếu có)</td>
        </tr>
        <tr class="bg-blue-50 font-bold text-sm text-blue-900">
          <td class="border border-slate-300 p-2.5 uppercase">TỔNG LƯƠNG THỰC LĨNH</td>
          <td class="border border-slate-300 p-2.5 text-right text-blue-700">${formatVND(payroll.total_salary)}</td>
          <td class="border border-slate-300 p-2.5 text-xs font-normal">Chuyển khoản vào ngày 05</td>
        </tr>
      </tbody>
    </table>

    <div class="grid grid-cols-2 text-center pt-8">
      <div>
        <p class="font-bold text-slate-800">Người lập biểu</p>
        <p class="text-[11px] text-slate-400 mt-12">(Ký và ghi rõ họ tên)</p>
      </div>
      <div>
        <p class="font-bold text-slate-800">Người nhận lương</p>
        <p class="text-[11px] text-slate-400 mt-12">${payroll.name}</p>
      </div>
    </div>
  `;

  document.getElementById('modal-salary-slip').classList.remove('hidden');
}

// -----------------------------------------------------------------------------
// 10. SETTINGS VIEW
// -----------------------------------------------------------------------------
async function loadSettingsData() {
  try {
    const res = await fetch('/api/settings');
    const data = await res.json();
    if (data.success) {
      data.data.forEach(item => {
        const input = document.getElementById(`setting-${item.key}`);
        if (input) input.value = item.value;
      });
    }
  } catch (err) {
    console.error('Error loading settings:', err);
  }
}

async function saveSettings() {
  const keys = [
    'base_distance_km', 'base_price', 'tier1_max_km', 'tier1_rate', 'tier2_rate',
    'salary_calc_method', 'shipper_default_percentage', 'shipper_default_km_rate',
    'company_name', 'company_phone'
  ];

  const payload = {};
  keys.forEach(k => {
    const input = document.getElementById(`setting-${k}`);
    if (input) payload[k] = input.value;
  });

  try {
    const res = await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const result = await res.json();
    if (result.success) {
      alert('Đã lưu cấu hình bảng giá thành công!');
    }
  } catch (err) {
    console.error(err);
  }
}

// -----------------------------------------------------------------------------
// 11. SHIPPER MOBILE APP (PORTAL RIÊNG CHO TÀI XẾ ĐI GIAO HÀNG)
// -----------------------------------------------------------------------------
function initDriverPortal(driver) {
  document.getElementById('driver-app-name').textContent = driver.name;
  document.getElementById('driver-app-plate').textContent = `${driver.vehicle_type || 'Xe máy'} • ${driver.license_plate || 'Chưa có biển số'}`;
  document.getElementById('driver-app-phone').textContent = driver.phone;

  loadShipperPortalData();
}

function switchShipperTab(tab) {
  appState.activeShipperTab = tab;
  const activeBtn = document.getElementById('sp-tab-active');
  const histBtn = document.getElementById('sp-tab-history');

  if (tab === 'active') {
    activeBtn.className = 'flex-1 py-2.5 rounded-2xl bg-blue-600 text-white shadow-xs font-bold';
    histBtn.className = 'flex-1 py-2.5 rounded-2xl bg-white text-slate-600 border border-slate-200 font-bold';
  } else {
    histBtn.className = 'flex-1 py-2.5 rounded-2xl bg-blue-600 text-white shadow-xs font-bold';
    activeBtn.className = 'flex-1 py-2.5 rounded-2xl bg-white text-slate-600 border border-slate-200 font-bold';
  }
  loadShipperPortalData();
}

async function loadShipperPortalData() {
  if (!appState.currentUser || appState.userRole !== 'shipper') return;
  const driverId = appState.currentUser.id;

  try {
    const res = await fetch(`/api/orders?shipper_id=${driverId}`);
    const data = await res.json();
    if (!data.success) return;

    const allOrders = data.data;
    const activeOrders = allOrders.filter(o => o.status === 'assigned' || o.status === 'delivering');
    const completedOrders = allOrders.filter(o => o.status === 'completed');

    document.getElementById('sp-active-count').textContent = activeOrders.length;

    // Tính thành tích hôm nay
    const today = new Date().toISOString().slice(0, 10);
    const todayCompleted = completedOrders.filter(o => o.completed_at && o.completed_at.slice(0, 10) === today);
    const todayKm = todayCompleted.reduce((acc, o) => acc + (o.distance_km || 0), 0);
    const todayEarning = todayCompleted.reduce((acc, o) => acc + (o.shipper_earning || 0), 0);

    document.getElementById('sp-today-trips').textContent = todayCompleted.length;
    document.getElementById('sp-today-km').textContent = `${todayKm.toFixed(1)} km`;
    document.getElementById('sp-today-earning').textContent = formatVND(todayEarning);

    const displayOrders = appState.activeShipperTab === 'active' ? activeOrders : completedOrders;
    renderShipperPortalOrders(displayOrders);
  } catch (err) {
    console.error('Error loading shipper portal:', err);
  }
}

function renderShipperPortalOrders(orders) {
  const container = document.getElementById('shipper-orders-container');
  if (!orders || orders.length === 0) {
    container.innerHTML = `
      <div class="bg-white p-8 rounded-3xl border border-slate-200 text-center text-slate-400 space-y-2">
        <i data-lucide="check-circle-2" class="w-12 h-12 mx-auto text-emerald-500"></i>
        <p class="text-xs font-bold text-slate-600">Hiện không có đơn hàng nào cần giao</p>
        <p class="text-[11px] text-slate-400">Khi Giám đốc điều phối đơn mới, đơn sẽ hiển thị tại đây.</p>
      </div>
    `;
    lucide.createIcons();
    return;
  }

  container.innerHTML = orders.map(o => `
    <div class="bg-white p-4 rounded-3xl border border-slate-200/90 shadow-md space-y-3">
      <div class="flex items-center justify-between border-b pb-2">
        <span class="font-extrabold text-xs text-blue-700 font-mono tracking-wider">${o.order_code}</span>
        ${getStatusBadge(o.status)}
      </div>

      <div class="space-y-2 text-xs">
        <div class="bg-emerald-50/70 p-3 rounded-2xl border border-emerald-100 flex items-start space-x-2.5">
          <span class="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold text-[10px] flex-shrink-0 mt-0.5">A</span>
          <div class="flex-1">
            <p class="font-bold text-emerald-900">Lấy hàng: ${o.sender_name} - <a href="tel:${o.sender_phone}" class="underline font-bold text-emerald-700">${o.sender_phone}</a></p>
            <p class="text-slate-600 text-[11px] mt-0.5">${o.sender_address}</p>
          </div>
        </div>

        <div class="bg-rose-50/70 p-3 rounded-2xl border border-rose-100 flex items-start space-x-2.5">
          <span class="w-5 h-5 rounded-full bg-rose-600 text-white flex items-center justify-center font-bold text-[10px] flex-shrink-0 mt-0.5">B</span>
          <div class="flex-1">
            <p class="font-bold text-rose-900">Giao hàng: ${o.receiver_name} - <a href="tel:${o.receiver_phone}" class="underline font-bold text-rose-700">${o.receiver_phone}</a></p>
            <p class="text-slate-600 text-[11px] mt-0.5">${o.receiver_address}</p>
          </div>
        </div>
      </div>

      <div class="bg-slate-50 p-2.5 rounded-2xl border border-slate-100 grid grid-cols-3 gap-2 text-center text-xs">
        <div>
          <span class="text-slate-400 text-[10px]">Quãng đường</span>
          <p class="font-bold text-slate-800">${o.distance_km} km</p>
        </div>
        <div>
          <span class="text-slate-400 text-[10px]">Thu COD</span>
          <p class="font-bold text-amber-700">${formatVND(o.cod_amount)}</p>
        </div>
        <div>
          <span class="text-slate-400 text-[10px]">Tiền công nhận</span>
          <p class="font-bold text-emerald-700">${formatVND(o.shipper_earning)}</p>
        </div>
      </div>

      ${o.status !== 'completed' && o.status !== 'cancelled' ? `
        <div class="grid grid-cols-2 gap-2 pt-1">
          <a href="https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(o.receiver_address)}" target="_blank"
            class="py-3 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs flex items-center justify-center gap-1.5 transition">
            <i data-lucide="navigation" class="w-4 h-4 text-blue-600"></i>
            <span>Chỉ đường Maps</span>
          </a>

          ${o.status === 'assigned' ? `
            <button onclick="updateShipperOrderStatus(${o.id}, 'delivering')"
              class="py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-md transition">
              <i data-lucide="play" class="w-4 h-4"></i>
              <span>Đã nhận hàng</span>
            </button>
          ` : `
            <button onclick="updateShipperOrderStatus(${o.id}, 'completed')"
              class="py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-md transition">
              <i data-lucide="check-circle" class="w-4 h-4"></i>
              <span>Giao thành công</span>
            </button>
          `}
        </div>
      ` : ''}
    </div>
  `).join('');

  lucide.createIcons();
}

async function updateShipperOrderStatus(orderId, newStatus) {
  try {
    const res = await fetch(`/api/orders/${orderId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus })
    });
    const result = await res.json();
    if (result.success) {
      loadShipperPortalData();
    }
  } catch (err) {
    console.error(err);
  }
}

// -----------------------------------------------------------------------------
// 12. PHONE CONNECT MODAL
// -----------------------------------------------------------------------------
function openPhoneConnectModal() {
  const currentHost = window.location.host;
  const el = document.getElementById('phone-access-url');
  if (currentHost.includes('localhost') || currentHost.includes('127.0.0.1')) {
    el.innerHTML = `http://192.168.1.25:3000<br><span class="text-[11px] text-slate-500 font-normal">Gõ địa chỉ này vào Safari iPhone hoặc Chrome Android</span>`;
  } else {
    el.textContent = `http://${currentHost}`;
  }
  document.getElementById('modal-phone-connect').classList.remove('hidden');
}

function closeModal(modalId) {
  const m = document.getElementById(modalId);
  if (m) m.classList.add('hidden');
}

document.addEventListener('click', (e) => {
  if (!e.target.closest('.relative')) {
    document.querySelectorAll('.autocomplete-dropdown').forEach(d => d.classList.add('hidden'));
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    document.querySelectorAll('[id^="modal-"]').forEach(m => m.classList.add('hidden'));
  }
});

// PWA Service Worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(err => {
      console.log('SW registration skipped:', err.message);
    });
  });
}

// APP INITIALIZATION
window.addEventListener('DOMContentLoaded', () => {
  lucide.createIcons();
  const hasSession = checkSavedSession();
  if (!hasSession) {
    document.getElementById('login-screen').classList.remove('hidden');
  }
});
