export interface Client {
  id: number
  fingerprint: string
  system_prompt: string | null
  temperature: number | null
  top_p: number | null
  top_k: number | null
  repetition_penalty: number | null
  do_sample: boolean | null
  max_tokens: number | null
  created_at: string
  updated_at: string
}

export interface ClientUpdateRequest {
  system_prompt?: string
  temperature?: number
  top_p?: number
  top_k?: number
  repetition_penalty?: number
  do_sample?: boolean
  max_tokens?: number
}

export interface GenerationParams {
  do_sample: boolean
  temperature: number
  top_p: number
  top_k: number
  repetition_penalty: number
  max_tokens: number
}
