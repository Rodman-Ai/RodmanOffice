import { useEffect } from "react";

/**
 * Capture the currently-focused element when the hook first runs and
 * restore focus to it when the component unmounts. Used by every modal
 * so closing a dialog returns focus to the menu item / button that
 * opened it.
 */
export function useReturnFocusOnClose(): void {
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    return () => {
      if (previouslyFocused && document.contains(previouslyFocused)) {
        try {
          previouslyFocused.focus();
        } catch {
          // ignore — element may have been removed
        }
      }
    };
  }, []);
}
