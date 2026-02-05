import { useMemo } from 'react'

type DemoCardProps = {
  title: string
  description: string
  src: string
  alt: string
}

function DemoCard({ title, description, src, alt }: DemoCardProps) {
  return (
    <div className="rounded-lg border border-border bg-bg-800/80 shadow-sm overflow-hidden">
      <div className="p-5">
        <h3 className="text-lg font-semibold text-text-primary">{title}</h3>
        <p className="mt-2 text-sm leading-6 text-text-secondary">{description}</p>
      </div>
      <div className="border-t border-border bg-bg-900">
        <div className="w-full aspect-[4/3] bg-bg-900 overflow-hidden">
          <img src={src} alt={alt} className="w-full h-full object-cover block" loading="lazy" />
        </div>
      </div>
    </div>
  )
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-border bg-bg-800 px-3 py-1 text-sm text-text-secondary">
      <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden="true" />
      <span>{children}</span>
    </div>
  )
}

function PrimaryButton({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      className="inline-flex items-center justify-center rounded-md bg-primary px-5 py-3 text-sm font-semibold text-bg-900 shadow-sm transition-colors hover:bg-primary-dark focus-visible:shadow-glow"
    >
      {children}
    </a>
  )
}

function SecondaryLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      className="text-sm font-semibold text-text-primary/90 hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg-900 rounded"
    >
      {children}
    </a>
  )
}

function Section({ id, children }: { id?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="py-14 sm:py-16 scroll-mt-24">
      {children}
    </section>
  )
}

