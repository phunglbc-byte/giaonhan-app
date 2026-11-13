// =============================================================================
// CÔNG TY TNHH ROSI VIỆT NAM - Quản Lý Giao Nhận & Tính Lương Theo Km
// Trụ sở cố định: 29 Đặng Thai Mai, P. Vĩnh Trung, Q. Thanh Khê, TP. Đà Nẵng
// =============================================================================

const ROSI_HUB = {
  name: 'CÔNG TY TNHH ROSI VIỆT NAM',
  address: '29 Đặng Thai Mai, Phường Vĩnh Trung, Quận Thanh Khê, Thành phố Đà Nẵng',
  phone: '0905 123 456',
  lat: 16.0607366,
  lng: 108.2112765
};

let appState = {
  currentUser: null,
  userRole: null,
  currentView: 'dashboard',
  orders: [],
  shippers: [],
  settings: {},
  activeShipperTab: 'active',
  orderFilter: 'all',
  
  // Trip mode: 'delivery' (Cty -> Khách) | 'pickup' (Khách -> Cty)
  routeTripMode: 'delivery',
  driverTripMode: 'delivery',
  modalOrderDirection: 'delivery',

  // Map state
  map: null,
  startMarker: null,
  endMarker: null,
  hubMarker: null,
  routePolyline: null,
  calcData: {
    start: null,
    end: null,
    distanceKm: 0,
    durationMin: 0,
    shippingFee: 0,
    shipperEarning: 0
  },

  // Driver quick order temporary data
  driverQuickCalc: {
    distanceKm: 0,
    shippingFee: 0,
    earning: 0
  }
};

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
// 1. AUTHENTICATION & LOGIN SESSIONS
// -----------------------------------------------------------------------------
function switchLoginRole(role) {
  appState.loginFormRole = role;
  const adminTab = document.getElementById('tab-login-admin');
  const ketoanTab = document.getElementById('tab-login-ketoan');
  const shipperTab = document.getElementById('tab-login-shipper');
  const adminForm = document.getElementById('form-login-admin');
  const shipperForm = document.getElementById('form-login-shipper');
  const usernameLabel = document.getElementById('login-username-label');
  const usernameInput = document.getElementById('admin-username');
  const btnSubmitMgmt = document.getElementById('btn-submit-mgmt');

  // Reset tab classes
  const inactiveClass = 'py-2 rounded-xl text-slate-500 hover:text-slate-800 transition flex items-center justify-center gap-1 font-semibold';
  if (adminTab) adminTab.className = inactiveClass;
  if (ketoanTab) ketoanTab.className = inactiveClass;
  if (shipperTab) shipperTab.className = inactiveClass;

  if (role === 'admin') {
    if (adminTab) adminTab.className = 'py-2 rounded-xl bg-white text-blue-700 shadow-xs transition flex items-center justify-center gap-1 font-bold';
    if (adminForm) adminForm.classList.remove('hidden');
    if (shipperForm) shipperForm.classList.add('hidden');
    if (usernameLabel) usernameLabel.textContent = 'Tên đăng nhập Giám đốc (admin)';
    if (usernameInput) usernameInput.value = 'admin';
    if (btnSubmitMgmt) btnSubmitMgmt.innerHTML = '<i data-lucide="shield" class="w-4 h-4"></i><span>Đăng Nhập Ban Giám Đốc</span>';
  } else if (role === 'accountant') {
    if (ketoanTab) ketoanTab.className = 'py-2 rounded-xl bg-white text-purple-700 shadow-xs transition flex items-center justify-center gap-1 font-bold';
    if (adminForm) adminForm.classList.remove('hidden');
    if (shipperForm) shipperForm.classList.add('hidden');
    if (usernameLabel) usernameLabel.textContent = 'Tên đăng nhập Kế toán (ketoan)';
    if (usernameInput) usernameInput.value = 'ketoan';
    if (btnSubmitMgmt) btnSubmitMgmt.innerHTML = '<i data-lucide="receipt" class="w-4 h-4"></i><span>Đăng Nhập Phòng Kế Toán</span>';
  } else {
    if (shipperTab) shipperTab.className = 'py-2 rounded-xl bg-white text-emerald-700 shadow-xs transition flex items-center justify-center gap-1 font-bold';
    if (shipperForm) shipperForm.classList.remove('hidden');
    if (adminForm) adminForm.classList.add('hidden');
  }
  lucide.createIcons();
}

async function handleLogin(e, role) {
  if (e) e.preventDefault();

  let payload = { role: role || appState.loginFormRole || 'admin' };
  if (payload.role === 'admin' || payload.role === 'accountant') {
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
    switchLoginRole('admin');
    document.getElementById('admin-username').value = 'admin';
    document.getElementById('admin-password').value = '123456';
    handleLogin(null, 'admin');
  } else if (role === 'accountant') {
    switchLoginRole('accountant');
    document.getElementById('admin-username').value = 'ketoan';
    document.getElementById('admin-password').value = '123456';
    handleLogin(null, 'accountant');
  } else {
    switchLoginRole('shipper');
    document.getElementById('shipper-phone').value = phone;
    document.getElementById('shipper-password').value = '123456';
    handleLogin(null, 'shipper');
  }
}

let driverPollingInterval = null;

