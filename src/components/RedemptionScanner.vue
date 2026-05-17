<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import jsQR from 'jsqr'
import { AlertCircle, Camera, CheckCircle2, Keyboard, QrCode, RotateCcw, ScanLine, X } from 'lucide-vue-next'
import type { Redemption, ShopItem } from '../types'
import { isMatchingRedemptionQr } from '../lib/redemptionQr'

type ScannerMode = 'checking' | 'requesting' | 'ready' | 'unsupported' | 'denied' | 'error' | 'matched' | 'mismatch'

const props = defineProps<{
  redemption: Redemption
  item: ShopItem
  busy?: boolean
}>()

const emit = defineEmits<{
  close: []
  matched: [redemptionId: string]
}>()

const videoRef = ref<HTMLVideoElement | null>(null)
const stream = ref<MediaStream | null>(null)
const mode = ref<ScannerMode>('checking')
const helperText = ref('正在檢查攝影機權限...')
const manualCode = ref('')
const showManualInput = ref(false)
const lastScannedValue = ref('')

let rafId: number | null = null
let lastRejectedAt = 0
let lastScanAt = 0
let scanCanvas: HTMLCanvasElement | null = null

const orderCode = computed(() => props.redemption.id.slice(0, 8).toUpperCase())
const scannerTitle = computed(() => `掃描「${props.item.title}」票券`)
const canScan = computed(() => mode.value === 'ready' || mode.value === 'mismatch')

const stopCamera = () => {
  if (rafId) {
    cancelAnimationFrame(rafId)
    rafId = null
  }

  stream.value?.getTracks().forEach((track) => track.stop())
  stream.value = null

  if (videoRef.value) {
    videoRef.value.srcObject = null
  }
}

const handleCandidate = (rawValue: string) => {
  if (!rawValue.trim() || mode.value === 'matched' || props.busy) return

  lastScannedValue.value = rawValue.trim()

  // Debug logging
  console.log('🔍 Scanned QR code:', rawValue)
  console.log('🎯 Expected redemption ID:', props.redemption.id)
  console.log('✅ Is matching?', isMatchingRedemptionQr(rawValue, props.redemption))

  if (isMatchingRedemptionQr(rawValue, props.redemption)) {
    mode.value = 'matched'
    helperText.value = '票券吻合，正在完成兌換單...'
    stopCamera()
    emit('matched', props.redemption.id)
    return
  }

  const now = Date.now()
  if (now - lastRejectedAt < 1000) return

  lastRejectedAt = now
  mode.value = 'mismatch'
  helperText.value = '這不是此兌換單的票券，請掃描對應票券。'
}

const scanFrame = async () => {
  if (!videoRef.value || !canScan.value) return

  try {
    const now = Date.now()
    if (
      now - lastScanAt >= 180 &&
      videoRef.value.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
      videoRef.value.videoWidth > 0 &&
      videoRef.value.videoHeight > 0
    ) {
      lastScanAt = now
      scanCanvas ??= document.createElement('canvas')
      scanCanvas.width = videoRef.value.videoWidth
      scanCanvas.height = videoRef.value.videoHeight

      const context = scanCanvas.getContext('2d', { willReadFrequently: true })
      if (context) {
        context.drawImage(videoRef.value, 0, 0, scanCanvas.width, scanCanvas.height)
        const imageData = context.getImageData(0, 0, scanCanvas.width, scanCanvas.height)
        const code = jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: 'attemptBoth'
        })

        if (code?.data) handleCandidate(code.data)
      }
    }
  } catch {
    helperText.value = '掃描時暫時讀不到 QR code，請把票券移近一點。'
  }

  if (canScan.value) {
    rafId = requestAnimationFrame(scanFrame)
  }
}

