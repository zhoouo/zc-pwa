<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import {
  ArchiveRestore,
  ArrowLeftRight,
  CheckCheck,
  Cloud,
  Coins,
  Gift,
  Home,
  LibraryBig,
  LockKeyhole,
  LogOut,
  Plus,
  ScrollText,
  Settings2,
  Sparkles
} from 'lucide-vue-next'

import PersonChip from './components/PersonChip.vue'
import SectionTabs from './components/SectionTabs.vue'
import DatePicker from './components/DatePicker.vue'
import CustomSelect from './components/CustomSelect.vue'
import { useCoupleApp } from './composables/useCoupleApp'
import { useSupabaseAuth } from './composables/useSupabaseAuth'
import type {
  DensityMode,
  GlassMode,
  MotionMode,
  Profile,
  SetupForm,
  UserId
} from './types'

type ViewKey = 'home' | 'tasks' | 'shop' | 'ledger' | 'settings'
type TaskSubView = 'assigned' | 'review' | 'created' | 'new'
type ShopSubView = 'browse' | 'orders' | 'mine' | 'new'
type LedgerSubView = 'overview' | 'history'
type SettingsSubView = 'account' | 'profile' | 'pairing' | 'appearance' | 'space'

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
} = useCoupleApp()

const {
  errorMessage: authErrorMessage,
  isAuthenticated,
  isSupabaseEnabled,
  loading: authLoading,
  metadata,
  signIn,
  signOut,
  signUp,
  updateMetadata,
  uploadAvatar,
  user
} = useSupabaseAuth()

const activeView = ref<ViewKey>('home')
const taskSubView = ref<TaskSubView>('assigned')
const shopSubView = ref<ShopSubView>('browse')
const ledgerSubView = ref<LedgerSubView>('overview')
const settingsSubView = ref<SettingsSubView>('account')
const accountMode = ref<'signin' | 'signup'>('signin')
const hiddenTapCount = ref(0)
const hiddenUnlocked = ref(false)
const rejectionDraft = ref<Record<string, string>>({})
const redemptionNote = ref<Record<string, string>>({})
const banner = ref('目前先以可用原型與正式骨架並行。你可以直接操作，也能隨時接上 Supabase。')
const isBusy = ref(false)

const setupForm = reactive<SetupForm>({
  selfName: '',
  partnerName: '',
  selfTitle: '今天的你',
  partnerTitle: '另一半'
})

const taskForm = reactive({
  title: '',
  description: '',
  coinReward: 30,
  dueAt: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
  assigneeId: 'partner' as UserId
})

const shopForm = reactive({
  title: '',
  description: '',
  price: 120,
  category: '日常',
  isHidden: false
})

const accountForm = reactive({
  email: '',
  password: '',
  nickname: ''
})

const selfDraft = reactive({
  nickname: '',
  title: ''
})

const partnerDraft = reactive({
  nickname: '',
  title: ''
})

watch(
  () => [profileMap.value.self.name, profileMap.value.self.title, profileMap.value.partner.name, profileMap.value.partner.title],
  () => {
    selfDraft.nickname = profileMap.value.self.name
    selfDraft.title = profileMap.value.self.title
    partnerDraft.nickname = profileMap.value.partner.name
    partnerDraft.title = profileMap.value.partner.title
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
      name: value.nickname ?? profileMap.value.self.name,
      title: value.title ?? profileMap.value.self.title
    })
  },
  { immediate: true }
)

const actionableTasks = computed(() =>
  tasksAssignedToMe.value.filter((task) => task.status === 'open' || task.status === 'rejected')
)

const homeTaskCount = computed(() => actionableTasks.value.length)

const homeRedemptionCount = computed(
  () => myRedemptions.value.filter((entry) => entry.creatorId === state.currentUserId && entry.status !== 'fulfilled')
    .length
)

const visibleShopItems = computed(() =>
  availableShopItems.value.filter((item) => hiddenUnlocked.value || !item.isHidden)
)

const hiddenShopItems = computed(() => availableShopItems.value.filter((item) => item.isHidden))

const incomingRedemptions = computed(() =>
  myRedemptions.value.filter((entry) => entry.creatorId === state.currentUserId)
)

const outgoingRedemptions = computed(() =>
  myRedemptions.value.filter((entry) => entry.redeemerId === state.currentUserId)
)

const taskSections = computed(() => [
  { key: 'assigned', label: '交給我', count: actionableTasks.value.length },
  { key: 'review', label: '待審核', count: reviewQueue.value.length },
  { key: 'created', label: '我建立的', count: tasksCreatedByMe.value.length },
  { key: 'new', label: '新增任務' }
])

const shopSections = computed(() => [
  { key: 'browse', label: '可兌換', count: visibleShopItems.value.length },
  { key: 'orders', label: '兌換單', count: incomingRedemptions.value.length + outgoingRedemptions.value.length },
  { key: 'mine', label: '我的項目', count: myShopItems.value.length },
  { key: 'new', label: '新增項目' }
])

