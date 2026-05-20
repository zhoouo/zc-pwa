export interface GiftConfig {
  targetDate: string // 'MM-DD' or 'YYYY-MM-DD'
  title: string
  description: string
  coins: number
  storageKey: string
}

export const activeGifts: GiftConfig[] = [
  // {
  //   targetDate: '',
  //   title: '',
  //   description: '',
  //   coins: 0,
  //   storageKey: ''
  // },
  {
    targetDate: '2026-05-17',
    title: '200天紀念日 !!!',
    description: '鼻鼻我愛你(づ> v <)づ♡',
    coins: 500,
    storageKey: '200天紀念日'
  },
  {
  targetDate: '2026-05-20',
  title: '520快樂!!!',
  description: '鼻鼻我愛你',
  coins: 1314,
  storageKey: '2026-05-20-1314'
  },
  {
  targetDate: '2026-05-20',
  title: '520快樂!!!',
  description: '鼻鼻我超級愛你',
  coins: 520,
  storageKey: '2026-05-20-520'
  },
  {
  targetDate: '2026-05-21',
  title: '520快樂!!!',
  description: '鼻鼻我愛你',
  coins: 1314,
  storageKey: '2026-05-20-1314'
  },
  {
  targetDate: '2026-05-21',
  title: '520快樂!!!',
  description: '鼻鼻我超級愛你',
  coins: 520,
  storageKey: '2026-05-20-520'
  }
]
