/**
 * Module tính toán cước phí chuyến và tiền công shipper dựa trên quãng đường (km) và bảng giá cấu hình.
 */

function calculateShippingFee(distanceKm, settings) {
  const dist = Math.max(0.1, parseFloat(distanceKm) || 0);
  const baseDist = parseFloat(settings.base_distance_km || 2);
  const basePrice = parseFloat(settings.base_price || 16000);
  const tier1Max = parseFloat(settings.tier1_max_km || 10);
  const tier1Rate = parseFloat(settings.tier1_rate || 5500);
  const tier2Rate = parseFloat(settings.tier2_rate || 4500);

  let fee = 0;
  if (dist <= baseDist) {
    fee = basePrice;
  } else if (dist <= tier1Max) {
    fee = basePrice + (dist - baseDist) * tier1Rate;
  } else {
    fee = basePrice + (tier1Max - baseDist) * tier1Rate + (dist - tier1Max) * tier2Rate;
  }

  // Làm tròn đến 500đ để thuận tiện thanh toán
  return Math.round(fee / 500) * 500;
}

function calculateShipperEarning(shippingFee, distanceKm, shipper, settings) {
  const method = settings.salary_calc_method || 'trip_percentage';
  const dist = parseFloat(distanceKm) || 0;
  const fee = parseFloat(shippingFee) || 0;

  if (method === 'km_rate') {
    const rate = shipper && shipper.km_rate ? parseFloat(shipper.km_rate) : parseFloat(settings.shipper_default_km_rate || 4500);
    return Math.round(dist * rate);
  } else {
    // Mặc định là chia % theo cước chuyến
    const pct = shipper && shipper.commission_rate ? parseFloat(shipper.commission_rate) : parseFloat(settings.shipper_default_percentage || 75);
    return Math.round((fee * pct) / 100);
  }
}

module.exports = {
  calculateShippingFee,
  calculateShipperEarning
};
