import { describe, expect, it } from 'vitest'
import { checkRemoteAiConfig, isProviderHost, looksLikeProviderSecret, REMOTE_AI_REASON_TEXT } from './aiConfig'
import { createAiProvider } from './aiProvider'

const OWN = { VITE_AI_ENDPOINT: 'https://clara-ai.example.com/v1/parse', VITE_AI_KEY: 'pub_clara_beta_7f3a9c' }

describe('R-01 · configuración del proveedor remoto', () => {
  it('sin variables no hay proveedor; con una sola, tampoco (y se dice)', () => {
    expect(checkRemoteAiConfig()).toEqual({ ok: false, reason: 'none' })
    expect(checkRemoteAiConfig({ VITE_AI_ENDPOINT: '', VITE_AI_KEY: ' ' })).toEqual({ ok: false, reason: 'none' })
    expect(checkRemoteAiConfig({ VITE_AI_ENDPOINT: OWN.VITE_AI_ENDPOINT })).toEqual({ ok: false, reason: 'incomplete' })
    expect(checkRemoteAiConfig({ VITE_AI_KEY: OWN.VITE_AI_KEY })).toEqual({ ok: false, reason: 'incomplete' })
  })

  it('un servicio propio por https con un token público pasa', () => {
    expect(checkRemoteAiConfig(OWN)).toEqual({ ok: true, endpoint: OWN.VITE_AI_ENDPOINT, origin: 'https://clara-ai.example.com', host: 'clara-ai.example.com' })
    expect(checkRemoteAiConfig({ VITE_AI_ENDPOINT: ' https://ai.example.org:8443/parse ', VITE_AI_KEY: 'token' })).toMatchObject({ ok: true, host: 'ai.example.org:8443' })
    expect(createAiProvider(OWN).id).toBe('remote')
  })

  it('el endpoint debe ser una URL https', () => {
    for (const endpoint of ['http://clara-ai.example.com/parse', 'ftp://x', 'clara-ai.example.com/parse', 'no es una url']) {
      expect(checkRemoteAiConfig({ ...OWN, VITE_AI_ENDPOINT: endpoint }), endpoint).toEqual({ ok: false, reason: 'insecureEndpoint' })
    }
  })

  it('un endpoint directo a un proveedor de IA se rechaza: la clave sería su credencial', () => {
    for (const host of ['api.openai.com', 'api.anthropic.com', 'generativelanguage.googleapis.com', 'api.mistral.ai', 'api.groq.com', 'openrouter.ai', 'miempresa.openai.azure.com', 'bedrock-runtime.us-east-1.amazonaws.com', 'API.OPENAI.COM']) {
      expect(isProviderHost(host), host).toBe(true)
      expect(checkRemoteAiConfig({ ...OWN, VITE_AI_ENDPOINT: `https://${host}/v1/chat/completions` }), host).toEqual({ ok: false, reason: 'providerHost' })
    }
    for (const host of ['clara-ai.example.com', 'openai.example.com', 'notapi.openai.com.evil.test', 'localhost']) expect(isProviderHost(host), host).toBe(false)
  })

  it('una clave con forma de secreto de proveedor se rechaza aunque el endpoint sea propio', () => {
    for (const key of ['sk-abc123', 'sk-proj-abc', 'sk-ant-api03-abc', 'sk-or-v1-abc', 'sk_live_abc', 'AIzaSyA1234567890abcdefghijklmnopqrstu', 'gsk_abc', 'xai-abc', 'r8_abc', 'hf_abc', 'pplx-abc', 'AKIAIOSFODNN7EXAMPLE', 'ghp_abcdefghijklmnopqrstuvwxyz0123', 'github_pat_abc', 'xoxb-123']) {
      expect(looksLikeProviderSecret(key), key).toBe(true)
      expect(checkRemoteAiConfig({ ...OWN, VITE_AI_KEY: key }), key).toEqual({ ok: false, reason: 'secretKey' })
      // La app no simula nada: con una clave así usa el análisis local.
      expect(createAiProvider({ ...OWN, VITE_AI_KEY: key }).id, key).toBe('local')
    }
    for (const key of ['pub_clara_beta_7f3a9c', 'clara-beta-2026', 'eyJhbGciOiJIUzI1NiJ9.e30.abc']) expect(looksLikeProviderSecret(key), key).toBe(false)
  })

  it('cada motivo de rechazo tiene un texto para el registro de compilación (sin la clave)', () => {
    for (const reason of ['incomplete', 'insecureEndpoint', 'providerHost', 'secretKey'] as const) expect(REMOTE_AI_REASON_TEXT[reason].length).toBeGreaterThan(20)
  })
})
