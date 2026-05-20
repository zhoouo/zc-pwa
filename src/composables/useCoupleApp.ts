import { computed, reactive, ref } from 'vue'
import type { RealtimeChannel } from '@supabase/supabase-js'

import { supabase } from '../lib/supabase'
import { notificationPreferenceKeys } from '../types'
import {
  getCurrentSubscription,
  isPushSupported,
  requestPushPermission,
  serializeSubscription,
  subscribeToPush,
  unsubscribeFromPush,
  type PushSubscriptionData
} from '../lib/pushNotifications'
import type {
  AppState,
  AppearanceSettings,
  NotificationPreferenceMap,
  NotificationSettings,
  RedemptionStatus,
  Task,
  TaskStatus,
  UserId
} from '../types'

const avatarTones: Record<UserId, string> = {
  self: 'from-[#f5ece1] via-[#e4d0b7] to-[#b28a5c]',
  partner: 'from-[#f3eee7] via-[#d8dccf] to-[#89907d]'
}

const defaultAppearance = (): AppearanceSettings => ({
  density: 'airy',
  motion: 'soft',
  glass: 'luminous'
})

const defaultNotifications = (): NotificationSettings => ({
  enabled: false,
  events: Object.fromEntries(notificationPreferenceKeys.map((key) => [key, true])) as NotificationPreferenceMap
})

const defaultState = (): AppState => ({
  isInitializing: false,
  isSetupComplete: false,
  coupleId: undefined,
  currentUserId: 'self',
  profiles: [
    { id: 'self', name: '我', title: '被最愛的鼻最愛的鼻', avatarUrl: null, avatarTone: avatarTones.self },
    { id: 'partner', name: '對方', title: '最愛的鼻', avatarUrl: null, avatarTone: avatarTones.partner }
  ],
  tasks: [],
  ledger: [],
  shopItems: [],
  redemptions: [],
  appearance: defaultAppearance(),
  notifications: defaultNotifications(),
  binding: {
    inviteCode: '',
    status: 'pending'
  },
  tags: []
})

const state = reactive<AppState>({
  ...defaultState(),
  isInitializing: true
})

let realtimeChannel: RealtimeChannel | null = null
let realtimeCoupleId = ''
let realtimePollInterval: number | null = null
let visibilityListenerAttached = false
const isTagLocked = ref(false)

const REALTIME_FALLBACK_POLL_MS = 22000

const disposeCoupleRealtime = () => {
  if (realtimePollInterval !== null) {
    window.clearInterval(realtimePollInterval)
    realtimePollInterval = null
  }
  if (supabase && realtimeChannel) {
    void supabase.removeChannel(realtimeChannel)
    realtimeChannel = null
  }
  realtimeCoupleId = ''
}

const isDensityMode = (value: unknown): value is AppearanceSettings['density'] =>
  value === 'airy' || value === 'compact'

const isMotionMode = (value: unknown): value is AppearanceSettings['motion'] =>
  value === 'soft' || value === 'still'

const isGlassMode = (value: unknown): value is AppearanceSettings['glass'] =>
  value === 'luminous' || value === 'muted'

const parseAppearance = (value: unknown): AppearanceSettings => {
  const fallback = defaultAppearance()
  if (!value || typeof value !== 'object') return fallback

  const settings = value as Partial<AppearanceSettings>
  return {
    density: isDensityMode(settings.density) ? settings.density : fallback.density,
    motion: isMotionMode(settings.motion) ? settings.motion : fallback.motion,
    glass: isGlassMode(settings.glass) ? settings.glass : fallback.glass
  }
}

const parseNotificationSettings = (value: unknown): NotificationSettings => {
  const fallback = defaultNotifications()
  if (!value || typeof value !== 'object') return fallback

  const raw = (value as { notifications?: Partial<NotificationSettings> }).notifications
  if (!raw || typeof raw !== 'object') return fallback

  const rawEvents = (raw.events && typeof raw.events === 'object' ? raw.events : {}) as Partial<NotificationPreferenceMap>
  const events = notificationPreferenceKeys.reduce((result, key) => {
    result[key] = typeof rawEvents[key] === 'boolean' ? rawEvents[key] : fallback.events[key]
    return result
  }, {} as NotificationPreferenceMap)

  return {
    enabled: raw.enabled === true,
    events
  }
}

type NotificationSettingsPatch = Partial<Omit<NotificationSettings, 'events'>> & {
  events?: Partial<NotificationPreferenceMap>
}

const mapUser = (dbUserId: string): UserId => {
  const selfProfile = state.profiles.find((profile) => profile.id === 'self')
  if (selfProfile?.realId === dbUserId) return 'self'
  return 'partner'
}

const unmapUser = (userId: UserId): string => {
  const profile = state.profiles.find((item) => item.id === userId)
  return profile?.realId || ''
}

const mapTask = (task: any): Task => ({
  id: task.id,
  title: task.title,
  description: task.description || '',
  coinReward: task.coin_reward,
  dueAt: task.due_at || '',
  status: task.status as TaskStatus,
  creatorId: mapUser(task.creator_id),
  assigneeId: mapUser(task.assignee_id),
  createdAt: task.created_at,
  updatedAt: task.updated_at,
  submittedAt: task.submitted_at || undefined,
  approvedAt: task.approved_at || undefined,
  rejectionNote: task.rejection_note || undefined,
  isRecurring: Boolean(task.is_recurring)
})

const byLatestActivity = (a: Task, b: Task) => {
  const aTime = new Date(a.approvedAt || a.submittedAt || a.updatedAt || a.createdAt).getTime()
  const bTime = new Date(b.approvedAt || b.submittedAt || b.updatedAt || b.createdAt).getTime()
  return bTime - aTime
}

