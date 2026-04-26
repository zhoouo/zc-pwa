<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { ChevronDown, Check } from 'lucide-vue-next'

const props = defineProps<{
  modelValue: string | number
  options: Array<{ label: string; value: string | number }>
  placeholder?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string | number]
}>()

const isOpen = ref(false)
const containerRef = ref<HTMLElement | null>(null)

const selectedLabel = computed(() => {
  const option = props.options.find(o => o.value === props.modelValue)
  return option ? option.label : props.placeholder || '請選擇'
})

const toggle = () => (isOpen.value = !isOpen.value)

const selectOption = (value: string | number) => {
  emit('update:modelValue', value)
  isOpen.value = false
}

const handleClickOutside = (e: MouseEvent) => {
  if (containerRef.value && !containerRef.value.contains(e.target as Node)) {
    isOpen.value = false
  }
}

onMounted(() => document.addEventListener('click', handleClickOutside))
onUnmounted(() => document.removeEventListener('click', handleClickOutside))
</script>

<template>
  <div ref="containerRef" class="relative w-full">
    <button 
      type="button"
      class="flex w-full items-center justify-between rounded-[22px] border border-white/50 bg-white/45 px-4 py-3 text-sm text-ink outline-none transition-all duration-300 hover:bg-white/70 focus:border-gold/40"
      @click="toggle"
    >
      <span class="truncate font-medium">{{ selectedLabel }}</span>
      <ChevronDown 
        class="h-4 w-4 text-gold/60 transition-transform duration-500 ease-out"
        :class="{ 'rotate-180': isOpen }"
      />
    </button>

    <Transition name="calendar-fade">
      <div 
        v-if="isOpen" 
        class="glass-dropdown absolute bottom-full left-0 z-[110] mb-2 w-full min-w-[160px] overflow-hidden rounded-[24px] py-2 shadow-[0_12px_40px_rgba(178,138,92,0.15)]"
      >
        <button
          v-for="option in options"
          :key="option.value"
          type="button"
          class="flex w-full items-center justify-between px-4 py-3 text-left text-sm transition-colors duration-200"
          :class="[
            option.value === modelValue 
              ? 'bg-gold/15 text-gold font-bold' 
              : 'text-ink/75 hover:bg-white/60'
          ]"
          @click="selectOption(option.value)"
        >
          <span>{{ option.label }}</span>
          <Check v-if="option.value === modelValue" class="h-3.5 w-3.5 text-gold" />
        </button>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.calendar-fade-enter-active,
.calendar-fade-leave-active {
  transition: opacity 0.3s cubic-bezier(0.23, 1, 0.32, 1), transform 0.3s cubic-bezier(0.23, 1, 0.32, 1);
}

.calendar-fade-enter-from,
.calendar-fade-leave-to {
  opacity: 0;
  transform: translateY(12px) scale(0.98);
}

.glass-dropdown {
  background: rgba(255, 255, 255, 0.94);
  -webkit-backdrop-filter: blur(20px);
  backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.8);
}
</style>
