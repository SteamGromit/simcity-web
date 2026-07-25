/**
 * Shared modal-panel chrome.
 *
 * Every panel the HUD opens wears the same two things: a close control in the
 * top-right of its title bar, and an `.open` flag on the HUD button that
 * summoned it. Before this, the only way out of a panel was to find the button
 * that opened it and press it again — which meant remembering which one that
 * was, with no sign on the bar that anything was open at all.
 */

/**
 * Put a × in the panel's title bar. Idempotent: panels that re-render their
 * whole body (the Mods panel does) can call this again after each render
 * without stacking up buttons.
 */
export function addPanelClose(panel: HTMLElement, onClose: () => void): void {
  const head = panel.querySelector('h3');
  if (!head || head.querySelector('.panel-close')) return;
  const btn = document.createElement('button');
  btn.className = 'panel-close';
  btn.type = 'button';
  btn.textContent = '×';
  btn.title = 'Close';
  btn.setAttribute('aria-label', 'Close');
  btn.addEventListener('click', (e) => {
    e.stopPropagation(); // the title bar is also the drag handle
    onClose();
  });
  head.appendChild(btn);
}

export interface PanelHandle {
  toggle(): void;
  open(): void;
  close(): void;
  isOpen(): boolean;
}

/**
 * Open/close bookkeeping plus the close control, in one call. `onOpen` runs
 * every time the panel becomes visible — panels use it to refresh state they
 * only keep current while on screen.
 */
export function panelHandle(panel: HTMLElement, onOpen?: () => void): PanelHandle {
  const isOpen = () => !panel.classList.contains('hidden');
  const close = () => panel.classList.add('hidden');
  const open = () => {
    panel.classList.remove('hidden');
    onOpen?.();
  };
  addPanelClose(panel, close);
  return {
    isOpen,
    open,
    close,
    toggle() {
      if (isOpen()) close();
      else open();
    },
  };
}
