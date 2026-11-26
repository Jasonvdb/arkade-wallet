import { defineConfig, devices } from '@playwright/test'
import { existsSync, readdirSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'

/**
 * Paykit end-to-end tests (`src/test/e2e/paykit`). They need the local demo services: the Pubky Dispatch
 * on http://127.0.0.1:18580, the fake Homeserver on http://127.0.0.1:18590 and the regtest stack (arkd on
 * :7070, bitcoind for `arkdemo fund`). The wallet dev server is reused when it already runs on :3002.
 *
 * The browser is the cached Playwright headless shell unless PAYKIT_E2E_CHROMIUM names one.
 */
function chromium(): string | undefined {
  if (process.env.PAYKIT_E2E_CHROMIUM) return process.env.PAYKIT_E2E_CHROMIUM
  const cache = join(homedir(), 'Library/Caches/ms-playwright')
  if (!existsSync(cache)) return undefined
  const dirs = readdirSync(cache)
    .filter((d) => /^chromium_headless_shell-\d+$/.test(d))
    .sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]))
  for (const d of dirs) {
    const exe = join(cache, d, 'chrome-headless-shell-mac-arm64', 'chrome-headless-shell')
    if (existsSync(exe)) return exe
  }
  return undefined
}

const executablePath = chromium()

export default defineConfig({
  testDir: './src/test/e2e/paykit',
  timeout: 240_000,
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  outputDir: process.env.PAYKIT_E2E_OUTPUT ?? 'test-results/paykit',
  use: {
    baseURL: 'http://localhost:3002',
    headless: true,
    trace: 'retain-on-failure',
    permissions: ['clipboard-read', 'clipboard-write'],
    actionTimeout: 30_000,
    navigationTimeout: 30_000,
    contextOptions: { reducedMotion: 'reduce' },
    launchOptions: executablePath ? { executablePath } : undefined,
  },
  webServer: {
    command:
      'VITE_EXECUTOR_ENABLED=false VITE_NOSTR_RELAY_URL=ws://127.0.0.1:9 VITE_DELEGATE_ENABLED=false pnpm start --host 127.0.0.1 --strictPort',
    url: 'http://localhost:3002',
    reuseExistingServer: true,
    timeout: 120_000,
  },
  projects: [
    { name: 'Mobile Chrome', use: { ...devices['Pixel 7'] } },
    { name: 'Desktop Chrome', use: { ...devices['Desktop Chrome'], viewport: { width: 1920, height: 1080 } } },
  ],
})
