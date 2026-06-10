"""
Minimaler Markdown-zu-HTML-Konverter (ohne externe Abhaengigkeiten).

Reicht, um TESTING.md, UI_CONCEPT.md, PLAYSTORE.md, README.md und das
Audit-Protokoll (protocol.md) so zu rendern, dass sie aus dem
Dashboard heraus direkt im Browser lesbar sind.

Unterstuetzte Syntax:

  * ATX-Headings  #  ##  ###  ####  #####  ######
  * Setext-Headings ( ====  /  ---- ) - werden ignoriert
  * Code-Fences ```lang ... ```
  * Inline-Code mit `back-ticks`
  * Bold **x**, kursiv *x*, fett-kursiv ***x***
  * Links [text](url) und Auto-Links <https://...>
  * Bilder ![alt](src) (ohne Embed-Logik)
  * Listen  -  *  +   sowie nummerierte 1.
  * Tabellen   | a | b |    mit Header-Trenner
  * Horizontale Linien ---   ***   ___
  * Blockquotes > text
  * Paragraphen (durch Leerzeilen getrennt)

Bewusst NICHT unterstuetzt: Footnotes, Fussnoten-Style-Links,
HTML-Passthrough (alles wird escaped, ausser unsere generierten Tags).
Das passt zu unseren Doku-Dateien.

Die generierte HTML ist self-contained: das CSS aus
tools/dashboard.py wird wiederverwendet (gleicher Look). Wer das
Modul direkt aufruft, bekommt ein eigenstaendiges Wrapper-HTML.
"""
from __future__ import annotations

import argparse
import html
import re
import sys
from pathlib import Path
from typing import Optional


# Public CSS - wird von tools/dashboard.py importiert, damit die
# gerenderten Doku-Seiten und das Dashboard im gleichen Stil sind.
DOC_CSS = """
.doc {
  max-width: 880px; margin: 0 auto; padding: 32px 24px 64px;
  background: var(--surface); color: var(--text);
  border-radius: 12px; border: 1px solid var(--border);
  box-shadow: var(--shadow);
}
.doc h1, .doc h2, .doc h3, .doc h4, .doc h5, .doc h6 {
  color: var(--text); line-height: 1.25;
  margin: 1.4em 0 0.5em;
}
.doc h1 { font-size: 28px; border-bottom: 1px solid var(--border);
          padding-bottom: 8px; }
.doc h2 { font-size: 22px; border-bottom: 1px solid var(--border);
          padding-bottom: 6px; }
.doc h3 { font-size: 18px; }
.doc h4 { font-size: 16px; color: var(--text-muted); }
.doc p  { margin: 0.7em 0; line-height: 1.6; }
.doc a  { color: var(--primary); text-decoration: none; }
.doc a:hover { text-decoration: underline; }
.doc ul, .doc ol { padding-left: 24px; line-height: 1.6; }
.doc li { margin: 0.2em 0; }
.doc hr { border: none; border-top: 1px solid var(--border); margin: 24px 0; }
.doc code {
  font-family: var(--mono); font-size: 12.5px;
  background: var(--surface-muted); padding: 2px 6px;
  border-radius: 4px; border: 1px solid var(--border);
}
.doc pre {
  background: var(--surface-muted); border: 1px solid var(--border);
  border-radius: 8px; padding: 12px 14px; overflow-x: auto;
  font-family: var(--mono); font-size: 12.5px; line-height: 1.5;
}
.doc pre code { background: transparent; border: none; padding: 0; }
.doc blockquote {
  margin: 0.7em 0; padding: 8px 14px;
  border-left: 3px solid var(--primary);
  background: var(--surface-muted); color: var(--text);
  border-radius: 0 8px 8px 0;
}
.doc table {
  width: 100%; border-collapse: collapse; margin: 1em 0;
  border: 1px solid var(--border); border-radius: 8px; overflow: hidden;
  background: var(--surface);
}
.doc th, .doc td {
  text-align: left; padding: 8px 12px; font-size: 13px;
  border-bottom: 1px solid var(--border);
}
.doc th { background: var(--surface-muted); color: var(--text-muted);
          font-weight: 600; text-transform: uppercase;
          font-size: 11px; letter-spacing: 0.04em; }
.doc tr:last-child td { border-bottom: none; }
.doc img { max-width: 100%; border-radius: 6px; }
"""


# ---------------------------------------------------------------------------
# Inline-Pass
# ---------------------------------------------------------------------------
_RE_CODE_INLINE = re.compile(r"`([^`\n]+)`")
_RE_BOLD_ITALIC = re.compile(r"\*\*\*(.+?)\*\*\*")
_RE_BOLD = re.compile(r"\*\*(.+?)\*\*")
_RE_ITALIC = re.compile(r"(?<!\*)\*([^*\n]+?)\*(?!\*)")
_RE_IMG = re.compile(r"!\[([^\]]*)\]\(([^)\s]+)(?:\s+\"([^\"]+)\")?\)")
_RE_LINK = re.compile(r"\[([^\]]+)\]\(([^)\s]+)(?:\s+\"([^\"]+)\")?\)")
_RE_AUTOLINK = re.compile(r"<((?:https?|mailto:)[^>\s]+)>")


