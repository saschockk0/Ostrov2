export function LogoMark() {
  return (
    <div className="inline-flex items-center gap-2.5" aria-label="Парусный Клуб Остров">
      <span
        className="grid h-[42px] w-[42px] place-items-center rounded-xl border border-[#c0dafb] bg-gradient-to-br from-[#e5f0ff] to-[#b3d0ff]"
        aria-hidden
      >
        <svg
          className="h-7 w-7 fill-none stroke-[#1d5dcc] stroke-[3] [stroke-linecap:round] [stroke-linejoin:round]"
          viewBox="0 0 64 64"
          role="presentation"
        >
          <path d="M36 6 L56 44 L36 44 Z" />
          <path d="M24 14 L36 44 L24 44 Z" />
          <path d="M8 48 C20 54, 44 54, 56 48" />
        </svg>
      </span>
      <span className="grid leading-tight">
        <small className="font-semibold text-ostrov-muted">Парусный клуб</small>
        <strong className="text-xl">Остров</strong>
      </span>
    </div>
  );
}
