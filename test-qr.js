const REDEMPTION_QR_PREFIX = 'couple-pwa:redemption:v1';
const redemption = {
  id: 'test123',
  shopItemId: 'item456', 
  redeemerId: 'user789',
  creatorId: 'user123',
  createdAt: '2023-01-01T00:00:00.000Z'
};

const getRedemptionSignatureInput = (redemption) => [
  redemption.id,
  redemption.shopItemId,
  redemption.redeemerId,
  redemption.creatorId,
  redemption.createdAt
].join('|');

const fnv1a = (value) => {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36).toUpperCase().padStart(7, '0');
};

const getRedemptionQrToken = (redemption) =>
  fnv1a(getRedemptionSignatureInput(redemption));

const getRedemptionQrPayload = (redemption) =>
  `${REDEMPTION_QR_PREFIX}:${redemption.id}:${getRedemptionQrToken(redemption)}`;

const payload = getRedemptionQrPayload(redemption);
console.log('Generated payload:', payload);
console.log('Split parts:', payload.split(':'));
