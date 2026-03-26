import sys

with open('coverage/lcov.info', 'r') as f:
    lines = f.readlines()

in_auth = False
brf = 0
brh = 0
uncovered = []

for line in lines:
    line = line.strip()
    if line.startswith('SF:') and 'src\\auth.ts' in line:
        in_auth = True
    elif line.startswith('SF:'):
        if in_auth:
            break
        in_auth = False
    elif line == 'end_of_record':
        if in_auth:
            break
    elif in_auth and line.startswith('BRDA:'):
        parts = line[5:].split(',')
        ln = parts[0]
        block = parts[1]
        branch = parts[2]
        taken = parts[3]
        brf += 1
        if taken != '0' and taken != '-':
            brh += 1
        else:
            uncovered.append((int(ln), block, branch))

if brf > 0:
    print(f'auth.ts: {brh}/{brf} branches = {brh*100/brf:.1f}%')
    print(f'Uncovered branches ({brf-brh}):')
    for ln, block, branch in sorted(uncovered):
        print(f'  line {ln} block {block} branch {branch}')
else:
    print('No branch data found for auth.ts')
