"""Emit only an SQLSTATE and a validated COPY relation, never row/error text."""
import json
import re
import sys
from pathlib import Path


def diagnose(stage, log_file, sql_file):
    result = {"failedStage": stage if stage in {"managed_auth", "schema", "data", "history", "auth_triggers"} else "unknown",
              "sqlstate": "unavailable", "copyRelation": None}
    error_line = None
    try:
        with Path(log_file).open(encoding="utf-8", errors="replace") as stream:
            for line in stream:
                match = re.fullmatch(r"psql:[^\r\n]*:(\d+):\s*ERROR:\s*([A-Z0-9]{5})\s*", line)
                if match:
                    error_line, result["sqlstate"] = int(match[1]), match[2]
                    break
        if error_line is None or not sql_file:
            return result
        identifier = r'(?:[a-z_][a-z0-9_]*|"[a-z_][a-z0-9_]*")'
        header = re.compile(r"^COPY (" + identifier + r"\." + identifier + r") \([^\r\n]*\) FROM stdin;\s*$")
        in_copy = False
        relation = None
        with Path(sql_file).open(encoding="utf-8", errors="replace") as stream:
            for number, line in enumerate(stream, 1):
                # COPY payload may itself contain text resembling SQL. Only
                # recognize a header outside a COPY body, never inside a row.
                if not in_copy:
                    match = header.fullmatch(line)
                    relation = match[1].replace('"', '') if match else None
                    in_copy = bool(match)
                if number == error_line:
                    result["copyRelation"] = relation if in_copy else None
                    break
                if in_copy and line.rstrip("\r\n") == r"\.":
                    in_copy = False
                    relation = None
    except (OSError, ValueError):
        pass
    return result


if __name__ == "__main__":
    print(json.dumps(diagnose(*sys.argv[1:4]), separators=(",", ":")))
