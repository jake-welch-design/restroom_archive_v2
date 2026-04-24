import { scrypt, randomBytes, timingSafeEqual } from 'crypto'
import { promisify } from 'util'

const scryptAsync = promisify(scrypt)

export async function hashPassword(plain: string): Promise<string> {
  const salt = randomBytes(16).toString('hex')
  const derived = await scryptAsync(plain, salt, 64) as Buffer
  return `scrypt:${salt}:${derived.toString('hex')}`
}

export async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  const parts = stored.split(':')
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false
  const [, salt, storedHex] = parts
  try {
    const derived = await scryptAsync(plain, salt, 64) as Buffer
    const storedBuf = Buffer.from(storedHex, 'hex')
    return derived.length === storedBuf.length && timingSafeEqual(derived, storedBuf)
  }
  catch {
    return false
  }
}