def _inline(text: str) -> str:
    """Inline-Markdown -> HTML. Alles wird HTML-escaped."""
    # 1) Inline-Code zuerst extrahieren (Placeholders), damit Sterne darin
    #    nicht als Bold interpretiert werden.
    placeholders: list[str] = []
    def _stash(match: re.Match) -> str:
        placeholders.append(match.group(1))
        return f"\x00CODE{len(placeholders) - 1}\x00"
    out = _RE_CODE_INLINE.sub(_stash, text)

    # 2) Alles HTML-escapen
    out = html.escape(out, quote=False)

    # 3) Bilder vor Links (Bilder beginnen mit !)
    out = _RE_IMG.sub(
        lambda m: (
            f'<img alt="{html.escape(m.group(1))}" '
            f'src="{html.escape(m.group(2))}"'
            + (f' title="{html.escape(m.group(3))}"' if m.group(3) else "")
            + ' />'),
        out)
    out = _RE_LINK.sub(
        lambda m: (
            f'<a href="{html.escape(m.group(2))}">'
            f'{m.group(1)}</a>'),
        out)
    out = _RE_AUTOLINK.sub(
        lambda m: f'<a href="{html.escape(m.group(1))}">{m.group(1)}</a>',
        out)

    out = _RE_BOLD_ITALIC.sub(r"<strong><em>\1</em></strong>", out)
    out = _RE_BOLD.sub(r"<strong>\1</strong>", out)
    out = _RE_ITALIC.sub(r"<em>\1</em>", out)

    # 4) Code-Placeholders zurueck
    def _unstash(match: re.Match) -> str:
        idx = int(match.group(1))
        return f"<code>{html.escape(placeholders[idx])}</code>"
    out = re.sub(r"\x00CODE(\d+)\x00", _unstash, out)
    return out


# ---------------------------------------------------------------------------
# Block-Parser
# ---------------------------------------------------------------------------
_RE_FENCE = re.compile(r"^```(\S*)\s*$")
_RE_HR    = re.compile(r"^[ \t]*(?:-{3,}|\*{3,}|_{3,})[ \t]*$")
_RE_H     = re.compile(r"^(#{1,6})\s+(.*?)\s*#*\s*$")
_RE_BQ    = re.compile(r"^>\s?(.*)$")
_RE_UL    = re.compile(r"^([ \t]*)[\-\*\+]\s+(.*)$")
_RE_OL    = re.compile(r"^([ \t]*)(\d+)\.\s+(.*)$")
_RE_TABLE_ROW = re.compile(r"^\s*\|.*\|\s*$")
_RE_TABLE_SEP = re.compile(r"^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)+\|?\s*$")


def _slugify(text: str) -> str:
    s = re.sub(r"[^\w\s\-]", "", text, flags=re.UNICODE).strip().lower()
    return re.sub(r"[\s]+", "-", s)[:80]


def _render_table(rows: list[str]) -> str:
    """rows: [header, separator, body...] - alle bereits getrimmt."""
    def split_cells(row: str) -> list[str]:
        row = row.strip()
        if row.startswith("|"):
            row = row[1:]
        if row.endswith("|"):
            row = row[:-1]
        return [c.strip() for c in row.split("|")]

    header = split_cells(rows[0])
    body = [split_cells(r) for r in rows[2:]]
    th = "".join(f"<th>{_inline(c)}</th>" for c in header)
    trs = []
    for row in body:
        # gleiche Spalten­zahl absichern
        cells = row + [""] * max(0, len(header) - len(row))
        tds = "".join(f"<td>{_inline(c)}</td>" for c in cells[:len(header)])
        trs.append(f"<tr>{tds}</tr>")
    return (f"<table><thead><tr>{th}</tr></thead>"
            f"<tbody>{''.join(trs)}</tbody></table>")


