<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue'
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from 'lucide-vue-next'

const props = defineProps<{
  modelValue: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const isOpen = ref(false)
const containerRef = ref<HTMLElement | null>(null)

// 內部日曆狀態
const viewDate = ref(new Date(props.modelValue || Date.now()))
const today = new Date()
today.setHours(0, 0, 0, 0)

const months = ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月']
const weekDays = ['日', '一', '二', '三', '四', '五', '六']

const currentYear = computed(() => viewDate.value.getFullYear())
const currentMonth = computed(() => viewDate.value.getMonth())

const daysInMonth = computed(() => {
  const year = currentYear.value
  const month = currentMonth.value
  
  const firstDayOfMonth = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  
  const days = []
  
  // 填充上個月的空白
  for (let i = 0; i < firstDayOfMonth; i++) {
    days.push({ day: null, fullDate: null })
  }
  
  // 填充當月天數
  for (let i = 1; i <= daysInMonth; i++) {
    const d = new Date(year, month, i)
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    const fullDate = `${y}-${m}-${dd}`
    
    days.push({
      day: i,
      fullDate,
      isToday: d.getTime() === today.getTime(),
      isSelected: fullDate === props.modelValue
    })
  }
  
  return days
})

const toggle = () => (isOpen.value = !isOpen.value)

const selectDay = (fullDate: string | null) => {
  if (!fullDate) return
  emit('update:modelValue', fullDate)
  isOpen.value = false
}

const prevMonth = () => {
  viewDate.value = new Date(currentYear.value, currentMonth.value - 1, 1)
}

const nextMonth = () => {
  viewDate.value = new Date(currentYear.value, currentMonth.value + 1, 1)
}

const handleClickOutside = (e: MouseEvent) => {
  if (containerRef.value && !containerRef.value.contains(e.target as Node)) {
    isOpen.value = false
  }
}

const formattedDisplay = computed(() => {
  if (!props.modelValue) return '選擇日期'
  const date = new Date(props.modelValue)
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`
})

onMounted(() => document.addEventListener('click', handleClickOutside))
onUnmounted(() => document.removeEventListener('click', handleClickOutside))
</script>

<template>
  <div ref="containerRef" class="relative w-full">
    <button 
      type="button"
      class="flex w-full items-center justify-between rounded-[22px] border border-white/45 bg-white/55 px-4 py-3 text-sm text-ink outline-none transition hover:bg-white/75 focus:border-gold/55"
      @click="toggle"
    >
      <span>{{ formattedDisplay }}</span>
      <CalendarIcon class="h-4 w-4 text-gold/70" />
    </button>

    <Transition name="fade-slide">
      <div 
        v-if="isOpen" 
        class="glass-panel absolute bottom-full left-0 z-[100] mb-2 w-full min-w-[280px] rounded-[24px] p-4 sm:w-[320px]"
      >
        <div class="mb-4 flex items-center justify-between">
          <button type="button" class="rounded-full p-1 transition hover:bg-white/40" @click="prevMonth">
            <ChevronLeft class="h-4 w-4 text-ink/60" />
          </button>
          <span class="font-serif text-sm font-medium">{{ currentYear }}年 {{ months[currentMonth] }}</span>
          <button type="button" class="rounded-full p-1 transition hover:bg-white/40" @click="nextMonth">
            <ChevronRight class="h-4 w-4 text-ink/60" />
          </button>
        </div>

        <div class="grid grid-cols-7 gap-1 text-center">
          <div v-for="day in weekDays" :key="day" class="mb-2 text-[10px] font-bold text-ink/30 uppercase tracking-widest">
            {{ day }}
          </div>
          
          <div 
            v-for="(dateObj, idx) in daysInMonth" 
            :key="idx"
            class="flex aspect-square items-center justify-center"
          >
            <button
              v-if="dateObj.day"
              type="button"
              class="flex h-8 w-8 items-center justify-center rounded-full text-xs transition"
              :class="[
                dateObj.isSelected 
                  ? 'bg-ink text-mist font-bold' 
                  : 'text-ink/75 hover:bg-white/60',
                dateObj.isToday && !dateObj.isSelected ? 'border border-gold/40 text-gold' : ''
              ]"
              @click="selectDay(dateObj.fullDate)"
            >
              {{ dateObj.day }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.fade-slide-enter-active,
.fade-slide-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.fade-slide-enter-from,
.fade-slide-leave-to {
  opacity: 0;
  transform: translateY(8px);
}

.glass-panel {
  background: rgba(255, 255, 255, 0.96);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.8);
}
</style>
