/**
 * Bộ dữ liệu Tọa độ & Định vị Địa lý Toàn diện Thành phố Đà Nẵng
 * Trụ sở trung tâm: CÔNG TY TNHH ROSI VIỆT NAM (29 Đặng Thai Mai, P. Vĩnh Trung, Q. Thanh Khê, TP. Đà Nẵng)
 */

const ROSI_HUB = {
  name: 'CÔNG TY TNHH ROSI VIỆT NAM',
  address: '29 Đặng Thai Mai, Phường Vĩnh Trung, Quận Thanh Khê, Thành phố Đà Nẵng',
  phone: '0905 123 456',
  lat: 16.0607366,
  lng: 108.2112765
};

// Từ điển các tuyến đường, địa danh, phường, quận tại Đà Nẵng
const DA_NANG_LOCATIONS = [
  // Trụ sở công ty
  { keywords: ['dang thai mai', '29 dang thai mai', 'rosi', 'vinh trung'], name: '29 Đặng Thai Mai, P. Vĩnh Trung, Thanh Khê', lat: 16.0607366, lng: 108.2112765 },

  // Quận Thanh Khê
  { keywords: ['dien bien phu', 'dien bien phu thanh khe', 'nga ba hue'], name: 'Đường Điện Biên Phủ, Thanh Khê, Đà Nẵng', lat: 16.0664, lng: 108.1942 },
  { keywords: ['ha huy tap', 'ha huy tap thanh khe'], name: 'Đường Hà Huy Tập, Thanh Khê, Đà Nẵng', lat: 16.0621, lng: 108.1884 },
  { keywords: ['dung si thanh khe'], name: 'Đường Dũng Sĩ Thanh Khê, Đà Nẵng', lat: 16.0678, lng: 108.1823 },
  { keywords: ['tran cao van'], name: 'Đường Trần Cao Vân, Thanh Khê, Đà Nẵng', lat: 16.0712, lng: 108.2014 },
  { keywords: ['nguyen tat thanh', 'bien nguyen tat thanh'], name: 'Đường Nguyễn Tất Thành, Thanh Khê, Đà Nẵng', lat: 16.0792, lng: 108.1956 },
  { keywords: ['hai phong', 'ga da nang', 'ga tau'], name: 'Ga Đà Nẵng, 200 Hải Phòng, Tam Thuận, Thanh Khê', lat: 16.0715, lng: 108.2131 },
  { keywords: ['le duan thanh khe', 'le duan'], name: 'Đường Lê Duẩn, Thanh Khê/Hải Châu, Đà Nẵng', lat: 16.0685, lng: 108.2162 },
  { keywords: ['hung vuong thanh khe', 'hung vuong'], name: 'Đường Hùng Vương, Thanh Khê, Đà Nẵng', lat: 16.0671, lng: 108.2138 },
  { keywords: ['ong ich khiem thanh khe', 'ong ich khiem'], name: 'Đường Ông Ích Khiêm, Thanh Khê, Đà Nẵng', lat: 16.0652, lng: 108.2130 },
  { keywords: ['hoang hoa tham'], name: 'Đường Hoàng Hoa Thám, Thanh Khê, Đà Nẵng', lat: 16.0691, lng: 108.2118 },
  { keywords: ['thai thi boi'], name: 'Đường Thái Thị Bôi, Chính Gián, Thanh Khê', lat: 16.0645, lng: 108.1925 },
  { keywords: ['le do'], name: 'Đường Lê Độ, Chính Gián, Thanh Khê', lat: 16.0675, lng: 108.2025 },
  { keywords: ['nguyen tri phuong', 'ho thac gian'], name: 'Đường Nguyễn Tri Phương, Thanh Khê, Đà Nẵng', lat: 16.0585, lng: 108.2075 },
  { keywords: ['huynh ngoc hue'], name: 'Đường Huỳnh Ngọc Huệ, An Khê, Thanh Khê', lat: 16.0595, lng: 108.1835 },
  { keywords: ['me nhu'], name: 'Khu tượng đài Mẹ Nhu, Thanh Khê, Đà Nẵng', lat: 16.0642, lng: 108.1815 },

  // Quận Hải Châu
  { keywords: ['nguyen van linh', '120 nguyen van linh', 'ham chui nguyen van linh'], name: 'Đường Nguyễn Văn Linh, Hải Châu, Đà Nẵng', lat: 16.0612, lng: 108.2178 },
  { keywords: ['bach dang', 'duong bach dang'], name: 'Đường Bạch Đằng, Hải Châu, Đà Nẵng', lat: 16.0698, lng: 108.2241 },
  { keywords: ['tran phu'], name: 'Đường Trần Phú, Hải Châu, Đà Nẵng', lat: 16.0682, lng: 108.2223 },
  { keywords: ['2 thang 9', 'duong 2/9', 'duong 2 thang 9'], name: 'Đường 2 Tháng 9, Hải Châu, Đà Nẵng', lat: 16.0482, lng: 108.2218 },
  { keywords: ['phan chau trinh'], name: 'Đường Phan Châu Trinh, Hải Châu, Đà Nẵng', lat: 16.0635, lng: 108.2201 },
  { keywords: ['hoang dieu'], name: 'Đường Hoàng Diệu, Hải Châu, Đà Nẵng', lat: 16.0592, lng: 108.2173 },
  { keywords: ['trung nu vuong'], name: 'Đường Trưng Nữ Vương, Hải Châu, Đà Nẵng', lat: 16.0521, lng: 108.2189 },
  { keywords: ['dong da'], name: 'Đường Đống Đa, Hải Châu, Đà Nẵng', lat: 16.0772, lng: 108.2185 },
  { keywords: ['quang trung'], name: 'Đường Quang Trung, Hải Châu, Đà Nẵng', lat: 16.0735, lng: 108.2205 },
  { keywords: ['cho con', 'cho con da nang'], name: 'Chợ Cồn, 290 Hùng Vương, Vĩnh Trung, Hải Châu', lat: 16.0694, lng: 108.2148 },
  { keywords: ['cho han', 'cho han da nang'], name: 'Chợ Hàn, 119 Trần Phú, Hải Châu 1, Đà Nẵng', lat: 16.0685, lng: 108.2245 },
  { keywords: ['cau rong', 'duoi cau rong'], name: 'Cầu Rồng, Phước Ninh, Hải Châu, Đà Nẵng', lat: 16.0611, lng: 108.2272 },
  { keywords: ['cau song han'], name: 'Cầu Sông Hàn, Hải Châu, Đà Nẵng', lat: 16.0728, lng: 108.2278 },
  { keywords: ['cau tran thi ly'], name: 'Cầu Trần Thị Lý, Hải Châu, Đà Nẵng', lat: 16.0505, lng: 108.2275 },
  { keywords: ['san bay da nang', 'san bay', 'cang hang khong da nang'], name: 'Sân bay Quốc tế Đà Nẵng, Hải Châu', lat: 16.0544, lng: 108.2022 },
  { keywords: ['benh vien da nang', 'bv da nang'], name: 'Bệnh viện Đà Nẵng, 124 Hải Phòng, Hải Châu', lat: 16.0721, lng: 108.2172 },
  { keywords: ['benh vien c', 'bv c'], name: 'Bệnh viện C Đà Nẵng, Hải Phòng, Hải Châu', lat: 16.0728, lng: 108.2181 },

  // Quận Sơn Trà
  { keywords: ['pham van dong'], name: 'Đường Phạm Văn Đồng, An Hải Bắc, Sơn Trà', lat: 16.0718, lng: 108.2384 },
  { keywords: ['vo nguyen giap', 'bien my khe'], name: 'Đường Võ Nguyên Giáp, Bãi biển Mỹ Khê, Sơn Trà', lat: 16.0628, lng: 108.2468 },
  { keywords: ['ngo quyen'], name: 'Đường Ngô Quyền, Sơn Trà, Đà Nẵng', lat: 16.0754, lng: 108.2341 },
  { keywords: ['hoang sa', 'chua linh ung', 'ban dao son tra'], name: 'Chùa Linh Ứng, Bán đảo Sơn Trà, Đà Nẵng', lat: 16.1001, lng: 108.2778 },
  { keywords: ['cau thuan phuoc'], name: 'Cầu Thuận Phước, Nại Hiên Đông, Sơn Trà', lat: 16.0945, lng: 108.2235 },
  { keywords: ['cang tien sa', 'tien sa'], name: 'Cảng Tiên Sa, Yết Kiêu, Thọ Quang, Sơn Trà', lat: 16.1215, lng: 108.2189 },

  // Quận Ngũ Hành Sơn
  { keywords: ['ngu hanh son', 'duong ngu hanh son'], name: 'Đường Ngũ Hành Sơn, Mỹ An, Ngũ Hành Sơn', lat: 16.0461, lng: 108.2392 },
  { keywords: ['le van hien'], name: 'Đường Lê Văn Hiến, Khuê Mỹ, Ngũ Hành Sơn', lat: 16.0268, lng: 108.2482 },
  { keywords: ['chua non nuoc', 'nui ngu hanh son', 'danh thang ngu hanh son'], name: 'Di tích Ngũ Hành Sơn, Non Nước, Đà Nẵng', lat: 16.0045, lng: 108.2618 },
  { keywords: ['truong sa', 'resort non nuoc'], name: 'Đường Trường Sa, Hòa Hải, Ngũ Hành Sơn', lat: 16.0125, lng: 108.2652 },
  { keywords: ['benh vien phu san nhi', 'bv 600 giuong'], name: 'Bệnh viện Phụ sản - Nhi Đà Nẵng, Lê Văn Hiến', lat: 16.0315, lng: 108.2452 },

  // Quận Liên Chiểu
  { keywords: ['nguyen luong bang', 'hoa khanh', 'cho hoa khanh'], name: 'Đường Nguyễn Lương Bằng, Hòa Khánh, Liên Chiểu', lat: 16.0766, lng: 108.1501 },
  { keywords: ['ton duc thang'], name: 'Đường Tôn Đức Thắng, Hòa Minh, Liên Chiểu', lat: 16.0654, lng: 108.1685 },
  { keywords: ['kcn hoa khanh', 'khu cong nghiep hoa khanh'], name: 'Khu Công Nghiệp Hòa Khánh, Liên Chiểu', lat: 16.0852, lng: 108.1385 },
  { keywords: ['ben xe da nang', 'ben xe trung tam da nang'], name: 'Bến xe Trung tâm Đà Nẵng, Nam Trân, Cẩm Lệ', lat: 16.0592, lng: 108.1742 },
  { keywords: ['dai hoc bach khoa', 'dh bach khoa da nang'], name: 'Trường ĐH Bách Khoa, 54 Nguyễn Lương Bằng', lat: 16.0751, lng: 108.1532 },
  { keywords: ['nam o', 'lang nuoc mam nam o'], name: 'Làng Nam Ô, Hòa Hiệp Nam, Liên Chiểu', lat: 16.1182, lng: 108.1254 },

  // Quận Cẩm Lệ
  { keywords: ['cach mang thang 8', 'cmt8 da nang'], name: 'Đường Cách Mạng Tháng 8, Cẩm Lệ, Đà Nẵng', lat: 16.0354, lng: 108.2045 },
  { keywords: ['nguyen huu tho'], name: 'Đường Nguyễn Hữu Thọ, Cẩm Lệ, Đà Nẵng', lat: 16.0392, lng: 108.2098 },
  { keywords: ['le dai hanh'], name: 'Đường Lê Đại Hành, Khuê Trung, Cẩm Lệ', lat: 16.0312, lng: 108.1985 },
  { keywords: ['truong chinh'], name: 'Đường Trường Chinh, An Khê/Cẩm Lệ', lat: 16.0542, lng: 108.1812 },
  { keywords: ['hoa xuan', 'khu do thi hoa xuan', 'svd hoa xuan'], name: 'Sân vận động Hòa Xuân, Hòa Xuân, Cẩm Lệ', lat: 16.0092, lng: 108.2175 },
  { keywords: ['cho cam le', 'cau do'], name: 'Chợ Cẩm Lệ, Cầu Đỏ, Cẩm Lệ', lat: 16.0215, lng: 108.1995 },

  // Huyện Hòa Vang
  { keywords: ['ba na', 'ba na hills', 'sun world ba na'], name: 'Bà Nà Hills, Hòa Ninh, Hòa Vang, Đà Nẵng', lat: 15.9982, lng: 107.9875 },
  { keywords: ['hoa vang', 'hoa phuoc', 'hoa chau'], name: 'Huyện Hòa Vang, Đà Nẵng', lat: 16.0125, lng: 108.1824 },

  // Khu vực lân cận (Hội An, Điện Bàn)
  { keywords: ['hoi an', 'pho co hoi an'], name: 'Phố Cổ Hội An, Quảng Nam', lat: 15.8801, lng: 108.3380 },
  { keywords: ['dien ban', 'vinh dien'], name: 'Thị xã Điện Bàn, Quảng Nam', lat: 15.9082, lng: 108.2495 }
];

