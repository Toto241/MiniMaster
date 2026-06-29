# Lint-Schuld im Produktionscode (`src/` + Root, ohne Tests)

> Auto-generiert aus `eslint . --ext .js,.ts`. Stand: nach Eingriff A (Test-Override) + B (safe autofixes).
> Testdateien sind bewusst ausgenommen (dort sind die `no-unsafe-*`/`object-injection`-Regeln abgeschaltet — siehe `.eslintrc.js`).
> **0 Errors** — alles hier sind `warn`-Level-Hinweise, kein CI-Blocker. Liste dient gezieltem Schuldenabbau.

## Gesamt: 376 Warnungen in 31 Dateien

### Nach Regel

| Anzahl | Regel |
|---:|---|
| 258 | `@typescript-eslint/prefer-nullish-coalescing` |
| 64 | `security/detect-object-injection` |
| 30 | `@typescript-eslint/no-non-null-assertion` |
| 9 | `@typescript-eslint/no-base-to-string` |
| 6 | `max-len` |
| 3 | `security/detect-unsafe-regex` |
| 2 | `security/detect-non-literal-regexp` |
| 2 | `security/detect-non-literal-fs-filename` |
| 1 | `@typescript-eslint/no-unnecessary-type-assertion` |
| 1 | `@typescript-eslint/require-await` |

### Nach Datei (absteigend)

| Warnungen | Datei |
|---:|---|
| 56 | `src/admin.ts` |
| 50 | `src/support.ts` |
| 36 | `src/auth.ts` |
| 31 | `src/external-integrations.ts` |
| 24 | `src/subscription.ts` |
| 19 | `src/b2b-licensing.ts` |
| 17 | `src/pricing-config.ts` |
| 15 | `src/rate-limiter.ts` |
| 14 | `src/operator-setup.ts` |
| 13 | `src/ai-config-assistant.ts` |
| 12 | `src/affiliate.ts` |
| 12 | `src/pairing.ts` |
| 12 | `src/triggers.ts` |
| 11 | `src/secret-onboarding.ts` |
| 9 | `src/legal.ts` |
| 6 | `src/tasks.ts` |
| 5 | `src/shared.ts` |
| 4 | `src/error-handler.ts` |
| 4 | `start.js` |
| 3 | `firebase.ts` |
| 3 | `src/acceptance.ts` |
| 3 | `src/admin-pin.ts` |
| 3 | `src/device.ts` |
| 3 | `src/services/decisioning-service.ts` |
| 3 | `src/wizard-progress.ts` |
| 2 | `src/resilience.ts` |
| 2 | `src/validation.ts` |
| 1 | `src/cutover-monitor.ts` |
| 1 | `src/repositories/decisioning-repository.ts` |
| 1 | `src/tracing.ts` |
| 1 | `src/validators/decisioning.ts` |

## Detail je Datei

### `src/admin.ts` (56)

