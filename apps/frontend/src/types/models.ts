export interface ModelConfig {
  id: number
  model_name: string
  display_name: string
  thinking_behavior: 'controllable' | 'fixed' | 'none'
  thinking_tags: string | null
  default_temperature: number
  default_max_tokens: number
  max_context_tokens: number
  supports_system_prompt: boolean
}

export interface SystemPromptTemplate {
  id: number
  name: string
  description: string
  content: string
  is_default: boolean
  category: string | null
}
