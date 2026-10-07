/**
 * Desbloqueo con biometría del dispositivo mediante WebAuthn (huella, rostro o PIN del sistema).
 * Sin servidor no se verifica la firma: lo que protege es que el autenticador de plataforma exige
 * verificación de la persona antes de responder. Si el navegador no lo ofrece, no hay botón.
 */
export function webAuthnAvailable(): boolean {
  return typeof PublicKeyCredential !== 'undefined' && typeof navigator !== 'undefined' && !!navigator.credentials && window.isSecureContext
}

export async function platformAuthenticatorAvailable(): Promise<boolean> {
  if (!webAuthnAvailable()) return false
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
  } catch {
    return false
  }
}

function toBase64Url(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(s: string): Uint8Array {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '='))
  return Uint8Array.from(b, (c) => c.charCodeAt(0))
}

function challenge(): Uint8Array {
  const c = new Uint8Array(32)
  crypto.getRandomValues(c)
  return c
}

/** Registra una credencial de plataforma. Devuelve su id (base64url) o `null` si la persona canceló o no hay soporte. */
export async function registerBiometric(rpName: string): Promise<string | null> {
  if (!(await platformAuthenticatorAvailable())) return null
  try {
    const userId = new Uint8Array(16)
    crypto.getRandomValues(userId)
    const cred = (await navigator.credentials.create({
      publicKey: {
        challenge: challenge() as BufferSource,
        rp: { name: rpName },
        user: { id: userId as BufferSource, name: 'clara-local', displayName: rpName },
        pubKeyCredParams: [
          { type: 'public-key', alg: -7 },
          { type: 'public-key', alg: -257 },
        ],
        authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' },
        timeout: 60_000,
        attestation: 'none',
      },
    })) as PublicKeyCredential | null
    return cred ? toBase64Url(cred.rawId) : null
  } catch {
    return null
  }
}

/** Pide al autenticador verificar a la persona con la credencial guardada. */
export async function verifyBiometric(credentialId: string): Promise<boolean> {
  if (!webAuthnAvailable()) return false
  try {
    const cred = await navigator.credentials.get({
      publicKey: {
        challenge: challenge() as BufferSource,
        allowCredentials: [{ type: 'public-key', id: fromBase64Url(credentialId) as BufferSource }],
        userVerification: 'required',
        timeout: 60_000,
      },
    })
    return !!cred
  } catch {
    return false
  }
}
