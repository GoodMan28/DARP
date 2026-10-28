'use client';

import { useEffect, useRef, useState } from 'react';

const LIMIT = 2000;

/* The editor shows the formatting as you type (bold, lists, links) and keeps the same simple marks
 * the rest of the app reads: **bold**, _italic_, "- " and "1. " lists, [text](https://link). */

const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function inlineToHtml(t: string): string {
  return esc(t)
    .replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>')
    .replace(/(^|[^\w])_([^_\n]+)_/g, '$1<i>$2</i>')
    .replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2">$1</a>');
}

/** The marks as HTML for the editor to show. */
export function marksToHtml(text: string): string {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  let html = '';
  let i = 0;
  while (i < lines.length) {
    const bullet = /^\s*[-*]\s+(.*)$/.exec(lines[i]!);
    const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(lines[i]!);
    if (bullet || numbered) {
      const re = bullet ? /^\s*[-*]\s+(.*)$/ : /^\s*\d+[.)]\s+(.*)$/;
      const items: string[] = [];
      while (i < lines.length && re.test(lines[i]!)) { items.push(re.exec(lines[i]!)![1]!); i++; }
      const tag = bullet ? 'ul' : 'ol';
      html += `<${tag}>${items.map((x) => `<li>${inlineToHtml(x)}</li>`).join('')}</${tag}>`;
    } else {
      html += `<div>${lines[i]!.trim() === '' ? '<br>' : inlineToHtml(lines[i]!)}</div>`;
      i++;
    }
  }
  return html;
}

function inlineOf(n: Node): string {
  if (n.nodeType === Node.TEXT_NODE) return n.textContent ?? '';
  if (!(n instanceof HTMLElement)) return '';
  const inner = [...n.childNodes].map(inlineOf).join('');
  const tag = n.tagName;
  if (tag === 'BR') return '\n';
  if (!inner.trim()) return inner;
  if (tag === 'B' || tag === 'STRONG' || /bold|[6-9]00/.test(n.style.fontWeight)) return `**${inner}**`;
  if (tag === 'I' || tag === 'EM' || n.style.fontStyle === 'italic') return `_${inner}_`;
  if (tag === 'A') {
    const href = n.getAttribute('href') ?? '';
    return /^https?:\/\//i.test(href) ? `[${inner}](${href})` : inner;
  }
  return inner;
}

/** The editor's HTML back to the marks. */
export function htmlToMarks(root: HTMLElement): string {
  const out: string[] = [];
  const walk = (parent: Node) => {
    let line = '';
    const flush = () => { if (line !== '') { out.push(line); line = ''; } };
    for (const n of parent.childNodes) {
      if (n instanceof HTMLElement && (n.tagName === 'UL' || n.tagName === 'OL')) {
        flush();
        [...n.children].forEach((li, k) => out.push(`${n.tagName === 'UL' ? '-' : `${k + 1}.`} ${[...li.childNodes].map(inlineOf).join('').replace(/\n+/g, ' ').trim()}`));
      } else if (n instanceof HTMLElement && ['DIV', 'P'].includes(n.tagName)) {
        flush();
        if (n.querySelector('ul,ol')) walk(n);
        else out.push([...n.childNodes].map(inlineOf).join(''));
      } else {
        line += inlineOf(n);
      }
    }
    flush();
  };
  walk(root);
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

interface Props {
  id: string;
  value: string;
  onChange: (v: string) => void;
  invalid?: boolean;
  placeholder?: string;
}

/** A remark box that shows bold, lists and links as you type, with a toolbar. */
export function RemarkEditor({ id, value, onChange, invalid, placeholder }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [empty, setEmpty] = useState(!value.trim());
  const [length, setLength] = useState(value.length);
  const last = useRef(value);

  // Set the starting text once; later edits come from the user, and a reset (empty) clears the box.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (value !== last.current || el.innerHTML === '') {
      el.innerHTML = marksToHtml(value);
      last.current = value;
      setEmpty(!value.trim());
      setLength(value.length);
    }
  }, [value]);

  function emit() {
    const el = ref.current;
    if (!el) return;
    let marks = htmlToMarks(el);
    if (marks.length > LIMIT) marks = marks.slice(0, LIMIT);
    last.current = marks;
    setEmpty(!marks.trim());
    setLength(marks.length);
    onChange(marks);
  }

  function cmd(name: string, arg?: string) {
    ref.current?.focus();
    document.execCommand(name, false, arg);
    emit();
  }

  function link() {
    const url = window.prompt('Link address (starting with https://)', 'https://');
    if (url && /^https?:\/\//i.test(url)) cmd('createLink', url);
  }

  const btn = 'inline-flex min-h-10 min-w-10 items-center justify-center rounded-sm px-2 text-base hover:bg-surface-2 focus-visible:outline focus-visible:outline-2';

  return (
    <div className={`rounded-md border-2 bg-surface ${invalid ? 'border-danger-500' : 'border-line focus-within:border-primary'}`}>
      <div className="flex flex-wrap items-center gap-0.5 border-b border-line px-2 py-1" role="toolbar" aria-label="Formatting">
        <button type="button" className={btn} onMouseDown={(e) => e.preventDefault()} onClick={() => cmd('bold')} aria-label="Bold" title="Bold (Ctrl+B)"><b>B</b></button>
        <button type="button" className={btn} onMouseDown={(e) => e.preventDefault()} onClick={() => cmd('italic')} aria-label="Italic" title="Italic (Ctrl+I)"><i>I</i></button>
        <span className="mx-1 h-6 w-px bg-line" aria-hidden />
        <button type="button" className={btn} onMouseDown={(e) => e.preventDefault()} onClick={link} aria-label="Link" title="Add a link">🔗</button>
        <span className="mx-1 h-6 w-px bg-line" aria-hidden />
        <button type="button" className={btn} onMouseDown={(e) => e.preventDefault()} onClick={() => cmd('insertOrderedList')} aria-label="Numbered list" title="Numbered list">1.</button>
        <button type="button" className={btn} onMouseDown={(e) => e.preventDefault()} onClick={() => cmd('insertUnorderedList')} aria-label="Bulleted list" title="Bulleted list">•</button>
        <button type="button" className={btn} onMouseDown={(e) => e.preventDefault()} onClick={() => cmd('removeFormat')} aria-label="Clear formatting" title="Clear formatting">Tx</button>
      </div>
      <div className="relative">
        {empty && placeholder ? (
          <span className="pointer-events-none absolute left-3 top-2.5 text-ink-muted">{placeholder}</span>
        ) : null}
        <div
          id={id}
          ref={ref}
          role="textbox"
          aria-multiline="true"
          aria-invalid={invalid ? true : undefined}
          contentEditable
          suppressContentEditableWarning
          className="max-h-96 min-h-40 overflow-auto px-3 py-2.5 text-base outline-none [&_a]:text-primary [&_a]:underline [&_ol]:list-decimal [&_ol]:pl-6 [&_ul]:list-disc [&_ul]:pl-6"
          onInput={emit}
          onBlur={emit}
          onPaste={(e) => {
            e.preventDefault();
            document.execCommand('insertText', false, e.clipboardData.getData('text/plain'));
          }}
        />
      </div>
      <p className="px-3 pb-1.5 text-right text-xs text-ink-muted">{length} / {LIMIT}</p>
    </div>
  );
}
