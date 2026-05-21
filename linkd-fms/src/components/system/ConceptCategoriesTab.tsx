import { useConceptCategories } from "@/hooks/useConceptCategories";
import { LookupSection } from "@/components/system/LookupSection";

/**
 * Concept Categories tab — single LookupSection bound to the
 * `concept_categories` table. The Briefing form's Concept picker reads from
 * this taxonomy.
 */
export function ConceptCategoriesTab() {
  const { categories, isLoading, error, refetch } = useConceptCategories({
    activeOnly: false,
  });

  return (
    <LookupSection
      title="Concept Categories"
      description="Design styles available in the Briefing form (Block print, Damask, …)."
      table="concept_categories"
      addPlaceholder="e.g. Block print"
      rows={categories}
      isLoading={isLoading}
      error={error}
      refetch={refetch}
    />
  );
}
