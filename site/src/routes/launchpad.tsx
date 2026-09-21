import { Link, createFileRoute } from '@tanstack/react-router'
import { ArrowLeft, Coins, Flame, KeyRound, Lock, Rocket, ShieldAlert, Sparkles } from 'lucide-react'
import { toast } from 'sonner'

import logoKeyAsset from '@/assets/zkey-key-horizontal.png.asset.json'

export const Route = createFileRoute('/launchpad')({
  head: () => ({
    meta: [
      { title: 'ZKEY Launchpad — Coming soon' },
      {
        name: 'description',
        content:
          'Launch a coin and it gets its own KEYs: burn that coin’s tokens to mint a KEY worth 0.01% of that coin’s MC + 80% of its 0.03% volume fees, redeemable for private ZEC. Coming soon.',
      },
      { property: 'og:type', content: 'website' },
      { property: 'og:title', content: 'ZKEY Launchpad — Coming soon' },
      {
        property: 'og:description',
        content:
          'Every launch gets its own KEYs — burn a coin’s tokens for a KEY, burn the KEY for private ZEC. Coming soon.',
      },
      { name: 'twitter:card', content: 'summary' },
      { name: 'twitter:title', content: 'ZKEY Launchpad — Coming soon' },
      {
        name: 'twitter:description',
        content:
          'Every launch gets its own KEYs — burn a coin’s tokens for a KEY, burn the KEY for private ZEC.',
      },
    ],
  }),
  component: LaunchpadPage,
})

const FEATURES = [
  {
    icon: Rocket,
    title: 'Launch a coin',
    body: 'The pad deploys a KEY collection tied to that coin’s mint.',
  },
  {
    icon: Flame,
    title: 'Burn tokens → mint KEY',
    body: 'Burn that coin’s tokens to mint one of that launch’s KEYs (NFT).',
  },
  {
    icon: Coins,
    title: 'Value from that coin',
    body: 'KEY value = 0.01% of that coin’s MC + 80% of (0.03% of that coin’s volume) ÷ its keys.',
  },
  {
    icon: KeyRound,
    title: 'Burn KEY → private ZEC',
    body: 'Attach a ZEC wallet and burn the KEY to receive that KEY’s value privately.',
  },
  {
    icon: Lock,
    title: 'Keys never mix',
    body: 'Each launch keeps its own KEY collection — value never crosses launches.',
  },
]

const SAMPLE_LAUNCHES = [
  { name: 'Sample Coin Alpha', ticker: 'ALPHA', keys: '12 KEYs minted' },
  { name: 'Sample Coin Beta', ticker: 'BETA', keys: '4 KEYs minted' },
  { name: 'Sample Coin Gamma', ticker: 'GAMMA', keys: '0 KEYs minted' },
]

function comingSoon() {
  toast('Coming soon — launches go live after launchpad ships')
}

