export type UserId = 'self' | 'partner'
export type DensityMode = 'airy' | 'compact'
export type MotionMode = 'soft' | 'still'
export type GlassMode = 'luminous' | 'muted'

export const notificationPreferenceKeys = [
  'partnerTaskAssigned',
  'partnerTaskProgress',
  'partnerTaskReviewed',
  'partnerShopUpdated',
  'partnerRedemption',
  'selfTaskCreated',
  'selfTaskProgress',
  'selfTaskReviewed',
  'selfShopUpdated',
  'selfRedemption'
] as const

export type NotificationPreferenceKey = (typeof notificationPreferenceKeys)[number]
export type NotificationPreferenceMap = Record<NotificationPreferenceKey, boolean>

export type TaskStatus = 'open' | 'accepted' | 'submitted' | 'approved' | 'rejected' | 'cancelled'
export type EntryType = 'task_reward' | 'shop_redeem' | 'manual_adjustment'
export type SourceType = 'task' | 'redemption' | 'manual'
export type RedemptionStatus = 'redeemed' | 'in_progress' | 'fulfilled' | 'cancelled'

export interface Profile {
  id: UserId
  realId?: string
  name: string
  title?: string
  avatarUrl?: null | string
  avatarTone: string
}

export interface Task {
  id: string
  title: string
  description: string
  coinReward: number
  dueAt: string
  status: TaskStatus
  creatorId: UserId
  assigneeId: UserId
  createdAt: string
  updatedAt: string
  submittedAt?: string
  approvedAt?: string
  rejectionNote?: string
  isRecurring: boolean
}

export interface LedgerEntry {
  id: string
  userId: UserId
  entryType: EntryType
  amount: number
  sourceType: SourceType
  sourceId: string
  description: string
  createdAt: string
}

export interface ShopItem {
  id: string
  title: string
  description: string
  price: number
  isProduct: boolean
  realPrice?: number | null
  category: string
  creatorId: UserId
  isActive: boolean
  isHidden: boolean
  imageUrl?: string | null
  createdAt: string
}

export interface Redemption {
  id: string
  shopItemId: string
  /** 資料庫 UUID，QR 簽名用（與 self/partner 視角無關） */
  creatorDbId: string
  redeemerDbId: string
  creatorId: UserId
  redeemerId: UserId
  priceSnapshot: number
  status: RedemptionStatus
  note: string
  createdAt: string
  updatedAt: string
}

export interface SetupForm {
  selfName: string
  partnerName: string
}

export interface AppearanceSettings {
  density: DensityMode
  motion: MotionMode
  glass: GlassMode
}

export interface NotificationSettings {
  enabled: boolean
  events: NotificationPreferenceMap
}

export interface BindingInfo {
  inviteCode: string
  status: 'demo' | 'idle' | 'paired' | 'pending'
}

export interface AppState {
  isInitializing: boolean
  isSetupComplete: boolean
  coupleId?: null | string
  currentUserId: UserId
  profiles: Profile[]
  tasks: Task[]
  ledger: LedgerEntry[]
  shopItems: ShopItem[]
  redemptions: Redemption[]
  appearance: AppearanceSettings
  notifications: NotificationSettings
  binding: BindingInfo
  tags: string[]
}
