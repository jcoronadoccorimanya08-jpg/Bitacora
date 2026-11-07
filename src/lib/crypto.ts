/**
 * Cifrado local con la Web Crypto API del navegador.
 * La clave se deriva del PIN con PBKDF2-SHA256 y los datos se cifran con AES-GCM de 256 bits.
 * El PIN nunca se guarda: si se olvida, los datos no se pueden recuperar.
 */
export const KDF_ITERATIONS = 250_000;

export interface Sealed {
  v: 1;
  iter: number;
  salt: string;
  iv: string;
  ct: string;
}

const enc = new TextEncoder();
const dec = new TextDecoder();

export function toB64(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

export function fromB64(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function randomBytes(n: number): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(n));
}

export async function deriveKey(pin: string, salt: Uint8Array<ArrayBuffer>, iterations = KDF_ITERATIONS): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function seal(key: CryptoKey, salt: Uint8Array, iter: number, data: unknown): Promise<Sealed> {
  const iv = randomBytes(12);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(data))));
  return { v: 1, iter, salt: toB64(salt), iv: toB64(iv), ct: toB64(ct) };
}

/** Lanza un error si la clave (el PIN) no es la correcta o los datos fueron alterados. */
export async function unseal(key: CryptoKey, sealed: Sealed): Promise<unknown> {
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(sealed.iv) }, key, fromB64(sealed.ct));
  return JSON.parse(dec.decode(plain));
}

export function isSealed(v: unknown): v is Sealed {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return o.v === 1 && typeof o.iter === 'number' && typeof o.salt === 'string' && typeof o.iv === 'string' && typeof o.ct === 'string';
}

// ---------- Cifrado por sobre (Bitácora) ----------
// Los datos se cifran con una llave al azar (DK). La DK se guarda "envuelta" con una llave que sale
// del patrón (PBKDF2) y, si la activas, otra que sale de tu huella (passkey con PRF).
// Así cambiar el patrón o activar la huella no obliga a re-cifrar los datos.

export interface Wrapped {
  iv: string;
  ct: string;
}

export function newDataKey(): Uint8Array<ArrayBuffer> {
  return randomBytes(32);
}

export async function importDataKey(raw: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

export async function encryptBytes(key: CryptoKey, bytes: Uint8Array<ArrayBuffer>): Promise<Wrapped> {
  const iv = randomBytes(12);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, bytes));
  return { iv: toB64(iv), ct: toB64(ct) };
}

/** Lanza un error si la llave no es la correcta. */
export async function decryptBytes(key: CryptoKey, w: Wrapped): Promise<Uint8Array<ArrayBuffer>> {
  return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(w.iv) }, key, fromB64(w.ct)));
}

export async function encryptJSON(key: CryptoKey, data: unknown): Promise<Wrapped> {
  return encryptBytes(key, new TextEncoder().encode(JSON.stringify(data)));
}

export async function decryptJSON(key: CryptoKey, w: Wrapped): Promise<unknown> {
  return JSON.parse(new TextDecoder().decode(await decryptBytes(key, w)));
}

/** Llave para envolver la DK a partir de la salida PRF de la passkey (32 bytes). */
export async function keyFromPrf(prfOutput: ArrayBuffer | Uint8Array): Promise<CryptoKey> {
  const raw = prfOutput instanceof Uint8Array ? prfOutput : new Uint8Array(prfOutput);
  const base = await crypto.subtle.importKey('raw', raw as Uint8Array<ArrayBuffer>, 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(16), info: new TextEncoder().encode('bitacora-huella-v1') },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export function isWrapped(v: unknown): v is Wrapped {
  return typeof v === 'object' && v !== null && typeof (v as Wrapped).iv === 'string' && typeof (v as Wrapped).ct === 'string';
}