- `src/admin.ts:150:9` — **security/detect-object-injection** — Generic Object Injection Sink
- `src/admin.ts:152:9` — **security/detect-object-injection** — Generic Object Injection Sink
- `src/admin.ts:174:49` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/admin.ts:177:49` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/admin.ts:177:80` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/admin.ts:221:48` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/admin.ts:222:43` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/admin.ts:223:9` — **security/detect-object-injection** — Generic Object Injection Sink
- `src/admin.ts:223:43` — **security/detect-object-injection** — Generic Object Injection Sink
- `src/admin.ts:223:74` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/admin.ts:224:9` — **security/detect-object-injection** — Generic Object Injection Sink
- `src/admin.ts:224:39` — **security/detect-object-injection** — Generic Object Injection Sink
- `src/admin.ts:224:66` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/admin.ts:349:47` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/admin.ts:363:37` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/admin.ts:387:78` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/admin.ts:387:94` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/admin.ts:597:49` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/admin.ts:628:37` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/admin.ts:628:65` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/admin.ts:629:7` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??=`) instead of an assignment expression, as it is simpler to read.
- `src/admin.ts:629:12` — **security/detect-object-injection** — Generic Object Injection Sink
- `src/admin.ts:630:9` — **security/detect-object-injection** — Generic Object Injection Sink
- `src/admin.ts:630:87` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/admin.ts:630:120` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/admin.ts:630:142` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/admin.ts:632:7` — **security/detect-object-injection** — Generic Object Injection Sink
- `src/admin.ts:667:42` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/admin.ts:678:58` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/admin.ts:678:88` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/admin.ts:678:120` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/admin.ts:678:165` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/admin.ts:681:1` — **max-len** — This line has a length of 126. Maximum allowed is 120.
- `src/admin.ts:697:1` — **max-len** — This line has a length of 135. Maximum allowed is 120.
- `src/admin.ts:735:79` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/admin.ts:735:95` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/admin.ts:753:16` — **security/detect-object-injection** — Generic Object Injection Sink
- `src/admin.ts:753:32` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/admin.ts:753:49` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/admin.ts:754:21` — **security/detect-object-injection** — Generic Object Injection Sink
- `src/admin.ts:754:47` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/admin.ts:754:74` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/admin.ts:755:21` — **security/detect-object-injection** — Generic Object Injection Sink
- `src/admin.ts:755:42` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/admin.ts:755:64` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/admin.ts:756:20` — **security/detect-object-injection** — Generic Object Injection Sink
- `src/admin.ts:756:39` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/admin.ts:855:63` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/admin.ts:856:11` — **security/detect-object-injection** — Generic Object Injection Sink
- `src/admin.ts:856:35` — **security/detect-object-injection** — Generic Object Injection Sink
- `src/admin.ts:856:56` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/admin.ts:882:10` — **security/detect-object-injection** — Generic Object Injection Sink
- `src/admin.ts:888:31` — **security/detect-object-injection** — Function Call Object Injection Sink
- `src/admin.ts:893:11` — **security/detect-object-injection** — Generic Object Injection Sink
- `src/admin.ts:894:9` — **security/detect-object-injection** — Generic Object Injection Sink
- `src/admin.ts:895:14` — **security/detect-object-injection** — Generic Object Injection Sink

### `src/support.ts` (50)