/**
 * Loại bỏ dấu tiếng Việt để tìm kiếm không dấu
 */
function removeVietnameseTones(str) {
  if (!str) return '';
  str = str.toLowerCase();
  str = str.replace(/à|á|ạ|ả|ã|â|ầ|ấ|ậ|ẩ|ẫ|ă|ằ|ắ|ặ|ẳ|ẵ/g, 'a');
  str = str.replace(/è|é|ẹ|ẻ|ẽ|ê|ề|ế|ệ|ể|ễ/g, 'e');
  str = str.replace(/ì|í|ị|ỉ|ĩ/g, 'i');
  str = str.replace(/ò|ó|ọ|ỏ|õ|ô|ồ|ố|ộ|ổ|ỗ|ơ|ờ|ớ|ợ|ở|ỡ/g, 'o');
  str = str.replace(/ù|ú|ụ|ủ|ũ|ư|ừ|ứ|ự|ử|ữ/g, 'u');
  str = str.replace(/ỳ|ý|ỵ|ỷ|ỹ/g, 'y');
  str = str.replace(/đ/g, 'd');
  str = str.replace(/\u0300|\u0301|\u0303|\u0309|\u0323/g, '');
  str = str.replace(/\u02C6|\u0306|\u031B/g, '');
  return str.trim();
}

