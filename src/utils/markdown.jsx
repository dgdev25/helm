export function renderMarkdown(md) {
  if (!md) return null
  const text = md.replace(/<!--[\s\S]*?-->/g, '').trim()
  if (!text) return null
  const lines = text.split('\n')
  const els = []
  let i = 0
  const fmt = s => s
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
  while (i < lines.length) {
    const line = lines[i]
    if (line.startsWith('```')) {
      const codeLines = []
      i++
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i])
        i++
      }
      els.push(<pre key={`pre-${i}`} className="pm-pre"><code>{codeLines.join('\n')}</code></pre>)
    } else if (line.startsWith('# ')) {
      els.push(<h1 key={i} className="pm-h1" dangerouslySetInnerHTML={{ __html: fmt(line.slice(2)) }} />)
    } else if (line.startsWith('## ')) {
      els.push(<h2 key={i} className="pm-h2" dangerouslySetInnerHTML={{ __html: fmt(line.slice(3)) }} />)
    } else if (line.startsWith('### ')) {
      els.push(<h3 key={i} className="pm-h3" dangerouslySetInnerHTML={{ __html: fmt(line.slice(4)) }} />)
    } else if (/^[-*] /.test(line)) {
      const items = []
      while (i < lines.length && /^[-*] /.test(lines[i])) {
        items.push(<li key={i} dangerouslySetInnerHTML={{ __html: fmt(lines[i].slice(2)) }} />)
        i++
      }
      els.push(<ul key={`ul-${i}`} className="pm-ul">{items}</ul>)
      continue
    } else if (/^\d+\. /.test(line)) {
      const items = []
      while (i < lines.length && /^\d+\. /.test(lines[i])) {
        items.push(<li key={i} dangerouslySetInnerHTML={{ __html: fmt(lines[i].replace(/^\d+\. /, '')) }} />)
        i++
      }
      els.push(<ol key={`ol-${i}`} className="pm-ul">{items}</ol>)
      continue
    } else if (line.trim()) {
      els.push(<p key={i} className="pm-p" dangerouslySetInnerHTML={{ __html: fmt(line) }} />)
    }
    i++
  }
  return els
}
