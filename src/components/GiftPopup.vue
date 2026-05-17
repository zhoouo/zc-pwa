<template>
  <div v-if="isVisible" class="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-ink/40 backdrop-blur-sm transition-all duration-500" @click.self="close">
    <div ref="popupRef" class="glass-panel rounded-[28px] w-full max-w-[340px] p-8 flex flex-col items-center relative overflow-visible font-serif opacity-0" style="transform: scale(0.9);">
      
      <!-- Fireworks Particles Container -->
      <div ref="fireworksRef" class="absolute top-[40%] left-1/2 -translate-x-1/2 -translate-y-1/2 w-0 h-0 pointer-events-none z-10">
      </div>

      <!-- CSS Gift Box Container -->
      <div ref="boxContainerRef" class="relative w-32 h-36 flex flex-col items-center justify-end mb-6 mt-8 z-20">
        <!-- Box Lid -->
        <div ref="boxLidRef" class="w-32 h-9 bg-gold rounded-xl shadow-[0_4px_12px_rgba(0,0,0,0.15)] relative flex justify-center z-10 origin-bottom-right opacity-0" style="transform: translateY(-800px) rotate(-25deg);">
          <!-- Lid Ribbon -->
          <div class="w-5 h-full bg-mist/80 shadow-sm"></div>
          <!-- Lid Bow -->
          <div class="absolute -top-6 flex gap-0.5 drop-shadow-md">
            <div class="w-8 h-8 rounded-full border-[5px] border-mist/80 transform rotate-12"></div>
            <div class="w-8 h-8 rounded-full border-[5px] border-mist/80 transform -rotate-12"></div>
          </div>
        </div>
        
        <!-- Box Body -->
        <div ref="boxBodyRef" class="w-28 h-20 bg-gold/90 rounded-b-2xl shadow-inner relative flex justify-center overflow-hidden -mt-1 opacity-0" style="transform: translateY(-600px);">
          <!-- Body Ribbon -->
          <div class="w-5 h-full bg-mist/80 shadow-sm"></div>
        </div>
      </div>
      
      <!-- Text Content -->
      <div ref="textRef" class="flex flex-col items-center opacity-0">
        <h2 class="text-2xl font-bold text-ink mb-2 tracking-widest text-center">{{ title }}</h2>
        <p class="text-sm text-ink/60 text-center mb-8 font-medium">{{ description }}</p>
      </div>
      
      <!-- Coin Reward (Hidden initially) -->
      <div ref="coinRef" class="absolute top-[40%] left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center space-y-1 opacity-0 pointer-events-none z-40">
        <span class="text-5xl font-black text-gold drop-shadow-lg tracking-wider" style="-webkit-text-stroke: 1px rgba(255,255,255,0.8);">+{{ coins }}</span>
        <span class="text-sm tracking-[0.25em] text-ink/70 uppercase font-bold bg-mist/80 px-3 py-1 rounded-full shadow-sm mt-2">Coins</span>
      </div>
      
      <button ref="btnRef" @click="claim" class="primary-button w-full shadow-xl shadow-gold/20 py-4 text-base rounded-[20px] opacity-0 font-bold tracking-widest relative overflow-hidden">
        $͜ (^ ̮ ^)›
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { animate, stagger } from 'animejs'
import { useCoupleApp } from '../composables/useCoupleApp'

const props = defineProps({
  targetDate: { type: String, required: true }, // Format: 'MM-DD' or 'YYYY-MM-DD'
  title: { type: String, default: '禮物!!' },
  description: { type: String, default: '打開看看(づ> v <)づ♡！' },
  coins: { type: Number, default: 500 },
  storageKey: { type: String, required: true }
})

const emit = defineEmits(['claim'])

const { state } = useCoupleApp()

const isVisible = ref(false)
const popupRef = ref<HTMLElement | null>(null)
const boxContainerRef = ref<HTMLElement | null>(null)
const boxLidRef = ref<HTMLElement | null>(null)
const boxBodyRef = ref<HTMLElement | null>(null)
const textRef = ref<HTMLElement | null>(null)
const btnRef = ref<HTMLElement | null>(null)
const coinRef = ref<HTMLElement | null>(null)
const fireworksRef = ref<HTMLElement | null>(null)

onMounted(() => {
  const today = new Date()
  const yyyy = today.getFullYear()
  const mm = String(today.getMonth() + 1).padStart(2, '0')
  const dd = String(today.getDate()).padStart(2, '0')
  const currentDate = `${yyyy}-${mm}-${dd}`
  const currentMonthDay = `${mm}-${dd}`

  const isMatch = props.targetDate === currentDate || props.targetDate === currentMonthDay
  
  if (isMatch) {
    // Check if the ledger contains a record of claiming this gift
    const giftTag = `[禮物:${props.storageKey}]`
    const alreadyClaimedInLedger = state.ledger.some(entry => 
      entry.userId === 'self' &&
      entry.entryType === 'manual_adjustment' &&
      entry.sourceType === 'manual' &&
      entry.description.includes(giftTag)
    )

    // Check localStorage as secondary lock
    const alreadyClaimedInStorage = localStorage.getItem(`gift_claimed_${props.storageKey}_${yyyy}`)

    if (!alreadyClaimedInLedger && !alreadyClaimedInStorage) {
      isVisible.value = true
      
      // Give the browser enough time to complete the loader fade-out transition
      // before dropping the heavy box animation!
      setTimeout(() => {
        startEntranceAnimation()
      }, 450)
    }
  }
})

