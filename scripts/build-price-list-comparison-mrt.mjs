/**
 * Generates `public/reports/price-list-comparison.mrt`, the Stimulsoft template
 * for the PRICE_LIST_COMPARISON report.
 *
 * The template is built through the official Stimulsoft engine API rather than
 * hand-written StiSerializer XML: the engine is the only thing that knows the
 * exact schema, so a generated file is guaranteed to load. The generated .mrt
 * IS committed — this script is the reviewable source for it, not a build step.
 *
 *   node scripts/build-price-list-comparison-mrt.mjs
 *
 * Everything the report prints comes from the dataset built by
 * `src/lib/reports/stimulsoft-dataset.ts`. The template performs no arithmetic:
 * summary counts, deltas and percentages arrive pre-computed from Backend #9
 * and pre-formatted by the adapter, so the PDF can never disagree with the HTML
 * table (Frontend #8) or with the backend.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { Stimulsoft } from "stimulsoft-reports-js-react/index.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT = resolve(ROOT, "public/reports/price-list-comparison.mrt");

const DATA_SOURCE = "ArefilReportData";

/** A4 portrait, in centimetres. */
const PAGE_WIDTH = 21;
const PAGE_HEIGHT = 29.7;
const MARGIN = 1;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2; // 19 cm

const { Color } = Stimulsoft.System.Drawing;
const { StiSolidBrush, StiTextHorAlignment, StiVertAlignment, StiBorderSides } = Stimulsoft.Base.Drawing;
const { Font, Rectangle } = Stimulsoft.System.Drawing;
const Components = Stimulsoft.Report.Components;

const INK = Color.fromArgb(255, 24, 24, 27);
const MUTED = Color.fromArgb(255, 90, 90, 99);
const RULE = Color.fromArgb(255, 203, 203, 210);
const HEADER_FILL = Color.fromArgb(255, 238, 238, 242);
const TILE_FILL = Color.fromArgb(255, 246, 246, 248);

/**
 * One row of the dataset per table, used only to teach the dictionary the
 * column names and types. `dictionary.databases.clear()` drops the connection
 * again before saving, so no sample value ever reaches the committed template.
 * Column names are asserted against `AREFIL_REPORT_BINDINGS` by
 * `src/lib/reports/stimulsoft-dataset.test.ts`.
 */
const SCHEMA_SAMPLE = {
  report: [{ code: "", generated_at: "", generated_at_display: "" }],
  supplier: [{ id: 0, code: "", name: "" }],
  list_a: [{ id: 0, effective_date: "", effective_date_display: "", currency: "", source_filename: "" }],
  list_b: [{ id: 0, effective_date: "", effective_date_display: "", currency: "", source_filename: "" }],
  summary: [
    {
      total_products: 0,
      increased: 0,
      decreased: 0,
      unchanged: 0,
      new: 0,
      removed: 0,
      average_percentage_change: "",
      average_percentage_change_display: "",
    },
  ],
  items: [
    {
      product_id: 0,
      part_number: "",
      item_number: "",
      description: "",
      price_a_cents: 0,
      price_a: "",
      price_b_cents: 0,
      price_b: "",
      absolute_change_cents: 0,
      absolute_change: "",
      percentage_change: "",
      classification_a: "",
      classification_b: "",
      status: "",
      description_display: "",
      price_a_display: "",
      price_b_display: "",
      absolute_change_display: "",
      percentage_change_display: "",
      classification_display: "",
      status_label: "",
    },
  ],
};

/** Detail columns, left to right. Widths add up to CONTENT_WIDTH. */
const COLUMNS = [
  { title: "Part Number", field: "part_number", width: 2.6, align: "left" },
  { title: "Descripción", field: "description_display", width: 6.0, align: "left" },
  { title: "Precio A", field: "price_a_display", width: 2.2, align: "right" },
  { title: "Precio B", field: "price_b_display", width: 2.2, align: "right" },
  { title: "Diferencia", field: "absolute_change_display", width: 2.2, align: "right" },
  // Centred, unlike the money columns: it is the last numeric column before the
  // left-aligned Estado, and right-aligning it would leave "+5.00%" flush
  // against Estado's rule with only the cell margin between the two readings.
  { title: "%", field: "percentage_change_display", width: 1.8, align: "center" },
  { title: "Estado", field: "status_label", width: 2.0, align: "left" },
];

