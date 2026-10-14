import { supabase } from './supabase.js';

export const ROLES = ['owner', 'admin', 'editor', 'viewer'];
const refreshRequests = new Map();

export function readCookie(request, name) {
  const cookieHeader = request.headers.cookie || '';
  const entry = cookieHeader.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
  if (!entry) return null;
  try {
    return decodeURIComponent(entry.slice(name.length + 1));
  } catch {
    return null;
  }
}

function cookieOptions(maxAge) {
  return [
    'HttpOnly',
    'SameSite=Strict',
    'Path=/',
    `Max-Age=${maxAge}`,
    process.env.NODE_ENV === 'production' ? 'Secure' : ''
  ].filter(Boolean).join('; ');
}

function appendCookie(response, name, value, maxAge) {
  const current = response.getHeader('Set-Cookie');
  const next = `${name}=${encodeURIComponent(value)}; ${cookieOptions(maxAge)}`;
  response.setHeader('Set-Cookie', current ? [...(Array.isArray(current) ? current : [current]), next] : next);
}

export function setSessionCookies(response, session) {
  const accessAge = Math.max(0, (session.expires_at || Math.floor(Date.now() / 1000) + 3600) - Math.floor(Date.now() / 1000));
  appendCookie(response, 'oslo_access', session.access_token, accessAge);
  appendCookie(response, 'oslo_refresh', session.refresh_token, 60 * 60 * 24 * 30);
}

export function clearSessionCookies(response) {
  appendCookie(response, 'oslo_access', '', 0);
  appendCookie(response, 'oslo_refresh', '', 0);
}

export function authenticate(request, response, next) {
  void authenticateRequest(request, response, next).catch(next);
}

async function authenticateRequest(request, response, next) {
  const accessToken = readCookie(request, 'oslo_access');
  const refreshToken = readCookie(request, 'oslo_refresh');
  if (!accessToken && !refreshToken) return response.status(401).json({ error: 'Authentication required.' });

  let { data: { user }, error } = accessToken
    ? await supabase.auth.getUser(accessToken)
    : { data: { user: null }, error: new Error('Access token is missing.') };

  if (error && refreshToken) {
    let refreshRequest = refreshRequests.get(refreshToken);
    if (!refreshRequest) {
      refreshRequest = supabase.auth.refreshSession({ refresh_token: refreshToken });
      refreshRequests.set(refreshToken, refreshRequest);
    }
    let refreshResult;
    try {
      refreshResult = await refreshRequest;
    } finally {
      if (refreshRequests.get(refreshToken) === refreshRequest) refreshRequests.delete(refreshToken);
    }
    const { data, error: refreshError } = refreshResult;
    if (refreshError || !data.session) {
      clearSessionCookies(response);
      return response.status(401).json({ error: 'Your session has expired. Please sign in again.' });
    }
    setSessionCookies(response, data.session);
    user = data.user;
  } else if (error || !user) {
    clearSessionCookies(response);
    return response.status(401).json({ error: 'Your session is invalid. Please sign in again.' });
  }

  const { data: profile, error: profileError } = await supabase
    .from('user_profiles')
    .select('id, email, display_name, role, status, created_at')
    .eq('id', user.id)
    .maybeSingle();
  if (profileError) return next(profileError);
  if (!profile) return response.status(403).json({ error: 'User profile is not available. Contact the workspace owner.' });

  request.user = user;
  request.profile = profile;
  next();
}

export function requireActive(request, response, next) {
  if (request.profile?.status !== 'active') {
    return response.status(403).json({ error: 'Your account is awaiting owner approval.' });
  }
  next();
}

export function requireRoles(...roles) {
  return (request, response, next) => {
    if (!roles.includes(request.profile?.role)) {
      return response.status(403).json({ error: 'You do not have permission to perform this action.' });
    }
    next();
  };
}
