import { createClient } from '@supabase/supabase-js'

// ВСТАВ СВОЇ ДАНІ СЮДИ:
const supabaseUrl = 'https://hlqqzftlsrjxbtaqbsif.supabase.co'
const supabaseKey = 'sb_publishable_AwLC44Ia4JR7JHNzW3u6aQ_4NltmCDK'

/* Адреса потрібна не тільки клієнту: Edge Functions живуть на тому
   самому домені, і сторінка новин ходить до них напряму. */
export const SUPABASE_URL = supabaseUrl

export const supabase = createClient(supabaseUrl, supabaseKey)