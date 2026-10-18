import { z } from 'zod'

// Zod probes `new Function('')` whenever a schema is created, to decide whether it may compile fast parsers. Our strict CSP has no
// 'unsafe-eval', so the browser reports that (caught) probe as a securitypolicyviolation. Loaded by instrumentation-client.ts, i.e.
// before any client module builds a schema; server code does not load it.
z.config({ jitless: true })
