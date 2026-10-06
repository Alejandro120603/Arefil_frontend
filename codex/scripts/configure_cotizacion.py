#!/usr/bin/env python3
"""Apply the COTIZACION configuration this issue closes, through the public API.

It only touches what the BONATTI template needs: its scalar parameters.
Columns, formulas, summaries and the repeatable group already stored in the
report are left untouched.

Usage:
    python codex/scripts/configure_cotizacion.py --api http://127.0.0.1:8000/api \
        [--template path/to/master.xlsx]
"""
from __future__ import annotations

import argparse
import json
import mimetypes
import urllib.request
import uuid
from pathlib import Path

CODE = "COTIZACION"

# price_list_id is the data source contract and stays first; everything else is
# what the BONATTI letter shows above the item grid.
PARAMETERS = [
    {"name": "price_list_id", "label": "Lista de precios", "data_type": "integer",
     "input_type": "select", "required": True, "default_value": None,
     "display_order": 0, "configuration_json": {"options_source": "price_lists"}},
    {"name": "customer_name", "label": "Cliente", "data_type": "string",
     "input_type": "text", "required": True, "default_value": None,
     "display_order": 1, "configuration_json": None},
    {"name": "customer_rfc", "label": "RFC", "data_type": "string",
     "input_type": "text", "required": False, "default_value": None,
     "display_order": 2, "configuration_json": None},
    {"name": "attention_to", "label": "Atención a", "data_type": "string",
     "input_type": "text", "required": False, "default_value": None,
     "display_order": 3, "configuration_json": None},
    {"name": "customer_email", "label": "Email", "data_type": "string",
     "input_type": "text", "required": False, "default_value": None,
     "display_order": 4, "configuration_json": None},
    {"name": "requisition", "label": "Requisición / referencia", "data_type": "string",
     "input_type": "text", "required": False, "default_value": None,
     "display_order": 5, "configuration_json": None},
    {"name": "quotation_date", "label": "Fecha de cotización", "data_type": "date",
     "input_type": "date", "required": True, "default_value": None,
     "display_order": 6, "configuration_json": None},
]

def request(method: str, url: str, payload: dict | None = None) -> dict:
    data = json.dumps(payload).encode() if payload is not None else None
    headers = {"Content-Type": "application/json"} if data else {}
    call = urllib.request.Request(url, data=data, headers=headers, method=method)
    with urllib.request.urlopen(call) as response:
        body = response.read()
    return json.loads(body) if body else {}


def upload_template(api: str, path: Path) -> dict:
    boundary = uuid.uuid4().hex
    content_type = mimetypes.types_map[".xlsx"]
    body = b"".join([
        f"--{boundary}\r\n".encode(),
        f'Content-Disposition: form-data; name="file"; filename="{path.name}"\r\n'.encode(),
        f"Content-Type: {content_type}\r\n\r\n".encode(),
        path.read_bytes(),
        f"\r\n--{boundary}--\r\n".encode(),
    ])
    call = urllib.request.Request(
        f"{api}/admin/reports/{CODE}/excel-template",
        data=body,
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
        method="PUT",
    )
    with urllib.request.urlopen(call) as response:
        return json.loads(response.read())


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--api", default="http://127.0.0.1:8000/api")
    parser.add_argument("--template", type=Path)
    arguments = parser.parse_args()

    report = request("PATCH", f"{arguments.api}/reports/{CODE}", {
        "parameters": PARAMETERS,
    })
    print("parámetros:", ", ".join(item["name"] for item in report["parameters"]))

    if arguments.template is not None:
        result = upload_template(arguments.api, arguments.template)
        print("plantilla:", json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
