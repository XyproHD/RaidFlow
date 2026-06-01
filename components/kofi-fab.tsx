'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  BMC_URL,
  BMC_WIDGET_TEXT,
  COFFEE_FAB_LABEL,
  KOFI_URL,
  KOFI_WIDGET_LABEL,
} from '@/lib/support-links';

const POP_MS = 320;
const COLLAPSE_LOCK_MS = 550;
const MOUSE_LEAVE_DELAY_MS = 400;

const KOFI_CUP_IMG = 'https://storage.ko-fi.com/cdn/cup-border.png';

function CoffeeCupIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
    >
      <path d="M4 8h12v7a3 3 0 01-3 3H7a3 3 0 01-3-3V8zm14 1h1.2a2.8 2.8 0 110 5.6H18V9zM7 4h2v2H7V4zm4 0h2v2h-2V4zm4 0h2v2h-2V4z" />
    </svg>
  );
}

function DonatePlatformButton({
  href,
  label,
  variant,
  icon,
}: {
  href: string;
  label: string;
  variant: 'kofi' | 'bmc';
  icon: ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`rf-donate-btn rf-donate-btn--${variant}`}
    >
      <span className="rf-donate-btn__icon" aria-hidden>
        {icon}
      </span>
      <span className="rf-donate-btn__label">{label}</span>
    </a>
  );
}

export function KofiFab() {
  const rootRef = useRef<HTMLElement>(null);
  const collapseLockUntilRef = useRef(0);
  const leaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [popping, setPopping] = useState(false);

  const canCollapse = useCallback(() => Date.now() >= collapseLockUntilRef.current, []);

  const lockCollapse = useCallback(() => {
    collapseLockUntilRef.current = Date.now() + COLLAPSE_LOCK_MS;
  }, []);

  const clearLeaveTimer = useCallback(() => {
    if (leaveTimerRef.current) {
      clearTimeout(leaveTimerRef.current);
      leaveTimerRef.current = null;
    }
  }, []);

  const collapse = useCallback(() => {
    if (!canCollapse()) return;
    clearLeaveTimer();
    setExpanded(false);
    setPopping(false);
  }, [canCollapse, clearLeaveTimer]);

  const scheduleCollapseOnLeave = useCallback(() => {
    if (!canCollapse()) return;
    clearLeaveTimer();
    leaveTimerRef.current = setTimeout(() => {
      leaveTimerRef.current = null;
      collapse();
    }, MOUSE_LEAVE_DELAY_MS);
  }, [canCollapse, clearLeaveTimer, collapse]);

  const expand = useCallback(() => {
    if (expanded || popping) return;
    clearLeaveTimer();
    setPopping(true);
    window.setTimeout(() => {
      setPopping(false);
      setExpanded(true);
      lockCollapse();
    }, POP_MS);
  }, [expanded, popping, clearLeaveTimer, lockCollapse]);

  useEffect(() => {
    if (!expanded) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!canCollapse()) return;
      const root = rootRef.current;
      if (root && !root.contains(event.target as Node)) {
        collapse();
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [expanded, collapse, canCollapse]);

  useEffect(() => () => clearLeaveTimer(), [clearLeaveTimer]);

  const showMain = !expanded && !popping;

  return (
    <aside
      ref={rootRef}
      className={`rf-coffee-fab fixed bottom-5 left-5 z-[69]${expanded ? ' rf-coffee-fab--open flex flex-col items-center' : ''}`}
      aria-label={COFFEE_FAB_LABEL}
      onMouseEnter={clearLeaveTimer}
      onMouseLeave={() => {
        if (expanded) scheduleCollapseOnLeave();
      }}
    >
      {showMain ? (
        <button
          type="button"
          onClick={expand}
          className="rf-coffee-fab-main inline-flex min-h-12 min-w-[168px] items-center justify-center gap-2 rounded-full border border-[#5a8fd4]/40 bg-[#72a4f2] px-5 text-sm font-bold text-white shadow-lg transition-shadow hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#72a4f2] focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <CoffeeCupIcon className="h-5 w-5 shrink-0" />
          <span>{COFFEE_FAB_LABEL}</span>
        </button>
      ) : null}

      {popping ? (
        <button
          type="button"
          aria-hidden
          tabIndex={-1}
          className="rf-coffee-fab-main rf-coffee-fab-main--popping pointer-events-none inline-flex min-h-12 min-w-[168px] items-center justify-center gap-2 rounded-full border border-[#5a8fd4]/40 bg-[#72a4f2] px-5 text-sm font-bold text-white shadow-lg"
        >
          <CoffeeCupIcon className="h-5 w-5 shrink-0" />
          <span>{COFFEE_FAB_LABEL}</span>
        </button>
      ) : null}

      {expanded ? (
        <div className="rf-coffee-fab-expanded rf-coffee-fab-donate-stack">
          <DonatePlatformButton
            href={KOFI_URL}
            label={KOFI_WIDGET_LABEL}
            variant="kofi"
            icon={
              // eslint-disable-next-line @next/next/no-img-element -- Ko-fi CDN asset
              <img src={KOFI_CUP_IMG} alt="" width={28} height={28} />
            }
          />
          <DonatePlatformButton
            href={BMC_URL}
            label={BMC_WIDGET_TEXT}
            variant="bmc"
            icon={<span className="rf-donate-btn__emoji">☕</span>}
          />
        </div>
      ) : null}

      <noscript>
        <div className="rf-coffee-fab-donate-stack">
          <DonatePlatformButton
            href={KOFI_URL}
            label={KOFI_WIDGET_LABEL}
            variant="kofi"
            icon={
              // eslint-disable-next-line @next/next/no-img-element
              <img src={KOFI_CUP_IMG} alt="" width={28} height={28} />
            }
          />
          <DonatePlatformButton
            href={BMC_URL}
            label={BMC_WIDGET_TEXT}
            variant="bmc"
            icon={<span className="rf-donate-btn__emoji">☕</span>}
          />
        </div>
      </noscript>
    </aside>
  );
}
