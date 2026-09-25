




export const PREFLIGHT_TIMEOUT_MS = 8000;



const CORS_TRUTHFUL = [/(^|\.)github\.io$/i];

function absUrl(url) {
  try { return new URL(url, document.baseURI); } catch { return null; }
}



function verdict(kind, status, detail, length) {
  return {
    verdict: kind,
    status: status || 0,
    detail: detail || '',
    length: Number.isFinite(length) ? length : -1
  };
}



function cancelBody(res) {
  try { if (res && res.body && typeof res.body.cancel === 'function') res.body.cancel().catch(() => {}); }
  catch {   }
}

 
function bodyLength(res) {
  try {
    const raw = res.headers.get('content-length');
    if (raw === null || raw === '') return -1;
    const n = Number(raw);
    return Number.isFinite(n) ? n : -1;
  } catch { return -1; }
}



export function preflight(url, opts = {}) {
  const timeoutMs = opts.timeoutMs || PREFLIGHT_TIMEOUT_MS;
  const u = absUrl(url);
  if (!u || typeof fetch !== 'function') return Promise.resolve(verdict('unknown'));

  const sameOrigin = u.origin === location.origin;
  const truthful = sameOrigin || CORS_TRUTHFUL.some((re) => re.test(u.hostname));

  
  
  const withTimeout = (init) => {
    let ctrl = null;
    try { ctrl = typeof AbortController === 'function' ? new AbortController() : null; }
    catch { ctrl = null; }
    const timer = ctrl ? setTimeout(() => { try { ctrl.abort(); } catch {   } }, timeoutMs) : 0;
    const done = () => { if (timer) clearTimeout(timer); };
    return {
      promise: fetch(u.href, Object.assign({
        method: 'GET',
        
        
        cache: 'no-store',
        credentials: 'omit',
        redirect: 'follow',
        signal: ctrl ? ctrl.signal : undefined
      }, init)),
      done,
      aborted: () => !!(ctrl && ctrl.signal && ctrl.signal.aborted)
    };
  };

  const first = withTimeout({ mode: sameOrigin ? 'same-origin' : 'cors' });

  return first.promise.then(
    (res) => {
      first.done();
      cancelBody(res);
      if (res.status === 405 || res.status === 501) return verdict('unknown', res.status, 'method refused');
      const len = bodyLength(res);
      

      if (res.ok && len === 0) return verdict('empty', res.status, 'content-length: 0', len);
      if (res.ok || (res.status >= 200 && res.status < 400)) return verdict('ok', res.status, '', len);
      return verdict('gone', res.status, '', len);
    },
    (err) => {
      first.done();
      if (first.aborted() || (err && err.name === 'AbortError')) return verdict('slow');
      

      

      let retry = null;
      const retryAfter = new Promise((r) => setTimeout(r, 400)).then(() => {
        retry = withTimeout({ mode: sameOrigin ? 'same-origin' : 'cors' });
        return retry.promise;
      });
      return retryAfter.then(
        (res) => {
          if (retry) retry.done();
          cancelBody(res);
          if (res.status === 405 || res.status === 501) return verdict('unknown', res.status, 'method refused');
          const len = bodyLength(res);
          if (res.ok && len === 0) return verdict('empty', res.status, 'content-length: 0', len);
          if (res.ok || (res.status >= 200 && res.status < 400)) return verdict('ok', res.status, 'on retry', len);
          return verdict('gone', res.status, '', len);
        },
        (errR) => {
          if (retry) retry.done();
          if ((retry && retry.aborted()) || (errR && errR.name === 'AbortError')) return verdict('slow');
          
          
          
          const second = withTimeout({ mode: 'no-cors' });
          return second.promise.then(
            (res2) => {
              second.done();
              cancelBody(res2);
              
              
              
              return truthful
                ? verdict('gone', 0, 'no CORS header from a host that always sends one')
                : verdict('unknown', 0, 'no CORS header');
            },
            (err2) => {
              second.done();
              if (second.aborted() || (err2 && err2.name === 'AbortError')) return verdict('slow');
              return verdict('unreachable', 0, (err2 && err2.message) || 'network error');
            }
          );
        }
      );
    }
  ).catch(() => verdict('unknown'));
}



export function preflightCopy(v, label, _host) {
  const name = label || 'This tool';
  switch (v.verdict) {
    case 'empty':
      return `${name} answered, but the page that came back is empty. It may be mid-update — try again in a minute.`;
    case 'gone':
      return v.status === 404
        ? `${name} is not at its usual address any more (404). It may have been renamed or moved.`
        : v.status
          ? `${name} answered with an error (HTTP ${v.status}) instead of the tool.`
          : `${name} has nothing at its address any more — the page it points at is gone.`;
    case 'unreachable':
      return `${name} could not be reached. If you are on store wifi, check you are past the sign-in page.`;
    case 'slow':
      return `${name} is not answering. It may be the network rather than the tool.`;
    default:
      return `${name} could not be shown inside the site.`;
  }
}