function applyLoginSession(role, user) {
  appState.userRole = role;
  appState.currentUser = user;

  localStorage.setItem('giaonhan_auth', JSON.stringify({ role, user }));
  document.getElementById('login-screen').classList.add('hidden');

  const headerName = document.getElementById('header-user-name');
  if (role === 'admin') {
    headerName.innerHTML = `<span class="hidden sm:inline">👑 Giám Đốc: </span><b class="font-bold text-white truncate max-w-[105px] sm:max-w-none inline-block align-bottom">${user.name}</b>`;
    document.getElementById('desktop-sidebar').classList.remove('hidden');
    document.getElementById('mobile-nav').classList.remove('hidden');
    navigateView('dashboard');
    loadShippers();
    loadOrders();
    loadDashboardSummary();
  } else if (role === 'accountant') {
    headerName.innerHTML = `<span class="hidden sm:inline">📊 Kế Toán: </span><b class="font-bold text-white truncate max-w-[105px] sm:max-w-none inline-block align-bottom">${user.name}</b>`;
    document.getElementById('desktop-sidebar').classList.remove('hidden');
    document.getElementById('mobile-nav').classList.remove('hidden');
    navigateView('payroll');
    loadShippers();
    loadOrders();
    loadPayrollData();
  } else {
    // TÀI XẾ: CHỈ ĐƯỢC XEM GIAO DIỆN TÀI XẾ, TUYỆT ĐỐI ẨN TOÀN BỘ THANH ĐIỀU HƯỚNG VÀ DỮ LIỆU CÔNG TY
    headerName.innerHTML = `<span class="hidden sm:inline">🏍️ Tài Xế: </span><b class="font-bold text-white truncate max-w-[105px] sm:max-w-none inline-block align-bottom">${user.name}</b>`;
    document.getElementById('desktop-sidebar').classList.add('hidden');
    document.getElementById('mobile-nav').classList.add('hidden');
    
    const mgmtViews = ['dashboard', 'orders', 'route-calc', 'shippers', 'payroll', 'settings'];
    mgmtViews.forEach(v => {
      const el = document.getElementById(`view-${v}`);
      if (el) el.classList.add('hidden');
    });

    navigateView('shipper-mobile');
    initDriverPortal(user);
  }

  lucide.createIcons();
}