- `src/support.ts:154:47` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/support.ts:209:31` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/support.ts:210:15` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/support.ts:225:29` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/support.ts:226:35` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/support.ts:227:33` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/support.ts:266:33` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/support.ts:282:15` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/support.ts:286:42` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/support.ts:321:32` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/support.ts:371:1` — **max-len** — This line has a length of 130. Maximum allowed is 120.
- `src/support.ts:411:10` — **security/detect-non-literal-fs-filename** — Found existsSync from package "fs" with non literal argument at index 0
- `src/support.ts:414:21` — **security/detect-non-literal-fs-filename** — Found readFileSync from package "fs" with non literal argument at index 0
- `src/support.ts:462:51` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/support.ts:655:39` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/support.ts:706:37` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/support.ts:707:43` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/support.ts:708:55` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/support.ts:709:49` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/support.ts:766:51` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/support.ts:767:60` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/support.ts:768:63` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/support.ts:784:40` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/support.ts:787:22` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/support.ts:833:1` — **max-len** — This line has a length of 146. Maximum allowed is 120.
- `src/support.ts:887:71` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/support.ts:986:36` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/support.ts:1007:48` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/support.ts:1038:41` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/support.ts:1040:49` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/support.ts:1053:80` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/support.ts:1094:41` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/support.ts:1098:46` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/support.ts:1136:39` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/support.ts:1141:90` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/support.ts:1180:41` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/support.ts:1185:46` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/support.ts:1210:80` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/support.ts:1246:41` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/support.ts:1258:62` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/support.ts:1276:43` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/support.ts:1284:79` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/support.ts:1322:42` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/support.ts:1324:49` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/support.ts:1339:36` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/support.ts:1340:31` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/support.ts:1340:78` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/support.ts:1340:118` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/support.ts:1357:78` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/support.ts:1489:66` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.

### `src/auth.ts` (36)

- `src/auth.ts:76:50` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/auth.ts:76:97` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/auth.ts:101:49` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/auth.ts:102:60` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/auth.ts:124:61` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/auth.ts:129:61` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/auth.ts:146:51` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/auth.ts:146:89` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/auth.ts:333:31` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/auth.ts:439:24` — **@typescript-eslint/no-non-null-assertion** — Forbidden non-null assertion.
- `src/auth.ts:447:42` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/auth.ts:450:39` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/auth.ts:465:44` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/auth.ts:608:20` — **@typescript-eslint/no-non-null-assertion** — Forbidden non-null assertion.
- `src/auth.ts:616:38` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/auth.ts:618:37` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/auth.ts:844:36` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/auth.ts:904:30` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/auth.ts:923:41` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/auth.ts:1065:90` — **@typescript-eslint/require-await** — Async arrow function has no 'await' expression.
- `src/auth.ts:1239:43` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/auth.ts:1552:81` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/auth.ts:1564:54` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/auth.ts:1597:40` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/auth.ts:1633:37` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/auth.ts:1638:37` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/auth.ts:1664:35` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/auth.ts:1709:36` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/auth.ts:1710:40` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/auth.ts:1720:78` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/auth.ts:1837:33` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/auth.ts:1991:45` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/auth.ts:1992:49` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/auth.ts:1993:47` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/auth.ts:1995:53` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/auth.ts:2060:43` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.

### `src/external-integrations.ts` (31)

- `src/external-integrations.ts:165:21` — **security/detect-unsafe-regex** — Unsafe Regular Expression
- `src/external-integrations.ts:247:29` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/external-integrations.ts:250:45` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/external-integrations.ts:251:42` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/external-integrations.ts:252:51` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/external-integrations.ts:254:51` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/external-integrations.ts:255:42` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/external-integrations.ts:304:5` — **security/detect-object-injection** — Generic Object Injection Sink
- `src/external-integrations.ts:306:7` — **security/detect-object-injection** — Generic Object Injection Sink
- `src/external-integrations.ts:308:7` — **security/detect-object-injection** — Generic Object Injection Sink
- `src/external-integrations.ts:384:41` — **@typescript-eslint/no-base-to-string** — 'value || ""' will use Object's default stringification format ('[object Object]') when stringified.
- `src/external-integrations.ts:384:47` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/external-integrations.ts:387:38` — **@typescript-eslint/no-base-to-string** — 'value || ""' will use Object's default stringification format ('[object Object]') when stringified.
- `src/external-integrations.ts:387:44` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/external-integrations.ts:393:47` — **@typescript-eslint/no-base-to-string** — 'value || ""' will use Object's default stringification format ('[object Object]') when stringified.
- `src/external-integrations.ts:393:53` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/external-integrations.ts:402:38` — **@typescript-eslint/no-base-to-string** — 'value || ""' will use Object's default stringification format ('[object Object]') when stringified.
- `src/external-integrations.ts:402:44` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/external-integrations.ts:405:39` — **@typescript-eslint/no-base-to-string** — 'value || ""' will use Object's default stringification format ('[object Object]') when stringified.
- `src/external-integrations.ts:405:45` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/external-integrations.ts:411:47` — **@typescript-eslint/no-base-to-string** — 'value || ""' will use Object's default stringification format ('[object Object]') when stringified.
- `src/external-integrations.ts:411:53` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/external-integrations.ts:427:47` — **@typescript-eslint/no-base-to-string** — 'value || ""' will use Object's default stringification format ('[object Object]') when stringified.
- `src/external-integrations.ts:427:53` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/external-integrations.ts:430:24` — **@typescript-eslint/no-base-to-string** — 'value || ""' will use Object's default stringification format ('[object Object]') when stringified.
- `src/external-integrations.ts:430:30` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/external-integrations.ts:456:77` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/external-integrations.ts:459:40` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/external-integrations.ts:505:75` — **@typescript-eslint/no-non-null-assertion** — Forbidden non-null assertion.
- `src/external-integrations.ts:506:22` — **@typescript-eslint/no-non-null-assertion** — Forbidden non-null assertion.
- `src/external-integrations.ts:509:40` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.

### `src/subscription.ts` (24)

- `src/subscription.ts:135:22` — **security/detect-object-injection** — Generic Object Injection Sink
- `src/subscription.ts:135:37` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/subscription.ts:135:40` — **security/detect-object-injection** — Generic Object Injection Sink
- `src/subscription.ts:141:34` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/subscription.ts:142:81` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/subscription.ts:162:44` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/subscription.ts:163:61` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/subscription.ts:225:68` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/subscription.ts:238:57` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/subscription.ts:239:49` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/subscription.ts:240:45` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/subscription.ts:241:71` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/subscription.ts:242:55` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/subscription.ts:287:29` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/subscription.ts:317:84` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/subscription.ts:414:53` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/subscription.ts:415:53` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/subscription.ts:416:47` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/subscription.ts:417:57` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/subscription.ts:418:57` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/subscription.ts:705:48` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/subscription.ts:832:57` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/subscription.ts:878:55` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/subscription.ts:879:57` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.

