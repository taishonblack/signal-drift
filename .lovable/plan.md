# Verify and harden production WHEP resolution

## Verified root cause

The current published asset at `https://makosrt.com/assets/index-WWgn8Ely.js` contains the hardcoded `https://stream.makosrt.com` base and constructs `${base}/${streamName}/whep`. Its production build has removed both the `/mediamtx` development branch and the unset environment-variable branch.

The checked-in call chain is:

```text
SignalTile
  -> LiveCamera (no baseUrl override)
  -> negotiateWhep(streamName, pc, label)
  -> whepEndpointForStream(streamName)
  -> resolveWhepBase()
  -> fetch(final WHEP URL)
```

Therefore, the observed POST to `https://makosrt.com/mediamtx/cam1/whep` did not come from the currently served production asset. It came from an older JavaScript bundle already loaded in that browser tab (or retained browser cache state during deployment propagation). It was not caused by the current production build setting `import.meta.env.DEV=true`; the deployed bundle proves the dev branch was statically removed.

## Changes

1. **Preserve the existing resolution order**
   - Keep `VITE_MEDIAMTX_WHEP_BASE` as an optional build-time override.
   - Keep `/mediamtx` only when `DEV=true` and `PROD=false`.
   - Keep `https://stream.makosrt.com` as the built-in production base.

2. **Carry resolution metadata to the POST call**
   - Extend the resolved endpoint result so `negotiateWhep()` receives the resolved base and source (`env`, `built-in`, or `dev-proxy`) together with the final URL.
   - Preserve explicit `baseUrl` override behavior without changing WebRTC negotiation.

3. **Add the requested runtime diagnostic immediately before `fetch()`**
   - Emit one credential-free `console.info` entry in production and development containing:
     - resolved base
     - base source
     - final WHEP URL
     - `import.meta.env.DEV`
     - `import.meta.env.PROD`
   - Expected production values:

```text
base=https://stream.makosrt.com
source=built-in
url=https://stream.makosrt.com/cam1/whep
DEV=false
PROD=true
```

4. **Add a production invariant**
   - Prevent a production build from ever using a relative `/mediamtx` base, including an accidental environment override.
   - Resolve to the built-in HTTPS base instead and report the actual selected source in the diagnostic.
   - Do not alter local Vite development or its proxy.

5. **Verify without publishing**
   - Test production-mode resolution for Source 1 and confirm the exact URL is `https://stream.makosrt.com/cam1/whep`.
   - Test development-mode resolution remains `/mediamtx/cam1/whep`.
   - Confirm the production bundle excludes the `/mediamtx` URL branch and contains the diagnostic fields.
   - Do not publish.

## Scope

Only WHEP base resolution, endpoint metadata, diagnostics, and focused tests will change. MediaMTX paths, source mapping, SRT, SDP/WebRTC/ICE behavior, backend, authentication, and infrastructure remain untouched.
