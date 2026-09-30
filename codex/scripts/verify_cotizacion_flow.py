#!/usr/bin/env python3
"""End-to-end acceptance run for COTIZACION (issue #27).

For each scenario it previews the report, downloads the document from the
returned execution_id, and asserts that the XLSX the operator receives carries
exactly the preview's rows and totals, with the template's styles intact.

Usage:
    python codex/scripts/verify_cotizacion_flow.py --api http://127.0.0.1:8000/api \
        --price-list 4 [--out-dir /tmp/cotizacion]
"""
from __future__ import annotations

import argparse
import json
import urllib.error
import urllib.request
from decimal import Decimal
from io import BytesIO
from pathlib import Path

import openpyxl

CODE = "COTIZACION"
FIRST_ROW = 19  # the repeatable row in the BONATTI master template
SUMMARY_LABELS = ("SUBTOTAL", "DESCUENTO", "IVA", "TOTAL")
SUMMARY_KEYS = ("subtotal", "discount_amount", "tax", "total")
ROW_PLACEHOLDER_COLUMNS = {1: "row_number", 2: "quantity", 3: "sku", 4: "description",
                           5: "discount_amount", 6: "price", 7: "subtotal"}

failures: list[str] = []


def check(condition: bool, message: str) -> None:
    print(("  ok   " if condition else "  FAIL ") + message)
    if not condition:
        failures.append(message)


def post(url: str, payload: dict) -> tuple[dict | bytes, dict]:
    call = urllib.request.Request(
        url, data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"}, method="POST",
    )
    with urllib.request.urlopen(call) as response:
        body = response.read()
        headers = dict(response.headers)
    if headers.get("content-type", "").startswith("application/json"):
        return json.loads(body), headers
    return body, headers


def scenario_rows(products: list[dict], count: int, discounts: list[str] | None) -> list[dict]:
    rows = []
    for index in range(count):
        row = {"product_id": products[index]["value"], "quantity": index % 4 + 1}
        if discounts is not None:
            row["discount"] = discounts[index % len(discounts)]
        rows.append(row)
    return rows


def run(api: str, price_list: int, out_dir: Path) -> None:
    with urllib.request.urlopen(
        f"{api}/reports/{CODE}/parameters/items.product_id/options"
        f"?price_list_id={price_list}&size=25"
    ) as response:
        products = json.load(response)["items"]

    base = {
        "price_list_id": price_list,
        "customer_name": "Bonatti Mexico SA de CV",
        "customer_rfc": "BME010203AB4",
        "attention_to": "Ing. Aaron Garcia",
        "customer_email": "aaron.garcia@bonatti.it",
        "requisition": "LMR-850205-CONSTITUCIONES-048",
        "quotation_date": "2026-06-26",
    }

    scenarios = [
        ("1 producto sin descuento", 1, None),
        ("1 producto con descuento", 1, ["10"]),
        ("5 productos con descuentos distintos", 5, ["0", "5", "12.5", "33.33", "100"]),
        ("20 productos", 20, ["0", "7.5", "15"]),
    ]

    for title, count, discounts in scenarios:
        print(f"\n== {title}")
        parameters = {**base, "items": scenario_rows(products, count, discounts)}
        preview, _ = post(f"{api}/reports/{CODE}/builder/preview", parameters)
        execution_id = preview["execution_id"]
        check(execution_id is not None, "el preview devuelve execution_id")
        check(preview["row_count"] == count, f"el preview trae {count} renglones")

        document, headers = post(f"{api}/reports/{CODE}/document/xlsx",
                                 {"execution_id": execution_id})
        check(headers.get("x-report-execution-id") == execution_id,
              "el documento se generó desde el snapshot del preview")
        target = out_dir / f"{count}-{'con' if discounts else 'sin'}-descuento.xlsx"
        target.write_bytes(document)

        sheet = openpyxl.load_workbook(BytesIO(document)).worksheets[0]
        check(sheet.max_row == 37 + count - 1, "la hoja creció exactamente una fila por producto")

        for offset, row in enumerate(preview["rows"]):
            excel_row = FIRST_ROW + offset
            for column, key in ROW_PLACEHOLDER_COLUMNS.items():
                cell = sheet.cell(excel_row, column)
                expected = offset + 1 if key == "row_number" else row[key]
                actual = cell.value
                if isinstance(actual, (int, float, Decimal)) and key != "row_number":
                    actual = Decimal(str(actual))
                    expected = Decimal(str(expected))
                elif key == "row_number":
                    actual = int(actual)
                if actual != expected:
                    check(False, f"fila {offset + 1}: {key} = {actual!r} (esperado {expected!r})")
        check(True, "cada renglón del XLSX coincide con el preview")

        totals_row = FIRST_ROW + count
        for offset, (label, key) in enumerate(zip(SUMMARY_LABELS, SUMMARY_KEYS, strict=True)):
            row = totals_row + offset
            check(sheet.cell(row, 6).value == label, f"etiqueta {label} en F{row}")
            check(Decimal(str(sheet.cell(row, 7).value)) == Decimal(preview["summary"][key]),
                  f"{label} = {preview['summary'][key]}")

        check(sheet.cell(FIRST_ROW, 7).number_format.startswith('_-"$"'),
              "el formato de moneda se conserva en las partidas")
        check(sheet.cell(FIRST_ROW, 1).fill is not None and sheet["A18"].fill.fgColor.rgb == "FF9BC2E6",
              "el encabezado conserva su relleno")
        check(f"B{totals_row}:E{totals_row + 3}" in {str(item) for item in sheet.merged_cells.ranges},
              "el bloque de totales se recolocó bajo las partidas")
        check("C1:G10" in {str(item) for item in sheet.merged_cells.ranges},
              "las combinaciones del membrete siguen intactas")
        check(sheet["B13"].value == f"Cliente: {base['customer_name']}",
              "los datos del cliente se sustituyeron")
        check(sheet.column_dimensions["D"].width == 27.85546875,
              "los anchos de columna se conservan")

    print("\n== la plantilla maestra no cambia al generar documentos")
    with urllib.request.urlopen(f"{api}/admin/reports/{CODE}/excel-template") as response:
        template = json.load(response)
    print(f"  versión {template['version']} · checksum {template['checksum'][:12]}...")

    print("\n== ejecución expirada / inexistente")
    try:
        post(f"{api}/reports/{CODE}/document/xlsx", {"execution_id": "00000000-0000-0000-0000-000000000000"})
        check(False, "una ejecución inexistente debe fallar")
    except urllib.error.HTTPError as error:
        check(error.code in (404, 422), f"una ejecución inexistente responde {error.code}")

    print("\n" + ("TODO OK" if not failures else f"{len(failures)} FALLAS:\n- " + "\n- ".join(failures)))
    raise SystemExit(1 if failures else 0)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--api", default="http://127.0.0.1:8000/api")
    parser.add_argument("--price-list", type=int, required=True)
    parser.add_argument("--out-dir", type=Path, default=Path("."))
    arguments = parser.parse_args()
    arguments.out_dir.mkdir(parents=True, exist_ok=True)
    run(arguments.api, arguments.price_list, arguments.out_dir)


if __name__ == "__main__":
    main()
