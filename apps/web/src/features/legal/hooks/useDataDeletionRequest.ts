'use client';

import { useState } from 'react';
import { DATA_DELETION_SUPPORT_EMAIL } from '../consts/legal.consts';
import type { DataDeletionStatus } from '../interfaces/legal.interfaces';

interface UseDataDeletionRequestResult {
  status: DataDeletionStatus;
  email: string;
  reason: string;
  referenceId: string | null;
  setEmail: (value: string) => void;
  setReason: (value: string) => void;
  openConfirm: () => void;
  closeConfirm: () => void;
  confirmRequest: () => void;
}

function generateReferenceId(): string {
  const year = new Date().getFullYear();
  const code = crypto.randomUUID().replace(/-/g, '').slice(0, 4).toUpperCase();
  return `DEL-${year}-${code}`;
}

/**
 * Drives the manual "Request deletion" form. There is no backend endpoint to
 * submit an unauthenticated deletion request to (only the Facebook
 * signed-request webhook can actually remove data — see
 * `app/api/auth/facebook/deletion/route.ts`), so confirming here composes a
 * real `mailto:` to support with a locally generated reference id embedded,
 * rather than faking a server response.
 */
export function useDataDeletionRequest(): UseDataDeletionRequestResult {
  const [status, setStatus] = useState<DataDeletionStatus>('form');
  const [email, setEmail] = useState('');
  const [reason, setReason] = useState('');
  const [referenceId, setReferenceId] = useState<string | null>(null);

  function openConfirm(): void {
    setStatus('confirming');
  }

  function closeConfirm(): void {
    setStatus('form');
  }

  function confirmRequest(): void {
    const ref = generateReferenceId();
    const subject = encodeURIComponent(`Data deletion request — ${ref}`);
    const body = encodeURIComponent(
      `Please delete my TikLivePro account data.\n\nEmail: ${email}\nReason: ${reason || 'Not specified'}\nReference: ${ref}`,
    );
    setReferenceId(ref);
    setStatus('success');
    window.location.href = `mailto:${DATA_DELETION_SUPPORT_EMAIL}?subject=${subject}&body=${body}`;
  }

  return { status, email, reason, referenceId, setEmail, setReason, openConfirm, closeConfirm, confirmRequest };
}