const startCamera = async () => {
  if (!navigator.mediaDevices?.getUserMedia) {
    mode.value = 'unsupported'
    helperText.value = '目前環境無法使用攝影機，請確認使用 HTTPS 或 localhost。'
    showManualInput.value = true
    return
  }

  try {
    mode.value = 'requesting'
    helperText.value = '正在請求攝影機授權...'

    const nextStream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1280 },
        height: { ideal: 720 }
      },
      audio: false
    })

    stream.value = nextStream

    if (videoRef.value) {
      videoRef.value.srcObject = nextStream
      await videoRef.value.play()
    }

    mode.value = 'ready'
    helperText.value = '把票券 QR code 放進框框裡，掃到正確票券才會完成。'
    rafId = requestAnimationFrame(scanFrame)
  } catch (error) {
    stopCamera()
    const name = error instanceof DOMException ? error.name : ''
    if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
      mode.value = 'denied'
      helperText.value = '攝影機權限被拒絕了，請到瀏覽器設定允許後再試一次。'
    } else {
      mode.value = 'error'
      helperText.value = '攝影機啟動失敗，請確認沒有其他 App 正在使用鏡頭。'
    }
    showManualInput.value = true
  }
}

const checkPermissionThenStart = async () => {
  try {
    const permission = await navigator.permissions?.query({ name: 'camera' as PermissionName })
    if (permission?.state === 'granted') {
      helperText.value = '已取得攝影機權限，正在開啟掃描器...'
    } else if (permission?.state === 'denied') {
      mode.value = 'denied'
      helperText.value = '攝影機權限目前被封鎖，請到瀏覽器設定允許後再試一次。'
      showManualInput.value = true
      return
    }
  } catch {
    helperText.value = '準備開啟攝影機...'
  }

  await startCamera()
}

const retryCamera = () => {
  stopCamera()
  showManualInput.value = false
  manualCode.value = ''
  mode.value = 'checking'
  void checkPermissionThenStart()
}

const submitManualCode = () => {
  handleCandidate(manualCode.value)
}

onMounted(() => {
  void checkPermissionThenStart()
})

onUnmounted(() => {
  stopCamera()
})
</script>

