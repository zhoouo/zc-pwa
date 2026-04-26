import { computed, ref } from 'vue'
import type { Session, User } from '@supabase/supabase-js'

import { isSupabaseEnabled, supabase } from '../lib/supabase'

type UserMetadata = {
  avatar_url?: string
  nickname?: string
  title?: string
}

const loading = ref(true)
const errorMessage = ref('')
const session = ref<null | Session>(null)
const user = ref<null | User>(null)

const applySession = (nextSession: null | Session) => {
  session.value = nextSession
  user.value = nextSession?.user ?? null
}

if (supabase) {
  supabase.auth.getSession().then(({ data }) => {
    applySession(data.session)
    loading.value = false
  })

  supabase.auth.onAuthStateChange((_event, nextSession) => {
    applySession(nextSession)
    loading.value = false
  })
} else {
  loading.value = false
}

export const useSupabaseAuth = () => {
  const metadata = computed(() => (user.value?.user_metadata ?? {}) as UserMetadata)
  const isAuthenticated = computed(() => Boolean(user.value))

  const signIn = async (email: string, password: string) => {
    if (!supabase) {
      return { error: '尚未設定 Supabase。' }
    }

    errorMessage.value = ''
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password
    })

    if (error) {
      errorMessage.value = error.message
      return { error: error.message }
    }

    return { error: '' }
  }

  const signUp = async (email: string, password: string, nickname: string) => {
    if (!supabase) {
      return { error: '尚未設定 Supabase。' }
    }

    errorMessage.value = ''
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          nickname
        }
      }
    })

    if (error) {
      errorMessage.value = error.message
      return { error: error.message }
    }

    return { error: '' }
  }

  const signOut = async () => {
    if (!supabase) {
      return
    }

    await supabase.auth.signOut()
  }

  const updateMetadata = async (patch: UserMetadata) => {
    if (!supabase) {
      return { error: '尚未設定 Supabase。' }
    }

    errorMessage.value = ''
    const { error } = await supabase.auth.updateUser({
      data: patch
    })

    if (error) {
      errorMessage.value = error.message
      return { error: error.message }
    }

    return { error: '' }
  }

  const uploadAvatar = async (file: File) => {
    if (!supabase || !user.value) {
      return { error: '尚未設定 Supabase。' }
    }

    const extension = file.name.split('.').pop() || 'png'
    const path = `${user.value.id}/avatar.${extension}`

    const { error: uploadError } = await supabase.storage.from('avatars').upload(path, file, {
      cacheControl: '3600',
      contentType: file.type,
      upsert: true
    })

    if (uploadError) {
      errorMessage.value = uploadError.message
      return { error: uploadError.message }
    }

    const { data } = supabase.storage.from('avatars').getPublicUrl(path)
    return updateMetadata({ avatar_url: data.publicUrl })
  }

  return {
    errorMessage,
    isAuthenticated,
    isSupabaseEnabled,
    loading,
    metadata,
    session,
    signIn,
    signOut,
    signUp,
    updateMetadata,
    uploadAvatar,
    user
  }
}
