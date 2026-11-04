/** Current interface language, readable from plain modules (e.g. date formatting) without React. */
export type Lang = "ar" | "en";

let current: Lang = "ar";

export const getLang = (): Lang => current;
export const setCurrentLang = (lang: Lang) => { current = lang; };
export const LANG_KEY = "aq.lang";
