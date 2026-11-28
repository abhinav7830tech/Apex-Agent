import { useQueryStates } from "nuqs";
import { FilterSearchParams } from "../params";

export const useMeetingsFilter = () => useQueryStates(FilterSearchParams);