function handleLogout() {
  if (driverPollingInterval) {
    clearInterval(driverPollingInterval);
    driverPollingInterval = null;
  }
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
// 2. NAVIGATION (CHO GIÁM ĐỐC)
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

  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.classList.remove('active', 'text-blue-600', 'bg-blue-50');
    btn.classList.add('text-slate-600');
  });
  const activeDesktopBtn = document.getElementById(`nav-${viewName}`);
  if (activeDesktopBtn) {
    activeDesktopBtn.classList.add('active', 'text-blue-600', 'bg-blue-50');
    activeDesktopBtn.classList.remove('text-slate-600');
  }

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
// 3. DASHBOARD VIEW (BAN GIÁM ĐỐC ROSI)
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
      document.getElementById('stat-delivering-count').textContent = `${s.delivering_orders || 0} đơn đang chạy`;
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
        <div class="w-9 h-9 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-xs">
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
    <div class="bg-white p-4 rounded-3xl border border-slate-200 shadow-sm hover:shadow-md transition space-y-3">
      <div class="flex items-center justify-between border-b border-slate-100 pb-2">
        <div class="flex items-center space-x-2">
          <span class="font-extrabold text-xs text-blue-700 font-mono">${o.order_code}</span>
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

      <div class="bg-slate-50 p-2.5 rounded-2xl border border-slate-100 grid grid-cols-3 gap-2 text-center text-xs">
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
            <span class="text-slate-600 flex items-center gap-1 font-medium">
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

        <button onclick="openOrderDetailModal(${o.id})" class="px-3 py-1.5 rounded-xl bg-blue-50 text-blue-600 hover:bg-blue-100 font-bold text-xs transition flex items-center gap-1">
          <span>Chi tiết</span>
          <i data-lucide="chevron-right" class="w-3.5 h-3.5"></i>
        </button>
      </div>
    </div>
  `).join('');

  lucide.createIcons();
}

// -----------------------------------------------------------------------------
// 5. MAP & ROUTE DISTANCE CALCULATOR (CỐ ĐỊNH TẠI ĐÀ NẴNG)
// -----------------------------------------------------------------------------
function initMapIfNeeded() {
  if (appState.map) {
    appState.map.invalidateSize();
    return;
  }

  // Tọa độ trung tâm: 29 Đặng Thai Mai, Thanh Khê, Đà Nẵng
  const daNangCenter = [ROSI_HUB.lat, ROSI_HUB.lng];
  appState.map = L.map('map').setView(daNangCenter, 14);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap contributors'
  }).addTo(appState.map);

  // Đặt sẵn ghim cố định cho ROSI VIỆT NAM (29 Đặng Thai Mai)
  appState.calcData.start = {
    lat: ROSI_HUB.lat,
    lng: ROSI_HUB.lng,
    address: ROSI_HUB.address
  };

  setMapStartPoint(ROSI_HUB.lat, ROSI_HUB.lng, ROSI_HUB.address);

  // Cho phép click lên bản đồ để chọn điểm khách hàng tại Đà Nẵng
  appState.map.on('click', (e) => {
    const { lat, lng } = e.latlng;
    if (appState.routeTripMode === 'delivery') {
      setMapEndPoint(lat, lng, `Tọa độ Đà Nẵng: ${lat.toFixed(4)}, ${lng.toFixed(4)}`);
      calculateRouteOnMap();
    } else {
      setMapStartPoint(lat, lng, `Tọa độ Đà Nẵng: ${lat.toFixed(4)}, ${lng.toFixed(4)}`);
      calculateRouteOnMap();
    }
  });
}

function setRouteTripMode(mode) {
  appState.routeTripMode = mode;
  const btnDelivery = document.getElementById('btn-mode-delivery');
  const btnPickup = document.getElementById('btn-mode-pickup');
  const badgeFrom = document.getElementById('badge-from-fixed');
  const badgeTo = document.getElementById('badge-to-fixed');

  const fromInput = document.getElementById('calc-from-address');
  const toInput = document.getElementById('calc-to-address');

  if (mode === 'delivery') {
    btnDelivery.className = 'py-2 px-2.5 rounded-xl bg-blue-600 text-white shadow-xs text-center flex items-center justify-center gap-1 font-bold';
    btnPickup.className = 'py-2 px-2.5 rounded-xl bg-white text-slate-700 border border-slate-200 text-center flex items-center justify-center gap-1 font-bold';
    badgeFrom.classList.remove('hidden');
    badgeTo.classList.add('hidden');

    fromInput.value = ROSI_HUB.address;
    fromInput.readOnly = true;
    toInput.readOnly = false;
    toInput.placeholder = 'Nhập địa chỉ khách nhận tại Đà Nẵng...';

    setMapStartPoint(ROSI_HUB.lat, ROSI_HUB.lng, ROSI_HUB.address);
  } else {
    btnPickup.className = 'py-2 px-2.5 rounded-xl bg-blue-600 text-white shadow-xs text-center flex items-center justify-center gap-1 font-bold';
    btnDelivery.className = 'py-2 px-2.5 rounded-xl bg-white text-slate-700 border border-slate-200 text-center flex items-center justify-center gap-1 font-bold';
    badgeFrom.classList.add('hidden');
    badgeTo.classList.remove('hidden');

    toInput.value = ROSI_HUB.address;
    toInput.readOnly = true;
    fromInput.readOnly = false;
    fromInput.value = '';
    fromInput.placeholder = 'Nhập địa chỉ nơi nhận hàng tại Đà Nẵng...';

    setMapEndPoint(ROSI_HUB.lat, ROSI_HUB.lng, ROSI_HUB.address);
  }
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
  if (address && !address.startsWith('Tọa độ')) {
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
  if (address && !address.startsWith('Tọa độ')) {
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
  const rawQuery = input.value.trim();

  if (!rawQuery) return;

  // Tự động gắn hậu tố Đà Nẵng nếu người dùng chưa gõ
  const query = rawQuery.toLowerCase().includes('đà nẵng') || rawQuery.toLowerCase().includes('da nang') 
    ? rawQuery 
    : `${rawQuery}, Đà Nẵng`;

  try {
    dropdown.innerHTML = '<div class="p-2 text-xs text-slate-400">Đang tìm địa chỉ tại Đà Nẵng...</div>';
    dropdown.classList.remove('hidden');

    const res = await fetch(`/api/geocode/search?q=${encodeURIComponent(query)}`);
    const results = await res.json();

    if (!results || results.length === 0) {
      dropdown.innerHTML = '<div class="p-2 text-xs text-slate-400">Không tìm thấy địa chỉ tại Đà Nẵng</div>';
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

    setMapStartPoint(d.start_point.lat, d.start_point.lng, fromAddr || ROSI_HUB.address);
    setMapEndPoint(d.end_point.lat, d.end_point.lng, toAddr || 'Khách hàng');

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
      <p>• <b>Tuyến đường:</b> Đường bộ thực tế tại Đà Nẵng (OSRM)</p>
      <p>• <b>Trụ sở:</b> 29 Đặng Thai Mai, Q. Thanh Khê, Đà Nẵng</p>
    `;

    document.getElementById('calc-result-box').classList.remove('hidden');
  } catch (err) {
    console.error('Route calculation error:', err);
    alert('Lỗi kết nối máy chủ khi tính đường đi.');
  } finally {
    btn.innerHTML = `<i data-lucide="route" class="w-4 h-4"></i><span>Tính toán Quãng đường & Cước từ ROSI</span>`;
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
// 6. ORDER MODAL DIRECTION HANDLER
// -----------------------------------------------------------------------------
function setOrderModalDirection(dir) {
  appState.modalOrderDirection = dir;
  const btnDel = document.getElementById('modal-mode-delivery');
  const btnPick = document.getElementById('modal-mode-pickup');
  const senderTag = document.getElementById('sender-fixed-tag');
  const recTag = document.getElementById('receiver-fixed-tag');

  const senderName = document.getElementById('order-sender-name');
  const senderPhone = document.getElementById('order-sender-phone');
  const senderAddr = document.getElementById('order-sender-address');

  const recName = document.getElementById('order-receiver-name');
  const recPhone = document.getElementById('order-receiver-phone');
  const recAddr = document.getElementById('order-receiver-address');

  if (dir === 'delivery') {
    btnDel.className = 'py-2 rounded-xl bg-blue-600 text-white text-center font-bold';
    btnPick.className = 'py-2 rounded-xl bg-white text-slate-700 border border-slate-300 text-center font-bold';
    senderTag.classList.remove('hidden');
    recTag.classList.add('hidden');

    senderName.value = ROSI_HUB.name;
    senderPhone.value = ROSI_HUB.phone;
    senderAddr.value = ROSI_HUB.address;

    recName.value = '';
    recPhone.value = '';
    recAddr.value = '';
    recAddr.placeholder = 'Nhập địa chỉ khách nhận tại Đà Nẵng...';
  } else {
    btnPick.className = 'py-2 rounded-xl bg-blue-600 text-white text-center font-bold';
    btnDel.className = 'py-2 rounded-xl bg-white text-slate-700 border border-slate-300 text-center font-bold';
    senderTag.classList.add('hidden');
    recTag.classList.remove('hidden');

    recName.value = ROSI_HUB.name;
    recPhone.value = ROSI_HUB.phone;
    recAddr.value = ROSI_HUB.address;

    senderName.value = '';
    senderPhone.value = '';
    senderAddr.value = '';
    senderAddr.placeholder = 'Nhập địa chỉ nơi nhận hàng tại Đà Nẵng...';
  }
}

function openCreateOrderModal() {
  populateShipperSelect('order-shipper-id');
  setOrderModalDirection('delivery');
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
let calcDebounceTimer;

function debounceGeocode(input, type) {
  clearTimeout(debounceTimer);
  clearTimeout(calcDebounceTimer);

  let dropdownId = 'suggest-sender';
  if (type === 'receiver') dropdownId = 'suggest-receiver';
  if (type === 'driver-quick') dropdownId = 'suggest-driver-quick';
  if (type === 'calc-from') dropdownId = 'autocomplete-from';
  if (type === 'calc-to') dropdownId = 'autocomplete-to';

  const dropdown = document.getElementById(dropdownId);
  const rawQ = input.value.trim();

  // Tự động tính toán km sau khi dừng gõ 500ms ngay cả khi người dùng không bấm vào dropdown
  calcDebounceTimer = setTimeout(() => {
    if (type === 'driver-quick') {
      autoCalculateDriverQuickOrder();
    } else if (type === 'receiver' || type === 'sender') {
      autoCalculateOrderDistance();
    } else if (type === 'calc-to' || type === 'calc-from') {
      calculateRouteOnMap();
    }
  }, 600);

  if (rawQ.length < 2) {
    if (dropdown) dropdown.classList.add('hidden');
    return;
  }

  const q = rawQ.toLowerCase().includes('đà nẵng') || rawQ.toLowerCase().includes('da nang') 
    ? rawQ 
    : `${rawQ}, Đà Nẵng`;

  debounceTimer = setTimeout(async () => {
    try {
      if (dropdown) {
        dropdown.innerHTML = '<div class="p-2 text-xs text-slate-400">Đang tìm địa chỉ tại Đà Nẵng...</div>';
        dropdown.classList.remove('hidden');
      }

      const res = await fetch(`/api/geocode/search?q=${encodeURIComponent(q)}`);
      const results = await res.json();

      if (!results || results.length === 0) {
        if (dropdown) dropdown.classList.add('hidden');
        return;
      }

      if (dropdown) {
        dropdown.innerHTML = results.map(item => `
          <div class="autocomplete-item p-2 hover:bg-blue-50 cursor-pointer border-b border-slate-100 last:border-b-0" onclick="selectModalAddress('${type}', '${item.display_name.replace(/'/g, "\\'")}', ${item.lat}, ${item.lon})">
            <p class="font-bold text-xs text-slate-800">${item.name}</p>
            <p class="text-slate-500 text-[11px] line-clamp-1">${item.display_name}</p>
          </div>
        `).join('');
      }
    } catch (err) {
      console.error(err);
      if (dropdown) dropdown.classList.add('hidden');
    }
  }, 350);
}

function selectModalAddress(type, address, lat, lon) {
  if (type === 'driver-quick') {
    const input = document.getElementById('d-quick-address');
    const dropdown = document.getElementById('suggest-driver-quick');
    if (input) {
      input.value = address;
      input.dataset.lat = lat;
      input.dataset.lng = lon;
    }
    if (dropdown) dropdown.classList.add('hidden');
    autoCalculateDriverQuickOrder();
    return;
  }

  if (type === 'calc-from') {
    const input = document.getElementById('calc-from-address');
    const dropdown = document.getElementById('autocomplete-from');
    if (input) {
      input.value = address;
      input.dataset.lat = lat;
      input.dataset.lng = lon;
    }
    if (dropdown) dropdown.classList.add('hidden');
    appState.calcData.start = { lat, lng: lon };
    setMapStartPoint(lat, lon, address);
    calculateRouteOnMap();
    return;
  }

  if (type === 'calc-to') {
    const input = document.getElementById('calc-to-address');
    const dropdown = document.getElementById('autocomplete-to');
    if (input) {
      input.value = address;
      input.dataset.lat = lat;
      input.dataset.lng = lon;
    }
    if (dropdown) dropdown.classList.add('hidden');
    appState.calcData.end = { lat, lng: lon };
    setMapEndPoint(lat, lon, address);
    calculateRouteOnMap();
    return;
  }

  const input = document.getElementById(type === 'sender' ? 'order-sender-address' : 'order-receiver-address');
  const dropdown = document.getElementById(type === 'sender' ? 'suggest-sender' : 'suggest-receiver');
  if (input) {
    input.value = address;
    input.dataset.lat = lat;
    input.dataset.lng = lon;
  }
  if (dropdown) dropdown.classList.add('hidden');

  autoCalculateOrderDistance();
}

async function autoCalculateOrderDistance() {
  const sInput = document.getElementById('order-sender-address');
  const rInput = document.getElementById('order-receiver-address');
  const sAddr = sInput.value.trim();
  const rAddr = rInput.value.trim();

  if (!sAddr || !rAddr) return;

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
  const sender_name = document.getElementById('order-sender-name').value.trim() || ROSI_HUB.name;
  const sender_phone = document.getElementById('order-sender-phone').value.trim() || ROSI_HUB.phone;
  const sender_address = document.getElementById('order-sender-address').value.trim() || ROSI_HUB.address;

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
    alert('Vui lòng điền đầy đủ tên và địa chỉ người nhận.');
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
      loadOrders();
      loadDashboardSummary();
      alert('Tạo đơn hàng ROSI thành công!');
    } else {
      alert('Lỗi tạo đơn: ' + result.error);
    }
  } catch (err) {
    console.error(err);
    alert('Không thể kết nối đến máy chủ.');
  }
}

