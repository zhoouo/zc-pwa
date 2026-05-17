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
  }
]
