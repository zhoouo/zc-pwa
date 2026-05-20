<script setup lang="ts">
import { computed, defineAsyncComponent, nextTick, onMounted, reactive, ref, watch } from 'vue'
import {
  CheckCheck,
  Cloud,
  Gift,
  Home,
  LibraryBig,
  LockKeyhole,
  LogOut,
  Plus,
  Star,
  ScrollText,
  Settings2,
  Sparkles,
  ChevronUp,
  ChevronDown,
  AlertCircle,
  BellRing,
  CheckCircle2,
  X,
  Mail,
  Lock,
  User,
  Eye,
  EyeOff,
  Tag
} from 'lucide-vue-next'

import PersonChip from './components/PersonChip.vue'
import SectionTabs from './components/SectionTabs.vue'
import DatePicker from './components/DatePicker.vue'
import { useCoupleApp } from './composables/useCoupleApp'
import { useSupabaseAuth } from './composables/useSupabaseAuth'
import ConfirmModal from './components/ConfirmModal.vue'
import CouponTicket from './components/CouponTicket.vue'
import GiftPopup from './components/GiftPopup.vue'
import { activeGifts, type GiftConfig } from './config/gifts'
import type {
  DensityMode,
  GlassMode,
  MotionMode,
  NotificationPreferenceKey,
  Profile,
  Redemption,
  ShopItem,
  Task,
  UserId
} from './types'
import {
  getNotificationPermissionState,
  isAppleMobilePlatform,
  isNotificationSupported,
  isStandalonePwa,
  requestNotificationPermission,
  showZcNotification,
  type NotificationPermissionState
} from './lib/notifications'

type ViewKey = 'home' | 'tasks' | 'shop' | 'ledger' | 'settings'
type TaskSubView = 'assigned' | 'review' | 'created' | 'new'
type ShopSubView = 'browse' | 'orders' | 'mine' | 'wish' | 'new'
type LedgerSubView = 'overview' | 'history'
type SettingsSubView = 'account' | 'profile' | 'pairing' | 'tags' | 'notifications' | 'appearance' | 'space'

const {
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
  fetchData,
  createSpace,
  joinSpace,
  getInviteCode,
  switchPerspective,
  updateProfile,
  completeSetup,
  updateAppearance,
  updateNotificationSettings,
  initializePushNotifications,
  sendPushNotification,
  createTask,
  updateTask,
  deleteTask,
  acceptTask,
  abandonTask,
  punishOverdueTask,
  submitTask,
  rejectTask,
  approveTask,
  clearCompletedTask,
  createShopItem,
  updateShopItem,
  toggleItemVisibility,
  deleteShopItem,
  redeemItem,
  updateRedemptionStatus,
  cancelRedemption,
  deleteSpace,
  generateInviteCode,
  resetState,
  updateTags,
  renameTag,
  deleteTag,
  isTagLocked,
  addSystemReward
} = useCoupleApp()

const {
  errorMessage: authErrorMessage,
  isAuthenticated,
  isSupabaseEnabled,
  loading: authLoading,
  metadata,
  signIn,
  signUp,
  signOut,
  updateMetadata,
  uploadAvatar,
  uploadFile,
  compressImage,
  deleteAccount,
  user
} = useSupabaseAuth()

const RedemptionScanner = defineAsyncComponent(() => import('./components/RedemptionScanner.vue'))

const activeView = ref<ViewKey>('home')
const taskSubView = ref<TaskSubView>('assigned')
const shopSubView = ref<ShopSubView>('browse')
const ledgerSubView = ref<LedgerSubView>('overview')
const settingsSubView = ref<SettingsSubView>('account')
const accountMode = ref<'signin' | 'signup'>('signin')
const showPassword = ref(false)
const hiddenTapCount = ref(0)
const hiddenUnlocked = ref(false)
const shopSelectedCategory = ref<string>('全部')
const rejectionDraft = reactive<Record<string, string>>({})
const redemptionNote = reactive<Record<string, string>>({})
const editingTaskId = ref<string | null>(null)
const shopImageInput = ref<HTMLInputElement | null>(null)
const wishImageInput = ref<HTMLInputElement | null>(null)
const avatarInput = ref<HTMLInputElement | null>(null)
const selectedRedemptionId = ref<string | null>(null)
const scannerRedemptionId = ref<string | null>(null)
const banner = reactive({
  text: 'ヾ(^▽^*))',
  type: 'info' as 'info' | 'success' | 'error',
  visible: true
})
let bannerTimer: number | null = null

const giftQueue = ref<GiftConfig[]>([])
const claimedGiftBuffer = ref<GiftConfig[]>([])
const isGiftSequenceCompleting = ref(false)
const currentGift = computed(() => giftQueue.value[0] ?? null)

const getTodayGiftKeys = (date = new Date()) => {
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return {
    year: yyyy,
    currentDate: `${yyyy}-${mm}-${dd}`,
    currentMonthDay: `${mm}-${dd}`
  }
}

const getGiftLedgerTag = (gift: GiftConfig) => `[禮物:${gift.storageKey}]`

const getGiftClaimStorageKey = (gift: GiftConfig, year = getTodayGiftKeys().year) =>
  `gift_claimed_${gift.storageKey}_${year}`

const isGiftScheduledToday = (gift: GiftConfig, date = new Date()) => {
  const { currentDate, currentMonthDay } = getTodayGiftKeys(date)
  return gift.targetDate === currentDate || gift.targetDate === currentMonthDay
}

const isGiftClaimedInLedger = (gift: GiftConfig) => {
  const giftTag = getGiftLedgerTag(gift)
  return state.ledger.some(entry =>
    entry.userId === 'self' &&
    entry.entryType === 'manual_adjustment' &&
    entry.sourceType === 'manual' &&
    entry.description.includes(giftTag)
  )
}

const isGiftClaimedInStorage = (gift: GiftConfig) =>
  localStorage.getItem(getGiftClaimStorageKey(gift)) === 'true'

const isGiftEligibleForQueue = (gift: GiftConfig) =>
  isGiftScheduledToday(gift) && !isGiftClaimedInLedger(gift) && !isGiftClaimedInStorage(gift)

const refreshGiftQueue = () => {
  if (!isAuthenticated.value || authLoading.value || state.isInitializing) {
    giftQueue.value = []
    claimedGiftBuffer.value = []
    return
  }

  if (giftQueue.value.length || claimedGiftBuffer.value.length || isGiftSequenceCompleting.value) return

  giftQueue.value = activeGifts.filter(isGiftEligibleForQueue)
}

const markGiftClaimedInStorage = (gift: GiftConfig) => {
  localStorage.setItem(getGiftClaimStorageKey(gift), 'true')
}

const completeGiftClaims = async () => {
  const claimedGifts = [...claimedGiftBuffer.value]
  if (!claimedGifts.length) return

  isGiftSequenceCompleting.value = true
  let totalCoins = 0
  let hasError = false

  for (let i = 0; i < claimedGifts.length; i++) {
    const gift = claimedGifts[i]
    const description = `${getGiftLedgerTag(gift)} ${gift.title}`
    const result = await addSystemReward(gift.coins, description, 'self')

    if (result.error) {
      pushNotify(`領取失敗：${result.error}`, 'error')
      giftQueue.value = claimedGifts.slice(i)
      hasError = true
      break
    } else {
      markGiftClaimedInStorage(gift)
      totalCoins += gift.coins
    }
  }

  if (!hasError) {
    switchMainView('ledger')
    const giftCountText = claimedGifts.length > 1 ? `${claimedGifts.length} 份禮物` : '禮物'
    pushNotify(`恭喜！你領完${giftCountText}，獲得 ${totalCoins} 枚金幣`, 'success')
  }

  claimedGiftBuffer.value = []
  isGiftSequenceCompleting.value = false
}

const handleGiftClaim = async () => {
  const claimedGift = currentGift.value
  if (!claimedGift) return

  claimedGiftBuffer.value = [...claimedGiftBuffer.value, claimedGift]
  giftQueue.value = giftQueue.value.slice(1)

  if (giftQueue.value.length) return
  await completeGiftClaims()
}

const pushNotify = (msg: string, type: 'info' | 'success' | 'error' = 'info', duration = 4000) => {
  if (bannerTimer) clearTimeout(bannerTimer)
  
  banner.text = msg
  banner.type = type
  banner.visible = true
  
  if (duration > 0) {
    bannerTimer = window.setTimeout(() => {
      banner.visible = false
      // 不要立刻清空文字，讓動畫跑完
      setTimeout(() => {
        if (!banner.visible) banner.text = 'ヾ(^▽^*))'
      }, 300)
    }, duration)
  }
}

const closeNotify = () => {
  if (bannerTimer) clearTimeout(bannerTimer)
  banner.visible = false
}

const isBusy = ref(false)
const selectedImageUrl = ref<string | null>(null)

const confirmModal = reactive({
  show: false,
  title: '',
  message: '',
  confirmText: '確定',
  variant: 'primary' as 'primary' | 'danger',
  onConfirm: () => {}
})

const noticeModal = reactive({
  show: false,
  title: '',
  message: '',
  confirmText: '知道了',
  variant: 'primary' as 'primary' | 'danger'
})

const openConfirm = (config: { title: string; message: string; confirmText?: string; variant?: 'primary' | 'danger'; onConfirm: () => void | Promise<void> }) => {
  confirmModal.title = config.title
  confirmModal.message = config.message
  confirmModal.confirmText = config.confirmText || '確定'
  confirmModal.variant = config.variant || 'primary'
  confirmModal.onConfirm = () => {
    config.onConfirm()
    confirmModal.show = false
  }
  confirmModal.show = true
}

const openNotice = (config: { title: string; message: string; confirmText?: string; variant?: 'primary' | 'danger' }) => {
  noticeModal.title = config.title
  noticeModal.message = config.message
  noticeModal.confirmText = config.confirmText || '知道了'
  noticeModal.variant = config.variant || 'primary'
  noticeModal.show = true
}

const setupForm = reactive({
  inviteCode: ''
})

const taskForm = reactive({
  title: '',
  description: '',
  dueAt: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
  isRecurring: false
})

const taskEditDraft = reactive({
  title: '',
  description: '',
  coinReward: 0,
  dueAt: '',
  isRecurring: false
})

const shopForm = reactive({
  title: '',
  description: '',
  price: 120,
  isProduct: false,
  realPrice: 0,
  category: '日常',
  isHidden: false,
  rawFile: null as File | null,
  imageUrl: ''
})
const shopImagePreview = ref<string | null>(null)
const currentWishId = ref<string | null>(null)
const editingShopItemId = ref<string | null>(null)
let skipShopNewTabReset = false

const shopCoinQuote = computed(() => {
  if (!shopForm.isProduct) return shopForm.price
  const real = Number(shopForm.realPrice)
  if (!Number.isFinite(real) || real < 0) return 0
  return Math.max(0, Math.round(real * 15))
})

const wishForm = reactive({
  title: '',
  description: '',
  imageUrl: '' as string,
  rawFile: null as File | null
})
const wishImagePreview = ref<string | null>(null)
const isWishFormExpanded = ref(false)

const accountForm = reactive({
  email: '',
  password: '',
  nickname: ''
})

const selfDraft = reactive({
  nickname: ''
})

const notificationTab = ref<'partner' | 'self'>('partner')
const expandedNotificationItems = ref<Set<string>>(new Set())

const toggleNotificationItem = (key: string) => {
  if (expandedNotificationItems.value.has(key)) {
    expandedNotificationItems.value.delete(key)
  } else {
    expandedNotificationItems.value.add(key)
  }
}

watch(
  activeView,
  () => {
    hiddenUnlocked.value = false
    hiddenTapCount.value = 0
    if (activeView.value === 'shop' && state.coupleId && state.shopItems.length === 0) {
      void fetchData(true)
    }
  }
)

watch(
  () => [profileMap.value.self.name, profileMap.value.partner.name],
  () => {
    selfDraft.nickname = profileMap.value.self.name
  },
  { immediate: true }
)

watch(
  metadata,
  (value) => {
    if (!isSupabaseEnabled || !isAuthenticated.value) {
      return
    }

    updateProfile('self', {
      avatarUrl: value.avatar_url ?? profileMap.value.self.avatarUrl,
      name: value.nickname ?? profileMap.value.self.name
    })
  },
  { immediate: true }
)

const actionableTasks = computed(() =>
  tasksAssignedToMe.value.filter((task) => task.status === 'open' || task.status === 'accepted' || task.status === 'rejected')
)

const homeTaskCount = computed(() => actionableTasks.value.length)

const homeRedemptionCount = computed(
  () => myRedemptions.value.filter((entry) => entry.creatorId === state.currentUserId && !isHiddenRedemption(entry.id)).length
)

const visibleShopItems = computed(() =>
  availableShopItems.value.filter((item) => hiddenUnlocked.value || !item.isHidden)
)

const hiddenShopItems = computed(() => availableShopItems.value.filter((item) => item.isHidden))

const shopCategories = computed(() => {
  // 根據當前 subView 決定來源：mine tab 用我的非隱藏商品，其餘用對方的可見商品
  let sourceCats: Set<string>
  if (shopSubView.value === 'mine') {
    sourceCats = new Set(
      myShopItems.value
        .filter(i => !i.isHidden)
        .map(i => i.category)
        .filter(Boolean)
    )
  } else {
    sourceCats = new Set(
      availableShopItems.value
        .filter(i => !i.isHidden)
        .map(i => i.category)
        .filter(Boolean)
    )
  }
  // 依照 state.tags 順序，只保留有實際內容的分類
  const cats = ['全部', ...state.tags.filter(t => sourceCats.has(t))]
  // 加入不在 state.tags 但確實存在於當前 subView 商品的分類
  sourceCats.forEach(c => {
    if (!cats.includes(c) && c !== '許願池') cats.push(c)
  })
  if (hiddenUnlocked.value) cats.push('隱藏項目')
  return cats
})

const filteredBrowseItems = computed(() => {
  let items = visibleShopItems.value
  if (shopSelectedCategory.value === '隱藏項目') {
    return hiddenShopItems.value
  }
  if (shopSelectedCategory.value !== '全部') {
    items = items.filter(item => item.category === shopSelectedCategory.value)
  }
  // Exclude hidden items from normal categories
  return items.filter(item => !item.isHidden)
})

const filteredMyItems = computed(() => {
  let items = myShopItems.value
  if (shopSelectedCategory.value === '隱藏項目') {
    return items.filter(item => item.isHidden)
  }
  if (shopSelectedCategory.value !== '全部') {
    items = items.filter(item => item.category === shopSelectedCategory.value)
  }
  return items.filter(item => !item.isHidden)
})

const incomingRedemptions = computed(() =>
  myRedemptions.value.filter((entry) => entry.creatorId === state.currentUserId)
)

const outgoingRedemptions = computed(() =>
  myRedemptions.value.filter((entry) => entry.redeemerId === state.currentUserId)
)

const isTaskFormValid = computed(() =>
  Boolean(taskForm.title.trim()) &&
  true
)

const isTaskEditValid = computed(() =>
  Boolean(taskEditDraft.title.trim()) &&
  Number.isFinite(taskEditDraft.coinReward) &&
  taskEditDraft.coinReward >= 0
)

const isHiddenRedemption = (redemptionId: string) => {
  const redemption = state.redemptions.find((entry) => entry.id === redemptionId)
  const item = state.shopItems.find((shopItem) => shopItem.id === redemption?.shopItemId)
  return Boolean(item?.isHidden)
}

const homeRedemptions = computed(() =>
  myRedemptions.value.filter((entry) => !isHiddenRedemption(entry.id)).slice(0, 4)
)

const wishItems = computed(() =>
  state.shopItems.filter((item) => item.category === '許願池').sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
)

const myWishes = computed(() => wishItems.value.filter(item => item.creatorId === 'self'))
const partnerWishes = computed(() => wishItems.value.filter(item => item.creatorId === 'partner'))

const taskSections = computed(() => [
  { key: 'assigned', label: '他想要我...', count: actionableTasks.value.length },
  { key: 'review', label: '他完成啦', count: reviewQueue.value.length },
  { key: 'created', label: '我要他...', count: tasksCreatedByMe.value.length },
  { key: 'new', label: '新增任務' }
])

const shopSections = computed(() => [
  { key: 'browse', label: '可兌換', count: visibleShopItems.value.length },
  { key: 'orders', label: '兌換單', count: incomingRedemptions.value.length + outgoingRedemptions.value.length },
  { key: 'mine', label: '我的項目', count: myShopItems.value.length },
  { key: 'wish', label: '許願池' },
  { key: 'new', label: '新增項目' }
])

const ledgerSections = [
  { key: 'overview', label: '餘額總覽' },
  { key: 'history', label: '明細' }
]

type NotificationGroup = {
  key: 'partner' | 'self'
  title: string
  description: string
  items: Array<{
    key: NotificationPreferenceKey
    label: string
    description: string
  }>
}

const notificationGroups: NotificationGroup[] = [
  {
    key: 'partner',
    title: '對方做的行為',
    description: '來自對方的任務、商城與兌換動態。',
    items: [
      { key: 'partnerTaskAssigned', label: '對方新增任務給我', description: '對方交辦新任務，或更新已交辦給你的任務。' },
      { key: 'partnerTaskProgress', label: '對方處理我交辦的任務', description: '對方接取或送出你建立的任務。' },
      { key: 'partnerTaskReviewed', label: '對方審核我的任務', description: '對方通過或退回你送出的任務。' },
      { key: 'partnerShopUpdated', label: '對方新增商城/願望', description: '對方新增可兌換項目或許願池內容。' },
      { key: 'partnerRedemption', label: '對方兌換或更新兌換單', description: '對方兌換你的項目，或更新與你相關的兌換單。' }
    ]
  },
  {
    key: 'self',
    title: '我做的行為',
    description: '自己操作後也可以保留一份系統提醒。',
    items: [
      { key: 'selfTaskCreated', label: '我新增任務', description: '你建立新的任務給對方或自己。' },
      { key: 'selfTaskProgress', label: '我接取或完成任務', description: '你接取、送出或完成對方交辦的任務。' },
      { key: 'selfTaskReviewed', label: '我審核對方任務', description: '你通過或退回對方送出的任務。' },
      { key: 'selfShopUpdated', label: '我新增商城/願望', description: '你新增商城項目或許願池內容。' },
      { key: 'selfRedemption', label: '我兌換或更新兌換單', description: '你兌換對方項目，或更新與自己操作相關的兌換單。' }
    ]
  }
]

const notificationActorTabs = [
  { key: 'partner' as const, label: '對方的行為' },
  { key: 'self' as const, label: '我的行為' }
]

const settingsSections = computed(() => [
  { key: 'account', label: '帳號' },
  { key: 'profile', label: '頭像與暱稱' },
  { key: 'pairing', label: '綁定資訊' },
  { key: 'tags', label: '標籤管理' },
  { key: 'notifications', label: '通知' },
  { key: 'appearance', label: '外觀' },
  { key: 'space', label: '空間狀態' }
])

const navigation = [
  { key: 'home', label: '首頁', icon: Home },
  { key: 'tasks', label: '任務', icon: LibraryBig },
  { key: 'shop', label: '商城', icon: Gift },
  { key: 'ledger', label: '金庫', icon: ScrollText },
  { key: 'settings', label: '設定', icon: Settings2 }
] as const

const switchMainView = (view: ViewKey) => {
  if (view === 'shop') {
    handleHiddenTap()
  } else {
    // 點擊其他視圖時重置計數，確保是連續點擊商城
    hiddenTapCount.value = 0
  }
  activeView.value = view
}

const switchTaskView = (subView: TaskSubView) => {
  activeView.value = 'tasks'
  taskSubView.value = subView
}

const switchShopView = (subView: ShopSubView) => {
  activeView.value = 'shop'
  shopSubView.value = subView
}

const resetShopNewForm = () => {
  editingShopItemId.value = null
  currentWishId.value = null
  shopForm.title = ''
  shopForm.description = ''
  shopForm.price = 120
  shopForm.isProduct = false
  shopForm.realPrice = 0
  shopForm.category = '日常'
  shopForm.isHidden = false
  shopForm.rawFile = null
  shopForm.imageUrl = ''
  shopImagePreview.value = null
  if (shopImageInput.value) shopImageInput.value.value = ''
}

watch(shopSubView, (v) => {
  shopSelectedCategory.value = '全部'
  if (v !== 'new') return
  if (skipShopNewTabReset) return
  resetShopNewForm()
})

