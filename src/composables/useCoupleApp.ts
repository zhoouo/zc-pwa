import { computed, reactive } from 'vue'
import type { RealtimeChannel } from '@supabase/supabase-js'

import { supabase } from '../lib/supabase'
import type {
  AppState,
  AppearanceSettings,
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
  binding: {
    inviteCode: '',
    status: 'pending'
  }
})

const state = reactive<AppState>({
  ...defaultState(),
  isInitializing: true
})

let realtimeChannel: RealtimeChannel | null = null
let realtimeCoupleId = ''
let realtimePollInterval: number | null = null
let visibilityListenerAttached = false

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

const getBalance = (userId: UserId) =>
  state.ledger.filter((entry) => entry.userId === userId).reduce((sum, entry) => sum + entry.amount, 0)

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

  const balances = computed(() => ({
    self: getBalance('self'),
    partner: getBalance('partner')
  }))

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
    state.isSetupComplete = true
    state.binding.status = 'paired'

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
    }

    const { data: dbTasks } = await supabase.from('tasks').select('*').eq('couple_id', coupleId)
    state.tasks = dbTasks?.map(mapTask) || []

    const { data: dbItems } = await supabase.from('shop_items').select('*').eq('couple_id', coupleId)
    state.shopItems = dbItems?.map((item) => ({
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
    })) || []

    const { data: dbRedemptions } = await supabase.from('redemptions').select('*').eq('couple_id', coupleId)
    state.redemptions = dbRedemptions?.map((redemption) => ({
      id: redemption.id,
      shopItemId: redemption.shop_item_id,
      creatorId: mapUser(redemption.creator_id),
      redeemerId: mapUser(redemption.redeemer_id),
      priceSnapshot: redemption.price_snapshot,
      status: redemption.status as RedemptionStatus,
      note: redemption.note || '',
      createdAt: redemption.created_at,
      updatedAt: redemption.updated_at
    })) || []

    const { data: dbLedger } = await supabase.from('ledger_entries').select('*').eq('couple_id', coupleId)
    state.ledger = dbLedger?.map((entry) => ({
      id: entry.id,
      userId: mapUser(entry.user_id),
      entryType: entry.entry_type,
      amount: entry.amount,
      sourceType: entry.source_type,
      sourceId: entry.source_id,
      description: entry.description,
      createdAt: entry.created_at
    })) || []

    const { data: inviteData } = await supabase
      .from('invite_codes')
      .select('code')
      .eq('created_by', myUid)
      .maybeSingle()
    if (inviteData) state.binding.inviteCode = inviteData.code

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
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles' }, (payload) => {
        const profile = payload.new as any
        const index = state.profiles.findIndex((entry) => entry.realId === profile.id)
        if (index === -1) return

        state.profiles[index].name = profile.nickname
        state.profiles[index].title = profile.title || state.profiles[index].title
        state.profiles[index].avatarUrl = profile.avatar_url

        if (state.profiles[index].id === 'self') {
          state.appearance = parseAppearance(profile.appearance_settings)
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

  const updateAppearance = async (patch: Partial<AppearanceSettings>) => {
    state.appearance = { ...state.appearance, ...patch }
    if (!supabase) return

    const dbUserId = unmapUser('self')
    if (!dbUserId) return

    await supabase
      .from('profiles')
      .update({
        appearance_settings: state.appearance,
        updated_at: new Date().toISOString()
      })
      .eq('id', dbUserId)
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
      source_type: 'manual',
      source_id: `penalty-${Date.now()}-${taskId.slice(-4)}`,
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
        category: payload.category.trim() || '未分類',
        is_hidden: payload.isHidden,
        is_active: true,
        image_url: payload.imageUrl || null
      })
      .select()
      .single()

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
        category: payload.category.trim() || '未分類',
        is_hidden: payload.isHidden,
        image_url: nextUrl,
        updated_at: new Date().toISOString()
      })
      .eq('id', itemId)

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
    fetchData,
    createSpace,
    joinSpace,
    getInviteCode,
    switchPerspective,
    updateProfile,
    completeSetup,
    updateAppearance,
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
    resetState
  }
}
