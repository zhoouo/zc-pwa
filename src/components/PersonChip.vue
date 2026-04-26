<script setup lang="ts">
import { computed } from 'vue'

import type { Profile } from '../types'

const props = withDefaults(
  defineProps<{
    profile: Profile
    size?: 'sm' | 'md'
    subtitle?: string
  }>(),
  {
    size: 'sm',
    subtitle: ''
  }
)

const initials = computed(() => props.profile.name.trim().slice(0, 1) || '你')
const avatarClasses = computed(() =>
  props.size === 'md'
    ? 'h-11 w-11 text-sm'
    : 'h-8 w-8 text-[11px]'
)
const nameClasses = computed(() => (props.size === 'md' ? 'text-sm' : 'text-xs'))
</script>

<template>
  <div class="inline-flex items-center gap-2">
    <div
      class="flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/60 text-ink"
      :class="[avatarClasses, `bg-gradient-to-br ${profile.avatarTone}`]"
    >
      <img
        v-if="profile.avatarUrl"
        :src="profile.avatarUrl"
        :alt="profile.name"
        class="h-full w-full object-cover"
      />
      <span v-else>{{ initials }}</span>
    </div>
    <div class="min-w-0">
      <p :class="nameClasses" class="truncate text-ink/78">{{ profile.name }}</p>
      <p v-if="subtitle" class="truncate text-[11px] text-ink/45">{{ subtitle }}</p>
    </div>
  </div>
</template>
