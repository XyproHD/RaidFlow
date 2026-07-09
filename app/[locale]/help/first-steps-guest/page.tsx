import { redirect } from 'next/navigation';
import { FIRST_STEPS_GUEST_CHAPTER_ID } from '@/lib/help-content';

type PageProps = {
  params: Promise<{ locale: string }>;
};

/** Legacy URL → Hilfe-Kapitel-Anker */
export default async function FirstStepsGuestRedirectPage({ params }: PageProps) {
  const { locale } = await params;
  redirect(`/${locale}/help#${FIRST_STEPS_GUEST_CHAPTER_ID}`);
}
