/**
 * Autenticación contra el Azure AD B2C de LaLiga.
 *
 * El juego oficial (com.lfp.laligafantasy) usa el tenant B2C `laligadspprob2c`.
 * Para un uso personal nos interesa la policy ROPC (`B2C_1A_ResourceOwnerv2`),
 * que permite intercambiar email+contraseña por tokens sin abrir un navegador.
 *
 * Ojo: B2C devuelve el `id_token` como credencial útil; la API de Fantasy lo
 * acepta como Bearer. Guardamos el `refresh_token` para renovar sin volver a
 * mandar la contraseña.
 */

const AUTHORITY = "https://login.laliga.es/laligadspprob2c.onmicrosoft.com";
const TOKEN_URL = `${AUTHORITY}/oauth2/v2.0/token`;
const ROPC_POLICY = "B2C_1A_ResourceOwnerv2";

/** Cliente que la app móvil usa para el flujo de email+contraseña. */
const CLIENT_ID =
  process.env.FANTASY_CLIENT_ID ?? "af88bcff-1157-40a0-b579-030728aacf0b";
const REDIRECT_URI = "authredirect://com.lfp.laligafantasy";

type TokenSet = {
  token: string;
  refreshToken?: string;
  /** epoch ms */
  expiresAt: number;
};

/**
 * Caché en memoria del proceso. En local sobrevive a toda la sesión; en
 * serverless sobrevive mientras la lambda esté caliente y, si no, simplemente
 * se vuelve a hacer login. Los tokens duran ~24h así que esto basta.
 */
let cached: TokenSet | null = null;
/** Evita que N peticiones simultáneas disparen N logins. */
let inFlight: Promise<TokenSet> | null = null;

const SKEW_MS = 5 * 60 * 1000;

export class FantasyAuthError extends Error {
  constructor(
    message: string,
    readonly detail?: string,
  ) {
    super(message);
    this.name = "FantasyAuthError";
  }
}

function readTokenSet(raw: Record<string, unknown>): TokenSet {
  const token =
    (raw.access_token as string) || (raw.id_token as string) || "";
  if (!token) {
    throw new FantasyAuthError(
      "La respuesta de login no traía ningún token",
      JSON.stringify(raw).slice(0, 400),
    );
  }
  const expiresIn = Number(raw.expires_in ?? raw.id_token_expires_in ?? 3600);
  return {
    token,
    refreshToken: (raw.refresh_token as string) || undefined,
    expiresAt: Date.now() + expiresIn * 1000,
  };
}

async function postToken(body: Record<string, string>): Promise<TokenSet> {
  const res = await fetch(`${TOKEN_URL}?p=${ROPC_POLICY}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body).toString(),
    cache: "no-store",
  });

  const text = await res.text();
  let json: Record<string, unknown>;
  try {
    json = JSON.parse(text);
  } catch {
    throw new FantasyAuthError(
      `El endpoint de token respondió ${res.status} con algo que no es JSON`,
      text.slice(0, 400),
    );
  }

  if (!res.ok || json.error) {
    throw new FantasyAuthError(
      String(json.error_description ?? json.error ?? `HTTP ${res.status}`),
      text.slice(0, 400),
    );
  }

  return readTokenSet(json);
}

function loginWithPassword(): Promise<TokenSet> {
  const username = process.env.FANTASY_EMAIL;
  const password = process.env.FANTASY_PASSWORD;

  if (!username || !password) {
    throw new FantasyAuthError(
      "Faltan credenciales",
      "Define FANTASY_EMAIL y FANTASY_PASSWORD en .env.local (o pega un token en FANTASY_TOKEN).",
    );
  }

  return postToken({
    grant_type: "password",
    client_id: CLIENT_ID,
    scope: `openid ${CLIENT_ID} offline_access`,
    redirect_uri: REDIRECT_URI,
    username,
    password,
    response_type: "id_token",
  });
}

function refresh(refreshToken: string): Promise<TokenSet> {
  return postToken({
    grant_type: "refresh_token",
    client_id: CLIENT_ID,
    scope: `openid ${CLIENT_ID} offline_access`,
    redirect_uri: REDIRECT_URI,
    refresh_token: refreshToken,
    response_type: "id_token",
  });
}

async function obtain(previous: TokenSet | null): Promise<TokenSet> {
  if (previous?.refreshToken) {
    try {
      return await refresh(previous.refreshToken);
    } catch {
      // El refresh token también caduca: caemos a login completo.
    }
  }
  return loginWithPassword();
}

/**
 * Devuelve un Bearer válido, renovándolo por debajo cuando toca.
 * `force` invalida la caché (lo usa el reintento tras un 401).
 */
export async function getToken(force = false): Promise<string> {
  const manual = process.env.FANTASY_TOKEN?.trim();
  if (manual) return manual;

  if (force) cached = null;

  if (cached && cached.expiresAt - SKEW_MS > Date.now()) {
    return cached.token;
  }

  if (!inFlight) {
    const previous = cached;
    inFlight = obtain(previous)
      .then((set) => {
        cached = set;
        return set;
      })
      .finally(() => {
        inFlight = null;
      });
  }

  return (await inFlight).token;
}

export function forgetToken() {
  cached = null;
}