### `src/b2b-licensing.ts` (19)

- `src/b2b-licensing.ts:96:18` — **security/detect-non-literal-regexp** — Found non-literal argument to RegExp Constructor
- `src/b2b-licensing.ts:108:20` — **security/detect-object-injection** — Variable Assigned to Object Injection Sink
- `src/b2b-licensing.ts:127:21` — **@typescript-eslint/no-non-null-assertion** — Forbidden non-null assertion.
- `src/b2b-licensing.ts:129:20` — **@typescript-eslint/no-non-null-assertion** — Forbidden non-null assertion.
- `src/b2b-licensing.ts:131:45` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/b2b-licensing.ts:132:27` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/b2b-licensing.ts:135:55` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/b2b-licensing.ts:140:27` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/b2b-licensing.ts:149:34` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/b2b-licensing.ts:203:26` — **@typescript-eslint/no-non-null-assertion** — Forbidden non-null assertion.
- `src/b2b-licensing.ts:211:57` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/b2b-licensing.ts:211:89` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/b2b-licensing.ts:245:25` — **@typescript-eslint/no-non-null-assertion** — Forbidden non-null assertion.
- `src/b2b-licensing.ts:269:34` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/b2b-licensing.ts:337:29` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/b2b-licensing.ts:355:63` — **@typescript-eslint/no-non-null-assertion** — Forbidden non-null assertion.
- `src/b2b-licensing.ts:504:34` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/b2b-licensing.ts:525:34` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/b2b-licensing.ts:550:41` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.

### `src/pricing-config.ts` (17)

- `src/pricing-config.ts:237:10` — **security/detect-object-injection** — Generic Object Injection Sink
- `src/pricing-config.ts:237:25` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/pricing-config.ts:237:28` — **security/detect-object-injection** — Generic Object Injection Sink
- `src/pricing-config.ts:347:29` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/pricing-config.ts:367:9` — **security/detect-object-injection** — Generic Object Injection Sink
- `src/pricing-config.ts:367:34` — **security/detect-object-injection** — Generic Object Injection Sink
- `src/pricing-config.ts:367:47` — **security/detect-object-injection** — Generic Object Injection Sink
- `src/pricing-config.ts:377:5` — **security/detect-object-injection** — Generic Object Injection Sink
- `src/pricing-config.ts:377:26` — **@typescript-eslint/no-non-null-assertion** — Forbidden non-null assertion.
- `src/pricing-config.ts:377:26` — **security/detect-object-injection** — Generic Object Injection Sink
- `src/pricing-config.ts:377:43` — **security/detect-object-injection** — Generic Object Injection Sink
- `src/pricing-config.ts:381:5` — **security/detect-object-injection** — Generic Object Injection Sink
- `src/pricing-config.ts:381:26` — **@typescript-eslint/no-non-null-assertion** — Forbidden non-null assertion.
- `src/pricing-config.ts:381:26` — **security/detect-object-injection** — Generic Object Injection Sink
- `src/pricing-config.ts:381:43` — **security/detect-object-injection** — Generic Object Injection Sink
- `src/pricing-config.ts:501:77` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/pricing-config.ts:504:40` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.

