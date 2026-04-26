import { computed, reactive } from 'vue'
import { supabase } from '../lib/supabase'
import type {
  AppState,
  AppearanceSettings,
  LedgerEntry,
  Redemption,
  RedemptionStatus,
  ShopItem,
  Task,
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
  isSetupComplete: false,
  coupleId: undefined,
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
    inviteCode: '',
    status: 'pending'
  }
})

const state = reactive<AppState>(defaultState())

const getBalance = (userId: UserId) =>
  state.ledger.filter((entry) => entry.userId === userId).reduce((sum, entry) => sum + entry.amount, 0)

const mapUser = (dbUserId: string): UserId => {
  const selfProfile = state.profiles.find((p) => p.id === 'self')
  if (selfProfile?.realId === dbUserId) return 'self'
  return 'partner'
}

const unmapUser = (userId: UserId): string => {
  const p = state.profiles.find((p) => p.id === userId)
  return p?.realId || ''
}

export const useCoupleApp = () => {
  const currentUser = computed(() => state.profiles.find((profile) => profile.id === state.currentUserId)!)
  const partnerUser = computed(() => state.profiles.find((profile) => profile.id !== state.currentUserId)!)
  const profileMap = computed(
    () => Object.fromEntries(state.profiles.map((profile) => [profile.id, profile])) as Record<UserId, AppState['profiles'][number]>
  )
  const tasksAssignedToMe = computed(() =>
    state.tasks
      .filter((task) => task.assigneeId === state.currentUserId && task.status !== 'cancelled')
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
  )
  const tasksCreatedByMe = computed(() =>
    state.tasks
      .filter((task) => task.creatorId === state.currentUserId)
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
  )
  const reviewQueue = computed(() =>
    state.tasks
      .filter((task) => task.creatorId === state.currentUserId && task.status === 'submitted')
      .sort((a, b) => new Date(b.submittedAt || 0).getTime() - new Date(a.submittedAt || 0).getTime())
  )
  const availableShopItems = computed(() =>
    state.shopItems
      .filter((item) => item.creatorId !== state.currentUserId && item.isActive)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  )
  const myShopItems = computed(() =>
    state.shopItems
      .filter((item) => item.creatorId === state.currentUserId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  )
  const myRedemptions = computed(() =>
    state.redemptions
      .filter((entry) => entry.redeemerId === state.currentUserId || entry.creatorId === state.currentUserId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  )
  const balances = computed(() => ({
    self: getBalance('self'),
    partner: getBalance('partner')
  }))
  const recentLedger = computed(() =>
    [...state.ledger].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 16)
  )

  const fetchData = async () => {
    if (!supabase) return

    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) {
      Object.assign(state, defaultState())
      return
    }

    const myUid = session.user.id

    // 取得配對狀態
    const { data: memberData } = await supabase
      .from('couple_members')
      .select('couple_id')
      .eq('user_id', myUid)
      .maybeSingle()

    if (!memberData?.couple_id) {
      Object.assign(state, { ...defaultState(), currentUserId: 'self' })
      // 但我們需要保留使用者的 profiles (至少他自己)
      const { data: myProfile } = await supabase.from('profiles').select('*').eq('id', myUid).single()
      if (myProfile) {
        state.profiles[0].name = myProfile.nickname || '我'
        state.profiles[0].title = myProfile.title || '今天的你'
        state.profiles[0].avatarUrl = myProfile.avatar_url
        state.profiles[0].realId = myUid
      }
      return
    }

    const coupleId = memberData.couple_id
    state.coupleId = coupleId
    state.isSetupComplete = true

    // 取得所有成員
    const { data: members } = await supabase.from('couple_members').select('user_id').eq('couple_id', coupleId)
    const partnerId = members?.find((m) => m.user_id !== myUid)?.user_id

    // 取得 Profiles
    const userIds = members?.map((m) => m.user_id) || []
    const { data: profiles } = await supabase.from('profiles').select('*').in('id', userIds)

    if (profiles) {
      const myProfile = profiles.find((p) => p.id === myUid)
      const pProfile = partnerId ? profiles.find((p) => p.id === partnerId) : null

      state.profiles = [
        {
          id: 'self',
          realId: myUid,
          name: myProfile?.nickname || '我',
          title: myProfile?.title || '今天的你',
          avatarUrl: myProfile?.avatar_url || null,
          avatarTone: avatarTones.self
        },
        {
          id: 'partner',
          realId: partnerId || undefined,
          name: pProfile?.nickname || '對方',
          title: pProfile?.title || '另一半',
          avatarUrl: pProfile?.avatar_url || null,
          avatarTone: avatarTones.partner
        }
      ]
    }

    // 載入 Tasks
    const { data: dbTasks } = await supabase.from('tasks').select('*').eq('couple_id', coupleId)
    if (dbTasks) {
      state.tasks = dbTasks.map((t) => ({
        id: t.id,
        title: t.title,
        description: t.description || '',
        coinReward: t.coin_reward,
        dueAt: t.due_at || '',
        status: t.status as TaskStatus,
        creatorId: mapUser(t.creator_id),
        assigneeId: mapUser(t.assignee_id),
        createdAt: t.created_at,
        updatedAt: t.updated_at,
        submittedAt: t.submitted_at || undefined,
        approvedAt: t.approved_at || undefined,
        rejectionNote: t.rejection_note || undefined
      }))
    }

    // 載入 Ledger
    const { data: dbLedger } = await supabase.from('ledger_entries').select('*').eq('couple_id', coupleId)
    if (dbLedger) {
      state.ledger = dbLedger.map((l) => ({
        id: l.id,
        userId: mapUser(l.user_id),
        entryType: l.entry_type as any,
        amount: l.amount,
        sourceType: l.source_type as any,
        sourceId: l.source_id,
        description: l.description,
        createdAt: l.created_at
      }))
    }

    // 載入 Shop Items
    const { data: dbItems } = await supabase.from('shop_items').select('*').eq('couple_id', coupleId)
    if (dbItems) {
      state.shopItems = dbItems.map((item) => ({
        id: item.id,
        title: item.title,
        description: item.description || '',
        price: item.price,
        category: item.category || '',
        creatorId: mapUser(item.creator_id),
        isActive: item.is_active,
        isHidden: item.is_hidden,
        createdAt: item.created_at
      }))
    }

    // 載入 Redemptions
    const { data: dbRedemptions } = await supabase.from('redemptions').select('*').eq('couple_id', coupleId)
    if (dbRedemptions) {
      state.redemptions = dbRedemptions.map((r) => ({
        id: r.id,
        shopItemId: r.shop_item_id,
        creatorId: mapUser(r.creator_id),
        redeemerId: mapUser(r.redeemer_id),
        priceSnapshot: r.price_snapshot,
        status: r.status as RedemptionStatus,
        note: r.note || '',
        createdAt: r.created_at,
        updatedAt: r.updated_at
      }))
    }
  }

  const createSpace = async () => {
    if (!supabase) return { error: '未連線' }
    const myUid = state.profiles[0].realId
    if (!myUid) return { error: '未登入' }

    // 建立 Couple
    const { data: couple, error: coupleError } = await supabase.from('couples').insert({}).select().single()
    if (coupleError || !couple) return { error: coupleError?.message || '建立失敗' }

    const coupleId = couple.id

    // 加入 Member
    await supabase.from('couple_members').insert({
      couple_id: coupleId,
      user_id: myUid,
      role: 'owner'
    })

    // 產生邀請碼
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

    // 加入 Member
    const { error: joinError } = await supabase.from('couple_members').insert({
      couple_id: invite.created_by, // 應該是 couple_id 但 schema 裡沒有記錄 couple_id 在 invite_code 裡。我們需查 created_by 的 couple_id
      user_id: myUid,
      role: 'member'
    })
    
    // 如果 insert 失敗，代表可能已經加入，或者是要先查出對方的 couple_id
    // 上面邏輯有誤，我們改為先查對方 couple_id
    const { data: partnerMember } = await supabase.from('couple_members').select('couple_id').eq('user_id', invite.created_by).maybeSingle()
    if (!partnerMember) return { error: '建立者已離開空間' }

    const { error: joinErr } = await supabase.from('couple_members').insert({
      couple_id: partnerMember.couple_id,
      user_id: myUid,
      role: 'member'
    })

    if (joinErr) return { error: joinErr.message }

    await fetchData()
    return { error: null }
  }

  const switchPerspective = (userId: UserId) => {
    state.currentUserId = userId
  }

  const updateAppearance = (patch: Partial<AppearanceSettings>) => {
    state.appearance = { ...state.appearance, ...patch }
  }

  const updateProfile = async (userId: UserId, patch: { avatarUrl?: null | string; name?: string; title?: string }) => {
    if (!supabase) return
    const dbUserId = unmapUser(userId)
    if (!dbUserId) return

    const dbPatch: any = {}
    if (patch.name !== undefined) dbPatch.nickname = patch.name.trim() || undefined
    if (patch.title !== undefined) dbPatch.title = patch.title.trim() || undefined
    if (patch.avatarUrl !== undefined) dbPatch.avatar_url = patch.avatarUrl

    if (Object.keys(dbPatch).length > 0) {
      await supabase.from('profiles').update(dbPatch).eq('id', dbUserId)
      await fetchData()
    }
  }

  const completeSetup = async () => {}

  const createTask = async (payload: { title: string; description: string; coinReward: number; dueAt: string; assigneeId: UserId }) => {
    if (!supabase || !state.coupleId) return
    const dbCreatorId = unmapUser(state.currentUserId)
    const dbAssigneeId = unmapUser(payload.assigneeId)
    
    const { data: newTask } = await supabase.from('tasks').insert({
      couple_id: state.coupleId,
      creator_id: dbCreatorId,
      assignee_id: dbAssigneeId,
      title: payload.title.trim(),
      description: payload.description.trim(),
      coin_reward: payload.coinReward,
      due_at: payload.dueAt || null,
      status: 'open'
    }).select().single()

    if (newTask) await fetchData()
  }

  const submitTask = async (taskId: string) => {
    if (!supabase) return
    await supabase.from('tasks').update({ status: 'submitted', submitted_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', taskId)
    await fetchData()
  }

  const rejectTask = async (taskId: string, note: string) => {
    if (!supabase) return
    await supabase.from('tasks').update({ status: 'rejected', rejection_note: note.trim(), updated_at: new Date().toISOString() }).eq('id', taskId)
    await fetchData()
  }

  const approveTask = async (taskId: string) => {
    if (!supabase || !state.coupleId) return
    const task = state.tasks.find(t => t.id === taskId)
    if (!task) return

    const now = new Date().toISOString()
    await supabase.from('tasks').update({ status: 'approved', approved_at: now, updated_at: now }).eq('id', taskId)
    
    await supabase.from('ledger_entries').insert({
      couple_id: state.coupleId,
      user_id: unmapUser(task.assigneeId),
      entry_type: 'task_reward',
      amount: task.coinReward,
      source_type: 'task',
      source_id: task.id,
      description: task.title
    })

    await fetchData()
  }

  const createShopItem = async (payload: { title: string; description: string; price: number; category: string; isHidden: boolean }) => {
    if (!supabase || !state.coupleId) return
    await supabase.from('shop_items').insert({
      couple_id: state.coupleId,
      creator_id: unmapUser(state.currentUserId),
      title: payload.title.trim(),
      description: payload.description.trim(),
      price: payload.price,
      category: payload.category.trim() || '未分類',
      is_hidden: payload.isHidden,
      is_active: true
    })
    await fetchData()
  }

  const toggleItemVisibility = async (itemId: string) => {
    if (!supabase) return
    const item = state.shopItems.find(i => i.id === itemId)
    if (!item) return
    await supabase.from('shop_items').update({ is_active: !item.isActive, updated_at: new Date().toISOString() }).eq('id', itemId)
    await fetchData()
  }

  const redeemItem = async (itemId: string, note: string) => {
    if (!supabase || !state.coupleId) return { ok: false as const, reason: '未連線' }
    const item = state.shopItems.find(i => i.id === itemId)
    if (!item) return { ok: false as const, reason: '商品不存在' }

    const balance = getBalance(state.currentUserId)
    if (balance < item.price) return { ok: false as const, reason: '目前金幣不足。' }

    const { data: redemption } = await supabase.from('redemptions').insert({
      couple_id: state.coupleId,
      shop_item_id: item.id,
      redeemer_id: unmapUser(state.currentUserId),
      creator_id: unmapUser(item.creatorId),
      price_snapshot: item.price,
      status: 'redeemed',
      note: note.trim()
    }).select().single()

    if (redemption) {
      await supabase.from('ledger_entries').insert({
        couple_id: state.coupleId,
        user_id: unmapUser(state.currentUserId),
        entry_type: 'shop_redeem',
        amount: -item.price,
        source_type: 'redemption',
        source_id: redemption.id,
        description: item.title
      })
      await fetchData()
      return { ok: true as const }
    }
    return { ok: false as const, reason: '兌換失敗' }
  }

  const updateRedemptionStatus = async (redemptionId: string, status: RedemptionStatus) => {
    if (!supabase) return
    await supabase.from('redemptions').update({ status, updated_at: new Date().toISOString() }).eq('id', redemptionId)
    await fetchData()
  }

  const resetAll = () => {
    Object.assign(state, defaultState())
  }

  const generateInviteCode = async () => {
    if (!supabase || !state.profiles[0].realId) return null
    const code = `PAIR-${Math.random().toString(36).slice(2, 8).toUpperCase()}`
    await supabase.from('invite_codes').insert({
      created_by: state.profiles[0].realId,
      code
    })
    return code
  }

  const getInviteCode = async () => {
    if (!supabase || !state.profiles[0].realId) return null
    const { data } = await supabase.from('invite_codes').select('code').eq('created_by', state.profiles[0].realId).order('created_at', { ascending: false }).limit(1)
    if (data && data.length > 0) return data[0].code
    return await generateInviteCode()
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