const removeHostedShopImage = async (imageUrl: string | null | undefined) => {
  if (!supabase || !imageUrl) return
  const searchStr = '/public/shop/'
  const index = imageUrl.indexOf(searchStr)
  if (index === -1) return
  const path = imageUrl.substring(index + searchStr.length)
  await supabase.storage.from('shop').remove([path])
}

export const useCoupleApp = () => {
  const computeTaskReward = (base: number, ratings: { time: number; difficulty: number; avoidance: number }) => {
    const clamp = (v: number) => Math.min(5, Math.max(1, Math.round(v)))
    const t = clamp(ratings.time)
    const d = clamp(ratings.difficulty)
    const a = 6 - clamp(ratings.avoidance) // Reverse for preference: 5 stars = 1 point, 1 star = 5 points
    const avg = (t + d + a) / 3

    // 加權平均 + 封頂（此處三項等權重）
    // M_min=3, M_max=10
    const multiplier = 3 + ((avg - 1) / 4) * (10 - 3)
    const reward = Math.ceil(base * multiplier)
    return { reward, multiplier, ratings: { time: t, difficulty: d, avoidance: a } }
  }

  const currentUser = computed(() => state.profiles.find((profile) => profile.id === state.currentUserId)!)
  const partnerUser = computed(() => state.profiles.find((profile) => profile.id !== state.currentUserId)!)
  const profileMap = computed(
    () => Object.fromEntries(state.profiles.map((profile) => [profile.id, profile])) as Record<UserId, AppState['profiles'][number]>
  )

  const isHiddenRedemption = (redemptionId: string) => {
    const redemption = state.redemptions.find((entry) => entry.id === redemptionId)
    const item = state.shopItems.find((shopItem) => shopItem.id === redemption?.shopItemId)
    return Boolean(item?.isHidden)
  }

  const tasksAssignedToMe = computed(() =>
    state.tasks
      .filter((task) =>
        task.assigneeId === state.currentUserId &&
        task.status !== 'cancelled' &&
        task.status !== 'approved'
      )
      .sort(byLatestActivity)
  )

  const tasksCreatedByMe = computed(() =>
    state.tasks
      .filter((task) =>
        task.creatorId === state.currentUserId &&
        task.status !== 'submitted' &&
        task.status !== 'approved' &&
        task.status !== 'cancelled'
      )
      .sort(byLatestActivity)
  )

  const reviewQueue = computed(() =>
    state.tasks
      .filter((task) =>
        task.creatorId === state.currentUserId &&
        (task.status === 'submitted' || task.status === 'approved')
      )
      .sort(byLatestActivity)
  )

  const availableShopItems = computed(() =>
    state.shopItems
      .filter((item) => item.creatorId !== state.currentUserId && item.isActive && item.category !== '許願池')
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  )

  const myShopItems = computed(() =>
    state.shopItems
      .filter((item) => item.creatorId === state.currentUserId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  )

  const myRedemptions = computed(() =>
    state.redemptions
      .filter((entry) =>
        (entry.redeemerId === state.currentUserId || entry.creatorId === state.currentUserId) &&
        entry.status !== 'cancelled' &&
        entry.status !== 'fulfilled'
      )
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  )

  const balances = computed(() => {
    let self = 0
    let partner = 0
    for (const entry of state.ledger) {
      if (entry.userId === 'self') self += entry.amount
      else partner += entry.amount
    }
    return { self, partner }
  })

  const getBalance = (userId: UserId) => {
    return balances.value[userId]
  }

  const recentLedger = computed(() =>
    [...state.ledger]
      .filter((entry) => entry.sourceType !== 'redemption' || !isHiddenRedemption(entry.sourceId))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 16)
  )

  const fetchData = async (silent = false) => {
    if (!supabase) return

    if (!silent) state.isInitializing = true

    const {
      data: { session }
    } = await supabase.auth.getSession()

    if (!session?.user) {
      disposeCoupleRealtime()
      Object.assign(state, defaultState())
      state.isInitializing = false
      return
    }

    const myUid = session.user.id
    let coupleId = state.coupleId || undefined

    if (!coupleId || !silent) {
      const { data: memberships } = await supabase
        .from('couple_members')
        .select('couple_id')
        .eq('user_id', myUid)

      if (memberships?.length) {
        if (memberships.length === 1) {
          coupleId = memberships[0].couple_id
        } else {
          const { data: spaceStats } = await supabase
            .from('couple_members')
            .select('couple_id')
            .in('couple_id', memberships.map((membership) => membership.couple_id))

          const counts: Record<string, number> = {}
          spaceStats?.forEach((space) => {
            counts[space.couple_id] = (counts[space.couple_id] || 0) + 1
          })

          coupleId = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0]

          window.setTimeout(() => {
            const { cleanupOrphanSpaces } = useCoupleApp()
            void cleanupOrphanSpaces()
          }, 1000)
        }
      }
    }

    if (!coupleId) {
      disposeCoupleRealtime()
      Object.assign(state, { ...defaultState(), currentUserId: 'self' as const })
      const { data: myProfile } = await supabase.from('profiles').select('*').eq('id', myUid).maybeSingle()
      state.profiles[0].realId = myUid
      if (myProfile) {
        state.profiles[0].name = myProfile.nickname || '我'
        state.profiles[0].avatarUrl = myProfile.avatar_url || null
        state.appearance = parseAppearance(myProfile.appearance_settings)
        state.notifications = parseNotificationSettings(myProfile.appearance_settings)
      }

      const { data: inviteData } = await supabase
        .from('invite_codes')
        .select('code')
        .eq('created_by', myUid)
        .maybeSingle()
      if (inviteData) state.binding.inviteCode = inviteData.code

      state.isInitializing = false
      return
    }

    state.coupleId = coupleId
    state.isSetupComplete = !!coupleId
    state.binding.status = coupleId ? 'paired' : 'pending'
    
    if (!coupleId) {
      state.isInitializing = false
      return
    }

    // 僅在非靜態刷新時初始化標籤，避免輪詢時閃爍
    if (!silent) {
      state.tags = []
    }

    const { data: members } = await supabase.from('couple_members').select('user_id').eq('couple_id', coupleId)
    const partnerId = members?.find((member) => member.user_id !== myUid)?.user_id
    const userIds = members?.map((member) => member.user_id) || [myUid]
    const { data: profiles } = await supabase.from('profiles').select('*').in('id', userIds)

    if (profiles) {
      const myProfile = profiles.find((profile) => profile.id === myUid)
      const partnerProfile = partnerId ? profiles.find((profile) => profile.id === partnerId) : null

      state.profiles = [
        {
          id: 'self',
          realId: myUid,
          name: myProfile?.nickname || '我',
          title: myProfile?.title || '被最愛的鼻最愛的鼻',
          avatarUrl: myProfile?.avatar_url || null,
          avatarTone: avatarTones.self
        },
        {
          id: 'partner',
          realId: partnerId || undefined,
          name: partnerProfile?.nickname || '對方',
          title: partnerProfile?.title || '最愛的鼻',
          avatarUrl: partnerProfile?.avatar_url || null,
          avatarTone: avatarTones.partner
        }
      ]

      state.appearance = parseAppearance(myProfile?.appearance_settings)
      state.notifications = parseNotificationSettings(myProfile?.appearance_settings)
      
      // 嘗試獲取個人化標籤排序
      if (!isTagLocked.value) {
        try {
          const myOrderedTags = (myProfile as any)?.custom_tags
          if (Array.isArray(myOrderedTags)) {
            state.tags = myOrderedTags
          }
        } catch (e) {
          console.warn('無法讀取個人標籤排序，可能欄位尚未建立', e)
        }
      }
    }
    
    const [coupleRes, tasksRes, itemsRes, redemptionsRes, ledgerRes, inviteRes] = await Promise.all([
      supabase.from('couples').select('custom_tags').eq('id', coupleId).maybeSingle(),
      supabase
        .from('tasks')
        .select(
          'id,title,description,coin_reward,due_at,status,creator_id,assignee_id,created_at,updated_at,submitted_at,approved_at,rejection_note,is_recurring'
        )
        .eq('couple_id', coupleId),
      supabase
        .from('shop_items')
        .select('id,title,description,price,is_product,real_price,category,creator_id,is_active,is_hidden,image_url,created_at')
        .eq('couple_id', coupleId),
      supabase
        .from('redemptions')
        .select('id,shop_item_id,creator_id,redeemer_id,price_snapshot,status,note,created_at,updated_at')
        .eq('couple_id', coupleId),
      supabase
        .from('ledger_entries')
        .select('id,user_id,entry_type,amount,source_type,source_id,description,created_at')
        .eq('couple_id', coupleId),
      supabase.from('invite_codes').select('code').eq('created_by', myUid).maybeSingle()
    ])

    const sharedTags: string[] = (coupleRes.data?.custom_tags as string[] | null) ?? []
    if (!isTagLocked.value) {
      state.tags = Array.from(new Set([...state.tags, ...sharedTags]))
    }

    state.tasks = tasksRes.data?.map(mapTask) || []

    const dbItems = itemsRes.data || []
    state.shopItems = dbItems.map((item) => ({
      id: item.id,
      title: item.title,
      description: item.description || '',
      price: item.price,
      isProduct: Boolean(item.is_product),
      realPrice: item.real_price !== undefined ? item.real_price : null,
      category: item.category || '',
      creatorId: mapUser(item.creator_id),
      isActive: item.is_active,
      isHidden: item.is_hidden,
      imageUrl: item.image_url,
      createdAt: item.created_at
    }))

    // 合併現有商品分類到 tags（排除許願池、隱藏項目、空分類）
    const itemCats = dbItems
      .map((item) => (item.category || '').trim())
      .filter((c) => c && c !== '許願池')
    
    if (!isTagLocked.value) {
      const mergedTags = Array.from(new Set([...state.tags, ...itemCats]))
      
      // 只有當標籤數量真的增加時，才更新共享池，避免無窮迴圈
      const sharedTagsSnapshot = sharedTags
      
      // 檢查是否有「新發現」的標籤不在共享池中
      const hasNewTags = mergedTags.some((t) => !sharedTagsSnapshot.includes(t))
      
      if (hasNewTags) {
        state.tags = mergedTags
        void supabase.from('couples').update({ custom_tags: mergedTags }).eq('id', coupleId)
      } else if (!silent || state.tags.length === 0) {
        // 如果是初始讀取或是靜態重新整理，確保 state.tags 有資料
        state.tags = Array.from(new Set([...state.tags, ...sharedTagsSnapshot]))
      }
    }

    state.redemptions = redemptionsRes.data?.map((redemption) => ({
      id: redemption.id,
      shopItemId: redemption.shop_item_id,
      creatorDbId: redemption.creator_id,
      redeemerDbId: redemption.redeemer_id,
      creatorId: mapUser(redemption.creator_id),
      redeemerId: mapUser(redemption.redeemer_id),
      priceSnapshot: redemption.price_snapshot,
      status: redemption.status as RedemptionStatus,
      note: redemption.note || '',
      createdAt: redemption.created_at,
      updatedAt: redemption.updated_at
    })) || []

    state.ledger = ledgerRes.data?.map((entry) => ({
      id: entry.id,
      userId: mapUser(entry.user_id),
      entryType: entry.entry_type,
      amount: entry.amount,
      sourceType: entry.source_type,
      sourceId: entry.source_id,
      description: entry.description,
      createdAt: entry.created_at
    })) || []

    if (inviteRes.data) state.binding.inviteCode = inviteRes.data.code

    subscribeToChanges(coupleId)
    state.isInitializing = false
  }

  const attachVisibilityRefreshOnce = () => {
    if (typeof document === 'undefined' || visibilityListenerAttached) return
    visibilityListenerAttached = true
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && state.coupleId) void fetchData(true)
    })
  }

  const ensurePollFallback = () => {
    if (typeof window === 'undefined' || realtimePollInterval !== null || !state.coupleId) return
    realtimePollInterval = window.setInterval(() => {
      if (document.visibilityState !== 'visible' || !state.coupleId) return
      void fetchData(true)
    }, REALTIME_FALLBACK_POLL_MS)
  }

  const subscribeToChanges = (coupleId: string) => {
    if (!supabase) return
    if (realtimeChannel && realtimeCoupleId === coupleId) {
      ensurePollFallback()
      attachVisibilityRefreshOnce()
      return
    }

    disposeCoupleRealtime()

    const refresh = () => {
      void fetchData(true)
    }

    realtimeCoupleId = coupleId
    realtimeChannel = supabase
      .channel(`couple_changes_${coupleId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks', filter: `couple_id=eq.${coupleId}` }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shop_items', filter: `couple_id=eq.${coupleId}` }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'redemptions', filter: `couple_id=eq.${coupleId}` }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ledger_entries', filter: `couple_id=eq.${coupleId}` }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'couples', filter: `id=eq.${coupleId}` }, refresh)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles' }, (payload) => {
        const profile = payload.new as any
        const index = state.profiles.findIndex((entry) => entry.realId === profile.id)
        if (index === -1) return

        state.profiles[index].name = profile.nickname
        state.profiles[index].title = profile.title || state.profiles[index].title
        state.profiles[index].avatarUrl = profile.avatar_url

        if (state.profiles[index].id === 'self') {
          state.appearance = parseAppearance(profile.appearance_settings)
          state.notifications = parseNotificationSettings(profile.appearance_settings)
        }
      })
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          void fetchData(true)
        }
      })

    attachVisibilityRefreshOnce()
    ensurePollFallback()
  }

  const createSpace = async () => {
    if (!supabase) return { error: '未連線' }
    const myUid = state.profiles[0].realId
    if (!myUid) return { error: '未登入' }

    const { data: couple, error: coupleError } = await supabase.from('couples').insert({}).select().single()
    if (coupleError || !couple) return { error: coupleError?.message || '建立失敗' }

    await supabase.from('couple_members').insert({
      couple_id: couple.id,
      user_id: myUid,
      role: 'owner'
    })

    const code = `PAIR-${Math.random().toString(36).slice(2, 8).toUpperCase()}`
    await supabase.from('invite_codes').insert({
      created_by: myUid,
      code
    })

    await fetchData()
    return { error: null, code }
  }

  const joinSpace = async (code: string) => {
    if (!supabase) return { error: '未連線' }
    const myUid = state.profiles[0].realId
    if (!myUid) return { error: '未登入' }

    const { data: invite } = await supabase.from('invite_codes').select('*').eq('code', code.trim()).maybeSingle()
    if (!invite) return { error: '邀請碼無效或不存在' }

    const { data: partnerMember } = await supabase
      .from('couple_members')
      .select('couple_id')
      .eq('user_id', invite.created_by)
      .maybeSingle()
    if (!partnerMember) return { error: '建立者已離開空間' }

    const { count: memberCount } = await supabase
      .from('couple_members')
      .select('*', { count: 'exact', head: true })
      .eq('couple_id', partnerMember.couple_id)

    if (memberCount && memberCount >= 2) return { error: '這個空間已經額滿了（上限 2 人）。' }

    const { error } = await supabase.from('couple_members').insert({
      couple_id: partnerMember.couple_id,
      user_id: myUid,
      role: 'member'
    })

    if (error) return { error: error.message }

    await fetchData()
    return { error: null }
  }

  const switchPerspective = (userId: UserId) => {
    state.currentUserId = userId
  }

  const deleteSpace = async () => {
    if (!supabase || !state.coupleId) return

    try {
      const { data: items } = await supabase.from('shop_items').select('image_url').eq('couple_id', state.coupleId)
      const paths = (items || [])
        .map((item) => item.image_url)
        .filter((url): url is string => Boolean(url?.includes('/public/shop/')))
        .map((url) => url.substring(url.indexOf('/public/shop/') + '/public/shop/'.length))

      if (paths.length) await supabase.storage.from('shop').remove(paths)
    } catch (error) {
      console.error('Space cleanup error:', error)
    }

    const { error } = await supabase.from('couples').delete().eq('id', state.coupleId)
    if (!error) {
      Object.assign(state, defaultState())
      await fetchData()
    }
    return { error }
  }

  const persistUserPreferences = async () => {
    if (!supabase) return

    const dbUserId = unmapUser('self')
    if (!dbUserId) return

    await supabase
      .from('profiles')
      .update({
        appearance_settings: {
          ...state.appearance,
          notifications: state.notifications
        },
        updated_at: new Date().toISOString()
      })
      .eq('id', dbUserId)
  }

  const updateAppearance = async (patch: Partial<AppearanceSettings>) => {
    state.appearance = { ...state.appearance, ...patch }
    await persistUserPreferences()
  }

  const updateNotificationSettings = async (patch: NotificationSettingsPatch) => {
    state.notifications = {
      ...state.notifications,
      ...patch,
      events: patch.events ? { ...state.notifications.events, ...patch.events } : state.notifications.events
    }
    await persistUserPreferences()
  }

  const updateProfile = async (userId: UserId, patch: { avatarUrl?: null | string; name?: string }) => {
    if (!supabase) return
    const dbUserId = unmapUser(userId)
    if (!dbUserId) return

    const dbPatch: Record<string, null | string> = {}
    if (patch.name !== undefined) dbPatch.nickname = patch.name.trim() || '我'
    if (patch.avatarUrl !== undefined) dbPatch.avatar_url = patch.avatarUrl

    if (Object.keys(dbPatch).length) {
      await supabase.from('profiles').update(dbPatch).eq('id', dbUserId)
      await fetchData(true)
    }
  }

  const completeSetup = async () => {}

  const createTask = async (payload: {
    title: string
    description: string
    dueAt: string
    assigneeId: UserId
    isRecurring: boolean
  }) => {
    if (!supabase || !state.coupleId) return { error: '未連線' }

    const { error } = await supabase.from('tasks').insert({
      couple_id: state.coupleId,
      creator_id: unmapUser(state.currentUserId),
      assignee_id: unmapUser(payload.assigneeId),
      title: payload.title.trim(),
      description: payload.description.trim(),
      coin_reward: 15,
      reward_base: 15,
      rating_time: null,
      rating_difficulty: null,
      rating_avoidance: null,
      reward_multiplier: null,
      due_at: payload.dueAt || null,
      is_recurring: payload.isRecurring,
      status: 'open'
    })

    await fetchData(true)
    return { error: error?.message || null }
  }

  const updateTask = async (
    taskId: string,
    payload: { title: string; description: string; coinReward: number; dueAt: string; isRecurring: boolean }
  ) => {
    if (!supabase) return { error: '未連線' }
    if (payload.coinReward < 0) return { error: '金幣不能為負數。' }

    const { error } = await supabase
      .from('tasks')
      .update({
        title: payload.title.trim(),
        description: payload.description.trim(),
        coin_reward: payload.coinReward,
        due_at: payload.dueAt || null,
        is_recurring: payload.isRecurring,
        updated_at: new Date().toISOString()
      })
      .eq('id', taskId)
      .eq('status', 'open')

    await fetchData(true)
    return { error: error?.message || null }
  }

  const deleteTask = async (taskId: string) => {
    if (!supabase) return { error: '未連線' }
    const { error } = await supabase.from('tasks').delete().eq('id', taskId)
    await fetchData(true)
    return { error: error?.message || null }
  }

  const acceptTask = async (taskId: string) => {
    if (!supabase) return { error: '未連線' }
    const { error } = await supabase
      .from('tasks')
      .update({
        status: 'accepted',
        rejection_note: null,
        updated_at: new Date().toISOString()
      })
      .eq('id', taskId)
      .eq('status', 'open')

    await fetchData(true)
    return { error: error?.message || null }
  }

  const abandonTask = async (taskId: string) => {
    if (!supabase) return { error: '未連線' }
    const { error } = await supabase
      .from('tasks')
      .update({
        status: 'open',
        updated_at: new Date().toISOString()
      })
      .eq('id', taskId)
      .in('status', ['accepted', 'rejected'])

    await fetchData(true)
    return { error: error?.message || null }
  }

  const punishOverdueTask = async (taskId: string) => {
    if (!supabase || !state.coupleId) return { error: '未連線' }
    const task = state.tasks.find((t) => t.id === taskId)
    if (!task) return { error: '任務不存在' }

    const { error: ledgerError } = await supabase.from('ledger_entries').insert({
      couple_id: state.coupleId,
      user_id: unmapUser(task.assigneeId),
      entry_type: 'manual_adjustment',
      amount: -20,
      source_type: 'task',
      source_id: taskId,
      description: `任務過期懲罰：${task.title}`
    })

    if (ledgerError) return { error: ledgerError.message }

    const { error: taskError } = await supabase.from('tasks').delete().eq('id', taskId)
    
    await fetchData(true)
    return { error: taskError?.message || null }
  }

  const submitTask = async (
    taskId: string,
    ratings: { time: number; difficulty: number; avoidance: number }
  ) => {
    if (!supabase) return { error: '未連線' }
    const task = state.tasks.find((entry) => entry.id === taskId)
    if (!task) return { error: '任務不存在' }

    const base = 15
    const computed = computeTaskReward(base, ratings)
    const { error } = await supabase
      .from('tasks')
      .update({
        status: 'submitted',
        coin_reward: computed.reward,
        reward_base: base,
        rating_time: computed.ratings.time,
        rating_difficulty: computed.ratings.difficulty,
        rating_avoidance: computed.ratings.avoidance,
        reward_multiplier: computed.multiplier,
        submitted_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', taskId)
      .in('status', ['accepted', 'rejected'])

    await fetchData(true)
    return { error: error?.message || null }
  }

  const rejectTask = async (taskId: string, note: string) => {
    if (!supabase) return { error: '未連線' }
    const { error } = await supabase
      .from('tasks')
      .update({
        status: 'rejected',
        rejection_note: note.trim(),
        updated_at: new Date().toISOString()
      })
      .eq('id', taskId)

    await fetchData(true)
    return { error: error?.message || null }
  }

  const approveTask = async (taskId: string) => {
    if (!supabase || !state.coupleId) return { error: '未連線' }
    const task = state.tasks.find((item) => item.id === taskId)
    if (!task) return { error: '任務不存在' }

    const now = new Date().toISOString()
    const { error } = await supabase
      .from('tasks')
      .update({
        status: 'approved',
        approved_at: now,
        updated_at: now
      })
      .eq('id', taskId)

    if (!error) {
      await supabase.from('ledger_entries').insert({
        couple_id: state.coupleId,
        user_id: unmapUser(task.assigneeId),
        entry_type: 'task_reward',
        amount: task.coinReward,
        source_type: 'task',
        source_id: task.id,
        description: task.title
      })
    }

    await fetchData(true)
    return { error: error?.message || null }
  }

  const clearCompletedTask = async (taskId: string) => {
    if (!supabase) return { error: '未連線' }
    const task = state.tasks.find((item) => item.id === taskId)
    if (!task) return { error: '任務不存在' }

    if (task.isRecurring) {
      const { error } = await supabase
        .from('tasks')
        .update({
          status: 'open',
          submitted_at: null,
          approved_at: null,
          rejection_note: null,
          rating_time: null,
          rating_difficulty: null,
          rating_avoidance: null,
          reward_multiplier: null,
          coin_reward: 0,
          updated_at: new Date().toISOString()
        })
        .eq('id', taskId)

      await fetchData(true)
      return { error: error?.message || null }
    }

    return deleteTask(taskId)
  }

  const addSystemReward = async (amount: number, description: string, userId: UserId = state.currentUserId) => {
    if (!supabase || !state.coupleId) return { error: '未連線' }
    
    const { error } = await supabase.from('ledger_entries').insert({
      couple_id: state.coupleId,
      user_id: unmapUser(userId),
      entry_type: 'manual_adjustment',
      amount,
      source_type: 'manual',
      description
    })
    
    await fetchData(true)
    return { error: error?.message || null }
  }

  const createShopItem = async (payload: {
    title: string
    description: string
    price: number
    isProduct: boolean
    realPrice?: number | null
    category: string
    isHidden: boolean
    imageUrl?: string | null
  }) => {
    if (!supabase || !state.coupleId) return { error: { message: '未連線' } }

    const { data: newItem, error } = await supabase
      .from('shop_items')
      .insert({
        couple_id: state.coupleId,
        creator_id: unmapUser(state.currentUserId),
        title: payload.title.trim(),
        description: payload.description.trim(),
        price: payload.price,
        is_product: payload.isProduct,
        real_price: payload.isProduct ? payload.realPrice ?? null : null,
        category: payload.category.trim() || '日常',
        is_hidden: payload.isHidden,
        is_active: true,
        image_url: payload.imageUrl || null
      })
      .select()
      .single()

    if (!error && newItem) {
      const cat = payload.category.trim() || '日常'
      if (cat && cat !== '許願池' && !state.tags.includes(cat)) {
        await updateTags([...state.tags, cat])
      }
    }

    if (!error && newItem) await fetchData(true)
    return { error }
  }

  const updateShopItem = async (
    itemId: string,
    payload: {
      title: string
      description: string
      price: number
      isProduct: boolean
      realPrice?: number | null
      category: string
      isHidden: boolean
      imageUrl?: string | null
    }
  ) => {
    if (!supabase || !state.coupleId) return { error: { message: '未連線' } }

    const item = state.shopItems.find((entry) => entry.id === itemId)
    if (!item) return { error: { message: '商品不存在' } }
    if (item.creatorId !== state.currentUserId) return { error: { message: '只能編輯自己的項目' } }

    const nextUrl = payload.imageUrl?.trim() ? payload.imageUrl.trim() : null
    const prevUrl = item.imageUrl || null

    const { error } = await supabase
      .from('shop_items')
      .update({
        title: payload.title.trim(),
        description: payload.description.trim(),
        price: payload.price,
        is_product: payload.isProduct,
        real_price: payload.isProduct ? payload.realPrice ?? null : null,
        category: payload.category.trim() || '日常',
        is_hidden: payload.isHidden,
        image_url: nextUrl,
        updated_at: new Date().toISOString()
      })
      .eq('id', itemId)

    if (!error) {
      const cat = payload.category.trim() || '日常'
      if (cat && cat !== '許願池' && !state.tags.includes(cat)) {
        await updateTags([...state.tags, cat])
      }
    }

    if (!error && prevUrl && prevUrl !== nextUrl) await removeHostedShopImage(prevUrl)
    if (!error) await fetchData(true)
    return { error }
  }

  const toggleItemVisibility = async (itemId: string) => {
    if (!supabase) return
    const item = state.shopItems.find((entry) => entry.id === itemId)
    if (!item) return

    await supabase
      .from('shop_items')
      .update({ is_active: !item.isActive, updated_at: new Date().toISOString() })
      .eq('id', itemId)
    await fetchData(true)
  }

  const redeemItem = async (itemId: string, note: string) => {
    if (!supabase || !state.coupleId) return { ok: false as const, reason: '未連線' }
    const item = state.shopItems.find((entry) => entry.id === itemId)
    if (!item) return { ok: false as const, reason: '商品不存在' }

    const balance = getBalance(state.currentUserId)
    if (balance < item.price) return { ok: false as const, reason: '目前金幣不足。' }

    const { data: redemption, error } = await supabase
      .from('redemptions')
      .insert({
        couple_id: state.coupleId,
        shop_item_id: item.id,
        redeemer_id: unmapUser(state.currentUserId),
        creator_id: unmapUser(item.creatorId),
        price_snapshot: item.price,
        status: 'redeemed',
        note: note.trim()
      })
      .select()
      .single()

    if (error || !redemption) return { ok: false as const, reason: error?.message || '兌換失敗' }

    await supabase.from('ledger_entries').insert({
      couple_id: state.coupleId,
      user_id: unmapUser(state.currentUserId),
      entry_type: 'shop_redeem',
      amount: -item.price,
      source_type: 'redemption',
      source_id: redemption.id,
      description: item.title
    })

    await fetchData(true)
    return { ok: true as const }
  }

  const updateRedemptionStatus = async (redemptionId: string, status: RedemptionStatus) => {
    if (!supabase) return { error: '未連線' }
    const { error } = await supabase
      .from('redemptions')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', redemptionId)

    await fetchData(true)
    return { error: error?.message || null }
  }

  const cancelRedemption = async (redemptionId: string) => {
    if (!supabase || !state.coupleId) return { error: '未連線' }
    const redemption = state.redemptions.find((entry) => entry.id === redemptionId)
    if (!redemption) return { error: '兌換單不存在' }
    if (redemption.status === 'cancelled' || redemption.status === 'fulfilled') return { error: null }

    const { error } = await supabase
      .from('redemptions')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', redemptionId)

    if (!error && redemption.priceSnapshot > 0) {
      const item = state.shopItems.find((entry) => entry.id === redemption.shopItemId)
      await supabase.from('ledger_entries').insert({
        couple_id: state.coupleId,
        user_id: unmapUser(redemption.redeemerId),
        entry_type: 'manual_adjustment',
        amount: redemption.priceSnapshot,
        source_type: 'redemption',
        source_id: redemption.id,
        description: `${item?.title || '兌換'}（取消退回）`
      })
    }

    await fetchData(true)
    return { error: error?.message || null }
  }

  const resetState = () => {
    disposeCoupleRealtime()
    Object.assign(state, {
      ...defaultState(),
      isInitializing: false,
      coupleId: null,
      binding: { inviteCode: '', status: 'idle' as const }
    })
  }

  const generateInviteCode = async () => {
    if (!supabase || !state.profiles[0].realId) return null

    const { data: existing } = await supabase
      .from('invite_codes')
      .select('code')
      .eq('created_by', state.profiles[0].realId)
      .maybeSingle()
    if (existing) {
      state.binding.inviteCode = existing.code
      return existing.code
    }

    let code = ''
    let isUnique = false
    while (!isUnique) {
      code = `PAIR-${Math.random().toString(36).slice(2, 8).toUpperCase()}`
      const { data } = await supabase.from('invite_codes').select('id').eq('code', code).maybeSingle()
      if (!data) isUnique = true
    }

    await supabase.from('invite_codes').insert({
      created_by: state.profiles[0].realId,
      code
    })
    state.binding.inviteCode = code
    await fetchData(true)
    return code
  }

  const deleteShopItem = async (itemId: string, skipStorage = false) => {
    if (!supabase) return { error: { message: '未連線' } }
    const itemToDelete = state.shopItems.find((item) => item.id === itemId)

    state.shopItems = state.shopItems.filter((item) => item.id !== itemId)

    if (!skipStorage && itemToDelete?.imageUrl) await removeHostedShopImage(itemToDelete.imageUrl)

    const { error } = await supabase.from('shop_items').delete().eq('id', itemId)
    if (error) {
      console.error('Delete Shop Item Error:', error)
      await fetchData(true)
    }
    return { error }
  }

  const getInviteCode = async () => {
    if (!supabase || !state.profiles[0].realId) return null
    const { data } = await supabase
      .from('invite_codes')
      .select('code')
      .eq('created_by', state.profiles[0].realId)
      .order('created_at', { ascending: false })
      .limit(1)
    if (data?.length) return data[0].code
    return generateInviteCode()
  }

  const cleanupOrphanSpaces = async () => {
    if (!supabase) return
    const myUid = state.profiles[0].realId
    if (!myUid) return

    const { data: memberships } = await supabase.from('couple_members').select('couple_id').eq('user_id', myUid)
    if (!memberships || memberships.length <= 1) return

    const otherSpaces = memberships.filter((membership) => membership.couple_id !== state.coupleId)
    for (const space of otherSpaces) {
      const { count } = await supabase
        .from('couple_members')
        .select('*', { count: 'exact', head: true })
        .eq('couple_id', space.couple_id)

      if (count === 1) {
        await supabase.from('couple_members').delete().eq('couple_id', space.couple_id).eq('user_id', myUid)
      }
    }
    await fetchData(true)
  }

  const updateTags = async (newTags: string[]) => {
    if (!supabase || !state.coupleId) return { error: '未連線' }
    
    isTagLocked.value = true
    // 確保唯一性並移除空白
    const uniqueTags = Array.from(new Set(newTags.map(t => t.trim()).filter(Boolean)))
    
    const selfUid = state.profiles.find(p => p.id === 'self')?.realId
    if (!selfUid) {
      isTagLocked.value = false
      return { error: '找不到使用者 ID' }
    }

    // 1. 同步到個人設定 (用於自定義排序)
    const { error: profileError } = await supabase
      .from('profiles')
      .update({ custom_tags: uniqueTags })
      .eq('id', selfUid)
      
    if (profileError) {
      isTagLocked.value = false
      return { error: profileError.message }
    }

    // 2. 同步到共享池 (防止 fetchData 再次抓到舊標籤)
    const { error: coupleError } = await supabase
      .from('couples')
      .update({ custom_tags: uniqueTags })
      .eq('id', state.coupleId)

    if (!coupleError) {
      state.tags = uniqueTags
    }
    
    // 延遲解鎖，確保後續 fetchData 不會立刻覆蓋
    setTimeout(() => { isTagLocked.value = false }, 1000)
    
    return { error: coupleError?.message || null }
  }

  const renameTag = async (oldTag: string, newTag: string) => {
    if (!supabase || !state.coupleId) return { error: '未連線' }
    
    const trimmedNew = newTag.trim()
    if (!trimmedNew) return { error: '標籤名稱不能為空' }
    
    // Update custom_tags
    const newTags = state.tags.map(t => t === oldTag ? trimmedNew : t)
    const { error: tagError } = await updateTags(newTags)
    
    if (tagError) return { error: tagError }
    
    // Update existing shop items
    const { error: shopError } = await supabase
      .from('shop_items')
      .update({ category: trimmedNew })
      .eq('couple_id', state.coupleId)
      .eq('category', oldTag)
      
    await fetchData(true)
    return { error: shopError?.message || null }
  }

  const deleteTag = async (tagToDelete: string) => {
    if (!supabase || !state.coupleId) return { error: '未連線' }
    
    const newTags = state.tags.filter(t => t !== tagToDelete)
    const result = await updateTags(newTags)
    
    // Optional: We don't modify existing shop_items here, they just become "custom" text categories
    // until the user changes them.
    
    return result
  }

  const initializePushNotifications = async () => {
    if (!isPushSupported() || !state.coupleId) return false

    try {
      // Request permission first
      const permission = await requestPushPermission()
      if (permission !== 'granted') return false

      // Check if already subscribed
      const existingSubscription = await getCurrentSubscription()
      if (existingSubscription) {
        // Update existing subscription in database
        const subscriptionData = serializeSubscription(existingSubscription)
        await savePushSubscription(subscriptionData)
        return true
      }

      // Subscribe to push notifications
      const subscription = await subscribeToPush()
      if (!subscription) return false

      const subscriptionData = serializeSubscription(subscription)
      await savePushSubscription(subscriptionData)
      return true
    } catch (error) {
      console.error('Failed to initialize push notifications:', error)
      return false
    }
  }

  const savePushSubscription = async (subscriptionData: PushSubscriptionData) => {
    if (!supabase || !state.coupleId) return

    const myUid = state.profiles.find(p => p.id === 'self')?.realId
    if (!myUid) return

    // Check if we're in development mode
    const isDevelopment = import.meta.env.DEV || window.location.hostname === 'localhost'
    
    if (isDevelopment) {
      // In development, just store subscription locally for testing
      console.log('Development mode: Storing push subscription locally')
      localStorage.setItem('push-subscription-dev', JSON.stringify(subscriptionData))
      return
    }

    try {
      // Use Supabase Edge Function in production
      const { error } = await supabase.functions.invoke('push-notification', {
        body: {
          type: 'subscribe',
          subscription: subscriptionData,
          userId: myUid,
          coupleId: state.coupleId
        }
      })

      if (error) {
        throw new Error(error.message || 'Failed to save subscription')
      }
    } catch (error) {
      console.error('Failed to save push subscription:', error instanceof Error ? error.message : 'Unknown error')
    }
  }

  const sendPushNotification = async (notification: {
    title?: string
    body: string
    tag?: string
    url?: string
  }) => {
    if (!supabase || !state.coupleId) return

    const myUid = state.profiles.find(p => p.id === 'self')?.realId
    if (!myUid) return

    // Check if we're in development mode and Edge Functions are not deployed yet
    const isDevelopment = import.meta.env.DEV || window.location.hostname === 'localhost'
    
    if (isDevelopment) {
      // In development, just store notifications locally for testing
      console.log('Development mode: Storing push notification locally:', notification)
      const notifications = JSON.parse(localStorage.getItem('pending-push-notifications') || '[]')
      notifications.push({
        ...notification,
        timestamp: Date.now(),
        id: Math.random().toString(36).substr(2, 9),
        coupleId: state.coupleId
      })
      
      // Keep only last 20 notifications
      if (notifications.length > 20) {
        notifications.splice(0, notifications.length - 20)
      }
      
      localStorage.setItem('pending-push-notifications', JSON.stringify(notifications))
      return
    }

    try {
      // Try Supabase Edge Function in production
      const { error } = await supabase.functions.invoke('push-notification', {
        body: {
          type: 'send',
          notification,
          coupleId: state.coupleId,
          excludeUserId: myUid
        }
      })

      if (error) {
        throw new Error(error.message || 'Failed to send push notification')
      }
    } catch (error) {
      console.warn('Push notification failed:', error instanceof Error ? error.message : 'Unknown error')
      // Fallback: store notification locally
      const notifications = JSON.parse(localStorage.getItem('pending-push-notifications') || '[]')
      notifications.push({
        ...notification,
        timestamp: Date.now(),
        id: Math.random().toString(36).substr(2, 9),
        coupleId: state.coupleId
      })
      
      // Keep only last 20 notifications
      if (notifications.length > 20) {
        notifications.splice(0, notifications.length - 20)
      }
      
      localStorage.setItem('pending-push-notifications', JSON.stringify(notifications))
    }
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
    getBalance,
    recentLedger,
    initializePushNotifications,
    sendPushNotification,
    fetchData,
    createSpace,
    joinSpace,
    getInviteCode,
    switchPerspective,
    updateProfile,
    completeSetup,
    updateAppearance,
    updateNotificationSettings,
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
    cleanupOrphanSpaces,
    generateInviteCode,
    addSystemReward,
    resetState,
    updateTags,
    renameTag,
    deleteTag,
    isTagLocked
  }
}