/** Summary tiles, left to right. All seven values come straight from `summary`. */
const SUMMARY_TILES = [
  { title: "Total productos", field: "total_products" },
  { title: "Aumentaron", field: "increased" },
  { title: "Disminuyeron", field: "decreased" },
  { title: "Sin cambio", field: "unchanged" },
  { title: "Nuevos", field: "new" },
  { title: "Retirados", field: "removed" },
  { title: "Prom. variación", field: "average_percentage_change_display" },
];

const HOR_ALIGNMENT = {
  left: StiTextHorAlignment.Left,
  center: StiTextHorAlignment.Center,
  right: StiTextHorAlignment.Right,
};

let componentIndex = 0;

function addText(container, { x, y, width, height, text, size = 8, bold = false, align = "left", color = INK, fill = null, border = null, wordWrap = false, name }) {
  const component = new Components.StiText(new Rectangle(x, y, width, height));
  component.name = name ?? `Text${++componentIndex}`;
  component.text = text;
  component.font = new Font("Arial", size, bold ? 1 : 0);
  component.horAlignment = HOR_ALIGNMENT[align];
  component.vertAlignment = StiVertAlignment.Center;
  component.textBrush = new StiSolidBrush(color);
  component.wordWrap = wordWrap;
  component.canGrow = false;
  // Breathing room so a right-aligned figure never touches the next cell's rule.
  component.margins = new Components.StiMargins(0.12, 0.12, 0, 0);
  if (fill) component.brush = new StiSolidBrush(fill);
  if (border) {
    component.border.side = border.side;
    component.border.color = border.color;
    component.border.size = border.size ?? 1;
  }
  container.components.add(component);
  return component;
}

function buildTitleBand(page) {
  const band = new Components.StiReportTitleBand();
  band.name = "ReportTitleBand";
  band.height = 6.5;
  page.components.add(band);

  addText(band, { x: 0, y: 0, width: 6, height: 0.9, text: "AREFIL", size: 20, bold: true, name: "TitleBrand" });
  addText(band, {
    x: 0,
    y: 0.9,
    width: CONTENT_WIDTH,
    height: 0.6,
    text: "Comparación de listas de precios",
    size: 12,
    bold: true,
    name: "TitleReportName",
  });
  addText(band, {
    x: 0,
    y: 1.6,
    width: 12,
    height: 0.5,
    text: `Proveedor: {supplier.name}`,
    size: 9,
    name: "TitleSupplier",
  });
  addText(band, {
    x: 12,
    y: 1.6,
    width: CONTENT_WIDTH - 12,
    height: 0.5,
    text: `Moneda: {list_b.currency}`,
    size: 9,
    align: "right",
    name: "TitleCurrency",
  });
  addText(band, {
    x: 0,
    y: 2.15,
    width: CONTENT_WIDTH,
    height: 0.5,
    text: `Lista A: {list_a.effective_date_display} · {list_a.source_filename}`,
    size: 9,
    color: MUTED,
    name: "TitleListA",
  });
  addText(band, {
    x: 0,
    y: 2.65,
    width: CONTENT_WIDTH,
    height: 0.5,
    text: `Lista B: {list_b.effective_date_display} · {list_b.source_filename}`,
    size: 9,
    color: MUTED,
    name: "TitleListB",
  });
  addText(band, {
    x: 0,
    y: 3.15,
    width: CONTENT_WIDTH,
    height: 0.5,
    text: `Generado: {report.generated_at_display}`,
    size: 9,
    color: MUTED,
    border: { side: StiBorderSides.Bottom, color: RULE },
    name: "TitleGeneratedAt",
  });

  addText(band, { x: 0, y: 3.95, width: CONTENT_WIDTH, height: 0.55, text: "Resumen", size: 11, bold: true, name: "SummaryHeading" });

  const tileWidth = CONTENT_WIDTH / SUMMARY_TILES.length;
  SUMMARY_TILES.forEach((tile, index) => {
    const x = index * tileWidth;
    addText(band, {
      x,
      y: 4.6,
      width: tileWidth,
      height: 0.6,
      text: tile.title,
      size: 7.5,
      align: "center",
      color: MUTED,
      fill: TILE_FILL,
      // Two of the seven captions are one character away from the tile width at
      // 7.5pt; wrapping is what keeps them from being clipped.
      wordWrap: true,
      border: { side: StiBorderSides.All, color: RULE },
      name: `SummaryTitle${index}`,
    });
    addText(band, {
      x,
      y: 5.2,
      width: tileWidth,
      height: 0.7,
      text: `{summary.${tile.field}}`,
      size: 12,
      bold: true,
      align: "center",
      border: { side: StiBorderSides.All, color: RULE },
      name: `SummaryValue${index}`,
    });
  });

  addText(band, {
    x: 0,
    y: 6.1,
    width: CONTENT_WIDTH,
    height: 0.4,
    text: "Detalle por producto",
    size: 10,
    bold: true,
    name: "DetailHeading",
  });
}

