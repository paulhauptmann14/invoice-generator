// Runs in the browser before the app's client code. Order matters: zod must be configured before the first schema is created.
import '@/lib/zod-client-config'
