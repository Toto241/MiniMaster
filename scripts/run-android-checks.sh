#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -eq 0 ]; then
  echo "Usage: $0 <gradle-task> [<gradle-task> ...]" >&2
  exit 64
fi

find_java17_home() {
  if [ -n "${JAVA17_HOME:-}" ] && [ -x "${JAVA17_HOME}/bin/java" ]; then
    printf '%s\n' "$JAVA17_HOME"
    return 0
  fi

  if [ -n "${JAVA_HOME:-}" ] && [ -x "${JAVA_HOME}/bin/java" ]; then
    local version
    version="$(${JAVA_HOME}/bin/java -version 2>&1 | head -n 1 || true)"
    if [[ "$version" == *'17.'* || "$version" == *'version "17'* ]]; then
      printf '%s\n' "$JAVA_HOME"
      return 0
    fi
  fi

  local candidates=(
    "$HOME/.local/share/mise/installs/java/17.0.2"
    "$HOME/.sdkman/candidates/java/current"
    "/usr/lib/jvm/java-17-openjdk-amd64"
    "/usr/lib/jvm/temurin-17-jdk-amd64"
  )

  local candidate
  for candidate in "${candidates[@]}"; do
    if [ -x "$candidate/bin/java" ]; then
      local version
      version="$($candidate/bin/java -version 2>&1 | head -n 1 || true)"
      if [[ "$version" == *'17.'* || "$version" == *'version "17'* ]]; then
        printf '%s\n' "$candidate"
        return 0
      fi
    fi
  done

  return 1
}

JAVA17_HOME_RESOLVED="$(find_java17_home || true)"
if [ -z "$JAVA17_HOME_RESOLVED" ]; then
  echo "ERROR: Java 17 was not found. Set JAVA17_HOME or JAVA_HOME to a JDK 17 installation before running Android Gradle checks." >&2
  exit 1
fi

export JAVA_HOME="$JAVA17_HOME_RESOLVED"
export PATH="$JAVA_HOME/bin:$PATH"

requires_android_sdk=false
for arg in "$@"; do
  if [[ "$arg" != -* ]]; then
    requires_android_sdk=true
    break
  fi
done

if [ "$requires_android_sdk" = true ]; then
  sdk_home="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}"
  if [ -z "$sdk_home" ] && [ -f "local.properties" ]; then
    sdk_home="$(sed -n 's/^sdk\\.dir=//p' local.properties | head -n 1)"
  fi

  if [ -z "$sdk_home" ]; then
    echo "ERROR: Android SDK not found. Set ANDROID_HOME/ANDROID_SDK_ROOT or create local.properties with sdk.dir=<path> before running Android Gradle tasks." >&2
    exit 1
  fi
fi

echo "Using JAVA_HOME=$JAVA_HOME"
java -version

exec ./gradlew "$@"
