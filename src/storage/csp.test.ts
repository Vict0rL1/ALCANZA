import { describe, expect, it } from 'vitest'
import { buildCsp, remoteOrigin } from '../../vite.config'

describe('CSP de la versión compilada', () => {
  it('solo conecta con la propia app; con un proveedor remoto https añade exactamente su origen', () => {
    expect(buildCsp()).toContain("connect-src 'self';")
    expect(buildCsp('https://ai.example.com/v1/parse?x=1')).toContain("connect-src 'self' https://ai.example.com;")
    expect(remoteOrigin('http://ai.example.com')).toBeNull()
    expect(remoteOrigin('no es una url')).toBeNull()
    expect(buildCsp('http://ai.example.com')).toContain("connect-src 'self';")
    expect(buildCsp()).toContain("font-src 'self'")
  })
})
