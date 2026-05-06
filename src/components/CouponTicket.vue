<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted, reactive } from 'vue'
import type { Redemption, ShopItem, Profile } from '../types'
import { X, Ticket, Smartphone, Info } from 'lucide-vue-next'

const props = defineProps<{
  redemption: Redemption
  item: ShopItem
  redeemer: Profile
  provider: Profile
}>()

const emit = defineEmits(['close'])

const ticketRef = ref<HTMLElement | null>(null)
const isMobile = ref(false)
const needsPermission = ref(false)
const hasPermission = ref(false)

// 動畫狀態：目標值與當前值 (用於 LERP)
const target = reactive({ x: 0, y: 0 })
const current = reactive({ x: 0, y: 0 })
let rafId: number | null = null

// 陀螺儀歸零校準基準
const baseOrientation = reactive({ x: 0, y: 0 })
const isCalibrated = ref(false)

// 插值係數：決定跟隨的速度與滑順度 (0.1 左右最絲滑)
const LERP_FACTOR = 0.12

// 120fps 核心動畫循環
const tick = () => {
  current.x += (target.x - current.x) * LERP_FACTOR
  current.y += (target.y - current.y) * LERP_FACTOR
  
  rafId = requestAnimationFrame(tick)
}

onMounted(() => {
  isMobile.value = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
  
  // 啟動動畫循環
  rafId = requestAnimationFrame(tick)

  if (isMobile.value) {
    const isIOSPermissionRequired = typeof DeviceOrientationEvent !== 'undefined' && 
                                   typeof (DeviceOrientationEvent as any).requestPermission === 'function'
    
    if (isIOSPermissionRequired) {
      needsPermission.value = true
    } else {
      window.addEventListener('deviceorientation', handleMotion, { passive: true })
      hasPermission.value = true
    }
  }
})

onUnmounted(() => {
  if (rafId) cancelAnimationFrame(rafId)
  window.removeEventListener('deviceorientation', handleMotion)
})

// 請求動作感測權限 (iOS 13+)
const requestMotionPermission = async () => {
  try {
    if (typeof (DeviceOrientationEvent as any).requestPermission === 'function') {
      const permission = await (DeviceOrientationEvent as any).requestPermission()
      if (permission === 'granted') {
        hasPermission.value = true
        needsPermission.value = false
        window.addEventListener('deviceorientation', handleMotion, { passive: true })
      }
    } else {
      window.addEventListener('deviceorientation', handleMotion, { passive: true })
      hasPermission.value = true
      needsPermission.value = false
    }
  } catch (err) {
    console.error('Motion permission denied', err)
  }
}

// 處理陀螺儀 (手機端)
const handleMotion = (e: DeviceOrientationEvent) => {
  const b = e.beta || 0
  const g = e.gamma || 0

  // 第一次接收到有效數據時進行自動歸零校準
  if (!isCalibrated.value && (b !== 0 || g !== 0)) {
    baseOrientation.x = b
    baseOrientation.y = g
    isCalibrated.value = true
    return
  }

  // 計算相對於「打開時角度」的位移
  const rawX = b - baseOrientation.x
  const rawY = g - baseOrientation.y
  
  target.x = Math.min(Math.max(rawX / 4, -12), 12)
  target.y = Math.min(Math.max(rawY / 4, -12), 12)
}

// 處理滑鼠 (PC 端)
const handleMouseMove = (e: MouseEvent) => {
  if (isMobile.value || !ticketRef.value) return
  
  const rect = ticketRef.value.getBoundingClientRect()
  const px = (e.clientX - rect.left) / rect.width
  const py = (e.clientY - rect.top) / rect.height
  
  target.y = (px - 0.5) * 30
  target.x = (0.5 - py) * 30
}

const resetTilt = () => {
  if (isMobile.value) return
  target.x = 0
  target.y = 0
}

const ticketStyle = computed(() => ({
  transform: `perspective(1000px) rotateX(${current.x}deg) rotateY(${current.y}deg) translateZ(0)`,
  willChange: 'transform'
}))

const formattedDate = computed(() => {
  const date = new Date(props.redemption.createdAt)
  return new Intl.DateTimeFormat('zh-TW', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long'
  }).format(date)
})

const formattedTime = computed(() => {
  const date = new Date(props.redemption.createdAt)
  return new Intl.DateTimeFormat('zh-TW', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  }).format(date).replace('AM', '上午').replace('PM', '下午')
})

const qrUrl = computed(() => {
  const text = `${props.item.title} ദ്ദി/ᐠ｡‸｡ᐟ\\ `
  const encodedData = encodeURIComponent(text)
  return `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodedData}`
})

const ticketId = computed(() => {
  return props.redemption.id.slice(0, 8).toUpperCase()
})
</script>

