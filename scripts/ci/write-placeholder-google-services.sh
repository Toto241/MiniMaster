#!/usr/bin/env bash
# Schreibt CI-Platzhalter google-services.json fuer master- und childApp.
# Einzige Quelle der Wahrheit fuer alle Android-CI-Jobs (Unit + Instrumentation),
# damit Platzhalter-Configs nicht zwischen Jobs auseinanderdriften.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

write_config() {
  local target="$1" app_suffix="$2" package_name="$3"
  cat > "$target" <<EOF
{
  "project_info": {
    "project_number": "000000000000",
    "project_id": "placeholder-ci",
    "storage_bucket": "placeholder-ci.appspot.com"
  },
  "client": [
    {
      "client_info": {
        "mobilesdk_app_id": "1:000000000000:android:placeholder${app_suffix}",
        "android_client_info": { "package_name": "${package_name}" }
      },
      "oauth_client": [],
      "api_key": [ { "current_key": "placeholder" } ],
      "services": { "appinvite_service": { "other_platform_oauth_client": [] } }
    }
  ],
  "configuration_version": "1"
}
EOF
  echo "Wrote placeholder config: ${target}"
}

write_config "${repo_root}/masterApp/google-services.json" "master" "com.minimaster.masterapp"
write_config "${repo_root}/childApp/google-services.json" "child" "com.minimaster.childapp"
