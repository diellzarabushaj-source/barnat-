#!/usr/bin/env python3
"""Convert the public Excel registry into a compact browser data file."""

from __future__ import annotations

import base64
import gzip
import json
import math
import sys
from datetime import date, datetime
from pathlib import Path
from typing import Any

from openpyxl import load_workbook


REQUIRED_HEADERS = {
    "Nr rendor",
    "Emri tregtar",
    "Substanca aktive",
    "ATC Code",
    "Klasa / Çka është",
    "Përdorimi (fjalë kyçe)",
}


def normalize(value: Any) -> Any:
    if value is None:
        return ""
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, float) and math.isnan(value):
        return ""
    return value


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit("Usage: sync_sheet.py SOURCE.xlsx OUTPUT.js")

    source = Path(sys.argv[1])
    output = Path(sys.argv[2])

    workbook = load_workbook(source, read_only=True, data_only=True)
    sheet = workbook.active
    row_iter = sheet.iter_rows(values_only=True)

    try:
        first_row = next(row_iter)
    except StopIteration as exc:
        raise SystemExit("Spreadsheet is empty") from exc

    headers = [str(value).strip() if value is not None else "" for value in first_row]
    missing = REQUIRED_HEADERS.difference(headers)
    if missing:
        raise SystemExit(f"Missing required columns: {', '.join(sorted(missing))}")

    records: list[dict[str, Any]] = []
    for row in row_iter:
        if not any(value is not None and str(value).strip() for value in row):
            continue

        record = {
            header: normalize(value)
            for header, value in zip(headers, row)
            if header
        }
        records.append(record)

    raw_json = json.dumps(
        records,
        ensure_ascii=False,
        separators=(",", ":"),
    ).encode("utf-8")
    packed = base64.b64encode(gzip.compress(raw_json, compresslevel=9)).decode("ascii")

    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(
        "window.DRUG_DATA_PARTS = [\"" + packed + "\"];\n",
        encoding="utf-8",
    )

    print(f"Synced {len(records)} medicines from sheet '{sheet.title}'.")
    print(f"Generated {output} ({output.stat().st_size} bytes).")


if __name__ == "__main__":
    main()