const appShellClasses = computed(() => [
  state.appearance.density === 'compact' ? 'density-compact' : 'density-airy',
  state.appearance.motion === 'still' ? 'motion-still' : 'motion-soft',
  state.appearance.glass === 'muted' ? 'glass-muted' : 'glass-luminous'
])

const notificationPermission = ref<NotificationPermissionState>(getNotificationPermissionState())
const isStandaloneApp = ref(false)
const isAppleMobile = ref(false)

const syncNotificationEnvironment = () => {
  notificationPermission.value = getNotificationPermissionState()
  isStandaloneApp.value = isStandalonePwa()
  isAppleMobile.value = isAppleMobilePlatform()
}

const cleanupLocalStorageGifts = () => {
  try {
    const keysToRemove: string[] = []
    const activeKeys = activeGifts.map((g) => g.storageKey)
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && key.startsWith('gift_claimed_')) {
        const match = key.match(/^gift_claimed_(.+)_(\d{4})$/)
        if (match) {
          const storageKey = match[1]
          const year = parseInt(match[2], 10)
          
          // If the gift is no longer configured in gifts.ts, remove it
          if (!activeKeys.includes(storageKey)) {
            keysToRemove.push(key)
            continue
          }
          
          // If the gift is configured but the target date is in the past, clean it up
          const gift = activeGifts.find((g) => g.storageKey === storageKey)
          if (gift) {
            const today = new Date()
            const currentYear = today.getFullYear()
            let giftDate: Date
            if (gift.targetDate.includes('-') && gift.targetDate.split('-').length === 3) {
              giftDate = new Date(gift.targetDate)
            } else {
              giftDate = new Date(`${currentYear}-${gift.targetDate}`)
            }
            giftDate.setHours(23, 59, 59, 999)
            if (today.getTime() > giftDate.getTime() && year <= currentYear) {
              keysToRemove.push(key)
            }
          }
        }
      }
    }
    keysToRemove.forEach((k) => localStorage.removeItem(k))
  } catch (e) {
    console.error('Failed to cleanup gift localStorage keys:', e)
  }
}

watch(
  () => [isAuthenticated.value, authLoading.value, state.isInitializing, state.ledger] as const,
  () => {
    refreshGiftQueue()
  },
  { immediate: true }
)

onMounted(() => {
  syncNotificationEnvironment()
  cleanupLocalStorageGifts()
  refreshGiftQueue()
  document.addEventListener('visibilitychange', syncNotificationEnvironment)
  
  // Initialize push notifications
  initializePushNotifications()
  
  // Register background sync for notifications (if supported)
  if ('serviceWorker' in navigator && 'sync' in window.ServiceWorkerRegistration.prototype) {
    navigator.serviceWorker.ready.then((registration) => {
      return (registration as any).sync.register('zc-background-sync')
    }).catch((error) => {
      console.log('Background sync registration failed:', error)
    })
    
    // Also try to register periodic sync for missed notifications
    if ('periodicSync' in window.ServiceWorkerRegistration.prototype) {
      navigator.serviceWorker.ready.then((registration) => {
        return (registration as any).periodicSync.register('zc-periodic-sync', {
          minInterval: 24 * 60 * 60 * 1000 // Once per day
        })
      }).catch((error) => {
        // Periodic sync requires user permission and may not be available
        // This is not critical for app functionality, so we just log it
        if (error.name === 'NotAllowedError') {
          console.log('Periodic sync permission denied - this is normal in development')
        } else {
          console.log('Periodic sync registration failed:', error)
        }
      })
    }
  }
  
  // Check for missed notifications on app load
  checkMissedNotifications()
})

const checkMissedNotifications = async () => {
  try {
    if (!notificationsActive.value) return
    
    // This would typically fetch from your backend API
    // For now, we'll just ensure the notification system is properly initialized
    const storedSnapshot = loadNotificationSnapshot()
    if (storedSnapshot) {
      notificationSnapshot = storedSnapshot
    }
  } catch (error) {
    console.log('Failed to check missed notifications:', error)
  }
}

const notificationPermissionLabel = computed(() => {
  if (!isNotificationSupported()) return '此瀏覽器尚未支援'
  if (notificationPermission.value === 'granted') return '已允許'
  if (notificationPermission.value === 'denied') return '已拒絕'
  return '尚未開啟'
})

const notificationPlatformHint = computed(() => {
  if (!isNotificationSupported()) return '這台裝置目前無法使用 PWA 系統通知。'
  if (notificationPermission.value === 'denied') return '請到瀏覽器或系統設定重新允許 ZC 的通知權限。'
  if (isAppleMobile.value && !isStandaloneApp.value) return 'iPhone/iPad 請先把 ZC 加入主畫面，從主畫面開啟後再允許通知。'
  if (notificationPermission.value === 'granted') return '系統已允許 ZC 顯示橫幅、通知中心與鎖定畫面提醒；實際呈現依裝置設定。'
  return 'Android 與桌面可直接授權；iOS 需要從已加入主畫面的 PWA 開啟。'
})

const notificationsActive = computed(() => state.notifications.enabled && notificationPermission.value === 'granted')

const notificationMasterButtonLabel = computed(() => {
  if (state.notifications.enabled) return '關閉通知'
  if (notificationPermission.value === 'denied') return '重新檢查權限'
  return '開啟通知'
})

const notificationStatusClass = computed(() => {
  if (notificationsActive.value) return 'border-sage/20 bg-sage/10 text-sage'
  if (notificationPermission.value === 'denied' || notificationPermission.value === 'unsupported') return 'border-red-200/70 bg-red-50 text-red-500'
  return 'border-gold/20 bg-gold/10 text-gold'
})

type NotificationTaskSnapshot = Pick<Task, 'id' | 'title' | 'description' | 'dueAt' | 'status' | 'creatorId' | 'assigneeId' | 'updatedAt'>
type NotificationShopItemSnapshot = Pick<ShopItem, 'id' | 'title' | 'category' | 'creatorId' | 'isHidden' | 'createdAt'>
type NotificationRedemptionSnapshot = Pick<Redemption, 'id' | 'shopItemId' | 'creatorId' | 'redeemerId' | 'status' | 'updatedAt'>
type NotificationSnapshot = {
  tasks: Map<string, NotificationTaskSnapshot>
  shopItems: Map<string, NotificationShopItemSnapshot>
  redemptions: Map<string, NotificationRedemptionSnapshot>
}
type NotificationEvent = {
  body: string
  key: NotificationPreferenceKey
  tag: string
  url?: string
}

let notificationSnapshot: NotificationSnapshot | null = null

// Persistent notification tracking to prevent duplicates across app sessions
const NOTIFICATION_STORAGE_KEY = 'zc-notification-snapshot'

const saveNotificationSnapshot = (snapshot: NotificationSnapshot) => {
  try {
    const data = {
      tasks: Array.from(snapshot.tasks.entries()),
      shopItems: Array.from(snapshot.shopItems.entries()),
      redemptions: Array.from(snapshot.redemptions.entries()),
      timestamp: Date.now()
    }
    localStorage.setItem(NOTIFICATION_STORAGE_KEY, JSON.stringify(data))
  } catch (error) {
    console.log('Failed to save notification snapshot:', error)
  }
}

const loadNotificationSnapshot = (): NotificationSnapshot | null => {
  try {
    const stored = localStorage.getItem(NOTIFICATION_STORAGE_KEY)
    if (!stored) return null
    
    const data = JSON.parse(stored)
    // Only restore if less than 7 days old to prevent stale data
    if (Date.now() - data.timestamp > 7 * 24 * 60 * 60 * 1000) {
      localStorage.removeItem(NOTIFICATION_STORAGE_KEY)
      return null
    }
    
    return {
      tasks: new Map(data.tasks),
      shopItems: new Map(data.shopItems),
      redemptions: new Map(data.redemptions)
    }
  } catch (error) {
    console.log('Failed to load notification snapshot:', error)
    localStorage.removeItem(NOTIFICATION_STORAGE_KEY)
    return null
  }
}

const createNotificationSnapshot = (): NotificationSnapshot => ({
  tasks: new Map(
    state.tasks.map((task) => [
      task.id,
      {
        id: task.id,
        title: task.title,
        description: task.description,
        dueAt: task.dueAt,
        status: task.status,
        creatorId: task.creatorId,
        assigneeId: task.assigneeId,
        updatedAt: task.updatedAt
      }
    ])
  ),
  shopItems: new Map(
    state.shopItems.map((item) => [
      item.id,
      {
        id: item.id,
        title: item.title,
        category: item.category,
        creatorId: item.creatorId,
        isHidden: item.isHidden,
        createdAt: item.createdAt
      }
    ])
  ),
  redemptions: new Map(
    state.redemptions.map((entry) => [
      entry.id,
      {
        id: entry.id,
        shopItemId: entry.shopItemId,
        creatorId: entry.creatorId,
        redeemerId: entry.redeemerId,
        status: entry.status,
        updatedAt: entry.updatedAt
      }
    ])
  )
})

const notificationEvent = (key: NotificationPreferenceKey, body: string, tag: string): NotificationEvent => ({
  key,
  body,
  tag,
  url: '/'
})

const buildTaskStatusNotification = (task: NotificationTaskSnapshot): NotificationEvent | null => {
  const partnerName = profileMap.value.partner.name || '對方'

  if (task.creatorId === 'self' && task.assigneeId === 'partner') {
    if (task.status === 'accepted') {
      return notificationEvent('partnerTaskProgress', `${partnerName} 接取了你交辦的「${task.title}」。`, `zc-task-${task.id}-${task.status}`)
    }
    if (task.status === 'submitted') {
      return notificationEvent('partnerTaskProgress', `${partnerName} 完成了你交辦的「${task.title}」。`, `zc-task-${task.id}-${task.status}`)
    }
    if (task.status === 'approved') {
      return notificationEvent('selfTaskReviewed', `你通過了「${task.title}」。`, `zc-task-${task.id}-${task.status}`)
    }
    if (task.status === 'rejected') {
      return notificationEvent('selfTaskReviewed', `你退回了「${task.title}」。`, `zc-task-${task.id}-${task.status}`)
    }
  }

  if (task.creatorId === 'partner' && task.assigneeId === 'self') {
    if (task.status === 'accepted') {
      return notificationEvent('selfTaskProgress', `你接取了「${task.title}」。`, `zc-task-${task.id}-${task.status}`)
    }
    if (task.status === 'submitted') {
      return notificationEvent('selfTaskProgress', `你送出了「${task.title}」。`, `zc-task-${task.id}-${task.status}`)
    }
    if (task.status === 'approved') {
      return notificationEvent('partnerTaskReviewed', `${partnerName} 通過了你的「${task.title}」。`, `zc-task-${task.id}-${task.status}`)
    }
    if (task.status === 'rejected') {
      return notificationEvent('partnerTaskReviewed', `${partnerName} 退回了你的「${task.title}」。`, `zc-task-${task.id}-${task.status}`)
    }
  }

  return null
}

const buildNotificationEvents = (previous: NotificationSnapshot, current: NotificationSnapshot) => {
  const events: NotificationEvent[] = []
  const partnerName = profileMap.value.partner.name || '對方'

  current.tasks.forEach((task, taskId) => {
    const previousTask = previous.tasks.get(taskId)

    if (!previousTask) {
      if (task.creatorId === 'partner' && task.assigneeId === 'self') {
        events.push(notificationEvent('partnerTaskAssigned', `${partnerName} 新增任務「${task.title}」給你。`, `zc-task-${task.id}-new`))
      } else if (task.creatorId === 'self') {
        events.push(notificationEvent('selfTaskCreated', `你新增了任務「${task.title}」。`, `zc-task-${task.id}-new`))
      }
      return
    }

    if (task.status !== previousTask.status) {
      const statusEvent = buildTaskStatusNotification(task)
      if (statusEvent) events.push(statusEvent)
      return
    }

    const partnerUpdatedMyTask =
      task.creatorId === 'partner' &&
      task.assigneeId === 'self' &&
      task.updatedAt !== previousTask.updatedAt &&
      (task.title !== previousTask.title || task.description !== previousTask.description || task.dueAt !== previousTask.dueAt)

    if (partnerUpdatedMyTask) {
      events.push(notificationEvent('partnerTaskAssigned', `${partnerName} 更新了任務「${task.title}」。`, `zc-task-${task.id}-updated`))
    }
  })

  current.shopItems.forEach((item, itemId) => {
    if (previous.shopItems.has(itemId)) return
    if (item.isHidden && item.creatorId === 'partner') return

    const itemType = item.category === '許願池' ? '願望' : '項目'
    if (item.creatorId === 'partner') {
      events.push(notificationEvent('partnerShopUpdated', `${partnerName} 新增了${itemType}「${item.title}」。`, `zc-shop-${item.id}-new`))
    } else {
      events.push(notificationEvent('selfShopUpdated', `你新增了${itemType}「${item.title}」。`, `zc-shop-${item.id}-new`))
    }
  })

  current.redemptions.forEach((redemption, redemptionId) => {
    const previousRedemption = previous.redemptions.get(redemptionId)
    const item = current.shopItems.get(redemption.shopItemId)
    if (item?.isHidden) return

    const itemTitle = item?.title || '兌換項目'
    if (!previousRedemption) {
      if (redemption.redeemerId === 'partner') {
        events.push(notificationEvent('partnerRedemption', `${partnerName} 兌換了「${itemTitle}」。`, `zc-redemption-${redemption.id}-new`))
      } else {
        events.push(notificationEvent('selfRedemption', `你兌換了「${itemTitle}」。`, `zc-redemption-${redemption.id}-new`))
      }
      return
    }

    if (redemption.status === previousRedemption.status) return

    const actorIsPartner = redemption.status === 'cancelled' ? redemption.redeemerId === 'partner' : redemption.creatorId === 'partner'
    const subject = actorIsPartner ? partnerName : '你'
    const action =
      redemption.status === 'in_progress'
        ? '開始處理了'
        : redemption.status === 'fulfilled'
          ? '完成了'
          : redemption.status === 'cancelled'
            ? '取消了'
            : '更新了'

    events.push(
      notificationEvent(
        actorIsPartner ? 'partnerRedemption' : 'selfRedemption',
        `${subject}${action}「${itemTitle}」的兌換單。`,
        `zc-redemption-${redemption.id}-${redemption.status}`
      )
    )
  })

  return events
}

const dispatchNotificationEvents = async (events: NotificationEvent[]) => {
  if (!notificationsActive.value) return

  const enabledEvents = events.filter((event) => state.notifications.events[event.key])
  for (const event of enabledEvents.slice(0, 4)) {
    await sendPushNotification({
      body: event.body,
      tag: event.tag,
      url: event.url
    })
    // Also show local notification for immediate feedback
    await showZcNotification({
      body: event.body,
      tag: event.tag,
      url: event.url
    })
  }

  if (enabledEvents.length > 4) {
    await sendPushNotification({
      body: `還有 ${enabledEvents.length - 4} 則新的 ZC 動態。`,
      tag: 'zc-notification-summary',
      url: '/'
    })
    await showZcNotification({
      body: `還有 ${enabledEvents.length - 4} 則新的 ZC 動態。`,
      tag: 'zc-notification-summary',
      url: '/'
    })
  }
}

watch(
  () => [state.isInitializing, state.tasks, state.shopItems, state.redemptions] as const,
  () => {
    if (state.isInitializing) return

    const nextSnapshot = createNotificationSnapshot()
    if (!notificationSnapshot) {
      // Try to load from persistent storage first
      const storedSnapshot = loadNotificationSnapshot()
      if (storedSnapshot) {
        notificationSnapshot = storedSnapshot
      } else {
        notificationSnapshot = nextSnapshot
      }
      return
    }

    const events = buildNotificationEvents(notificationSnapshot, nextSnapshot)
    notificationSnapshot = nextSnapshot
    saveNotificationSnapshot(nextSnapshot)
    if (events.length) void dispatchNotificationEvents(events)
  },
  { deep: true, flush: 'post' }
)

const isAnyModalOpen = computed(() => 
  confirmModal.show || 
  noticeModal.show || 
  !!selectedImageUrl.value || 
  !!selectedRedemptionId.value ||
  !!scannerRedemptionId.value
)

const navContainerRef = ref<HTMLElement | null>(null)
const activeIndex = computed(() => navigation.findIndex(item => item.key === activeView.value))
const dragX = ref(0)
const dragVelocity = ref(0)
const isDragging = ref(false)
let startX = 0
let lastX = 0
let lastTime = 0

const handleNavStart = (e: MouseEvent | TouchEvent) => {
  isDragging.value = true
  const currentX = 'touches' in e ? e.touches[0].clientX : (e as MouseEvent).clientX
  startX = currentX
  lastX = currentX
  lastTime = Date.now()
  
  window.addEventListener('mousemove', handleNavMove)
  window.addEventListener('mouseup', handleNavEnd)
  window.addEventListener('touchmove', handleNavMove, { passive: false })
  window.addEventListener('touchend', handleNavEnd)
}

const handleNavMove = (e: MouseEvent | TouchEvent) => {
  if (!isDragging.value) return
  const currentX = 'touches' in e ? e.touches[0].clientX : (e as MouseEvent).clientX
  const currentTime = Date.now()
  
  // 計算速度用於形變
  const dt = currentTime - lastTime
  if (dt > 0) {
    const v = (currentX - lastX) / dt
    // 平滑處理速度
    dragVelocity.value = dragVelocity.value * 0.7 + v * 0.3
  }
  
  dragX.value = currentX - startX
  lastX = currentX
  lastTime = currentTime
  
  if ('touches' in e) e.preventDefault()
}

const handleNavEnd = () => {
  if (!isDragging.value) return
  isDragging.value = false
  dragVelocity.value = 0
  
  if (navContainerRef.value) {
    const rect = navContainerRef.value.getBoundingClientRect()
    const padding = window.innerWidth < 640 ? 16 : 24
    const tabWidth = (rect.width - padding) / navigation.length
    const movement = dragX.value / tabWidth
    const newIndex = Math.round(activeIndex.value + movement)
    const clampedIndex = Math.max(0, Math.min(navigation.length - 1, newIndex))
    switchMainView(navigation[clampedIndex].key)
  }
  
  dragX.value = 0
  window.removeEventListener('mousemove', handleNavMove)
  window.removeEventListener('mouseup', handleNavEnd)
  window.removeEventListener('touchmove', handleNavMove)
  window.removeEventListener('touchend', handleNavEnd)
}

const indicatorStyle = computed(() => {
  const padding = window.innerWidth < 640 ? 8 : 12
  const containerWidth = navContainerRef.value ? navContainerRef.value.getBoundingClientRect().width : 0
  const tabWidth = containerWidth > 0 ? (containerWidth - padding * 2) / navigation.length : 0
  
  const rawX = activeIndex.value * tabWidth + dragX.value
  const maxLimit = (navigation.length - 1) * tabWidth
  
  let displayX = rawX
  
  // 阻力系統：超出邊界時位移呈指數型縮減
  if (displayX < 0) {
    displayX = -Math.pow(Math.abs(displayX), 0.75) * 2
  } else if (displayX > maxLimit) {
    displayX = maxLimit + Math.pow(displayX - maxLimit, 0.75) * 2
  }
  
  let stretch = 0
  
  if (isDragging.value) {
    const nearestCenter = Math.round(rawX / tabWidth) * tabWidth
    const dist = rawX - nearestCenter
    const pull = Math.sin((dist / tabWidth) * Math.PI) * (tabWidth * 0.1)
    displayX = displayX - pull
    
    // 根據速度計算形變（拉長感）
    stretch = Math.min(Math.abs(dragVelocity.value) * 12, tabWidth * 0.4)
  }
  
  return {
    width: `${tabWidth + stretch}px`,
    transform: `translateX(${displayX - (dragVelocity.value > 0 ? 0 : stretch)}px) skewX(${dragVelocity.value * 2}deg)`,
    transition: isDragging.value ? 'none' : 'transform 0.6s cubic-bezier(0.34, 1.56, 0.64, 1), width 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)'
  }
})

const getIconStyle = (index: number) => {
  const padding = window.innerWidth < 640 ? 8 : 12
  const tabWidth = navContainerRef.value 
    ? (navContainerRef.value.getBoundingClientRect().width - padding * 2) / navigation.length 
    : 0
  
  const indicatorX = activeIndex.value * tabWidth + dragX.value
  const iconX = index * tabWidth
  const dist = Math.abs(indicatorX - iconX)
  
  // 根據指示器的距離計算縮放比例
  const maxScale = 1.25
  const range = tabWidth * 0.8
  const scale = dist < range ? 1 + (maxScale - 1) * (1 - dist / range) : 1
  
  return {
    transform: `scale(${scale})`,
    opacity: dist < range ? 1 : 0.45
  }
}

