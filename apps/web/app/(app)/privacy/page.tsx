import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

// Server Component -- static privacy policy text

export default function PrivacyPage() {
  return (
    <div className="pb-8">
      <header className="pt-8 pb-6 flex items-center gap-3">
        <Link
          href="/about"
          aria-label="Back" // i18n
          className="p-2 -ml-2 rounded-full hover:bg-surface transition-colors"
        >
          <ArrowLeft className="size-5 text-text-primary" />
        </Link>
        <h1 className="text-[length:var(--text-fluid-2xl)] font-bold text-text-primary tracking-tight">
          {/* i18n: Privacy Policy */}
          Privacy Policy
        </h1>
      </header>

      <div className="space-y-4">
        <p className="text-xs text-text-muted">
          {/* i18n: Last updated */}
          Last updated: March 2025
        </p>

        <div className="bg-surface rounded-[var(--radius-xl)] shadow-[var(--shadow-sm)] p-5 space-y-4">
          {/* Introduction */}
          <section>
            <h2 className="text-sm font-bold text-text-primary mb-1.5">
              {/* i18n */}
              Introduction
            </h2>
            <p className="text-sm text-text-secondary leading-relaxed">
              {/* i18n */}
              Orbit (&quot;we&quot;, &quot;us&quot;, &quot;our&quot;) is committed to protecting your privacy. This policy explains what data we collect, how we use it, and your rights.
            </p>
          </section>

          {/* Data We Collect */}
          <section>
            <h2 className="text-sm font-bold text-text-primary mb-1.5">
              {/* i18n */}
              Data We Collect
            </h2>
            <ul className="text-sm text-text-secondary leading-relaxed space-y-1.5 list-disc list-inside">
              <li>Account information (name, email)</li>
              <li>Habit and goal tracking data</li>
              <li>AI chat conversations</li>
              <li>App preferences and settings</li>
            </ul>
          </section>

          {/* How We Use Your Data */}
          <section>
            <h2 className="text-sm font-bold text-text-primary mb-1.5">
              {/* i18n */}
              How We Use Your Data
            </h2>
            <ul className="text-sm text-text-secondary leading-relaxed space-y-1.5 list-disc list-inside">
              <li>To provide and improve the Orbit service</li>
              <li>To personalize your experience and AI interactions</li>
              <li>To send notifications you have opted into</li>
            </ul>
          </section>

          {/* Third-Party Services */}
          <section>
            <h2 className="text-sm font-bold text-text-primary mb-1.5">
              {/* i18n */}
              Third-Party Services
            </h2>
            <p className="text-sm text-text-secondary leading-relaxed mb-1.5">
              {/* i18n */}
              We use the following third-party services:
            </p>
            <ul className="text-sm text-text-secondary leading-relaxed space-y-1.5 list-disc list-inside">
              <li>Google (authentication, calendar sync)</li>
              <li>Stripe (payment processing)</li>
              <li>Firebase (push notifications)</li>
              <li>OpenAI (AI-powered features)</li>
              <li>Resend (transactional emails)</li>
            </ul>
          </section>

          {/* No Selling */}
          <section>
            <h2 className="text-sm font-bold text-text-primary mb-1.5">
              {/* i18n */}
              We Never Sell Your Data
            </h2>
            <p className="text-sm text-text-secondary leading-relaxed">
              {/* i18n */}
              Your data is never sold, rented, or shared for advertising purposes. We only share data with the third-party services listed above, strictly to provide Orbit&apos;s features.
            </p>
          </section>

          {/* Security */}
          <section>
            <h2 className="text-sm font-bold text-text-primary mb-1.5">
              {/* i18n */}
              Security
            </h2>
            <p className="text-sm text-text-secondary leading-relaxed">
              {/* i18n */}
              We use industry-standard encryption and security practices to protect your data. All data is transmitted over HTTPS and stored securely.
            </p>
          </section>

          {/* Data Deletion */}
          <section>
            <h2 className="text-sm font-bold text-text-primary mb-1.5">
              {/* i18n */}
              Data Deletion
            </h2>
            <p className="text-sm text-text-secondary leading-relaxed mb-1.5">
              {/* i18n */}
              You can delete your account at any time:
            </p>
            <ul className="text-sm text-text-secondary leading-relaxed space-y-1 list-none">
              <li>1. Go to Profile &gt; Delete Account</li>
              <li>2. Confirm with the code sent to your email</li>
              <li>3. Your account will be deactivated immediately</li>
            </ul>
            <p className="text-sm text-text-secondary leading-relaxed mt-1.5">
              {/* i18n */}
              All data is permanently deleted after a 30-day grace period. You can cancel the deletion by logging in during this period.
            </p>
          </section>

          {/* Contact */}
          <section>
            <h2 className="text-sm font-bold text-text-primary mb-1.5">
              {/* i18n */}
              Contact
            </h2>
            <p className="text-sm text-text-secondary leading-relaxed">
              {/* i18n */}
              If you have any questions about this privacy policy, please contact us through the in-app support feature or at support@useorbit.org.
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}
