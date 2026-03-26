import re, sys

with open('coverage/lcov.info', encoding='utf-8') as f:
    content = f.read()

sections = content.split('SF:')
for s in sections:
    first_line = s.strip().split('\n')[0]
    if 'auth.ts' in first_line and 'src' in first_line:
        lines = s.strip().split('\n')
        print('File:', first_line)
        brdas = [l for l in lines if l.startswith('BRDA:')]
        total = len(brdas)
        uncov = [l for l in brdas if l.endswith(',0')]
        print(f'Total: {total}, Covered: {total-len(uncov)}, Uncovered: {len(uncov)}')
        print(f'Coverage: {(total-len(uncov))/total*100:.1f}%')
        print('\nUncovered branches:')
        for b in uncov:
            parts = b.replace('BRDA:', '').split(',')
            print(f'  Line {parts[0]}, block {parts[1]}, branch {parts[2]}')
        break
