'use client'

import { AppBar } from '@/components/ui/app-bar'

export type LegalDocumentSection = Readonly<{
  id: string
  title: string
  paragraphs: readonly string[]
}>

type LegalDocumentLayoutProps = Readonly<{
  title: string
  lastUpdated: string
  sections: readonly LegalDocumentSection[]
  closingNote: LegalDocumentSection
  backLabel: string
  onBack: () => void
}>

function Section({ section }: Readonly<{ section: LegalDocumentSection }>) {
  return (
    <section className="flex min-w-0 flex-col gap-2">
      <h2 className="font-sans text-[var(--fs-md)] font-medium leading-[1.4] text-[var(--fg-1)]">
        {section.title}
      </h2>
      <div className="flex min-w-0 flex-col gap-2">
        {section.paragraphs.map((paragraph) => (
          <p key={paragraph} className="min-w-0 text-pretty font-sans text-base leading-[1.6] text-[var(--fg-2)] [overflow-wrap:anywhere]">
            {paragraph}
          </p>
        ))}
      </div>
    </section>
  )
}

export function LegalDocumentLayout({ title, lastUpdated, sections, closingNote, backLabel, onBack }: LegalDocumentLayoutProps) {
  return (
    <div data-legal-document="" data-measure="62ch" data-reflow="wrap" className="mx-auto flex min-h-[100dvh] min-w-0 max-w-[620px] flex-col">
      <AppBar backLabel={backLabel} onBack={onBack} title={title} />
      <main className="min-h-0 min-w-0 flex-1 overflow-y-auto pb-6">
        <div className="flex min-w-0 max-w-[62ch] flex-col gap-6">
          <header className="flex min-w-0 flex-col gap-2 pt-4">
            <p className="text-pretty font-display text-[var(--fs-xl)] font-medium leading-[1.2] tracking-[-0.02em] text-[var(--fg-1)] sm:text-[var(--fs-2xl)] sm:leading-[1.15]">
              {title}
            </p>
            <p className="font-mono text-xs leading-[1.4] text-[var(--fg-4)]">{lastUpdated}</p>
          </header>
          <div data-legal-document-sections="" className="flex min-w-0 flex-col gap-6">
            {sections.map((section) => <Section key={section.id} section={section} />)}
          </div>
          <aside data-legal-document-closing="" className="flex min-w-0 flex-col gap-2 pb-6">
            <h2 className="font-sans text-[var(--fs-md)] font-medium leading-[1.4] text-[var(--fg-1)]">{closingNote.title}</h2>
            {closingNote.paragraphs.map((paragraph) => (
              <p key={paragraph} className="min-w-0 text-pretty font-sans text-sm leading-[1.55] text-[var(--fg-4)] [overflow-wrap:anywhere]">
                {paragraph}
              </p>
            ))}
          </aside>
        </div>
      </main>
    </div>
  )
}
