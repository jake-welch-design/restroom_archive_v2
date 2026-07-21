// Shared state bridging the submission wizard (nested inside the account page)
// and the global layout's persistent Viewer. While a scan is loaded here, the
// layout shows it in place of the normal catalog selection and locks the
// panel open so the wizard can't be tucked away mid-submission.
export function useSubmissionPreview() {
  const previewModelUrl = useState<string | null>('submissionPreviewUrl', () => null)
  return { previewModelUrl }
}
