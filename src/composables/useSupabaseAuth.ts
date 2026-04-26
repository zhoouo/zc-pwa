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

  const compressImage = (file: File, maxWidth = 1024, quality = 0.8): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.readAsDataURL(file)
      reader.onload = (event) => {
        const img = new Image()
        img.src = event.target?.result as string
        img.onload = () => {
          const canvas = document.createElement('canvas')
          let width = img.width
          let height = img.height

          if (width > maxWidth) {
            height = (maxWidth / width) * height
            width = maxWidth
          }

          canvas.width = width
          canvas.height = height
          const ctx = canvas.getContext('2d')
          ctx?.drawImage(img, 0, 0, width, height)

          canvas.toBlob(
            (blob) => {
              if (blob) resolve(blob)
              else reject(new Error('Canvas to Blob failed'))
            },
            'image/jpeg',
            quality
          )
        }
        img.onerror = (err) => reject(err)
      }
      reader.onerror = (err) => reject(err)
    })
  }

  const uploadFile = async (bucket: string, file: File | Blob, originalName?: string) => {
    if (!supabase || !user.value) {
      return { error: '尚未設定 Supabase 或未登入。' }
    }

    const extension = originalName?.split('.').pop() || 'jpg'
    const fileName = `${Date.now()}.${extension}`
    const path = `${user.value.id}/${fileName}`

    const { error: uploadError } = await supabase.storage.from(bucket).upload(path, file, {
      cacheControl: '3600',
      contentType: file instanceof File ? file.type : 'image/jpeg',
      upsert: true
    })

    if (uploadError) {
      errorMessage.value = uploadError.message
      return { error: uploadError.message }
    }

    const { data } = supabase.storage.from(bucket).getPublicUrl(path)
    return { error: '', url: data.publicUrl }
  }

  const uploadAvatar = async (file: File) => {
    try {
      const compressed = await compressImage(file, 400, 0.7)
      const result = await uploadFile('avatars', compressed, file.name)
      if (result.error) return { error: result.error }
      return updateMetadata({ avatar_url: result.url })
    } catch (err: any) {
      return { error: err.message || '頭像處理失敗' }
    }
  }

  const deleteFile = async (bucket: string, url: string) => {
    if (!supabase || !url) return
    
    const searchStr = `/public/${bucket}/`
    const index = url.indexOf(searchStr)
    if (index === -1) return
    
    const path = url.substring(index + searchStr.length)
    await supabase.storage.from(bucket).remove([path])
  }

  const deleteUserFolder = async (bucket: string, userId: string) => {
    if (!supabase) return
    
    const { data, error } = await supabase.storage.from(bucket).list(userId)
    if (error || !data || data.length === 0) return
    
    const paths = data.map((f) => `${userId}/${f.name}`)
    await supabase.storage.from(bucket).remove(paths)
  }

  const deleteAccount = async () => {
    if (!supabase || !user.value) {
      return { error: '尚未設定 Supabase 或未登入。' }
    }

    const userId = user.value.id
    
    // 1. 先清空存儲桶中的個人檔案
    try {
      await deleteUserFolder('avatars', userId)
      await deleteUserFolder('shop', userId)
    } catch (err) {
      console.error('Storage cleanup failed:', err)
    }

    // 2. 刪除資料庫帳號
    const { error } = await supabase.rpc('delete_account')
    if (error) return { error: error.message }
    
    await signOut()
    return { error: '' }
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
    uploadFile,
    deleteFile,
    deleteUserFolder,
    compressImage,
    deleteAccount,
    user
  }
}
