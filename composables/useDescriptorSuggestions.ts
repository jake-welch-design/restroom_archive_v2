// Previously-used descriptors across the archive, surfaced as autocomplete
// suggestions in the TagInput on the submission and edit forms.
export function useDescriptorSuggestions() {
  return useFetch<string[]>("/api/restrooms/descriptors", {
    key: "descriptor-suggestions",
    default: () => [],
  });
}
