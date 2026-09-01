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
 * The grant is exclusive rather than an assignment: the Archivist keeps their
 * copyright and can still use their own scan elsewhere, while nobody else can
 * be granted rights in it. That is the whole point -- the archive is not a
 * distributor, so an exclusive hold plus the commitments in the terms achieves
 * what ownership would without asking contributors to give up their work.
 */
export const SUBMISSION_AGREEMENTS = [
  "Scans will be complete and without too many holes (excluding mirrored surfaces).",
  "Scans will be cropped to remove any false spaces caused by reflective surfaces.",
  "Toilets must be flushed before scanning.",
  "I will avoid scanning restrooms that aren't private/ a single room. I will never scan if there are other people present.",
  "I will use my best judgement when submitting. I won't submit anything too traumatizing or gross.",
  "I agree to always be respectful.",
  "The scans I submit are my own work and mine to contribute. I keep my copyright and can still use them elsewhere, and I grant The Restroom Archive an exclusive, perpetual license to hold and display them here — which means the archive will never sell them, pass them on, release them as a dataset, or allow them to be used for AI training.",
] as const;
