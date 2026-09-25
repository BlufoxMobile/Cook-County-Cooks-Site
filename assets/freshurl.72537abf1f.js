




export function freshUrl(url, bucketMs) {
  try {
    const u = new URL(url, location.href);
    
    
    if (u.origin === location.origin) return u.href;
    const stamp = bucketMs
      ? Math.floor(Date.now() / bucketMs)   
      : Date.now();                          
    u.searchParams.set('_ccc', String(stamp));
    return u.href;
  } catch {
    return url;                              
  }
}
