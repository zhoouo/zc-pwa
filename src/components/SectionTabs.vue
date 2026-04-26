<script setup lang="ts">
defineProps<{
  items: Array<{ count?: number; key: string; label: string }>
  modelValue: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()
</script>

<template>
  <div class="section-tabs">
    <button
      v-for="item in items"
      :key="item.key"
      class="section-tab"
      :class="{ 'section-tab-active': modelValue === item.key }"
      @click="emit('update:modelValue', item.key)"
    >
      <span>{{ item.label }}</span>
      <span v-if="item.count !== undefined" class="section-tab-count">{{ item.count }}</span>
    </button>
  </div>
</template>
