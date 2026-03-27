"""Tests für debug_token.py — HMAC-SHA256 Token-Generator."""
from __future__ import annotations

import hashlib
import hmac
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from debug_token import (
    PACKAGES,
    SECRET_KEYS,
    SUFFIXES,
    compute_debug_token,
    generate_secret,
    generate_token,
    get_debug_secret,
    read_local_properties,
)


# ═══════════════════════════════════════════════════════════════════
#  read_local_properties
# ═══════════════════════════════════════════════════════════════════

class TestReadLocalProperties:
    def test_reads_key_value_pairs(self, tmp_path: Path):
        props = tmp_path / "local.properties"
        props.write_text("sdk.dir=C\\:\\\\Android\\\\sdk\nkey2=value2\n", encoding="utf-8")
        result = read_local_properties(tmp_path)
        assert result["sdk.dir"] == "C:\\Android\\sdk"
        assert result["key2"] == "value2"

    def test_skips_comments_and_blank_lines(self, tmp_path: Path):
        props = tmp_path / "local.properties"
        props.write_text("# comment\n\n  \nkey=val\n", encoding="utf-8")
        result = read_local_properties(tmp_path)
        assert len(result) == 1
        assert result["key"] == "val"

    def test_returns_empty_when_missing(self, tmp_path: Path):
        result = read_local_properties(tmp_path)
        assert result == {}

    def test_handles_equals_in_value(self, tmp_path: Path):
        props = tmp_path / "local.properties"
        props.write_text("key=val=ue=more\n", encoding="utf-8")
        result = read_local_properties(tmp_path)
        assert result["key"] == "val=ue=more"


# ═══════════════════════════════════════════════════════════════════
#  get_debug_secret
# ═══════════════════════════════════════════════════════════════════

class TestGetDebugSecret:
    def test_reads_master_secret(self, tmp_repo: Path):
        secret = get_debug_secret("master", tmp_repo)
        assert secret is not None
        assert len(secret) > 10

    def test_reads_child_secret(self, tmp_repo: Path):
        secret = get_debug_secret("child", tmp_repo)
        assert secret is not None
        assert len(secret) > 10

    def test_returns_none_for_placeholder(self, tmp_path: Path):
        props = tmp_path / "local.properties"
        props.write_text(
            "debug.session.secret.master=REPLACE_WITH_STRONG_RANDOM_SECRET\n",
            encoding="utf-8",
        )
        assert get_debug_secret("master", tmp_path) is None

    def test_returns_none_for_invalid_app_id(self, tmp_repo: Path):
        assert get_debug_secret("invalid", tmp_repo) is None

    def test_returns_none_when_no_file(self, tmp_path: Path):
        assert get_debug_secret("master", tmp_path) is None


# ═══════════════════════════════════════════════════════════════════
#  compute_debug_token
# ═══════════════════════════════════════════════════════════════════

class TestComputeDebugToken:
    def test_computes_correct_hmac_master(self):
        secret = "test_secret_12345"
        challenge = "challenge_abc"
        token = compute_debug_token(secret, challenge, "master")
        expected_data = f"{challenge}_ACTIVATE_MASTER"
        expected = hmac.new(
            secret.encode("utf-8"),
            expected_data.encode("utf-8"),
            hashlib.sha256,
        ).hexdigest()
        assert token == expected
        assert len(token) == 64

    def test_computes_correct_hmac_child(self):
        secret = "child_secret"
        challenge = "xyz789"
        token = compute_debug_token(secret, challenge, "child")
        expected_data = f"{challenge}_ACTIVATE_CHILD"
        expected = hmac.new(
            secret.encode("utf-8"),
            expected_data.encode("utf-8"),
            hashlib.sha256,
        ).hexdigest()
        assert token == expected

    def test_different_challenges_different_tokens(self):
        secret = "same_secret"
        t1 = compute_debug_token(secret, "challenge_A", "master")
        t2 = compute_debug_token(secret, "challenge_B", "master")
        assert t1 != t2

    def test_different_app_ids_different_tokens(self):
        secret = "same_secret"
        challenge = "same_challenge"
        t_master = compute_debug_token(secret, challenge, "master")
        t_child = compute_debug_token(secret, challenge, "child")
        assert t_master != t_child

    def test_invalid_app_id_raises(self):
        with pytest.raises(ValueError, match="Ungültige App-ID"):
            compute_debug_token("secret", "challenge", "unknown")

    def test_token_is_hex_string(self):
        token = compute_debug_token("secret", "challenge", "master")
        int(token, 16)  # should not raise


# ═══════════════════════════════════════════════════════════════════
#  generate_secret
# ═══════════════════════════════════════════════════════════════════

class TestGenerateSecret:
    def test_returns_64_hex_chars(self):
        secret = generate_secret()
        assert len(secret) == 64
        int(secret, 16)  # valid hex

    def test_unique_each_call(self):
        s1 = generate_secret()
        s2 = generate_secret()
        assert s1 != s2


# ═══════════════════════════════════════════════════════════════════
#  generate_token
# ═══════════════════════════════════════════════════════════════════

class TestGenerateToken:
    def test_full_flow(self, tmp_repo: Path):
        token = generate_token("master", "test_challenge", tmp_repo)
        assert len(token) == 64

    def test_raises_when_no_secret(self, tmp_path: Path):
        with pytest.raises(ValueError, match="nicht in local.properties"):
            generate_token("master", "challenge", tmp_path)

    def test_raises_for_invalid_app_id(self, tmp_repo: Path):
        with pytest.raises(ValueError):
            generate_token("invalid", "challenge", tmp_repo)


# ═══════════════════════════════════════════════════════════════════
#  Konstanten-Konsistenz
# ═══════════════════════════════════════════════════════════════════

class TestConstants:
    def test_suffixes_keys(self):
        assert set(SUFFIXES.keys()) == {"master", "child"}

    def test_packages_keys(self):
        assert set(PACKAGES.keys()) == {"master", "child"}
        assert PACKAGES["master"] == "com.minimaster.masterapp"
        assert PACKAGES["child"] == "com.google.pairing"

    def test_secret_keys_match_suffixes(self):
        assert set(SECRET_KEYS.keys()) == set(SUFFIXES.keys())
