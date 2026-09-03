import * as jose from 'jsr:@panva/jose@6'

console.log('FUNecob Edge main worker started')

const JWT_SECRET = Deno.env.get('JWT_SECRET')
const SUPABASE_JWKS = parseJwks(Deno.env.get('SUPABASE_JWKS'))
const VERIFY_JWT = Deno.env.get('VERIFY_JWT') === 'true'

function parseJwks(raw: string | undefined): jose.JSONWebKeySet | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    return parsed?.keys && Array.isArray(parsed.keys) ? parsed as jose.JSONWebKeySet : null
  } catch {
    return null
  }
}

function getAuthToken(req: Request): string {
  const authHeader = req.headers.get('authorization')
  if (!authHeader) throw new Error('Missing authorization header')
  const [bearer, token] = authHeader.split(' ')
  if (bearer !== 'Bearer' || !token) throw new Error("Auth header is not 'Bearer {token}'")
  return token
}

async function isValidLegacyJWT(jwt: string): Promise<boolean> {
  if (!JWT_SECRET) return false
  try {
    await jose.jwtVerify(jwt, new TextEncoder().encode(JWT_SECRET))
    return true
  } catch {
    return false
  }
}

async function isValidJWT(jwt: string): Promise<boolean> {
  if (!SUPABASE_JWKS) return false
  try {
    await jose.jwtVerify(jwt, jose.createLocalJWKSet(SUPABASE_JWKS))
    return true
  } catch {
    return false
  }
}

async function isValidHybridJWT(jwt: string): Promise<boolean> {
  const { alg } = jose.decodeProtectedHeader(jwt)
  if (alg === 'HS256') return isValidLegacyJWT(jwt)
  if (alg === 'ES256' || alg === 'RS256') return isValidJWT(jwt)
  return false
}

function getServiceName(req: Request): string | null {
  const url = new URL(req.url)
  const parts = url.pathname.split('/').filter(Boolean)

  // Kong/Supabase normalmente encaminha como /functions/v1/<function>.
  // Também aceita diretamente /<function> para manter compatibilidade.
  if (parts[0] === 'functions' && parts[1] === 'v1') {
    return parts[2] || null
  }

  return parts[0] || null
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'OPTIONS' && VERIFY_JWT) {
    try {
      if (!await isValidHybridJWT(getAuthToken(req))) {
        return new Response(JSON.stringify({ msg: 'Invalid JWT' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        })
      }
    } catch (e) {
      return new Response(JSON.stringify({ msg: String(e) }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      })
    }
  }

  const serviceName = getServiceName(req)
  if (!serviceName) {
    return new Response(JSON.stringify({ msg: 'missing function name in request' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const servicePath = `/home/deno/functions/${serviceName}`
  const envVarsObj = Deno.env.toObject()
  const envVars = Object.keys(envVarsObj).map((key) => [key, envVarsObj[key]])

  try {
    const worker = await EdgeRuntime.userWorkers.create({
      servicePath,
      memoryLimitMb: 150,
      workerTimeoutMs: 60_000,
      noModuleCache: false,
      importMapPath: '/home/deno/functions/deno.jsonc',
      envVars,
    })
    return await worker.fetch(req)
  } catch (e) {
    console.error('Edge Function worker error:', e)
    return new Response(JSON.stringify({ msg: String(e) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