/**
 * Tìm kiếm tọa độ tại Đà Nẵng bằng từ điển nội bộ
 */
function matchDaNangLocation(query) {
  if (!query) return null;
  const cleanQ = removeVietnameseTones(query);

  // 1. Kiểm tra xem có phải trụ sở công ty không
  if (cleanQ.includes('dang thai mai') || cleanQ.includes('rosi') || cleanQ.includes('29 dang thai mai')) {
    return {
      name: ROSI_HUB.address,
      lat: ROSI_HUB.lat,
      lng: ROSI_HUB.lng,
      is_hub: true
    };
  }

  // 2. Tìm trong danh mục từ điển
  let bestMatch = null;
  let maxScore = 0;

  for (const loc of DA_NANG_LOCATIONS) {
    for (const kw of loc.keywords) {
      const cleanKw = removeVietnameseTones(kw);
      if (cleanQ.includes(cleanKw)) {
        const score = cleanKw.length;
        if (score > maxScore) {
          maxScore = score;
          bestMatch = {
            name: `${query.trim()} (${loc.name})`,
            lat: loc.lat,
            lng: loc.lng,
            matched: loc.name
          };
        }
      }
    }
  }

  // 3. Nếu chưa khớp cụ thể, kiểm tra theo quận
  if (!bestMatch) {
    if (cleanQ.includes('hai chau')) {
      return { name: query, lat: 16.0652, lng: 108.2201, matched: 'Quận Hải Châu, Đà Nẵng' };
    }
    if (cleanQ.includes('thanh khe')) {
      return { name: query, lat: 16.0621, lng: 108.1984, matched: 'Quận Thanh Khê, Đà Nẵng' };
    }
    if (cleanQ.includes('son tra')) {
      return { name: query, lat: 16.0754, lng: 108.2341, matched: 'Quận Sơn Trà, Đà Nẵng' };
    }
    if (cleanQ.includes('ngu hanh son')) {
      return { name: query, lat: 16.0268, lng: 108.2482, matched: 'Quận Ngũ Hành Sơn, Đà Nẵng' };
    }
    if (cleanQ.includes('lien chieu')) {
      return { name: query, lat: 16.0766, lng: 108.1501, matched: 'Quận Liên Chiểu, Đà Nẵng' };
    }
    if (cleanQ.includes('cam le')) {
      return { name: query, lat: 16.0354, lng: 108.2045, matched: 'Quận Cẩm Lệ, Đà Nẵng' };
    }
    if (cleanQ.includes('hoa vang')) {
      return { name: query, lat: 16.0125, lng: 108.1824, matched: 'Huyện Hòa Vang, Đà Nẵng' };
    }

    // Mặc định tâm Đà Nẵng cách 29 Đặng Thai Mai ~3.5km
    return { name: query, lat: 16.0678, lng: 108.2208, matched: 'Trung tâm TP. Đà Nẵng' };
  }

  return bestMatch;
}

/**
 * Tính khoảng cách đường bộ dự phòng (Haversine nhân hệ số uốn lượn đường phố đô thị 1.28)
 */
function calculateHaversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371; // km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const crow = R * c;
  // Nhân hệ số uốn lượn thực tế đường phố Đà Nẵng 1.28
  return parseFloat((crow * 1.28).toFixed(2));
}

module.exports = {
  ROSI_HUB,
  DA_NANG_LOCATIONS,
  matchDaNangLocation,
  calculateHaversineKm,
  removeVietnameseTones
};