export default function App() {
  const demoCards = useMemo(
    () => [
      {
        title: 'Upload documents',
        description: 'Drag-and-drop PDFs and group them into classes for easy context switching.',
        src: '/demos/upload.gif',
        alt: 'Upload documents demo',
      },
      {
        title: 'Chat with a class',
        description: 'Ask across all your materials and get answers with inline citations.',
        src: '/demos/class-chat.gif',
        alt: 'Class chat demo with citations',
      },
      {
        title: 'Verify in doc mode',
        description: 'Click a citation and jump to the exact page so you can verify instantly.',
        src: '/demos/doc-chat.gif',
        alt: 'Document chat demo with jump-to-page citations',
      },
    ],
    [],
  )

  return (
    <div className="min-h-screen bg-bg-900">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 rounded-md bg-bg-800 px-4 py-2 text-sm font-semibold text-text-primary"
      >
        Skip to content
      </a>

      <header className="sticky top-0 z-40 border-b border-border bg-bg-900/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 sm:px-6 py-4">
          <a href="#" className="font-semibold tracking-tight text-text-primary">
            Class Chat AI
          </a>
          <nav className="flex items-center gap-4">
            <a
              href="#demo"
              className="hidden text-sm text-text-secondary hover:text-text-primary sm:inline rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg-900"
            >
              Demo
            </a>
            <PrimaryButton href="https://app.classchatai.com">Try the beta</PrimaryButton>
          </nav>
        </div>
      </header>

      <main id="main">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <Section>
            <div className="grid gap-10 lg:grid-cols-12 lg:items-center">
              <div className="lg:col-span-7">
                <div className="inline-flex items-center gap-2 rounded-full border border-border bg-bg-800 px-3 py-1 text-xs font-semibold text-text-secondary">
                  <span className="h-2 w-2 rounded-full bg-teal" aria-hidden="true" />
                  Open beta
                </div>

                <h1 className="mt-5 text-4xl font-extrabold tracking-tight text-text-primary sm:text-5xl">
                  Get answers from your class PDFs with citations you can verify.
                </h1>
                <p className="mt-5 max-w-2xl text-lg leading-7 text-text-secondary">
                  Upload lecture slides, notes, and textbooks. Ask questions across a class. Every answer includes citations so you can jump to the
                  source.
                </p>

                <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
                  <PrimaryButton href="https://app.classchatai.com">Try the beta</PrimaryButton>
                  <SecondaryLink href="#demo">See the demo</SecondaryLink>
                </div>

                <div className="mt-8 flex flex-wrap gap-2">
                  <Pill>Inline citations</Pill>
                  <Pill>Chat with a class</Pill>
                  <Pill>Jump-to-page verification</Pill>
                </div>
              </div>

              <div className="lg:col-span-5">
                <div className="rounded-xl border border-border bg-gradient-to-br from-primary-bg/60 to-bg-800 p-6 shadow-md">
                  <div className="text-sm font-semibold text-text-primary">Built for studying, not guessing</div>
                  <p className="mt-2 text-sm leading-6 text-text-secondary">
                    The core loop is simple. Ask your materials a question, then verify by clicking the citation.
                  </p>
                  <div className="mt-5 grid gap-3">
                    <div className="rounded-lg border border-border bg-bg-900/40 p-4">
                      <div className="text-xs font-semibold text-text-secondary">Example question</div>
                      <div className="mt-1 text-sm text-text-primary">“What are the assumptions behind gradient descent?”</div>
                    </div>
                    <div className="rounded-lg border border-border bg-bg-900/40 p-4">
                      <div className="text-xs font-semibold text-text-secondary">What you get</div>
                      <div className="mt-1 text-sm text-text-primary">A clear explanation plus citations you can click.</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </Section>

          <Section id="demo">
            <div className="max-w-2xl">
              <h2 className="text-2xl font-bold tracking-tight text-text-primary sm:text-3xl">See the workflow in 30 seconds.</h2>
              <p className="mt-3 text-base leading-7 text-text-secondary">
                These are placeholder loops. Next step is capturing fresh screenshots from the live app.
              </p>
            </div>

            <div className="mt-8 grid gap-6 lg:grid-cols-3">
              {demoCards.map((card) => (
                <DemoCard key={card.title} {...card} />
              ))}
            </div>
          </Section>

          <Section id="how-it-works">
            <div className="grid gap-10 lg:grid-cols-12">
              <div className="lg:col-span-5">
                <h2 className="text-2xl font-bold tracking-tight text-text-primary sm:text-3xl">How it works</h2>
                <p className="mt-3 text-base leading-7 text-text-secondary">
                  Class Chat AI is a semantic navigation layer over your course PDFs.
                </p>
              </div>
              <ol className="lg:col-span-7 grid gap-4">
                {[
                  {
                    t: 'Upload PDFs',
                    d: 'Add lecture slides, notes, and textbooks. Keep them grouped by class.',
                  },
                  {
                    t: 'Ask a question',
                    d: 'Query across all your materials in one place instead of hunting through files.',
                  },
                  {
                    t: 'Verify instantly',
                    d: 'Every answer includes citations so you can jump to the source and confirm.',
                  },
                ].map((step, idx) => (
                  <li key={step.t} className="rounded-lg border border-border bg-bg-800/60 p-5">
                    <div className="flex items-start gap-4">
                      <div
                        className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-bg text-sm font-bold text-primary-light"
                        aria-hidden="true"
                      >
                        {idx + 1}
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-text-primary">{step.t}</div>
                        <div className="mt-1 text-sm leading-6 text-text-secondary">{step.d}</div>
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </Section>

          <Section>
            <div className="max-w-2xl">
              <h2 className="text-2xl font-bold tracking-tight text-text-primary sm:text-3xl">Features that matter</h2>
              <p className="mt-3 text-base leading-7 text-text-secondary">
                Focused on the workflow students actually use.
              </p>
            </div>

            <div className="mt-8 grid gap-6 lg:grid-cols-3">
              {[
                {
                  t: 'Chat with a class',
                  d: 'Search across your lecture slides, notes, and textbook at the same time.',
                },
                {
                  t: 'Citations you can click',
                  d: 'See exactly where the answer came from. Verify before you trust.',
                },
                {
                  t: 'Document focus mode',
                  d: 'Go deep on one file with a side-by-side viewer and page-level jumps.',
                },
              ].map((f) => (
                <div key={f.t} className="rounded-lg border border-border bg-bg-800/60 p-6">
                  <div className="text-base font-semibold text-text-primary">{f.t}</div>
                  <div className="mt-2 text-sm leading-6 text-text-secondary">{f.d}</div>
                </div>
              ))}
            </div>
          </Section>

          <Section>
            <div className="grid gap-10 lg:grid-cols-12">
              <div className="lg:col-span-5">
                <h2 className="text-2xl font-bold tracking-tight text-text-primary sm:text-3xl">FAQ</h2>
                <p className="mt-3 text-base leading-7 text-text-secondary">
                  Short answers to the stuff that blocks signups.
                </p>
              </div>

              <div className="lg:col-span-7 space-y-4">
                <details className="group rounded-lg border border-border bg-bg-800/60 p-5">
                  <summary className="cursor-pointer list-none text-sm font-semibold text-text-primary rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg-900">
                    Is this free?
                  </summary>
                  <div className="mt-3 text-sm leading-6 text-text-secondary">
                    During beta, it is free for most users. We may introduce simple usage limits later.
                  </div>
                </details>

                <details className="group rounded-lg border border-border bg-bg-800/60 p-5">
                  <summary className="cursor-pointer list-none text-sm font-semibold text-text-primary rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg-900">
                    What files can I upload?
                  </summary>
                  <div className="mt-3 text-sm leading-6 text-text-secondary">PDFs for now. More formats later.</div>
                </details>

                <details className="group rounded-lg border border-border bg-bg-800/60 p-5">
                  <summary className="cursor-pointer list-none text-sm font-semibold text-text-primary rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg-900">
                    Does it train on my documents?
                  </summary>
                  <div className="mt-3 text-sm leading-6 text-text-secondary">
                    We do not use your documents to train public models. See the privacy section below for details.
                  </div>
                </details>

                <details className="group rounded-lg border border-border bg-bg-800/60 p-5">
                  <summary className="cursor-pointer list-none text-sm font-semibold text-text-primary rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg-900">
                    Is this allowed for school?
                  </summary>
                  <div className="mt-3 text-sm leading-6 text-text-secondary">
                    It is built for studying and understanding. Use it responsibly and follow your course policies.
                  </div>
                </details>
              </div>
            </div>
          </Section>

          <Section>
            <div className="rounded-xl border border-border bg-bg-800/60 p-8 sm:p-10">
              <div className="grid gap-6 lg:grid-cols-12 lg:items-center">
                <div className="lg:col-span-8">
                  <h2 className="text-2xl font-bold tracking-tight text-text-primary sm:text-3xl">Stop hunting through PDFs.</h2>
                  <p className="mt-3 text-base leading-7 text-text-secondary">Try the beta and verify answers with citations.</p>
                </div>
                <div className="lg:col-span-4 lg:flex lg:justify-end">
                  <PrimaryButton href="https://app.classchatai.com">Try the beta</PrimaryButton>
                </div>
              </div>
            </div>
          </Section>

          <Section id="privacy">
            <div className="grid gap-10 lg:grid-cols-12">
              <div className="lg:col-span-5">
                <h2 className="text-2xl font-bold tracking-tight text-text-primary sm:text-3xl">Privacy</h2>
                <p className="mt-3 text-base leading-7 text-text-secondary">Clear expectations for a beta product.</p>
              </div>
              <div className="lg:col-span-7 space-y-4">
                <div className="rounded-lg border border-border bg-bg-800/60 p-5">
                  <div className="text-sm font-semibold text-text-primary">Your documents</div>
                  <div className="mt-2 text-sm leading-6 text-text-secondary">
                    We do not use your documents to train public models. Documents are processed so the app can retrieve relevant passages and cite
                    them back to you.
                  </div>
                </div>
                <div className="rounded-lg border border-border bg-bg-800/60 p-5">
                  <div className="text-sm font-semibold text-text-primary">Beta note</div>
                  <div className="mt-2 text-sm leading-6 text-text-secondary">
                    This is a beta. If you want something clarified or removed, contact us and we will help.
                  </div>
                </div>
              </div>
            </div>
          </Section>

          <Section id="terms">
            <div className="grid gap-10 lg:grid-cols-12">
              <div className="lg:col-span-5">
                <h2 className="text-2xl font-bold tracking-tight text-text-primary sm:text-3xl">Terms</h2>
                <p className="mt-3 text-base leading-7 text-text-secondary">Use it to learn. Keep course policies in mind.</p>
              </div>
              <div className="lg:col-span-7 space-y-4">
                <div className="rounded-lg border border-border bg-bg-800/60 p-5">
                  <div className="text-sm font-semibold text-text-primary">Academic integrity</div>
                  <div className="mt-2 text-sm leading-6 text-text-secondary">
                    Class Chat AI is built for studying and understanding. Follow your class rules and school policies when using AI tools.
                  </div>
                </div>
                <div className="rounded-lg border border-border bg-bg-800/60 p-5">
                  <div className="text-sm font-semibold text-text-primary">Your responsibility</div>
                  <div className="mt-2 text-sm leading-6 text-text-secondary">
                    Always verify important claims using citations and your course materials.
                  </div>
                </div>
              </div>
            </div>
          </Section>

          <footer className="border-t border-border py-10">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm text-text-secondary">© {new Date().getFullYear()} Class Chat AI</div>
              <div className="flex gap-4 text-sm">
                <a
                  href="#privacy"
                  className="text-text-secondary hover:text-text-primary rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg-900"
                >
                  Privacy
                </a>
                <a
                  href="#terms"
                  className="text-text-secondary hover:text-text-primary rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg-900"
                >
                  Terms
                </a>
              </div>
            </div>
          </footer>
        </div>
      </main>
    </div>
  )
}
