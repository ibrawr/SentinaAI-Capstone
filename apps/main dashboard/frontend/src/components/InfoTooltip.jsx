import "./InfoTooltip.css";

export default function InfoTooltip({ text, className = "" }) {
  if (!text) return null;

  const stop = (e) => e.stopPropagation();

  return (
    <button
      type="button"
      className={`infoTooltip ${className}`.trim()}
      aria-label={text}
      title={text}
      onClick={stop}
      onMouseDown={stop}
    >
      i
    </button>
  );
}