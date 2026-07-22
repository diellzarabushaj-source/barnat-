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
from typing import Any, Iterable

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


def clean_headers(row: Iterable[Any]) -> list[str]:
    return [str(value).strip() if value is not None else "" for value in row]


def find_header_row(sheet) -> tuple[list[str], int]:
    """Find the real header row within the first 15 rows.

    This keeps the sync working even if a title or blank line is added above the table.
    """
    for row_number, row in enumerate(
        sheet.iter_rows(min_row=1, max_row=15, values_only=True),
        start=1,
    ):
        headers = clean_headers(row)
        if REQUIRED_HEADERS.issubset(set(headers)):
            return headers, row_number

    raise SystemExit(
        "Could not find the registry header row. Required columns: "
        + ", ".join(sorted(REQUIRED_HEADERS))
    )


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit("Usage: sync_sheet.py SOURCE.xlsx OUTPUT.js")

    source = Path(sys.argv[1])
    output = Path(sys.argv[2])

    workbook = load_workbook(source, read_only=True, data_only=True)
    sheet = workbook.active
    headers, header_row_number = find_header_row(sheet)

    records: list[dict[str, Any]] = []
    for row in sheet.iter_rows(min_row=header_row_number + 1, values_only=True):
        if not any(value is not None and str(value).strip() for value in row):
            continue

        record = {
            header.strip(): normalize(value)
            for header, value in zip(headers, row)
            if header.strip()
        }
        records.append(record)

    if not records:
        raise SystemExit("No medicine rows were found below the header.")

    raw_json = json.dumps(
        records,
        ensure_ascii=False,
        separators=(",", ":"),
    ).encode("utf-8")
    packed = base64.b64encode(gzip.compress(raw_json, compresslevel=9)).decode("ascii")

    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(
        "window.DRUG_DATA_PARTS = [\"" + packed + "\"];\n"
        + "window.REGISTRY_STATIC_META = {count:"
        + str(len(records))
        + ",generatedAt:"
        + json.dumps(datetime.utcnow().isoformat(timespec="seconds") + "Z")
        + "};\n",
        encoding="utf-8",
    )

    print(f"Synced {len(records)} medicines from sheet '{sheet.title}'.")
    print(f"Header row: {header_row_number}.")
    print(f"Generated {output} ({output.stat().st_size} bytes).")


if __name__ == "__main__":
    main()
