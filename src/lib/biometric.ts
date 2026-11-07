/**
 * Huella con passkeys (WebAuthn) y la extensión PRF: la huella entrega un secreto de 32 bytes
 * que solo existe en tu teléfono (o en tu Gestor de contraseñas de Google), y con él se abre la llave
 * de tus datos. Si el teléfono no soporta PRF, la app sigue con el patrón.
 */
import { fromB64, randomBytes, toB64 } from './crypto';

export type BioSupport = 'yes' | 'maybe' | 'no';

type Caps = Record<string, boolean>;
type PKC = typeof PublicKeyCredential & { getClientCapabilities?: () => Promise<Caps> };

export async function biometricSupport(): Promise<BioSupport> {
  if (typeof window === 'undefined' || !('PublicKeyCredential' in window) || !navigator.credentials) return 'no';
  const P = PublicKeyCredential as PKC;
  try {
    const caps = await P.getClientCapabilities?.();
    if (caps) {
      if (caps['extension:prf'] === false) return 'no';
      if (caps['extension:prf'] && caps.userVerifyingPlatformAuthenticator !== false) return 'yes';
    }
  } catch {
    /* seguimos con la otra comprobación */
  }
  try {
    return (await P.isUserVerifyingPlatformAuthenticatorAvailable()) ? 'maybe' : 'no';
  } catch {
    return 'no';
  }
}

export interface BioRegistration {
  credId: string;
  prfSalt: string;
  prfOutput: ArrayBuffer;
}

type PrfResults = { prf?: { enabled?: boolean; results?: { first?: ArrayBuffer } } };

/** Crea la passkey y devuelve el secreto PRF. Lanza 'NOPRF' si el teléfono no lo soporta. */
export async function registerBiometric(label: string): Promise<BioRegistration> {
  const prfSalt = randomBytes(32);
  const cred = (await navigator.credentials.create({
    publicKey: {
      rp: { name: label },
      user: { id: randomBytes(16), name: label, displayName: label },
      challenge: randomBytes(32),
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 },
        { type: 'public-key', alg: -257 },
      ],
      authenticatorSelection: { authenticatorAttachment: 'platform', residentKey: 'preferred', userVerification: 'required' },
      timeout: 60_000,
      extensions: { prf: { eval: { first: prfSalt } } } as AuthenticationExtensionsClientInputs,
    },
  })) as PublicKeyCredential | null;
  if (!cred) throw new Error('CANCEL');
  const ext = cred.getClientExtensionResults() as PrfResults;
  if (!ext.prf?.enabled && !ext.prf?.results?.first) throw new Error('NOPRF');
  const credId = toB64(new Uint8Array(cred.rawId));
  const prfOutput = ext.prf?.results?.first ?? (await prfWithBiometric(credId, toB64(prfSalt)));
  return { credId, prfSalt: toB64(prfSalt), prfOutput };
}

/** Pide la huella y devuelve el secreto PRF de la passkey guardada. */
export async function prfWithBiometric(credId: string, prfSalt: string): Promise<ArrayBuffer> {
  const assertion = (await navigator.credentials.get({
    publicKey: {
      challenge: randomBytes(32),
      allowCredentials: [{ type: 'public-key', id: fromB64(credId), transports: ['internal', 'hybrid'] }],
      userVerification: 'required',
      timeout: 60_000,
      extensions: { prf: { eval: { first: fromB64(prfSalt) } } } as AuthenticationExtensionsClientInputs,
    },
  })) as PublicKeyCredential | null;
  if (!assertion) throw new Error('CANCEL');
  const out = (assertion.getClientExtensionResults() as PrfResults).prf?.results?.first;
  if (!out) throw new Error('NOPRF');
  return out;
}
