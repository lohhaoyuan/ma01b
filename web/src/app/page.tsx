import { ShieldCheck } from 'lucide-react';
import { CodeEntry } from '@/components/code-entry';
import { ThemeToggle } from '@/components/theme-provider';
import { SESSION_MINUTES } from '@/lib/session';

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ expired?: string }>;
}) {
  const { expired } = await searchParams;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-6">
      <div className="absolute top-6 right-6">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-md">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Symptom Record</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Enter the 8-character code from the patient&apos;s app to open their symptom history.
          </p>
        </div>

        <div className="rounded-lg border border-line bg-card p-6">
          <CodeEntry expired={expired === '1'} />
        </div>

        <div className="mt-6 flex gap-2.5 text-xs leading-relaxed text-muted">
          <ShieldCheck size={15} strokeWidth={1.5} className="mt-px shrink-0" />
          <p>
            Access is read-only and ends after {SESSION_MINUTES} minutes. The patient can see every
            time their record is opened, and can revoke access from their app at any time.
          </p>
        </div>
      </div>
    </main>
  );
}
