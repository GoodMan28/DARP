import { Fragment, type ReactNode } from 'react';

/*
 * A return remark is plain text with a few simple marks: **bold**, _italic_, "- " and "1. " lists,
 * and [text](https://link). It is never stored or rendered as HTML: React escapes every character,
 * and only these marks are turned into elements.
 */

const INLINE = /(\*\*([^*\n]+)\*\*)|(_([^_\n]+)_)|(\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\))/g;

function inline(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let n = 0;
  for (const m of text.matchAll(INLINE)) {
    const at = m.index ?? 0;
    if (at > last) out.push(text.slice(last, at));
    const key = `${keyBase}-${n++}`;
    if (m[2] !== undefined) out.push(<strong key={key}>{m[2]}</strong>);
    else if (m[4] !== undefined) out.push(<em key={key}>{m[4]}</em>);
    else out.push(
      <a key={key} href={m[7]} target="_blank" rel="noopener noreferrer" className="font-semibold underline">{m[6]}</a>,
    );
    last = at + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** The remark as paragraphs and lists. */
export function Remark({ text, className }: { text: string; className?: string }) {
  const blocks: ReactNode[] = [];
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  let i = 0;
  let k = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
    const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (bullet || numbered) {
      const re = bullet ? /^\s*[-*]\s+(.*)$/ : /^\s*\d+[.)]\s+(.*)$/;
      const items: string[] = [];
      while (i < lines.length && re.test(lines[i]!)) { items.push(re.exec(lines[i]!)![1]!); i++; }
      const li = items.map((t, j) => <li key={j}>{inline(t, `l${k}-${j}`)}</li>);
      blocks.push(bullet
        ? <ul key={k++} className="list-disc pl-5">{li}</ul>
        : <ol key={k++} className="list-decimal pl-5">{li}</ol>);
    } else if (line.trim() === '') {
      i++;
    } else {
      const para: string[] = [];
      while (i < lines.length && lines[i]!.trim() !== '' && !/^\s*([-*]|\d+[.)])\s+/.test(lines[i]!)) { para.push(lines[i]!); i++; }
      blocks.push(
        <p key={k++}>
          {para.map((t, j) => <Fragment key={j}>{j > 0 ? <br /> : null}{inline(t, `p${k}-${j}`)}</Fragment>)}
        </p>,
      );
    }
  }
  return <div className={`space-y-1 ${className ?? ''}`}>{blocks}</div>;
}