// -----------------------------------------------------------------------------
// 7. ORDER DETAIL MODAL
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

    <div class="bg-slate-50 p-3 rounded-2xl border border-slate-200 space-y-2">
      <p class="font-bold text-slate-800">Thông tin chuyển phát ROSI:</p>
      <div class="space-y-1">
        <p><b>Điểm lấy (A):</b> ${order.sender_name} (${order.sender_phone}) - ${order.sender_address}</p>
        <p><b>Điểm giao (B):</b> ${order.receiver_name} (${order.receiver_phone}) - ${order.receiver_address}</p>
      </div>
    </div>

    <div class="grid grid-cols-2 gap-2">
      <div class="bg-blue-50 p-2.5 rounded-xl border border-blue-200">
        <span class="text-slate-500">Quãng đường</span>
        <p class="font-bold text-blue-700 text-sm">${order.distance_km} km</p>
      </div>
      <div class="bg-emerald-50 p-2.5 rounded-xl border border-emerald-200">
        <span class="text-slate-500">Cước phí thu</span>
        <p class="font-bold text-emerald-700 text-sm">${formatVND(order.shipping_fee)}</p>
      </div>
    </div>

    <div class="grid grid-cols-2 gap-2">
      <div class="bg-purple-50 p-2.5 rounded-xl border border-purple-200">
        <span class="text-slate-500">Lương xế nhận</span>
        <p class="font-bold text-purple-700 text-sm">${formatVND(order.shipper_earning)}</p>
      </div>
      <div class="bg-amber-50 p-2.5 rounded-xl border border-amber-200">
        <span class="text-slate-500">Tiền COD</span>
        <p class="font-bold text-amber-700 text-sm">${formatVND(order.cod_amount)}</p>
      </div>
    </div>

    <div class="space-y-2 border-t pt-2">
      <div>
        <label class="block font-medium text-slate-700 mb-1">Tài xế phụ trách:</label>
        <select id="dt-shipper-select" class="w-full border border-slate-300 rounded-xl px-2.5 py-1.5 bg-white font-medium">
          <option value="">-- Chưa gán tài xế --</option>
        </select>
      </div>
      <div>
        <label class="block font-medium text-slate-700 mb-1">Thay đổi trạng thái đơn:</label>
        <select id="dt-status-select" class="w-full border border-slate-300 rounded-xl px-2.5 py-1.5 bg-white font-medium">
          <option value="pending" ${order.status === 'pending' ? 'selected' : ''}>Chờ gán tài xế</option>
          <option value="assigned" ${order.status === 'assigned' ? 'selected' : ''}>Đã gán tài xế</option>
          <option value="delivering" ${order.status === 'delivering' ? 'selected' : ''}>Đang trên đường giao</option>
          <option value="completed" ${order.status === 'completed' ? 'selected' : ''}>Giao thành công</option>
          <option value="cancelled" ${order.status === 'cancelled' ? 'selected' : ''}>Đã hủy đơn</option>
        </select>
      </div>
      <div>
        <label class="block font-medium text-slate-700 mb-1">Ghi chú:</label>
        <input type="text" id="dt-notes" value="${order.notes || ''}" class="w-full border border-slate-300 rounded-xl px-2.5 py-1.5 bg-white">
      </div>
    </div>
  `;

  populateShipperSelect('dt-shipper-select', order.shipper_id);

  const footer = document.getElementById('dt-order-footer');
  footer.innerHTML = `
    <button onclick="deleteOrder(${order.id})" class="px-3 py-1.5 rounded-xl bg-rose-50 text-rose-600 hover:bg-rose-100 font-semibold text-xs flex items-center gap-1 transition">
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
    <div class="bg-white p-4 rounded-3xl border border-slate-200 shadow-sm space-y-3">
      <div class="flex items-center justify-between border-b pb-2">
        <div class="flex items-center space-x-2.5">
          <div class="w-10 h-10 rounded-2xl bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-sm">
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

      <div class="bg-slate-50 p-2.5 rounded-2xl border border-slate-100 grid grid-cols-2 gap-2 text-center text-xs">
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
        <button onclick="editShipper(${s.id})" class="px-3 py-1.5 rounded-xl bg-blue-50 text-blue-600 hover:bg-blue-100 font-semibold text-xs flex items-center gap-1">
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
  document.getElementById('shipper-form-plate').value = '43-';
  document.getElementById('shipper-form-base-salary').value = '3500000';
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
  document.getElementById('shipper-form-plate').value = shipper.license_plate || '43-';
  document.getElementById('shipper-form-vehicle').value = shipper.vehicle_type || 'Xe máy';
  document.getElementById('shipper-form-base-salary').value = shipper.base_salary || 3500000;
  document.getElementById('shipper-form-allowance').value = shipper.allowance || 600000;
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
// 9. MONTHLY PAYROLL & EXCEL EXPORT (CHO KẾ TOÁN ROSI VIỆT NAM)
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
        <h2 class="text-base font-extrabold uppercase tracking-wider text-slate-800">CÔNG TY TNHH ROSI VIỆT NAM</h2>
        <p class="text-[11px] text-slate-600">Trụ sở: 29 Đặng Thai Mai, P. Vĩnh Trung, Q. Thanh Khê, TP. Đà Nẵng</p>
        <p class="text-[11px] text-slate-500">Hotline: 0905 123 456 | Kế toán Tiền lương</p>
      </div>
      <div class="text-right">
        <h3 class="text-sm font-bold text-blue-700 uppercase">PHIẾU LƯƠNG NHÂN VIÊN</h3>
        <p class="text-xs font-semibold text-slate-600">${monthFormatted}</p>
      </div>
    </div>

    <div class="grid grid-cols-2 gap-4 py-3 bg-slate-50 p-3 rounded-2xl border border-slate-200">
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
      <div class="border border-slate-200 p-2 rounded-xl">
        <span class="text-[10px] text-slate-500 uppercase">Số chuyến giao</span>
        <p class="text-sm font-bold text-slate-800">${payroll.total_trips} chuyến</p>
      </div>
      <div class="border border-slate-200 p-2 rounded-xl">
        <span class="text-[10px] text-slate-500 uppercase">Tổng quãng đường</span>
        <p class="text-sm font-bold text-blue-700">${payroll.total_km} km</p>
      </div>
      <div class="border border-slate-200 p-2 rounded-xl">
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
          <td class="border border-slate-300 p-2 text-slate-500">Mức lương cố định</td>
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
          <td class="border border-slate-300 p-2 text-slate-500">Khấu trừ (nếu có)</td>
        </tr>
        <tr class="bg-blue-50 font-bold text-sm text-blue-900">
          <td class="border border-slate-300 p-2.5 uppercase">TỔNG LƯƠNG THỰC LĨNH</td>
          <td class="border border-slate-300 p-2.5 text-right text-blue-700">${formatVND(payroll.total_salary)}</td>
          <td class="border border-slate-300 p-2.5 text-xs font-normal">Chuyển khoản định kỳ</td>
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
    'company_name', 'company_address', 'company_phone'
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
      alert('Đã lưu cấu hình ROSI VIỆT NAM thành công!');
    }
  } catch (err) {
    console.error(err);
  }
}