function LaunchpadPage() {
  return (
    <main className="chrome-bg flex min-h-svh flex-col items-center px-4 py-14 sm:py-20">
      {/* Back to the burn tool */}
      <Link
        to="/"
        className="fixed left-4 top-4 z-20 flex items-center gap-1.5 rounded-full border border-amber-900/25 bg-[#f3e5b0]/80 px-3.5 py-1.5 text-xs font-semibold text-[#6b5618] shadow-[0_10px_24px_-14px_rgba(74,58,16,0.6)] backdrop-blur-sm transition-colors hover:bg-[#f3e5b0] hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" />
        Back to burn tool
      </Link>

      <article className="w-full max-w-2xl rounded-xl border border-amber-900/30 bg-[#fbf2cd] p-6 shadow-[0_20px_50px_-24px_rgba(74,58,16,0.5)] sm:p-10">
        {/* Hero */}
        <header>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              ZKEY Launchpad
            </h1>
            <span className="flex items-center gap-1.5 rounded-full border border-amber-900/25 bg-[#f3e5b0] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[#6b5618]">
              <span className="size-1.5 animate-pulse rounded-full bg-[#b3871a]" />
              Coming soon
            </span>
          </div>
          <p className="mt-2 font-mono text-[13px] text-[#7a6420] sm:text-sm">
            Every launch gets its own KEYs
          </p>
        </header>

        {/* What you'll be able to do */}
        <section className="mt-8">
          <h2 className="text-xs font-bold uppercase tracking-[0.14em] text-[#b3871a]">
            What you’ll be able to do
          </h2>
          <div className="mt-4 space-y-3">
            {FEATURES.map(({ icon: Icon, title, body }) => (
              <div
                key={title}
                className="flex items-start gap-4 rounded-lg border border-amber-900/20 bg-[#f3e5b0]/50 px-4 py-4 sm:px-5"
              >
                <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-[#F4B728] text-[#231F20] shadow-[0_2px_6px_rgba(74,58,16,0.25)]">
                  <Icon className="size-3.5" />
                </span>
                <div>
                  <h3 className="text-[15px] font-semibold text-foreground">{title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-foreground/80">{body}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* SAMPLE preview UI */}
        <section className="mt-8 rounded-lg border border-dashed border-amber-900/30 p-4 sm:p-5">
          <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.12em] text-[#7a6420]">
            <Sparkles className="size-3.5" />
            Preview — sample only
          </div>

          {/* Mock launch form */}
          <div className="mt-4 rounded-lg border border-amber-900/25 bg-[#fdf7dd] p-4 opacity-70">
            <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#7a6420]">
              Launch a coin
            </p>
            <div className="mt-3 space-y-2">
              <div className="flex h-10 items-center rounded-md border border-amber-900/25 bg-[#fbf2cd] px-3 font-mono text-xs text-muted-foreground/60">
                Coin name…
              </div>
              <div className="flex h-10 items-center rounded-md border border-amber-900/25 bg-[#fbf2cd] px-3 font-mono text-xs text-muted-foreground/60">
                Ticker…
              </div>
            </div>
            <button
              type="button"
              onClick={comingSoon}
              className="mt-3 h-10 w-full rounded-lg bg-primary text-sm font-bold text-primary-foreground shadow-[0_10px_24px_-10px_rgba(120,90,10,0.7)] transition-colors hover:bg-[#e6b800] active:translate-y-px"
            >
              Launch a coin
            </button>
          </div>

          {/* Mock launches list */}
          <p className="mt-5 text-[11px] font-bold uppercase tracking-[0.1em] text-[#7a6420]">
            Browse launches
          </p>
          <div className="mt-2 space-y-2">
            {SAMPLE_LAUNCHES.map((l) => (
              <button
                key={l.ticker}
                type="button"
                onClick={comingSoon}
                className="flex w-full items-center justify-between rounded-lg border border-amber-900/20 bg-[#f3e5b0]/60 px-4 py-3 text-left transition-colors hover:bg-[#f3e5b0]"
              >
                <span className="flex items-center gap-2 font-semibold text-foreground">
                  <span className="rounded bg-[#2c2410] px-2 py-0.5 font-mono text-[10px] font-bold text-[#f5e6a8]">
                    {l.ticker}
                  </span>
                  {l.name}
                </span>
                <span className="font-mono text-xs text-[#7a6420]/70">{l.keys}</span>
              </button>
            ))}
          </div>
          <p className="mt-3 font-mono text-[10px] text-[#7a6420]/60">
            SAMPLE — no live launches, CAs, or fills yet
          </p>
        </section>

        {/* Footer note */}
        <p className="mt-10 flex items-start gap-1.5 border-t border-dashed border-amber-900/25 pt-4 font-mono text-[11px] leading-relaxed text-[#7a6420]/80">
          <ShieldAlert className="mt-0.5 size-3.5 shrink-0" />
          Coming soon — the single-coin $ZKEY burner is live on the home page first.
        </p>
      </article>

      {/* Key logo — same bare style as home */}
      <a href="/" className="fixed left-4 top-16 z-10 sm:top-4 sm:left-auto sm:right-4" aria-label="ZKEY home">
        <img
          src={logoKeyAsset.url}
          alt="ZKEY key"
          className="h-auto w-20 drop-shadow-[0_3px_8px_rgba(74,58,16,0.35)]"
        />
      </a>
    </main>
  )
}
