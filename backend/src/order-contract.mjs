export const PAYMENT_METHODS = new Set(['MANUAL', 'COD']);
export const DELIVERY_MODES = new Set(['DOOR', 'PICKUP']);
export const RETURN_REASONS = new Set(['DEFECT', 'MISMATCH', 'VIN_MISMATCH', 'DAMAGE', 'BUYER_REMORSE']);

export function validateOrderInput({ paymentMethod = 'COD', deliveryMode = 'DOOR', shippingAddress = null, nearestLandmark = null, pickupPointId = null }) {
  if (!PAYMENT_METHODS.has(paymentMethod)) return 'Payment method must be COD or MANUAL';
  if (!DELIVERY_MODES.has(deliveryMode)) return 'Delivery mode must be DOOR or PICKUP';
  if (deliveryMode === 'DOOR' && !shippingAddress && !nearestLandmark) return 'A door delivery address or landmark is required';
  if (deliveryMode === 'PICKUP' && !pickupPointId) return 'A pickup point is required';
  return null;
}