### `src/rate-limiter.ts` (15)

- `src/rate-limiter.ts:107:59` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/rate-limiter.ts:107:104` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/rate-limiter.ts:108:40` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/rate-limiter.ts:109:61` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/rate-limiter.ts:109:107` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/rate-limiter.ts:133:58` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/rate-limiter.ts:184:54` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/rate-limiter.ts:226:25` — **security/detect-object-injection** — Generic Object Injection Sink
- `src/rate-limiter.ts:226:51` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/rate-limiter.ts:227:43` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/rate-limiter.ts:229:23` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/rate-limiter.ts:317:24` — **@typescript-eslint/no-non-null-assertion** — Forbidden non-null assertion.
- `src/rate-limiter.ts:318:9` — **security/detect-object-injection** — Generic Object Injection Sink
- `src/rate-limiter.ts:318:33` — **security/detect-object-injection** — Generic Object Injection Sink
- `src/rate-limiter.ts:318:54` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.

### `src/operator-setup.ts` (14)

- `src/operator-setup.ts:78:29` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/operator-setup.ts:79:71` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/operator-setup.ts:84:7` — **security/detect-object-injection** — Generic Object Injection Sink
- `src/operator-setup.ts:110:5` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/operator-setup.ts:111:5` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/operator-setup.ts:113:63` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/operator-setup.ts:114:33` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/operator-setup.ts:154:7` — **security/detect-object-injection** — Generic Object Injection Sink
- `src/operator-setup.ts:156:7` — **security/detect-object-injection** — Generic Object Injection Sink
- `src/operator-setup.ts:162:50` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/operator-setup.ts:171:42` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/operator-setup.ts:172:42` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/operator-setup.ts:173:38` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/operator-setup.ts:240:40` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.

### `src/ai-config-assistant.ts` (13)

- `src/ai-config-assistant.ts:25:47` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/ai-config-assistant.ts:55:17` — **security/detect-object-injection** — Variable Assigned to Object Injection Sink
- `src/ai-config-assistant.ts:56:59` — **security/detect-object-injection** — Generic Object Injection Sink
- `src/ai-config-assistant.ts:98:9` — **security/detect-object-injection** — Generic Object Injection Sink
- `src/ai-config-assistant.ts:99:16` — **security/detect-non-literal-regexp** — Found non-literal argument to RegExp Constructor
- `src/ai-config-assistant.ts:101:17` — **security/detect-object-injection** — Generic Object Injection Sink
- `src/ai-config-assistant.ts:176:76` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/ai-config-assistant.ts:176:92` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/ai-config-assistant.ts:209:54` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/ai-config-assistant.ts:213:14` — **security/detect-object-injection** — Generic Object Injection Sink
- `src/ai-config-assistant.ts:213:36` — **security/detect-object-injection** — Generic Object Injection Sink
- `src/ai-config-assistant.ts:213:51` — **security/detect-object-injection** — Generic Object Injection Sink
- `src/ai-config-assistant.ts:213:72` — **security/detect-object-injection** — Generic Object Injection Sink

### `src/affiliate.ts` (12)