// --- 商城分類導覽列交互邏輯 (進階物理系統) ---
const shopCatContainerRef = ref<HTMLElement | null>(null)
const shopCatContentRef = ref<HTMLElement | null>(null)
const shopCatDragX = ref(0)

const notifyNavContainerRef = ref<HTMLElement | null>(null)
const notifyActiveIndex = computed(() => notificationActorTabs.findIndex(item => item.key === notificationTab.value))
const notifyDragX = ref(0)
const notifyDragVelocity = ref(0)
const isDraggingNotify = ref(false)
let notifyStartX = 0
let notifyLastX = 0
let notifyLastTime = 0

const handleNotifyNavStart = (e: MouseEvent | TouchEvent) => {
  isDraggingNotify.value = true
  const currentX = 'touches' in e ? e.touches[0].clientX : (e as MouseEvent).clientX
  notifyStartX = currentX
  notifyLastX = currentX
  notifyLastTime = Date.now()
  
  window.addEventListener('mousemove', handleNotifyNavMove)
  window.addEventListener('mouseup', handleNotifyNavEnd)
  window.addEventListener('touchmove', handleNotifyNavMove, { passive: false })
  window.addEventListener('touchend', handleNotifyNavEnd)
}

const handleNotifyNavMove = (e: MouseEvent | TouchEvent) => {
  if (!isDraggingNotify.value) return
  const currentX = 'touches' in e ? e.touches[0].clientX : (e as MouseEvent).clientX
  const currentTime = Date.now()
  
  const dt = currentTime - notifyLastTime
  if (dt > 0) {
    const v = (currentX - notifyLastX) / dt
    notifyDragVelocity.value = notifyDragVelocity.value * 0.7 + v * 0.3
  }
  
  notifyDragX.value = currentX - notifyStartX
  notifyLastX = currentX
  notifyLastTime = currentTime
  
  if ('touches' in e) e.preventDefault()
}

const handleNotifyNavEnd = () => {
  if (!isDraggingNotify.value) return
  isDraggingNotify.value = false
  notifyDragVelocity.value = 0
  
  if (notifyNavContainerRef.value) {
    const rect = notifyNavContainerRef.value.getBoundingClientRect()
    const padding = 12 // p-1.5 is 6px * 2 for both sides
    const tabWidth = (rect.width - padding) / 2
    const movement = notifyDragX.value / tabWidth
    const newIndex = Math.round(notifyActiveIndex.value + movement)
    const clampedIndex = Math.max(0, Math.min(1, newIndex))
    notificationTab.value = notificationActorTabs[clampedIndex].key
  }
  
  notifyDragX.value = 0
  window.removeEventListener('mousemove', handleNotifyNavMove)
  window.removeEventListener('mouseup', handleNotifyNavEnd)
  window.removeEventListener('touchmove', handleNotifyNavMove)
  window.removeEventListener('touchend', handleNotifyNavEnd)
}

const notifyIndicatorStyle = computed(() => {
  const padding = 6 // p-1.5
  const containerWidth = notifyNavContainerRef.value ? notifyNavContainerRef.value.getBoundingClientRect().width : 0
  const tabWidth = containerWidth > 0 ? (containerWidth - padding * 2) / 2 : 0
  
  const rawX = notifyActiveIndex.value * tabWidth + notifyDragX.value
  const maxLimit = tabWidth
  
  let displayX = rawX
  if (displayX < 0) {
    displayX = -Math.pow(Math.abs(displayX), 0.75) * 2
  } else if (displayX > maxLimit) {
    displayX = maxLimit + Math.pow(displayX - maxLimit, 0.75) * 2
  }
  
  let stretch = 0
  if (isDraggingNotify.value) {
    const nearestCenter = Math.round(rawX / tabWidth) * tabWidth
    const dist = rawX - nearestCenter
    const pull = Math.sin((dist / tabWidth) * Math.PI) * (tabWidth * 0.1)
    displayX = displayX - pull
    stretch = Math.min(Math.abs(notifyDragVelocity.value) * 12, tabWidth * 0.4)
  }
  
  return {
    width: `${tabWidth + stretch}px`,
    transform: `translateX(${displayX - (notifyDragVelocity.value > 0 ? 0 : stretch)}px) skewX(${notifyDragVelocity.value * 2}deg)`,
    transition: isDraggingNotify.value ? 'none' : 'transform 0.6s cubic-bezier(0.34, 1.56, 0.64, 1), width 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)'
  }
})

const getNotifyIconStyle = (index: number) => {
  const padding = 6
  const containerWidth = notifyNavContainerRef.value ? notifyNavContainerRef.value.getBoundingClientRect().width : 0
  const tabWidth = containerWidth > 0 ? (containerWidth - padding * 2) / 2 : 0
  
  const indicatorX = notifyActiveIndex.value * tabWidth + notifyDragX.value
  const iconX = index * tabWidth
  const dist = Math.abs(indicatorX - iconX)
  
  const maxScale = 1.15
  const range = tabWidth * 0.8
  const scale = dist < range ? 1 + (maxScale - 1) * (1 - dist / range) : 1
  
  return {
    transform: `scale(${scale})`,
    opacity: dist < range ? 1 : 0.6
  }
}
const shopCatVelocity = ref(0)
const isDraggingCatBar = ref(false)
const isPhysicsRunning = ref(false)
const reorderingCat = ref<string | null>(null)
const draggedCatX = ref(0)
const draggedCatIndex = ref<number | null>(null)

let catStartX = 0
let catLastX = 0
let catLastTime = 0
let catLongPressTimer: any = null
let catInertiaFrame: number | null = null
// 快取尺寸，避免在每幀讀取 DOM 導致 layout thrashing
let cachedContainerW = 0
let cachedContentW = 0
let cachedMinX = 0

const CAT_FRICTION = 0.94
const CAT_SPRING = 0.38

const measureCatBar = () => {
  cachedContainerW = shopCatContainerRef.value?.clientWidth || 0
  cachedContentW = shopCatContentRef.value?.scrollWidth || 0
  cachedMinX = Math.min(0, cachedContainerW - cachedContentW - 10)
}

const handleCatBarPointerDown = (e: PointerEvent) => {
  if (reorderingCat.value) return
  if (catInertiaFrame) { cancelAnimationFrame(catInertiaFrame); catInertiaFrame = null }

  measureCatBar()
  isDraggingCatBar.value = true
  catStartX = e.clientX
  catLastX = e.clientX
  catLastTime = performance.now()
  shopCatVelocity.value = 0

  catLongPressTimer = setTimeout(() => {
    const btn = (e.target as HTMLElement).closest('button')
    if (btn?.id.startsWith('cat-item-')) {
      const catName = btn.id.replace('cat-item-', '')
      const idx = shopCategories.value.indexOf(catName)
      if (idx !== -1 && catName !== '全部' && catName !== '隱藏項目') {
        reorderingCat.value = catName
        draggedCatIndex.value = idx
        draggedCatX.value = 0
        isDraggingCatBar.value = false
        isTagLocked.value = true // 進入排序模式時鎖定同步
      }
    }
  }, 350)

  window.addEventListener('pointermove', handleCatBarPointerMove)
  window.addEventListener('pointerup', handleCatBarPointerUp)
}

const handleCatBarPointerMove = (e: PointerEvent) => {
  const cx = e.clientX
  const dx = cx - catLastX
  const now = performance.now()
  const dt = now - catLastTime

  if (Math.abs(cx - catStartX) > 10) clearTimeout(catLongPressTimer)

  if (reorderingCat.value) {
    draggedCatX.value += dx
    const threshold = 60
    const idx = draggedCatIndex.value!
    if (draggedCatX.value > threshold && idx < shopCategories.value.length - 1) {
      const next = shopCategories.value[idx + 1]
      if (next !== '隱藏項目') { swapTags(idx, idx + 1); draggedCatIndex.value = idx + 1; draggedCatX.value -= threshold * 1.5 }
    } else if (draggedCatX.value < -threshold && idx > 0) {
      const prev = shopCategories.value[idx - 1]
      if (prev !== '全部') { swapTags(idx, idx - 1); draggedCatIndex.value = idx - 1; draggedCatX.value += threshold * 1.5 }
    }
  } else if (isDraggingCatBar.value) {
    if (dt > 0) shopCatVelocity.value = shopCatVelocity.value * 0.4 + (dx / dt) * 0.6
    let nx = shopCatDragX.value + dx
    
    // 強力邊界阻力，限制最大拉扯距離
    const maxOverscroll = 25 
    if (nx > maxOverscroll) {
      nx = shopCatDragX.value + dx * 0.15 
    } else if (nx < cachedMinX - maxOverscroll) {
      nx = shopCatDragX.value + dx * 0.15
    } else if (nx > 0 || nx < cachedMinX) {
      nx = shopCatDragX.value + dx * 0.25 // 一般阻力
    }
    
    shopCatDragX.value = nx
  }

  catLastX = cx
  catLastTime = now
}

const handleCatBarPointerUp = () => {
  clearTimeout(catLongPressTimer)
  if (reorderingCat.value) updateTags(state.tags)
  isDraggingCatBar.value = false
  reorderingCat.value = null
  draggedCatIndex.value = null
  draggedCatX.value = 0
  window.removeEventListener('pointermove', handleCatBarPointerMove)
  window.removeEventListener('pointerup', handleCatBarPointerUp)
  startCatPhysics()
}

const startCatPhysics = () => {
  measureCatBar()
  isPhysicsRunning.value = true
  const step = () => {
    let running = false
    if (Math.abs(shopCatVelocity.value) > 0.05) {
      shopCatDragX.value += shopCatVelocity.value * 16
      shopCatVelocity.value *= CAT_FRICTION
      running = true
    } else {
      shopCatVelocity.value = 0
    }
    // 彈性回彈
    if (shopCatDragX.value > 0) {
      shopCatDragX.value += (0 - shopCatDragX.value) * CAT_SPRING
      if (Math.abs(shopCatDragX.value) < 0.5) shopCatDragX.value = 0
      else running = true
    } else if (shopCatDragX.value < cachedMinX) {
      shopCatDragX.value += (cachedMinX - shopCatDragX.value) * CAT_SPRING
      if (Math.abs(shopCatDragX.value - cachedMinX) < 0.5) shopCatDragX.value = cachedMinX
      else running = true
    }
    if (running) {
      catInertiaFrame = requestAnimationFrame(step)
    } else {
      catInertiaFrame = null
      isPhysicsRunning.value = false
    }
  }
  catInertiaFrame = requestAnimationFrame(step)
}

const swapTags = (idx1: number, idx2: number) => {
  const cat1 = shopCategories.value[idx1]
  const cat2 = shopCategories.value[idx2]
  const tags = [...state.tags]
  const t1 = tags.indexOf(cat1)
  const t2 = tags.indexOf(cat2)
  if (t1 !== -1 && t2 !== -1) {
    [tags[t1], tags[t2]] = [tags[t2], tags[t1]]
    state.tags = tags
  }
}

const handleCatClick = (cat: string) => {
  if (Math.abs(catLastX - catStartX) < 5) shopSelectedCategory.value = cat
}

const catBarInnerStyle = computed(() => ({
  transform: `translateX(${shopCatDragX.value}px)`,
  transition: (isDraggingCatBar.value || isPhysicsRunning.value) ? 'none' : 'transform 0.5s cubic-bezier(0.16, 1, 0.3, 1)',
}))

// 不再讀取 DOM 尺寸——完全使用已快取或 reactive 的值
const getCatItemStyle = (cat: string) => {
  const isReordering = !!reorderingCat.value
  const isDragging = reorderingCat.value === cat
  
  if (isDragging) {
    return {
      translate: `${draggedCatX.value}px 0`,
      scale: '1.15',
      rotate: '4deg',
      zIndex: 50,
      // 只對 scale 和 rotate 應用動畫，translate 保持即時
      transition: 'scale 0.3s cubic-bezier(0.2, 0.8, 0.2, 1.2), rotate 0.3s cubic-bezier(0.2, 0.8, 0.2, 1.2)'
    }
  }
  
  if (isReordering) {
    return {
      scale: '0.95',
      opacity: 0.8,
      transition: 'scale 0.4s ease, translate 0.4s cubic-bezier(0.2, 0.8, 0.2, 1), opacity 0.4s ease'
    }
  }

  // 滑動時的微小拉伸
  const v = Math.abs(shopCatVelocity.value)
  const stretch = 1 + Math.min(v * 0.015, 0.06)
  return {
    transform: stretch > 1.002 ? `scaleX(${stretch})` : '',
    transition: isDraggingCatBar.value ? 'none' : 'all 0.35s ease-out'
  }
}


const connectionLabel = computed(() => {
  if (!isSupabaseEnabled) {
    return 'Demo 模式'
  }

  if (authLoading.value) {
    return '連線中'
  }

  return isAuthenticated.value ? '已連接帳號' : '待登入'
})

const currency = (value: number) => `${value} 枚`

const isTaskOverdue = (dueAt: string | undefined | null) => {
  if (!dueAt) return false
  const due = new Date(dueAt)
  due.setHours(0, 0, 0, 0)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return due < today
}

const formatDate = (value: string) =>
  new Intl.DateTimeFormat('zh-TW', { month: 'short', day: 'numeric' }).format(new Date(value))

const formatDateTime = (value: string) =>
  new Intl.DateTimeFormat('zh-TW', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value))

const getTaskTone = (status: string) =>
  ({
    open: 'bg-white/60 text-ink/75',
    accepted: 'bg-sage/12 text-sage',
    submitted: 'bg-gold/15 text-gold',
    approved: 'bg-sage/20 text-sage',
    rejected: 'bg-ink/10 text-ink',
    cancelled: 'bg-ink/8 text-ink/60'
  })[status] ?? 'bg-white/60 text-ink/75'

const getTaskLabel = (status: string) =>
  ({
    open: '待接取',
    accepted: '進行中',
    submitted: '待審核',
    approved: '已通過',
    rejected: '已退回',
    cancelled: '已取消'
  })[status] ?? status

const getRedemptionLabel = (status: string) =>
  ({
    redeemed: '已兌換',
    in_progress: '待履行',
    fulfilled: '已完成',
    cancelled: '已取消'
  })[status] ?? status

// --- Tags ---
const newTagInput = ref('')

const handleAddTag = async () => {
  const tag = newTagInput.value.trim()
  if (!tag) return
  if (state.tags.includes(tag)) {
    pushNotify(`標籤「${tag}」已存在。`, 'info')
    return
  }
  isBusy.value = true
  const { error } = await updateTags([...state.tags, tag])
  isBusy.value = false
  if (error) {
    pushNotify(`新增標籤失敗：${error}`, 'error')
  } else {
    newTagInput.value = ''
    pushNotify(`已新增標籤「${tag}」`, 'success')
  }
}

const handleRenameTag = async (oldTag: string, newTag: string) => {
  if (oldTag === newTag) return
  isBusy.value = true
  const { error } = await renameTag(oldTag, newTag)
  isBusy.value = false
  if (error) {
    pushNotify(`標籤更名失敗：${error}`, 'error')
  } else {
    pushNotify(`已將標籤「${oldTag}」更名為「${newTag}」`, 'success')
  }
}

const handleDeleteTag = (tag: string) => {
  openConfirm({
    title: '刪除標籤',
    message: `確定要從歷史清單中刪除標籤「${tag}」嗎？這不會刪除已存在商店中的項目，但未來快速選取將不再出現。`,
    confirmText: '確定刪除',
    variant: 'danger',
    onConfirm: async () => {
      isBusy.value = true
      const { error } = await deleteTag(tag)
      isBusy.value = false
      if (error) {
        pushNotify(`刪除失敗：${error}`, 'error')
      } else {
        pushNotify(`已刪除標籤「${tag}」`, 'info')
      }
    }
  })
}

const handleCreateSpace = async () => {
  isBusy.value = true
  const result = await createSpace()
  isBusy.value = false
  if (result.error) {
    pushNotify(`建立失敗：${result.error}`, 'error')
    return
  }
  pushNotify(`雙人空間已經建立！你的邀請碼是 ${result.code}，請將它交給對方。`, 'success', 8000)
}

const handleJoinSpace = async () => {
  if (!setupForm.inviteCode.trim()) {
    pushNotify('請輸入對方的邀請碼。', 'info')
    return
  }
  isBusy.value = true
  const result = await joinSpace(setupForm.inviteCode)
  isBusy.value = false
  if (result.error) {
    pushNotify(`加入失敗：${result.error}`, 'error')
    return
  }
  pushNotify('已成功加入雙人空間！', 'success')
}

const handleDestroySpace = () => {
  openConfirm({
    title: '徹底刪除雙人空間',
    message: '警告：這將會永久刪除雲端與本機上所有相關資料，包含任務、商城、流水帳與綁定紀錄。此操作無法復原，對方也會失去所有資料。',
    confirmText: '徹底刪除',
    variant: 'danger',
    onConfirm: async () => {
      isBusy.value = true
      const result = await deleteSpace()
      isBusy.value = false
      if (result?.error) {
        pushNotify(`刪除失敗：${result.error}`, 'error')
      } else {
        pushNotify('雙人空間已徹底刪除。', 'info')
        activeView.value = 'home'
      }
    }
  })
}

const handleDeleteShopItem = (itemId: string, skipStorage = false) => {
  openConfirm({
    title: '刪除項目',
    message: '確定要刪除這個項目嗎？此操作無法復原。',
    confirmText: '確定刪除',
    variant: 'danger',
    onConfirm: async () => {
      isBusy.value = true
      const { error } = await deleteShopItem(itemId, skipStorage)
      isBusy.value = false
      if (error) {
        pushNotify(`刪除失敗：${error.message}`, 'error')
      } else {
        pushNotify('項目已刪除。', 'info')
      }
    }
  })
}

const handleGrantWish = (item: any) => {
  skipShopNewTabReset = true
  editingShopItemId.value = null
  shopForm.title = item.title
  shopForm.description = item.description
  shopForm.isProduct = false
  shopForm.realPrice = 0
  shopForm.category = '願望實現'
  shopForm.price = 120
  shopForm.rawFile = null
  shopForm.imageUrl = item.imageUrl || ''
  shopImagePreview.value = item.imageUrl || null
  if (shopImageInput.value) shopImageInput.value.value = ''
  currentWishId.value = item.id
  shopSubView.value = 'new'
  void nextTick(() => {
    skipShopNewTabReset = false
  })
  pushNotify('已將願望填入表單，請設定價格與分類後上架。', 'info')
}

const handleEditShopItem = (item: ShopItem) => {
  skipShopNewTabReset = true
  currentWishId.value = null
  editingShopItemId.value = item.id
  shopForm.title = item.title
  shopForm.description = item.description
  shopForm.price = item.price
  shopForm.isProduct = item.isProduct
  shopForm.realPrice =
    item.realPrice !== undefined && item.realPrice !== null
      ? Number(item.realPrice)
      : item.isProduct
        ? Math.max(0, Math.round((item.price / 15) * 100) / 100)
        : 0
  shopForm.category = item.category || '日常'
  shopForm.isHidden = item.isHidden
  shopForm.rawFile = null
  shopForm.imageUrl = item.imageUrl || ''
  shopImagePreview.value = item.imageUrl || null
  if (shopImageInput.value) shopImageInput.value.value = ''
  shopSubView.value = 'new'
  void nextTick(() => {
    skipShopNewTabReset = false
  })
  pushNotify('已載入項目，修改後按儲存即可更新。', 'info')
}

const cancelShopDraft = () => {
  resetShopNewForm()
  shopSubView.value = 'mine'
}

const handleGenerateInvite = async () => {
  isBusy.value = true
  const code = await generateInviteCode()
  isBusy.value = false
  if (code) {
    pushNotify('邀請碼已產生！', 'success')
  } else {
    pushNotify('邀請碼產生失敗，請確認已登入且有連網。', 'error')
  }
}

const resetTaskForm = () => {
  taskForm.title = ''
  taskForm.description = ''
  taskForm.dueAt = new Date(Date.now() + 86400000).toISOString().slice(0, 10)
  taskForm.isRecurring = false
}

