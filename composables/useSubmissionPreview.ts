// Shared state bridging the account page (submission wizard, admin pending-
// review) and the global layout's persistent Viewer. While a scan is loaded
// here, the layout shows it in place of the normal catalog selection and
// locks the panel open so it can't be tucked away mid-preview.
//
// previewModelUrl is purely "what should the viewer show" — set by the wizard
// while a scan is loaded, or by the admin queue while a pending row is
// expanded. hasUnsavedSubmission is narrower: true only while the wizard
// specifically has unsaved form progress, so the "leaving loses your
// submission" guard doesn't fire for the read-only admin preview.
export function useSubmissionPreview() {
  const previewModelUrl = useState<string | null>(
    "submissionPreviewUrl",
    () => null,
  );
  const hasUnsavedSubmission = useState<boolean>(
    "hasUnsavedSubmission",
    () => false,
  );
  return { previewModelUrl, hasUnsavedSubmission };
}
