// Node module-resolution hook: maps "cloudflare:workers" to test/cf-stub.mjs so the
// Worker source can be imported unchanged. Registered by test/run.mjs.
export async function resolve(specifier, context, next) {
  if (specifier === 'cloudflare:workers') {
    return { url: new URL('./cf-stub.mjs', import.meta.url).href, shortCircuit: true };
  }
  return next(specifier, context);
}