const createTaskNow = async () => {
  isBusy.value = true
  const result = await createTask({ ...taskForm, assigneeId: 'partner' })
  isBusy.value = false

  if (result.error) {
    pushNotify(`任務建立失敗：${result.error}`, 'error')
    return
  }

  resetTaskForm()
  taskSubView.value = 'created'
  pushNotify('任務已送進清單，等對方接取後就能開始。', 'success')
}

const handleCreateTask = () => {
  if (!taskForm.title.trim()) {
    pushNotify('任務至少要有標題。', 'info')
    return
  }

  openConfirm({
    title: '送出任務',
    message: `確定要把「${taskForm.title.trim()}」發給 ${profileMap.value.partner.name} 嗎？對方接取後才能送出批准。`,
    confirmText: '送出任務',
    onConfirm: createTaskNow
  })
}

const taskSubmitRatings = reactive({
  time: 0,
  difficulty: 0,
  avoidance: 0
})

const isSubmitRatingsComplete = computed(
  () => taskSubmitRatings.time > 0 && taskSubmitRatings.difficulty > 0 && taskSubmitRatings.avoidance > 0
)

const isSubmitConfirmWithRatings = ref(false)
const setStarRating = (key: 'time' | 'difficulty' | 'avoidance', value: number) => {
  taskSubmitRatings[key] = Math.min(5, Math.max(1, Math.round(value)))
}

const handleShopImageChange = async (event: Event) => {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  shopForm.rawFile = file
  const url = await readFileAsDataUrl(file)
  shopImagePreview.value = url
}

const handleAcceptTask = (task: Task) => {
  openConfirm({
    title: '接取任務',
    message: `確定要接下「${task.title}」嗎？接取後就會出現送出批准的按鈕。`,
    confirmText: '接取',
    onConfirm: async () => {
      isBusy.value = true
      const result = await acceptTask(task.id)
      isBusy.value = false
      if (result.error) {
        const needsMigration = result.error.includes('tasks_status_check')
        pushNotify(
          needsMigration
            ? '接取失敗：雲端資料庫還沒更新任務狀態規則，請先執行 supabase/migrations/202605010020_task_acceptance_and_settings.sql。'
            : `接取失敗：${result.error}`,
          'error',
          needsMigration ? 9000 : 4000
        )
        return
      }
      pushNotify('任務已接取，可以完成後送出批准。', 'success')
    }
  })
}

const handleAbandonTask = (task: Task) => {
  openConfirm({
    title: '放棄接取',
    message: `確定要放棄任務「${task.title}」嗎？這會讓任務回到未接取狀態。`,
    confirmText: '放棄',
    variant: 'danger',
    onConfirm: async () => {
      isBusy.value = true
      const result = await abandonTask(task.id)
      isBusy.value = false
      if (result.error) {
        pushNotify(`操作失敗：${result.error}`, 'error')
        return
      }
      pushNotify('已放棄接取。', 'info')
    }
  })
}

const handlePunishOverdue = (task: Task) => {
  openConfirm({
    title: '任務過期扣你二十塊 ٩(๑`^´๑)۶',
    message: `確認要宣告失敗並扣除二十金幣嗎？該任務將被移除。`,
    confirmText: '確認',
    variant: 'danger',
    onConfirm: async () => {
      isBusy.value = true
      const result = await punishOverdueTask(task.id)
      isBusy.value = false
      if (result.error) {
        pushNotify(`扣款失敗：${result.error}`, 'error')
        return
      }
      pushNotify('已扣除金幣並移除任務。', 'info')
    }
  })
}

const handleSubmitTask = (task: Task) => {
  taskSubmitRatings.time = 0
  taskSubmitRatings.difficulty = 0
  taskSubmitRatings.avoidance = 0
  isSubmitConfirmWithRatings.value = true
  openConfirm({
    title: '送出批准',
    message: `確定要把「${task.title}」送給 ${personById(task.creatorId).name} 批准嗎？`,
    confirmText: '送出批准',
    onConfirm: async () => {
      isSubmitConfirmWithRatings.value = false
      isBusy.value = true
      const result = await submitTask(task.id, {
        time: taskSubmitRatings.time,
        difficulty: taskSubmitRatings.difficulty,
        avoidance: taskSubmitRatings.avoidance
      })
      isBusy.value = false
      if (result.error) {
        pushNotify(`送出失敗：${result.error}`, 'error')
        return
      }
      pushNotify('已送出批准，等對方確認。', 'success')
    }
  })
}

const handleRejectTask = (task: Task) => {
  openConfirm({
    title: '退回任務',
    message: `確定要退回「${task.title}」嗎？退回原因會同步給對方。`,
    confirmText: '退回',
    onConfirm: async () => {
      isBusy.value = true
      const result = await rejectTask(task.id, rejectionDraft[task.id] || '還差一點，再補一下。')
      isBusy.value = false
      if (result.error) {
        pushNotify(`退回失敗：${result.error}`, 'error')
        return
      }
      pushNotify('已退回給對方。', 'info')
    }
  })
}

const handleApproveTask = (task: Task) => {
  openConfirm({
    title: '批准任務',
    message: `確定通過「${task.title}」並發放 ${currency(task.coinReward)} 嗎？`,
    confirmText: '通過並發放',
    onConfirm: async () => {
      isBusy.value = true
      const result = await approveTask(task.id)
      isBusy.value = false
      if (result.error) {
        pushNotify(`批准失敗：${result.error}`, 'error')
        return
      }
      openNotice({
        title: '任務已通過',
        message: '金幣已發放。這筆完成任務會留在「他完成啦」，確認後可以收起。'
      })
    }
  })
}

const handleClearCompletedTask = (task: Task) => {
  openConfirm({
    title: task.isRecurring ? '再次開放常駐任務' : '收起完成任務',
    message: task.isRecurring
      ? `「${task.title}」會回到進行中，之後可以再次送出批准。`
      : `「${task.title}」會從任務清單刪除。`,
    confirmText: task.isRecurring ? '再次開放' : '收起並刪除',
    variant: task.isRecurring ? 'primary' : 'danger',
    onConfirm: async () => {
      isBusy.value = true
      const result = await clearCompletedTask(task.id)
      isBusy.value = false
      if (result.error) {
        pushNotify(`處理失敗：${result.error}`, 'error')
        return
      }
      pushNotify(task.isRecurring ? '常駐任務已再次開放。' : '完成任務已收起。', 'success')
    }
  })
}

const startEditTask = (task: Task) => {
  editingTaskId.value = task.id
  taskEditDraft.title = task.title
  taskEditDraft.description = task.description
  taskEditDraft.coinReward = task.coinReward
  taskEditDraft.dueAt = task.dueAt
  taskEditDraft.isRecurring = task.isRecurring
}

const cancelEditTask = () => {
  editingTaskId.value = null
}

const saveTaskEdit = async (taskId: string) => {
  if (!isTaskEditValid.value) {
    pushNotify('請確認任務標題存在，且金幣不是負數。', 'info')
    return
  }

  isBusy.value = true
  const result = await updateTask(taskId, taskEditDraft)
  isBusy.value = false
  if (result.error) {
    pushNotify(`更新失敗：${result.error}`, 'error')
    return
  }

  editingTaskId.value = null
  pushNotify('任務已更新。', 'success')
}

const handleDeleteTask = (task: Task) => {
  openConfirm({
    title: '刪除任務',
    message: `確定要刪除「${task.title}」嗎？只有尚未接取的任務可以刪除。`,
    confirmText: '刪除任務',
    variant: 'danger',
    onConfirm: async () => {
      isBusy.value = true
      const result = await deleteTask(task.id)
      isBusy.value = false
      if (result.error) {
        pushNotify(`刪除失敗：${result.error}`, 'error')
        return
      }
      pushNotify('任務已刪除。', 'info')
    }
  })
}

const removeShopImage = () => {
  shopForm.rawFile = null
  shopForm.imageUrl = ''
  shopImagePreview.value = null
  if (shopImageInput.value) shopImageInput.value.value = ''
}

const handleCreateShopItem = async () => {
  if (!shopForm.title.trim()) {
    pushNotify('商城項目需要一個名字。', 'info')
    return
  }

  if (shopForm.isProduct) {
    const real = Number(shopForm.realPrice)
    if (!Number.isFinite(real) || real < 0) {
      pushNotify('現實價格必須是 0 以上的數字。', 'info')
      return
    }
  } else {
    if (!Number.isFinite(shopForm.price) || shopForm.price < 0) {
      pushNotify('價格必須是 0 以上的數字。', 'info')
      return
    }
  }

  const editingId = editingShopItemId.value

  isBusy.value = true
  let finalImageUrl = ''

  try {
    if (shopForm.rawFile) {
      console.log('開始處理商城圖片上傳...', shopForm.rawFile.name)
      const compressed = await compressImage(shopForm.rawFile, 1024, 0.8)
      const uploadResult = await uploadFile('shop', compressed, shopForm.rawFile.name)
      
      if (uploadResult.error) {
        console.error('圖片上傳失敗:', uploadResult.error)
        pushNotify(`圖片上傳失敗：${uploadResult.error}。請確認已建立名為 "shop" 的公開 Bucket。`, 'error', 6000)
        isBusy.value = false
        return
      } else {
        console.log('圖片上傳成功，網址:', uploadResult.url)
        finalImageUrl = uploadResult.url || ''
      }
    }

    const imagePayload = finalImageUrl || shopForm.imageUrl || null
    const finalPrice = shopForm.isProduct ? shopCoinQuote.value : shopForm.price

    if (editingId) {
      const { error } = await updateShopItem(editingId, {
        title: shopForm.title.trim(),
        description: shopForm.description.trim(),
        price: finalPrice,
        isProduct: shopForm.isProduct,
        realPrice: shopForm.isProduct ? Number(shopForm.realPrice) : null,
        category: shopForm.category.trim(),
        isHidden: shopForm.isHidden,
        imageUrl: imagePayload
      })

      if (error) {
        pushNotify(`更新失敗：${error.message}`, 'error')
      } else {
        resetShopNewForm()
        shopSubView.value = 'mine'
        pushNotify('項目已更新。', 'success')
      }
    } else {
      const pendingWishId = currentWishId.value

      const { error } = await createShopItem({
        title: shopForm.title.trim(),
        description: shopForm.description.trim(),
        price: finalPrice,
        isProduct: shopForm.isProduct,
        realPrice: shopForm.isProduct ? Number(shopForm.realPrice) : null,
        category: shopForm.category.trim(),
        isHidden: shopForm.isHidden,
        imageUrl: imagePayload
      })

      if (!error && pendingWishId) {
        // 成功上架後，刪除原本的願望（跳過圖片刪除，因為新項目正在使用它）
        await deleteShopItem(pendingWishId, true)
        currentWishId.value = null
      }

      if (error) {
        pushNotify(`建立失敗：${error.message}`, 'error')
      } else {
        shopForm.title = ''
        shopForm.description = ''
        shopForm.price = 120
        shopForm.category = '日常'
        shopForm.isHidden = false
        removeShopImage()
        editingShopItemId.value = null
        shopSubView.value = 'mine'
        pushNotify(pendingWishId ? '願望已實現並成功上架！' : '項目已上架。', 'success')
      }
    }
  } catch (err: any) {
    pushNotify(`處理失敗：${err.message}`, 'error')
  } finally {
    isBusy.value = false
  }
}

const handleRedeem = (itemId: string) => {
  const item = state.shopItems.find((shopItem) => shopItem.id === itemId)
  if (!item) {
    pushNotify('商品不存在。', 'error')
    return
  }

  if (balances.value[state.currentUserId] < item.price) {
    pushNotify('目前金幣不足，不能兌換這個項目。', 'error')
    return
  }

  openConfirm({
    title: '確認兌換',
    message: `確定要花 ${currency(item.price)} 兌換「${item.title}」嗎？確認後會建立兌換單並扣除金幣。`,
    confirmText: '立即兌換',
    onConfirm: async () => {
      isBusy.value = true
      const result = await redeemItem(itemId, redemptionNote[itemId] ?? '')
      isBusy.value = false
      if (!result.ok) {
        pushNotify(result.reason, 'error')
        return
      }

      redemptionNote[itemId] = ''
      shopSubView.value = 'orders'
      openNotice({
        title: '兌換單已送出',
        message: '兌換狀態會在應用內即時更新；如果按錯，也可以在兌換單裡取消。'
      })
    }
  })
}

const handleUpdateRedemptionStatus = (redemptionId: string, status: 'in_progress' | 'fulfilled') => {
  const redemption = state.redemptions.find((entry) => entry.id === redemptionId)
  const item = state.shopItems.find((shopItem) => shopItem.id === redemption?.shopItemId)
  if (!redemption) return

  openConfirm({
    title: status === 'fulfilled' ? '完成兌換單' : '更新兌換狀態',
    message:
      status === 'fulfilled'
        ? `確定「${item?.title || '這張兌換單'}」已經完成嗎？確認後它會從兌換單列表消失。`
        : `確定要把「${item?.title || '這張兌換單'}」標記為待履行嗎？`,
    confirmText: status === 'fulfilled' ? '確認完成' : '標記待履行',
    onConfirm: async () => {
      isBusy.value = true
      const result = await updateRedemptionStatus(redemptionId, status)
      isBusy.value = false
      if (result.error) {
        pushNotify(`更新失敗：${result.error}`, 'error')
        return
      }

      if (status === 'fulfilled') {
        openNotice({
          title: '兌換單已完成',
          message: '這張兌換單已確認完成，會從列表中收起。'
        })
      } else {
        pushNotify('兌換單狀態已更新。', 'success')
      }
    }
  })
}

const openRedemptionScanner = (redemptionId: string) => {
  const redemption = state.redemptions.find((entry) => entry.id === redemptionId)
  if (!redemption) return
  scannerRedemptionId.value = redemptionId
}

const handleRedemptionScanMatched = async (redemptionId: string) => {
  if (scannerRedemptionId.value !== redemptionId) return

  isBusy.value = true
  const result = await updateRedemptionStatus(redemptionId, 'fulfilled')
  isBusy.value = false

  if (result.error) {
    scannerRedemptionId.value = null
    pushNotify(`完成失敗：${result.error}`, 'error')
    return
  }

  scannerRedemptionId.value = null
  openNotice({
    title: '兌換單已完成',
    message: '票券已驗證，這張兌換單完成啦!'
  })
}

const handleCancelRedemption = (redemptionId: string) => {
  const redemption = state.redemptions.find((entry) => entry.id === redemptionId)
  const item = state.shopItems.find((shopItem) => shopItem.id === redemption?.shopItemId)
  if (!redemption) return

  openConfirm({
    title: '取消兌換單',
    message: `確定要取消「${item?.title || '這張兌換單'}」嗎？已扣除的金幣將退回。`,
    confirmText: '取消兌換',
    variant: 'danger',
    onConfirm: async () => {
      isBusy.value = true
      const result = await cancelRedemption(redemptionId)
      isBusy.value = false
      if (result.error) {
        pushNotify(`取消失敗：${result.error}`, 'error')
        return
      }
      openNotice({
        title: '兌換單已取消',
        message: '兌換單已收起，金幣也已退回。'
      })
    }
  })
}

const handleHiddenTap = () => {
  hiddenTapCount.value += 1
  if (hiddenTapCount.value >= 6) {
    hiddenUnlocked.value = true
    pushNotify('隱藏商城已開啟。', 'success')
  }
}

const handleWishImageChange = async (event: Event) => {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  wishForm.rawFile = file
  const url = await readFileAsDataUrl(file)
  wishImagePreview.value = url
}

const removeWishImage = () => {
  wishForm.rawFile = null
  wishForm.imageUrl = ''
  wishImagePreview.value = null
  if (wishImageInput.value) wishImageInput.value.value = ''
}

const handleAddWish = async () => {
  if (!wishForm.title.trim()) {
    pushNotify('願望至少要有名字喔 ♥', 'info')
    return
  }
  isBusy.value = true

  let finalImageUrl = ''
  
  try {
    // 如果有上傳圖片，先壓縮並上傳到 Storage
    if (wishForm.rawFile) {
      console.log('開始處理願望圖片上傳...', wishForm.rawFile.name)
      const compressed = await compressImage(wishForm.rawFile, 1024, 0.8)
      const uploadResult = await uploadFile('shop', compressed, wishForm.rawFile.name)
      
      if (uploadResult.error) {
        console.error('圖片上傳失敗:', uploadResult.error)
        pushNotify(`圖片上傳失敗：${uploadResult.error}。請確認已建立名為 "shop" 的公開 Bucket。`, 'error', 6000)
        // 這種情況下通常不應該繼續建立資料庫記錄
        isBusy.value = false
        return
      } else {
        console.log('圖片上傳成功，網址:', uploadResult.url)
        finalImageUrl = uploadResult.url || ''
      }
    }

    const { error } = await createShopItem({
      title: wishForm.title.trim(),
      description: wishForm.description.trim(),
      price: 0,
      isProduct: false,
      realPrice: null,
      category: '許願池',
      isHidden: false,
      imageUrl: finalImageUrl || null
    })

    if (error) {
      pushNotify(`許願失敗：${error.message}`, 'error')
    } else {
      wishForm.title = ''
      wishForm.description = ''
      removeWishImage()
      isWishFormExpanded.value = false
      pushNotify('願望已放入許願池 ♥', 'success')
    }
  } catch (err: any) {
    pushNotify(`處理失敗：${err.message}`, 'error')
  } finally {
    isBusy.value = false
  }
}

const readFileAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })

const handleAvatarChange = async (userId: UserId, event: Event) => {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) {
    return
  }

  const localUrl = await readFileAsDataUrl(file)
  updateProfile(userId, { avatarUrl: localUrl })
  pushNotify('頭像已更新。', 'success')

  if (isSupabaseEnabled && isAuthenticated.value && userId === 'self') {
    isBusy.value = true
    const result = await uploadAvatar(file)
    isBusy.value = false
    if (result.error) {
      pushNotify(`頭像已先更新在本機，但雲端上傳失敗：${result.error}`, 'error')
      return
    }
    pushNotify('頭像已同步到帳號。', 'success')
  }

  target.value = ''
}

const removeAvatar = async () => {
  openConfirm({
    title: '移除頭像',
    message: '確定要移除目前頭像嗎？移除後會同步到雲端帳號。',
    confirmText: '移除',
    onConfirm: async () => {
      isBusy.value = true
      await updateProfile('self', { avatarUrl: null })
      if (isSupabaseEnabled && isAuthenticated.value) {
        await updateMetadata({ avatar_url: null })
      }
      if (avatarInput.value) avatarInput.value.value = ''
      isBusy.value = false
      pushNotify('頭像已移除。', 'success')
    }
  })
}

const saveProfileDraft = async (userId: UserId) => {
  const draft = selfDraft
  updateProfile(userId, {
    name: draft.nickname
  })

  if (isSupabaseEnabled && isAuthenticated.value && userId === 'self') {
    isBusy.value = true
    const result = await updateMetadata({
      nickname: draft.nickname
    })
    isBusy.value = false
    if (result.error) {
      pushNotify(`本機已更新，但帳號資料同步失敗：${result.error}`, 'error')
      return
    }
  }

  pushNotify('人物資料已更新。', 'success')
}

const handleAccountSubmit = async () => {
  if (!accountForm.email.trim() || !accountForm.password.trim()) {
    pushNotify('請把 Email 和密碼填完整。', 'info')
    return
  }

  isBusy.value = true
  const result =
    accountMode.value === 'signin'
      ? await signIn(accountForm.email, accountForm.password)
      : await signUp(accountForm.email, accountForm.password, accountForm.nickname || selfDraft.nickname)
  isBusy.value = false

  if (result.error) {
    pushNotify(result.error, 'error')
    return
  }

  pushNotify(
    accountMode.value === 'signin'
      ? '帳號已登入，之後就能接真正的綁定與同步。'
      : '帳號已建立，若你的專案有開啟 Email 驗證，請先到信箱完成確認。',
    'success'
  )
}

const signOutNow = () => {
  openConfirm({
    title: '登出帳號',
    message: '確定要登出目前帳號嗎？',
    onConfirm: async () => {
      await signOut()
      pushNotify('已登出。', 'info')
    }
  })
}