- `src/affiliate.ts:112:30` — **@typescript-eslint/no-non-null-assertion** — Forbidden non-null assertion.
- `src/affiliate.ts:129:43` — **@typescript-eslint/no-non-null-assertion** — Forbidden non-null assertion.
- `src/affiliate.ts:129:43` — **security/detect-object-injection** — Generic Object Injection Sink
- `src/affiliate.ts:150:39` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/affiliate.ts:158:31` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/affiliate.ts:159:55` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/affiliate.ts:206:35` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/affiliate.ts:248:28` — **@typescript-eslint/no-non-null-assertion** — Forbidden non-null assertion.
- `src/affiliate.ts:263:43` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/affiliate.ts:321:28` — **@typescript-eslint/no-non-null-assertion** — Forbidden non-null assertion.
- `src/affiliate.ts:364:41` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/affiliate.ts:423:56` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.

### `src/pairing.ts` (12)

- `src/pairing.ts:21:65` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/pairing.ts:162:43` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/pairing.ts:194:76` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/pairing.ts:202:63` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/pairing.ts:261:66` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/pairing.ts:273:63` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/pairing.ts:274:71` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/pairing.ts:339:44` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/pairing.ts:369:63` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/pairing.ts:436:40` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/pairing.ts:454:41` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/pairing.ts:471:63` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.

### `src/triggers.ts` (12)

- `src/triggers.ts:41:9` — **security/detect-object-injection** — Generic Object Injection Sink
- `src/triggers.ts:41:21` — **security/detect-object-injection** — Generic Object Injection Sink
- `src/triggers.ts:126:89` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/triggers.ts:129:83` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/triggers.ts:186:93` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/triggers.ts:220:42` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/triggers.ts:241:65` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/triggers.ts:242:20` — **@typescript-eslint/no-non-null-assertion** — Forbidden non-null assertion.
- `src/triggers.ts:288:66` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/triggers.ts:333:76` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/triggers.ts:364:57` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/triggers.ts:365:46` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.

### `src/secret-onboarding.ts` (11)

- `src/secret-onboarding.ts:90:52` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/secret-onboarding.ts:93:61` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/secret-onboarding.ts:173:44` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/secret-onboarding.ts:174:24` — **security/detect-object-injection** — Variable Assigned to Object Injection Sink
- `src/secret-onboarding.ts:208:34` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/secret-onboarding.ts:221:27` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/secret-onboarding.ts:226:61` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/secret-onboarding.ts:256:28` — **@typescript-eslint/no-non-null-assertion** — Forbidden non-null assertion.
- `src/secret-onboarding.ts:256:28` — **security/detect-object-injection** — Generic Object Injection Sink
- `src/secret-onboarding.ts:277:42` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/secret-onboarding.ts:277:72` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.

### `src/legal.ts` (9)

- `src/legal.ts:40:67` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/legal.ts:99:93` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/legal.ts:110:15` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/legal.ts:129:8` — **security/detect-unsafe-regex** — Unsafe Regular Expression
- `src/legal.ts:186:20` — **@typescript-eslint/no-non-null-assertion** — Forbidden non-null assertion.
- `src/legal.ts:205:35` — **@typescript-eslint/no-non-null-assertion** — Forbidden non-null assertion.
- `src/legal.ts:219:33` — **@typescript-eslint/no-non-null-assertion** — Forbidden non-null assertion.
- `src/legal.ts:300:44` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/legal.ts:447:38` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.

### `src/tasks.ts` (6)

- `src/tasks.ts:144:23` — **@typescript-eslint/no-non-null-assertion** — Forbidden non-null assertion.
- `src/tasks.ts:144:51` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/tasks.ts:153:42` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/tasks.ts:347:42` — **@typescript-eslint/no-non-null-assertion** — Forbidden non-null assertion.
- `src/tasks.ts:504:43` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/tasks.ts:507:103` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.

### `src/shared.ts` (5)

- `src/shared.ts:86:22` — **security/detect-object-injection** — Variable Assigned to Object Injection Sink
- `src/shared.ts:196:32` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/shared.ts:201:30` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/shared.ts:210:30` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/shared.ts:351:34` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.

