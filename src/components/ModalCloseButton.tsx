type Props = {
  onClose: () => void
  className?: string
}

export function ModalCloseButton({ onClose, className = '' }: Props) {
  return (
    <button
      type="button"
      onClick={onClose}
      className={`rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800 ${className}`}
      aria-label="閉じる"
    >
      <svg
        width="20"
        height="20"
        viewBox="0 0 20 20"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden
      >
        <path
          d="M5 5l10 10M15 5L5 15"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
        />
      </svg>
    </button>
  )
}