const deleteAccountNow = () => {
  openConfirm({
    title: '確定要註銷帳號嗎？',
    message: '警告：此操作將永久刪除你的所有個人資料、頭像、任務記錄與商城設定。這是一個不可逆的操作，確定要徹底註銷嗎？',
    confirmText: '確定徹底註銷',
    variant: 'danger',
    onConfirm: async () => {
      isBusy.value = true
      const result = await deleteAccount()
      isBusy.value = false
      if (result?.error) {
        pushNotify(`註銷失敗：${result.error}`, 'error')
      } else {
        pushNotify('帳號已成功註銷。', 'info')
      }
    }
  })
}

const setDensity = (value: DensityMode) => {
  void updateAppearance({ density: value })
}
const setMotion = (value: MotionMode) => {
  void updateAppearance({ motion: value })
}
const setGlass = (value: GlassMode) => {
  void updateAppearance({ glass: value })
}

const handleNotificationMasterToggle = async () => {
  syncNotificationEnvironment()

  if (state.notifications.enabled) {
    await updateNotificationSettings({ enabled: false })
    pushNotify('已關閉系統通知。', 'info')
    return
  }

  if (!isNotificationSupported()) {
    pushNotify('這台裝置目前不支援 PWA 系統通知。', 'error')
    return
  }

  const permission = await requestNotificationPermission()
  notificationPermission.value = permission

  if (permission !== 'granted') {
    await updateNotificationSettings({ enabled: false })
    pushNotify(permission === 'denied' ? '通知權限已被拒絕，請到系統或瀏覽器設定重新允許。' : '尚未取得通知權限。', 'error')
    return
  }

  notificationSnapshot = createNotificationSnapshot()
  await updateNotificationSettings({ enabled: true })
  await showZcNotification({
    body: '通知已開啟，之後會依照你的細項設定提醒你。',
    tag: 'zc-notification-enabled',
    url: '/'
  })
  pushNotify('通知已開啟。', 'success')
}

const setNotificationPreference = (key: NotificationPreferenceKey, enabled: boolean) => {
  void updateNotificationSettings({
    events: {
      [key]: enabled
    }
  })
}

const sendTestNotification = async () => {
  syncNotificationEnvironment()
  if (!notificationsActive.value) {
    pushNotify('請先開啟通知並允許系統權限。', 'info')
    return
  }

  await showZcNotification({
    body: '這是一則 ZC 測試通知。',
    tag: 'zc-notification-test',
    url: '/'
  })
  pushNotify('已送出測試通知。', 'success')
}

// --- 登入與資料同步邏輯 ---
const showAuthWall = computed(() => isSupabaseEnabled && !authLoading.value && !isAuthenticated.value)

watch(
  user,
  async (currentUser) => {
    if (currentUser) {
      await fetchData()
      // 如果還沒連線且沒有邀請碼，自動產生一個
      if (!state.coupleId && !state.binding.inviteCode) {
        await generateInviteCode()
      }
      const meta = currentUser.user_metadata || {}
      updateProfile('self', {
        name: meta.nickname || profileMap.value.self.name,
        avatarUrl: meta.avatar_url || null
      })
    } else {
      // 登出時清理所有本地狀態
      resetState()
    }
  },
  { immediate: true }
)

const personById = (userId: UserId): Profile => profileMap.value[userId]

const formatEntryDescription = (desc: string) => {
  return desc.replace(/\[禮物:[^\]]+\]\s*/, '')
}
</script>

