#!/usr/bin/env python3
"""
Converte data/acupoints.csv do KM-Agent em dois artefatos revisaveis:

1. acupoints.raw.json  - todas as colunas originais do CSV.
2. acupoints.docs.json - documentos normalizados para busca/RAG.

Este script nao aprova conhecimento clinico. Todo item importado sai como
"draft" para revisao profissional antes de alimentar protocolo, relatorio ou IA.
"""

from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path


ALIASES = {
    "ST36": "E36",
    "SP6": "BP6",
    "SP9": "BP9",
    "SP3": "BP3",
    "CV12": "VC12",
    "CV6": "VC6",
    "GV20": "VG20",
    "HT7": "C7",
    "PC6": "PC6",
    "LR3": "F3",
    "GB20": "VB20",
    "GB34": "VB34",
    "KI3": "R3",
    "LI4": "IG4",
    "LI11": "IG11",
    "TE5": "TA5",
}


def clean(value: object) -> str:
    return str(value or "").strip()


def display_code(code: str) -> str:
    return ALIASES.get(code, code)


def build_doc(row: dict[str, str]) -> dict[str, object]:
    code = clean(row.get("entity_id") or row.get("code") or row.get("who_code"))
    label = display_code(code)

    names = [
        code,
        label,
        clean(row.get("name_ko")),
        clean(row.get("name_zh")),
        clean(row.get("name_en")),
        clean(row.get("pinyin")),
    ]

    parts = [
        *[name for name in names if name],
        f"meridian: {clean(row.get('meridian_code') or row.get('meridian'))}" if clean(row.get("meridian_code") or row.get("meridian")) else "",
        f"location: {clean(row.get('location_en') or row.get('location'))}" if clean(row.get("location_en") or row.get("location")) else "",
        f"method: {clean(row.get('method'))}" if clean(row.get("method")) else "",
        f"needling: {clean(row.get('needling'))}" if clean(row.get("needling")) else "",
    ]

    return {
        "id": f"acupoint:{code}",
        "type": "acupoint",
        "code": code,
        "displayCode": label,
        "names": [name for name in names if name],
        "approvalStatus": "draft",
        "source": "km-agent/data/acupoints.csv",
        "metadata": {
            "category": clean(row.get("category") or "acupoint"),
            "meridianCode": clean(row.get("meridian_code")),
        },
        "document": " | ".join(part for part in parts if part),
        "raw": row,
    }


def build_index_item(row: dict[str, str]) -> dict[str, object]:
    code = clean(row.get("entity_id") or row.get("code") or row.get("who_code"))
    label = display_code(code)
    location = clean(row.get("location_en") or row.get("location"))
    needling = clean(row.get("needling"))

    return {
        "id": f"acupoint:{code}",
        "type": "acupoint",
        "code": code,
        "displayCode": label,
        "approvalStatus": "draft",
        "source": "km-agent/data/acupoints.csv",
        "metadata": {
            "category": clean(row.get("category") or "acupoint"),
            "meridianCode": clean(row.get("meridian_code")),
            "meridian": clean(row.get("meridian")),
        },
        "names": {
            "ko": clean(row.get("name_ko")),
            "zh": clean(row.get("name_zh")),
            "en": clean(row.get("name_en")),
            "pinyin": clean(row.get("pinyin")),
        },
        "locationPreview": location[:260],
        "needlingPreview": needling[:180],
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--csv", required=True, help="Caminho para km-agent/data/acupoints.csv")
    parser.add_argument(
        "--out-dir",
        default="frontend/src/knowledge/generated/km-agent",
        help="Diretorio de saida dos JSONs",
    )
    args = parser.parse_args()

    csv_path = Path(args.csv)
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    with csv_path.open("r", encoding="utf-8-sig", newline="") as handle:
        rows = list(csv.DictReader(handle))

    docs = [build_doc(row) for row in rows]
    index = [build_index_item(row) for row in rows]

    (out_dir / "acupoints.raw.json").write_text(
        json.dumps(rows, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    (out_dir / "acupoints.docs.json").write_text(
        json.dumps(docs, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    (out_dir / "acupoints.index.json").write_text(
        json.dumps(index, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    print(f"ok: {len(rows)} acupoints convertidos em {out_dir}")


if __name__ == "__main__":
    main()