function buildHeaderBand(page) {
  const band = new Components.StiHeaderBand();
  band.name = "HeaderBand";
  band.height = 0.65;
  band.printOnAllPages = true;
  page.components.add(band);

  let x = 0;
  COLUMNS.forEach((column, index) => {
    addText(band, {
      x,
      y: 0,
      width: column.width,
      height: 0.65,
      text: column.title,
      size: 8,
      bold: true,
      align: column.align,
      fill: HEADER_FILL,
      border: { side: StiBorderSides.All, color: RULE },
      name: `HeaderCell${index}`,
    });
    x += column.width;
  });
}

function buildDataBand(page) {
  const band = new Components.StiDataBand();
  band.name = "ItemsDataBand";
  band.dataSourceName = "items";
  band.height = 0.6;
  page.components.add(band);

  let x = 0;
  COLUMNS.forEach((column, index) => {
    addText(band, {
      x,
      y: 0,
      width: column.width,
      height: 0.6,
      text: `{items.${column.field}}`,
      size: 8,
      align: column.align,
      // Only the description is long enough to need wrapping; letting every
      // cell grow would make row heights depend on the data.
      wordWrap: column.field === "description_display",
      border: { side: StiBorderSides.All, color: RULE },
      name: `DataCell${index}`,
    });
    x += column.width;
  });
}

function buildFooterBand(page) {
  const band = new Components.StiPageFooterBand();
  band.name = "PageFooterBand";
  band.height = 0.8;
  page.components.add(band);

  addText(band, {
    x: 0,
    y: 0.15,
    width: 12,
    height: 0.5,
    text: "AREFIL · Comparación de listas de precios",
    size: 7.5,
    color: MUTED,
    border: { side: StiBorderSides.Top, color: RULE },
    name: "FooterBrand",
  });
  addText(band, {
    x: 12,
    y: 0.15,
    width: CONTENT_WIDTH - 12,
    height: 0.5,
    text: "Página {PageNumber} de {TotalPageCount}",
    size: 7.5,
    align: "right",
    color: MUTED,
    border: { side: StiBorderSides.Top, color: RULE },
    name: "FooterPageNumber",
  });
}

function build() {
  const report = new Stimulsoft.Report.StiReport();
  report.reportName = "PriceListComparison";
  report.reportAlias = "Comparación de listas de precios";
  report.reportUnit = Stimulsoft.Report.StiReportUnitType.Centimeters;

  const dataSet = new Stimulsoft.System.Data.DataSet(DATA_SOURCE);
  dataSet.readJson(JSON.stringify(SCHEMA_SAMPLE));
  report.regData(DATA_SOURCE, DATA_SOURCE, dataSet);
  report.dictionary.synchronize();

  const page = report.pages.getByIndex(0);
  page.name = "Page1";
  page.orientation = Stimulsoft.Report.Components.StiPageOrientation.Portrait;
  page.paperSize = Stimulsoft.System.Drawing.Printing.PaperKind.A4;
  page.pageWidth = PAGE_WIDTH;
  page.pageHeight = PAGE_HEIGHT;
  page.margins = new Components.StiMargins(MARGIN, MARGIN, MARGIN, MARGIN);
  page.components.clear();

  buildTitleBand(page);
  buildHeaderBand(page);
  buildDataBand(page);
  buildFooterBand(page);

  // The template must ship without a data connection: the browser registers the
  // live comparison at runtime. The DataSources built by `synchronize()` stay,
  // which is what the `{ArefilReportData.items.*}` expressions bind to.
  report.dictionary.databases.clear();

  mkdirSync(dirname(OUTPUT), { recursive: true });
  writeFileSync(OUTPUT, report.saveToJsonString(), "utf8");
  console.log(`[build-mrt] wrote ${OUTPUT}`);
}

build();
