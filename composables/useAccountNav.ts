/**
 * Where the account page is currently pointed, and the shape of what it can
 * point at.
 *
 * A shared singleton rather than page-local refs, because the position has to
 * outlive the page. Leaving for the catalog to look at an entry unmounts
 * `pages/account.vue`, and the header's link comes back to a bare `/account`
 * with no query — so plain refs meant an admin who stepped out to check one
 * annotation returned to the Profile tab and had to navigate back through two
 * rows of sub-tabs. The URL still carries the position for reloads and deep
 * links; this carries it across an in-session round trip, which the URL cannot.
 *
 * Persistence is per session, not per browser: a fresh load with no query opens
 * on Profile, which is the right first impression for a page most visitors see
 * as their own account rather than as a moderation console.
 */
export type AccountTab = "admin" | "profile" | "submissions" | "annotations";
export type AdminGroup = "submissions" | "accounts" | "annotations" | "audit";
export type SubmissionsSection = "new" | "published" | "pending";

/**
 * The sections inside each admin group, in the order they appear.
 *
 * `audit` is deliberately empty: it is one list, so a second row holding a
 * single button would be navigation that never navigates anywhere. Groups with
 * no sections render the first row only.
 */
export const ADMIN_GROUP_SECTIONS = {
  submissions: ["pending", "archived", "rejected", "removals"],
  accounts: ["directory", "upgrades"],
  annotations: ["all", "reports"],
  audit: [],
} as const satisfies Record<AdminGroup, readonly string[]>;

export const ADMIN_GROUPS = Object.keys(ADMIN_GROUP_SECTIONS) as AdminGroup[];

export const SUBMISSIONS_SECTIONS: SubmissionsSection[] = [
  "new",
  "published",
  "pending",
];

export function isAdminGroup(v: unknown): v is AdminGroup {
  return typeof v === "string" && (ADMIN_GROUPS as string[]).includes(v);
}

export function isSubmissionsSection(v: unknown): v is SubmissionsSection {
  return (
    typeof v === "string" &&
    (SUBMISSIONS_SECTIONS as string[]).includes(v as string)
  );
}

export function sectionsFor(group: AdminGroup): readonly string[] {
  return ADMIN_GROUP_SECTIONS[group];
}

export function useAccountNav() {
  const tab = useState<AccountTab>("account-nav-tab", () => "profile");

  const adminGroup = useState<AdminGroup>(
    "account-nav-admin-group",
    () => "submissions",
  );

  /** The chosen section per group, so switching away and back returns to it. */
  const adminSectionByGroup = useState<Record<AdminGroup, string>>(
    "account-nav-admin-sections",
    () => ({
      submissions: "pending",
      accounts: "directory",
      annotations: "all",
      audit: "",
    }),
  );

  const submissionsSection = useState<SubmissionsSection>(
    "account-nav-submissions-section",
    () => "new",
  );

  const adminSection = computed(
    () => adminSectionByGroup.value[adminGroup.value],
  );

  return {
    tab,
    adminGroup,
    adminSectionByGroup,
    adminSection,
    submissionsSection,
  };
}
