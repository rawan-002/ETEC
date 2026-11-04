"use client";

/**
 * Arabic / English switch for the whole interface without rewriting the pages.
 * Arabic stays the source language in the code. In English mode, a translator walks the rendered page and swaps
 * interface strings that match the dictionary exactly (or a known pattern), keeping the Arabic to restore later.
 * Text that is not in the dictionary (names, course codes, file contents, user input, backend data) is left as is.
 * Nothing re-mounts, so forms keep what the user typed when the language changes.
 */
import { createContext, useContext, useEffect, useState } from "react";
import { EN, EN_PATTERNS } from "./en";
import { getLang, LANG_KEY, setCurrentLang, type Lang } from "./state";

export { getLang, type Lang };

const ARABIC = /[؀-ۿ]/;
const ATTRS = ["placeholder", "title", "aria-label"] as const;
const SKIP = 'script,style,textarea,pre,code,[translate="no"]';

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const norm = (s: string) => s.replace(/\s+/g, " ").trim();

const DICT = new Map(Object.entries(EN).map(([k, v]) => [norm(k), v]));
const PATTERNS = EN_PATTERNS.map(([ar, en]) => {
  const parts = norm(ar).split(/\{(\d+)\}/);
  let re = "^";
  const order: number[] = [];
  parts.forEach((p, i) => { if (i % 2) { re += "(.+?)"; order.push(Number(p)); } else re += escapeRe(p); });
  return { re: new RegExp(`${re}$`), order, en };
});

const DIGITS = "٠١٢٣٤٥٦٧٨٩";
const MONTHS: Record<string, string> = {
  يناير: "Jan", فبراير: "Feb", مارس: "Mar", أبريل: "Apr", مايو: "May", يونيو: "Jun",
  يوليو: "Jul", أغسطس: "Aug", سبتمبر: "Sep", أكتوبر: "Oct", نوفمبر: "Nov", ديسمبر: "Dec",
};

/** Dates already rendered in Arabic (e.g. "٤ نوفمبر ٢٠٢٦ في ٣:٢٢ م") until their component re-renders in English. */
function translateDate(s: string): string | null {
  if (!/^[\s٠-٩0-9:،,٫/‏]*(يناير|فبراير|مارس|أبريل|مايو|يونيو|يوليو|أغسطس|سبتمبر|أكتوبر|نوفمبر|ديسمبر)[\s٠-٩0-9:،,٫/‏فيصم]*$/.test(s)) return null;
  return s.replace(/[٠-٩]/g, (d) => String(DIGITS.indexOf(d)))
    .replace(/يناير|فبراير|مارس|أبريل|مايو|يونيو|يوليو|أغسطس|سبتمبر|أكتوبر|نوفمبر|ديسمبر/g, (m) => MONTHS[m])
    .replace(/\s*في\s*/, ", ").replace(/\sص$/, " AM").replace(/\sم$/, " PM").replace(/،/g, ",").replace(/‏/g, "");
}

/** English for one interface string, or the input unchanged when it is not an interface string. */
export function translate(text: string): string {
  const core = norm(text);
  if (!core || !ARABIC.test(core)) return text;
  const lead = text.match(/^\s*/)![0], trail = text.match(/\s*$/)![0];
  const hit = DICT.get(core);
  if (hit !== undefined) return lead + hit + trail;
  for (const p of PATTERNS) {
    const m = core.match(p.re);
    if (m) {
      let out = p.en;
      p.order.forEach((slot, i) => { const v = m[i + 1]; out = out.replace(`{${slot}}`, DICT.get(norm(v)) ?? v); });
      return lead + out + trail;
    }
  }
  const date = translateDate(core);
  return date ? lead + date + trail : text;
}

// ---------- page translator ----------

const original = new WeakMap<Node, string>();
const written = new WeakMap<Node, string>();
const attrOriginal = new WeakMap<Element, Map<string, string>>();
const attrWritten = new WeakMap<Element, Map<string, string>>();

