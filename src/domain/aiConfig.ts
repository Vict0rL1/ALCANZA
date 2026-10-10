/**
 * Configuración del proveedor remoto del asistente (R-01 de la auditoría 2026-10-09).
 *
 * Todo lo que empiece por `VITE_` acaba en el paquete que descarga cualquier navegador: es público
 * por definición. Por eso `VITE_AI_KEY` solo puede ser un token público de alcance limitado para un
 * servicio PROPIO, que guarde la credencial real del proveedor, imponga cuotas y autorice por
 * usuario. Nunca la clave de OpenAI, Anthropic, Google, Mistral… ni un endpoint que vaya directo a
 * ellos: eso sería regalar una credencial reutilizable a quien abra la app.
 *
 * La comprobación corre dos veces con la misma regla: al compilar (`vite.config.ts`, la
 * compilación falla) y en la app (`createAiProvider`, se usa el análisis local). Nunca se simula un
 * proveedor remoto que no exista.
 */
export type RemoteAiEnv = { VITE_AI_ENDPOINT?: string; VITE_AI_KEY?: string }

export type RemoteAiReason =
  /** Ni endpoint ni clave: análisis local, sin más. */
  | 'none'
  /** Solo uno de los dos: no se conecta a nada y se avisa (una clave sin endpoint también viajaría en el paquete). */
  | 'incomplete'
  /** El endpoint no es una URL https. */
  | 'insecureEndpoint'
  /** El endpoint apunta directo a un proveedor de IA: la clave sería su credencial. */
  | 'providerHost'
  /** La clave tiene la forma de un secreto de proveedor. */
  | 'secretKey'

export type RemoteAiCheck = { ok: true; endpoint: string; origin: string; host: string } | { ok: false; reason: RemoteAiReason }

/** Hosts (exactos o por sufijo) de proveedores de IA: una clave que vaya directa a ellos es un secreto reutilizable. */
export const PROVIDER_API_HOSTS: readonly string[] = [
  'api.openai.com',
  '.openai.com',
  '.openai.azure.com',
  '.cognitiveservices.azure.com',
  'api.anthropic.com',
  '.anthropic.com',
  'generativelanguage.googleapis.com',
  'aiplatform.googleapis.com',
  '.googleapis.com',
  'api.mistral.ai',
  'api.cohere.com',
  'api.cohere.ai',
  'api.groq.com',
  'openrouter.ai',
  'api.together.xyz',
  'api.deepseek.com',
  'api.x.ai',
  'api.perplexity.ai',
  'api.replicate.com',
  'api-inference.huggingface.co',
  'router.huggingface.co',
  '.amazonaws.com',
]

/** Formas conocidas de claves de proveedor (no de tokens públicos propios). */
export const PROVIDER_SECRET_PATTERNS: readonly RegExp[] = [
  /^sk-/i, // OpenAI (`sk-`, `sk-proj-`), Anthropic (`sk-ant-`), OpenRouter (`sk-or-`), DeepSeek, Mistral…
  /^sk_(live|test)_/i, // Stripe
  /^AIza[0-9A-Za-z_-]{20,}$/, // Google API key
  /^ya29\./, // Google OAuth
  /^gsk_/, // Groq
  /^xai-/i, // xAI
  /^r8_/, // Replicate
  /^hf_/, // Hugging Face
  /^pplx-/i, // Perplexity
  /^AKIA[0-9A-Z]{16}$/, // AWS access key id
  /^(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}$/, // GitHub
  /^github_pat_/,
  /^xox[abprs]-/, // Slack
]

export function isProviderHost(host: string): boolean {
  const h = host.toLowerCase()
  return PROVIDER_API_HOSTS.some((p) => (p.startsWith('.') ? h.endsWith(p) || h === p.slice(1) : h === p))
}

export function looksLikeProviderSecret(key: string): boolean {
  return PROVIDER_SECRET_PATTERNS.some((p) => p.test(key))
}

export function checkRemoteAiConfig(env: RemoteAiEnv = {}): RemoteAiCheck {
  const endpoint = (env.VITE_AI_ENDPOINT ?? '').trim()
  const key = (env.VITE_AI_KEY ?? '').trim()
  if (!endpoint && !key) return { ok: false, reason: 'none' }
  if (!endpoint || !key) return { ok: false, reason: 'incomplete' }
  let url: URL
  try {
    url = new URL(endpoint)
  } catch {
    return { ok: false, reason: 'insecureEndpoint' }
  }
  if (url.protocol !== 'https:') return { ok: false, reason: 'insecureEndpoint' }
  if (isProviderHost(url.hostname)) return { ok: false, reason: 'providerHost' }
  if (looksLikeProviderSecret(key)) return { ok: false, reason: 'secretKey' }
  return { ok: true, endpoint, origin: url.origin, host: url.host }
}

/** Texto para el error de compilación (en el registro de CI, no en la interfaz). */
export const REMOTE_AI_REASON_TEXT: Record<Exclude<RemoteAiReason, 'none'>, string> = {
  incomplete: 'VITE_AI_ENDPOINT y VITE_AI_KEY van juntos: define los dos o ninguno (una clave sin endpoint también viajaría en el paquete).',
  insecureEndpoint: 'VITE_AI_ENDPOINT debe ser una URL https.',
  providerHost: 'VITE_AI_ENDPOINT apunta directo a un proveedor de IA: la clave sería su credencial y cualquiera que abra la app la vería. Usa un servicio propio que guarde la credencial real.',
  secretKey: 'VITE_AI_KEY tiene la forma de una clave secreta de proveedor. Todo lo que empieza por VITE_ es público: usa un token de alcance limitado para un servicio propio.',
}
