/** Ordinary clicks stay on the desk; modified clicks retain browser behavior. */
export function deskLinks(root, openLink) {
  root.addEventListener('click', event => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const anchor = event.target.closest('a[href]');
    if (!anchor || !root.contains(anchor) || anchor.hasAttribute('download') || anchor.closest('.msg-images')) return;
    const href = anchor.getAttribute('href');
    if (!href || /^(?:#|mailto:|tel:|\/api\/)/i.test(href)) return;
    if (/^[a-z][a-z0-9+.-]*:/i.test(href) && !/^https?:/i.test(href)) return;
    event.preventDefault();
    openLink(href);
  });
}
