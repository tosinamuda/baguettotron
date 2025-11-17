import FingerprintJS, {Agent} from '@fingerprintjs/fingerprintjs'

const isBrowser = () => typeof window !== 'undefined'

let fpAgentPromise: Promise<Agent> | null = null

const getFingerprintAgent = () => {
  if (!fpAgentPromise) {
    fpAgentPromise = FingerprintJS.load()
  }
  return fpAgentPromise
}

const fallbackId = () => {
  if (isBrowser() && typeof window.crypto?.randomUUID === 'function') {
    return window.crypto.randomUUID()
  }
  const serverCrypto = globalThis.crypto as Crypto | undefined
  if (serverCrypto?.randomUUID) {
    return serverCrypto.randomUUID()
  }
  return `anon-${Math.random().toString(36).slice(2)}`
}

export const generateClientFingerprint = async (): Promise<string> => {
  if (!isBrowser()) {
    return fallbackId()
  }

  try {
    const agent = await getFingerprintAgent()
    const result = await agent.get()
    if (result.visitorId) {
      return result.visitorId
    }
  } catch (error) {
    console.warn('Fingerprint library failed, falling back to random id', error)
  }

  return fallbackId()
}
