import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { LuCheck, LuPipette } from 'react-icons/lu';
import { MOTION_DURATION_MS, usePresence } from '@features/motion';
import { useEscapeKey } from '@hooks/useEscapeKey';
import { useMediaQuery } from '@hooks/useMediaQuery';
import { useOutsidePointerDown } from '@hooks/useOutsidePointerDown';
import {
  COLOR_PRESETS,
  hexToHsv,
  hsvToHex,
  hueToHex,
  moveInArea,
  normalizeHex,
  nudgeArea,
  placePopover,
  type Hsv,
  type PopoverPlacement,
} from './color-picker-logic';
import './color-picker.css';

interface ColorPickerProps {
  value: string;
  onChange: (hex: string) => void;
  label: string;
  className?: string;
  presets?: readonly string[];
}

interface EyeDropperResult {
  sRGBHex: string;
}

interface EyeDropperApi {
  open: () => Promise<EyeDropperResult>;
}

const POPOVER_SIZE = { width: 244, height: 276 };
const SHEET_QUERY = '(max-width: 479.98px)';
const KEY_STEP = 0.02;
const KEY_STEP_LARGE = 0.1;

function getEyeDropper(): (new () => EyeDropperApi) | null {
  const candidate = (window as unknown as { EyeDropper?: new () => EyeDropperApi }).EyeDropper;
  return candidate ?? null;
}

