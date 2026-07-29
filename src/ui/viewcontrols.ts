/**
 * On-screen view controls: zoom in/out, and the toggle that slides the toolbar
 * in and out on a narrow screen.
 *
 * Zoom used to be reachable only through the mouse wheel, which left touch
 * devices with no way to zoom at all. These buttons are the fallback that
 * always works — a trackpad-less desktop gets them too.
 */

export interface ViewControlActions {
  zoomIn(): void;
  zoomOut(): void;
  toggleTools(): void;
}

export function buildViewControls(root: HTMLElement, actions: ViewControlActions) {
  const el = document.createElement('div');
  el.id = 'view-controls';

  const make = (cls: string, label: string, title: string, onClick: () => void) => {
    const btn = document.createElement('button');
    btn.className = cls;
    btn.type = 'button';
    btn.textContent = label;
    btn.title = title;
    btn.setAttribute('aria-label', title);
    // Buttons sit over the canvas; without this a press would also start a
    // build on the tile underneath.
    btn.addEventListener('pointerdown', (e) => e.stopPropagation());
    btn.addEventListener('click', onClick);
    el.appendChild(btn);
    return btn;
  };

  // Only useful where the toolbar is a drawer; CSS hides it on wide screens.
  make('vc-tools', '☰', 'Show or hide the tools', actions.toggleTools);
  make('vc-zoom', '+', 'Zoom in', actions.zoomIn);
  make('vc-zoom', '−', 'Zoom out', actions.zoomOut);

  root.appendChild(el);
  return el;
}