const skipped = (n: Node) => !!(n.nodeType === 1 ? (n as Element) : n.parentElement)?.closest(SKIP);

function doText(t: Text) {
  if (written.get(t) === t.data || skipped(t)) return; // our own write, or protected content
  const tr = translate(t.data);
  if (tr === t.data) return;
  original.set(t, t.data);
  written.set(t, tr);
  t.data = tr;
}

function doElement(el: Element) {
  if (skipped(el)) return;
  for (const a of ATTRS) {
    const v = el.getAttribute(a);
    if (!v || attrWritten.get(el)?.get(a) === v) continue;
    const tr = translate(v);
    if (tr === v) continue;
    if (!attrOriginal.has(el)) { attrOriginal.set(el, new Map()); attrWritten.set(el, new Map()); }
    attrOriginal.get(el)!.set(a, v);
    attrWritten.get(el)!.set(a, tr);
    el.setAttribute(a, tr);
  }
}

function walk(root: Node, fn: (n: Node) => void) {
  if (root.nodeType === 3 || root.nodeType === 1) fn(root);
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  for (let n = w.nextNode(); n; n = w.nextNode()) fn(n);
}

const toEnglish = (n: Node) => (n.nodeType === 3 ? doText(n as Text) : doElement(n as Element));

function toArabic(n: Node) {
  if (n.nodeType === 3) {
    const t = n as Text;
    if (original.has(t) && written.get(t) === t.data) t.data = original.get(t)!;
    original.delete(t); written.delete(t);
  } else {
    const el = n as Element;
    attrOriginal.get(el)?.forEach((v, a) => { if (el.getAttribute(a) === attrWritten.get(el)?.get(a)) el.setAttribute(a, v); });
    attrOriginal.delete(el); attrWritten.delete(el);
  }
}

let observer: MutationObserver | null = null;

function startTranslating() {
  walk(document.body, toEnglish);
  observer ??= new MutationObserver((list) => {
    for (const m of list) {
      if (m.type === "characterData") doText(m.target as Text);
      else if (m.type === "attributes") doElement(m.target as Element);
      else m.addedNodes.forEach((n) => walk(n, toEnglish));
    }
  });
  observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: [...ATTRS] });
}

function stopTranslating() {
  observer?.disconnect();
  walk(document.body, toArabic);
}

// ---------- React ----------

const LangContext = createContext<{ lang: Lang; setLang: (l: Lang) => void }>({ lang: "ar", setLang: () => {} });
export const useLang = () => useContext(LangContext);

const TITLE_AR = "جودة أكاديمية ذكية — جامعة الباحة";

export function LangProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLang] = useState<Lang>("ar");

  useEffect(() => {
    try { if (window.localStorage.getItem(LANG_KEY) === "en") setLang("en"); } catch { /* blocked storage: stay Arabic */ }
  }, []);

  useEffect(() => {
    setCurrentLang(lang);
    const html = document.documentElement;
    html.lang = lang;
    html.dir = lang === "en" ? "ltr" : "rtl";
    document.title = lang === "en" ? translate(TITLE_AR) : TITLE_AR;
    try { window.localStorage.setItem(LANG_KEY, lang); } catch { /* blocked storage */ }
    if (lang === "en") startTranslating(); else if (observer) stopTranslating();
  }, [lang]);

  return <LangContext.Provider value={{ lang, setLang }}>{children}</LangContext.Provider>;
}

export function LangToggle({ className = "" }: { className?: string }) {
  const { lang, setLang } = useLang();
  return (
    <button translate="no" className={`rounded-full border border-line px-3 py-1 text-xs font-semibold text-ink-soft hover:bg-canvas ${className}`}
      onClick={() => setLang(lang === "ar" ? "en" : "ar")} aria-label={lang === "ar" ? "Switch to English" : "التبديل إلى العربية"}>
      {lang === "ar" ? "English" : "العربية"}
    </button>
  );
}