const ledgerSections = [
  { key: 'overview', label: '餘額總覽' },
  { key: 'history', label: '流水明細' }
]

const settingsSections = computed(() => [
  { key: 'account', label: '帳號' },
  { key: 'profile', label: '頭像與暱稱' },
  { key: 'pairing', label: '綁定資訊' },
  { key: 'appearance', label: '視覺細節' },
  { key: 'space', label: '空間狀態' }
])

const navigation = [
  { key: 'home', label: '首頁', icon: Home },
  { key: 'tasks', label: '任務', icon: LibraryBig },
  { key: 'shop', label: '商城', icon: Gift },
  { key: 'ledger', label: '金庫', icon: ScrollText },
  { key: 'settings', label: '設定', icon: Settings2 }
] as const

const assigneeOptions = computed(() => [
  { label: profileMap.value.self.name, value: 'self' },
  { label: profileMap.value.partner.name, value: 'partner' }
])

const appShellClasses = computed(() => [
  state.appearance.density === 'compact' ? 'density-compact' : 'density-airy',
  state.appearance.motion === 'still' ? 'motion-still' : 'motion-soft',
  state.appearance.glass === 'muted' ? 'glass-muted' : 'glass-luminous'
])

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
    submitted: 'bg-gold/15 text-gold',
    approved: 'bg-sage/20 text-sage',
    rejected: 'bg-ink/10 text-ink',
    cancelled: 'bg-ink/8 text-ink/60'
  })[status] ?? 'bg-white/60 text-ink/75'

