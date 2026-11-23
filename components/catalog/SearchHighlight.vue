<script lang="ts">
/**
 * Text with the catalog search's matches marked. Renders the text alone, with
 * no wrapper, so it drops into any element in place of `{{ text }}`.
 *
 * `kind` says what the text is, for the words it shows that stand for others:
 * a location's trailing code for its country or state, a date's month for its
 * name and number.
 *
 * A render function rather than a template, so no whitespace can find its way
 * in between the marked runs.
 */
import { h, Fragment, type PropType } from "vue";
import {
  DATE_ALIASES,
  locationAliases,
  markMatches,
} from "~~/shared/utils/catalogSearch";

export default defineComponent({
  props: {
    text: { type: String, required: true },
    kind: { type: String as PropType<"location" | "date">, default: undefined },
    /** The row's country, for a location. */
    country: { type: String as PropType<string | null>, default: null },
  },
  setup(props) {
    const terms = useSearchTerms();
    const segments = computed(() =>
      markMatches(
        props.text,
        terms.value,
        props.kind === "date"
          ? DATE_ALIASES
          : props.kind === "location"
            ? locationAliases(props.text, props.country)
            : undefined,
      ),
    );
    return () =>
      h(
        Fragment,
        segments.value.map((s) =>
          s.hit ? h("mark", { class: "search-hit" }, s.text) : s.text,
        ),
      );
  },
});
</script>
