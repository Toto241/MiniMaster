import re, glob

files = glob.glob('test/branch-coverage-*.test.ts') + [
    'test/index.test.ts',
    'test/reject-task-and-new-features.test.ts',
    'test/task-status-notifications.test.ts',
    'test/system/access-control.system.test.ts'
]

replacements = [
    # Pairing tokens to valid UUIDs
    ('pairingToken: "tok-uuid"', 'pairingToken: "33333333-3333-3333-3333-333333333333"'),
    ('pairingToken: "tok-lim"', 'pairingToken: "44444444-4444-4444-4444-444444444444"'),
    ('pairingToken: "tok-leg"', 'pairingToken: "55555555-5555-5555-5555-555555555555"'),
    ('pairingToken: "tok1"', 'pairingToken: "11111111-1111-1111-1111-111111111111"'),
    ('pairingToken: "tok_exp"', 'pairingToken: "66666666-6666-6666-6666-666666666666"'),
    ('pairingToken: "tok_empty"', 'pairingToken: "77777777-7777-7777-7777-777777777777"'),
    ('pairingToken: "tok_bad"', 'pairingToken: "88888888-8888-8888-8888-888888888888"'),
    ('pairingToken: "tok_noid"', 'pairingToken: "99999999-9999-9999-9999-999999999999"'),
    ('pairingToken: "tok_sub"', 'pairingToken: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"'),
    ('pairingToken: "tok-bad-1"', 'pairingToken: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"'),
    ('pairingToken: "tok-bad-2"', 'pairingToken: "cccccccc-cccc-cccc-cccc-cccccccccccc"'),
    ('pairingToken: "tok-null"', 'pairingToken: "dddddddd-dddd-dddd-dddd-dddddddddddd"'),
    ('pairingToken: "tok-limit"', 'pairingToken: "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee"'),
    ('pairingToken: "tok-valid"', 'pairingToken: "ffffffff-ffff-ffff-ffff-ffffffffffff"'),
    ('pairingToken: "token-1"', 'pairingToken: "11111111-1111-1111-1111-111111111111"'),
    ('pairingToken: "token-abc"', 'pairingToken: "22222222-2222-2222-2222-222222222222"'),
    ('pairingToken: "tok123"', 'pairingToken: "33333333-3333-3333-3333-333333333333"'),
    ('pairingToken: "tok-none"', 'pairingToken: "44444444-4444-4444-4444-444444444444"'),
    ('pairingToken: "good-uuid"', 'pairingToken: "55555555-5555-5555-5555-555555555555"'),
    # Also update state.pairingTokens keys
    ('state.pairingTokens["tok-uuid"]', 'state.pairingTokens["33333333-3333-3333-3333-333333333333"]'),
    ('state.pairingTokens["tok-lim"]', 'state.pairingTokens["44444444-4444-4444-4444-444444444444"]'),
    ('state.pairingTokens["tok-leg"]', 'state.pairingTokens["55555555-5555-5555-5555-555555555555"]'),
    ('state.pairingTokens["tok_exp"]', 'state.pairingTokens["66666666-6666-6666-6666-666666666666"]'),
    ('state.pairingTokens["tok_empty"]', 'state.pairingTokens["77777777-7777-7777-7777-777777777777"]'),
    ('state.pairingTokens["tok_bad"]', 'state.pairingTokens["88888888-8888-8888-8888-888888888888"]'),
    ('state.pairingTokens["tok_noid"]', 'state.pairingTokens["99999999-9999-9999-9999-999999999999"]'),
    ('state.pairingTokens["tok_sub"]', 'state.pairingTokens["aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"]'),
    ('state.pairingTokens["tok-null"]', 'state.pairingTokens["dddddddd-dddd-dddd-dddd-dddddddddddd"]'),
    ('state.pairingTokens["tok-limit"]', 'state.pairingTokens["eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee"]'),
    ('state.pairingTokens["tok-valid"]', 'state.pairingTokens["ffffffff-ffff-ffff-ffff-ffffffffffff"]'),
    ('state.pairingTokens["tok-none"]', 'state.pairingTokens["44444444-4444-4444-4444-444444444444"]'),
    ('state.pairingTokens["good-uuid"]', 'state.pairingTokens["55555555-5555-5555-5555-555555555555"]'),
    ('state.pairingTokens["tok1"]', 'state.pairingTokens["11111111-1111-1111-1111-111111111111"]'),
    ('state.pairingTokens["token-1"]', 'state.pairingTokens["11111111-1111-1111-1111-111111111111"]'),
    ('state.pairingTokens["token-abc"]', 'state.pairingTokens["22222222-2222-2222-2222-222222222222"]'),
    ('state.pairingTokens["tok123"]', 'state.pairingTokens["33333333-3333-3333-3333-333333333333"]'),
    # Purchase tokens
    ('purchaseToken: "tok"', 'purchaseToken: "purchase-tok"'),
    ('purchaseToken: "token"', 'purchaseToken: "purchase-token"'),
    # FCM tokens (need >= 10 chars)
    ('fcmToken: "tok"', 'fcmToken: "child-fcm-token"'),
    ('fcmToken: "tok1"', 'fcmToken: "child-fcm-tok1"'),
    ('fcmToken: "tok2"', 'fcmToken: "child-fcm-tok2"'),
    ('fcmToken: "tok3"', 'fcmToken: "child-fcm-tok3"'),
    ('fcmToken: "tok4"', 'fcmToken: "child-fcm-tok4"'),
    ('fcmToken: "tok456"', 'fcmToken: "master-fcm-tok456"'),
    # Register tokens
    ('token: "tok123"', 'token: "register-tok123"'),
    ('token: "bad-tok"', 'token: "bad-token-123"'),
    ('token: "bad-token"', 'token: "bad-token-123"'),
    # Regex fixes
    ('rejects.toThrow(/Unknown product/)', 'rejects.toThrow(/Invalid product ID/)'),
    ('rejects.toThrow(/Unknown product ID/)', 'rejects.toThrow(/Invalid product ID/)'),
]

for filepath in files:
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    original = content
    for old, new in replacements:
        content = content.replace(old, new)
    if content != original:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f'Updated {filepath}')
    else:
        print(f'No changes {filepath}')
