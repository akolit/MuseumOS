// Shape of a single category-specific field, as stored in Category.schema
// (a JSON Schema-ish object). Labels are per-language; options drive the input.
export interface FieldDef {
  type?: string;            // 'string' | 'number' | 'boolean'
  title?: string;           // English label
  titleEl?: string;         // Greek label
  titleFr?: string;         // French label
  enum?: string[];          // fixed dropdown values
  suggestions?: string[];   // datalist hints (free text + suggestions)
  autocomplete?: boolean;   // pull live distinct values from existing exhibits
}

export interface CategoryFieldSchema {
  type: string;
  properties: Record<string, FieldDef>;
}

// Resolve a field's label for the active UI language, falling back to English
// and finally the raw key. Mirrors how language is chosen elsewhere (startsWith
// so 'el-GR' / 'fr-FR' still match).
export function fieldLabel(prop: FieldDef | undefined, lang: string, key: string): string {
  if (!prop) return key;
  if (lang.startsWith('el') && prop.titleEl) return prop.titleEl;
  if (lang.startsWith('fr') && prop.titleFr) return prop.titleFr;
  return prop.title ?? key;
}
