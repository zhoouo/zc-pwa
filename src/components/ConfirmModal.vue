<script setup lang="ts">
import { X } from 'lucide-vue-next'

defineProps<{
  show: boolean
  title: string
  message: string
  confirmText?: string
  cancelText?: string
  hideCancel?: boolean
  variant?: 'danger' | 'primary'
  confirmDisabled?: boolean
}>()

const emit = defineEmits(['confirm', 'cancel'])
</script>

<template>
  <Transition name="modal">
    <div v-if="show" class="fixed inset-0 z-[100] flex items-center justify-center px-4">
      <!-- Backdrop -->
      <div class="absolute inset-0 bg-ink/20 backdrop-blur-sm" @click="emit('cancel')"></div>
      
      <!-- Modal Content -->
      <article class="glass-panel relative w-full max-w-sm scale-100 rounded-[32px] p-6 shadow-2xl transition-all sm:p-8">
        <button 
          class="absolute right-5 top-5 text-ink/30 hover:text-ink/60"
          @click="emit('cancel')"
        >
          <X class="h-5 w-5" />
        </button>

        <div class="mb-6 mt-2">
          <h3 class="font-serif text-2xl text-ink">{{ title }}</h3>
          <p class="mt-3 text-sm leading-6 text-ink/65 whitespace-pre-wrap">{{ message }}</p>
        </div>

        <div v-if="$slots.default" class="mb-6">
          <slot />
        </div>

        <div class="flex flex-col gap-3">
          <button 
            class="primary-button w-full justify-center !py-3.5 !text-base shadow-lg disabled:cursor-not-allowed disabled:opacity-60"
            :class="{ '!bg-red-500 !border-red-500 !text-white': variant === 'danger' }"
            :disabled="confirmDisabled"
            @click="emit('confirm')"
          >
            {{ confirmText || '確定' }}
          </button>
          <button 
            v-if="!hideCancel"
            class="ghost-button w-full justify-center !py-3 !text-base"
            @click="emit('cancel')"
          >
            {{ cancelText || '取消' }}
          </button>
        </div>
      </article>
    </div>
  </Transition>
</template>

<style scoped>
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.3s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-active article,
.modal-leave-active article {
  transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.modal-enter-from article {
  transform: scale(0.9) translateY(10px);
}

.modal-leave-to article {
  transform: scale(0.95);
}
</style>