<template>
  <div class="fixed inset-0 z-[110] flex items-center justify-center p-6 bg-ink/60" @click.self="emit('close')">
    <div class="relative w-full max-w-[340px] animate-ticket-in">
      <!-- 頂部關閉按鈕 -->
      <button @click="emit('close')" class="absolute -top-14 right-0 text-white/60 hover:text-white transition-colors p-2">
        <X class="h-8 w-8" />
      </button>

      <!-- 票券主體 -->
      <div 
        ref="ticketRef"
        class="ticket-container bg-white shadow-[0_32px_64px_-12px_rgba(0,0,0,0.5)] select-none"
        :style="ticketStyle"
        @mousemove="handleMouseMove"
        @mouseleave="resetTilt"
        @click.stop
      >
        <!-- 上半部 -->
        <div class="p-8 pb-6 relative">
          <div class="space-y-7 pointer-events-none">
            <div class="flex justify-between items-start">
              <div class="space-y-5">
                <div class="space-y-1">
                  <p class="text-[10px] uppercase tracking-[0.25em] text-ink/35 font-bold font-serif">日期 Date</p>
                  <h4 class="font-serif text-lg text-ink">{{ formattedDate }}</h4>
                </div>

                <div class="space-y-1">
                  <p class="text-[10px] uppercase tracking-[0.25em] text-ink/35 font-bold font-serif">時間 Time</p>
                  <h4 class="font-serif text-lg text-ink">{{ formattedTime }}</h4>
                </div>
              </div>
              <div class="text-ink/10">
                <Ticket class="h-12 w-12" />
              </div>
            </div>

            <div class="space-y-1">
              <p class="text-[10px] uppercase tracking-[0.25em] text-ink/35 font-bold font-serif">用戶名稱 User</p>
              <h4 class="font-serif text-2xl text-ink tracking-tight">{{ redeemer.name }}</h4>
            </div>

            <div class="pt-2 flex items-end justify-between">
              <div class="space-y-1">
                <p class="text-[10px] uppercase tracking-[0.25em] text-ink/35 font-bold font-serif">兌換項目 Item</p>
                <h4 class="font-serif text-xl text-ink leading-tight">{{ item.title }}</h4>
              </div>
              <div class="w-20 h-20 bg-white rounded-xl p-1.5 border border-black/5 shadow-sm">
                <img :src="qrUrl" class="w-full h-full mix-blend-multiply" alt="QR Code" />
              </div>
            </div>
          </div>
        </div>

        <!-- 中間虛線 -->
        <div class="relative h-8 flex items-center">
          <div class="w-full border-t-2 border-dashed border-black/10 mx-6"></div>
        </div>

        <!-- 下半部 -->
        <div class="p-8 pt-4 pb-12 relative">
          <div class="flex items-center justify-between pointer-events-none">
            <div class="flex items-center gap-3">
              <div class="w-12 h-12 rounded-full overflow-hidden border-2 border-white shadow-md bg-paper">
                <img v-if="redeemer.avatarUrl" :src="redeemer.avatarUrl" class="w-full h-full object-cover" />
                <div v-else class="w-full h-full flex items-center justify-center text-sm font-bold text-white" :style="{ backgroundColor: redeemer.avatarTone }">
                  {{ redeemer.name[0] }}
                </div>
              </div>
              <div>
                <p class="text-[13px] font-bold text-ink/80">{{ redeemer.name }}</p>
                <p class="text-[10px] uppercase tracking-widest text-ink/40 font-mono">#{{ ticketId }}</p>
              </div>
            </div>
            
            <div class="text-right">
              <p class="text-[9px] uppercase tracking-[0.15em] text-ink/30 font-bold">Issued By</p>
              <p class="font-serif text-sm text-ink/60 italic font-medium">ZC</p>
            </div>
          </div>
        </div>
      </div>

      <!-- 提示與權限 -->
      <transition name="fade">
        <div v-if="needsPermission" class="mt-6 flex flex-col items-center gap-3">
          <button 
            @click="requestMotionPermission"
            class="flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-xs text-white/80 border border-white/20 backdrop-blur-md shadow-lg active:scale-95 transition-transform"
          >
            <Smartphone class="h-4 w-4" />
            啟用 3D 傾斜感測
          </button>
          <div class="flex items-center gap-1.5 text-[9px] text-white/30 uppercase tracking-widest">
            <Info class="h-3 w-3" />
            僅限 HTTPS 安全連線使用
          </div>
        </div>
      </transition>
    </div>
  </div>
</template>

<style scoped>
.ticket-container {
  border-radius: 32px;
  background-image: 
    radial-gradient(circle at 2px 2px, rgba(0,0,0,0.02) 1px, transparent 0);
  background-size: 24px 24px;
  background-color: #ffffff;
  position: relative;
  overflow: hidden;
  
  /* 真・透明缺口 */
  mask-image: 
    radial-gradient(circle at 50% 0, transparent 20px, #000 21px),
    radial-gradient(circle at 50% 100%, transparent 20px, #000 21px),
    radial-gradient(circle at 0 63%, transparent 16px, #000 17px),
    radial-gradient(circle at 100% 63%, transparent 16px, #000 17px);
  mask-composite: intersect;
  -webkit-mask-composite: source-in;
}

@keyframes ticket-in {
  from {
    opacity: 0;
    transform: scale(0.85) translateY(40px) rotate(-3deg);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0) rotate(0deg);
  }
}

.animate-ticket-in {
  animation: ticket-in 0.7s cubic-bezier(0.19, 1, 0.22, 1) forwards;
}

.fade-enter-active, .fade-leave-active {
  transition: opacity 0.5s ease;
}
.fade-enter-from, .fade-leave-to {
  opacity: 0;
}
</style>