<template>
  <!-- 啟動開屏動畫 -->
  <transition name="fade">
    <div v-if="state.isInitializing || authLoading" class="fixed inset-0 z-[100] flex items-center justify-center bg-paper bg-mesh">
      <div class="flex flex-col items-center gap-6">
        <div class="relative">
          <div class="absolute inset-0 bg-gold/20 blur-3xl rounded-full animate-pulse"></div>
          <div class="relative glass-panel rounded-[32px] p-8 shadow-2xl shadow-ink/5">
            <Sparkles class="h-12 w-12 text-gold animate-soft-bounce" />
          </div>
        </div>
        <div class="text-center space-y-2">
          <h2 class="font-serif text-2xl tracking-[0.3em] text-ink/80">ZC</h2>
          <div class="flex items-center gap-3">
            <div class="h-[1px] w-4 bg-ink/20"></div>
            <p class="text-[10px] uppercase tracking-[0.5em] text-ink/40">Private Ritual</p>
            <div class="h-[1px] w-4 bg-ink/20"></div>
          </div>
        </div>
      </div>
    </div>
  </transition>

  <!-- 登入牆 -->
  <div v-if="showAuthWall" class="flex min-h-screen items-center justify-center bg-paper bg-mesh px-4 py-12">
    <transition name="page-fade" mode="out-in">
      <div :key="accountMode" class="glass-panel w-full max-w-md space-y-8 rounded-[32px] p-8 shadow-2xl shadow-ink/5 sm:p-10">
        <div class="text-center space-y-2">
          <div class="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-ink/5 text-ink/80 mb-2">
            <LockKeyhole v-if="accountMode === 'signin'" class="h-6 w-6" />
            <Sparkles v-else class="h-6 w-6" />
          </div>
          <h1 class="font-serif text-3xl font-medium text-ink tracking-tight">
            {{ accountMode === 'signin' ? '歡迎回來' : '建立專屬空間' }}
          </h1>
          <p class="text-xs uppercase tracking-[0.25em] text-ink/40">Private Ritual • ZC</p>
        </div>

        <div class="flex rounded-[22px] bg-white/40 p-1.5 backdrop-blur-sm border border-white/60">
          <button
            class="flex-1 rounded-[18px] py-2.5 text-sm font-medium transition-all duration-500"
            :class="accountMode === 'signin' ? 'bg-ink text-mist shadow-lg shadow-ink/10' : 'text-ink/50 hover:bg-white/60'"
            @click="accountMode = 'signin'"
          >
            登入
          </button>
          <button
            class="flex-1 rounded-[18px] py-2.5 text-sm font-medium transition-all duration-500"
            :class="accountMode === 'signup' ? 'bg-ink text-mist shadow-lg shadow-ink/10' : 'text-ink/50 hover:bg-white/60'"
            @click="accountMode = 'signup'"
          >
            註冊
          </button>
        </div>

        <form @submit.prevent="handleAccountSubmit" class="space-y-6">
          <div class="space-y-4">
            <div v-if="accountMode === 'signup'" class="field-group">
              <label class="field-label">您的暱稱</label>
              <div class="relative">
                <span class="absolute left-4 top-1/2 -translate-y-1/2 text-ink/30">
                  <User class="h-5 w-5" />
                </span>
                <input 
                  v-model="accountForm.nickname" 
                  type="text" 
                  class="auth-input"
                  placeholder="怎麼稱呼您？" 
                  required 
                />
              </div>
            </div>

            <div class="field-group">
              <label class="field-label">電子信箱</label>
              <div class="relative">
                <span class="absolute left-4 top-1/2 -translate-y-1/2 text-ink/30">
                  <Mail class="h-5 w-5" />
                </span>
                <input 
                  v-model="accountForm.email" 
                  type="email" 
                  class="auth-input"
                  placeholder="hello@example.com" 
                  required 
                />
              </div>
            </div>

            <div class="field-group">
              <label class="field-label">密碼</label>
              <div class="relative">
                <span class="absolute left-4 top-1/2 -translate-y-1/2 text-ink/30">
                  <Lock class="h-5 w-5" />
                </span>
                <input 
                  v-model="accountForm.password" 
                  :type="showPassword ? 'text' : 'password'" 
                  class="auth-input"
                  placeholder="至少 6 個字元" 
                  required 
                  minlength="6" 
                />
                <button 
                  type="button"
                  @click="showPassword = !showPassword"
                  class="absolute right-4 top-1/2 -translate-y-1/2 text-ink/30 hover:text-ink/60 transition-colors"
                >
                  <Eye v-if="!showPassword" class="h-5 w-5" />
                  <EyeOff v-else class="h-5 w-5" />
                </button>
              </div>
            </div>
          </div>

          <transition name="fade">
            <div v-if="authErrorMessage" class="flex items-center gap-2 rounded-xl bg-red-50/50 px-4 py-3 text-sm text-red-500/80 border border-red-100/50">
              <AlertCircle class="h-4 w-4 shrink-0" />
              <p>{{ authErrorMessage }}</p>
            </div>
          </transition>

          <div class="pt-2">
            <button 
              type="submit" 
              class="primary-button w-full justify-center !py-4 !text-base !rounded-[22px] shadow-xl shadow-ink/10 active:scale-[0.98]" 
              :disabled="isBusy"
            >
              <span v-if="isBusy" class="flex items-center gap-2">
                <svg class="animate-spin h-4 w-4 text-mist" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                處理中...
              </span>
              <span v-else>{{ accountMode === 'signin' ? '登入帳號' : '建立帳號' }}</span>
            </button>
          </div>
          
          <p class="text-center text-[13px] text-ink/35">
            {{ accountMode === 'signin' ? '還沒有帳號嗎？切換到註冊來建立一個。' : '已經有帳號了？直接登入即可。' }}
          </p>
        </form>
      </div>
    </transition>
  </div>

  <!-- 應用主體 -->
  <div v-else class="min-h-screen bg-paper bg-mesh text-ink" :class="appShellClasses">
    <div 
      class="mx-auto flex min-h-screen max-w-7xl flex-col overflow-x-hidden px-4 pb-28 pt-4 sm:px-6 lg:px-8 transition-all duration-500"
      :class="{ 'main-content-blur': isAnyModalOpen }"
    >
      <header v-if="activeView === 'home'" class="glass-panel mb-4 flex flex-col gap-4 rounded-[28px] px-5 py-5 sm:flex-row sm:items-end sm:justify-between">
        <div class="space-y-2">
          <div class="flex items-center gap-3">
            <p class="text-xs uppercase tracking-[0.24em] text-ink/45">狀態 : </p>
            <span class="status-pill bg-white/55 text-ink/60">{{ connectionLabel }}</span>
          </div>
          <div>
            <h1 class="font-serif text-3xl leading-tight sm:text-[2.6rem]">鼻鼻們的窩</h1>
            <p class="mt-1 max-w-2xl text-sm leading-6 text-ink/65">
              (≧∇≦)ﾉ
            </p>
          </div>
        </div>

        <div class="grid grid-cols-1 gap-3 sm:min-w-[360px]" :class="state.coupleId ? 'sm:grid-cols-2' : ''">
          <div class="soft-card rounded-[24px] px-4 py-3">
            <PersonChip :profile="currentUser" size="md" :subtitle="currentUser.title" />
            <p class="mt-3 text-sm text-gold">{{ currency(balances[currentUser.id]) }}</p>
          </div>
          <div v-if="state.coupleId" class="soft-card rounded-[24px] px-4 py-3">
            <PersonChip :profile="partnerUser" size="md" :subtitle="partnerUser.title" />
            <p class="mt-3 text-sm text-gold">{{ currency(balances[partnerUser.id]) }}</p>
          </div>
        </div>
      </header>

      <transition name="fade">
        <div 
          v-if="banner.visible"
          class="mb-4 flex items-center justify-between gap-3 rounded-[22px] border px-4 py-3 backdrop-blur-xl transition-colors duration-300"
          :class="{
            'border-white/45 bg-white/40': banner.type === 'info',
            'border-sage/30 bg-sage/10': banner.type === 'success',
            'border-red-200/40 bg-red-50/20': banner.type === 'error'
          }"
        >
          <div class="flex items-center gap-3">
            <CheckCircle2 v-if="banner.type === 'success'" class="h-4 w-4 text-sage" />
            <AlertCircle v-else-if="banner.type === 'error'" class="h-4 w-4 text-red-400" />
            <Sparkles v-else class="h-4 w-4 text-gold" />
            <p class="text-sm" :class="banner.type === 'info' ? 'text-ink/70' : 'text-ink/85'">
              {{ banner.text }}
            </p>
          </div>
          <button @click="closeNotify" class="rounded-full p-1 text-ink/30 hover:bg-black/5 hover:text-ink/60">
            <X class="h-3.5 w-3.5" />
          </button>
        </div>
      </transition>

      <section
        v-if="!state.isSetupComplete"
        class="glass-panel mx-auto mt-6 w-full max-w-3xl rounded-[32px] px-5 py-6 sm:px-8 sm:py-8"
      >
        <div class="mb-6 space-y-2 text-center">
          <p class="text-xs uppercase tracking-[0.24em] text-ink/45">Space Setup</p>
          <h2 class="font-serif text-3xl">歡迎來到專屬空間</h2>
          <p class="mx-auto max-w-xl text-sm leading-6 text-ink/65">
            你目前還沒有加入任何雙人空間。你可以建立一個新的空間，或使用伴侶給你的邀請碼來加入。
          </p>
        </div>

        <div class="grid gap-6 sm:grid-cols-2">
          <div class="soft-card flex flex-col gap-4 rounded-[24px] px-5 py-6">
            <h3 class="font-serif text-xl">建立新空間</h3>
            <p class="text-sm text-ink/65">開啟一個全新的記帳空間，並產生邀請碼給對方。</p>
            <button class="primary-button mt-auto justify-center" @click="handleCreateSpace" :disabled="isBusy">
              <span v-if="isBusy && !setupForm.inviteCode" class="flex items-center gap-2">
                <svg class="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                建立中...
              </span>
              <span v-else>建立空間</span>
            </button>
          </div>
          
          <div class="soft-card flex flex-col gap-4 rounded-[24px] px-5 py-6">
            <h3 class="font-serif text-xl">加入空間</h3>
            <p class="text-sm text-ink/65">使用伴侶提供的邀請碼，加入已經存在的空間。</p>
            <label class="field mt-auto">
              <input v-model="setupForm.inviteCode" type="text" placeholder="例如：PAIR-XXXXX" />
            </label>
            <button class="primary-button justify-center" @click="handleJoinSpace" :disabled="isBusy">
              <span v-if="isBusy && setupForm.inviteCode" class="flex items-center gap-2">
                <svg class="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                加入中...
              </span>
              <span v-else>加入空間</span>
            </button>
          </div>
        </div>
      </section>

      <template v-else>
        <main class="flex-1 min-w-0 overflow-x-hidden">
          <transition name="page-fade" mode="out-in">
            <section v-if="activeView === 'home'" key="home" class="grid gap-4 lg:grid-cols-[1.15fr,0.85fr]">
              <div class="space-y-4">
                <div class="grid gap-4 sm:grid-cols-3">
                  <article class="glass-panel rounded-[28px] px-5 py-5">
                    <div class="flex items-center justify-between">
                      <p class="panel-eyebrow">Mission</p>
                      <LibraryBig class="h-4 w-4 text-ink/40" />
                    </div>
                    <p class="mt-4 font-serif text-4xl">{{ homeTaskCount }}</p>
                    <p class="mt-2 text-sm text-ink/60">φ(*￣0￣)</p>
                  </article>

                  <article class="glass-panel rounded-[28px] px-5 py-5">
                    <div class="flex items-center justify-between">
                      <p class="panel-eyebrow">批准</p>
                      <CheckCheck class="h-4 w-4 text-ink/40" />
                    </div>
                    <p class="mt-4 font-serif text-4xl">{{ reviewQueue.length }}</p>
                    <div class="mt-2 flex items-center justify-between gap-3">
                      <p class="text-sm text-ink/60">他做完啦</p>
                      <button class="ghost-button !px-3 !py-1.5 text-xs" @click="switchTaskView('review')">快速瀏覽</button>
                    </div>
                  </article>

                  <article class="glass-panel rounded-[28px] px-5 py-5">
                    <div class="flex items-center justify-between">
                      <p class="panel-eyebrow">他想要...</p>
                      <Gift class="h-4 w-4 text-ink/40" />
                    </div>
                    <p class="mt-4 font-serif text-4xl">{{ homeRedemptionCount }}</p>
                    <p class="mt-2 text-sm text-ink/60">(○｀ 3′○)</p>
                  </article>
                </div>

                <article class="glass-panel rounded-[28px] px-5 py-5">
                  <div class="mb-5 flex items-end justify-between">
                    <div>
                      <p class="panel-eyebrow">奏摺</p>
                      <h2 class="font-serif text-2xl">(≧∇≦)ﾉ</h2>
                    </div>
                    <button class="ghost-button" @click="switchMainView('tasks')">前往任務</button>
                  </div>

                  <div class="space-y-3">
                    <article
                      v-for="task in tasksAssignedToMe.slice(0, 3)"
                      :key="task.id"
                      class="soft-card flex flex-col gap-3 rounded-[24px] px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div class="space-y-3">
                        <div class="flex flex-wrap items-center gap-2">
                          <span class="status-pill" :class="getTaskTone(task.status)">{{ getTaskLabel(task.status) }}</span>
                          <span v-if="!task.isRecurring" class="text-xs text-ink/45">截止 {{ formatDate(task.dueAt) }}</span>
                        </div>
                        <PersonChip :profile="personById(task.creatorId)" subtitle="發起人" />
                        <div>
                          <h3 class="font-serif text-xl">{{ task.title }}</h3>
                          <p class="mt-1 text-sm leading-6 text-ink/60 whitespace-pre-wrap">
                            {{ task.description || '沒有補充說明。' }}
                          </p>
                        </div>
                      </div>
                      <div class="flex items-center gap-3 task-action-group w-full sm:w-auto">
                        <p class="text-xs sm:text-sm text-gold flex-shrink-0">{{ currency(task.coinReward) }}</p>
                        <div class="flex flex-1 items-center gap-2 sm:flex-initial sm:justify-end">
                          <template v-if="!task.isRecurring && isTaskOverdue(task.dueAt) && task.status !== 'approved' && task.status !== 'submitted'">
                            <button
                              class="primary-button !bg-red-500 hover:!bg-red-600 !border-red-600"
                              @click="handlePunishOverdue(task)"
                            >
                              忘記完成啦 !!
                            </button>
                          </template>
                          <template v-else>
                            <button
                              v-if="task.status === 'open'"
                              class="primary-button"
                              @click="handleAcceptTask(task)"
                            >
                              接取
                            </button>
                            <template v-else-if="task.status === 'accepted' || task.status === 'rejected'">
                              <button
                                class="ghost-button !py-1.5 text-ink/60"
                                @click="handleAbandonTask(task)"
                              >
                                放棄接取
                              </button>
                              <button
                                class="primary-button"
                                @click="handleSubmitTask(task)"
                              >
                                讓他批准(・∀・)
                              </button>
                            </template>
                          </template>
                        </div>
                      </div>
                    </article>
                  </div>
                </article>
              </div>

              <div class="space-y-4">
                <article class="glass-panel rounded-[28px] px-5 py-5">
                  <div class="mb-5 flex items-end justify-between">
                    <div>
                      <p class="panel-eyebrow">錢 !!!</p>
                      <h2 class="font-serif text-2xl">金幣 !!!</h2>
                    </div>
                    <button class="ghost-button" @click="switchMainView('ledger')">看全部</button>
                  </div>

                  <div class="space-y-3">
                    <article
                      v-for="entry in recentLedger.slice(0, 5)"
                      :key="entry.id"
                      class="soft-card flex items-center justify-between rounded-[24px] px-4 py-4"
                    >
                      <div class="space-y-2">
                        <PersonChip :profile="personById(entry.userId)" subtitle="金幣異動" />
                        <div>
                          <h3 class="font-serif text-lg">{{ formatEntryDescription(entry.description) }}</h3>
                          <p class="mt-1 text-xs text-ink/45">{{ formatDateTime(entry.createdAt) }}</p>
                        </div>
                      </div>
                      <p :class="entry.amount > 0 ? 'text-sage' : 'text-ink'" class="text-sm">
                        {{ entry.amount > 0 ? '+' : '' }}{{ entry.amount }}
                      </p>
                    </article>
                  </div>
                </article>

                <article class="glass-panel rounded-[28px] px-5 py-5">
                  <div class="mb-5 flex items-end justify-between">
                    <div>
                      <p class="panel-eyebrow">最新兌換</p>
                      <h2 class="font-serif text-2xl">商城動態</h2>
                    </div>
                    <button class="ghost-button" @click="switchMainView('shop')">前往 shopping</button>
                  </div>

                  <div class="space-y-3">
                    <article
                      v-for="entry in homeRedemptions"
                      :key="entry.id"
                      class="soft-card rounded-[24px] px-4 py-4"
                    >
                      <div class="flex items-center justify-between gap-3">
                        <div class="space-y-2">
                          <PersonChip :profile="personById(entry.redeemerId)" subtitle="兌換者" />
                          <h3 class="font-serif text-lg">
                            {{ state.shopItems.find((item) => item.id === entry.shopItemId)?.title || '已刪除項目' }}
                          </h3>
                        </div>
                          <div class="flex flex-col items-end gap-2">
                            <button class="ghost-button !py-1 !px-2.5 !text-[11px] opacity-60 hover:opacity-100" @click="selectedRedemptionId = entry.id">查看票券</button>
                            <span class="status-pill bg-white/60 text-ink/70">{{ getRedemptionLabel(entry.status) }}</span>
                          </div>
                      </div>
                      <p class="mt-3 text-sm text-ink/55 whitespace-pre-wrap">{{ entry.note || '沒有留下額外備註。' }}</p>
                    </article>
                  </div>
                </article>
              </div>
            </section>

            <section v-else-if="activeView === 'tasks'" key="tasks" class="space-y-4">
              <article class="glass-panel rounded-[28px] px-5 py-5">
                <div class="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                  <div>
                    <p class="panel-eyebrow">Missions</p>
                    <h2 class="font-serif text-2xl">我要他...
                    </h2>
                    <p class="mt-2 text-sm text-ink/60">（￣︶￣）↗　</p>
                  </div>
                  <SectionTabs v-model="taskSubView" :items="taskSections" />
                </div>

                <div v-if="taskSubView === 'assigned'" class="space-y-3">
                  <article v-for="task in tasksAssignedToMe" :key="task.id" class="soft-card rounded-[24px] px-4 py-4">
                    <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div class="space-y-3">
                        <div class="flex flex-wrap items-center gap-2">
                          <span class="status-pill" :class="getTaskTone(task.status)">{{ getTaskLabel(task.status) }}</span>
                          <span v-if="!task.isRecurring" class="text-xs text-ink/45">截止 {{ formatDate(task.dueAt) }}</span>
                        </div>
                        <PersonChip :profile="personById(task.creatorId)" subtitle="發起人" />
                        <div>
                          <h3 class="font-serif text-xl">{{ task.title }}</h3>
                          <p class="mt-1 text-sm leading-6 text-ink/60 whitespace-pre-wrap">
                            {{ task.description || '這筆任務還沒有補充說明。' }}
                          </p>
                          <p v-if="task.rejectionNote" class="mt-3 text-sm text-ink/55 whitespace-pre-wrap">退回原因：{{ task.rejectionNote }}</p>
                        </div>
                      </div>
                      <div class="flex items-center gap-3 task-action-group w-full sm:w-auto">
                        <p class="text-xs sm:text-sm text-gold flex-shrink-0">{{ currency(task.coinReward) }}</p>
                        <div class="flex flex-1 items-center gap-2 sm:flex-initial sm:justify-end">
                          <template v-if="!task.isRecurring && isTaskOverdue(task.dueAt) && task.status !== 'approved' && task.status !== 'submitted'">
                            <button
                              class="primary-button !bg-red-500 hover:!bg-red-600 !border-red-600"
                              @click="handlePunishOverdue(task)"
                            >
                              忘記完成啦 !!
                            </button>
                          </template>
                          <template v-else>
                            <button
                              v-if="task.status === 'open'"
                              class="primary-button"
                              @click="handleAcceptTask(task)"
                            >
                              接取任務
                            </button>
                            <template v-else-if="task.status === 'accepted' || task.status === 'rejected'">
                              <button
                                class="ghost-button !py-1.5 text-ink/60"
                                @click="handleAbandonTask(task)"
                              >
                                放棄接取
                              </button>
                              <button
                                class="primary-button"
                                @click="handleSubmitTask(task)"
                              >
                                送出批准
                              </button>
                            </template>
                          </template>
                        </div>
                      </div>
                    </div>
                  </article>

                  <div v-if="!tasksAssignedToMe.length" class="soft-card rounded-[24px] px-4 py-5 text-sm text-ink/55">
                    目前沒事嘿嘿(ノ∀｀) 。
                  </div>
                </div>

                <div v-else-if="taskSubView === 'review'" class="space-y-3">
                  <article v-for="task in reviewQueue" :key="task.id" class="soft-card rounded-[24px] px-4 py-4">
                    <div class="mb-3 flex items-center justify-between gap-3">
                      <div class="space-y-2">
                        <PersonChip :profile="personById(task.assigneeId)" :subtitle="task.status === 'approved' ? '已通過' : '已送出批准'" />
                        <h3 class="font-serif text-xl">{{ task.title }}</h3>
                        <span v-if="task.isRecurring" class="status-pill bg-gold/15 text-gold">常駐任務</span>
                      </div>
                      <p class="text-sm text-gold">{{ currency(task.coinReward) }}</p>
                    </div>
                    <p class="text-sm leading-6 text-ink/60 whitespace-pre-wrap">{{ task.description || '這筆任務還沒有補充說明。' }}</p>
                    <template v-if="task.status === 'submitted'">
                      <textarea
                        v-model="rejectionDraft[task.id]"
                        rows="2"
                        class="mt-4 w-full rounded-[20px] border border-white/45 bg-white/55 px-4 py-3 text-sm text-ink outline-none transition placeholder:text-ink/35 focus:border-gold/55 focus:bg-white/72"
                        placeholder="我覺得...這樣不行 (´-ι_-｀)"
                      />
                      <div class="mt-4 flex flex-wrap justify-end gap-3">
                        <button class="ghost-button" @click="handleRejectTask(task)">
                          退回
                        </button>
                        <button class="primary-button" @click="handleApproveTask(task)">通過，賞 !!!</button>
                      </div>
                    </template>
                    <div v-else class="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-[20px] border border-sage/20 bg-sage/10 px-4 py-3">
                      <p class="text-sm text-sage">已通過，金幣已發放。</p>
                      <button class="primary-button" @click="handleClearCompletedTask(task)">
                        {{ task.isRecurring ? '再次開放' : '收起完成任務' }}
                      </button>
                    </div>
                  </article>

                  <div v-if="!reviewQueue.length" class="soft-card rounded-[24px] px-4 py-5 text-sm text-ink/55">
                    目前沒有待你批准的項目。
                  </div>
                </div>

                <div v-else-if="taskSubView === 'created'" class="space-y-3">
                  <article v-for="task in tasksCreatedByMe" :key="task.id" class="soft-card rounded-[24px] px-4 py-4">
                    <div v-if="editingTaskId === task.id" class="grid gap-4">
                      <label class="field">
                        <span>標題</span>
                        <input v-model="taskEditDraft.title" type="text" />
                      </label>
                      <label class="field">
                        <span>描述</span>
                        <textarea v-model="taskEditDraft.description" rows="3" />
                      </label>
                      <div class="grid gap-4 sm:grid-cols-2">
                        <label class="field">
                          <span>金幣</span>
                          <input v-model.number="taskEditDraft.coinReward" type="number" min="0" />
                        </label>
                        <label v-if="!taskEditDraft.isRecurring" class="field">
                          <span>截止日</span>
                          <DatePicker v-model="taskEditDraft.dueAt" />
                        </label>
                      </div>
                      <label class="field field-inline">
                        <span>常駐任務</span>
                        <button
                          type="button"
                          class="relative inline-flex h-6 w-11 items-center rounded-full transition"
                          :class="taskEditDraft.isRecurring ? 'bg-gold' : 'bg-ink/20'"
                          @click="taskEditDraft.isRecurring = !taskEditDraft.isRecurring"
                        >
                          <span
                            class="inline-block h-4 w-4 transform rounded-full bg-white shadow transition"
                            :class="taskEditDraft.isRecurring ? 'translate-x-6' : 'translate-x-1'"
                          />
                        </button>
                      </label>
                      <p v-if="taskEditDraft.coinReward < 0" class="text-sm text-red-500/80">金幣不能為負數。</p>
                      <div class="flex flex-wrap justify-end gap-3">
                        <button class="ghost-button" @click="cancelEditTask">取消</button>
                        <button class="primary-button" :disabled="!isTaskEditValid || isBusy" @click="saveTaskEdit(task.id)">儲存</button>
                      </div>
                    </div>

                    <div v-else class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div class="space-y-3">
                        <div class="flex items-center gap-2">
                          <span class="status-pill" :class="getTaskTone(task.status)">{{ getTaskLabel(task.status) }}</span>
                          <span v-if="task.isRecurring" class="status-pill bg-gold/15 text-gold">常駐</span>
                        </div>
                        <PersonChip :profile="personById(task.assigneeId)" subtitle="執行對象" />
                        <div>
                          <h3 class="font-serif text-xl">{{ task.title }}</h3>
                          <p class="mt-1 text-sm text-ink/60 whitespace-pre-wrap">{{ task.description || '這筆任務還沒有補充說明。' }}</p>
                        </div>
                      </div>
                      <div class="flex flex-col items-start gap-2 sm:items-end">
                        <p class="text-sm text-gold">{{ currency(task.coinReward) }}</p>
                        <div v-if="task.status === 'open'" class="flex flex-wrap gap-2">
                          <button class="ghost-button !py-1.5" @click="startEditTask(task)">編輯</button>
                          <button class="ghost-button !py-1.5 text-red-500/70 hover:!bg-red-50" @click="handleDeleteTask(task)">刪除</button>
                        </div>
                      </div>
                    </div>
                  </article>

                  <div v-if="!tasksCreatedByMe.length" class="soft-card rounded-[24px] px-4 py-5 text-sm text-ink/55">
                    你還沒有建立任何任務。
                  </div>
                </div>

                <div v-else class="grid gap-4">
                  <label class="field">
                    <span>標題</span>
                    <input v-model="taskForm.title" type="text" placeholder="例如：幫我洗澡" />
                  </label>
                  <label class="field">
                    <span>描述</span>
                    <textarea v-model="taskForm.description" rows="3" placeholder="寫得短一點也可以，只要讓對方明白就好。" />
                  </label>
                  <div class="grid gap-4 sm:grid-cols-2">
                    <div class="soft-card rounded-[24px] px-4 py-4 text-sm text-ink/55">
                      <p class="font-serif text-ink/80">基準金幣</p>
                      <p class="mt-1 text-2xl text-gold">15 枚</p>
                      <p class="mt-2 text-xs text-ink/45">最終金幣會在對方「送出批准」時依評分倍率計算。</p>
                    </div>
                    <label v-if="!taskForm.isRecurring" class="field">
                      <span>截止日</span>
                      <DatePicker v-model="taskForm.dueAt" />
                    </label>
                  </div>
                  <label class="field field-inline">
                    <span>常駐任務</span>
                    <button
                      type="button"
                      class="relative inline-flex h-6 w-11 items-center rounded-full transition"
                      :class="taskForm.isRecurring ? 'bg-gold' : 'bg-ink/20'"
                      @click="taskForm.isRecurring = !taskForm.isRecurring"
                    >
                      <span
                        class="inline-block h-4 w-4 transform rounded-full bg-white shadow transition"
                        :class="taskForm.isRecurring ? 'translate-x-6' : 'translate-x-1'"
                      />
                    </button>
                  </label>
                  <div class="mt-2 flex justify-end">
                    <button class="primary-button" :disabled="!isTaskFormValid || isBusy" @click="handleCreateTask">去吧 !我的任務</button>
                  </div>
                </div>
              </article>
            </section>

            <section v-else-if="activeView === 'shop'" key="shop" class="space-y-4">
              <article class="glass-panel rounded-[28px] px-5 py-5">
                <div class="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                  <div>
                    <p class="panel-eyebrow">商城</p>
                    <div class="text-left">
                      <h2 class="font-serif text-2xl">щ(ʘ╻ʘ)щ</h2>
                    </div>
                    <p class="mt-2 text-sm text-ink/60"></p>
                  </div>
                  <div class="flex flex-col items-start gap-3 lg:items-end">
                    <div class="flex items-center gap-2 text-xs text-ink/45">
                      <LockKeyhole class="h-4 w-4" />
                      <span>{{ hiddenUnlocked ? '隱藏商城已開啟' : '^0^' }}</span>
                    </div>
                    <SectionTabs v-model="shopSubView" :items="shopSections" />
                  </div>
                </div>

                <div v-if="shopSubView === 'browse'" class="space-y-3">
                  <div 
                    ref="shopCatContainerRef"
                    class="relative overflow-visible pb-3 select-none touch-none"
                    @pointerdown="handleCatBarPointerDown"
                  >
                    <div 
                      ref="shopCatContentRef"
                      class="flex gap-2"
                      :style="catBarInnerStyle"
                    >
                      <transition-group name="list">
                        <button
                          v-for="(cat, index) in shopCategories"
                          :key="cat"
                          :id="`cat-item-${cat}`"
                          @pointerup="handleCatClick(cat)"
                          class="shrink-0 rounded-full px-4 py-2 text-sm pointer-events-auto relative origin-center"
                          :class="[
                            shopSelectedCategory === cat ? 'bg-sage text-white shadow-md' : 'bg-white/40 text-ink/70 hover:bg-white/60',
                            reorderingCat === cat ? 'z-50 shadow-xl opacity-90' : 'z-10'
                          ]"
                          :style="getCatItemStyle(cat)"
                        >
                          {{ cat }}
                        </button>
                      </transition-group>
                    </div>
                  </div>

                  <article v-for="item in filteredBrowseItems" :key="item.id" class="soft-card rounded-[24px] px-4 py-4">
                    <div v-if="item.imageUrl" class="mb-4 cursor-zoom-in overflow-hidden rounded-[20px] bg-black/5" @click="selectedImageUrl = item.imageUrl">
                      <img :src="item.imageUrl" class="max-h-[400px] w-full object-contain shadow-sm" alt="商品圖片" />
                    </div>
                    <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div class="space-y-3">
                        <div class="mb-2 flex flex-wrap items-center gap-2">
                          <span class="status-pill bg-white/60 text-ink/70">{{ item.category }}</span>
                          <span v-if="item.isHidden" class="text-xs text-gold">隱藏項目</span>
                        </div>
                        <PersonChip :profile="personById(item.creatorId)" subtitle="提供者" />
                        <div>
                          <h3 class="font-serif text-xl">{{ item.title }}</h3>
                          <p class="mt-1 text-sm leading-6 text-ink/60 whitespace-pre-wrap">
                            {{ item.description || '這個項目沒有補充說明。' }}
                          </p>
                        </div>
                      </div>
                      <div class="min-w-[172px] space-y-3">
                        <p class="text-right text-sm text-gold">{{ currency(item.price) }}</p>
                        <textarea
                          v-model="redemptionNote[item.id]"
                          rows="2"
                          class="w-full rounded-[20px] border border-white/45 bg-white/55 px-4 py-3 text-sm text-ink outline-none transition placeholder:text-ink/35 focus:border-gold/55 focus:bg-white/72"
                          placeholder="可留一句補充。"
                        />
                        <button
                          class="primary-button w-full"
                          :disabled="balances[state.currentUserId] < item.price || isBusy"
                          @click="handleRedeem(item.id)"
                        >
                          立即兌換
                        </button>
                      </div>
                    </div>
                  </article>

                  <div v-if="hiddenUnlocked && hiddenShopItems.length" class="rounded-[24px] border border-gold/20 bg-gold/8 px-4 py-4">
                    <p class="text-sm text-gold">隱藏區已解鎖，特殊項目現在會一起顯示。</p>
                  </div>

                  <div v-if="!filteredBrowseItems.length" class="soft-card rounded-[24px] px-4 py-5 text-sm text-ink/55">
                    目前沒有可兌換的項目。
                  </div>
                </div>

                <div v-else-if="shopSubView === 'orders'" class="space-y-4">
                  <div>
                    <p class="mb-3 text-sm text-ink/45">他換了這個</p>
                    <div class="space-y-3">
                      <article v-for="entry in incomingRedemptions" :key="entry.id" class="soft-card rounded-[24px] px-4 py-4">
                        <div v-if="state.shopItems.find(i => i.id === entry.shopItemId)?.imageUrl" class="mb-4">
                          <img :src="state.shopItems.find(i => i.id === entry.shopItemId)?.imageUrl || ''" class="h-32 w-full rounded-[16px] object-cover" alt="項目圖片" />
                        </div>
                        <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div class="space-y-3">
                            <div class="flex flex-wrap items-center gap-2">
                              <span class="status-pill bg-white/60 text-ink/70">{{ getRedemptionLabel(entry.status) }}</span>
                            </div>
                            <PersonChip :profile="personById(entry.redeemerId)" subtitle="兌換者" />
                            <div>
                              <h3 class="font-serif text-xl">
                                {{ state.shopItems.find((item) => item.id === entry.shopItemId)?.title || '已刪除項目' }}
                              </h3>
                              <p class="mt-1 text-sm text-ink/60 whitespace-pre-wrap">{{ entry.note || '沒有補充說明。' }}</p>
                            </div>
                          </div>
                          <div class="flex flex-wrap gap-2">
                            <button class="ghost-button" @click="selectedRedemptionId = entry.id">查看票券</button>
                            <button class="ghost-button" @click="handleCancelRedemption(entry.id)">取消</button>
                            <button class="ghost-button" @click="handleUpdateRedemptionStatus(entry.id, 'in_progress')">待履行</button>
                            <button class="primary-button" @click="openRedemptionScanner(entry.id)">掃描</button>
                          </div>
                        </div>
                      </article>
                    </div>
                  </div>

                  <div>
                    <p class="mb-3 text-sm text-ink/45">我要這些</p>
                    <div class="space-y-3">
                      <article v-for="entry in outgoingRedemptions" :key="entry.id" class="soft-card rounded-[24px] px-4 py-4">
                        <div v-if="state.shopItems.find(i => i.id === entry.shopItemId)?.imageUrl" class="mb-4">
                          <img :src="state.shopItems.find(i => i.id === entry.shopItemId)?.imageUrl || ''" class="h-32 w-full rounded-[16px] object-cover" alt="項目圖片" />
                        </div>
                        <div class="flex items-start justify-between gap-3">
                          <div class="space-y-3">
                            <div class="flex flex-wrap items-center gap-2">
                              <span class="status-pill bg-white/60 text-ink/70">{{ getRedemptionLabel(entry.status) }}</span>
                            </div>
                            <PersonChip :profile="personById(entry.creatorId)" subtitle="提供者" />
                            <div>
                              <h3 class="font-serif text-xl">
                                {{ state.shopItems.find((item) => item.id === entry.shopItemId)?.title || '已刪除項目' }}
                              </h3>
                              <p class="mt-1 text-sm text-ink/60 whitespace-pre-wrap">{{ entry.note || '沒有補充說明。' }}</p>
                            </div>
                          </div>
                          <div class="flex flex-col items-end gap-2 flex-shrink-0">
                            <p class="text-sm text-gold">{{ currency(entry.priceSnapshot) }}</p>
                            <button class="ghost-button !py-1.5 whitespace-nowrap" @click="selectedRedemptionId = entry.id">
                              查看票券
                            </button>
                            <button class="ghost-button !py-1.5 text-red-500/70 hover:!bg-red-50 whitespace-nowrap" @click="handleCancelRedemption(entry.id)">
                              取消兌換
                            </button>
                          </div>
                        </div>
                      </article>
                    </div>
                  </div>

                  <div
                    v-if="!incomingRedemptions.length && !outgoingRedemptions.length"
                    class="soft-card rounded-[24px] px-4 py-5 text-sm text-ink/55"
                  >
                    目前還沒有任何兌換單。
                  </div>
                </div>

                <div v-else-if="shopSubView === 'mine'" class="space-y-3">
                  <div 
                    ref="shopCatContainerRef"
                    class="relative overflow-visible pb-3 select-none touch-none"
                    @pointerdown="handleCatBarPointerDown"
                  >
                    <div 
                      ref="shopCatContentRef"
                      class="flex gap-2"
                      :style="catBarInnerStyle"
                    >
                      <transition-group name="list">
                        <button
                          v-for="(cat, index) in shopCategories"
                          :key="cat"
                          :id="`cat-item-${cat}`"
                          @pointerup="handleCatClick(cat)"
                          class="shrink-0 rounded-full px-4 py-2 text-sm pointer-events-auto relative origin-center"
                          :class="[
                            shopSelectedCategory === cat ? 'bg-sage text-white shadow-md' : 'bg-white/40 text-ink/70 hover:bg-white/60',
                            reorderingCat === cat ? 'z-50 shadow-xl opacity-90' : 'z-10'
                          ]"
                          :style="getCatItemStyle(cat)"
                        >
                          {{ cat }}
                        </button>
                      </transition-group>
                    </div>
                  </div>

                  <article v-for="item in filteredMyItems" :key="item.id" class="soft-card rounded-[24px] px-4 py-4">
                    <div v-if="item.imageUrl" class="mb-4 cursor-zoom-in overflow-hidden rounded-[20px] bg-black/5" @click="selectedImageUrl = item.imageUrl">
                      <img :src="item.imageUrl" class="max-h-[300px] w-full object-contain shadow-sm" alt="商品圖片" />
                    </div>
                    <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div class="space-y-3">
                        <div class="mb-2 flex items-center gap-2">
                          <span class="status-pill bg-white/60 text-ink/70">{{ item.category }}</span>
                          <span class="text-xs text-ink/45">{{ item.isHidden ? '隱藏項目' : '一般項目' }}</span>
                          <span class="text-xs text-ink/45">{{ item.isActive ? '上架中' : '已暫停' }}</span>
                        </div>
                        <PersonChip :profile="personById(item.creatorId)" subtitle="建立者" />
                        <div>
                          <h3 class="font-serif text-xl">{{ item.title }}</h3>
                          <p class="mt-1 text-sm leading-6 text-ink/60 whitespace-pre-wrap">
                            {{ item.description || '這個項目沒有補充說明。' }}
                          </p>
                        </div>
                      </div>
                      <div class="flex flex-col items-start gap-2 sm:items-end">
                        <p class="text-sm text-gold">{{ currency(item.price) }}</p>
                        <button class="ghost-button !py-1.5" @click="toggleItemVisibility(item.id)">
                          {{ item.isActive ? '暫停上架' : '重新上架' }}
                        </button>
                        <button class="ghost-button !py-1.5" @click="handleEditShopItem(item)">編輯</button>
                        <button class="ghost-button !py-1.5 text-red-500/70 hover:!bg-red-50" @click="handleDeleteShopItem(item.id)">
                          刪除
                        </button>
                      </div>
                    </div>
                  </article>

                  <div v-if="!filteredMyItems.length" class="soft-card rounded-[24px] px-4 py-5 text-sm text-ink/55">
                    目前沒有符合這個分類的項目。
                  </div>
                </div>

                <div v-else-if="shopSubView === 'wish'" class="space-y-5">
                  <div class="flex items-center justify-between">
                    <p class="text-sm text-ink/55">想要的東西放這裡(づ> v <)づ♡</p>
                    <button 
                      class="ghost-button !py-2 !px-3 text-xs" 
                      @click="isWishFormExpanded = !isWishFormExpanded"
                    >
                      <Plus v-if="!isWishFormExpanded" class="h-3.5 w-3.5" />
                      <ChevronUp v-else class="h-3.5 w-3.5" />
                      <span>{{ isWishFormExpanded ? '收起表單' : '新增願望' }}</span>
                    </button>
                  </div>

                  <!-- 新增許願表單 (可折疊) -->
                  <transition name="fade">
                    <article v-if="isWishFormExpanded" class="soft-card rounded-[24px] px-5 py-5 space-y-4">
                      <h3 class="font-serif text-xl">新增一個願望</h3>
                      <label class="field">
                        <span>我想要...</span>
                        <input v-model="wishForm.title" type="text" placeholder="例如：和你一起看星星" />
                      </label>
                      <label class="field">
                        <span>說明</span>
                        <textarea v-model="wishForm.description" rows="2" placeholder="多說一點也可以 (≧▽≦)/" />
                      </label>
                      <label class="field">
                        <span>相簿 (可選)</span>
                        <input ref="wishImageInput" type="file" accept="image/*" @change="handleWishImageChange" />
                      </label>
                      <div v-if="wishImagePreview" class="transparent-preview mt-2 rounded-[18px] p-2">
                        <img :src="wishImagePreview" class="h-40 w-full rounded-[14px] object-contain" alt="願望圖片" />
                        <div class="mt-2 flex justify-end">
                          <button class="ghost-button !py-1.5 text-xs" @click="removeWishImage">移除圖片</button>
                        </div>
                      </div>
                      <div class="flex justify-end">
                        <button class="primary-button" @click="handleAddWish">放入許願池 ♥</button>
                      </div>
                    </article>
                  </transition>

                  <!-- 願望列表 -->
                  <div class="space-y-6">
                    <div v-if="state.coupleId" class="space-y-3">
                      <div class="flex items-center gap-2 px-1">
                        <Sparkles class="h-4 w-4 text-gold" />
                        <h3 class="font-serif text-lg text-ink/80">{{ profileMap.partner.name }} 許的願</h3>
                      </div>
                      <div v-if="partnerWishes.length" class="grid gap-3">
                        <div v-for="item in partnerWishes" :key="item.id" class="soft-card rounded-[24px] px-4 py-4">
                          <div v-if="item.imageUrl" class="mb-3 cursor-zoom-in overflow-hidden rounded-[18px] bg-black/5" @click="selectedImageUrl = item.imageUrl">
                            <img :src="item.imageUrl" class="max-h-[300px] w-full object-contain" alt="願望圖片" />
                          </div>
                          <div class="flex items-start justify-between gap-3">
                            <div class="flex-1">
                              <h3 class="font-serif text-xl">{{ item.title }}</h3>
                              <p class="mt-1 text-sm leading-6 text-ink/60 whitespace-pre-wrap">{{ item.description }}</p>
                            </div>
                            <div class="min-w-[120px] text-right">
                              <button class="primary-button !py-2 !text-xs" @click="handleGrantWish(item)">
                                立即實現
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                      <div v-else class="soft-card rounded-[24px] px-4 py-5 text-sm text-ink/55 text-center">
                        對方還沒許願喔 ♥
                      </div>
                    </div>

                    <!-- 我許的願 -->
                    <div v-if="myWishes.length" class="space-y-3">
                      <div class="flex items-center gap-2 px-1">
                        <Plus class="h-4 w-4 text-ink/40" />
                        <h3 class="font-serif text-lg text-ink/80">我許的願</h3>
                      </div>
                      <div class="grid gap-3">
                        <div v-for="item in myWishes" :key="item.id" class="soft-card rounded-[24px] px-4 py-4 opacity-85">
                          <div v-if="item.imageUrl" class="mb-3 cursor-zoom-in overflow-hidden rounded-[18px] bg-black/5" @click="selectedImageUrl = item.imageUrl">
                            <img :src="item.imageUrl" class="max-h-[300px] w-full object-contain" alt="願望圖片" />
                          </div>
                          <div class="flex items-start justify-between gap-3">
                            <div>
                              <h3 class="font-serif text-xl">{{ item.title }}</h3>
                              <p class="mt-1 text-sm leading-6 text-ink/60 whitespace-pre-wrap">{{ item.description }}</p>
                            </div>
                            <button class="ghost-button !py-1.5 text-red-500/70 hover:!bg-red-50" @click="handleDeleteShopItem(item.id)">
                              刪除
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div v-if="!wishItems.length" class="soft-card rounded-[24px] px-4 py-5 text-sm text-ink/55 text-center">
                      願望池還是空的，先丟個願望吧 ♥
                    </div>
                  </div>
                </div>

                <div v-else class="grid gap-4">
                  <p v-if="editingShopItemId" class="text-sm text-ink/55">編輯模式：修改後按下「儲存變更」即可更新。</p>
                  <p v-else class="text-sm text-ink/55">建立新的商城項目（或從願望上架）。</p>
                  <label class="field">
                    <span>名稱</span>
                    <input v-model="shopForm.title" type="text" placeholder="例如：看電影" />
                  </label>
                  <label class="field">
                    <span>描述</span>
                    <textarea v-model="shopForm.description" rows="3" placeholder="說明一下這份禮物會怎麼實現。例如:我請你看電影(/≧▽≦)/" />
                  </label>

                  <label class="field field-inline">
                    <span>是否為商品</span>
                    <button
                      type="button"
                      class="relative inline-flex h-6 w-11 items-center rounded-full transition"
                      :class="shopForm.isProduct ? 'bg-gold' : 'bg-ink/20'"
                      @click="shopForm.isProduct = !shopForm.isProduct"
                    >
                      <span
                        class="inline-block h-4 w-4 transform rounded-full bg-white shadow transition"
                        :class="shopForm.isProduct ? 'translate-x-6' : 'translate-x-1'"
                      />
                    </button>
                  </label>

                  <div class="grid gap-4 sm:grid-cols-3">
                    <label v-if="!shopForm.isProduct" class="field">
                      <span>金幣</span>
                      <input v-model.number="shopForm.price" type="number" min="0" />
                    </label>
                    <label v-else class="field">
                      <span>現實價格</span>
                      <input v-model.number="shopForm.realPrice" type="number" min="0" step="0.01" />
                    </label>
                    <label v-if="shopForm.isProduct" class="field">
                      <span>所需金幣（× 15）</span>
                      <input
                        :value="shopCoinQuote"
                        type="number"
                        disabled
                        class="cursor-not-allowed !bg-black/5 !text-ink/55 opacity-85"
                      />
                    </label>
                    <div class="field">
                      <span>分類</span>
                      <div v-if="state.tags.length > 0" class="mb-2 flex flex-wrap gap-2">
                        <button
                          v-for="tag in state.tags"
                          :key="tag"
                          type="button"
                          @click="shopForm.category = tag"
                          class="rounded-full border border-ink/10 px-3 py-1 text-xs text-ink/70 transition hover:bg-ink/5"
                          :class="{ 'bg-ink/10 text-ink border-transparent font-medium': shopForm.category === tag }"
                        >
                          {{ tag }}
                        </button>
                      </div>
                      <input v-model="shopForm.category" type="text" placeholder="輸入或選擇分類名稱" />
                    </div>
                    <label class="field field-inline">
                      <span>隱藏項目</span>
                      <button
                        type="button"
                        class="relative inline-flex h-6 w-11 items-center rounded-full transition"
                        :class="shopForm.isHidden ? 'bg-gold' : 'bg-ink/20'"
                        @click="shopForm.isHidden = !shopForm.isHidden"
                      >
                        <span
                          class="inline-block h-4 w-4 transform rounded-full bg-white shadow transition"
                          :class="shopForm.isHidden ? 'translate-x-6' : 'translate-x-1'"
                        />
                      </button>
                    </label>
                  </div>

                  <div class="grid gap-4 sm:grid-cols-2">
                    <label class="field">
                      <span>商品照片 (可選)</span>
                      <input ref="shopImageInput" type="file" accept="image/*" @change="handleShopImageChange" />
                    </label>
                    <div v-if="shopImagePreview" class="transparent-preview rounded-[20px] p-2">
                      <img :src="shopImagePreview" class="h-24 w-full rounded-[16px] object-contain" alt="預覽" />
                      <div class="mt-2 flex justify-end">
                        <button class="ghost-button !py-1.5 text-xs" @click="removeShopImage">移除圖片</button>
                      </div>
                    </div>
                  </div>

                  <div class="mt-2 flex flex-wrap justify-end gap-2">
                    <button
                      v-if="editingShopItemId || currentWishId"
                      type="button"
                      class="ghost-button"
                      :disabled="isBusy"
                      @click="cancelShopDraft"
                    >
                      取消
                    </button>
                    <button class="primary-button" :disabled="isBusy" @click="handleCreateShopItem">
                      {{ editingShopItemId ? '儲存變更' : '新增項目' }}
                    </button>
                  </div>
                </div>
              </article>
            </section>

            <section v-else-if="activeView === 'ledger'" key="ledger" class="space-y-4">
              <article class="glass-panel rounded-[28px] px-5 py-5">
                <div class="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                  <div>
                    <p class="panel-eyebrow">金庫</p>
                    <h2 class="font-serif text-2xl">錢錢錢錢錢 ! ! !</h2>
                  </div>
                  <SectionTabs v-model="ledgerSubView" :items="ledgerSections" />
                </div>

                <div v-if="ledgerSubView === 'overview'" class="grid gap-4 sm:grid-cols-2">
                  <div class="soft-card rounded-[24px] px-4 py-4">
                    <PersonChip :profile="profileMap.self" size="md" :subtitle="profileMap.self.title" />
                    <p class="mt-3 font-serif text-4xl">{{ balances.self }}</p>
                    <p class="mt-2 text-sm text-ink/55">目前持有金幣</p>
                  </div>
                  <div class="soft-card rounded-[24px] px-4 py-4">
                    <PersonChip :profile="profileMap.partner" size="md" :subtitle="profileMap.partner.title" />
                    <p class="mt-3 font-serif text-4xl">{{ balances.partner }}</p>
                    <p class="mt-2 text-sm text-ink/55">目前持有金幣</p>
                  </div>
                </div>

                <div v-else class="space-y-3">
                  <article
                    v-for="entry in recentLedger"
                    :key="entry.id"
                    class="soft-card flex items-center justify-between rounded-[24px] px-4 py-4"
                  >
                    <div class="space-y-2">
                      <PersonChip :profile="personById(entry.userId)" subtitle="金幣異動" />
                      <div>
                        <h3 class="mt-1 font-serif text-lg">{{ formatEntryDescription(entry.description) }}</h3>
                        <p class="mt-1 text-xs text-ink/45">{{ formatDateTime(entry.createdAt) }}</p>
                      </div>
                    </div>
                    <p :class="entry.amount > 0 ? 'text-sage' : 'text-ink'" class="text-sm">
                      {{ entry.amount > 0 ? '+' : '' }}{{ entry.amount }}
                    </p>
                  </article>
                </div>
              </article>
            </section>

            <section v-else key="settings" class="space-y-4">
              <article class="glass-panel rounded-[28px] px-5 py-5">
                <div class="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                  <div>
                    <p class="panel-eyebrow">設定</p>
                    <h2 class="font-serif text-2xl">自訂</h2>
                    <p class="mt-2 text-sm text-ink/60">設定個人資料、頭像、通知與外觀。</p>
                  </div>
                  <SectionTabs v-model="settingsSubView" :items="settingsSections" />
                </div>

                <div v-if="settingsSubView === 'account'" class="space-y-4">
                  <article class="soft-card rounded-[24px] px-4 py-4">
                    <div class="mb-4 flex items-start justify-between gap-4">
                      <div>
                        <p class="text-xs uppercase tracking-[0.2em] text-ink/45">帳號狀態</p>
                        <h3 class="mt-2 font-serif text-xl">目前帳號</h3>
                      </div>
                      <Cloud class="h-4 w-4 text-ink/40" />
                    </div>

                    <div v-if="!isSupabaseEnabled" class="space-y-3 text-sm leading-6 text-ink/65">
                      <p>目前為本機測試模式。請在環境變數設定 Supabase 即可開啟正式連線。</p>
                    </div>

                    <div v-else-if="isAuthenticated" class="space-y-4">
                      <div class="soft-card rounded-[20px] px-4 py-4">
                        <p class="text-xs uppercase tracking-[0.18em] text-ink/45">電子信箱</p>
                        <p class="mt-2 text-sm text-ink/72">{{ user?.email }}</p>
                      </div>
                      <button class="ghost-button w-full text-red-500/80 hover:bg-red-50" @click="signOutNow">
                        <LogOut class="h-4 w-4" />
                        <span>登出帳號</span>
                      </button>
                      <button class="ghost-button w-full text-red-500/80 hover:bg-red-50" @click="deleteAccountNow">
                        <span>註銷帳號</span>
                      </button>
                    </div>
                  </article>
                </div>

                <div v-else-if="settingsSubView === 'profile'" class="space-y-4">
                  <article class="soft-card rounded-[24px] px-4 py-4 max-w-xl mx-auto">
                    <div class="mb-4">
                      <p class="text-xs uppercase tracking-[0.2em] text-ink/45">你的資料</p>
                      <h3 class="mt-2 font-serif text-xl">頭像與暱稱</h3>
                    </div>
                    <div class="space-y-4">
                      <PersonChip :profile="profileMap.self" size="md" />
                      <div class="field">
                        <span>頭像</span>
                        <input ref="avatarInput" type="file" accept="image/*" @change="handleAvatarChange('self', $event)" />
                      </div>
                      <button
                        v-if="profileMap.self.avatarUrl"
                        class="ghost-button w-fit !py-1.5 text-red-500/70 hover:!bg-red-50"
                        @click="removeAvatar"
                      >
                        移除頭像
                      </button>
                      <label class="field">
                        <span>暱稱</span>
                        <input v-model="selfDraft.nickname" type="text" />
                      </label>
                      <div class="flex justify-end">
                        <button class="primary-button" :disabled="isBusy" @click="saveProfileDraft('self')">儲存</button>
                      </div>
                    </div>
                  </article>
                </div>
                <div v-else-if="settingsSubView === 'pairing'" class="space-y-4">
                  <article class="soft-card rounded-[24px] px-4 py-4">
                    <div class="mb-4">
                      <p class="text-xs uppercase tracking-[0.2em] text-ink/45">連線資訊</p>
                      <h3 class="mt-2 font-serif text-xl">與對方的綁定狀態</h3>
                    </div>
                    <div class="grid gap-4 sm:grid-cols-2">
                      <div class="rounded-[20px] border border-white/45 bg-white/45 px-4 py-4">
                        <p class="text-xs uppercase tracking-[0.18em] text-ink/45">你的邀請碼</p>
                        <p class="mt-3 font-serif text-2xl tracking-wider">{{ state.binding.inviteCode || '尚未產生' }}</p>
                        <button v-if="!state.binding.inviteCode" class="mt-3 ghost-button text-xs" @click="handleGenerateInvite">產生邀請碼</button>
                        <p class="mt-2 text-xs text-ink/45">把這個號碼給對方，就能在雲端連結彼此。</p>
                      </div>
                      <div class="rounded-[20px] border border-white/45 bg-white/45 px-4 py-4">
                        <p class="text-xs uppercase tracking-[0.18em] text-ink/45">當前狀態</p>
                        <p class="mt-3 font-serif text-2xl">
                          {{ state.coupleId ? '已成功連網' : '等待連線中' }}
                        </p>
                        <div v-if="state.coupleId" class="mt-2 flex items-center gap-2">
                           <PersonChip :profile="profileMap.partner" size="xs" />
                           <span class="text-xs text-ink/55">已與對方建立連線</span>
                        </div>
                        <p v-else class="mt-2 text-xs text-ink/45">輸入對方的邀請碼即可開始雙人旅程。</p>
                      </div>
                    </div>
                  </article>
                </div>

                <div v-else-if="settingsSubView === 'tags'" class="space-y-4">
                  <article class="soft-card rounded-[24px] px-5 py-5">
                    <div class="mb-5">
                      <p class="text-xs uppercase tracking-[0.2em] text-ink/45">標籤管理</p>
                      <h3 class="mt-2 font-serif text-xl">管理快速選取的標籤</h3>
                      <p class="mt-2 text-xs text-ink/45">商品分類會自動加入；你也可以主動新增。點擊標籤名稱可以重新命名，× 可刪除。</p>
                    </div>

                    <!-- 主動新增 -->
                    <div class="mb-5 flex items-center gap-2">
                      <div class="relative flex-1">
                        <Tag class="absolute left-3.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-ink/35" />
                        <input
                          v-model="newTagInput"
                          type="text"
                          placeholder="輸入新標籤名稱..."
                          class="w-full rounded-full border border-white/50 bg-white/55 py-2.5 pl-9 pr-4 text-sm text-ink outline-none transition placeholder:text-ink/35 focus:border-gold/50 focus:bg-white/80"
                          @keydown.enter.prevent="handleAddTag"
                        />
                      </div>
                      <button
                        class="shrink-0 rounded-full bg-ink px-4 py-2.5 text-sm text-white font-medium transition hover:bg-ink/80 active:scale-95 disabled:opacity-50"
                        :disabled="!newTagInput.trim() || isBusy"
                        @click="handleAddTag"
                      >
                        新增
                      </button>
                    </div>

                    <!-- 標籤列表 -->
                    <div v-if="state.tags.length === 0" class="rounded-[20px] border border-dashed border-ink/15 py-8 text-center text-sm text-ink/40">
                      尚無任何標籤，輸入上方的名稱來新增第一個。
                    </div>
                    <div v-else class="flex flex-wrap gap-2">
                      <div
                        v-for="tag in state.tags"
                        :key="tag"
                        class="group inline-flex items-center rounded-[14px] border border-ink/10 bg-white/60 pl-3.5 pr-3.5 py-1.5 transition-all duration-300 hover:border-ink/20 hover:bg-white/80 hover:shadow-sm focus-within:border-ink/30 focus-within:bg-white focus-within:shadow-sm hover:pr-2 focus-within:pr-2"
                      >
                        <!-- contenteditable: 寬度自動跟隨文字 -->
                        <span
                          contenteditable="true"
                          @blur="(e) => { const t = (e.target as HTMLElement).textContent?.trim(); if (t && t !== tag) handleRenameTag(tag, t); else (e.target as HTMLElement).textContent = tag }"
                          @keydown.enter.prevent="(e) => (e.target as HTMLElement).blur()"
                          @keydown.escape.prevent="(e) => { (e.target as HTMLElement).textContent = tag; (e.target as HTMLElement).blur() }"
                          class="cursor-text whitespace-nowrap text-sm text-ink/70 outline-none focus:text-ink transition-colors"
                          v-text="tag"
                        />
                        <!-- 叉叉按鈕：動態寬度與透明度 -->
                        <div class="flex w-0 overflow-hidden opacity-0 transition-all duration-300 ease-out group-hover:w-5 group-hover:ml-1.5 group-hover:opacity-100 group-focus-within:w-5 group-focus-within:ml-1.5 group-focus-within:opacity-100">
                          <button
                            @mousedown.prevent
                            @click="handleDeleteTag(tag)"
                            class="shrink-0 rounded-full p-0.5 text-ink/35 transition-colors hover:!text-red-400 hover:bg-red-50"
                          >
                            <X class="h-3 w-3" stroke-width="2.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </article>
                </div>

                <div v-else-if="settingsSubView === 'notifications'" class="space-y-4">
                  <article class="soft-card rounded-[24px] px-4 py-4">
                    <div class="mb-5 flex items-start justify-between gap-4">
                      <div>
                        <p class="text-xs uppercase tracking-[0.2em] text-ink/45">通知</p>
                        <h3 class="mt-2 font-serif text-xl">應用外推播通知</h3>
                        <p class="mt-2 text-sm leading-6 text-ink/55">ZC 會使用系統通知顯示懸浮提醒、通知中心與鎖定畫面訊息。</p>
                      </div>
                      <BellRing class="h-5 w-5 text-ink/40" />
                    </div>

                    <div class="rounded-[22px] border border-white/45 bg-white/45 px-4 py-4">
                      <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                        <div class="space-y-2">
                          <div class="flex flex-wrap items-center gap-2">
                            <p class="text-xs uppercase tracking-[0.18em] text-ink/45">系統權限</p>
                            <span class="rounded-full border px-2.5 py-1 text-xs" :class="notificationStatusClass">
                              {{ notificationPermissionLabel }}
                            </span>
                          </div>
                          <p class="font-serif text-lg">{{ state.notifications.enabled ? '通知已開啟' : '通知未開啟' }}</p>
                          <p class="text-sm leading-6 text-ink/55">{{ notificationPlatformHint }}</p>
                          <p class="text-xs text-ink/55">是否以橫幅或鎖定畫面方式顯示，會受手機／瀏覽器系統通知樣式設定影響。</p>
                        </div>

                        <div class="flex shrink-0 flex-wrap gap-2">
                          <button class="ghost-button" :disabled="notificationPermission === 'unsupported'" @click="handleNotificationMasterToggle">
                            <span>{{ notificationMasterButtonLabel }}</span>
                          </button>
                          <button v-if="notificationsActive" class="primary-button" @click="sendTestNotification">
                            <span>測試通知</span>
                          </button>
                        </div>
                      </div>
                    </div>

                    <transition name="fade">
                      <div v-if="notificationsActive" class="mt-5 space-y-5">
                        <!-- 磁吸式分段導覽列 (具備物理引擎) -->
                        <div class="flex justify-center px-1">
                          <div 
                            ref="notifyNavContainerRef"
                            class="relative flex w-full max-w-[320px] rounded-[24px] bg-white/30 p-1.5 backdrop-blur-sm border border-white/60 overflow-hidden touch-none select-none"
                            @mousedown="handleNotifyNavStart"
                            @touchstart="handleNotifyNavStart"
                          >
                            <!-- 磁吸滑動指示器 (球球) -->
                            <div 
                              class="absolute top-1.5 bottom-1.5 z-0 bg-[#D0D0D0]/20 rounded-[20px] shadow-sm border border-white/60"
                              :style="notifyIndicatorStyle"
                            ></div>
                            
                            <button
                              v-for="(tab, index) in notificationActorTabs"
                              :key="tab.key"
                              class="relative z-10 flex-1 py-2.5 text-sm font-medium transition-all duration-300"
                              :class="notificationTab === tab.key ? 'text-ink' : 'text-ink/40'"
                              :style="getNotifyIconStyle(index)"
                              @click="notificationTab = tab.key"
                            >
                              {{ tab.label }}
                            </button>
                          </div>
                        </div>

                        <transition name="page-fade" mode="out-in">
                          <div :key="notificationTab" class="space-y-3">
                            <article
                              v-for="group in notificationGroups.filter(g => g.key === notificationTab)"
                              :key="group.key"
                              class="space-y-3"
                            >
                              <div class="px-1">
                                <p class="text-xs uppercase tracking-[0.2em] text-ink/35">{{ group.description }}</p>
                              </div>

                              <div
                                v-for="item in group.items"
                                :key="item.key"
                                class="overflow-hidden rounded-[24px] border border-white/45 bg-white/45 transition-all duration-300"
                                :class="expandedNotificationItems.has(item.key) ? 'shadow-sm' : ''"
                              >
                                <!-- Header: Label + Toggle -->
                                <div 
                                  class="flex items-center justify-between gap-4 px-4 py-4 cursor-pointer select-none"
                                  @click="toggleNotificationItem(item.key)"
                                >
                                  <div class="flex items-center gap-3">
                                    <div 
                                      class="flex h-8 w-8 items-center justify-center rounded-full bg-ink/5 transition-transform duration-300"
                                      :class="{ 'rotate-180': expandedNotificationItems.has(item.key) }"
                                    >
                                      <ChevronDown class="h-4 w-4 text-ink/40" />
                                    </div>
                                    <div>
                                      <p class="text-sm font-medium text-ink/80">{{ item.label }}</p>
                                      <p class="text-xs text-ink/50">{{ state.notifications.events[item.key] ? '已啟用' : '已停用' }}</p>
                                    </div>
                                  </div>

                                  <button
                                    class="inline-flex h-9 items-center rounded-full border px-4 text-xs font-semibold transition-colors duration-300"
                                    :class="state.notifications.events[item.key] ? 'border-sage/50 bg-sage/10 text-sage' : 'border-white/70 bg-white/80 text-ink/70'"
                                    type="button"
                                    @click.stop="setNotificationPreference(item.key, !state.notifications.events[item.key])"
                                  >
                                    {{ state.notifications.events[item.key] ? '✓' : '✕' }}
                                  </button>
                                </div>

                                <!-- Collapsible Body: Description -->
                                <transition
                                  name="collapse"
                                  @enter="(el: any) => { el.style.height = el.scrollHeight + 'px' }"
                                  @leave="(el: any) => { el.style.height = '0px' }"
                                >
                                  <div v-if="expandedNotificationItems.has(item.key)" class="overflow-hidden transition-[height] duration-300 ease-in-out">
                                    <div class="pb-4 pr-4">
                                      <div class="ml-11 rounded-[16px] bg-black/5 px-4 py-3">
                                        <p class="text-xs leading-5 text-ink/55">{{ item.description }}</p>
                                      </div>
                                    </div>
                                  </div>
                                </transition>
                              </div>
                            </article>
                          </div>
                        </transition>
                      </div>
                    </transition>
                  </article>
                </div>

                <div v-else-if="settingsSubView === 'appearance'" class="space-y-4">
                  <article class="soft-card rounded-[24px] px-4 py-4">
                    <div class="mb-4">
                      <p class="text-xs uppercase tracking-[0.2em] text-ink/45">視覺細節</p>
                      <h3 class="mt-2 font-serif text-xl">讓畫面更接近你想要的節奏</h3>
                    </div>
                    <div class="space-y-6">
                      <div>
                        <div class="mb-2 flex items-baseline justify-between">
                          <p class="text-sm text-ink/55">版面密度</p>
                          <span class="text-xs text-ink/35">
                            {{ state.appearance.density === 'airy' ? '圓角大、間距寬' : '圓角小、更緊湊' }}
                          </span>
                        </div>
                        <div class="flex flex-wrap gap-2">
                          <button class="segmented-button" :class="{ 'segmented-active': state.appearance.density === 'airy' }" @click="setDensity('airy')">
                            寬鬆
                          </button>
                          <button class="segmented-button" :class="{ 'segmented-active': state.appearance.density === 'compact' }" @click="setDensity('compact')">
                            緊湊
                          </button>
                        </div>
                      </div>
                      <div>
                        <div class="mb-2 flex items-baseline justify-between">
                          <p class="text-sm text-ink/55">動態節奏</p>
                          <span class="text-xs text-ink/35">
                            {{ state.appearance.motion === 'soft' ? '過渡順滑有動感' : '無動畫即時切換' }}
                          </span>
                        </div>
                        <div class="flex flex-wrap gap-2">
                          <button class="segmented-button" :class="{ 'segmented-active': state.appearance.motion === 'soft' }" @click="setMotion('soft')">
                            柔和
                          </button>
                          <button class="segmented-button" :class="{ 'segmented-active': state.appearance.motion === 'still' }" @click="setMotion('still')">
                            安靜
                          </button>
                        </div>
                      </div>
                      <div>
                        <div class="mb-2 flex items-baseline justify-between">
                          <p class="text-sm text-ink/55">玻璃強度</p>
                          <span class="text-xs text-ink/35">
                            {{ state.appearance.glass === 'luminous' ? '面板更透亮、飽和度高' : '面板偏霧、更收斂' }}
                          </span>
                        </div>
                        <div class="flex flex-wrap gap-2">
                          <button class="segmented-button" :class="{ 'segmented-active': state.appearance.glass === 'luminous' }" @click="setGlass('luminous')">
                            明亮
                          </button>
                          <button class="segmented-button" :class="{ 'segmented-active': state.appearance.glass === 'muted' }" @click="setGlass('muted')">
                            收斂
                          </button>
                        </div>
                      </div>
                      <!-- 即時預覽示意 -->
                      <div class="rounded-[20px] border border-white/45 bg-white/35 px-4 py-4">
                        <p class="mb-3 text-xs uppercase tracking-[0.2em] text-ink/40">即時預覽</p>
                        <div class="flex flex-wrap items-center gap-3">
                          <div class="glass-panel rounded-[20px] px-4 py-3 text-sm text-ink/70">面板樣式</div>
                          <div class="soft-card rounded-[20px] px-4 py-3 text-sm text-ink/70">卡片樣式</div>
                          <button class="primary-button">主要按鈕</button>
                          <button class="ghost-button">次要按鈕</button>
                        </div>
                      </div>
                    </div>
                  </article>
                </div>

                <div v-else class="space-y-4">
                  <article class="soft-card rounded-[24px] px-4 py-4">
                    <div class="mb-4">
                      <p class="text-xs uppercase tracking-[0.2em] text-ink/45">空間狀態</p>
                      <h3 class="mt-2 font-serif text-xl">雲端連線資訊</h3>
                    </div>
                    <div class="space-y-3">
                      <div class="rounded-[20px] border border-white/45 bg-white/45 px-4 py-4">
                        <p class="text-xs uppercase tracking-[0.18em] text-ink/45">Supabase 連線</p>
                        <p class="mt-2 font-serif text-xl">{{ isSupabaseEnabled ? '✓ 已連接上雲端' : '✗ 未設定環境變數' }}</p>
                        <p class="mt-1 text-sm text-ink/55">{{ isSupabaseEnabled ? '你的資料正在雲端同步。' : '請設定 VITE_SUPABASE_URL 與 VITE_SUPABASE_ANON_KEY。' }}</p>
                      </div>
                      <div class="rounded-[20px] border border-white/45 bg-white/45 px-4 py-4">
                        <p class="text-xs uppercase tracking-[0.18em] text-ink/45">雙人空間</p>
                        <p class="mt-2 font-serif text-xl">{{ state.coupleId ? '✓ 已加入空間' : '尚未加入空間' }}</p>
                        <p v-if="state.coupleId" class="mt-1 text-xs text-ink/45 break-all">ID: {{ state.coupleId }}</p>
                        <p v-else class="mt-1 text-sm text-ink/55">請先建立或加入雙人空間。</p>
                      </div>
                    </div>
                  </article>

                  <article class="soft-card rounded-[24px] px-4 py-4 border-red-100/50">
                    <div class="mb-4">
                      <p class="text-xs uppercase tracking-[0.2em] text-ink/45">危險區域</p>
                      <h3 class="mt-2 font-serif text-xl">徹底刪除雲端與本地資料</h3>
                      <p class="mt-1 text-sm text-ink/55">這會刪除目前空間的所有資料（任務、商城、金幣等），且無法復原。</p>
                    </div>
                    <div class="flex flex-col gap-3">
                      <button class="ghost-button !text-red-500 !border-red-200 hover:!bg-red-50" @click="handleDestroySpace">
                        <LogOut class="h-4 w-4" />
                        <span>徹底刪除整個雙人空間</span>
                      </button>
                    </div>
                  </article>
                </div>
              </article>
            </section>
          </transition>
        </main>

        <nav class="fixed inset-x-0 bottom-4 z-30 mx-auto flex max-w-xl justify-center px-4">
          <div 
            ref="navContainerRef"
            class="glass-panel relative flex w-full items-center justify-between !overflow-hidden rounded-[28px] px-2 py-2 sm:px-3 sm:py-3 touch-none select-none"
            @mousedown="handleNavStart"
            @touchstart="handleNavStart"
          >
            <!-- 磁吸滑動指示器 -->
            <div 
              class="nav-indicator absolute bottom-2 top-2 z-[-1] bg-white/80 shadow-sm border border-white/60"
              :style="indicatorStyle"
              :class="state.appearance.density === 'compact' ? 'rounded-[14px]' : 'rounded-[20px]'"
            ></div>

            <button
              v-for="(item, index) in navigation"
              :key="item.key"
              class="nav-button relative z-10"
              :class="{ 'nav-button-active': activeView === item.key }"
              @click="switchMainView(item.key)"
            >
              <component 
                :is="item.icon" 
                class="h-4 w-4 flex-shrink-0 transition-all duration-150" 
                :style="getIconStyle(index)"
              />
              <span class="truncate" :style="{ opacity: activeView === item.key ? 1 : 0.7 }">{{ item.label }}</span>
            </button>
          </div>
        </nav>
      </template>
    </div>
  </div>

  <!-- 圖片大圖檢視 -->
  <transition name="fade">
    <div v-if="selectedImageUrl" class="fixed inset-0 z-[100] flex items-center justify-center bg-ink/90 p-4" @click="selectedImageUrl = null">
      <button class="absolute right-6 top-6 rounded-full bg-white/10 p-2 text-white hover:bg-white/20">
        <X class="h-6 w-6" />
      </button>
      <img :src="selectedImageUrl" class="max-h-full max-w-full rounded-lg shadow-2xl transition-transform duration-300" @click.stop />
    </div>
  </transition>

  <ConfirmModal
    :show="confirmModal.show"
    :title="confirmModal.title"
    :message="confirmModal.message"
    :confirm-text="confirmModal.confirmText"
    :variant="confirmModal.variant"
    :confirm-disabled="isSubmitConfirmWithRatings && !isSubmitRatingsComplete"
    @confirm="confirmModal.onConfirm"
    @cancel="confirmModal.show = false; isSubmitConfirmWithRatings = false"
  >
    <div v-if="isSubmitConfirmWithRatings" class="space-y-4">
      <div class="rounded-[20px] border border-white/40 bg-white/55 px-4 py-4">
        <p class="text-sm text-ink/70">請為這次任務打分（1～5）</p>
        <p class="mt-1 text-xs text-ink/45">(～￣▽￣)～</p>
      </div>

      <div class="space-y-3">
        <div class="flex items-center justify-between gap-3">
          <p class="text-sm text-ink/70">時間（精力成本）</p>
          <div class="flex items-center gap-1">
            <button
              v-for="n in 5"
              :key="`t-${n}`"
              type="button"
              class="rounded-md p-1 transition hover:bg-gold/10"
              @click="setStarRating('time', n)"
            >
              <Star
                class="h-5 w-5"
                :class="n <= taskSubmitRatings.time ? 'text-gold' : 'text-ink/20'"
                :fill="n <= taskSubmitRatings.time ? 'currentColor' : 'none'"
              />
            </button>
          </div>
        </div>

        <div class="flex items-center justify-between gap-3">
          <p class="text-sm text-ink/70">難度（用腦程度）</p>
          <div class="flex items-center gap-1">
            <button
              v-for="n in 5"
              :key="`d-${n}`"
              type="button"
              class="rounded-md p-1 transition hover:bg-gold/10"
              @click="setStarRating('difficulty', n)"
            >
              <Star
                class="h-5 w-5"
                :class="n <= taskSubmitRatings.difficulty ? 'text-gold' : 'text-ink/20'"
                :fill="n <= taskSubmitRatings.difficulty ? 'currentColor' : 'none'"
              />
            </button>
          </div>
        </div>

        <div class="flex items-center justify-between gap-3">
          <p class="text-sm text-ink/70">喜好程度</p>
          <div class="flex items-center gap-1">
            <button
              v-for="n in 5"
              :key="`a-${n}`"
              type="button"
              class="rounded-md p-1 transition hover:bg-gold/10"
              @click="setStarRating('avoidance', n)"
            >
              <Star
                class="h-5 w-5"
                :class="n <= taskSubmitRatings.avoidance ? 'text-gold' : 'text-ink/20'"
                :fill="n <= taskSubmitRatings.avoidance ? 'currentColor' : 'none'"
              />
            </button>
          </div>
        </div>
      </div>
    </div>
  </ConfirmModal>

  <ConfirmModal
    :show="noticeModal.show"
    :title="noticeModal.title"
    :message="noticeModal.message"
    :confirm-text="noticeModal.confirmText"
    :variant="noticeModal.variant"
    hide-cancel
    @confirm="noticeModal.show = false"
    @cancel="noticeModal.show = false"
  />

  <CouponTicket
    v-if="selectedRedemptionId && state.redemptions.find(r => r.id === selectedRedemptionId)"
    :redemption="state.redemptions.find(r => r.id === selectedRedemptionId)!"
    :item="state.shopItems.find(i => i.id === state.redemptions.find(r => r.id === selectedRedemptionId)!.shopItemId)!"
    :redeemer="personById(state.redemptions.find(r => r.id === selectedRedemptionId)!.redeemerId)"
    :provider="personById(state.redemptions.find(r => r.id === selectedRedemptionId)!.creatorId)"
    @close="selectedRedemptionId = null"
  />

  <RedemptionScanner
    v-if="scannerRedemptionId && state.redemptions.find(r => r.id === scannerRedemptionId)"
    :redemption="state.redemptions.find(r => r.id === scannerRedemptionId)!"
    :item="state.shopItems.find(i => i.id === state.redemptions.find(r => r.id === scannerRedemptionId)!.shopItemId)!"
    :busy="isBusy"
    @close="scannerRedemptionId = null"
    @matched="handleRedemptionScanMatched"
  />

  <template v-if="isAuthenticated && !state.isInitializing && !authLoading">
    <GiftPopup 
      v-if="currentGift"
      :key="currentGift.storageKey"
      :target-date="currentGift.targetDate"
      :title="currentGift.title"
      :description="currentGift.description"
      :coins="currentGift.coins"
      :storage-key="currentGift.storageKey"
      @claim="handleGiftClaim"
    />
  </template>
</template>

<style>
.main-content-blur {
  filter: blur(12px) brightness(0.9) saturate(1.2);
  transform: scale(0.98);
  pointer-events: none;
  user-select: none;
}

/* 確保所有玻璃面板在模糊背景下依然清晰 */
.main-content-blur .glass-panel {
  backdrop-filter: none !important;
}

/* 全域隱藏滾動條但保留功能 */
*::-webkit-scrollbar {
  display: none !important;
}

* {
  -ms-overflow-style: none !important; /* IE and Edge */
  scrollbar-width: none !important; /* Firefox */
}

/* 確保輸入框與文字域也能正常捲動但隱藏條 */
input, textarea {
  scrollbar-width: none !important;
}

/* 列表動畫 */
.list-move,
.list-enter-active,
.list-leave-active {
  transition: all 0.5s cubic-bezier(0.55, 0, 0.1, 1);
}

.list-enter-from,
.list-leave-to {
  opacity: 0;
  transform: scale(0.5);
}
</style>
