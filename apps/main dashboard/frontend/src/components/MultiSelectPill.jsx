import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

function defaultGetOptionValue(option) {
  if (option && typeof option === "object") {
    return String(option.value ?? option.id ?? option.key ?? "");
  }
  return String(option ?? "");
}

function defaultGetOptionLabel(option) {
  if (option && typeof option === "object") {
    return String(option.label ?? option.name ?? option.value ?? option.id ?? option.key ?? "");
  }
  return String(option ?? "");
}

export default function MultiSelectPill({
  value = [],
  onChange,
  options = [],
  label,
  icon,
  className = "",
  disabled = false,
  getOptionValue = defaultGetOptionValue,
  getOptionLabel = defaultGetOptionLabel,
}) {
  const wrapperRef = useRef(null);
  const menuRef = useRef(null);

  const [open, setOpen] = useState(false);
  const [menuPlacement, setMenuPlacement] = useState("bottom");
  const [menuMaxHeight, setMenuMaxHeight] = useState(280);
  const [menuAlign, setMenuAlign] = useState("left");
  const [menuWidth, setMenuWidth] = useState(null);

  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  useEffect(() => {
    const handlePointerDown = (event) => {
      if (!wrapperRef.current?.contains(event.target)) {
        setOpen(false);
      }
    };

    const handleEscape = (event) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  useLayoutEffect(() => {
    if (!open) return;

    const updateMenuPlacement = () => {
      const wrapperEl = wrapperRef.current;
      const menuEl = menuRef.current;
      if (!wrapperEl || !menuEl) return;

      const gutter = 12;
      const minMenuWidth = 240;
      const maxMenuWidth = 420;
      const viewportWidth = window.innerWidth;
      const wrapperRect = wrapperEl.getBoundingClientRect();
      const naturalHeight = Math.min(menuEl.scrollHeight || 280, 320);

      const spaceBelow = Math.max(0, window.innerHeight - wrapperRect.bottom - gutter);
      const spaceAbove = Math.max(0, wrapperRect.top - gutter);

      const shouldOpenUpward =
        spaceBelow < Math.min(naturalHeight, 180) && spaceAbove > spaceBelow;

      const usableSpace = Math.max(shouldOpenUpward ? spaceAbove : spaceBelow, 120);
      const preferredWidth = Math.max(wrapperRect.width, minMenuWidth);
      const clampedWidth = Math.min(preferredWidth, maxMenuWidth, viewportWidth - gutter * 2);
      const roomOnRight = viewportWidth - wrapperRect.left - gutter;
      const roomOnLeft = wrapperRect.right - gutter;

      let align = "left";
      let width = Math.min(clampedWidth, roomOnRight);

      if (width < minMenuWidth && roomOnLeft > roomOnRight) {
        align = "right";
        width = Math.min(clampedWidth, roomOnLeft);
      }

      setMenuPlacement(shouldOpenUpward ? "top" : "bottom");
      setMenuMaxHeight(Math.min(naturalHeight, usableSpace));
      setMenuAlign(align);
      setMenuWidth(Math.max(Math.floor(width), Math.min(minMenuWidth, viewportWidth - gutter * 2)));
    };

    updateMenuPlacement();

    window.addEventListener("resize", updateMenuPlacement);
    window.addEventListener("scroll", updateMenuPlacement, true);

    return () => {
      window.removeEventListener("resize", updateMenuPlacement);
      window.removeEventListener("scroll", updateMenuPlacement, true);
    };
  }, [open, options.length]);

  const normalizedValue = useMemo(
    () => (Array.isArray(value) ? value.map(String) : []),
    [value]
  );

  const summary = useMemo(() => {
    if (!normalizedValue.length) return label;

    if (normalizedValue.length === 1) {
      const match = options.find(
        (option) => String(getOptionValue(option)) === normalizedValue[0]
      );
      return match ? getOptionLabel(match) : normalizedValue[0];
    }

    return `${label} (${normalizedValue.length})`;
  }, [getOptionLabel, getOptionValue, label, normalizedValue, options]);

  const toggleValue = (optionValue) => {
    const next = normalizedValue.includes(optionValue)
      ? normalizedValue.filter((item) => item !== optionValue)
      : [...normalizedValue, optionValue];

    onChange?.(next);
  };

  return (
    <div
      ref={wrapperRef}
      className={`filterPill pillSelectWrap ${className} ${open ? "isOpen" : ""} ${disabled ? "isDisabled" : ""}`.trim()}
    >
      {icon ? (
        <span className="pillLeftIcon" aria-hidden>
          {icon}
        </span>
      ) : null}

      <button
        type="button"
        className="pillSelect multiSelectTrigger"
        onClick={() => {
          if (!disabled) setOpen((prev) => !prev);
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
      >
        <span className="multiSelectSummary">{summary}</span>
      </button>

      <span className="pillRightCaret" aria-hidden />

      {open && !disabled ? (
        <div
          ref={menuRef}
          className={`multiSelectMenu ${menuPlacement === "top" ? "isTop" : "isBottom"} ${menuAlign === "right" ? "isAlignRight" : "isAlignLeft"}`}
          role="listbox"
          aria-multiselectable="true"
          style={{ maxHeight: menuMaxHeight, width: menuWidth || undefined }}
        >
          {options.length ? (
            options.map((option) => {
              const optionValue = String(getOptionValue(option));
              const optionLabel = getOptionLabel(option);
              const checked = normalizedValue.includes(optionValue);

              return (
                <label key={optionValue} className="multiSelectOption">
                  <input
                    className="multiSelectCheckbox"
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleValue(optionValue)}
                  />
                  <span className="multiSelectOptionLabel">{optionLabel}</span>
                </label>
              );
            })
          ) : (
            <div className="multiSelectEmpty">No options</div>
          )}
        </div>
      ) : null}
    </div>
  );
}
