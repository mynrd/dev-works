import { exec } from 'node:child_process';

// Fixed resource id for Azure DevOps.
const RESOURCE = '499b84ac-1321-427f-aa17-267ca6975798';
const REFRESH_MARGIN_MS = 5 * 60 * 1000;

let cached = null; // { token, expiresAt }
let inflight = null;

export async function getToken(force = false) {
  if (!force && cached && cached.expiresAt - Date.now() > REFRESH_MARGIN_MS) return cached.token;
  if (!inflight) inflight = fetchToken().finally(() => { inflight = null; });
  return inflight;
}

function fetchToken() {
  return new Promise((resolve, reject) => {
    exec(
      `az account get-access-token --resource ${RESOURCE} -o json`,
      { windowsHide: true, maxBuffer: 1 << 20 },
      (err, stdout, stderr) => {
        if (err) {
          const msg = (stderr || err.message || '').trim().split('\n').pop();
          return reject(new AuthError(`az account get-access-token failed. Run "az login". ${msg}`));
        }
        let j;
        try { j = JSON.parse(stdout); } catch { return reject(new AuthError('az returned non-JSON output')); }
        const expiresAt = j.expires_on
          ? Number(j.expires_on) * 1000
          : Date.parse(String(j.expiresOn).replace(' ', 'T').slice(0, 19));
        cached = { token: j.accessToken, expiresAt };
        resolve(j.accessToken);
      }
    );
  });
}

export class AuthError extends Error {
  constructor(msg) { super(msg); this.name = 'AuthError'; this.status = 401; }
}