def markdown_to_html(text: str) -> str:
    """Konvertiert Markdown nach HTML (innerhalb von <div class='doc'>...)."""
    lines = text.replace("\r\n", "\n").replace("\r", "\n").split("\n")
    out: list[str] = []
    i = 0
    n = len(lines)

    def close_paragraph(buf: list[str]) -> None:
        if buf:
            joined = " ".join(s.rstrip() for s in buf).strip()
            if joined:
                out.append(f"<p>{_inline(joined)}</p>")
            buf.clear()

    paragraph: list[str] = []

    while i < n:
        line = lines[i]

        # Code-Fence
        m = _RE_FENCE.match(line)
        if m:
            close_paragraph(paragraph)
            lang = m.group(1)
            i += 1
            code_lines: list[str] = []
            while i < n and not _RE_FENCE.match(lines[i]):
                code_lines.append(lines[i])
                i += 1
            i += 1  # closing fence (auch wenn fehlend)
            code_html = html.escape("\n".join(code_lines))
            cls = f' class="lang-{html.escape(lang)}"' if lang else ""
            out.append(f"<pre><code{cls}>{code_html}</code></pre>")
            continue

        # Leerzeile -> Paragraph schliessen
        if not line.strip():
            close_paragraph(paragraph)
            i += 1
            continue

        # Horizontal-Rule
        if _RE_HR.match(line):
            close_paragraph(paragraph)
            out.append("<hr />")
            i += 1
            continue

        # Heading
        m = _RE_H.match(line)
        if m:
            close_paragraph(paragraph)
            level = len(m.group(1))
            text_h = m.group(2)
            slug = _slugify(text_h)
            out.append(
                f'<h{level} id="{slug}">'
                f'<a href="#{slug}" '
                f'style="color:inherit;text-decoration:none">'
                f'{_inline(text_h)}</a>'
                f'</h{level}>')
            i += 1
            continue

        # Tabelle: Zeile + Trennerzeile?
        if _RE_TABLE_ROW.match(line) and i + 1 < n \
                and _RE_TABLE_SEP.match(lines[i + 1]):
            close_paragraph(paragraph)
            rows = [line, lines[i + 1]]
            j = i + 2
            while j < n and _RE_TABLE_ROW.match(lines[j]):
                rows.append(lines[j])
                j += 1
            out.append(_render_table(rows))
            i = j
            continue

        # Blockquote
        if _RE_BQ.match(line):
            close_paragraph(paragraph)
            block: list[str] = []
            while i < n and _RE_BQ.match(lines[i]):
                block.append(_RE_BQ.match(lines[i]).group(1))
                i += 1
            inner = markdown_to_html("\n".join(block))
            out.append(f"<blockquote>{inner}</blockquote>")
            continue

        # Unordered List
        if _RE_UL.match(line):
            close_paragraph(paragraph)
            items: list[str] = []
            while i < n:
                m = _RE_UL.match(lines[i])
                if not m:
                    break
                items.append(_inline(m.group(2)))
                i += 1
            li = "".join(f"<li>{x}</li>" for x in items)
            out.append(f"<ul>{li}</ul>")
            continue

        # Ordered List
        if _RE_OL.match(line):
            close_paragraph(paragraph)
            items = []
            while i < n:
                m = _RE_OL.match(lines[i])
                if not m:
                    break
                items.append(_inline(m.group(3)))
                i += 1
            li = "".join(f"<li>{x}</li>" for x in items)
            out.append(f"<ol>{li}</ol>")
            continue

        # sonst: zur aktuellen Paragraph-Sammlung hinzufuegen
        paragraph.append(line)
        i += 1

    close_paragraph(paragraph)
    return "\n".join(out)


# ---------------------------------------------------------------------------
# Wrapper: vollstaendige HTML-Datei
# ---------------------------------------------------------------------------
def render_doc(title: str, markdown_text: str,
               back_link: Optional[str] = None,
               back_label: str = "← zurueck zur Uebersicht",
               extra_css: str = "") -> str:
    """Erzeugt eine self-contained HTML-Doku-Seite."""
    _BASE_CSS = """
:root{
  --surface:#ffffff; --surface-muted:#f5f6f8; --text:#1a1d21;
  --text-muted:#5b636c; --border:#e2e5e9; --primary:#2563eb;
  --shadow:0 1px 3px rgba(0,0,0,.08);
  --mono:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
}
body{margin:0;background:#eef0f3;
  font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;}
"""
    body = markdown_to_html(markdown_text)
    nav = ""
    if back_link:
        nav = (f'<div style="max-width:880px;margin:16px auto 0;'
                f'padding:0 24px;">'
                f'<a href="{html.escape(back_link)}" '
                f'style="color:var(--primary);text-decoration:none;">'
                f'{html.escape(back_label)}</a></div>')
    return f"""<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{html.escape(title)}</title>
  <style>{_BASE_CSS}{DOC_CSS}{extra_css}</style>
</head>
<body>
  {nav}
  <main style="padding:24px;">
    <article class="doc">
      {body}
    </article>
  </main>
</body>
</html>"""


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Minimalen Markdown-Renderer ausfuehren.")
    parser.add_argument("md_file", help="Pfad zur Markdown-Quelle")
    parser.add_argument("--out", default=None,
                        help="Ziel-HTML (Default: gleiche Datei mit .html)")
    parser.add_argument("--title", default=None)
    parser.add_argument("--back-link", default=None,
                        help="optional: Link zur Uebersicht")
    args = parser.parse_args(argv)
    src = Path(args.md_file)
    text = src.read_text(encoding="utf-8")
    out = Path(args.out) if args.out else src.with_suffix(".html")
    title = args.title or src.stem
    out.write_text(
        render_doc(title=title, markdown_text=text,
                    back_link=args.back_link),
        encoding="utf-8")
    print(f"Gerendert: {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
