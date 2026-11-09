#!/usr/bin/env python3
"""Read-only FTPS audit of approved Marine Aqua WordPress/PHP source files.

No FTP mutation commands; no wp-config.php, credentials, DB, or user uploads read.
Compares checked-out marineaqua-php/master to real bytes served by FTPS.
"""
from __future__ import annotations

import ftplib
import hashlib
import io
import os
from pathlib import Path
import posixpath
import ssl
import subprocess
import tempfile
from urllib.parse import urlsplit

SOURCE = Path("source-php")
EXPECTED_WP_HOST = "admin.marine-aqua.io.vn"
MAX_BYTES = 8 * 1024 * 1024
FILES = (
    "index.php",
    "wp-load.php",
    "wp-settings.php",
    "marineaqua-image-delta.php",
    "marineaqua-unzip.php",
    "marineaqua-unzip-v2.ready",
    "wp-content/mu-plugins/esc-github-trigger-config.php",
    "wp-content/mu-plugins/esc-seo-files.php",
    "wp-content/plugins/github-trigger/vcs-build-trigger.php",
    "wp-content/plugins/github-trigger/vcs-build-trigger.js",
)
DIRECTORIES = (
    "wp-content/mu-plugins",
    "wp-content/plugins/github-trigger",
)


def validated_target() -> tuple[str, str, int]:
    env = os.environ.get("ENV_FILE", "")
    vals: dict[str, str] = {}
    for line in env.splitlines():
        line = line.strip()
        if line.startswith("export "):
            line = line[7:].strip()
        for key in ("WC_URL", "WC_URL_CLIENT"):
            if line.startswith(key + "="):
                if key in vals:
                    raise RuntimeError("Duplicate origin in ENV_FILE: " + key)
                vals[key] = line.split("=", 1)[1].strip().strip("'\"")
    if set(vals) != {"WC_URL", "WC_URL_CLIENT"}:
        raise RuntimeError("Expected exactly WC_URL and WC_URL_CLIENT")
    hosts = {}
    for key, value in vals.items():
        parsed = urlsplit(value)
        if (parsed.scheme != "https" or not parsed.hostname
                or parsed.username or parsed.password
                or parsed.port not in (None, 443)
                or parsed.path not in ("", "/")
                or parsed.query or parsed.fragment):
            raise RuntimeError("Unsafe site origin: " + key)
        hosts[key] = parsed.hostname.lower()
    if hosts["WC_URL"] != EXPECTED_WP_HOST:
        raise RuntimeError("WordPress domain is not the approved Marine Aqua domain")
    if hosts["WC_URL"] == hosts["WC_URL_CLIENT"]:
        raise RuntimeError("WordPress/frontend domain collision")

    raw = os.environ.get("FTP_SERVER", "").strip()
    if "://" not in raw:
        raw = "ftp://" + raw
    server = urlsplit(raw)
    if (server.scheme not in ("ftp", "ftps") or not server.hostname
            or server.port not in (None, 21)
            or server.username or server.password or server.path not in ("", "/")
            or server.query or server.fragment):
        raise RuntimeError("Invalid configured FTPS host")
    if not os.environ.get("FTP_USERNAME") or not os.environ.get("FTP_PASSWORD"):
        raise RuntimeError("Missing FTPS credentials")
    return "/domains/" + hosts["WC_URL"] + "/public_html", server.hostname, server.port or 21


def cwd_checked(ftp: ftplib.FTP_TLS, path: str) -> None:
    ftp.cwd(path)
    if ftp.pwd().rstrip("/") != path.rstrip("/"):
        raise RuntimeError("Unexpected remote directory; refusing audit")


def remote_bytes(ftp: ftplib.FTP_TLS, root: str, relative: str) -> bytes | None:
    directory = posixpath.dirname(relative)
    target_dir = root if not directory else root + "/" + directory
    try:
        cwd_checked(ftp, target_dir)
    except ftplib.error_perm as exc:
        if str(exc).startswith("550"):
            return None
        raise
    name = posixpath.basename(relative)
    ftp.voidcmd("TYPE I")
    try:
        size = ftp.size(name)
    except ftplib.error_perm as exc:
        if str(exc).startswith("550"):
            return None
        raise
    if size is None or size > MAX_BYTES:
        raise RuntimeError("Missing file size or oversized file: " + relative)
    output = io.BytesIO()
    def append(chunk: bytes) -> None:
        if output.tell() + len(chunk) > MAX_BYTES:
            raise RuntimeError("FTPS file exceeds audit cap: " + relative)
        output.write(chunk)
    ftp.retrbinary("RETR " + name, append)
    content = output.getvalue()
    if len(content) != size:
        raise RuntimeError("FTPS read length mismatch: " + relative)
    return content


