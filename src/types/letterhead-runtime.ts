/**
 * Letterhead selection at runtime (Backend #38/#39,
 * `backend/app/schemas/letterhead_api.py` and `backend/app/schemas/reports.py`).
 */

/** One option of `GET /api/reports/{code}/letterheads`. `letterhead_version_id: null` is «Sin membrete». */
export interface ReportLetterheadOption {
  letterhead_version_id: number | null;
  letterhead_id: number | null;
  label: string;
  slug?: string | null;
  display_name?: string | null;
  version?: number | null;
  display_order?: number | null;
  is_default: boolean;
  /** Backend URL (`/api/reports/{code}/letterheads/{id}/thumbnail`); protected, fetched with the session. */
  thumbnail_url?: string | null;
  thumbnail_checksum_sha256?: string | null;
  thumbnail_media_type?: string | null;
  thumbnail_width?: number | null;
  thumbnail_height?: number | null;
}

export interface ReportLetterheadOptions {
  report_code: string;
  /** `false`: the report only accepts «Sin membrete» and no selector is shown. */
  supported: boolean;
  /** Initial selection; `null` = «Sin membrete». */
  default_letterhead_version_id: number | null;
  options: ReportLetterheadOption[];
}

/**
 * Reserved key sent next to the business parameters of `POST /data`; it is
 * presentation only and never reaches parameter validation or calculations.
 */
export interface ReportPresentationRequest {
  letterhead_version_id: number | null;
}

export interface FrozenLetterheadAsset {
  media_type: string;
  width: number;
  height: number;
  size_bytes: number;
  checksum_sha256: string;
}

/** The letterhead version an execution pinned when it was created; never re-resolved afterwards. */
export interface FrozenLetterhead {
  letterhead_id: number;
  letterhead_version_id: number;
  version: number;
  slug: string;
  display_name: string;
  layout_schema_version: number;
  layout_checksum_sha256: string;
  source_checksum_sha256: string;
  paper: string;
  orientation: string;
  assets: Record<string, FrozenLetterheadAsset>;
}

/** `presentation` of an execution response; `letterhead: null` is «Sin membrete». */
export interface ReportExecutionPresentation {
  letterhead: FrozenLetterhead | null;
}
