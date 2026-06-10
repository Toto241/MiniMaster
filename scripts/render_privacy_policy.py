"""
Rendert docs/PRIVACY_POLICY_DE.md fuer GitHub Pages (site/privacy/index.html).

Aufruf:
    python scripts/render_privacy_policy.py --build
    python scripts/render_privacy_policy.py --check
    python scripts/render_privacy_policy.py --list-placeholders
"""
from __future__ import annotations

import argparse
import html
import re
import sys
from pathlib import Path

_SCRIPTS_DIR = Path(__file__).resolve().parent
if str(_SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS_DIR))
from md_to_html import DOC_CSS, markdown_to_html  # noqa: E402

REPO_ROOT = _SCRIPTS_DIR.parent
POLICY_MD = REPO_ROOT / "docs" / "PRIVACY_POLICY_DE.md"
DEFAULT_OUT = REPO_ROOT / "site" / "privacy" / "index.html"
DEFAULT_PUBLIC_URL = "https://toto241.github.io/MiniMaster/privacy/"

_PLACEHOLDER = re.compile(r"\[[A-ZÄÖÜ][A-ZÄÖÜ0-9 ._/-]*\](?!\()")

_MINIMAL_CSS = """
:root{
  --surface:#ffffff; --surface-muted:#f5f6f8; --text:#1a1d21;
  --text-muted:#5b636c; --border:#e2e5e9; --primary:#2563eb;
  --shadow:0 1px 3px rgba(0,0,0,.08);
  --mono:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
}
body{margin:0;background:#eef0f3;
  font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;}
main{padding:24px;}
"""


def find_placeholders(text: str) -> list[str]:
    return sorted({m.group(0) for m in _PLACEHOLDER.finditer(text)})


def build_html(md_text: str, title: str = "Datenschutzerklaerung — MiniMaster") -> str:
    body = markdown_to_html(md_text)
    return f"""<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="index,follow">
  <title>{html.escape(title)}</title>
  <style>{_MINIMAL_CSS}{DOC_CSS}</style>
</head>
<body>
  <main><article class="doc">
{body}
  </article></main>
</body>
</html>"""


def check(public_url: str = DEFAULT_PUBLIC_URL) -> list[tuple[str, str]]:
    issues: list[tuple[str, str]] = []
    if not POLICY_MD.is_file():
        issues.append(("error", "docs/PRIVACY_POLICY_DE.md fehlt."))
        return issues
    text = POLICY_MD.read_text(encoding="utf-8")
    ph = find_placeholders(text)
    if ph:
        issues.append(
            ("error", f"{len(ph)} Vorlagen-Platzhalter offen: {', '.join(ph)}"))
    if "juristische Prüfung" in text or "Technische Vorlage" in text:
        issues.append(
            ("warning",
             "Policy ist als technische Vorlage markiert — juristische Pruefung vor Store-Release."))
    if not public_url.startswith("https://"):
        issues.append(("error", "privacy URL muss mit https:// beginnen."))
    return issues


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Privacy-Policy fuer GitHub Pages.")
    parser.add_argument("--build", action="store_true")
    parser.add_argument("--out", default=str(DEFAULT_OUT))
    parser.add_argument("--check", action="store_true")
    parser.add_argument("--list-placeholders", action="store_true")
    parser.add_argument("--public-url", default=DEFAULT_PUBLIC_URL)
    args = parser.parse_args(argv)

    if not POLICY_MD.is_file():
        print("FEHLER: docs/PRIVACY_POLICY_DE.md fehlt.", file=sys.stderr)
        return 2
    md_text = POLICY_MD.read_text(encoding="utf-8")

    if args.list_placeholders:
        for p in find_placeholders(md_text):
            print(p)
        return 0

    if args.build:
        out = Path(args.out)
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(build_html(md_text), encoding="utf-8")
        print(f"Gerendert: {out}")
        ph = find_placeholders(md_text)
        if ph:
            print(f"Hinweis: {len(ph)} Platzhalter noch offen.")
        return 0

    if args.check:
        issues = check(args.public_url)
        errors = [i for i in issues if i[0] == "error"]
        for sev, msg in issues:
            stream = sys.stderr if sev == "error" else sys.stdout
            print(f"[{sev.upper()}] {msg}", file=stream)
        if not issues:
            print("OK: Privacy-Policy veroeffentlichungsreif.")
        return 1 if errors else 0

    parser.print_help()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
