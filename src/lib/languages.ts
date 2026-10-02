// Languages a member can pick on their profile: every ISO 639-1 language
// (English names), plus widely spoken languages and sign languages that
// standard has no two-letter code for. Stored comma-joined in
// profiles.languages (text), so the profile view renders it unchanged.
const ISO_639_1 = [
  "Abkhaz", "Afar", "Afrikaans", "Akan", "Albanian", "Amharic", "Arabic", "Aragonese", "Armenian",
  "Assamese", "Avaric", "Avestan", "Aymara", "Azerbaijani", "Bambara", "Bashkir", "Basque",
  "Belarusian", "Bengali", "Bislama", "Bosnian", "Breton", "Bulgarian", "Burmese", "Catalan",
  "Chamorro", "Chechen", "Chichewa", "Church Slavonic", "Chuvash", "Cornish", "Corsican", "Cree",
  "Croatian", "Czech", "Danish", "Dhivehi", "Dutch", "Dzongkha", "English", "Esperanto", "Estonian",
  "Ewe", "Faroese", "Fijian", "Finnish", "French", "Fula", "Galician", "Georgian", "German", "Greek",
  "Greenlandic", "Guarani", "Gujarati", "Haitian Creole", "Hausa", "Hebrew", "Herero", "Hindi",
  "Hiri Motu", "Hungarian", "Icelandic", "Ido", "Igbo", "Indonesian", "Interlingua", "Interlingue",
  "Inuktitut", "Inupiaq", "Irish", "Italian", "Japanese", "Javanese", "Kannada", "Kanuri", "Kashmiri",
  "Kazakh", "Khmer", "Kikuyu", "Kinyarwanda", "Kirundi", "Komi", "Kongo", "Korean", "Kurdish",
  "Kwanyama", "Kyrgyz", "Lao", "Latin", "Latvian", "Limburgish", "Lingala", "Lithuanian",
  "Luba-Katanga", "Luganda", "Luxembourgish", "Macedonian", "Malagasy", "Malay", "Malayalam",
  "Maltese", "Mandarin Chinese", "Manx", "Māori", "Marathi", "Marshallese", "Mongolian", "Nauruan",
  "Navajo", "Ndonga", "Nepali", "Northern Ndebele", "Northern Sami", "Norwegian", "Norwegian Bokmål",
  "Norwegian Nynorsk", "Nuosu", "Occitan", "Odia", "Ojibwe", "Oromo", "Ossetian", "Pali", "Pashto",
  "Persian (Farsi)", "Polish", "Portuguese", "Punjabi", "Quechua", "Romanian", "Romansh", "Russian",
  "Samoan", "Sango", "Sanskrit", "Sardinian", "Scottish Gaelic", "Serbian", "Sesotho", "Setswana",
  "Shona", "Sindhi", "Sinhala", "Slovak", "Slovenian", "Somali", "Southern Ndebele", "Spanish",
  "Sundanese", "Swahili", "Swati", "Swedish", "Tagalog", "Tahitian", "Tajik", "Tamil", "Tatar",
  "Telugu", "Thai", "Tibetan", "Tigrinya", "Tongan", "Tsonga", "Turkish", "Turkmen", "Twi",
  "Ukrainian", "Urdu", "Uyghur", "Uzbek", "Venda", "Vietnamese", "Volapük", "Walloon", "Welsh",
  "Western Frisian", "Wolof", "Xhosa", "Yiddish", "Yoruba", "Zhuang", "Zulu",
];

const OTHER_LANGUAGES = [
  "Assyrian Neo-Aramaic", "Bhojpuri", "Cantonese", "Cebuano", "Cherokee", "Chuukese", "Dari",
  "Filipino", "Hakka", "Hawaiian", "Hmong", "Hokkien", "Ilocano", "Jamaican Patois", "Kabyle",
  "Karen", "Konkani", "Krio", "Maithili", "Tamazight (Berber)", "Tok Pisin", "Wu (Shanghainese)",
  "American Sign Language (ASL)", "British Sign Language (BSL)", "International Sign",
];

export const LANGUAGES: readonly string[] = [...ISO_639_1, ...OTHER_LANGUAGES].sort((a, b) =>
  a.localeCompare(b, "en"),
);

export function splitLanguages(value: string | null | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

// Case- and accent-insensitive, so "maori" finds "Māori" and "volapuk" finds "Volapük".
export function normalizeLanguageQuery(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}
