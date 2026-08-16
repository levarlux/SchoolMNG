import { useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useSchool } from "./use-school";

/**
 * Hook to check if a module has EAV structure (sections + fields) configured.
 *
 * Returns:
 * - `hasEavStructure`: whether the module has any sections configured
 * - `sections`: the module's sections (with nested subsections)
 * - `module`: the module document itself
 * - `isLoading`: whether the data is still loading
 *
 * Used by pages to decide whether to render via the generic EAV renderer
 * or fall back to hardcoded typed-table rendering.
 */
export function useEavModule(moduleName: string) {
  const school = useSchool();
  const modules = useQuery(
    api.modules.listBySchool,
    school ? { schoolId: school._id } : "skip"
  );

  const module = useMemo(
    () => modules?.find((m) => m.name === moduleName),
    [modules, moduleName]
  );

  const sections = useQuery(
    api.sections.listByModule,
    module ? { moduleId: module._id as any } : "skip"
  );

  const hasEavStructure = useMemo(() => {
    if (!sections) return false;
    return sections.length > 0;
  }, [sections]);

  return {
    module,
    sections: sections ?? [],
    hasEavStructure,
    isLoading: modules === undefined || (module !== undefined && sections === undefined),
    moduleId: module?._id,
  };
}

/**
 * Hook to check if a module (by ID) has EAV structure configured.
 */
export function useEavModuleById(moduleId: string | null | undefined) {
  const school = useSchool();
  const sections = useQuery(
    api.sections.listByModule,
    moduleId ? { moduleId: moduleId as any } : "skip"
  );

  return {
    sections: sections ?? [],
    hasEavStructure: (sections?.length ?? 0) > 0,
    isLoading: moduleId !== null && moduleId !== undefined && sections === undefined,
  };
}
