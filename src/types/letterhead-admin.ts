/**
 * Letterhead catalog administration (Backend #38,
 * `backend/app/schemas/letterhead_api.py`). Responses never carry bytes:
 * sources and thumbnails have their own endpoints.
 */

export type LetterheadAssetRole = "header" | "watermark" | "footer" | "thumbnail";

export interface LetterheadAsset {
  role: LetterheadAssetRole;
  media_type: string;
  width: number;
  height: number;
  size_bytes: number;
  checksum_sha256: string;
}

export interface LetterheadVersion {
  /** `letterhead_version_id`: what a user selects when generating. */
  id: number;
  letterhead_id: number;
  version: number;
  /** The version new executions use (the latest one). */
  is_current: boolean;
  source_filename: string;
  source_media_type: string;
  source_checksum_sha256: string;
  source_size: number;
  layout_schema_version: number;
  layout_metadata: Record<string, unknown>;
  created_at: string;
  created_by_user_id: number | null;
  assets: LetterheadAsset[];
}

export interface LetterheadVersionUpload extends LetterheadVersion {
  /** `false` when the file was identical to the current version: nothing new was stored. */
  created: boolean;
}

export interface LetterheadAssignmentSummary {
  report_code: string;
  is_active: boolean;
  is_default: boolean;
  display_order: number;
}

export interface LetterheadAdmin {
  id: number;
  /** Immutable identifier. */
  slug: string;
  display_name: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  version_count: number;
  current_version: LetterheadVersion | null;
  assignments: LetterheadAssignmentSummary[];
}

/** Only metadata: bytes, checksum, slug and version numbers are never editable. */
export interface LetterheadUpdateRequest {
  display_name?: string;
  is_active?: boolean;
}

export interface ReportLetterheadAssignment {
  letterhead_id: number;
  slug: string;
  display_name: string;
  letterhead_is_active: boolean;
  is_active: boolean;
  is_default: boolean;
  display_order: number;
  current_version: number | null;
  /** Offered today in the runtime selector (active assignment and letterhead, with a version). */
  offered: boolean;
}

export interface ReportLetterheadAssignments {
  report_code: string;
  /** Opaque token; sent back as `expected_revision` so a stale view never overwrites. */
  revision: string;
  default_letterhead_id: number | null;
  assignments: ReportLetterheadAssignment[];
}

/**
 * Complete desired state (a replace): list order is display order, and an
 * assignment left out is deactivated. `default_letterhead_id: null` is
 * «Sin membrete».
 */
export interface ReportLetterheadAssignmentsWrite {
  assignments: { letterhead_id: number; is_active: boolean }[];
  default_letterhead_id: number | null;
  expected_revision: string;
}

/** `detail` of every letterhead endpoint error. */
export interface LetterheadErrorDetail {
  code: string;
  message: string;
}
