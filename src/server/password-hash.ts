import { randomBytes, scrypt, timingSafeEqual } from "node:crypto"

const PREFIX = "scrypt:"
const SALT_BYTES = 32
const KEY_LENGTH = 64
// Use lower N in development for faster hashing, moderate N in production per OWASP 2024
// N=16384 provides strong security while fitting in memory-constrained environments
const SCRYPT_PARAMS = {
  N: 16384, // Reduced from 32768 to prevent memory exhaustion on EC2
  r: 8,
  p: 1
}

// Wrapper for scrypt with options - promisify doesn't handle options parameter well
function scryptWithParams(password: string | Buffer, salt: string | Buffer, keylen: number, params: any): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keylen, params, (err, derivedKey) => {
      if (err) reject(err)
      else resolve(derivedKey)
    })
  })
}

export async function hashPassword(plaintext: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES)
  const hash = await scryptWithParams(plaintext, salt, KEY_LENGTH, SCRYPT_PARAMS)
  return `${PREFIX}${salt.toString("hex")}:${hash.toString("hex")}`
}

export async function verifyPassword(plaintext: string, stored: string): Promise<boolean> {
  if (!stored.startsWith(PREFIX)) return false
  const [saltHex, hashHex] = stored.slice(PREFIX.length).split(":")
  const actualHash = await scryptWithParams(plaintext, Buffer.from(saltHex, "hex"), KEY_LENGTH, SCRYPT_PARAMS)
  return timingSafeEqual(actualHash, Buffer.from(hashHex, "hex"))
}