def php_syntax_ok(contents: bytes) -> bool:
    with tempfile.NamedTemporaryFile(suffix=".php", delete=True) as temporary:
        temporary.write(contents)
        temporary.flush()
        result = subprocess.run(
            ["php", "-l", temporary.name],
            capture_output=True, text=True, timeout=15, check=False,
        )
        return result.returncode == 0


def remote_only_php(ftp: ftplib.FTP_TLS, root: str, directory: str) -> int | None:
    try:
        cwd_checked(ftp, root + "/" + directory)
        names = ftp.nlst()
    except ftplib.error_perm as exc:
        if str(exc).startswith("550"):
            return None
        raise
    expected = {
        posixpath.basename(path)
        for path in FILES if posixpath.dirname(path) == directory
    }
    names = {posixpath.basename(name.rstrip("/")) for name in names}
    return len({name for name in names if name.endswith(".php") and name not in expected})


def main() -> int:
    root, host, port = validated_target()
    for relative in FILES:
        path = SOURCE / relative
        if not path.is_file() or path.stat().st_size == 0:
            raise RuntimeError("Missing checkout source: " + relative)
    ftp = ftplib.FTP_TLS(context=ssl.create_default_context(), timeout=25)
    counts = {"MATCH": 0, "DIFF": 0, "MISSING": 0, "INVALID_PHP": 0}
    errors = 0
    try:
        ftp.connect(host, port)
        ftp.auth()
        ftp.login(os.environ["FTP_USERNAME"], os.environ["FTP_PASSWORD"])
        ftp.prot_p()
        cwd_checked(ftp, root)
        cwd_checked(ftp, root + "/wp-content")
        cwd_checked(ftp, root)
        print("MARINEAQUA_FTPS_AUDIT tls=PASS wp_docroot=PASS mode=READ_ONLY")
        print("Scope: tracked PHP deployment files + WordPress bootstrap samples; excluding secrets/user uploads")
        for relative in FILES:
            content = remote_bytes(ftp, root, relative)
            if content is None:
                state = "MISSING"
            elif hashlib.sha256(content).digest() != hashlib.sha256((SOURCE / relative).read_bytes()).digest():
                state = "DIFF"
            else:
                state = "MATCH"
            counts[state] += 1
            print("MARINEAQUA_FTPS_AUDIT " + state + " " + relative)
            if content is not None and relative.endswith(".php"):
                if not php_syntax_ok(content):
                    counts["INVALID_PHP"] += 1
                    print("MARINEAQUA_FTPS_AUDIT INVALID_PHP " + relative)
        for directory in DIRECTORIES:
            extras = remote_only_php(ftp, root, directory)
            if extras is None:
                print("MARINEAQUA_FTPS_AUDIT DIR_MISSING " + directory)
                errors += 1
            else:
                print("MARINEAQUA_FTPS_AUDIT REMOTE_ONLY_PHP_COUNT " + directory + " " + str(extras))
        summary = " ".join(key.lower() + "=" + str(value) for key, value in counts.items())
        print("MARINEAQUA_FTPS_AUDIT SUMMARY " + summary)
        print("MARINEAQUA_FTPS_AUDIT scope=LIMITED_NOT_FULL_WP_SCAN")
        if os.environ.get("GITHUB_STEP_SUMMARY"):
            with open(os.environ["GITHUB_STEP_SUMMARY"], "a", encoding="utf-8") as out:
                out.write("### Marine Aqua PHP FTPS read-only audit\n\n")
                out.write("Compared \`marineaqua-php/master\` to configured WP FTPS document root.\n\n")
                out.write("Files: " + str(len(FILES)) + "; " + summary + ".\n\n")
                out.write("This is a focused audit, not a full WordPress filesystem or malware scan.\n")
        return 1 if errors or any(counts[key] for key in ("DIFF", "MISSING", "INVALID_PHP")) else 0
    finally:
        try:
            ftp.quit()
        except Exception:
            ftp.close()


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (ftplib.all_errors, RuntimeError, OSError, ValueError, subprocess.TimeoutExpired) as exc:
        # Do not print exception message: some FTP servers echo credential-bearing URLs.
        print("MARINEAQUA_FTPS_AUDIT FAILED error_class=" + type(exc).__name__)
        raise SystemExit(1)
