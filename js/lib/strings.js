export const DAT_KEY_REGEX = /[0-9a-f]{64}/i
export const KNOWN_DRIVE_TYPES = {
  'unwalled.garden/person': 'user',
  'unwalled.garden/module': 'module',
  'unwalled.garden/template': 'template',
  'webterm.sh/cmd-pkg': 'webterm command'
}

export function ucfirst (str) {
  if (!str) str = ''
  if (typeof str !== 'string') str = '' + str
  return str.charAt(0).toUpperCase() + str.slice(1)
}

export function pluralize (num, base, suffix = 's') {
  if (num === 1) { return base }
  return base + suffix
}

export function shorten (str, n = 6) {
  if (str.length > (n + 3)) {
    return str.slice(0, n) + '...'
  }
  return str
}

export function joinPath (...args) {
  var str = args[0]
  for (let v of args.slice(1)) {
    v = v && typeof v === 'string' ? v : ''
    let left = str.endsWith('/')
    let right = v.startsWith('/')
    if (left !== right) str += v
    else if (left) str += v.slice(1)
    else str += '/' + v
  }
  return str
}

export function toDomain (str) {
  if (!str) return ''
  try {
    var urlParsed = new URL(str)
    return urlParsed.hostname
  } catch (e) {
    // ignore, not a url
  }
  return str
}

export function toNiceDomain (str, len=4) {
  var domain = toDomain(str)
  if (DAT_KEY_REGEX.test(domain)) {
    domain = `${domain.slice(0, len)}..${domain.slice(-2)}`
  }
  return domain
}

export function toNiceUrl (str) {
  if (!str) return ''
  try {
    var urlParsed = new URL(str)
    if (DAT_KEY_REGEX.test(urlParsed.hostname)) {
      urlParsed.hostname = `${urlParsed.hostname.slice(0, 4)}..${urlParsed.hostname.slice(-2)}`
    }
    return urlParsed.toString()
  } catch (e) {
    // ignore, not a url
  }
  return str
}

export function makeSafe (str = '') {
  return str.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/&/g, '&amp;').replace(/"/g, '&quot;')
}

// search results are returned from beaker's search APIs with nonces wrapping the highlighted sections
// e.g. a search for "test" might return "the {500}test{/500} result"
// this enables us to safely escape the HTML, then replace the nonces with <strong> tags
export function highlightSearchResult (str = '', nonce = 0) {
  var start = new RegExp(`\\{${nonce}\\}`, 'g') // eg {500}
  var end = new RegExp(`\\{/${nonce}\\}`, 'g') // eg {/500}
  return makeSafe(str).replace(start, '<strong>').replace(end, '</strong>')
}

export function normalizeUrl (str = '') {
  try {
    let url = new URL(str)
    let res = url.protocol + '//' + url.hostname
    if (url.port) res += ':' + url.port
    res += url.pathname.replace(/(\/)$/, '') || '/'
    if (url.search && url.search !== '?') res += url.search
    if (url.hash && url.hash !== '#') res += url.hash
    return res
  } catch (e) {
    return str
  }
}

export function slugifyUrl (str = '') {
  try {
    let url = new URL(str)
    str = url.protocol + url.hostname + url.pathname + url.search + url.hash
  } catch (e) {
    // ignore
  }
  return slugify(normalizeUrl(str))
}

const reservedChars = /[ <>:"/\\|?*\x00-\x1F]/g
const endingDashes = /([-]+$)/g
export function slugify (str = '') {
  return str.replace(reservedChars, '-').replace(endingDashes, '')
}

export function toNiceTopic (t) {
  return t.replace(/_/g, ' ')
}

export function normalizeTopic (t) {
  return t.replace(/\s/g, '_')
}

export function isValidTopic (t) {
  return /[a-z0-9_\s]+/.test(t)
}

export function toNiceDriveType (dt) {
  if (!dt) return ''
  return KNOWN_DRIVE_TYPES[dt] || dt
}