import type { ModelConfig, SystemPromptTemplate } from '../types/models'

export async function getModels(): Promise<ModelConfig[]> {
  try {
    const res = await fetch('http://localhost:8000/api/models', {
      cache: 'force-cache',
      next: { revalidate: 3600 }, // Revalidate every hour
    })
    if (!res.ok) {
      console.error('Failed to fetch models:', res.status)
      return []
    }
    return res.json()
  } catch (error) {
    console.error('Error fetching models:', error)
    return []
  }
}

export async function getSystemPromptTemplates(): Promise<SystemPromptTemplate[]> {
  try {
    const res = await fetch('http://localhost:8000/api/system-prompt-templates', {
      cache: 'force-cache',
      next: { revalidate: 3600 }, // Revalidate every hour
    })
    if (!res.ok) {
      console.error('Failed to fetch system prompt templates:', res.status)
      return []
    }
    return res.json()
  } catch (error) {
    console.error('Error fetching system prompt templates:', error)
    return []
  }
}
