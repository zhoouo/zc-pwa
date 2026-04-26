import { computed, reactive, watch } from 'vue'

import type {
  AppState,
  AppearanceSettings,
  LedgerEntry,
  Redemption,
  RedemptionStatus,
  SetupForm,
  ShopItem,
  Task,
  UserId
} from '../types'

const STORAGE_KEY = 'couple-ledger-state'

const avatarTones: Record<UserId, string> = {
  self: 'from-[#f5ece1] via-[#e4d0b7] to-[#b28a5c]',
  partner: 'from-[#f3eee7] via-[#d8dccf] to-[#89907d]'
}

const makeId = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

const nowIso = () => new Date().toISOString()

const plusDays = (days: number) => {
  const date = new Date()
  date.setDate(date.getDate() + days)
  return date.toISOString().slice(0, 10)
}

const makeInviteCode = () => `PAIR-${Math.random().toString(36).slice(2, 6).toUpperCase()}`

const defaultAppearance = (): AppearanceSettings => ({
  density: 'airy',
  motion: 'soft',
  glass: 'luminous'
})

const defaultState = (): AppState => ({
  isSetupComplete: false,
  currentUserId: 'self',
  profiles: [
    { id: 'self', name: '我', title: '今天的你', avatarUrl: null, avatarTone: avatarTones.self },
    { id: 'partner', name: '對方', title: '另一半', avatarUrl: null, avatarTone: avatarTones.partner }
  ],
  tasks: [],
  ledger: [],
  shopItems: [],
  redemptions: [],
  appearance: defaultAppearance(),
  binding: {
    inviteCode: makeInviteCode(),
    status: 'demo'
  }
})

const seedState = (setup: SetupForm): AppState => {
  const createdAt = nowIso()
  const starterItems: ShopItem[] = [
    {
      id: makeId(),
      title: '今晚的電影由你決定',
      description: '片單與零食都照你的意思來。',
      price: 120,
      category: '夜晚',
      creatorId: 'partner',
      isActive: true,
      isHidden: false,
      createdAt
    },
    {
      id: makeId(),
      title: '晚安按摩三十分鐘',
      description: '不急著說話，就安靜陪你放鬆。',
      price: 220,
      category: '照顧',
      creatorId: 'partner',
      isActive: true,
      isHidden: true,
      createdAt
    },
    {
      id: makeId(),
      title: '早餐由我處理',
      description: '隔天早上我來準備，不讓你想流程。',
      price: 90,
      category: '日常',
      creatorId: 'self',
      isActive: true,
      isHidden: false,
      createdAt
    }
  ]

  const starterTasks: Task[] = [
    {
      id: makeId(),
      title: '把明天想吃的早餐告訴我',
      description: '簡單一點也可以，只要讓早上更輕鬆。',
      coinReward: 24,
      dueAt: plusDays(1),
      status: 'open',
      creatorId: 'partner',
      assigneeId: 'self',
      createdAt,
      updatedAt: createdAt
    },
    {
      id: makeId(),
      title: '把今天的衣服收好',
      description: '洗好摺好就算完成。',
      coinReward: 18,
      dueAt: plusDays(2),
      status: 'submitted',
      creatorId: 'self',
      assigneeId: 'partner',
      createdAt,
      updatedAt: createdAt,
      submittedAt: createdAt
    }
  ]

  const starterLedger: LedgerEntry[] = [
    {
      id: makeId(),
      userId: 'self',
      entryType: 'manual_adjustment',
      amount: 120,
      sourceType: 'manual',
      sourceId: 'seed',
      description: '初始金幣',
      createdAt
    },
    {
      id: makeId(),
      userId: 'partner',
      entryType: 'manual_adjustment',
      amount: 120,
      sourceType: 'manual',
      sourceId: 'seed',
      description: '初始金幣',
      createdAt
    }
  ]

  return {
    isSetupComplete: true,
    currentUserId: 'self',
    profiles: [
      {
        id: 'self',
        name: setup.selfName.trim(),
        title: setup.selfTitle.trim() || '今天的你',
        avatarUrl: null,
        avatarTone: avatarTones.self
      },
      {
        id: 'partner',
        name: setup.partnerName.trim(),
        title: setup.partnerTitle.trim() || '另一半',
        avatarUrl: null,
        avatarTone: avatarTones.partner
      }
    ],
    tasks: starterTasks,
    ledger: starterLedger,
    shopItems: starterItems,
    redemptions: [],
    appearance: defaultAppearance(),
    binding: {
      inviteCode: makeInviteCode(),
      status: 'demo'
    }
  }
}

