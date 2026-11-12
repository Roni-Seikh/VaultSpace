export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** Database exceptions raised by our SQL functions -> HTTP errors safe to show users. */
const DB_ERRORS: Record<string, [number, string]> = {
  QUOTA_EXCEEDED: [413, "Your storage is full. Delete some files or free up space."],
  GLOBAL_CAP_REACHED: [503, "VaultSpace has reached its overall storage capacity. Please try again later."],
  FILE_TOO_LARGE: [413, "This file is larger than the maximum allowed size."],
  INVALID_SIZE: [400, "Invalid file size."],
  FILE_NOT_FOUND: [404, "File not found."],
  FOLDER_NOT_FOUND: [404, "Folder not found."],
  PARENT_FOLDER_NOT_FOUND: [404, "Destination folder not found."],
  FOLDER_CYCLE: [400, "A folder cannot be moved into itself or one of its subfolders."],
  UPLOAD_NOT_FOUND: [404, "Upload not found or already completed."],
  SIZE_MISMATCH: [400, "The uploaded file size does not match what was reserved."],
  VERSION_NOT_FOUND: [404, "Version not found."],
  CANNOT_DELETE_CURRENT: [409, "The current version cannot be deleted. Restore another version first."],
  TYPE_MISMATCH: [400, "A new version must be the same kind of file."],
  INVALID_EXPIRY: [400, "Expiry must be in the future and within 365 days."],
  USER_NOT_FOUND: [404, "Account not found."],
};

export function mapDbError(message: string | undefined | null): ApiError | null {
  if (!message) return null;
  for (const code of Object.keys(DB_ERRORS)) {
    if (message.includes(code)) {
      const [status, text] = DB_ERRORS[code];
      return new ApiError(status, code, text);
    }
  }
  return null;
}

/** Throws a mapped ApiError for known DB exceptions, or a generic 500 (details are not leaked). */
export function throwDb(error: { message?: string; code?: string } | null | undefined): void {
  if (!error) return;
  const mapped = mapDbError(error.message);
  if (mapped) throw mapped;
  console.error("[db]", error.code, error.message);
  throw new ApiError(500, "DB_ERROR", "Something went wrong. Please try again.");
}
