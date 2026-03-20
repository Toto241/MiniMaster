import re
html = open('coverage/lcov-report/admin.ts.html', encoding='utf-8').read()
# Find branch markers
pattern = r'class="cstat-no"[^>]*title="([^"]*)"'
markers = re.findall(pattern, html)
for m in markers:
    print(m)
