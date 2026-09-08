interface Props {
  text: string;
  onClose: () => void;
}

export function Notice({ text, onClose }: Props) {
  return (
    <div className="notice" role="status">
      <span>{text}</span>
      <button className="notice__x" onClick={onClose} aria-label="關閉提醒">×</button>
    </div>
  );
}