const startEntranceAnimation = () => {
  if (!popupRef.value) return

  // 1. Popup frame fades in normally
  animate(popupRef.value, {
    opacity: [0, 1],
    scale: [0.9, 1],
    duration: 600,
    ease: 'outQuad'
  })

  // 2. Box Body flies in from top like a heavy package
  animate(boxBodyRef.value, {
    y: [-600, 0],
    opacity: [1, 1],
    duration: 1000,
    ease: 'outBounce'
  })

  // 3. Box Lid flies in just after and lands on top
  animate(boxLidRef.value, {
    y: [-800, 0],
    rotate: [-25, 0],
    opacity: [1, 1],
    duration: 1100,
    ease: 'outBounce',
    delay: 150
  })

  // 4. Squish the whole box container when it lands for extra cuteness
  animate(boxContainerRef.value, {
    scaleY: [1, 0.85, 1.05, 1],
    scaleX: [1, 1.15, 0.95, 1],
    duration: 600,
    ease: 'outElastic(1.5, .5)',
    delay: 1000
  })

  // 5. Fade in text and button smoothly
  animate([textRef.value, btnRef.value], {
    opacity: [0, 1],
    y: [20, 0],
    delay: stagger(150, { start: 1200 }),
    duration: 800,
    ease: 'outQuart'
  })
}

const claim = () => {
  // Hide text and button quickly
  animate([textRef.value, btnRef.value], {
    opacity: 0,
    y: 10,
    duration: 300,
    ease: 'inQuad'
  })

  // Box Lid flies open enthusiastically
  animate(boxLidRef.value, {
    rotate: [0, 140],
    x: [0, 120],
    y: [0, -60],
    opacity: [1, 0],
    duration: 700,
    ease: 'outExpo'
  })

  // Box Body jumps up and shakes
  animate(boxBodyRef.value, {
    scale: [1, 1.1, 0],
    y: [0, 30, 0],
    opacity: [1, 1, 0],
    duration: 600,
    ease: 'inOutBack',
    delay: 100
  })

  // Fireworks Explosion!
  if (fireworksRef.value) {
    const colors = ['#b28a5c', '#89907d', '#f472b6', '#fbbf24', '#60a5fa', '#34d399', '#fff9f2']
    
    for (let i = 0; i < 60; i++) {
      const p = document.createElement('div')
      // Mix of circles and tiny squares for confetti feel
      p.className = `absolute ${Math.random() > 0.5 ? 'rounded-full' : 'rounded-sm'}`
      
      const size = 6 + Math.random() * 8
      p.style.width = `${size}px`
      p.style.height = `${size}px`
      p.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)]
      fireworksRef.value.appendChild(p)

      // Random angles for fireworks (all 360 degrees)
      const angle = Math.random() * Math.PI * 2
      const velocity = 60 + Math.random() * 200
      
      animate(p, {
        x: [0, Math.cos(angle) * velocity],
        y: [0, Math.sin(angle) * velocity + (Math.random() * 80)], // Add some gravity effect to Y
        scale: [0, 1, 0],
        rotate: [0, Math.random() * 360],
        opacity: [1, 0],
        duration: 800 + Math.random() * 800,
        ease: 'outCubic',
        delay: 200
      })
    }
  }

  // Coins pop out spectacularly from the explosion
  animate(coinRef.value, {
    opacity: [0, 1],
    scale: [0, 1.5, 1],
    y: [40, -40],
    duration: 1200,
    ease: 'outElastic(1.2, .5)',
    delay: 350
  })

  // Finally, fade out the whole popup container
  setTimeout(() => {
    animate(popupRef.value, {
      opacity: 0,
      scale: 0.9,
      duration: 500,
      ease: 'inQuad',
      onComplete: () => {
        isVisible.value = false
        const today = new Date()
        localStorage.setItem(`gift_claimed_${props.storageKey}_${today.getFullYear()}`, 'true')
        emit('claim', props.coins, `[禮物:${props.storageKey}] ${props.title}`)
      }
    })
  }, 2600)
}

const close = () => {
  animate(popupRef.value, {
    scale: 0.95,
    y: 10,
    opacity: 0,
    duration: 300,
    ease: 'inQuad',
    onComplete: () => {
      isVisible.value = false
    }
  })
}
</script>