// -----------------------------------------------------------------------------
// 11. SHIPPER MOBILE APP (TÀI XẾ NHẬN & TỰ TẠO ĐƠN TRÊN ĐIỆN THOẠI)
// -----------------------------------------------------------------------------
function initDriverPortal(driver) {
  document.getElementById('driver-app-name').textContent = driver.name;
  document.getElementById('driver-app-plate').textContent = `${driver.vehicle_type || 'Xe máy'} • ${driver.license_plate || '43-C1 888.22'}`;
  
  if (driverPollingInterval) {
    clearInterval(driverPollingInterval);
  }

  loadShipperPortalData();

  // Tự động kiểm tra đơn mới mỗi 3 giây
  driverPollingInterval = setInterval(() => {
    if (appState.currentUser && appState.userRole === 'shipper') {
      loadShipperPortalData(true);
    }
  }, 3000);
}

function openDriverQuickOrderModal() {
  document.getElementById('d-quick-address').value = '';
  document.getElementById('d-quick-name').value = '';
  document.getElementById('d-quick-phone').value = '';
  document.getElementById('d-quick-cod').value = '0';
  document.getElementById('d-quick-notes').value = '';
  document.getElementById('d-quick-dist').textContent = '-- km';
  document.getElementById('d-quick-earn').textContent = '-- đ';
  appState.driverQuickCalc = { distanceKm: 0, shippingFee: 0, earning: 0 };

  setDriverTripDirection('delivery');
  document.getElementById('modal-driver-quick-order').classList.remove('hidden');
  lucide.createIcons();
}

