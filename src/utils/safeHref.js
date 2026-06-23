export function safeHref(url) {
  if (!url) return '#'
  try {
    const { protocol } = new URL(url)
    return ['http:', 'https:'].includes(protocol) ? url : '#'
  } catch { return '#' }
}
