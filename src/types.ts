export type UserId = 'self' | 'partner'
export type DensityMode = 'airy' | 'compact'
export type MotionMode = 'soft' | 'still'
export type GlassMode = 'luminous' | 'muted'

export type TaskStatus = 'open' | 'submitted' | 'approved' | 'rejected' | 'cancelled'
export type EntryType = 'task_reward' | 'shop_redeem' | 'manual_adjustment'
export type SourceType = 'task' | 'redemption' | 'manual'
export type RedemptionStatus = 'redeemed' | 'in_progress' | 'fulfilled' | 'cancelled'

export interface Profile {
  id: UserId
  realId?: string
  name: string
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

export interface BindingInfo {
  inviteCode: string
  status: 'demo' | 'paired' | 'pending'
}

export interface AppState {
  isSetupComplete: boolean
  coupleId?: string
  currentUserId: UserId
  profiles: Profile[]
  tasks: Task[]
  ledger: LedgerEntry[]
  shopItems: ShopItem[]
  redemptions: Redemption[]
  appearance: AppearanceSettings
  binding: BindingInfo
}
