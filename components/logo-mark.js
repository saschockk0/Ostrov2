export function LogoMark() {
  return (
    <div className="logo" aria-label="Парусный Клуб Остров">
      <span className="logo__badge" aria-hidden>
        <svg viewBox="0 0 64 64" role="presentation">
          <path d="M36 6 L56 44 L36 44 Z" />
          <path d="M24 14 L36 44 L24 44 Z" />
          <path d="M8 48 C20 54, 44 54, 56 48" />
        </svg>
      </span>
      <span className="logo__text">
        <small>Парусный клуб</small>
        <strong>Остров</strong>
      </span>
    </div>
  );
}