const getTaskLabel = (status: string) =>
  ({
    open: '待完成',
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

const setupApp = () => {
  if (!setupForm.selfName.trim() || !setupForm.partnerName.trim()) {
    banner.value = '先把你們的名字填好，我再替你把空間整理起來。'
    return
  }

  completeSetup(setupForm)
  banner.value = '雙人空間已經建立。你現在可以直接開始發任務和寫商城。'
}

const switchMainView = (view: ViewKey) => {
  activeView.value = view
}

const handleCreateTask = () => {
  if (!taskForm.title.trim()) {
    banner.value = '任務至少要有標題。'
    return
  }

  createTask(taskForm)
  taskForm.title = ''
  taskForm.description = ''
  taskForm.coinReward = 30
  taskForm.dueAt = new Date(Date.now() + 86400000).toISOString().slice(0, 10)
  taskSubView.value = 'created'
  banner.value = '任務已送進清單，接下來就等對方完成。'
}

const handleCreateShopItem = () => {
  if (!shopForm.title.trim()) {
    banner.value = '商城項目需要一個名字。'
    return
  }

  createShopItem(shopForm)
  shopForm.title = ''
  shopForm.description = ''
  shopForm.price = 120
  shopForm.category = '日常'
  shopForm.isHidden = false
  shopSubView.value = 'mine'
  banner.value = '新的兌換項目已經放進商城。'
}

const handleRedeem = (itemId: string) => {
  const result = redeemItem(itemId, redemptionNote.value[itemId] ?? '')
  if (!result.ok) {
    banner.value = result.reason
    return
  }

  redemptionNote.value[itemId] = ''
  shopSubView.value = 'orders'
  banner.value = '已建立兌換單，也替你把金幣扣好了。'
}

const handleHiddenTap = () => {
  hiddenTapCount.value += 1
  if (hiddenTapCount.value >= 6) {
    hiddenUnlocked.value = true
    banner.value = '隱藏商城已開啟。'
  }
}

const togglePerspective = (userId: UserId) => {
  switchPerspective(userId)
  banner.value = `目前視角已切換成 ${profileMap.value[userId].name}。`
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
  banner.value = '頭像已更新。'

  if (isSupabaseEnabled && isAuthenticated.value && userId === 'self') {
    isBusy.value = true
    const result = await uploadAvatar(file)
    isBusy.value = false
    if (result.error) {
      banner.value = `頭像已先更新在本機，但雲端上傳失敗：${result.error}`
      return
    }
    banner.value = '頭像已同步到帳號。'
  }

  target.value = ''
}

const saveProfileDraft = async (userId: UserId) => {
  const draft = userId === 'self' ? selfDraft : partnerDraft
  updateProfile(userId, {
    name: draft.nickname,
    title: draft.title
  })

  if (isSupabaseEnabled && isAuthenticated.value && userId === 'self') {
    isBusy.value = true
    const result = await updateMetadata({
      nickname: draft.nickname,
      title: draft.title
    })
    isBusy.value = false
    if (result.error) {
      banner.value = `本機已更新，但帳號資料同步失敗：${result.error}`
      return
    }
  }

  banner.value = '人物資料已更新。'
}

const handleAccountSubmit = async () => {
  if (!accountForm.email.trim() || !accountForm.password.trim()) {
    banner.value = '請把 Email 和密碼填完整。'
    return
  }

  isBusy.value = true
  const result =
    accountMode.value === 'signin'
      ? await signIn(accountForm.email, accountForm.password)
      : await signUp(accountForm.email, accountForm.password, accountForm.nickname || selfDraft.nickname)
  isBusy.value = false

  if (result.error) {
    banner.value = result.error
    return
  }

  banner.value =
    accountMode.value === 'signin'
      ? '帳號已登入，之後就能接真正的綁定與同步。'
      : '帳號已建立，若你的專案有開啟 Email 驗證，請先到信箱完成確認。'
}

const signOutNow = async () => {
  await signOut()
  banner.value = '已登出。'
}

const setDensity = (value: DensityMode) => updateAppearance({ density: value })
const setMotion = (value: MotionMode) => updateAppearance({ motion: value })
const setGlass = (value: GlassMode) => updateAppearance({ glass: value })

const personById = (userId: UserId): Profile => profileMap.value[userId]
</script>

<template>
  <div class="min-h-screen bg-paper bg-mesh text-ink" :class="appShellClasses">
    <div class="mx-auto flex min-h-screen max-w-7xl flex-col overflow-x-hidden px-4 pb-28 pt-4 sm:px-6 lg:px-8">
      <header class="glass-panel mb-4 flex flex-col gap-4 rounded-[28px] px-5 py-5 sm:flex-row sm:items-end sm:justify-between">
        <div class="space-y-2">
          <div class="flex items-center gap-3">
            <p class="text-xs uppercase tracking-[0.24em] text-ink/45">Private ritual</p>
            <span class="status-pill bg-white/55 text-ink/60">{{ connectionLabel }}</span>
          </div>
          <div>
            <h1 class="font-serif text-3xl leading-tight sm:text-[2.6rem]">Couple Ledger</h1>
            <p class="mt-1 max-w-2xl text-sm leading-6 text-ink/65">
              把請託、完成、審核與兌換，整理成一個安靜而清楚的循環。
            </p>
          </div>
        </div>

        <div class="grid grid-cols-1 gap-3 sm:min-w-[360px] sm:grid-cols-2">
          <div class="soft-card rounded-[24px] px-4 py-3">
            <PersonChip :profile="currentUser" size="md" :subtitle="currentUser.title" />
            <p class="mt-3 text-sm text-gold">{{ currency(balances[currentUser.id]) }}</p>
          </div>
          <div class="soft-card rounded-[24px] px-4 py-3">
            <PersonChip :profile="partnerUser" size="md" :subtitle="partnerUser.title" />
            <p class="mt-3 text-sm text-gold">{{ currency(balances[partnerUser.id]) }}</p>
          </div>
        </div>
      </header>

      <div class="mb-4 flex items-center gap-3 rounded-[22px] border border-white/45 bg-white/40 px-4 py-3 backdrop-blur-xl">
        <Sparkles class="h-4 w-4 text-gold" />
        <p class="text-sm text-ink/70">{{ banner }}</p>
      </div>

      <section
        v-if="!state.isSetupComplete"
        class="glass-panel mx-auto mt-6 w-full max-w-3xl rounded-[32px] px-5 py-6 sm:px-8 sm:py-8"
      >
        <div class="mb-6 space-y-2 text-center">
          <p class="text-xs uppercase tracking-[0.24em] text-ink/45">Setup</p>
          <h2 class="font-serif text-3xl">先替你們留好位置</h2>
          <p class="mx-auto max-w-xl text-sm leading-6 text-ink/65">
            這一版先用本機資料建立你們的專屬空間，同時保留正式帳號與 Supabase 的接點。
          </p>
        </div>

        <div class="grid gap-4 sm:grid-cols-2">
          <label class="field">
            <span>你的名字</span>
            <input v-model="setupForm.selfName" type="text" placeholder="例如：阿佑" />
          </label>
          <label class="field">
            <span>對方的名字</span>
            <input v-model="setupForm.partnerName" type="text" placeholder="例如：小晴" />
          </label>
          <label class="field">
            <span>你的稱呼</span>
            <input v-model="setupForm.selfTitle" type="text" placeholder="今天的你" />
          </label>
          <label class="field">
            <span>對方的稱呼</span>
            <input v-model="setupForm.partnerTitle" type="text" placeholder="另一半" />
          </label>
        </div>

        <div class="mt-6 flex justify-end">
          <button class="primary-button" @click="setupApp">建立雙人空間</button>
        </div>
      </section>

      <template v-else>
        <main :class="activeView === 'home' ? 'grid flex-1 gap-4 lg:grid-cols-[1.15fr,0.85fr]' : 'flex-1'" class="min-w-0 overflow-x-hidden">
          <section v-if="activeView === 'home'" class="contents">
            <div class="space-y-4">
              <div class="grid gap-4 sm:grid-cols-3">
                <article class="glass-panel rounded-[28px] px-5 py-5">
                  <div class="flex items-center justify-between">
                    <p class="panel-eyebrow">待你完成</p>
                    <LibraryBig class="h-4 w-4 text-ink/40" />
                  </div>
                  <p class="mt-4 font-serif text-4xl">{{ homeTaskCount }}</p>
                  <p class="mt-2 text-sm text-ink/60">包含待完成與被退回的任務。</p>
                </article>

                <article class="glass-panel rounded-[28px] px-5 py-5">
                  <div class="flex items-center justify-between">
                    <p class="panel-eyebrow">等你審核</p>
                    <CheckCheck class="h-4 w-4 text-ink/40" />
                  </div>
                  <p class="mt-4 font-serif text-4xl">{{ reviewQueue.length }}</p>
                  <p class="mt-2 text-sm text-ink/60">對方做完後，會先來到這裡。</p>
                </article>

                <article class="glass-panel rounded-[28px] px-5 py-5">
                  <div class="flex items-center justify-between">
                    <p class="panel-eyebrow">待履行兌換</p>
                    <Gift class="h-4 w-4 text-ink/40" />
                  </div>
                  <p class="mt-4 font-serif text-4xl">{{ homeRedemptionCount }}</p>
                  <p class="mt-2 text-sm text-ink/60">需要你後續兌現的承諾。</p>
                </article>
              </div>

              <article class="glass-panel rounded-[28px] px-5 py-5">
                <div class="mb-5 flex items-end justify-between">
                  <div>
                    <p class="panel-eyebrow">今日節奏</p>
                    <h2 class="font-serif text-2xl">你眼前最重要的事</h2>
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
                        <span class="text-xs text-ink/45">截止 {{ formatDate(task.dueAt) }}</span>
                      </div>
                      <PersonChip :profile="personById(task.creatorId)" subtitle="發起人" />
                      <div>
                        <h3 class="font-serif text-xl">{{ task.title }}</h3>
                        <p class="mt-1 text-sm leading-6 text-ink/60">
                          {{ task.description || '這筆任務還沒有補充說明。' }}
                        </p>
                      </div>
                    </div>
                    <div class="flex items-center gap-3">
                      <p class="text-sm text-gold">{{ currency(task.coinReward) }}</p>
                      <button
                        v-if="task.status === 'open' || task.status === 'rejected'"
                        class="primary-button"
                        @click="submitTask(task.id)"
                      >
                        送出審核
                      </button>
                    </div>
                  </article>
                </div>
              </article>
            </div>

            <div class="space-y-4">
              <article class="glass-panel rounded-[28px] px-5 py-5">
                <div class="mb-5 flex items-end justify-between">
                  <div>
                    <p class="panel-eyebrow">最新流水</p>
                    <h2 class="font-serif text-2xl">金幣的來去</h2>
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
                        <h3 class="font-serif text-lg">{{ entry.description }}</h3>
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
                  <button class="ghost-button" @click="switchMainView('shop')">前往商城</button>
                </div>

                <div class="space-y-3">
                  <article
                    v-for="entry in myRedemptions.slice(0, 4)"
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
                      <span class="status-pill bg-white/60 text-ink/70">{{ getRedemptionLabel(entry.status) }}</span>
                    </div>
                    <p class="mt-3 text-sm text-ink/55">{{ entry.note || '沒有留下額外備註。' }}</p>
                  </article>
                </div>
              </article>
            </div>
          </section>

          <section v-else-if="activeView === 'tasks'" class="space-y-4">
            <article class="glass-panel rounded-[28px] px-5 py-5">
              <div class="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <p class="panel-eyebrow">任務</p>
                  <h2 class="font-serif text-2xl">把任務留在對的位置</h2>
                  <p class="mt-2 text-sm text-ink/60">發起、完成、審核各自待在自己的分區裡。</p>
                </div>
                <SectionTabs v-model="taskSubView" :items="taskSections" />
              </div>

              <div v-if="taskSubView === 'assigned'" class="space-y-3">
                <article v-for="task in tasksAssignedToMe" :key="task.id" class="soft-card rounded-[24px] px-4 py-4">
                  <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div class="space-y-3">
                      <div class="flex flex-wrap items-center gap-2">
                        <span class="status-pill" :class="getTaskTone(task.status)">{{ getTaskLabel(task.status) }}</span>
                        <span class="text-xs text-ink/45">截止 {{ formatDate(task.dueAt) }}</span>
                      </div>
                      <PersonChip :profile="personById(task.creatorId)" subtitle="發起人" />
                      <div>
                        <h3 class="font-serif text-xl">{{ task.title }}</h3>
                        <p class="mt-1 text-sm leading-6 text-ink/60">
                          {{ task.description || '這筆任務還沒有補充說明。' }}
                        </p>
                        <p v-if="task.rejectionNote" class="mt-3 text-sm text-ink/55">退回原因：{{ task.rejectionNote }}</p>
                      </div>
                    </div>
                    <div class="flex flex-col items-start gap-3 sm:items-end">
                      <p class="text-sm text-gold">{{ currency(task.coinReward) }}</p>
                      <button
                        v-if="task.status === 'open' || task.status === 'rejected'"
                        class="primary-button"
                        @click="submitTask(task.id)"
                      >
                        送出審核
                      </button>
                    </div>
                  </div>
                </article>

                <div v-if="!tasksAssignedToMe.length" class="soft-card rounded-[24px] px-4 py-5 text-sm text-ink/55">
                  目前沒有指派給你的任務。
                </div>
              </div>

              <div v-else-if="taskSubView === 'review'" class="space-y-3">
                <article v-for="task in reviewQueue" :key="task.id" class="soft-card rounded-[24px] px-4 py-4">
                  <div class="mb-3 flex items-center justify-between gap-3">
                    <div class="space-y-2">
                      <PersonChip :profile="personById(task.assigneeId)" subtitle="已送出審核" />
                      <h3 class="font-serif text-xl">{{ task.title }}</h3>
                    </div>
                    <p class="text-sm text-gold">{{ currency(task.coinReward) }}</p>
                  </div>
                  <p class="text-sm leading-6 text-ink/60">{{ task.description || '這筆任務還沒有補充說明。' }}</p>
                  <textarea
                    v-model="rejectionDraft[task.id]"
                    rows="2"
                    class="mt-4 w-full rounded-[20px] border border-white/45 bg-white/55 px-4 py-3 text-sm text-ink outline-none transition placeholder:text-ink/35 focus:border-gold/55 focus:bg-white/72"
                    placeholder="若要退回，可以留下一句補充。"
                  />
                  <div class="mt-4 flex flex-wrap justify-end gap-3">
                    <button class="ghost-button" @click="rejectTask(task.id, rejectionDraft[task.id] || '還差一點，再補一下。')">
                      退回
                    </button>
                    <button class="primary-button" @click="approveTask(task.id)">通過並發幣</button>
                  </div>
                </article>

                <div v-if="!reviewQueue.length" class="soft-card rounded-[24px] px-4 py-5 text-sm text-ink/55">
                  目前沒有待你審核的項目。
                </div>
              </div>

              <div v-else-if="taskSubView === 'created'" class="space-y-3">
                <article v-for="task in tasksCreatedByMe" :key="task.id" class="soft-card rounded-[24px] px-4 py-4">
                  <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div class="space-y-3">
                      <div class="flex items-center gap-2">
                        <span class="status-pill" :class="getTaskTone(task.status)">{{ getTaskLabel(task.status) }}</span>
                      </div>
                      <PersonChip :profile="personById(task.assigneeId)" subtitle="執行對象" />
                      <div>
                        <h3 class="font-serif text-xl">{{ task.title }}</h3>
                        <p class="mt-1 text-sm text-ink/60">{{ task.description || '這筆任務還沒有補充說明。' }}</p>
                      </div>
                    </div>
                    <p class="text-sm text-gold">{{ currency(task.coinReward) }}</p>
                  </div>
                </article>

                <div v-if="!tasksCreatedByMe.length" class="soft-card rounded-[24px] px-4 py-5 text-sm text-ink/55">
                  你還沒有建立任何任務。
                </div>
              </div>

              <div v-else class="grid gap-4">
                <label class="field">
                  <span>標題</span>
                  <input v-model="taskForm.title" type="text" placeholder="例如：明天的早餐由你決定" />
                </label>
                <label class="field">
                  <span>描述</span>
                  <textarea v-model="taskForm.description" rows="3" placeholder="寫得短一點也可以，只要讓對方明白就好。" />
                </label>
                <div class="grid gap-4 sm:grid-cols-3">
                  <label class="field">
                    <span>金幣</span>
                    <input v-model.number="taskForm.coinReward" type="number" min="1" />
                  </label>
                  <label class="field">
                    <span>截止日</span>
                    <DatePicker v-model="taskForm.dueAt" />
                  </label>
                  <label class="field">
                    <span>交給誰</span>
                    <CustomSelect 
                      v-model="taskForm.assigneeId" 
                      :options="assigneeOptions" 
                    />
                  </label>
                </div>

                <div class="mt-2 flex justify-end">
                  <button class="primary-button" @click="handleCreateTask">建立任務</button>
                </div>
              </div>
            </article>
          </section>

          <section v-else-if="activeView === 'shop'" class="space-y-4">
            <article class="glass-panel rounded-[28px] px-5 py-5">
              <div class="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <p class="panel-eyebrow">商城</p>
                  <button class="text-left" @click="handleHiddenTap">
                    <h2 class="font-serif text-2xl">把答應彼此的事放進來</h2>
                  </button>
                  <p class="mt-2 text-sm text-ink/60">每個項目都會把對應的人放在前面，不再只剩文字。</p>
                </div>
                <div class="flex flex-col items-start gap-3 lg:items-end">
                  <div class="flex items-center gap-2 text-xs text-ink/45">
                    <LockKeyhole class="h-4 w-4" />
                    <span>{{ hiddenUnlocked ? '隱藏區已開啟' : '有一個未說破的入口' }}</span>
                  </div>
                  <SectionTabs v-model="shopSubView" :items="shopSections" />
                </div>
              </div>

              <div v-if="shopSubView === 'browse'" class="space-y-3">
                <article v-for="item in visibleShopItems" :key="item.id" class="soft-card rounded-[24px] px-4 py-4">
                  <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div class="space-y-3">
                      <div class="mb-2 flex flex-wrap items-center gap-2">
                        <span class="status-pill bg-white/60 text-ink/70">{{ item.category }}</span>
                        <span v-if="item.isHidden" class="text-xs text-gold">隱藏項目</span>
                      </div>
                      <PersonChip :profile="personById(item.creatorId)" subtitle="提供者" />
                      <div>
                        <h3 class="font-serif text-xl">{{ item.title }}</h3>
                        <p class="mt-1 text-sm leading-6 text-ink/60">
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
                      <button class="primary-button w-full" @click="handleRedeem(item.id)">立即兌換</button>
                    </div>
                  </div>
                </article>

                <div v-if="hiddenUnlocked && hiddenShopItems.length" class="rounded-[24px] border border-gold/20 bg-gold/8 px-4 py-4">
                  <p class="text-sm text-gold">隱藏區已解鎖，特殊項目現在會一起顯示。</p>
                </div>

                <div v-if="!visibleShopItems.length" class="soft-card rounded-[24px] px-4 py-5 text-sm text-ink/55">
                  目前沒有可兌換的項目。
                </div>
              </div>

              <div v-else-if="shopSubView === 'orders'" class="space-y-4">
                <div>
                  <p class="mb-3 text-sm text-ink/45">等你履行的兌換</p>
                  <div class="space-y-3">
                    <article v-for="entry in incomingRedemptions" :key="entry.id" class="soft-card rounded-[24px] px-4 py-4">
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
                            <p class="mt-1 text-sm text-ink/60">{{ entry.note || '沒有補充說明。' }}</p>
                          </div>
                        </div>
                        <div class="flex flex-wrap gap-2">
                          <button class="ghost-button" @click="updateRedemptionStatus(entry.id, 'in_progress')">待履行</button>
                          <button class="primary-button" @click="updateRedemptionStatus(entry.id, 'fulfilled')">標記完成</button>
                        </div>
                      </div>
                    </article>
                  </div>
                </div>

                <div>
                  <p class="mb-3 text-sm text-ink/45">我送出的兌換</p>
                  <div class="space-y-3">
                    <article v-for="entry in outgoingRedemptions" :key="entry.id" class="soft-card rounded-[24px] px-4 py-4">
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
                            <p class="mt-1 text-sm text-ink/60">{{ entry.note || '沒有補充說明。' }}</p>
                          </div>
                        </div>
                        <p class="text-sm text-gold">{{ currency(entry.priceSnapshot) }}</p>
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
                <article v-for="item in myShopItems" :key="item.id" class="soft-card rounded-[24px] px-4 py-4">
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
                        <p class="mt-1 text-sm leading-6 text-ink/60">
                          {{ item.description || '這個項目沒有補充說明。' }}
                        </p>
                      </div>
                    </div>
                    <div class="flex flex-col items-start gap-3 sm:items-end">
                      <p class="text-sm text-gold">{{ currency(item.price) }}</p>
                      <button class="ghost-button" @click="toggleItemVisibility(item.id)">
                        {{ item.isActive ? '暫停上架' : '重新上架' }}
                      </button>
                    </div>
                  </div>
                </article>

                <div v-if="!myShopItems.length" class="soft-card rounded-[24px] px-4 py-5 text-sm text-ink/55">
                  你還沒有建立任何商城項目。
                </div>
              </div>

              <div v-else class="grid gap-4">
                <label class="field">
                  <span>名稱</span>
                  <input v-model="shopForm.title" type="text" placeholder="例如：散步一小時，路線由你決定" />
                </label>
                <label class="field">
                  <span>描述</span>
                  <textarea v-model="shopForm.description" rows="3" placeholder="說明一下這份兌換會怎麼被履行。" />
                </label>
                <div class="grid gap-4 sm:grid-cols-3">
                  <label class="field">
                    <span>價格</span>
                    <input v-model.number="shopForm.price" type="number" min="1" />
                  </label>
                  <label class="field">
                    <span>分類</span>
                    <input v-model="shopForm.category" type="text" />
                  </label>
                  <label class="field field-inline">
                    <span>隱藏項目</span>
                    <input v-model="shopForm.isHidden" type="checkbox" />
                  </label>
                </div>

                <div class="mt-2 flex justify-end">
                  <button class="primary-button" @click="handleCreateShopItem">新增項目</button>
                </div>
              </div>
            </article>
          </section>

          <section v-else-if="activeView === 'ledger'" class="space-y-4">
            <article class="glass-panel rounded-[28px] px-5 py-5">
              <div class="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <p class="panel-eyebrow">金庫</p>
                  <h2 class="font-serif text-2xl">把餘額與明細分開看</h2>
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
                      <h3 class="mt-1 font-serif text-lg">{{ entry.description }}</h3>
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

          <section v-else class="space-y-4">
            <article class="glass-panel rounded-[28px] px-5 py-5">
              <div class="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <p class="panel-eyebrow">設定</p>
                  <h2 class="font-serif text-2xl">正式設定頁骨架</h2>
                  <p class="mt-2 text-sm text-ink/60">帳號、頭像、綁定與視覺細節會各自獨立。</p>
                </div>
                <SectionTabs v-model="settingsSubView" :items="settingsSections" />
              </div>

              <div v-if="settingsSubView === 'account'" class="space-y-4">
                <article class="soft-card rounded-[24px] px-4 py-4">
                  <div class="mb-4 flex items-start justify-between gap-4">
                    <div>
                      <p class="text-xs uppercase tracking-[0.2em] text-ink/45">帳號狀態</p>
                      <h3 class="mt-2 font-serif text-xl">註冊、登入與登出</h3>
                    </div>
                    <Cloud class="h-4 w-4 text-ink/40" />
                  </div>

                  <div v-if="!isSupabaseEnabled" class="space-y-3 text-sm leading-6 text-ink/65">
                    <p>目前尚未填入 Supabase 環境變數，所以這個部署版本會先以 Demo 模式運作。</p>
                    <p>只要補上 `VITE_SUPABASE_URL` 與 `VITE_SUPABASE_ANON_KEY`，這裡就會變成正式帳號流程。</p>
                  </div>

                  <div v-else-if="isAuthenticated" class="space-y-4">
                    <div class="soft-card rounded-[20px] px-4 py-4">
                      <p class="text-xs uppercase tracking-[0.18em] text-ink/45">目前帳號</p>
                      <p class="mt-2 text-sm text-ink/72">{{ user?.email }}</p>
                    </div>
                    <button class="ghost-button" @click="signOutNow">
                      <LogOut class="h-4 w-4" />
                      <span>登出</span>
                    </button>
                  </div>

                  <div v-else class="space-y-4">
                    <div class="flex flex-wrap gap-2">
                      <button
                        class="segmented-button"
                        :class="{ 'segmented-active': accountMode === 'signin' }"
                        @click="accountMode = 'signin'"
                      >
                        登入
                      </button>
                      <button
                        class="segmented-button"
                        :class="{ 'segmented-active': accountMode === 'signup' }"
                        @click="accountMode = 'signup'"
                      >
                        註冊
                      </button>
                    </div>

                    <div class="grid gap-4">
                      <label class="field">
                        <span>Email</span>
                        <input v-model="accountForm.email" type="email" placeholder="you@example.com" />
                      </label>
                      <label v-if="accountMode === 'signup'" class="field">
                        <span>暱稱</span>
                        <input v-model="accountForm.nickname" type="text" placeholder="顯示在對方畫面上的名字" />
                      </label>
                      <label class="field">
                        <span>密碼</span>
                        <input v-model="accountForm.password" type="password" placeholder="至少 6 個字元" />
                      </label>
                    </div>

                    <p v-if="authErrorMessage" class="text-sm text-ink/60">{{ authErrorMessage }}</p>

                    <div class="flex justify-end">
                      <button class="primary-button" :disabled="isBusy" @click="handleAccountSubmit">
                        {{ accountMode === 'signin' ? '登入帳號' : '建立帳號' }}
                      </button>
                    </div>
                  </div>
                </article>
              </div>

              <div v-else-if="settingsSubView === 'profile'" class="space-y-4">
                <div class="grid gap-4 lg:grid-cols-2">
                  <article class="soft-card rounded-[24px] px-4 py-4">
                    <div class="mb-4">
                      <p class="text-xs uppercase tracking-[0.2em] text-ink/45">你的資料</p>
                      <h3 class="mt-2 font-serif text-xl">頭像與暱稱</h3>
                    </div>
                    <div class="space-y-4">
                      <PersonChip :profile="profileMap.self" size="md" :subtitle="profileMap.self.title" />
                      <div class="field">
                        <span>頭像</span>
                        <input type="file" accept="image/*" @change="handleAvatarChange('self', $event)" />
                      </div>
                      <label class="field">
                        <span>暱稱</span>
                        <input v-model="selfDraft.nickname" type="text" />
                      </label>
                      <label class="field">
                        <span>稱呼</span>
                        <input v-model="selfDraft.title" type="text" />
                      </label>
                      <div class="flex justify-end">
                        <button class="primary-button" :disabled="isBusy" @click="saveProfileDraft('self')">儲存</button>
                      </div>
                    </div>
                  </article>

                  <article class="soft-card rounded-[24px] px-4 py-4">
                    <div class="mb-4">
                      <p class="text-xs uppercase tracking-[0.2em] text-ink/45">對方資料</p>
                      <h3 class="mt-2 font-serif text-xl">畫面上的人物樣貌</h3>
                    </div>
                    <div class="space-y-4">
                      <PersonChip :profile="profileMap.partner" size="md" :subtitle="profileMap.partner.title" />
                      <div class="field">
                        <span>頭像</span>
                        <input type="file" accept="image/*" @change="handleAvatarChange('partner', $event)" />
                      </div>
                      <label class="field">
                        <span>暱稱</span>
                        <input v-model="partnerDraft.nickname" type="text" />
                      </label>
                      <label class="field">
                        <span>稱呼</span>
                        <input v-model="partnerDraft.title" type="text" />
                      </label>
                      <div class="flex justify-end">
                        <button class="primary-button" @click="saveProfileDraft('partner')">儲存</button>
                      </div>
                    </div>
                  </article>
                </div>
              </div>

              <div v-else-if="settingsSubView === 'pairing'" class="space-y-4">
                <article class="soft-card rounded-[24px] px-4 py-4">
                  <div class="mb-4">
                    <p class="text-xs uppercase tracking-[0.2em] text-ink/45">綁定資訊</p>
                    <h3 class="mt-2 font-serif text-xl">正式版會放在這裡</h3>
                  </div>
                  <div class="grid gap-4 sm:grid-cols-2">
                    <div class="rounded-[20px] border border-white/45 bg-white/45 px-4 py-4">
                      <p class="text-xs uppercase tracking-[0.18em] text-ink/45">邀請碼</p>
                      <p class="mt-3 font-serif text-2xl">{{ state.binding.inviteCode }}</p>
                      <p class="mt-2 text-sm text-ink/55">之後接上資料庫，這裡會變成真實可用的配對碼或邀請連結。</p>
                    </div>
                    <div class="rounded-[20px] border border-white/45 bg-white/45 px-4 py-4">
                      <p class="text-xs uppercase tracking-[0.18em] text-ink/45">綁定狀態</p>
                      <p class="mt-3 font-serif text-2xl">{{ state.binding.status === 'demo' ? 'Demo 模式' : state.binding.status }}</p>
                      <p class="mt-2 text-sm text-ink/55">正式版會顯示對方帳號、解除綁定流程與保護確認。</p>
                    </div>
                  </div>
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
                    <h3 class="mt-2 font-serif text-xl">關於這一版</h3>
                  </div>
                  <div class="space-y-3 text-sm leading-6 text-ink/65">
                    <p>目前版本是可以直接使用的 PWA，並保留了正式帳號與資料層的接點。</p>
                    <p>若未填 Supabase 環境變數，會以 Demo 模式運作；若填入後，帳號區與頭像同步就會啟用。</p>
                    <p>下一步我會把任務、商城與金幣資料也逐步接到雲端資料表上。</p>
                  </div>
                </article>

                <article class="soft-card rounded-[24px] px-4 py-4">
                  <div class="mb-4">
                    <p class="text-xs uppercase tracking-[0.2em] text-ink/45">視角切換</p>
                    <h3 class="mt-2 font-serif text-xl">原型模式下仍可切換你們兩個</h3>
                  </div>
                  <div class="flex flex-wrap gap-3">
                    <button
                      v-for="profile in state.profiles"
                      :key="profile.id"
                      class="segmented-button"
                      :class="{ 'segmented-active': profile.id === state.currentUserId }"
                      @click="togglePerspective(profile.id)"
                    >
                      <ArrowLeftRight class="h-4 w-4" />
                      <span>{{ profile.name }}</span>
                    </button>
                  </div>
                </article>

                <article class="soft-card rounded-[24px] px-4 py-4">
                  <div class="mb-4">
                    <p class="text-xs uppercase tracking-[0.2em] text-ink/45">重設</p>
                    <h3 class="mt-2 font-serif text-xl">重新開始一個新的雙人空間</h3>
                  </div>
                  <button class="ghost-button" @click="resetAll">
                    <ArchiveRestore class="h-4 w-4" />
                    <span>清除目前資料</span>
                  </button>
                </article>
              </div>
            </article>
          </section>
        </main>

        <nav class="fixed inset-x-0 bottom-4 z-30 mx-auto flex max-w-xl justify-center px-4">
          <div class="glass-panel flex w-full items-center justify-between overflow-hidden rounded-[28px] px-2 py-2 sm:px-3 sm:py-3">
            <button
              v-for="item in navigation"
              :key="item.key"
              class="nav-button"
              :class="{ 'nav-button-active': activeView === item.key }"
              @click="switchMainView(item.key)"
            >
              <component :is="item.icon" class="h-4 w-4 flex-shrink-0" />
              <span class="truncate">{{ item.label }}</span>
            </button>
          </div>
        </nav>
      </template>
    </div>
  </div>
</template>
