// ══════════════════════════════════════════════════════════════════════════════
//  TVFocusManager — Spatial 2D Navigation Engine for Android TV & Google TV
//  Enables smooth 100% remote D-pad control without mouse or touch input.
// ══════════════════════════════════════════════════════════════════════════════

type Direction = 'up' | 'down' | 'left' | 'right';

class TVFocusManager {
  private activeElement: HTMLElement | null = null;
  private focusMemory: Map<string, string> = new Map(); // sectionId -> lastFocusedElementId
  private backListeners: Set<() => boolean> = new Set(); // returns true if handled

  /**
   * Initializes remote key listening for Android TV D-Pad and Media keys.
   */
  public init(): () => void {
    if (typeof window === 'undefined') return () => {};

    const handleKeyDown = (e: KeyboardEvent) => {
      // 1. D-Pad Directional Navigation
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        const direction: Direction =
          e.key === 'ArrowUp' ? 'up' :
          e.key === 'ArrowDown' ? 'down' :
          e.key === 'ArrowLeft' ? 'left' : 'right';

        const handled = this.moveFocus(direction);
        if (handled) {
          e.preventDefault();
        }
      }

      // 2. Select / Enter Key
      else if (e.key === 'Enter' || e.key === 'Select' || e.keyCode === 13) {
        const current = document.activeElement as HTMLElement;
        if (current && typeof current.click === 'function') {
          current.click();
          e.preventDefault();
        }
      }

      // 3. Android TV Back Key / Escape
      else if (e.key === 'Escape' || e.key === 'GoBack' || e.keyCode === 27 || e.keyCode === 4 || e.keyCode === 10009) {
        let handled = false;
        for (const listener of Array.from(this.backListeners).reverse()) {
          if (listener()) {
            handled = true;
            break;
          }
        }
        if (handled) {
          e.preventDefault();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown, { passive: false });

    // Focus initial element after mount
    setTimeout(() => this.focusDefaultElement(), 200);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }

  /**
   * Registers a back-button handler (e.g. closing full player or returning to previous screen).
   */
  public registerBackHandler(handler: () => boolean): () => void {
    this.backListeners.add(handler);
    return () => {
      this.backListeners.delete(handler);
    };
  }

  /**
   * Focuses the first available interactive TV element.
   */
  public focusDefaultElement(container?: HTMLElement): boolean {
    const root = container || document;
    const focusable = root.querySelectorAll<HTMLElement>(
      '[data-tv-focus="true"], [tabindex="0"], button:not([disabled]), input:not([disabled])'
    );

    for (let i = 0; i < focusable.length; i++) {
      const el = focusable[i];
      if (this.isVisible(el)) {
        el.focus();
        this.activeElement = el;
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
        return true;
      }
    }
    return false;
  }

  /**
   * Performs 2D directional spatial focus searching.
   */
  public moveFocus(direction: Direction): boolean {
    const current = (document.activeElement as HTMLElement) || this.activeElement;
    if (!current || current === document.body) {
      return this.focusDefaultElement();
    }

    const currentRect = current.getBoundingClientRect();
    const allFocusables = Array.from(
      document.querySelectorAll<HTMLElement>(
        '[data-tv-focus="true"], [tabindex="0"], button:not([disabled]), input:not([disabled]), a[href]'
      )
    ).filter((el) => el !== current && this.isVisible(el));

    if (allFocusables.length === 0) return false;

    let bestCandidate: HTMLElement | null = null;
    let minDistance = Infinity;

    for (const candidate of allFocusables) {
      const targetRect = candidate.getBoundingClientRect();
      if (!this.isInDirection(currentRect, targetRect, direction)) {
        continue;
      }

      const dist = this.calculateDistance(currentRect, targetRect, direction);
      if (dist < minDistance) {
        minDistance = dist;
        bestCandidate = candidate;
      }
    }

    if (bestCandidate) {
      // Remember previous item in row
      const section = current.getAttribute('data-tv-section');
      if (section && current.id) {
        this.focusMemory.set(section, current.id);
      }

      bestCandidate.focus();
      this.activeElement = bestCandidate;

      // Scroll smoothly into view with TV margin
      bestCandidate.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'nearest',
      });
      return true;
    }

    return false;
  }

  private isInDirection(from: DOMRect, to: DOMRect, dir: Direction): boolean {
    const fromCenterX = from.left + from.width / 2;
    const fromCenterY = from.top + from.height / 2;
    const toCenterX = to.left + to.width / 2;
    const toCenterY = to.top + to.height / 2;

    switch (dir) {
      case 'up':
        return toCenterY < fromCenterY - 4;
      case 'down':
        return toCenterY > fromCenterY + 4;
      case 'left':
        return toCenterX < fromCenterX - 4;
      case 'right':
        return toCenterX > fromCenterX + 4;
    }
  }

  private calculateDistance(from: DOMRect, to: DOMRect, dir: Direction): number {
    const fromCenterX = from.left + from.width / 2;
    const fromCenterY = from.top + from.height / 2;
    const toCenterX = to.left + to.width / 2;
    const toCenterY = to.top + to.height / 2;

    const dx = toCenterX - fromCenterX;
    const dy = toCenterY - fromCenterY;

    // Weight the orthogonal axis higher so items in direct line are strongly preferred
    if (dir === 'left' || dir === 'right') {
      return Math.abs(dx) + Math.abs(dy) * 2.2;
    } else {
      return Math.abs(dy) + Math.abs(dx) * 2.2;
    }
  }

  private isVisible(el: HTMLElement): boolean {
    if (!el || el.offsetParent === null) return false;
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
      return false;
    }
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }
}

export const tvFocusManager = new TVFocusManager();
