import { createContext } from "react";

// The origin of the current selection, so a row can land differently for a
// palette pick than for a click. App provides it, AssetRow reads it.
export type SelectionOrigin = "click" | "search";
export const SelectionOriginContext = createContext<SelectionOrigin>("click");
