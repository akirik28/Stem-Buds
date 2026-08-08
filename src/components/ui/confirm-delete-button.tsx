'use client';

import { useState } from 'react';
import { Button, type ButtonProps } from './button';

/**
 * The one required shape for every destructive action in the product: no
 * one-click delete anywhere. Clicking shows an inline Turkish confirmation
 * ("Vazgeç" / "Evet, Sil") before the real action runs.
 */
export function ConfirmDeleteButton({
  label,
  confirmLabel = 'Evet, Sil',
  confirmQuestion = 'Bu işlemi geri alamazsınız. Emin misiniz?',
  onConfirm,
  disabled,
  size = 'sm',
}: {
  label: string;
  confirmLabel?: string;
  confirmQuestion?: string;
  onConfirm: () => void;
  disabled?: boolean;
  size?: ButtonProps['size'];
}) {
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <Button type="button" variant="danger" size={size} disabled={disabled} onClick={() => setConfirming(true)}>
        {label}
      </Button>
    );
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <span className="text-xs text-navy-500">{confirmQuestion}</span>
      <Button
        type="button"
        variant="danger"
        size={size}
        disabled={disabled}
        onClick={() => {
          setConfirming(false);
          onConfirm();
        }}
      >
        {confirmLabel}
      </Button>
      <Button type="button" variant="ghost" size={size} onClick={() => setConfirming(false)}>
        Vazgeç
      </Button>
    </span>
  );
}