const hydrateState = (): AppState => {
  if (typeof window === 'undefined') {
    return defaultState()
  }

  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (!raw) {
    return defaultState()
  }

  try {
    return { ...defaultState(), ...JSON.parse(raw) } as AppState
  } catch {
    return defaultState()
  }
}

const state = reactive<AppState>(hydrateState())

if (typeof window !== 'undefined') {
  watch(
    state,
    (value) => {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
    },
    { deep: true }
  )
}

const getBalance = (userId: UserId) =>
  state.ledger.filter((entry) => entry.userId === userId).reduce((sum, entry) => sum + entry.amount, 0)

export const useCoupleApp = () => {
  const currentUser = computed(() => state.profiles.find((profile) => profile.id === state.currentUserId)!)
  const partnerUser = computed(() => state.profiles.find((profile) => profile.id !== state.currentUserId)!)
  const profileMap = computed(
    () => Object.fromEntries(state.profiles.map((profile) => [profile.id, profile])) as Record<UserId, AppState['profiles'][number]>
  )
  const tasksAssignedToMe = computed(() =>
    state.tasks
      .filter((task) => task.assigneeId === state.currentUserId && task.status !== 'cancelled')
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  )
  const tasksCreatedByMe = computed(() =>
    state.tasks
      .filter((task) => task.creatorId === state.currentUserId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  )
  const reviewQueue = computed(() =>
    state.tasks
      .filter((task) => task.creatorId === state.currentUserId && task.status === 'submitted')
      .sort((a, b) => b.submittedAt?.localeCompare(a.submittedAt ?? '') ?? 0)
  )
  const availableShopItems = computed(() =>
    state.shopItems
      .filter((item) => item.creatorId !== state.currentUserId && item.isActive)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  )
  const myShopItems = computed(() =>
    state.shopItems
      .filter((item) => item.creatorId === state.currentUserId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  )
  const myRedemptions = computed(() =>
    state.redemptions
      .filter((entry) => entry.redeemerId === state.currentUserId || entry.creatorId === state.currentUserId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  )
  const balances = computed(() => ({
    self: getBalance('self'),
    partner: getBalance('partner')
  }))
  const recentLedger = computed(() =>
    [...state.ledger].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 16)
  )

  const completeSetup = (form: SetupForm) => {
    const nextState = seedState(form)
    Object.assign(state, nextState)
  }

  const switchPerspective = (userId: UserId) => {
    state.currentUserId = userId
  }

  const updateProfile = (
    userId: UserId,
    patch: {
      avatarUrl?: null | string
      name?: string
      title?: string
    }
  ) => {
    const profile = state.profiles.find((entry) => entry.id === userId)
    if (!profile) {
      return
    }

    if (patch.name !== undefined) {
      profile.name = patch.name.trim() || profile.name
    }

    if (patch.title !== undefined) {
      profile.title = patch.title.trim() || profile.title
    }

    if (patch.avatarUrl !== undefined) {
      profile.avatarUrl = patch.avatarUrl
    }
  }

  const updateAppearance = (patch: Partial<AppearanceSettings>) => {
    state.appearance = { ...state.appearance, ...patch }
  }

  const createTask = (payload: {
    title: string
    description: string
    coinReward: number
    dueAt: string
    assigneeId: UserId
  }) => {
    const createdAt = nowIso()
    state.tasks.unshift({
      id: makeId(),
      title: payload.title.trim(),
      description: payload.description.trim(),
      coinReward: payload.coinReward,
      dueAt: payload.dueAt,
      status: 'open',
      creatorId: state.currentUserId,
      assigneeId: payload.assigneeId,
      createdAt,
      updatedAt: createdAt
    })
  }

  const submitTask = (taskId: string) => {
    const task = state.tasks.find((entry) => entry.id === taskId)
    if (!task || task.assigneeId !== state.currentUserId || task.status === 'approved') {
      return
    }

    task.status = 'submitted'
    task.submittedAt = nowIso()
    task.updatedAt = task.submittedAt
  }

  const rejectTask = (taskId: string, note: string) => {
    const task = state.tasks.find((entry) => entry.id === taskId)
    if (!task || task.creatorId !== state.currentUserId || task.status !== 'submitted') {
      return
    }

    task.status = 'rejected'
    task.rejectionNote = note.trim()
    task.updatedAt = nowIso()
  }

  const approveTask = (taskId: string) => {
    const task = state.tasks.find((entry) => entry.id === taskId)
    if (!task || task.creatorId !== state.currentUserId || task.status !== 'submitted') {
      return
    }

    const approvedAt = nowIso()
    task.status = 'approved'
    task.approvedAt = approvedAt
    task.updatedAt = approvedAt

    state.ledger.unshift({
      id: makeId(),
      userId: task.assigneeId,
      entryType: 'task_reward',
      amount: task.coinReward,
      sourceType: 'task',
      sourceId: task.id,
      description: task.title,
      createdAt: approvedAt
    })
  }

  const createShopItem = (payload: {
    title: string
    description: string
    price: number
    category: string
    isHidden: boolean
  }) => {
    state.shopItems.unshift({
      id: makeId(),
      title: payload.title.trim(),
      description: payload.description.trim(),
      price: payload.price,
      category: payload.category.trim() || '未分類',
      creatorId: state.currentUserId,
      isActive: true,
      isHidden: payload.isHidden,
      createdAt: nowIso()
    })
  }

  const toggleItemVisibility = (itemId: string) => {
    const item = state.shopItems.find((entry) => entry.id === itemId)
    if (!item || item.creatorId !== state.currentUserId) {
      return
    }

    item.isActive = !item.isActive
  }

  const redeemItem = (itemId: string, note: string) => {
    const item = state.shopItems.find((entry) => entry.id === itemId)
    if (!item || item.creatorId === state.currentUserId || !item.isActive) {
      return { ok: false as const, reason: '商品目前無法兌換。' }
    }

    const balance = getBalance(state.currentUserId)
    if (balance < item.price) {
      return { ok: false as const, reason: '目前金幣不足。' }
    }

    const createdAt = nowIso()
    const redemption: Redemption = {
      id: makeId(),
      shopItemId: item.id,
      creatorId: item.creatorId,
      redeemerId: state.currentUserId,
      priceSnapshot: item.price,
      status: 'redeemed',
      note: note.trim(),
      createdAt,
      updatedAt: createdAt
    }

    state.redemptions.unshift(redemption)
    state.ledger.unshift({
      id: makeId(),
      userId: state.currentUserId,
      entryType: 'shop_redeem',
      amount: -item.price,
      sourceType: 'redemption',
      sourceId: redemption.id,
      description: item.title,
      createdAt
    })

    return { ok: true as const }
  }

  const updateRedemptionStatus = (redemptionId: string, status: RedemptionStatus) => {
    const redemption = state.redemptions.find((entry) => entry.id === redemptionId)
    if (!redemption || redemption.creatorId !== state.currentUserId) {
      return
    }

    redemption.status = status
    redemption.updatedAt = nowIso()
  }

  const resetAll = () => {
    Object.assign(state, defaultState())
  }

  return {
    state,
    currentUser,
    partnerUser,
    profileMap,
    tasksAssignedToMe,
    tasksCreatedByMe,
    reviewQueue,
    availableShopItems,
    myShopItems,
    myRedemptions,
    balances,
    recentLedger,
    completeSetup,
    switchPerspective,
    updateProfile,
    updateAppearance,
    createTask,
    submitTask,
    rejectTask,
    approveTask,
    createShopItem,
    toggleItemVisibility,
    redeemItem,
    updateRedemptionStatus,
    resetAll
  }
}
