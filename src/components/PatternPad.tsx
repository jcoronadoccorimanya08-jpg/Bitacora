import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { haptic } from '../lib/feedback';

const MIN_POINTS = 4;

interface Props {
  /** Se llama con el patrón ("1-5-9-6") al soltar el dedo. */
  onComplete: (pattern: string) => void;
  /** Cambia para limpiar el dibujo (por ejemplo, después de un error). */
  resetKey?: number;
  error?: boolean;
  disabled?: boolean;
}

/** Patrón de 3×3 puntos, como el de Android. Los puntos se numeran del 1 al 9. */
export function PatternPad({ onComplete, resetKey = 0, error = false, disabled = false }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [path, setPath] = useState<number[]>([]);
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [tooShort, setTooShort] = useState(false);
  const [size, setSize] = useState(280);

  useEffect(() => {
    setPath([]);
    setPointer(null);
  }, [resetKey]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize(el.clientWidth));
    ro.observe(el);
    setSize(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const cell = size / 3;
  const center = (i: number) => ({ x: (i % 3) * cell + cell / 2, y: Math.floor(i / 3) * cell + cell / 2 });

  const local = (e: PointerEvent<HTMLDivElement>) => {
    const r = ref.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const hit = (p: { x: number; y: number }) => {
    for (let i = 0; i < 9; i++) {
      const c = center(i);
      if (Math.hypot(c.x - p.x, c.y - p.y) < cell * 0.32) return i;
    }
    return -1;
  };

  const add = (i: number, current: number[]) => {
    if (i < 0 || current.includes(i)) return current;
    const next = [...current];
    const last = next[next.length - 1];
    if (last !== undefined) {
      // Si pasas por encima de un punto intermedio (en línea recta), también cuenta.
      const [r1, c1, r2, c2] = [Math.floor(last / 3), last % 3, Math.floor(i / 3), i % 3];
      if ((r1 + r2) % 2 === 0 && (c1 + c2) % 2 === 0) {
        const mid = ((r1 + r2) / 2) * 3 + (c1 + c2) / 2;
        if (!next.includes(mid)) next.push(mid);
      }
    }
    next.push(i);
    haptic(8);
    return next;
  };

  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    if (disabled) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = local(e);
    setTooShort(false);
    setDrawing(true);
    setPointer(p);
    setPath(add(hit(p), []));
  };

  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!drawing) return;
    const p = local(e);
    setPointer(p);
    setPath((cur) => add(hit(p), cur));
  };

  const onUp = () => {
    if (!drawing) return;
    setDrawing(false);
    setPointer(null);
    if (path.length >= MIN_POINTS) onComplete(path.map((i) => i + 1).join('-'));
    else {
      if (path.length > 0) setTooShort(true);
      setPath([]);
    }
  };

  const points = path.map(center);
  const tail = drawing && pointer && points.length ? [...points, pointer] : points;
  const state = error ? 'error' : drawing ? 'drawing' : path.length ? 'done' : '';

  return (
    <div className="pattern-wrap">
      <div
        ref={ref}
        className={`pattern ${state} ${error ? 'shake' : ''}`}
        role="group"
        aria-label="Dibuja tu patrón uniendo al menos 4 puntos"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      >
        <svg width={size} height={size} aria-hidden="true">
          {tail.length > 1 && (
            <polyline points={tail.map((p) => `${p.x},${p.y}`).join(' ')} fill="none" className="pattern-line" strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" />
          )}
        </svg>
        {Array.from({ length: 9 }, (_, i) => {
          const c = center(i);
          return (
            <span
              key={i}
              data-dot={i + 1}
              className={`pattern-dot ${path.includes(i) ? 'on' : ''}`}
              style={{ left: c.x, top: c.y }}
            />
          );
        })}
      </div>
      <p className="pin-error" role="status">
        {tooShort ? `Une al menos ${MIN_POINTS} puntos.` : ''}
      </p>
    </div>
  );
}
