// Client-side privacy is a browsing gate; static assets remain publicly accessible.
export const accessKeys = [
  {
    "salt": "b1f1eb8fc25c0c42469031a82de772dc",
    "hash": "119a41acb37007f631555e2e0681621e40661fa9eaec80141470d844f073b486",
    "iterations": 600000
  }
];

export async function verifyArtPassword(password) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  for (const entry of accessKeys) {
    const salt = Uint8Array.from(entry.salt.match(/../g), byte => parseInt(byte, 16));
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: entry.iterations }, key, 256);
    const actual = Array.from(new Uint8Array(bits), byte => byte.toString(16).padStart(2, '0')).join('');
    if (actual === entry.hash) return true;
  }
  return false;
}

export function matchesArt(art, mediums, status, unlocked) {
  return (art.visibility !== 'private' || unlocked)
    && (!mediums.length || mediums.includes(art.medium))
    && (!status || (art.status?.trim().toLowerCase() === 'sold' ? 'sold' : 'available') === status);
}