export function ColorPicker({ value, onChange, label, className, presets = COLOR_PRESETS }: ColorPickerProps) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const presence = usePresence(isOpen, MOTION_DURATION_MS.fast);
  const isSheet = useMediaQuery(SHEET_QUERY);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const areaRef = useRef<HTMLDivElement>(null);
  const [placement, setPlacement] = useState<PopoverPlacement | null>(null);
  const [hsv, setHsv] = useState<Hsv>(() => hexToHsv(value));
  const [hexDraft, setHexDraft] = useState(value);
  const lastEmitted = useRef(value);
  const dialogId = useId();
  const normalizedValue = normalizeHex(value) ?? '#000000';
  const eyeDropper = typeof window !== 'undefined' ? getEyeDropper() : null;

  useEffect(() => {
    if (normalizedValue !== lastEmitted.current) {
      lastEmitted.current = normalizedValue;
      setHsv(hexToHsv(normalizedValue));
      setHexDraft(normalizedValue);
    }
  }, [normalizedValue]);

  const close = useCallback((restoreFocus: boolean) => {
    setIsOpen(false);
    if (restoreFocus) {
      triggerRef.current?.focus({ preventScroll: true });
    }
  }, []);

  useEscapeKey(isOpen, () => close(true));

  const reposition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger || isSheet) {
      setPlacement(null);
      return;
    }
    const panelSize = panelRef.current ? { width: panelRef.current.offsetWidth || POPOVER_SIZE.width, height: panelRef.current.offsetHeight || POPOVER_SIZE.height } : POPOVER_SIZE;
    setPlacement(placePopover(trigger.getBoundingClientRect(), panelSize, { width: window.innerWidth, height: window.innerHeight }));
  }, [isSheet]);

  useLayoutEffect(() => {
    if (isOpen) {
      reposition();
    }
  }, [isOpen, reposition]);

  useOutsidePointerDown(isOpen, [panelRef, triggerRef], () => close(false));

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    return () => {
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [isOpen, reposition]);

  const emit = (next: Hsv) => {
    const hex = hsvToHex(next);
    setHsv(next);
    setHexDraft(hex);
    if (hex !== lastEmitted.current) {
      lastEmitted.current = hex;
      onChange(hex);
    }
  };

  const emitHex = (hex: string) => {
    const next = hexToHsv(hex);
    setHsv({ h: next.s === 0 || next.v === 0 ? hsv.h : next.h, s: next.s, v: next.v });
    setHexDraft(hex);
    if (hex !== lastEmitted.current) {
      lastEmitted.current = hex;
      onChange(hex);
    }
  };

  const updateFromPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    const rect = areaRef.current?.getBoundingClientRect();
    if (!rect) {
      return;
    }
    emit({ ...hsv, ...moveInArea(rect, event.clientX, event.clientY) });
  };

  const handleAreaPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    event.currentTarget.focus();
    updateFromPointer(event);
  };

  const handleAreaPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      updateFromPointer(event);
    }
  };

  const handleAreaKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const next = nudgeArea(hsv, event.key, event.shiftKey ? KEY_STEP_LARGE : KEY_STEP);
    if (next) {
      event.preventDefault();
      emit({ ...hsv, ...next });
    }
  };

  const commitHexDraft = () => {
    const normalized = normalizeHex(hexDraft);
    if (normalized) {
      emitHex(normalized);
    } else {
      setHexDraft(normalizedValue);
    }
  };

  const pickWithEyeDropper = async () => {
    const Dropper = getEyeDropper();
    if (!Dropper) {
      return;
    }
    try {
      const result = await new Dropper().open();
      const normalized = normalizeHex(result.sRGBHex);
      if (normalized) {
        emitHex(normalized);
      }
    } catch {
      return;
    }
  };

  const hueColor = hueToHex(hsv.h);
  const currentHex = hsvToHex(hsv);
  const areaStyle = { '--sc-cp-hue': hueColor } as CSSProperties;
  const thumbStyle = { left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, '--sc-cp-color': currentHex } as CSSProperties;

  const panel = (
    <div
      ref={panelRef}
      id={dialogId}
      role="dialog"
      aria-label={label}
      className={`sc-cp-panel${isSheet ? ' sc-cp-panel--sheet' : ''}${presence.isExiting ? ' is-exiting' : ''}`}
      style={!isSheet && placement ? { top: placement.top, left: placement.left, transformOrigin: placement.origin } : undefined}
      data-ready={isSheet || placement !== null}
    >
      {isSheet && <span className="sc-cp-grabber" aria-hidden="true" />}
      <div
        ref={areaRef}
        className="sc-cp-area"
        style={areaStyle}
        role="slider"
        tabIndex={0}
        aria-label={t('colorPicker.area')}
        aria-valuetext={t('colorPicker.areaValue', { saturation: Math.round(hsv.s * 100), brightness: Math.round(hsv.v * 100) })}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(hsv.s * 100)}
        onPointerDown={handleAreaPointerDown}
        onPointerMove={handleAreaPointerMove}
        onKeyDown={handleAreaKeyDown}
      >
        <span className="sc-cp-area__thumb" style={thumbStyle} />
      </div>

      <div className="sc-cp-controls">
        {eyeDropper && (
          <button type="button" className="sc-cp-eyedropper" onClick={() => void pickWithEyeDropper()} title={t('colorPicker.eyedropper')} aria-label={t('colorPicker.eyedropper')}>
            <LuPipette size={16} aria-hidden="true" />
          </button>
        )}
        <span className="sc-cp-preview" style={{ background: currentHex }} aria-hidden="true" />
        <input
          type="range"
          className="sc-cp-hue"
          min={0}
          max={360}
          step={1}
          value={Math.round(hsv.h)}
          aria-label={t('colorPicker.hue')}
          onChange={(event) => emit({ ...hsv, h: Number(event.target.value) })}
        />
      </div>

      <label className="sc-cp-hex">
        <span className="sc-cp-hex__label">{t('colorPicker.hex')}</span>
        <input
          type="text"
          value={hexDraft}
          maxLength={7}
          spellCheck={false}
          autoComplete="off"
          aria-invalid={normalizeHex(hexDraft) === null}
          onChange={(event) => {
            const draft = event.target.value;
            setHexDraft(draft);
            const normalized = draft.length >= 4 ? normalizeHex(draft) : null;
            if (normalized && (draft.length === 4 || draft.length === 7)) {
              emitHex(normalized);
            }
          }}
          onBlur={commitHexDraft}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              commitHexDraft();
            }
          }}
        />
      </label>

      <div className="sc-cp-presets" role="group" aria-label={t('colorPicker.presets')}>
        {presets.map((preset, index) => {
          const selected = normalizeHex(preset) === currentHex;
          return (
            <button
              key={preset}
              type="button"
              className="sc-cp-preset"
              data-selected={selected}
              aria-label={preset}
              aria-pressed={selected}
              title={preset}
              style={{ background: preset, '--sc-cp-i': index } as CSSProperties}
              onClick={() => emitHex(normalizeHex(preset) ?? preset)}
            >
              {selected && <LuCheck size={11} strokeWidth={3} aria-hidden="true" />}
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={`sc-cp-trigger${className ? ` ${className}` : ''}`}
        style={{ backgroundColor: normalizedValue }}
        title={label}
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-controls={isOpen ? dialogId : undefined}
        onClick={() => setIsOpen((open) => !open)}
      />
      {presence.isPresent &&
        createPortal(
          <>
            {isSheet && <div className={`sc-cp-backdrop${presence.isExiting ? ' is-exiting' : ''}`} onClick={() => close(true)} />}
            {panel}
          </>,
          document.body,
        )}
    </>
  );
}
