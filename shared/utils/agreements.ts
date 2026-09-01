/**
 * The guidelines an account agrees to when requesting submission access.
 *
 * Shared rather than declared in the form component because the server
 * validates the array it receives against this list. Keeping one copy is what
 * stops the two drifting: adding a guideline to a local copy in the component
 * would silently fail validation on submit.
 *
 * The last entry is the license grant. It is what gives the archive the right
 * to publish a contributed scan at all, and it is the basis of the AI-training
 * reservation stated in /ai.txt -- a reservation the archive can only make on
 * terms its contributors actually agreed to.
 *
 * The grant is a SOLE license, not an exclusive one and not an assignment. The
 * distinction is load-bearing and easy to undo by accident: an exclusive
 * license bars the licensor from using their own work, which would contradict
 * the first half of this same agreement. Sole means the archive is the only
 * party that may hold the rights while the Archivist keeps full use of their
 * own scan. Do not "tighten" this back to "exclusive".
 *
 * Soleness is still worth having over a bare non-exclusive permission: it is
 * what stops an Archivist licensing the same scan to a dataset or AI company
 * alongside the archive.
 */
export const SUBMISSION_AGREEMENTS = [
  "Scans will be complete and without too many holes (excluding mirrored surfaces).",
  "Scans will be cropped to remove any false spaces caused by reflective surfaces.",
  "Toilets must be flushed before scanning.",
  "I will avoid scanning restrooms that aren't private/ a single room. I will never scan if there are other people present.",
  "I will use my best judgement when submitting. I won't submit anything too traumatizing or gross.",
  "I agree to always be respectful.",
  "The scans I submit are my own work and mine to contribute. I keep ownership and copyright, and I may use my scans anywhere else. I grant The Restroom Archive a sole, perpetual license to hold and display them on the site, meaning I will not license the same scan to anyone else, and I understand the archive will use them on the site and nowhere else: never sold, never transferred, never released as datasets, never used for AI training.",
] as const;
