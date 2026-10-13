/** True on macOS / iOS, where shortcuts use ⌘ instead of Ctrl. */
export const IS_MAC = (() => {
  try {
    const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
    return /mac|iphone|ipad|ipod/i.test(nav.userAgentData?.platform || nav.platform || nav.userAgent);
  } catch {
    return false;
  }
})();

/** Label of the command palette shortcut for this platform. */
export const PALETTE_SHORTCUT = IS_MAC ? '⌘K' : 'Ctrl K';
