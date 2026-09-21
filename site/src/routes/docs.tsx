import { Link, createFileRoute } from '@tanstack/react-router'
import { ArrowLeft, ShieldAlert } from 'lucide-react'

import keyAsset from '@/assets/zkey-key.png.asset.json'

export const Route = createFileRoute('/docs')({
  head: () => ({
    meta: [
      { title: 'Docs — A fully private way to receive ZEC | ZKEY' },
      {
        name: 'description',
        content:
          'Burn 1,000,000 $ZKEY for a Solana KEY, burn the KEY, and receive its value in private ZEC. How the ZKEY burn works and why it stays private.',
      },
      { property: 'og:type', content: 'website' },
      { property: 'og:title', content: 'A fully private way to receive ZEC — ZKEY' },
      {
        property: 'og:description',
        content:
          'Burn $ZKEY for a KEY, burn the KEY, receive private ZEC. 0.01% of market cap + 80% of the 0.03% volume fees per KEY, with zero on-chain SOL→you trace.',
      },
      { name: 'twitter:card', content: 'summary' },
      { name: 'twitter:title', content: 'A fully private way to receive ZEC — ZKEY' },
      {
        name: 'twitter:description',
        content:
          'Burn $ZKEY for a KEY, burn the KEY, receive private ZEC. 0.01% of market cap + 80% of the 0.03% volume fees per KEY.',
      },
    ],
  }),
  component: DocsPage,
})

const STEPS = [
  {
    n: '1',
    title: 'Burn $ZKEY',
    body: 'Burn 1,000,000 $ZKEY → receive 1 Solana KEY (NFT).',
  },
  {
    n: '2',
    title: 'Hold or burn the KEY',
    body: 'Hold it while value accrues, or burn it when you want out.',
  },
  {
    n: '3',
    title: 'Receive private ZEC',
    body: 'Attach your shielded ZEC wallet → burn the KEY → receive that KEY’s value in ZEC.',
  },
]

const PRIVACY_POINTS = [
  'You don’t send SOL out yourself',
  'Funds sit in the vault',
  'After you burn $ZKEY then burn your KEY, a script sends ZEC to your wallet',
  'No on-chain SOL→you trail',
]

function SectionLabel({ children }: { children: string }) {
  return (
    <h2 className="text-xs font-bold uppercase tracking-[0.14em] text-[#b3871a]">{children}</h2>
  )
}

function DocsPage() {
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
          <img
            src={keyAsset.url}
            alt="ZKEY key"
            className="size-11 drop-shadow-[0_2px_6px_rgba(74,58,16,0.35)]"
          />
          <h1 className="mt-4 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            A fully private way to receive ZEC
          </h1>
          <p className="mt-2 font-mono text-[13px] text-[#7a6420] sm:text-sm">
            Burn $ZKEY → get a KEY → burn KEY → get ZEC privately
          </p>
        </header>

        {/* How it works — 3 numbered steps */}
        <section className="mt-10">
          <SectionLabel>How it works</SectionLabel>
          <div className="mt-4 space-y-3">
            {STEPS.map((step) => (
              <div
                key={step.n}
                className="flex items-start gap-4 rounded-lg border border-amber-900/20 bg-[#f3e5b0]/50 px-4 py-4 sm:px-5"
              >
                <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-[#F4B728] font-mono text-sm font-bold text-[#231F20] shadow-[0_2px_6px_rgba(74,58,16,0.25)]">
                  {step.n}
                </span>
                <div>
                  <h3 className="text-[15px] font-semibold text-foreground">{step.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-foreground/80">{step.body}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* What is a KEY worth? */}
        <section className="mt-10 rounded-lg border border-amber-900/20 bg-[#f3e5b0]/50 px-4 py-5 sm:px-5">
          <SectionLabel>What is a KEY worth?</SectionLabel>
          <ul className="mt-3 space-y-2 text-[15px] leading-relaxed text-foreground/90">
            <li className="flex gap-2">
              <span className="mt-[9px] size-1.5 shrink-0 rounded-full bg-[#F4B728]" />
              <span>
                <span className="font-semibold text-foreground">Base:</span> 0.01% of market cap
                (set independently of the 1,000,000 tokens you burned)
              </span>
            </li>
            <li className="flex gap-2">
              <span className="mt-[9px] size-1.5 shrink-0 rounded-full bg-[#F4B728]" />
              <span>
                <span className="font-semibold text-foreground">Fees:</span> trading volume
                generates 0.03% in fees — 80% of those go to KEYs, split evenly across all
                minted KEYs
              </span>
            </li>
          </ul>
          <p className="mt-4 font-mono text-xs text-[#7a6420]/85">
            Burn 1,000,000 $ZKEY → 1 KEY · value = 0.01% of MC + 80% of (0.03% vol fees) ÷ keys
          </p>
        </section>

        {/* How is it private? */}
        <section className="mt-6 rounded-lg border border-amber-900/20 bg-[#f3e5b0]/50 px-4 py-5 sm:px-5">
          <SectionLabel>How is it private?</SectionLabel>
          <ul className="mt-3 space-y-2 text-[15px] leading-relaxed text-foreground/90">
            {PRIVACY_POINTS.map((point) => (
              <li key={point} className="flex gap-2">
                <span className="mt-[9px] size-1.5 shrink-0 rounded-full bg-[#F4B728]" />
                <span>{point}</span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-[15px] font-bold leading-relaxed text-foreground">
            A fully private way to turn SOL into ZEC by burning $ZKEY.
          </p>
        </section>

        {/* SAMPLE footer strip */}
        <p className="mt-10 flex items-start gap-1.5 border-t border-dashed border-amber-900/25 pt-4 font-mono text-[11px] leading-relaxed text-[#7a6420]/80">
          <ShieldAlert className="mt-0.5 size-3.5 shrink-0" />
          SAMPLE MODE — burns go live once the CA and vault script are wired. No live privacy
          transfers yet.
        </p>
      </article>
    </main>
  )
}