### `src/error-handler.ts` (4)

- `src/error-handler.ts:118:49` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/error-handler.ts:147:10` — **@typescript-eslint/no-non-null-assertion** — Forbidden non-null assertion.
- `src/error-handler.ts:168:48` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/error-handler.ts:169:91` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.

### `start.js` (4)

- `start.js:115:60` — **security/detect-object-injection** — Function Call Object Injection Sink
- `start.js:127:29` — **security/detect-object-injection** — Generic Object Injection Sink
- `start.js:127:43` — **security/detect-object-injection** — Generic Object Injection Sink
- `start.js:174:5` — **security/detect-object-injection** — Generic Object Injection Sink

### `firebase.ts` (3)

- `firebase.ts:17:61` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `firebase.ts:23:10` — **@typescript-eslint/no-non-null-assertion** — Forbidden non-null assertion.
- `firebase.ts:67:27` — **@typescript-eslint/no-unnecessary-type-assertion** — This assertion is unnecessary since it does not change the type of the expression.

### `src/acceptance.ts` (3)

- `src/acceptance.ts:56:15` — **@typescript-eslint/no-non-null-assertion** — Forbidden non-null assertion.
- `src/acceptance.ts:127:5` — **@typescript-eslint/no-non-null-assertion** — Forbidden non-null assertion.
- `src/acceptance.ts:165:15` — **@typescript-eslint/no-non-null-assertion** — Forbidden non-null assertion.

### `src/admin-pin.ts` (3)

- `src/admin-pin.ts:43:16` — **@typescript-eslint/no-non-null-assertion** — Forbidden non-null assertion.
- `src/admin-pin.ts:44:23` — **@typescript-eslint/no-non-null-assertion** — Forbidden non-null assertion.
- `src/admin-pin.ts:112:39` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.

### `src/device.ts` (3)

- `src/device.ts:224:39` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/device.ts:225:47` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/device.ts:226:43` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.

### `src/services/decisioning-service.ts` (3)

- `src/services/decisioning-service.ts:104:62` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/services/decisioning-service.ts:117:1` — **max-len** — This line has a length of 177. Maximum allowed is 120.
- `src/services/decisioning-service.ts:130:1` — **max-len** — This line has a length of 166. Maximum allowed is 120.

### `src/wizard-progress.ts` (3)

- `src/wizard-progress.ts:112:97` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/wizard-progress.ts:214:97` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/wizard-progress.ts:217:46` — **security/detect-object-injection** — Function Call Object Injection Sink

### `src/resilience.ts` (2)

- `src/resilience.ts:188:59` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.
- `src/resilience.ts:292:39` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.

### `src/validation.ts` (2)

- `src/validation.ts:48:16` — **security/detect-object-injection** — Variable Assigned to Object Injection Sink
- `src/validation.ts:311:14` — **security/detect-unsafe-regex** — Unsafe Regular Expression

### `src/cutover-monitor.ts` (1)

- `src/cutover-monitor.ts:87:33` — **security/detect-object-injection** — Generic Object Injection Sink

### `src/repositories/decisioning-repository.ts` (1)

- `src/repositories/decisioning-repository.ts:89:55` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.

### `src/tracing.ts` (1)

- `src/tracing.ts:50:39` — **@typescript-eslint/prefer-nullish-coalescing** — Prefer using nullish coalescing operator (`??`) instead of a logical or (`||`), as it is a safer operator.

### `src/validators/decisioning.ts` (1)

- `src/validators/decisioning.ts:39:100` — **@typescript-eslint/no-base-to-string** — 'value ?? ""' will use Object's default stringification format ('[object Object]') when stringified.
