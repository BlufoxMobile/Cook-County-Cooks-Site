// Stand-in for the Workers runtime module "cloudflare:workers" when the Worker is
// loaded in plain Node by test/run.mjs. Only what src/index.js imports.
export class DurableObject {
  constructor(ctx, env) { this.ctx = ctx; this.env = env; }
}
