import Link from 'next/link'
import {
  ArrowLeft,
  BookOpen,
  MessageCircle,
  ShieldCheck,
  ChevronRight,
} from 'lucide-react'

// Server Component -- no client-side interactivity needed for navigation

export default function AboutPage() {
  return (
    <div className="pb-8">
      <header className="pt-8 pb-6 flex items-center gap-3">
        <Link
          href="/profile"
          aria-label="Back to profile" // i18n
          className="p-2 -ml-2 text-text-muted hover:text-text-primary transition-colors"
        >
          <ArrowLeft className="size-5" />
        </Link>
        <h1 className="text-[length:var(--text-fluid-2xl)] font-bold text-text-primary tracking-tight">
          {/* i18n: About & Help */}
          About &amp; Help
        </h1>
      </header>

      <div className="space-y-4">
        {/* Feature Guide */}
        <Link
          href="/onboarding"
          className="w-full bg-surface rounded-[var(--radius-xl)] border border-border-muted p-5 flex items-center gap-4 hover:bg-surface-elevated hover:shadow-[var(--shadow-md)] hover:border-border transition-all duration-200 group text-left shadow-[var(--shadow-sm)]"
        >
          <div className="shrink-0 flex items-center justify-center bg-primary/10 rounded-[var(--radius-lg)] p-3 transition-colors">
            <BookOpen className="size-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-text-primary">
              {/* i18n: Feature Guide */}
              Feature Guide
            </p>
            <p className="text-xs text-text-secondary mt-0.5">
              {/* i18n */}
              Learn how to get the most out of Orbit
            </p>
          </div>
          <ChevronRight className="size-4 text-text-muted group-hover:text-text-primary transition-colors shrink-0" />
        </Link>

        {/* Support link */}
        <Link
          href="/support"
          className="w-full bg-surface rounded-[var(--radius-xl)] border border-border-muted p-5 flex items-center gap-4 hover:bg-surface-elevated hover:shadow-[var(--shadow-md)] hover:border-border transition-all duration-200 group shadow-[var(--shadow-sm)]"
        >
          <div className="shrink-0 flex items-center justify-center bg-primary/10 rounded-[var(--radius-lg)] p-3 transition-colors">
            <MessageCircle className="size-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-text-primary">
              {/* i18n: Support */}
              Support
            </p>
            <p className="text-xs text-text-secondary mt-0.5">
              {/* i18n */}
              Get help or send feedback
            </p>
          </div>
          <ChevronRight className="size-4 text-text-muted group-hover:text-text-primary transition-colors shrink-0" />
        </Link>

        {/* Privacy Policy link */}
        <Link
          href="/privacy"
          className="w-full bg-surface rounded-[var(--radius-xl)] border border-border-muted p-5 flex items-center gap-4 hover:bg-surface-elevated hover:shadow-[var(--shadow-md)] hover:border-border transition-all duration-200 group shadow-[var(--shadow-sm)]"
        >
          <div className="shrink-0 flex items-center justify-center bg-primary/10 rounded-[var(--radius-lg)] p-3 transition-colors">
            <ShieldCheck className="size-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-text-primary">
              {/* i18n: Privacy Policy */}
              Privacy Policy
            </p>
            <p className="text-xs text-text-secondary mt-0.5">
              {/* i18n */}
              How we handle your data
            </p>
          </div>
          <ChevronRight className="size-4 text-text-muted group-hover:text-text-primary transition-colors shrink-0" />
        </Link>
      </div>
    </div>
  )
}
