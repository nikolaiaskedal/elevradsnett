// De 15 fylkene etter regionreformen 2024, med fylkeslag i Elevorganisasjonen. Kilde: medlemsregisteret 2025/2026.
export const COUNTIES = [
  'Agder','Akershus','Buskerud','Finnmark','Innlandet','Møre og Romsdal','Nordland','Oslo',
  'Rogaland','Telemark','Troms','Trøndelag','Vestfold','Vestland','Østfold',
] as const;
export type County = typeof COUNTIES[number];
