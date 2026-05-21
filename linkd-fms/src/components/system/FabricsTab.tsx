import { useFabrics } from "@/hooks/useFabrics";
import { LookupSection } from "@/components/system/LookupSection";

/**
 * Fabrics tab — single LookupSection bound to the `fabrics` table. The
 * Briefing form's Fabric picker reads from this taxonomy.
 */
export function FabricsTab() {
  const { fabrics, isLoading, error, refetch } = useFabrics({
    activeOnly: false,
  });

  return (
    <LookupSection
      title="Fabrics"
      description="Fabric types available in the Briefing form (Cotton Voile, 50x60 Twil, …)."
      table="fabrics"
      addPlaceholder="e.g. Cotton Voile"
      rows={fabrics}
      isLoading={isLoading}
      error={error}
      refetch={refetch}
    />
  );
}
