// Service Worker for ROSI GiaoNhanApp PWA & Web Push Notification
const CACHE_NAME = 'rosi-giaonhan-v2';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// PASS-THROUGH FETCH FOR DYNAMIC API
self.addEventListener('fetch', (event) => {
  if (event.request.url.includes('/api/')) {
    event.respondWith(fetch(event.request));
  } else {
    event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
  }
});

// =========================================================================
// PUSH EVENT: NHẬN THÔNG BÁO TỪ SERVER KHI ĐIỆN THOẠI ĐANG TẮT HOẶC KHÓA MÀN HÌNH
// =========================================================================
self.addEventListener('push', (event) => {
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data = { title: 'ROSI EXPRESS', body: event.data.text() };
    }
  }

  const title = data.title || '⚡ CÓ ĐƠN HÀNG MỚI - CTY ROSI';
  const options = {
    body: data.body || 'Bạn có một đơn hàng mới cần giao! Chạm vào đây để nhận đơn.',
    icon: '/icon.svg',
    badge: '/icon.svg',
    tag: data.tag || 'order-' + (data.orderId || Date.now()),
    renotify: true,
    requireInteraction: true, // Giữ thông báo trên màn hình khóa cho tới khi tài xế bấm
    vibrate: [300, 100, 300, 100, 300, 100, 400], // Rung máy
    data: {
      url: data.url || '/?tab=driver-trips',
      orderId: data.orderId || null,
      timestamp: Date.now()
    },
    actions: [
      { action: 'open_order', title: '👉 Xem & Nhận Đơn' },
      { action: 'dismiss', title: 'Đóng' }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// =========================================================================
// NOTIFICATION CLICK: CHẠM VÀO THÔNG BÁO -> SÁNG MÀN HÌNH & MỞ APP VÀO ĐƠN
// =========================================================================
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'dismiss') return;

  const targetUrl = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (let client of windowClients) {
        if ('focus' in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
