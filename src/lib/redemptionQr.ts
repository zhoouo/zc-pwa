import type { Redemption } from '../types'

const REDEMPTION_QR_PREFIX = 'couple-pwa:redemption:v1'

type RedemptionQrSource = Pick<Redemption, 'id' | 'shopItemId' | 'creatorDbId' | 'redeemerDbId' | 'createdAt'>

const fnv1a = (value: string) => {
  let hash = 0x811c9dc5

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }

  return (hash >>> 0).toString(36).toUpperCase().padStart(7, '0')
}

const getRedemptionSignatureInput = (redemption: RedemptionQrSource) => {
  const [a, b] = [redemption.creatorDbId, redemption.redeemerDbId].sort()
  return [redemption.id, redemption.shopItemId, a, b, redemption.createdAt].join('|')
}

export const getRedemptionQrToken = (redemption: RedemptionQrSource) =>
  fnv1a(getRedemptionSignatureInput(redemption))

export const getRedemptionQrPayload = (redemption: RedemptionQrSource) =>
  `${REDEMPTION_QR_PREFIX}:${redemption.id}:${getRedemptionQrToken(redemption)}`

const normalizeQrValue = (value: string) => {
  const trimmed = value.trim()

  try {
    return decodeURIComponent(trimmed)
  } catch {
    return trimmed
  }
}

export const isMatchingRedemptionQr = (rawValue: string, redemption: RedemptionQrSource) => {
  const normalized = normalizeQrValue(rawValue)
  const expectedPayload = getRedemptionQrPayload(redemption)
  const expectedToken = getRedemptionQrToken(redemption)

  // First try exact match
  if (normalized === expectedPayload) return true

  // Fallback: parse QR code and validate components
  // The prefix "couple-pwa:redemption:v1" contains 3 colons, so splitting on ':' gives us 5 parts
  const parts = normalized.split(':')
  return (
    parts.length === 5 &&
    parts[0] === 'couple-pwa' &&           // prefix part 1
    parts[1] === 'redemption' &&            // prefix part 2  
    parts[2] === 'v1' &&                   // prefix part 3
    parts[3] === redemption.id &&            // redemption ID
    parts[4].toUpperCase() === expectedToken   // token
  )
}
