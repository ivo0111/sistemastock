const BASE_URL = '/api/v1'

function getToken() {
  return localStorage.getItem('token')
}

function setToken(token) {
  localStorage.setItem('token', token)
}

function removeToken() {
  localStorage.removeItem('token')
}

// Limpia toda la sesión (token + datos de usuario en caché). Usar esto,
// no removeToken() solo, en cualquier lugar donde se cierre sesión —
// si queda "user" en localStorage sin token, AuthContext cree que hay
// sesión válida y se genera un loop de redirecciones /login <-> /.
function clearSession() {
  localStorage.removeItem('token')
  localStorage.removeItem('user')
}


async function request(endpoint, options = {}) {
  const token = getToken()
  const headers = { 'Content-Type': 'application/json', ...options.headers }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(`${BASE_URL}${endpoint}`, { ...options, headers })
  if (res.status === 401) {
    clearSession()
    if (window.location.pathname !== '/login') {
      window.location.href = '/login'
    }
    throw new Error('Sesión expirada')
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    const msg = body?.error?.message || `Error ${res.status}`
    const err = new Error(msg)
    err.code = body?.error?.code
    err.status = res.status
    throw err
  }

  if (res.status === 204) return null
  return res.json()
}

export function get(endpoint, params) {
  let url = endpoint
  if (params) {
    const qs = new URLSearchParams()
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== '') qs.append(k, v)
    }
    const qstr = qs.toString()
    if (qstr) url += `?${qstr}`
  }
  return request(url)
}

export function post(endpoint, data) {
  return request(endpoint, { method: 'POST', body: JSON.stringify(data) })
}

export function put(endpoint, data) {
  return request(endpoint, { method: 'PUT', body: JSON.stringify(data) })
}

export function del(endpoint) {
  return request(endpoint, { method: 'DELETE' })
}

export async function getHtml(endpoint) {
  const token = getToken()
  const headers = {}
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(`${BASE_URL}${endpoint}`, { headers })
  if (res.status === 401) {
    clearSession()
    if (window.location.pathname !== '/login') {
      window.location.href = '/login'
    }
    throw new Error('Sesión expirada')
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    const msg = body?.error?.message || `Error ${res.status}`
    const err = new Error(msg)
    err.code = body?.error?.code
    err.status = res.status
    throw err
  }
  return res.text()
}

export function loginUser(usuario, password) {
  return post('/auth/login', { usuario, password })
}

export { setToken, removeToken, clearSession }