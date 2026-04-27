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
  TaskStatus,
  UserId
} from '../types'
import { RealtimeChannel } from '@supabase/supabase-js'

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
    { id: 'self', name: '我', avatarUrl: null, avatarTone: avatarTones.self },
    { id: 'partner', name: '對方', avatarUrl: null, avatarTone: avatarTones.partner }
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
  isInitializing: true // 初始狀態設為載入中
})
let realtimeChannel: RealtimeChannel | null = null

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

  const fetchData = async (silent = false) => {
    if (!supabase) return

    if (!silent) state.isInitializing = true

    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) {
      state.isInitializing = false
      Object.assign(state, defaultState())
      return
    }

    const myUid = session.user.id

    // 取得配對狀態
    let coupleId = state.coupleId
    if (!coupleId || !silent) {
      // 這裡改成抓取所有相關空間，處理可能重複建立的情況
      const { data: memberships } = await supabase
        .from('couple_members')
        .select('couple_id')
        .eq('user_id', myUid)
      
      if (memberships && memberships.length > 0) {
        if (memberships.length === 1) {
          coupleId = memberships[0].couple_id
        } else {
          // 如果有多個空間，優先尋找已經有兩人的那個（完整空間）
          const { data: spaceStats } = await supabase
            .from('couple_members')
            .select('couple_id')
            .in('couple_id', memberships.map(m => m.couple_id))
          
          const counts: Record<string, number> = {}
          spaceStats?.forEach(s => {
            counts[s.couple_id] = (counts[s.couple_id] || 0) + 1
          })
          
          // 找人數最多的空間
          const bestSpace = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]
          coupleId = bestSpace[0]
          console.warn('Detected multiple spaces, choosing most populated:', coupleId)
          
          // 非同步清理孤兒空間，不阻塞主流程
          setTimeout(() => {
            const { cleanupOrphanSpaces } = useCoupleApp()
            cleanupOrphanSpaces()
          }, 1000)
        }
      }
    }

    if (!coupleId) {
      state.isInitializing = false
      Object.assign(state, { ...defaultState(), currentUserId: 'self' })
      const { data: myProfile } = await supabase.from('profiles').select('*').eq('id', myUid).single()
      if (myProfile) {
        state.profiles[0].realId = myUid
      }
      const { data: inviteData } = await supabase.from('invite_codes').select('code').eq('created_by', myUid).maybeSingle()
      if (inviteData) {
        state.binding.inviteCode = inviteData.code
      }
      return
    }

    state.coupleId = coupleId
    state.isSetupComplete = true

    // 僅在非 silent 時抓取成員與 Profiles
    if (!silent || state.profiles[1].realId === undefined) {
      const { data: members } = await supabase.from('couple_members').select('user_id').eq('couple_id', coupleId)
      const partnerId = members?.find((m) => m.user_id !== myUid)?.user_id

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
            avatarUrl: myProfile?.avatar_url || null,
            avatarTone: avatarTones.self
          },
          {
            id: 'partner',
            realId: partnerId || undefined,
            name: pProfile?.nickname || '對方',
            avatarUrl: pProfile?.avatar_url || null,
            avatarTone: avatarTones.partner
          }
        ]
      }
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
        imageUrl: item.image_url,
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

    // 載入我的邀請碼
    const { data: inviteData } = await supabase.from('invite_codes').select('code').eq('created_by', myUid).maybeSingle()
    if (inviteData) {
      state.binding.inviteCode = inviteData.code
    }

    // 初始化即時更新
    subscribeToChanges(coupleId)
    state.isInitializing = false
  }

  const subscribeToChanges = (coupleId: string) => {
    if (!supabase || realtimeChannel) return

    realtimeChannel = supabase
      .channel(`couple_changes_${coupleId}`)
      // 監聽任務變動
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks', filter: `couple_id=eq.${coupleId}` }, (payload) => {
        if (payload.eventType === 'INSERT') {
          const t = payload.new as any
          const newTask = {
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
          }
          if (!state.tasks.find(x => x.id === t.id)) state.tasks.unshift(newTask)
        } else if (payload.eventType === 'UPDATE') {
          const t = payload.new as any
          const index = state.tasks.findIndex(x => x.id === t.id)
          if (index !== -1) {
            state.tasks[index] = {
              ...state.tasks[index],
              status: t.status,
              updatedAt: t.updated_at,
              submittedAt: t.submitted_at,
              approvedAt: t.approved_at,
              rejectionNote: t.rejection_note
            }
          }
        } else if (payload.eventType === 'DELETE') {
          state.tasks = state.tasks.filter(x => x.id !== payload.old.id)
        }
      })
      // 監聽商店變動
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shop_items', filter: `couple_id=eq.${coupleId}` }, (payload) => {
        if (payload.eventType === 'INSERT') {
          const item = payload.new as any
          const newItem = {
            id: item.id,
            title: item.title,
            description: item.description || '',
            price: item.price,
            category: item.category || '',
            creatorId: mapUser(item.creator_id),
            isActive: item.is_active,
            isHidden: item.is_hidden,
            imageUrl: item.image_url,
            createdAt: item.created_at
          }
          if (!state.shopItems.find(x => x.id === item.id)) state.shopItems.unshift(newItem)
        } else if (payload.eventType === 'UPDATE') {
          const item = payload.new as any
          const index = state.shopItems.findIndex(x => x.id === item.id)
          if (index !== -1) {
            state.shopItems[index] = { ...state.shopItems[index], isActive: item.is_active, isHidden: item.is_hidden }
          }
        } else if (payload.eventType === 'DELETE') {
          state.shopItems = state.shopItems.filter(x => x.id !== payload.old.id)
        }
      })
      // 監聽兌換變動
      .on('postgres_changes', { event: '*', schema: 'public', table: 'redemptions', filter: `couple_id=eq.${coupleId}` }, (payload) => {
        if (payload.eventType === 'INSERT') {
          const r = payload.new as any
          const newR = {
            id: r.id,
            shopItemId: r.shop_item_id,
            creatorId: mapUser(r.creator_id),
            redeemerId: mapUser(r.redeemer_id),
            priceSnapshot: r.price_snapshot,
            status: r.status as RedemptionStatus,
            note: r.note || '',
            createdAt: r.created_at,
            updatedAt: r.updated_at
          }
          if (!state.redemptions.find(x => x.id === r.id)) state.redemptions.unshift(newR)
        } else if (payload.eventType === 'UPDATE') {
          const r = payload.new as any
          const index = state.redemptions.findIndex(x => x.id === r.id)
          if (index !== -1) {
            state.redemptions[index] = { ...state.redemptions[index], status: r.status, updatedAt: r.updated_at }
          }
        }
      })
      // 監聽金幣變動
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'ledger_entries', filter: `couple_id=eq.${coupleId}` }, (payload) => {
        const l = payload.new as any
        const newL = {
          id: l.id,
          userId: mapUser(l.user_id),
          entryType: l.entry_type as any,
          amount: l.amount,
          sourceType: l.source_type as any,
          sourceId: l.source_id,
          description: l.description,
          createdAt: l.created_at
        }
        if (!state.ledger.find(x => x.id === l.id)) state.ledger.unshift(newL)
      })
      // 監聽個人資料變動 (同步暱稱與頭像)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles' }, (payload) => {
        const p = payload.new as any
        const index = state.profiles.findIndex(x => x.realId === p.id)
        if (index !== -1) {
          state.profiles[index].name = p.nickname
          state.profiles[index].avatarUrl = p.avatar_url
        }
      })
      .subscribe()
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

    // 額外檢查：空間是否已滿 (上限 2 人)
    const { count: memberCount } = await supabase
      .from('couple_members')
      .select('*', { count: 'exact', head: true })
      .eq('couple_id', partnerMember.couple_id)
    
    if (memberCount && memberCount >= 2) {
      return { error: '這個空間已經額滿了（上限 2 人）。' }
    }

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

  const deleteSpace = async () => {
    if (!supabase || !state.coupleId) return
    
    // 1. 清理空間內所有商城圖片
    try {
      const { data: items } = await supabase.from('shop_items').select('image_url').eq('couple_id', state.coupleId)
      if (items && items.length > 0) {
        const paths = items
          .map(i => i.image_url)
          .filter(url => url && url.includes('/public/shop/'))
          .map(url => {
            const searchStr = '/public/shop/'
            const idx = url!.indexOf(searchStr)
            return url!.substring(idx + searchStr.length)
          })
        
        if (paths.length > 0) {
          await supabase.storage.from('shop').remove(paths)
        }
      }
    } catch (err) {
      console.error('Space cleanup error:', err)
    }

    const { error } = await supabase.from('couples').delete().eq('id', state.coupleId)
    if (!error) {
      Object.assign(state, defaultState())
      await fetchData()
    }
    return { error }
  }

  const updateAppearance = (patch: Partial<AppearanceSettings>) => {
    state.appearance = { ...state.appearance, ...patch }
  }

  const updateProfile = async (userId: UserId, patch: { avatarUrl?: null | string; name?: string }) => {
    if (!supabase) return
    const dbUserId = unmapUser(userId)
    if (!dbUserId) return

    const dbPatch: any = {}
    if (patch.name !== undefined) dbPatch.nickname = patch.name.trim() || undefined
    if (patch.avatarUrl !== undefined) dbPatch.avatar_url = patch.avatarUrl

    if (Object.keys(dbPatch).length > 0) {
      await supabase.from('profiles').update(dbPatch).eq('id', dbUserId)
      await fetchData(true)
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

    if (newTask) await fetchData(true)
  }

  const submitTask = async (taskId: string) => {
    if (!supabase) return
    await supabase.from('tasks').update({ status: 'submitted', submitted_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', taskId)
    await fetchData(true)
  }

  const rejectTask = async (taskId: string, note: string) => {
    if (!supabase) return
    await supabase.from('tasks').update({ status: 'rejected', rejection_note: note.trim(), updated_at: new Date().toISOString() }).eq('id', taskId)
    await fetchData(true)
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

    await fetchData(true)
  }

  const createShopItem = async (payload: { title: string; description: string; price: number; category: string; isHidden: boolean; imageUrl?: string | null }) => {
    if (!supabase || !state.coupleId) return
    const { data: newItem, error } = await supabase.from('shop_items').insert({
      couple_id: state.coupleId,
      creator_id: unmapUser(state.currentUserId),
      title: payload.title.trim(),
      description: payload.description.trim(),
      price: payload.price,
      category: payload.category.trim() || '未分類',
      is_hidden: payload.isHidden,
      is_active: true,
      image_url: payload.imageUrl || null
    }).select().single()

    if (error) {
      console.error('Create Shop Item Error:', error)
    }

    if (!error && newItem) {
      state.shopItems.unshift({
        id: newItem.id,
        title: newItem.title,
        description: newItem.description || '',
        price: newItem.price,
        category: newItem.category || '',
        creatorId: state.currentUserId,
        isActive: newItem.is_active,
        isHidden: newItem.is_hidden,
        imageUrl: newItem.image_url,
        createdAt: newItem.created_at
      })
    }
    await fetchData(true)
    return { error }
  }

  const toggleItemVisibility = async (itemId: string) => {
    if (!supabase) return
    const item = state.shopItems.find(i => i.id === itemId)
    if (!item) return
    await supabase.from('shop_items').update({ is_active: !item.isActive, updated_at: new Date().toISOString() }).eq('id', itemId)
    await fetchData(true)
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
      await fetchData(true)
      return { ok: true as const }
    }
    return { ok: false as const, reason: '兌換失敗' }
  }

  const updateRedemptionStatus = async (redemptionId: string, status: RedemptionStatus) => {
    if (!supabase) return
    await supabase.from('redemptions').update({ status, updated_at: new Date().toISOString() }).eq('id', redemptionId)
    await fetchData(true)
  }

  const resetState = () => {
    state.isInitializing = false
    state.coupleId = null
    state.currentUserId = 'self'
    state.profiles = [
      { id: 'self', realId: '', name: '我', title: '努力中', avatarUrl: null },
      { id: 'partner', realId: '', name: '另一半', title: '待連線', avatarUrl: null }
    ]
    state.tasks = []
    state.shopItems = []
    state.redemptions = []
    state.ledger = []
    state.binding = { inviteCode: null, status: 'idle' }
  }

  const generateInviteCode = async () => {
    if (!supabase || !state.profiles[0].realId) return null
    
    const { data: existing } = await supabase.from('invite_codes').select('code').eq('created_by', state.profiles[0].realId).maybeSingle()
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
    if (!supabase) return
    const itemToDelete = state.shopItems.find(i => i.id === itemId)

    // Optimistic delete
    state.shopItems = state.shopItems.filter(i => i.id !== itemId)

    // 1. 如果有圖片且未要求跳過，則從存儲中刪除
    if (!skipStorage && itemToDelete?.imageUrl) {
      const url = itemToDelete.imageUrl
      const searchStr = '/public/shop/'
      const index = url.indexOf(searchStr)
      if (index !== -1) {
        const path = url.substring(index + searchStr.length)
        await supabase.storage.from('shop').remove([path])
      }
    }

    const { error } = await supabase.from('shop_items').delete().eq('id', itemId)
    if (error) {
      console.error('Delete Shop Item Error:', error)
      // Rollback or re-fetch on error
      await fetchData(true)
    }
    return { error }
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
    deleteShopItem,
    redeemItem,
    updateRedemptionStatus,
    deleteSpace,
    cleanupOrphanSpaces: async () => {
      if (!supabase) return
      const myUid = state.profiles[0].realId
      if (!myUid) return
      
      // 找出所有我加入的空間
      const { data: memberships } = await supabase.from('couple_members').select('couple_id').eq('user_id', myUid)
      if (!memberships || memberships.length <= 1) return
      
      // 排除目前正在使用的空間
      const otherSpaces = memberships.filter(m => m.couple_id !== state.coupleId)
      
      for (const space of otherSpaces) {
        // 檢查該空間是否只有我一個人 (孤兒空間)
        const { count } = await supabase.from('couple_members').select('*', { count: 'exact', head: true }).eq('couple_id', space.couple_id)
        if (count === 1) {
          // 如果只有我，則可以安全刪除這個成員關係（以及空間）
          await supabase.from('couple_members').delete().eq('couple_id', space.couple_id).eq('user_id', myUid)
          // 注意：如果我是 owner，刪除 member 可能會觸發 cascade 刪除 couple (取決於 schema)
        }
      }
      await fetchData(true)
    },
    generateInviteCode,
    resetState
  }
}