function setDriverTripDirection(dir) {
  appState.driverTripMode = dir;
  const btnDel = document.getElementById('d-quick-delivery');
  const btnPick = document.getElementById('d-quick-pickup');
  const label = document.getElementById('d-target-label');

  if (dir === 'delivery') {
    btnDel.className = 'py-2 rounded-xl bg-emerald-600 text-white font-bold';
    btnPick.className = 'py-2 rounded-xl bg-white text-slate-600 border font-bold';
    label.textContent = 'Địa chỉ giao hàng cho khách tại Đà Nẵng *';
  } else {
    btnPick.className = 'py-2 rounded-xl bg-emerald-600 text-white font-bold';
    btnDel.className = 'py-2 rounded-xl bg-white text-slate-600 border font-bold';
    label.textContent = 'Địa chỉ nơi nhận/lấy hàng tại Đà Nẵng *';
  }
}

async function autoCalculateDriverQuickOrder() {
  const addrInput = document.getElementById('d-quick-address');
  if (!addrInput) return;
  const rawAddr = addrInput.value.trim();

  if (!rawAddr || rawAddr.length < 2) {
    document.getElementById('d-quick-dist').textContent = '-- km';
    document.getElementById('d-quick-earn').textContent = '-- đ';
    return;
  }

  const clientAddr = rawAddr.toLowerCase().includes('đà nẵng') || rawAddr.toLowerCase().includes('da nang') 
    ? rawAddr 
    : `${rawAddr}, Đà Nẵng`;

  let payload = {};
  if (appState.driverTripMode === 'delivery') {
    // Từ 29 Đặng Thai Mai -> Khách
    payload = {
      fromAddress: ROSI_HUB.address,
      fromLat: ROSI_HUB.lat,
      fromLng: ROSI_HUB.lng,
      toAddress: clientAddr,
      toLat: addrInput.dataset.lat,
      toLng: addrInput.dataset.lng
    };
  } else {
    // Từ Khách -> về 29 Đặng Thai Mai
    payload = {
      fromAddress: clientAddr,
      fromLat: addrInput.dataset.lat,
      fromLng: addrInput.dataset.lng,
      toAddress: ROSI_HUB.address,
      toLat: ROSI_HUB.lat,
      toLng: ROSI_HUB.lng
    };
  }

  try {
    const res = await fetch('/api/route/calculate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const result = await res.json();

    if (result.success) {
      const d = result.data;
      const earning = Math.round(d.shipping_fee * 0.75);

      appState.driverQuickCalc = {
        distanceKm: d.distance_km,
        shippingFee: d.shipping_fee,
        earning: earning
      };

      document.getElementById('d-quick-dist').textContent = `${d.distance_km} km`;
      document.getElementById('d-quick-earn').textContent = formatVND(earning);
    }
  } catch (err) {
    console.error('Driver quick calc error:', err);
  }
}

async function submitDriverQuickOrder() {
  if (!appState.currentUser || appState.userRole !== 'shipper') return;

  const addr = document.getElementById('d-quick-address').value.trim();
  const name = document.getElementById('d-quick-name').value.trim() || 'Khách hàng';
  const phone = document.getElementById('d-quick-phone').value.trim() || '0900000000';
  const cod = parseFloat(document.getElementById('d-quick-cod').value) || 0;
  const notes = document.getElementById('d-quick-notes').value.trim();

  if (!addr) {
    alert('Vui lòng nhập địa chỉ nhận/giao.');
    return;
  }

  if (appState.driverQuickCalc.distanceKm <= 0) {
    await autoCalculateDriverQuickOrder();
  }

  let sender_name, sender_phone, sender_address;
  let receiver_name, receiver_phone, receiver_address;

  if (appState.driverTripMode === 'delivery') {
    sender_name = ROSI_HUB.name;
    sender_phone = ROSI_HUB.phone;
    sender_address = ROSI_HUB.address;
    receiver_name = name;
    receiver_phone = phone;
    receiver_address = addr;
  } else {
    sender_name = name;
    sender_phone = phone;
    sender_address = addr;
    receiver_name = ROSI_HUB.name;
    receiver_phone = ROSI_HUB.phone;
    receiver_address = ROSI_HUB.address;
  }

  const payload = {
    sender_name, sender_phone, sender_address,
    receiver_name, receiver_phone, receiver_address,
    distance_km: appState.driverQuickCalc.distanceKm || 3.0,
    shipping_fee: appState.driverQuickCalc.shippingFee || 21500,
    item_name: 'Hàng hóa ROSI',
    cod_amount: cod,
    shipper_id: appState.currentUser.id,
    notes: notes || (appState.driverTripMode === 'delivery' ? 'Giao hàng từ 29 Đặng Thai Mai' : 'Đi nhận hàng về 29 Đặng Thai Mai')
  };

  try {
    const res = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const result = await res.json();

    if (result.success) {
      closeModal('modal-driver-quick-order');
      loadShipperPortalData();
      alert('Đã tạo chuyến và thêm vào danh sách đi giao của bạn!');
    } else {
      alert('Lỗi tạo chuyến: ' + result.error);
    }
  } catch (err) {
    console.error(err);
  }
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

let previousAssignedCount = 0;

async function loadShipperPortalData(isPolling = false) {
  if (!appState.currentUser || appState.userRole !== 'shipper') return;
  const driverId = appState.currentUser.id;

  try {
    const res = await fetch(`/api/orders?shipper_id=${driverId}`);
    const data = await res.json();
    if (!data.success) return;

    const allOrders = data.data;
    const assignedOrders = allOrders.filter(o => o.status === 'assigned');
    const activeOrders = allOrders.filter(o => o.status === 'assigned' || o.status === 'delivering');
    const completedOrders = allOrders.filter(o => o.status === 'completed');

    document.getElementById('sp-active-count').textContent = activeOrders.length;

    // KIỂM TRA ĐƠN CÔNG TY MỚI GÁN ĐỂ BẬT CẢNH BÁO TỰ ĐỘNG
    const alertBox = document.getElementById('new-assigned-trip-alert');
    if (assignedOrders.length > 0) {
      const topOrder = assignedOrders[0];
      alertBox.innerHTML = `
        <div class="flex items-center space-x-2">
          <div class="w-9 h-9 rounded-full bg-white text-orange-600 flex items-center justify-center font-bold flex-shrink-0 shadow-sm">
            <i data-lucide="bell" class="w-5 h-5 animate-bounce"></i>
          </div>
          <div class="overflow-hidden">
            <p class="font-black text-xs">🚨 CÓ CUỐC MỚI CÔNG TY ĐIỀU PHỐI!</p>
            <p class="text-[11px] text-amber-100 truncate">#${topOrder.order_code}: ${topOrder.receiver_address} (${topOrder.distance_km} km - Công ${formatVND(topOrder.shipper_earning)})</p>
          </div>
        </div>
        <button onclick="acceptAssignedTrip(${topOrder.id})" class="px-3.5 py-2 rounded-xl bg-white hover:bg-amber-50 text-orange-700 font-black text-xs shadow-md whitespace-nowrap active:scale-95 flex-shrink-0">
          🟢 BẤM NHẬN CUỐC
        </button>
      `;
      alertBox.classList.remove('hidden');

      if (isPolling && assignedOrders.length > previousAssignedCount) {
        if ('vibrate' in navigator) navigator.vibrate([200, 100, 200]);
      }
    } else {
      if (alertBox) alertBox.classList.add('hidden');
    }
    previousAssignedCount = assignedOrders.length;

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

async function acceptAssignedTrip(orderId) {
  try {
    const res = await fetch(`/api/orders/${orderId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'delivering' })
    });
    const result = await res.json();
    if (result.success) {
      alert('Đã nhận cuốc thành công! Hãy xuất phát đi giao/nhận hàng nhé.');
      loadShipperPortalData();
    }
  } catch (e) {
    console.error(e);
  }
}

function renderShipperPortalOrders(orders) {
  const container = document.getElementById('shipper-orders-container');
  if (!orders || orders.length === 0) {
    container.innerHTML = `
      <div class="bg-white p-8 rounded-3xl border border-slate-200 text-center text-slate-400 space-y-2">
        <i data-lucide="check-circle-2" class="w-12 h-12 mx-auto text-emerald-500"></i>
        <p class="text-xs font-bold text-slate-700">Hiện không có đơn nào cần giao</p>
        <p class="text-[11px] text-slate-400">Bạn có thể bấm "TẠO CUỐC XE MỚI" ở trên để tự tạo chuyến đi.</p>
      </div>
    `;
    lucide.createIcons();
    return;
  }

  container.innerHTML = orders.map(o => `
    <div class="bg-white p-4 rounded-3xl border ${o.status === 'assigned' ? 'border-amber-400 ring-2 ring-amber-300/50 bg-amber-50/20' : 'border-slate-200/90'} shadow-md space-y-3">
      <div class="flex items-center justify-between border-b pb-2">
        <span class="font-extrabold text-xs text-blue-700 font-mono tracking-wider">${o.order_code}</span>
        ${getStatusBadge(o.status)}
      </div>

      ${o.status === 'assigned' ? `
        <div class="bg-amber-100/70 p-2.5 rounded-2xl border border-amber-200 text-amber-900 text-xs font-bold flex items-center justify-between">
          <span class="flex items-center gap-1.5">
            <i data-lucide="bell" class="w-4 h-4 text-amber-600 animate-spin"></i>
            Công ty vừa phân công đơn này
          </span>
          <span class="text-[10px] bg-amber-500 text-white px-2 py-0.5 rounded-full font-black animate-pulse">CHỜ NHẬN</span>
        </div>
      ` : ''}

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

      ${o.status === 'assigned' ? `
        <button onclick="acceptAssignedTrip(${o.id})"
          class="w-full py-3.5 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 text-white font-black text-xs flex items-center justify-center gap-2 shadow-lg animate-pulse transition active:scale-95">
          <i data-lucide="play" class="w-4 h-4"></i>
          <span>🟢 BẤM NHẬN CUỐC & ĐI GIAO NGAY</span>
        </button>
      ` : ''}

      ${o.status === 'delivering' ? `
        <div class="grid grid-cols-2 gap-2 pt-1">
          <a href="https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(o.receiver_address)}" target="_blank"
            class="py-3 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs flex items-center justify-center gap-1.5 transition">
            <i data-lucide="navigation" class="w-4 h-4 text-blue-600"></i>
            <span>Chỉ đường Maps</span>
          </a>
          <button onclick="updateShipperOrderStatus(${o.id}, 'completed')"
            class="py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-md transition active:scale-95">
            <i data-lucide="check-circle-2" class="w-4 h-4"></i>
            <span>✅ Giao thành công</span>
          </button>
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