<template>
  <div class="fixed inset-0 z-[120] flex items-center justify-center bg-ink/75 p-4" @click.self="emit('close')">
    <article class="scanner-panel relative w-full max-w-[380px] overflow-hidden rounded-[32px] bg-paper text-ink shadow-2xl">
      <button
        class="absolute right-4 top-4 z-10 rounded-full bg-white/60 p-2 text-ink/55 transition hover:bg-white hover:text-ink"
        :disabled="busy"
        @click="emit('close')"
      >
        <X class="h-5 w-5" />
      </button>

      <div class="px-5 pb-5 pt-6">
        <div class="mb-4 flex items-start gap-3 pr-10">
          <div class="flex h-11 w-11 shrink-0 items-center justify-center rounded-[18px] bg-ink text-mist">
            <ScanLine class="h-5 w-5" />
          </div>
          <div>
            <p class="text-[10px] uppercase tracking-[0.22em] text-ink/40">Ticket Scanner</p>
            <h2 class="font-serif text-xl leading-tight">{{ scannerTitle }}</h2>
          </div>
        </div>

        <div class="scanner-view relative overflow-hidden rounded-[26px] bg-ink">
          <video
            ref="videoRef"
            class="h-full w-full object-cover"
            autoplay
            muted
            playsinline
            :class="{ 'opacity-35': mode !== 'ready' && mode !== 'mismatch' }"
          />

          <div class="absolute inset-0 scanner-shade"></div>
          <div class="scanner-frame absolute left-1/2 top-1/2 h-[68%] w-[68%] -translate-x-1/2 -translate-y-1/2 rounded-[28px]"></div>

          <div v-if="mode === 'checking' || mode === 'requesting'" class="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white">
            <Camera class="h-8 w-8 animate-pulse" />
            <p class="text-sm">{{ mode === 'checking' ? '檢查攝影機中' : '等待授權中' }}</p>
          </div>

          <div v-else-if="mode === 'unsupported' || mode === 'denied' || mode === 'error'" class="absolute inset-0 flex flex-col items-center justify-center gap-3 px-8 text-center text-white">
            <AlertCircle class="h-9 w-9 text-gold" />
            <p class="text-sm leading-6">{{ helperText }}</p>
          </div>

          <div v-else-if="mode === 'matched'" class="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white">
            <CheckCircle2 class="h-11 w-11 text-sage" />
            <p class="text-sm">{{ busy ? '完成兌換單中...' : '票券已驗證' }}</p>
          </div>

          <div class="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink/85 to-transparent px-5 pb-4 pt-12">
            <div class="flex items-center gap-2 text-xs text-white/82">
              <QrCode class="h-4 w-4 shrink-0" />
              <span>{{ helperText }}</span>
            </div>
          </div>
        </div>

        <div class="mt-4 rounded-[24px] border border-white/70 bg-white/45 px-4 py-3">
          <div class="flex items-center justify-between gap-3">
            <div>
              <p class="text-[10px] uppercase tracking-[0.2em] text-ink/35">Verify Code</p>
              <p class="font-mono text-sm text-ink/75">ORDER #{{ orderCode }}</p>
            </div>
            <button class="ghost-button !px-3 !py-2 !text-xs" type="button" @click="showManualInput = !showManualInput">
              <Keyboard class="h-4 w-4" />
              輸入
            </button>
          </div>

          <div v-if="showManualInput" class="mt-3 flex gap-2">
            <input
              v-model="manualCode"
              class="min-w-0 flex-1 rounded-[18px] border border-white/70 bg-white/70 px-3 py-2 font-mono text-xs text-ink outline-none placeholder:text-ink/30 focus:border-gold/50"
              placeholder="貼上完整 QR 內容"
              @keyup.enter="submitManualCode"
            />
            <button class="primary-button !px-3 !py-2 !text-xs" type="button" :disabled="busy" @click="submitManualCode">
              驗證
            </button>
          </div>

          <p v-if="lastScannedValue && mode === 'mismatch'" class="mt-2 text-[11px] text-red-500/75">
            掃到的票券與此兌換單不吻合。
          </p>
        </div>

        <div class="mt-4 flex gap-2">
          <button class="ghost-button flex-1 justify-center" type="button" :disabled="busy" @click="emit('close')">
            取消
          </button>
          <button class="primary-button flex-1 justify-center" type="button" :disabled="busy" @click="retryCamera">
            <RotateCcw class="h-4 w-4" />
            重試
          </button>
        </div>
      </div>
    </article>
  </div>
</template>

<style scoped>
.scanner-panel {
  background-image:
    radial-gradient(circle at top left, rgba(255, 255, 255, 0.8), transparent 46%),
    linear-gradient(180deg, #fffaf4 0%, #f5efe6 100%);
}

.scanner-view {
  aspect-ratio: 1;
}

.scanner-shade {
  background:
    radial-gradient(circle at center, transparent 0 39%, rgba(36, 31, 26, 0.28) 40%),
    linear-gradient(180deg, rgba(36, 31, 26, 0.02), rgba(36, 31, 26, 0.22));
}

.scanner-frame {
  border: 2px solid rgba(255, 249, 242, 0.9);
  box-shadow:
    0 0 0 999px rgba(36, 31, 26, 0.22),
    inset 0 0 24px rgba(255, 249, 242, 0.16);
}

.scanner-frame::before,
.scanner-frame::after {
  content: '';
  position: absolute;
  left: 14%;
  right: 14%;
  height: 2px;
  background: rgba(178, 138, 92, 0.9);
  box-shadow: 0 0 20px rgba(178, 138, 92, 0.55);
  animation: scan-line 1.8s ease-in-out infinite;
}

.scanner-frame::before {
  top: 22%;
}

.scanner-frame::after {
  bottom: 22%;
  animation-delay: 0.9s;
}

@keyframes scan-line {
  0%,
  100% {
    transform: translateY(-18px);
    opacity: 0.25;
  }

  50% {
    transform: translateY(18px);
    opacity: 1;
  }
}
</style>
