import type { CropBox } from "~~/shared/utils/crop";

// Shared state bridging the account page (submission wizard, admin pending-
// review) and the global layout's persistent Viewer. While a scan is loaded
// here, the layout shows it in place of the normal catalog selection and
// locks the panel open so it can't be tucked away mid-preview.
//
// previewModelUrl is purely "what should the viewer show": set by the wizard
// while a scan is loaded, or by the admin queue while a pending row is
// expanded. hasUnsavedSubmission is narrower: true only while the wizard
// specifically has unsaved form progress, so the "leaving loses the
// submission" guard doesn't fire for the read-only admin preview.
//
// previewEntry is what distinguishes the two sources. An admin previewing a
// pending row is looking at a row that exists, so the viewer can offer the
// crop tool on it and an admin can fix a scan's framing before it reaches the
// archive rather than after. The wizard leaves it null: an unsaved scan has no
// id to crop against, and the null is also what keeps the annotation controls
// hidden there (see Viewer.client.vue).
export interface PreviewEntry {
  id: number;
  slug: string;
  crop: CropBox | null;
}

export function useSubmissionPreview() {
  const previewModelUrl = useState<string | null>(
    "submissionPreviewUrl",
    () => null,
  );
  const previewEntry = useState<PreviewEntry | null>(
    "submissionPreviewEntry",
    () => null,
  );
  const hasUnsavedSubmission = useState<boolean>(
    "hasUnsavedSubmission",
    () => false,
  );
  return { previewModelUrl, previewEntry, hasUnsavedSubmission };
}
