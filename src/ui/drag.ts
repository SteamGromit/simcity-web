const POS_KEY = 'simcity.pos.';

/**
 * Make a fixed-position panel draggable by its handle; the position is
 * remembered per panel. Clicks on buttons/inputs inside the handle still
 * work — only bare-handle drags move the panel.
 */
export function makeDraggable(el: HTMLElement, handle: HTMLElement, key: string): void {
  const saved = localStorage.getItem(POS_KEY + key);
  if (saved) {
    try {
      const p = JSON.parse(saved) as { l: number; t: number };
      place(p.l, p.t);
    } catch {
      /* corrupt position — keep the default */
    }
  }

  function place(l: number, t: number) {
    el.style.left = `${Math.max(0, Math.min(window.innerWidth - 60, l))}px`;
    el.style.top = `${Math.max(0, Math.min(window.innerHeight - 40, t))}px`;
    el.style.right = 'auto';
    el.style.bottom = 'auto';
    el.style.transform = 'none';
  }

  handle.classList.add('draggable');
  handle.addEventListener('pointerdown', (e) => {
    const target = e.target as HTMLElement;
    if (target.closest('button, input, canvas')) return;
    const rect = el.getBoundingClientRect();
    const ox = e.clientX - rect.left;
    const oy = e.clientY - rect.top;
    const move = (ev: PointerEvent) => place(ev.clientX - ox, ev.clientY - oy);
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      localStorage.setItem(
        POS_KEY + key,
        JSON.stringify({ l: parseInt(el.style.left, 10), t: parseInt(el.style.top, 10) }),
      );
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    e.preventDefault();
  });
}
