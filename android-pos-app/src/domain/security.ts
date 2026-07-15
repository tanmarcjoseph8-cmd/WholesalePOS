const iterations = 210_000;

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export async function hashSecret(secret: string) {
  if (secret.length < 4) throw new Error("PIN or password must contain at least four characters.");
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), "PBKDF2", false, ["deriveBits"]);
  const hash = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations, hash: "SHA-256" }, key, 256);
  return `pbkdf2$${iterations}$${bytesToBase64(salt)}$${bytesToBase64(new Uint8Array(hash))}`;
}

export async function verifySecret(secret: string, encoded: string) {
  const [algorithm, iterationText, saltText, expectedText] = encoded.split("$");
  if (algorithm !== "pbkdf2" || !iterationText || !saltText || !expectedText) return false;
  const rounds = Number(iterationText);
  if (!Number.isSafeInteger(rounds) || rounds < 100_000) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), "PBKDF2", false, ["deriveBits"]);
  const hash = new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", salt: base64ToBytes(saltText), iterations: rounds, hash: "SHA-256" }, key, 256));
  const expected = base64ToBytes(expectedText);
  if (hash.length !== expected.length) return false;
  let difference = 0;
  for (let index = 0; index < hash.length; index += 1) difference |= (hash[index] ?? 0) ^ (expected[index] ?? 0);
  return difference === 0;
}

