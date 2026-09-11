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
 *
 * The first section in each group is also the one the group opens on — see
 * `DEFAULT_ADMIN_SECTIONS`, which derives from this. So the order is not
 * cosmetic: putting a section first makes it the landing view.
 *
 * `accounts` leads with `upgrades` rather than `directory` for the same reason
 * `submissions` leads with `pending`: it is the group's queue, the thing with a
 * badge and a backlog waiting on the admin, while the directory is a browse
 * list consulted on purpose.
 */
export const ADMIN_GROUP_SECTIONS = {
  submissions: ["pending", "archived", "rejected", "removals"],
  accounts: ["upgrades", "directory"],
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

/**
 * The section each group opens on: the first one it lists.
 *
 * Derived rather than restated, because the two were previously written out
 * twice and nothing tied them together — reordering a group's sections left its
 * default pointing at whatever used to be first, which is a silent mismatch
 * between the tab that looks selected and the list that renders. `audit` has no
 * sections and resolves to the empty string, which is what its single-row
 * layout expects.
 */
export const DEFAULT_ADMIN_SECTIONS = Object.fromEntries(
  ADMIN_GROUPS.map((group) => [group, sectionsFor(group)[0] ?? ""]),
) as Record<AdminGroup, string>;

export function useAccountNav() {
  const tab = useState<AccountTab>("account-nav-tab", () => "profile");

  const adminGroup = useState<AdminGroup>(
    "account-nav-admin-group",
    () => "submissions",
  );

  /** The chosen section per group, so switching away and back returns to it. */
  const adminSectionByGroup = useState<Record<AdminGroup, string>>(
    "account-nav-admin-sections",
    // Spread, not the shared object: this is mutated as the admin navigates,
    // and handing out the module-level constant would let one visit's position
    // leak into the next by rewriting the defaults themselves.
    () => ({ ...DEFAULT_ADMIN_SECTIONS }),
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
