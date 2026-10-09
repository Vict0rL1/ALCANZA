import { createContext, useContext } from 'react'
import type { LockState } from './useLock'

export const LockContext = createContext<LockState | null>(null)

export function useLockState(): LockState | null {
  return useContext(LockContext)
}
