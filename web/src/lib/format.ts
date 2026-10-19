// Plain formatting helpers with no React dependency.
//
// Deliberately not inside a 'use client' file: this needs to be callable from
// server components during render (patient/page.tsx, patient/report/page.tsx)
// as well as from client components. A function exported from a 'use client'
// module becomes an opaque reference outside it — callable as a component or
// passed as a prop, but not invoked directly — so it cannot live alongside the
// interactive dashboard components it used to share a file with.

export function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}
