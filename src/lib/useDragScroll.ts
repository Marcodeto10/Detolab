import { useEffect, useRef } from 'react';

/**
 * Fila horizontal que se arrastra con el mouse (en celular ya se desliza con el dedo).
 * Al soltar sigue un poco por inercia, y si fue un arrastre el click no abre la foto.
 */
export const useDragScroll = <T extends HTMLElement>() => {
  const ref = useRef<T>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let pointerId: number | null = null;
    let startX = 0;
    let startScroll = 0;
    let lastX = 0;
    let lastTime = 0;
    let velocity = 0;
    let moved = false;
    let glide = 0;

    const stopGlide = () => cancelAnimationFrame(glide);

    const onDown = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' || e.button !== 0) return;
      stopGlide();
      pointerId = e.pointerId;
      startX = lastX = e.clientX;
      startScroll = el.scrollLeft;
      lastTime = performance.now();
      velocity = 0;
      moved = false;
    };

    const onMove = (e: PointerEvent) => {
      if (pointerId !== e.pointerId) return;
      const dx = e.clientX - startX;
      if (!moved && Math.abs(dx) < 5) return;
      if (!moved) {
        moved = true;
        try {
          el.setPointerCapture(e.pointerId);
        } catch {
          // el puntero ya se soltó: seguimos sin capturarlo
        }
        el.classList.add('is-dragging');
      }
      const now = performance.now();
      // Velocidad en px/ms, con tope para que un tirón no mande la fila hasta el final
      velocity = Math.max(-2.5, Math.min(2.5, (e.clientX - lastX) / Math.max(8, now - lastTime)));
      lastX = e.clientX;
      lastTime = now;
      el.scrollLeft = startScroll - dx;
    };

    const onEnd = (e: PointerEvent) => {
      if (pointerId !== e.pointerId) return;
      pointerId = null;
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
      if (!moved) return;

      // Inercia: sigue deslizando y frena de a poco; al final vuelve el "snap" a la foto más cercana.
      // Si soltaste quieto (sin mover en el último momento), no hay inercia.
      let v = performance.now() - lastTime > 80 ? 0 : velocity * 16;
      const step = () => {
        const prev = el.scrollLeft;
        v *= 0.92;
        el.scrollLeft -= v;
        if (Math.abs(v) > 0.5 && el.scrollLeft !== prev) glide = requestAnimationFrame(step);
        else el.classList.remove('is-dragging');
      };
      glide = requestAnimationFrame(step);
    };

    const onClick = (e: MouseEvent) => {
      if (!moved) return;
      e.preventDefault();
      e.stopPropagation();
      moved = false;
    };

    const onDragStart = (e: DragEvent) => e.preventDefault();

    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onEnd);
    el.addEventListener('pointercancel', onEnd);
    el.addEventListener('click', onClick, true);
    el.addEventListener('dragstart', onDragStart);
    return () => {
      stopGlide();
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onEnd);
      el.removeEventListener('pointercancel', onEnd);
      el.removeEventListener('click', onClick, true);
      el.removeEventListener('dragstart', onDragStart);
    };
  }, []);

  return ref;
};
